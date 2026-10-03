# Product and scope

Relay gives a business owner one place to configure repeatable replies and review social conversations. The user's latest instruction removes all LLM and generated-knowledge functionality from the master brief.

## Implemented flows

- Account creation, sign-in/out, persistent secure sessions, tenant membership, server roles.
- Per-workspace business profile with products, services, pricing, delivery, returns, support, contact details and hours entered manually.
- Approved responses with exact normalized customer phrases; off, suggest, hybrid, and automatic modes. Hybrid and automatic currently share the same conservative exact-match behavior.
- Paginated inbox, platform/unread/human/approval/archive filters, conversation search, messages, human takeover, manual simulated reply, private notes, pin marker and archiving.
- Contact statuses, tags, notes, opt-out, lead scoring and complete CSV export streamed in 500-contact pages.
- Automation create/edit/duplicate-as-draft, activate/pause, immutable version snapshots, exact/contains/prefix matching, resource delivery, optional public reply, tags, cooldowns and run logs.
- HTTPS resource links, archive flag, optional tracked redirect and aggregate click counts.
- Stored analytics, notification read state, activity and audit records, 5-second server-sent refresh, command search for pages/rules/resources, light/dark themes, mobile navigation and inbox drill-down.

## Explicitly not shipped

Real social connections or sends; OAuth; platform webhook payload parsers; file uploads; remote document ingestion; Redis; a drag-and-drop workflow editor; regex; operating-hour enforcement; automatic identity merging; language or sentiment inference; AI summaries; scheduling/snooze; team invitation UI; workspace switching; password reset and email verification; full-text global search; bulk editing; XLSX exports; unique click attribution; production deployment.

These are follow-on development tasks, not hidden or fabricated functionality. Raw dashboard business text does not itself produce replies. The owner must add approved customer phrases and their answers.

## Demo data

25 contacts, 50 conversations, 200 messages including 10 inbound comments, 5 automation rules, 8 resources, and 3 simulated accounts. Metrics are calculated from stored demo records; no “healthy live integration” badges or invented API results appear.
