export const PART_SIZE = 10 * 1024 * 1024;
export const MAX_CONCURRENCY = 3;
const RESUME_PREFIX = "portfolio-admin:video-upload:";

function sessionParts(etags) {
  return Object.entries(etags)
    .map(([partNumber, etag]) => ({ partNumber: Number(partNumber), etag }))
    .sort((left, right) => left.partNumber - right.partNumber);
}

function cancelled() {
  return new Error("Upload aborted");
}

export class UploadManager {
  constructor(api, { storage = globalThis.localStorage, retries = 2, partSize = PART_SIZE, concurrency = MAX_CONCURRENCY } = {}) {
    this.api = api;
    this.storage = storage;
    this.retries = retries;
    this.partSize = partSize;
    this.concurrency = concurrency;
    this.active = new Map();
  }

  resumeKey(file, { section, workId }) {
    return `${RESUME_PREFIX}${section}:${workId}:${file.name}:${file.size}:${file.lastModified || 0}`;
  }

  read(key) {
    try { return JSON.parse(this.storage.getItem(key) || "null"); } catch { return null; }
  }

  save(key, value) {
    this.storage.setItem(key, JSON.stringify(value));
  }

  async uploadVideo(file, context, onProgress = () => {}) {
    if (!file || !["video/mp4", "video/webm"].includes(file.type)) throw new Error("视频必须是 MP4 或 WebM 文件。");
    if (!file.size) throw new Error("视频文件不能为空。");
    const key = this.resumeKey(file, context);
    let session = this.read(key);
    if (!session || session.totalBytes !== file.size) {
      const created = await this.api.createMultipartUpload({ section: context.section, workId: context.workId, fileName: file.name, contentType: file.type, totalBytes: file.size });
      session = { uploadId: created.uploadId, objectKey: created.key, totalBytes: file.size, etags: {} };
      this.save(key, session);
    }
    const task = { session, aborted: false };
    this.active.set(key, task);
    const totalParts = Math.ceil(file.size / this.partSize);
    const sizes = Array.from({ length: totalParts }, (_, index) => Math.min(this.partSize, file.size - index * this.partSize));
    const doneBytes = () => sessionParts(session.etags).reduce((total, part) => total + sizes[part.partNumber - 1], 0);
    const report = (state) => onProgress({ loaded: doneBytes(), total: file.size, state, uploadId: session.uploadId });
    report("uploading");
    const pending = Array.from({ length: totalParts }, (_, index) => index + 1).filter((partNumber) => !session.etags[partNumber]);
    let next = 0;

    const uploadPart = async () => {
      while (!task.aborted) {
        const partNumber = pending[next++];
        if (!partNumber) return;
        const bytes = file.slice((partNumber - 1) * this.partSize, Math.min(partNumber * this.partSize, file.size));
        let attempt = 0;
        while (true) {
          if (task.aborted) throw cancelled();
          try {
            const result = await this.api.uploadPart(session.uploadId, session.objectKey, partNumber, bytes);
            if (task.aborted) throw cancelled();
            session.etags[partNumber] = result.etag;
            this.save(key, session);
            report("uploading");
            break;
          } catch (error) {
            if (task.aborted) throw cancelled();
            attempt += 1;
            if (attempt > this.retries) throw error;
          }
        }
      }
      throw cancelled();
    };

    try {
      await Promise.all(Array.from({ length: Math.min(this.concurrency, pending.length) }, uploadPart));
      if (task.aborted) throw cancelled();
      const result = await this.api.completeMultipartUpload(session.uploadId, session.objectKey, sessionParts(session.etags));
      this.storage.removeItem(key);
      report("complete");
      return result;
    } catch (error) {
      report(task.aborted ? "cancelled" : "failed");
      throw error;
    } finally {
      this.active.delete(key);
    }
  }

  async abort(file, context) {
    const key = this.resumeKey(file, context);
    const task = this.active.get(key);
    const session = task?.session || this.read(key);
    if (!session) return;
    if (task) task.aborted = true;
    this.storage.removeItem(key);
    await this.api.abortMultipartUpload(session.uploadId, session.objectKey);
  }
}
