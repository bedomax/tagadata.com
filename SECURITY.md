# Security

## Overview

tagadata.com is a public, read-only news aggregator. There is no user authentication — all content is public. This document describes the security measures in place and known considerations.

---

## Protections in Place

### Security Headers — `helmet`
All HTTP responses include security headers via [helmet](https://helmetjs.github.io/):
- `Content-Security-Policy`
- `X-Frame-Options: SAMEORIGIN` (clickjacking protection)
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security` (HSTS)
- Removes `X-Powered-By` header

### Rate Limiting
API endpoints `/api/news` and `/api/geo` are limited to **60 requests per minute per IP** using `express-rate-limit`. Exceeding this limit returns HTTP 429.

The server sets `trust proxy: 1` so Express uses the real IP from the single trusted proxy hop (Cloud Run). The rate limiter uses `req.ip` — not the raw `X-Forwarded-For` header — which prevents attackers from spoofing their IP by injecting a fake `X-Forwarded-For` value to bypass the limit.

### Input Validation (`src/validate.js`)
All query parameters for `GET /api/news` are parsed through `parseNewsParams()` before any DB access:

| Parameter | Validation | Limit |
|-----------|-----------|-------|
| `country` | Whitelist (`cl`, `ec`, `ma`) | — |
| `sort` | Whitelist (`score`, `date`) | — |
| `limit` | Integer, clamped | 1–100 |
| `offset` | Integer, clamped | 0–10 000 |
| `tag` | Regex — only letters, digits, spaces, hyphens, accented chars | 50 chars |
| `source` | Same regex as tag | 100 chars |

Invalid `tag` or `source` strings return **HTTP 400** immediately, before any DB query is made. This prevents:
- **DoS via expensive tag lookups** with crafted long strings
- **SQL metacharacter injection** through string parameters
- **Giant offset attacks** that force full table scans

- Client-side XSS protection via `esc()` helper for all user-visible content

### Database
- Parameterized queries via the `pg` library — SQL injection not possible
- PostgreSQL connection requires SSL (`sslmode=require`)
- Connection pooling with max 10 connections
- Rolling 48-hour article window (no PII stored)

### Secrets Management
- Database credentials are injected at runtime via Cloud Run `--set-secrets`
- No credentials should exist in the repository or git history
- `.env.production` is in `.gitignore`

### Deployment
- HTTPS enforced by Google Cloud Run
- GitHub Actions uses Workload Identity Federation (no stored service account keys)

---

## Known Limitations

| Area | Status | Notes |
|------|--------|-------|
| Authentication | None | Intentional — app is fully public |
| RSS feed validation | None | URLs from feeds are not validated; relies on source trustworthiness |
| IP geolocation | External (ip-api.com) | Free tier: 45 req/min. Fails silently to default country `cl` |
| Request audit log | None | No per-request logging beyond errors |
| Distributed DoS | Partial | Single-server rate limit; no CDN/WAF layer |

---

## Reporting a Vulnerability

If you discover a security issue, please open a private GitHub issue or contact the maintainer directly before public disclosure.

---

## Rotating Database Credentials

If credentials are ever compromised:

1. Go to the [Neon dashboard](https://console.neon.tech) and reset the database password
2. Update the secret in Google Cloud:
   ```bash
   echo -n "postgresql://user:NEWPASS@host/db?sslmode=require" | \
     gcloud secrets versions add DATABASE_URL --data-file=-
   ```
3. Redeploy the Cloud Run service
4. If credentials were committed to git, remove them from history:
   ```bash
   git filter-branch --force --index-filter \
     'git rm --cached --ignore-unmatch .env.production' \
     --prune-empty --tag-name-filter cat -- --all
   git push origin --force --all
   ```
