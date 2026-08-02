# Minimal Admin Dashboard

## Local preview

From `prototype/`, start a static server and open `/admin/dashboard/`.

The production API currently allows the `https://kjoe.top` origin. A local preview can therefore show the designed retry state even when the API itself is healthy.

## Data

The page reads `https://api.kjoe.top/api/public/works`, the same published data source preferred by the public frontend. Expected counts are TVC 30, Livestream 8, total 38.

## Authentication

Local preview does not simulate authentication. Production access will use a new Cloudflare Access application scoped to `/admin/dashboard*`, with Cloudflare 账号授权 and an allow policy for the confirmed account. Existing `/admin*` email-OTP protection remains unchanged.

## Release boundary

This local milestone does not push GitHub, publish GitHub Pages, or change Cloudflare Access. Perform those steps only after an explicit publish instruction.
