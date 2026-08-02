import { sameFingerprint, validateVideoFile, videoFingerprint } from "./video-validation.js";

const RETRY_DELAYS = [250, 500, 1000];

function cancelledError() {
  return new Error("Video upload was cancelled");
}

function partCount(totalBytes, partSize) {
  return Math.ceil(totalBytes / partSize);
}

function sortedParts(parts) {
  const byNumber = new Map();
  for (const part of parts || []) {
    if (Number.isSafeInteger(part?.partNumber) && part.partNumber > 0 && typeof part.etag === "string" && part.etag) {
      byNumber.set(part.partNumber, { partNumber: part.partNumber, etag: part.etag });
    }
  }
  return [...byNumber.values()].sort((left, right) => left.partNumber - right.partNumber);
}

function retryable(error) {
  const status = Number(error?.status);
  return error?.code === "NETWORK_ERROR" || error instanceof TypeError || status === 0 || status === 408 || status === 429 || status >= 500;
}

function copySession(session) {
  return { ...session, parts: sortedParts(session.parts) };
}

export function createMultipartUploader({
  api,
  partSize = 10 * 1024 ** 2,
  concurrency = 3,
  persist = () => {},
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  random = Math.random,
} = {}) {
  if (!api) throw new TypeError("A Dashboard API client is required");
  if (!Number.isSafeInteger(partSize) || partSize <= 0) throw new TypeError("partSize must be a positive integer");
  if (!Number.isSafeInteger(concurrency) || concurrency <= 0 || concurrency > 3) throw new TypeError("concurrency must be between 1 and 3");

  const active = new Map();

  async function abortRemote(task) {
    if (!task.session || task.remoteAborted) return;
    task.remoteAborted = true;
    await api.abortVideoMultipart(task.workId, task.session.uploadId);
  }

  async function uploadPart(task, file, session, partNumber) {
    const offset = (partNumber - 1) * partSize;
    const bytes = file.slice(offset, Math.min(offset + partSize, file.size));
    for (let retry = 0; ; retry += 1) {
      if (task.cancelled) throw cancelledError();
      try {
        const result = await api.uploadVideoPart(task.workId, session.uploadId, partNumber, bytes, task.controller.signal);
        if (result?.partNumber !== partNumber || typeof result.etag !== "string" || !result.etag) {
          throw new Error("Worker returned an invalid multipart part acknowledgement");
        }
        return result;
      } catch (error) {
        if (task.cancelled || error?.name === "AbortError") throw cancelledError();
        if (retry >= RETRY_DELAYS.length || !retryable(error)) throw error;
        const jitter = Math.floor(Math.max(0, Math.min(1, random())) * 250);
        await sleep(RETRY_DELAYS[retry] + jitter);
      }
    }
  }

  async function run(file, suppliedSession, { workId, metadata } = {}) {
    const taskWorkId = suppliedSession?.workId || workId;
    if (typeof taskWorkId !== "string" || !taskWorkId) throw new TypeError("workId is required");
    validateVideoFile(file, metadata);
    if (active.has(taskWorkId)) throw new Error("A video upload is already active for this draft");

    const task = { workId: taskWorkId, controller: new AbortController(), cancelled: false, session: null, remoteAborted: false };
    active.set(taskWorkId, task);
    try {
      let session;
      if (suppliedSession) {
        if (!sameFingerprint(videoFingerprint(file), suppliedSession.fingerprint)) throw new Error("Please reselect the same file before resuming its upload");
        const server = await api.getVideoMultipart(taskWorkId, suppliedSession.uploadId, task.controller.signal);
        session = copySession({ ...suppliedSession, ...server, workId: taskWorkId });
      } else {
        const created = await api.createVideoMultipart(taskWorkId, file, task.controller.signal);
        session = copySession({
          workId: taskWorkId,
          uploadId: created.uploadId,
          key: created.key,
          totalBytes: created.totalBytes ?? file.size,
          partSize: created.partSize,
          fingerprint: videoFingerprint(file),
          parts: [],
        });
      }
      task.session = session;
      if (task.cancelled) {
        await abortRemote(task);
        throw cancelledError();
      }
      if (session.partSize !== partSize) throw new Error("Worker multipart part size does not match the local slicing contract");
      if (session.totalBytes !== file.size) throw new Error("The selected file does not match this upload session");
      const count = partCount(file.size, partSize);
      if (count > 10_000) throw new RangeError("Video exceeds the 10000-part upload limit");

      const acknowledged = new Map(sortedParts(session.parts).map((part) => [part.partNumber, part]));
      for (const partNumber of acknowledged.keys()) {
        if (partNumber > count) throw new Error("Saved multipart state has an invalid part number");
      }
      session.parts = sortedParts([...acknowledged.values()]);
      persist(copySession(session));

      const pending = Array.from({ length: count }, (_value, index) => index + 1).filter((partNumber) => !acknowledged.has(partNumber));
      let next = 0;
      const worker = async () => {
        while (!task.cancelled) {
          const partNumber = pending[next++];
          if (!partNumber) return;
          const result = await uploadPart(task, file, session, partNumber);
          acknowledged.set(partNumber, { partNumber: result.partNumber, etag: result.etag });
          session.parts = sortedParts([...acknowledged.values()]);
          persist(copySession(session));
        }
        throw cancelledError();
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker));
      if (task.cancelled) throw cancelledError();
      session.parts = sortedParts([...acknowledged.values()]);
      const completed = await api.completeVideoMultipart(taskWorkId, session.uploadId, session.parts, task.controller.signal);
      return { ...copySession(session), completed };
    } catch (error) {
      if (task.cancelled && error?.message !== cancelledError().message) throw cancelledError();
      throw error;
    } finally {
      if (active.get(taskWorkId) === task) active.delete(taskWorkId);
    }
  }

  return {
    start(file, options) {
      return run(file, null, options);
    },
    resume(file, session, options) {
      return run(file, session, options);
    },
    async cancel(workId) {
      const task = active.get(typeof workId === "string" ? workId : workId?.workId);
      if (!task) return false;
      task.cancelled = true;
      task.controller.abort();
      try {
        await abortRemote(task);
      } catch {
        // Local cancellation must not wait for an unavailable Worker abort route.
      }
      return true;
    },
  };
}
