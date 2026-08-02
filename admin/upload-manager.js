export const PART_SIZE = 10 * 1024 * 1024;
export const MAX_CONCURRENCY = 3;
const RESUME_PREFIX = "portfolio-admin:video-upload:";
const RECOVERY_PREFIX = "portfolio-admin:video-recovery:";

function sessionParts(etags) {
  return Object.entries(etags)
    .map(([partNumber, etag]) => ({ partNumber: Number(partNumber), etag }))
    .sort((left, right) => left.partNumber - right.partNumber);
}

function cancelled() {
  return new Error("Upload aborted");
}

function paused() {
  return new Error("上传已暂停（paused）。");
}

export class UploadManager {
  constructor(api, { storage = globalThis.localStorage, retries = 2, partSize = PART_SIZE, concurrency = MAX_CONCURRENCY } = {}) {
    this.api = api;
    this.storage = storage;
    this.retries = retries;
    this.partSize = partSize;
    this.concurrency = concurrency;
    this.active = new Map();
    this.online = true;
  }

  resumeKey(file, { section, workId }) {
    return `${RESUME_PREFIX}${section}:${workId}:${file.name}:${file.size}:${file.lastModified || 0}`;
  }

  recoveryKey({ section, workId }) {
    return `${RECOVERY_PREFIX}${section}:${workId}`;
  }

  read(key) {
    try { return JSON.parse(this.storage.getItem(key) || "null"); } catch { return null; }
  }

  save(key, value) {
    this.storage.setItem(key, JSON.stringify(value));
  }

  setOnline(online) {
    this.online = online;
  }

  saveRecovery(context, file, session) {
    this.save(this.recoveryKey(context), {
      workId: context.workId,
      section: context.section,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified || 0,
      type: file.type,
      uploadId: session.uploadId,
      objectKey: session.objectKey,
      parts: sessionParts(session.etags),
    });
  }

  listRecoverable() {
    const records = [];
    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index);
      if (!key || !key.startsWith(RECOVERY_PREFIX)) continue;
      const record = this.read(key);
      if (record) records.push(record);
    }
    return records.sort((left, right) => `${left.section}:${left.workId}`.localeCompare(`${right.section}:${right.workId}`));
  }

  async pause(file, context) {
    const task = this.active.get(this.resumeKey(file, context));
    if (!task) return false;
    task.paused = true;
    task.controller.abort();
    return true;
  }

  async resume(file, context, onProgress = () => {}) {
    const recovery = this.read(this.recoveryKey(context));
    const matches = recovery
      && recovery.name === file.name
      && recovery.size === file.size
      && recovery.lastModified === (file.lastModified || 0)
      && recovery.type === file.type;
    if (!matches) {
      if (recovery) this.storage.removeItem(`${RESUME_PREFIX}${recovery.section}:${recovery.workId}:${recovery.name}:${recovery.size}:${recovery.lastModified}`);
      this.storage.removeItem(this.recoveryKey(context));
    }
    return this.uploadVideo(file, context, onProgress);
  }

  async uploadVideo(file, context, onProgress = () => {}) {
    if (!file || !["video/mp4", "video/webm"].includes(file.type)) throw new Error("视频必须是 MP4 或 WebM 文件。");
    if (!file.size) throw new Error("视频文件不能为空。");
    if (!this.online) {
      onProgress({ loaded: 0, total: file.size, state: "waiting-network" });
      throw new Error("等待网络恢复后继续上传（waiting for network）。");
    }
    const key = this.resumeKey(file, context);
    let session = this.read(key);
    const task = { session, aborted: false, paused: false, controller: new AbortController() };
    this.active.set(key, task);
    let report;
    try {
      if (!session || session.totalBytes !== file.size) {
        const created = await this.api.createMultipartUpload({ section: context.section, workId: context.workId, fileName: file.name, contentType: file.type, totalBytes: file.size }, task.controller.signal);
        if (task.aborted) {
          try { await this.api.abortMultipartUpload(created.uploadId, created.key); } catch { /* Cancellation is already reflected locally. */ }
          throw cancelled();
        }
        session = { uploadId: created.uploadId, objectKey: created.key, totalBytes: file.size, etags: {} };
        task.session = session;
        this.save(key, session);
        this.saveRecovery(context, file, session);
        if (task.paused) throw paused();
      } else {
        this.saveRecovery(context, file, session);
      }
      if (task.aborted) throw cancelled();
      if (task.paused) throw paused();
      const totalParts = Math.ceil(file.size / this.partSize);
      const sizes = Array.from({ length: totalParts }, (_, index) => Math.min(this.partSize, file.size - index * this.partSize));
      const doneBytes = () => sessionParts(session.etags).reduce((total, part) => total + sizes[part.partNumber - 1], 0);
      report = (state) => onProgress({ loaded: doneBytes(), total: file.size, state, uploadId: session.uploadId });
      report("uploading");
      const pending = Array.from({ length: totalParts }, (_, index) => index + 1).filter((partNumber) => !session.etags[partNumber]);
      let next = 0;

      const uploadPart = async () => {
        while (!task.aborted && !task.paused) {
          const partNumber = pending[next++];
          if (!partNumber) return;
          const bytes = file.slice((partNumber - 1) * this.partSize, Math.min(partNumber * this.partSize, file.size));
          let attempt = 0;
          while (true) {
            if (task.aborted) throw cancelled();
            if (task.paused) throw paused();
            try {
              const result = await this.api.uploadPart(session.uploadId, session.objectKey, partNumber, bytes, task.controller.signal);
              if (task.aborted) throw cancelled();
              if (task.paused) throw paused();
              session.etags[partNumber] = result.etag;
              this.save(key, session);
              this.saveRecovery(context, file, session);
              report("uploading");
              break;
            } catch (error) {
              if (task.aborted) throw cancelled();
              if (task.paused) throw paused();
              attempt += 1;
              if (attempt > this.retries) throw error;
            }
          }
        }
        throw cancelled();
      };
      await Promise.all(Array.from({ length: Math.min(this.concurrency, pending.length) }, uploadPart));
      if (task.aborted) throw cancelled();
      if (task.paused) throw paused();
      const result = await this.api.completeMultipartUpload(session.uploadId, session.objectKey, sessionParts(session.etags), task.controller.signal);
      this.storage.removeItem(key);
      this.storage.removeItem(this.recoveryKey(context));
      report("complete");
      return result;
    } catch (error) {
      const state = task.aborted ? "cancelled" : task.paused ? "paused" : "failed";
      if (report) report(state);
      else onProgress({ loaded: 0, total: file.size, state, uploadId: session?.uploadId });
      throw task.aborted ? cancelled() : task.paused ? paused() : error;
    } finally {
      this.active.delete(key);
    }
  }

  async abort(file, context) {
    const key = this.resumeKey(file, context);
    const task = this.active.get(key);
    const session = task?.session || this.read(key);
    if (task) {
      task.aborted = true;
      task.controller.abort();
    }
    this.storage.removeItem(key);
    this.storage.removeItem(this.recoveryKey(context));
    if (!session) return true;
    try {
      await this.api.abortMultipartUpload(session.uploadId, session.objectKey);
      return true;
    } catch {
      return false;
    }
  }
}
