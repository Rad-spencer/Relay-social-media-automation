# Upload to GitHub and connect Supabase

## Status of this package

The Supabase project **Relay-social media automation** (`qulsbmoevbshodqbxwmy`)
was initialized on 2026-10-03 through the connected Supabase management account.
Project URL: https://qulsbmoevbshodqbxwmy.supabase.co

The private `relay` schema and all 16 application tables are created. RLS is enabled;
`anon` and `authenticated` have no schema access. Schema migration markers 1–4
were verified. The security advisor reports only the expected informational
[RLS enabled with no policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
findings: this backend-only design intentionally denies browser database access.

**The running application is not switched to Supabase yet.** Its server still needs
DATABASE_URL from this project's Connect dialog and a successful `db:check`.
The HTTPS project URL is an API address, not a PostgreSQL login string.
Existing local accounts, posts and media have not been copied to Supabase.

## 1. Upload the source to GitHub

Extract `relay-github-ready.zip`. Create an empty GitHub repository (private is a
sensible default). Upload the CONTENTS of the extracted `relay-github-ready` folder
to the repository root, including `.github`, `.gitignore` and `.dockerignore`.
Do not upload the zip itself as the website. The package contains source, tests,
Dockerfile, lockfile and documentation. It intentionally excludes `.env`, secrets,
local databases, uploaded media, node_modules and build output.

The GitHub check workflow runs lint, TypeScript, tests and a frontend build.
GitHub Pages cannot run this app's Express server or scheduled publishing worker.

## 2. Get your Supabase database connection

Open the intended Supabase project → **Connect** → **Session pooler**. Copy the
PostgreSQL connection string on port 5432. Replace the password placeholder with
your database password, percent-encoding special characters. Copy the hostname
and username exactly; do not guess them. A direct connection is also suitable if
your host supports the project's IP version. Do not use transaction port 6543.

This app uses Supabase PostgreSQL through its Node.js backend. It does not require
a publishable key, service-role key, supabase-js, or a rewrite to Supabase Auth.
Existing Relay login, sessions and workspace permissions remain in place.

Enter secrets in your host's environment settings, never in GitHub source:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
APP_URL=https://YOUR-ACTUAL-SUBDOMAIN
DATABASE_URL=PASTE-THE-POSTGRESQL-SESSION-CONNECTION-STRING
DATABASE_SCHEMA=relay
ALLOW_DEMO=false
OAUTH_ENCRYPTION_KEY=COPY-YOUR-EXISTING-64-HEX-CHARACTER-KEY
```

Use the host's supplied PORT if it sets one. The local encryption key is in your
computer's private `.env`; copy it securely to your host, not into this repository.
TLS certificate verification is enabled for remote databases. If your database
uses a private CA, copy the trusted Supabase CA PEM to the secret variable
`DATABASE_SSL_CA` (literal newlines or escaped `\n`). Do not disable verification.

## 3. Initialize and verify

In the hosting console, or locally after configuring a private `.env`:

```sh
npm ci --include=dev
npm run db:check
npm run db:setup
npm run build
npm start
```

`db:check` performs read-only connectivity/schema checks. `db:setup` creates the
private `relay` schema and applies the bundled idempotent schema SQL in a
transaction. Server startup also initializes the schema. The database login must
be able to create/own that schema and its tables; use the project connection from
Supabase's Connect dialog for initial setup. Use the same schema-owning server role
for this MVP. Browser clients never receive this privileged connection string.

Relay tables have RLS enabled with no browser policies. The owner executes server
queries; Relay enforces tenant access at the API layer. Supabase `anon` and
`authenticated` roles cannot use this schema. Do not expose `relay` in the Data API
settings or add broad policies. Supabase Auth/Storage schemas are not modified.

Existing externally hosted installations that used `public` require a separate
reviewed migration; changing DATABASE_SCHEMA does not move existing data. Local
PGlite data also needs a separate migration if you want to retain it online. Do not
copy `.data/postgres` into a Supabase project. Keep the local data as your backup.

## 4. Host the application

Connect the GitHub repository to hosting that supports an always-running Node.js
process or Docker container. Use one app instance initially. For Node hosting:

- Install: `npm ci --include=dev`
- Build: `npm run build`
- Start: `npm start`
- Health check: `/health`

For Docker hosting, use the included Dockerfile. Supply all secrets at runtime.
The container runs as a non-root user and excludes local `.env` and data.
An external HTTPS proxy/hosting ingress is required. Set up the custom domain
using the DNS target your host gives you; a database and subdomain alone do not
host the running application. Preserve event streams and allow uploads up to 25 MB.
Sleeping/scale-to-zero hosting cannot guarantee scheduled delivery times.

## 5. Connect social accounts

Once HTTPS and `/health` work, set APP_URL to the exact public origin, add the
provider client IDs/secrets in hosting settings, and register each exact callback
shown on Social accounts. Run `npm run social:check`, then connect the profile.
Supabase connectivity does not replace social-provider app registration or approval.
See SOCIAL_LOGIN.md and PUBLISHING.md for current feature limitations.

## Reference documentation

- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/guides/api/securing-your-api
- https://node-postgres.com/features/ssl
