# Automation engine

Rules are created as drafts regardless of the submitted status. Each save increments a version and stores a snapshot. Runs identify that exact version. Activation is a distinct user action. The form can also duplicate a rule as a new draft.

The engine reads normalized events only. For comments it evaluates active rules for the account platform, normalizes Unicode/case and optionally punctuation/emoji, then applies contains, exact or prefix matching. Regex is intentionally omitted to avoid unbounded user-supplied expressions.

Each matching rule checks contact opt-out, human ownership, cooldown, resource availability and adapter capabilities. Cooldown supports 24 hours, one week, once ever, and no time cooldown; per-post mode restricts a rule to one run per customer/post. Platform event deduplication is separate and always on. An unavailable private reply records `PRIVATE_REPLY_UNSUPPORTED`; a supported public reply may still run. New contacts are tagged and marked as leads. Scores are organizational only.

Templates replace allowlisted supplied variables without evaluating expressions: first_name, username, business_name, resource_link and platform. Unknown plain variables become blank. Links are loaded from approved resource records, never invented by a model.

Delivery and message states say `simulated`. Real provider calls are disabled. Own-account events are ignored. STOP/UNSUBSCRIBE opt-outs persist, and human requests pause automation. The worker checks takeover while holding the same workspace row lock used by the takeover API.

Resource delivery is deduplicated across all rules for a workspace/contact/resource. A previously delivered resource causes `RESOURCE_ALREADY_DELIVERED`, even when a different keyword rule matches. This conservative policy allows each resource once per contact; it does not expire with the rule cooldown. A delivery record is created only when the public or private reply actually includes the selected resource URL. Public-only tracked links are supported.

Limitations: selected-post filtering, operating-hours scheduling, outbound account quotas, custom branching/actions, version restoration, and live provider delivery reconciliation are not yet implemented. Rule-level cooldown and event idempotency are tested.
