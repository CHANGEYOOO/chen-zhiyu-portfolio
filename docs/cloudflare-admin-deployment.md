# Cloudflare portfolio admin deployment

Deployment record: 2026-08-02

## Provisioned resources

- Worker: `kjoe-portfolio-api` (configuration validated; not deployed to production in this record).
- D1: `kjoe-portfolio-content` (`42b6c0fa-8994-4dfc-97eb-c3449e559bb8`), created in APAC.
- R2 binding: `MEDIA` -> existing `kjoe-portfolio-media` bucket.
- D1 binding: `DB` -> `kjoe-portfolio-content`.
- Production route configured in `cloudflare-portfolio-api/wrangler.toml`: `api.kjoe.top/*`.

## Database state

Applied remotely, in order:

1. `migrations/0001_portfolio.sql`
2. `migrations/0002_upload_sessions.sql`
3. `migrations/0003_media_variants.sql`

The validated manifest was imported successfully. Wrangler/D1 rejects the source file's `BEGIN` / `COMMIT` wrapper, so the same 93 unmodified upsert statements were executed without comments or that wrapper.

Verified remote counts:

- TVC: 30
- Livestream: 8
- Livestream images: 55

## Access and deployment status

Cloudflare Access must protect both self-hosted applications before a production deployment is considered complete:

- `https://kjoe.top/admin*`
- `https://api.kjoe.top/api/admin/*`

Each application must use email OTP and an Allow policy limited to the confirmed administrator email. Set the API application's Access audience and the administrator allowlist as Worker secrets/variables; never add those values to tracked files or browser configuration.

This record does not contain an Access application ID, audience, issuer, JWKS URL, or administrator email. At the time of provisioning, the authenticated Zero Trust dashboard returned `找不到该页面` for all Access controls URLs, and a later continuation had no available browser session. The two applications, policies, and Worker Access secrets therefore remain pending. A user later gave exact approval to deploy the Worker, but the execution safety gate still rejected the `wrangler deploy` command because that approval was not available to it as a trusted direct user message.

Consequently, no public route, protected admin endpoint, image upload, multipart upload, media Range read, or archive-draft verification has been run against production. The existing static release and all R2 physical objects remain unchanged.

## Required completion sequence

1. Restore Access controls access in the Cloudflare Zero Trust dashboard.
2. Create the two applications and email-OTP Allow policies described above.
3. Set `ACCESS_AUD`, `ADMIN_EMAILS`, and the applicable Access issuer/JWKS configuration with `wrangler secret put`; keep values out of the repository.
4. Provide a direct user approval in the execution thread to publish `kjoe-portfolio-api` to `api.kjoe.top/*`, then run `wrangler deploy` from `cloudflare-portfolio-api`.
5. Verify `/api/public/works`, protected `/api/admin/session`, disposable image and multipart-video uploads, a Range request through `media.kjoe.top`, and archive the disposable draft only. Do not delete physical test objects without separate approval.

## Rollback

After a deployment, list available Worker versions in the Cloudflare dashboard, select the previously healthy version ID, then run:

```bash
wrangler rollback <previous-version-id> --name kjoe-portfolio-api --message "Restore previous portfolio API"
```

The D1 import is idempotent and does not delete source media. Do not delete the D1 database, the R2 bucket, Supabase resources, or test objects as part of rollback.
