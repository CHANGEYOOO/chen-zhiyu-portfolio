# Cloudflare content import report

Generated timestamp: 2026-08-01T18:14:23Z

The seed files are generated from the current portfolio source. They reference existing R2 objects only; the generator does not upload, move, or delete objects.

## Sources

- `index.html` — 30 TVC cards, in their displayed order, including visible text and existing `media.kjoe.top/media-v0.21` poster/video paths.
- `assets/data/livestream-projects.json` — 8 Livestream projects, titles, categories, and authoritative image order.
- `assets/data/livestream-image-dimensions.json` — dimensions required by the D1 `work_images` rows.

## Generated output

- `cloudflare-portfolio-api/seed/works.json`
- `cloudflare-portfolio-api/seed/import.sql`

Counts: TVC=30, Livestream=8, Livestream images=55. The current authoritative JSON has 55 images.

## Validation

- Duplicate work ids: 0
- Duplicate image ids: 0
- Invalid media hosts: 0
- Invalid media keys: 0
- Non-contiguous work/image ordering: 0
- Livestream cover mismatches: 0

`import.sql` uses stable ids and `INSERT ... ON CONFLICT(id) DO UPDATE` for both works and images, making the import repeatable. Livestream D1 poster/video fields remain `NULL` as required by the schema; each manifest `cover_key` is the first ordered image key.
