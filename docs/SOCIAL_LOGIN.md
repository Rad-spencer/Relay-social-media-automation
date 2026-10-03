# Social login and profile connections

Implemented 2026-09-28. Provider authorization-code flows are implemented for Google (YouTube), Facebook, Instagram, TikTok, X, LinkedIn and Threads. Local automated tests use mocked provider responses; no live grant has been tested because provider app credentials are absent.

## Enable a provider

1. Register a web application in that provider's developer console. Request the relevant login product and permissions. Complete its app review, test-user configuration, privacy policy and other release requirements.
2. Set `APP_URL` to the exact public HTTPS origin serving Relay. Most providers require HTTPS; localhost is useful only where the provider expressly permits it. Relay must be reached at this same origin to start authorization. Configure your reverse proxy to forward traffic to Relay on port 3000. A public deployment is not created automatically.
3. Copy the provider's client ID and secret to the server's `.env` using the names in `.env.example`. TikTok's Client Key goes in `TIKTOK_CLIENT_ID`. Use Instagram and Threads product-specific app credentials. For Facebook, set `META_GRAPH_VERSION` to a currently supported `vNN.N` version configured for your app.
4. Generate `OAUTH_ENCRYPTION_KEY` with `openssl rand -hex 32`; save it securely in `.env`. Keep it stable and backed up. Losing/changing it makes existing stored tokens unreadable and requires reconnection. Do not prefix secrets with `VITE_`, commit them, or paste them into chat.
5. Register the exact callback URLs below, replacing `https://relay.example.com` with your origin. Restart Relay after changing `.env`.
6. Test with approved test users, then with a non-developer account after production approval. A "Ready to connect" label only verifies local configuration; provider approval is checked by the provider during consent.

| Provider  | Callback path                         | Requested permissions                                                                                                 |
| --------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Google    | `/api/auth/social/google/callback`    | `openid profile email`; dashboard connections additionally request `https://www.googleapis.com/auth/youtube.readonly` |
| Facebook  | `/api/auth/social/facebook/callback`  | `public_profile email`                                                                                                |
| Instagram | `/api/auth/social/instagram/callback` | `instagram_business_basic`                                                                                            |
| TikTok    | `/api/auth/social/tiktok/callback`    | `user.info.basic`                                                                                                     |
| X         | `/api/auth/social/x/callback`         | `tweet.read users.read`; dashboard connections add `tweet.write`                                                      |
| LinkedIn  | `/api/auth/social/linkedin/callback`  | `openid profile email`; dashboard connections add `w_member_social`                                                   |
| Threads   | `/api/auth/social/threads/callback`   | `threads_basic`; dashboard connections add `threads_content_publish`                                                  |

For example: `https://relay.example.com/api/auth/social/google/callback`.

Enable YouTube Data API in the Google project before connecting a channel. Instagram supports Business/Creator accounts through this flow. Facebook connections identify a person, not their Pages; LinkedIn identifies a member, not a company Page. Dashboard Google connections verify one channel accessible through `channels.list(mine=true)`; multi-channel selection is not implemented.

## User behavior

- The sign-in screen has seven provider buttons. Missing configuration disables the affected button and explains that setup is required.
- First social login creates an empty workspace. Returning logins identify the same Relay account using the provider's stable subject ID.
- Relay never automatically merges accounts by email. If a provider reports an email already used by Relay, sign into that existing account and use Social accounts to link the profile. Providers that do not supply an explicitly verified email get a unique internal placeholder, not a fabricated contact email. Use the same provider to return to that account.
- An owner or administrator in a non-demo workspace can connect a profile. Connecting also adds that identity as a login method for the acting user's Relay account. An identity already linked to another Relay user is rejected.
- Stored connections show profile name and authorization expiry, if supplied. Reconnect performs fresh provider consent. Background refresh is not implemented; no offline scope is requested.
- Disconnect removes the workspace's stored tokens. The sign-in identity is deliberately retained to avoid locking out social-only users. Provider-side authorization can be revoked in the provider's app settings; Relay does not currently issue remote revocation requests or process provider deletion callbacks. Do not claim complete production lifecycle support.
- Social login alone does not grant publishing access. Dashboard connections now request publishing permissions for X, LinkedIn and Threads. See PUBLISHING.md for the new scheduler and live publisher limits. Live inbox synchronization, comment replies, DMs and messaging automation remain unavailable.

## Security and validation

State is random, expires in ten minutes, is stored hashed, bound to an HttpOnly SameSite browser cookie, tied to the selected provider, and consumed once. Starts require a same-origin POST. Dashboard starts additionally require a valid Relay session, CSRF and owner/admin role; callback processing rechecks the same session and membership. Google and X use S256 PKCE. Google/LinkedIn ID tokens are signature-verified with fixed provider JWKS, audience, issuer, expiry and nonce; userinfo subjects must agree. Other providers retrieve identity using a server-exchanged access token. Redirect and API destinations are fixed provider URLs; callbacks cannot supply a return URL. Access and refresh tokens are encrypted at rest with AES-256-GCM and bound to their workspace/provider/account. Login-only grants are not persisted. Tokens and provider error bodies never enter client responses or logs.

Tests cover provider request formats, profile shapes, OIDC signature/issuer/audience/nonce checks, state replay, browser/provider binding, cancelled and expired attempts, email collision, new and returning users, session/CSRF enforcement, encrypted storage, tenant separation, local disconnect, and redacted errors.

## References checked

- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
- [YouTube channel lookup](https://developers.google.com/youtube/v3/docs/channels/list)
- [LinkedIn sign-in](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2) and [discovery metadata](https://www.linkedin.com/oauth/.well-known/openid-configuration)
- [TikTok web Login Kit](https://developers.tiktok.com/docs/en/login-kit-web), [token exchange](https://developers.tiktok.com/docs/en/oauth-user-access-token-management), [profile API](https://developers.tiktok.com/docs/en/tiktok-api-v2-get-user-info)
- [X OAuth 2.0](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code)
- [Meta's Threads sample](https://github.com/fbsamples/threads_api): current official sample uses `www.threads.com` and `graph.threads.com`.
- [Meta's Instagram collection](https://www.postman.com/meta/instagram/folder/6raa77c/instagram-api-with-instagram-login) verifies professional-account eligibility and scope names.
- [Facebook manual flow](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/) and [Instagram business login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/): direct documentation access was blocked during this build. These exchanges remain unverified against live apps; confirm with the configured app and current official documentation before production release.
