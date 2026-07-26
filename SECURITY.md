# Security notes for public clones

## Never commit secrets

- Copy `.env.example` or `.env.docker.example` → **`.env`** (gitignored).
- Set `SESSION_SECRET`, `SEED_ADMIN_PASSWORD`, `SUPER_ADMIN_USERNAMES` only in private `.env`.
- Example env files must stay placeholder-only (empty secret fields).

## Rotate if history ever leaked a password

If a password or secret appeared in git history or a chat log:

1. Change it in production (CMS **Authors** or re-hash / `SEED_RESET_OCTOPUS_PASSWORD` once).
2. Generate a new `SESSION_SECRET` and restart (invalidates sessions).
3. Optionally rewrite history (`git filter-repo`) before the first public push if secrets were committed.

## Production checklist

- Strong `SESSION_SECRET` (≥24 random chars; weak defaults are refused in production).
- Strong author passwords (not seed placeholders).
- `APP_URL` matches the public `https://` origin when using TLS.
- CMS path `/mantri` is unlisted; still requires authentication.
- Backups (`data/`, uploads volumes) stay private.

## Reporting

If you find a security issue in this project, contact the maintainers privately rather than opening a public issue with exploit details.
