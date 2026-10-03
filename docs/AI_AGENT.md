# Approved reply service — no AI or LLM

The original prompt's AI agent is deliberately replaced following the user's explicit instruction.

Users enter business facts and policies directly in the dashboard. These fields help humans; there is no retrieval model or text generation. Users separately write approved answers and a list of complete customer phrases. Routing normalizes case and punctuation, then requires an exact phrase match to exactly one enabled FAQ.

- Off: human inbox only.
- Suggest: persist an approved answer in the conversation; a teammate may edit and manually send it.
- Auto: send a unique exact approved match through the permitted adapter.
- Hybrid: the same exact-match policy, with all unknown cases routed to a teammate.

Explicit human requests, complaints/refund-related keywords, opt-outs, existing takeover and ambiguous matches prevent automatic replies. This is deterministic screening, not sentiment/intent inference and not a guarantee that all risky language will be recognized. There is no fabricated confidence score. The displayed intent is a matched reply title or routing reason.

No external AI SDK, model key, embedding database, prompt construction, training export or model call is present. No business fact is inferred from a website. Languages work only when the business supplies matching approved phrases and responses.
