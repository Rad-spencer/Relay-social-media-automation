# HTTP API

All `/api` routes except auth registration/login/demo require a session. Authenticated writes require `X-CSRF-Token` returned by `/api/session`. Origin checks cover all browser writes. JSON errors include `error`, `code`, `requestId`.

| Method and path                      | Behavior                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------ |
| POST /api/auth/register              | Create user + isolated workspace; password ≥12 chars                     |
| POST /api/auth/login                 | Password sign-in                                                         |
| POST /api/auth/demo                  | Create isolated seeded simulation                                        |
| GET /api/session                     | Identity, tenant, role and CSRF token                                    |
| POST /api/auth/logout                | Revoke current session                                                   |
| GET /api/dashboard                   | Bounded resources/rules/FAQs, aggregate metrics, activity, notifications |
| GET /api/conversations               | search, filter, cursor; 30 items                                         |
| GET /api/conversations/:id           | Contact and 50 messages; before cursor                                   |
| PATCH /api/conversations/:id         | handling, unread, status, pinned, assignedTo                             |
| POST /api/conversations/:id/messages | text + optional note; simulated delivery or private note                 |
| GET /api/contacts                    | search, cursor; 50 items                                                 |
| PATCH /api/contacts/:id              | status, tags, notes, optedOut                                            |
| POST /api/resources                  | Create an approved HTTPS resource                                        |
| PUT /api/resources/:id               | Edit/archive resource, tracking switch                                   |
| POST /api/rules                      | Create draft                                                             |
| PUT /api/rules/:id                   | Versioned edit/status update                                             |
| POST /api/rules/:id/test             | Pure keyword preview; no writes or sends                                 |
| POST /api/faqs                       | Add approved response                                                    |
| PUT /api/faqs/:id                    | Edit/disable approved response                                           |
| PUT /api/profile                     | Manually maintained business fields and mode                             |
| POST /api/simulate                   | Queue a demo normalized event                                            |
| GET /api/integrations                | Simulated capabilities, docs, job status counts                          |
| POST /api/notifications/:id/read     | Mark alert read                                                          |
| GET /api/export/contacts             | Owner/admin CSV, streamed complete export                                |
| GET /api/events                      | Authenticated SSE refresh signal                                         |
| GET /r/:id                           | Public tracked delivery redirect                                         |
| GET /health                          | Database liveness                                                        |

Mutations are workspace-scoped. See `src/server/validation.ts` for exact payload schemas. Social login and connection routes are documented below.

## Social authentication

- `GET /api/auth/providers`: public provider availability and registered callback URLs; no secrets.
- `POST /api/auth/social/:provider/start`: same-origin anonymous sign-in start; returns provider authorization URL and sets a browser-binding cookie.
- `GET /api/auth/social/:provider/callback`: one-use callback; redirects to a fixed Relay path with a safe result code.
- `POST /api/social/:provider/connect`: authenticated, CSRF-protected owner/admin connection start in a non-demo workspace.
- `GET /api/social/connections`: workspace connection metadata, provider availability and current user's connection permission.
- `DELETE /api/social/connections/:id`: owner/admin, CSRF; removes workspace tokens, preserving the separate sign-in identity.

Providers: `google`, `facebook`, `instagram`, `tiktok`, `x`, `linkedin`, `threads`. See SOCIAL_LOGIN.md for setup and lifecycle limits.

Post composer and scheduling routes are documented in [PUBLISHING.md](PUBLISHING.md).
