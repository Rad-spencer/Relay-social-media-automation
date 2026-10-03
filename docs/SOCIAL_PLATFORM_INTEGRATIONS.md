# Social platform integrations

Update 2026-09-28: social sign-in and profile connection OAuth code is implemented for all seven listed platforms; see [SOCIAL_LOGIN.md](SOCIAL_LOGIN.md) for configuration and limitations. No live provider grant has been tested. The following notes describe the still-disabled messaging/action adapters, not the new login flows.

Previous platform-action status checked during this build: 2026-09-24. No real provider credentials, approved applications, tokens, or account grants are present. All live capabilities are false. The code provides a common adapter and simulated Instagram/Facebook/YouTube behavior, not seven working live API integrations.

## Capability policy

A platform name is not proof of account entitlement. A future OAuth adapter must derive capabilities from granted scopes, account type, product enrollment, app review, and current endpoint behavior. Reject unsupported actions before any network call. Private-reply restrictions and messaging windows must be evaluated for each actual event. Never scrape or automate platform browsers.

## Official reference check

- Instagram: https://developers.facebook.com/docs/instagram-platform/ — fetch returned HTTP 429 during this build. Current scopes, review requirements, account types, quotas and private-reply restrictions could not be independently verified. **Live implementation blocked pending official documentation review and account setup.**
- Facebook Messenger: https://developers.facebook.com/docs/messenger-platform/ — fetch returned HTTP 429. Current Page permissions, messaging windows, webhook signatures, review requirements and rate limits remain unverified. **Live implementation blocked.**
- YouTube: https://developers.google.com/youtube/v3/guides/implementation/comments — reviewed successfully. It documents `commentThreads.list`, `comments.list`, comment insertion and replies via `comments.insert`; write operations require OAuth 2.0. The reviewed comments guide does not establish private DM support. Accordingly, the simulator has comments/public replies and no private replies. Live scope selection, review, quotas and polling/webhook strategy are not yet implemented.
- TikTok: https://developers.tiktok.com/ — registered as disabled; required business products, permissions, reviews, event subscriptions and messaging restrictions must be reviewed before implementation.
- X: https://docs.x.com/ — registered as disabled; current access tier, OAuth scopes, webhooks, messaging rules and limits must be verified.
- LinkedIn: https://learn.microsoft.com/en-us/linkedin/ — registered as disabled; page access, product approval, scopes, event availability and permitted messaging must be verified.
- Threads: https://developers.facebook.com/docs/threads/ — registered as disabled; permissions, account eligibility, webhooks, review and restrictions must be verified.

For each live adapter, complete: Supported / Limitations / Required Permissions / Required Account Type / App Review Required / Messaging Restrictions / Webhook Support / Rate Limits / Implementation Status. Do not replace unknown values with guesses.

## OAuth implementation checklist

Register the application with the provider, verify official redirect requirements, implement session-bound one-use state and PKCE where applicable, exchange tokens server-side, encrypt them with a rotated server key, validate granted scopes, fetch verified account identity, and save permitted capabilities. Add reconnect/revoke/refresh flows and expose actual expiry/errors. Provider login buttons are now visible but disabled until local credentials and callback requirements are configured. Token refresh, remote revocation, provider deletion callbacks and live action entitlements remain incomplete.
