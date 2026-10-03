# Relay: GitHub upload package

1. Upload this folder's contents to the root of a GitHub repository, including the hidden `.github` folder, `.gitignore` and `.dockerignore` files.
2. Follow [the Supabase and hosting guide](docs/GITHUB_SUPABASE.md).
3. Supply your Supabase PostgreSQL connection string securely in hosting environment settings.
4. Run `npm run db:check` and `npm run db:setup`, then build and start the app.

**Supabase schema initialized:** project `qulsbmoevbshodqbxwmy` (Relay-social media automation) has Relay's 16 protected tables. **The app connection is still pending:** supply its PostgreSQL Session pooler connection string in DATABASE_URL and run `npm run db:check`. Existing local accounts/posts have not been migrated.

This is a Node.js application, not a GitHub Pages/static site. Your hosting must run its backend continuously for scheduled publishing. The Dockerfile is provided for compatible hosts; it was not built locally because Docker is unavailable here.

This package excludes passwords, private `.env`, uploaded media, local workspace data and installed dependencies. Install dependencies with `npm ci`. Existing local accounts/posts have not been migrated.

Social OAuth app credentials and provider approval are separate from Supabase. See [social login setup](docs/SOCIAL_LOGIN.md) and [publishing limits](docs/PUBLISHING.md).
