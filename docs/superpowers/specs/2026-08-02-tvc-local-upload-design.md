# TVC Local Upload and Publish Design

**Status:** User-approved design for implementation planning  
**Target release:** V0.24  
**Current production baseline:** V0.23  
**Date:** 2026-08-02

## 1. Goal

Extend the independent `/admin/dashboard/` from a read-only works list into a stable TVC creation workflow. An authorized administrator can create a remote draft, choose a local 16:9 Poster and a prepared video, upload and preview the bound media, select the work's position, and explicitly publish it.

The new workflow must use the current `works` data in D1 and the current media bucket in R2. It must not create a second content source, modify the legacy `/admin/` frontend, or change the public portfolio's approved visual direction.

## 2. Confirmed Product Decisions

- Phase one supports TVC only; Livestream creation is deferred.
- Upload never publishes automatically.
- A work is created as a remote draft, previewed, then published only after an explicit confirmation.
- The administrator provides one local 16:9 Poster. The browser generates desktop and mobile WebP variants.
- Video input must already be MP4 or WebM and no larger than 1080p. The system validates but does not transcode it.
- Desktop supports file selection and upload. Mobile can inspect drafts, progress, failures, preview, and publish a complete draft, but cannot select a large video.
- Before publishing, the administrator chooses the insertion position in the current TVC list.
- A legitimate new publication increases the Dashboard counts dynamically; the V0.23 fixed 38-item warning is removed.

## 3. Architecture

### 3.1 Static Dashboard frontend

Keep `/admin/dashboard/` as the list and summary entry point. Add a dedicated creation page at:

```text
/admin/dashboard/tvc/new/
```

The new page is a separate static module with its own controller, form model, Poster processor, upload state, preview renderer, and tests. It must not import the legacy `admin/admin.js` or legacy page markup.

### 3.2 Independent same-origin Dashboard API

Add an independent Cloudflare Worker service for:

```text
kjoe.top/admin/dashboard/api/*
```

The route is covered by the existing Dashboard Cloudflare Access application and its Cloudflare identity provider. Requests are same-origin with the Dashboard, so the design does not rely on cross-origin cookies or management CORS.

The Worker has its own Access audience configuration and only accepts the confirmed administrator account. It binds the existing D1 database and R2 bucket; it does not create a second database or bucket.

The legacy surfaces remain unchanged:

```text
kjoe.top/admin*
api.kjoe.top/api/admin/*
```

### 3.3 Future expansion boundary

The new Worker is a permanent Dashboard API, not a disposable upload proxy. Its resource structure can later gain edit, restore, archive, delete, and Livestream operations. None of those endpoints or controls are implemented in V0.24.

Future deletion should begin as a recoverable soft-delete design. Physical D1 and R2 deletion requires a separate high-risk design and explicit authorization.

## 4. V0.24 API Surface

Expose only the operations required by the approved TVC workflow:

```text
GET    /admin/dashboard/api/session
GET    /admin/dashboard/api/tvc/order
POST   /admin/dashboard/api/works
GET    /admin/dashboard/api/works/:workId
PUT    /admin/dashboard/api/works/:workId
POST   /admin/dashboard/api/works/:workId/posters/:variant
PUT    /admin/dashboard/api/works/:workId/media
POST   /admin/dashboard/api/works/:workId/video/multipart
GET    /admin/dashboard/api/works/:workId/video/multipart/:uploadId
PUT    /admin/dashboard/api/works/:workId/video/multipart/:uploadId/parts/:partNumber
POST   /admin/dashboard/api/works/:workId/video/multipart/:uploadId/complete
DELETE /admin/dashboard/api/works/:workId/video/multipart/:uploadId
POST   /admin/dashboard/api/works/:workId/publish
```

`variant` accepts only `desktop` or `mobile`.

`POST /works` always creates `section: "tvc"` and `status: "draft"`. It accepts brand name, work title, work type, and no client-selected final ID.

`PUT /works/:workId` exists only for the active creation flow. It can update the TVC draft's brand name, work title, and work type with optimistic version checking. V0.24 does not expose a list action for reopening or editing arbitrary existing works.

Poster upload and multipart completion return a server-generated object key. `PUT /works/:workId/media` accepts only completed keys owned by that TVC draft, verifies them in R2, and binds one or more of `poster_key`, `poster_mobile_key`, and `video_key` with the current work version. Upload and binding are deliberately separate: if R2 succeeds but binding fails, the browser retries the same binding request instead of uploading another object.

`GET /tvc/order` returns the current published TVC IDs, display labels, and an `orderRevision` derived from the ordered ID list.

`POST /works/:workId/publish` accepts:

```json
{
  "version": 1,
  "insertBeforeId": "existing-work-id-or-null",
  "orderRevision": "server-issued-revision"
}
```

`insertBeforeId: null` means append to the end. The Worker rejects an obsolete `version`, missing insertion target, or changed `orderRevision` with `409 Conflict`.

## 5. Data and Publication Rules

The source of truth remains the existing `works`, `work_images`, `upload_sessions`, and `audit_log` tables.

A TVC draft is publishable only when all of the following are true:

- `brand_name`, `work_title`, and `work_type` are non-empty;
- the work is still `draft`;
- desktop Poster, mobile Poster, and video keys are bound to the same work;
- every bound R2 object exists and belongs to `portfolio/tvc/<workId>/`;
- the optimistic `version` matches;
- the submitted order revision still matches the current published TVC order.

After validation, the Worker uses one D1 batch to update the published TVC order, change the draft to `published`, increment its version, set `published_at`, and write the audit record. Only after that batch succeeds does it invalidate the public works cache. A failed validation must leave the work as a draft and must not partially reorder the public list.

The Dashboard count cards are calculated from returned data. They do not encode `38`, `30`, or `8` as permanent expected totals.

## 6. Poster Processing

Accepted source formats are JPEG, PNG, and WebP. The source must:

- be no larger than 20 MiB;
- be at least 1600 × 900 pixels;
- have a 16:9 ratio within a one-percent tolerance.

The browser decodes the image, center-fits it to an exact 16:9 canvas, and creates:

```text
desktop: 1600 × 900 WebP
mobile:   960 × 540 WebP
```

Each result is previewed locally, uploaded separately, verified by the Worker, and then bound through the media endpoint to the remote draft. The original local image is not uploaded as a third public asset.

If decoding, resizing, encoding, uploading, or binding one variant fails, the form and completed variant remain intact. Only the failed variant is retried.

## 7. Video Validation and Multipart Upload

Accepted video formats are MP4 and WebM. Before contacting the Worker, the browser reads metadata and rejects a video when:

- the MIME type and extension are unsupported;
- the file is empty or larger than 2 GiB;
- its dimensions exceed a 1920-pixel long edge and a 1080-pixel short edge;
- metadata cannot be read.

No client or server transcoding is included.

The multipart contract uses the existing operational limits:

```text
part size:        10 MiB
max concurrency: 3
max parts:        10,000
```

The browser records the upload ID, object key, acknowledged ETags, and a file fingerprint composed of name, size, type, and last-modified time. File bytes are never stored in localStorage.

After refresh, an incomplete upload enters `needs-reselect`. The administrator must choose the same file. A matching fingerprint allows the client to resume the saved multipart session; a mismatch is rejected without uploading.

Cancelling an active video calls the multipart abort endpoint. Completed and already bound media are not physically deleted in this phase.

## 8. User Experience

### 8.1 Dashboard entry

Add an `新增 TVC` button without changing the two existing read-only work tables. The button opens the dedicated creation page.

### 8.2 Creation page sequence

1. Enter brand, title, and type.
2. Save the remote draft and receive its server-generated ID.
3. Choose the 16:9 Poster and review both generated variants.
4. Choose the prepared video and start multipart upload.
5. Review textual progress for Poster and video independently.
6. Preview the real bound Poster and video from the media origin.
7. Choose an insertion point from the latest published TVC order.
8. Open a custom confirmation panel showing work details and the selected position.
9. Confirm publication.
10. Return to the Dashboard and highlight the newly published row.

The browser must never use `window.confirm`.

### 8.3 UI states

Work states exposed in this phase:

```text
draft
publishing (transient UI state)
published
```

File states:

```text
selected
validating
uploading
attached
complete
failed
needs-reselect
cancelled
```

There is no global cross-work queue, pause-all control, background-upload promise, archive filter, edit control, or delete control.

### 8.4 Mobile behavior

At 390 × 844, the creation page can display the remote draft, upload state, errors, preview, insertion position, and publish confirmation. Poster and video file inputs are hidden and replaced by a clear instruction to continue media selection on desktop.

A draft whose media is already complete can be previewed and published from mobile.

## 9. Persistence and Recovery

The remote D1 draft is authoritative after it is created. Local persistence stores only:

- draft work ID;
- unsaved text fields;
- upload state metadata;
- video file fingerprint;
- multipart upload ID, object key, and completed ETags;
- last selected insertion target and order revision.

Completed media and saved text are reloaded from the Worker. A failed Poster step, video part, media binding, preview request, or publish request never clears unrelated completed state.

Recovery behavior:

- offline: keep state and retry when connectivity returns;
- `401/403`: stop writes and require a fresh Dashboard login;
- `409`: reload the draft or current order and require reconfirmation;
- invalid media: block before upload with a field-specific message;
- expired multipart session: retain the draft and require a new video upload session;
- publish failure: keep the work as a draft.

## 10. Security

- Validate the Cloudflare Access JWT signature, issuer, audience, expiry, and confirmed administrator email on every Dashboard API request.
- Do not expose Access tokens, Cloudflare API tokens, R2 credentials, D1 credentials, or Worker secrets to the browser or repository.
- Enforce exact methods and routes; return `404` for future operations that are not implemented.
- Revalidate MIME, byte size, safe filenames, object-key ownership, upload-session actor, completed part sequence, R2 object existence, work status, work version, and order revision on the server.
- Never accept a client-supplied R2 URL or arbitrary object key.
- Record create, media-attach, multipart-complete, multipart-abort, and publish actions in the audit log without storing file bytes or credentials.

## 11. Explicitly Out of Scope

- Livestream creation or image ordering;
- editing an existing draft or published work beyond the active creation flow;
- unpublishing, restoring, archiving, deleting, or physically deleting media;
- external media URLs;
- automatic Poster extraction from video;
- image subject-aware cropping;
- video transcoding or compression;
- batch import or cross-work upload queues;
- multi-user roles, approvals, or permissions UI;
- guaranteed iOS or background video upload.

## 12. Testing and Acceptance

### 12.1 Automated tests

Frontend unit and contract tests cover:

- TVC draft validation;
- Poster ratio, dimensions, conversion outputs, and failure states;
- video MIME, byte-size, and dimension validation;
- file fingerprints and same-file reselection;
- multipart progress, retry, cancellation, and resumption state;
- preview rendering without HTML-string interpolation;
- insertion-point selection and order-revision conflicts;
- publish confirmation and non-automatic publication;
- dynamic Dashboard counts;
- mobile removal of media file inputs.

Worker tests cover:

- Dashboard Access audience and administrator allowlist;
- exact route and method restrictions;
- create-draft validation;
- Poster upload and object ownership;
- multipart create, part, resume, complete, expiry, and abort;
- publish completeness validation;
- atomic order and status batch behavior;
- `409` version and order conflicts;
- audit records and public-cache invalidation;
- regression of the legacy API and public works endpoint.

### 12.2 Browser acceptance

Verify at 1440px desktop, 1280px desktop, and 390 × 844 mobile:

- no horizontal overflow;
- visible keyboard focus and 44px mobile touch targets;
- draft text survives refresh;
- completed Poster variants survive refresh;
- incomplete video requests same-file reselection and resumes;
- failed file steps do not clear the form;
- preview uses the actual bound media;
- missing brand, title, type, Poster, or video blocks publication;
- the chosen insertion position is reflected in the public TVC order;
- a new publication increases counts without a fixed-total warning;
- the work appears in the public API and website only after confirmation;
- the legacy `/admin/`, legacy admin API, existing works, and public playback remain unchanged.

### 12.3 Production-write boundary

Automated and local Worker tests use fixtures and local D1/R2 substitutes. A real production upload or publication requires a separately stated target file, cleanup/rollback method, and explicit user authorization at execution time.

## 13. Release and Rollback

Implementation is released as V0.24 only after all approved tests pass. Update visible version text, changed-asset cache busting, README, Git history, and the deployment record together.

Do not push GitHub, deploy the new Worker route, alter Access, upload media, or publish a work until the user explicitly requests deployment.

Rollback disables the new Dashboard API route and restores the V0.23 Dashboard assets. The existing D1/R2 resources, public site, and legacy admin remain in place. Remote drafts and completed media are not physically deleted during rollback. A code rollback does not silently unpublish a work; content rollback is a separate explicit operation.
