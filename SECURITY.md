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

### Input Validation
- `country` parameter is validated against a whitelist (`cl`, `ec`, `ma`)
- `sort` parameter only accepts `score`, `date`, or `video`
- `limit` parameter is capped at 100 to prevent DB overload
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
