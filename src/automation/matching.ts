import type { FAQ, Profile, Rule } from "../shared/types.js";
export function normalize(text: string, ignorePunctuation = true) {
  const s = text.normalize("NFKC").toLocaleLowerCase();
  return (ignorePunctuation ? s.replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ") : s)
    .replace(/\s+/g, " ")
    .trim();
}
export function matches(
  text: string,
  rule: Pick<Rule, "keywords" | "match" | "ignorePunctuation">,
) {
  const source = normalize(text, rule.ignorePunctuation);
  return rule.keywords.some((k) => {
    const key = normalize(k, rule.ignorePunctuation);
    if (!key) return false;
    return rule.match === "exact"
      ? source === key
      : rule.match === "starts"
        ? source.startsWith(key)
        : source.includes(key);
  });
}
export function render(template: string, vars: Record<string, string>) {
  return template.replace(
    /\{\{\s*(\w+)\s*\}\}/g,
    (_all, key: string) => vars[key] ?? "",
  );
}
export function routeReply(
  text: string,
  faqs: FAQ[],
  profile: Profile,
  human: boolean,
  optedOut: boolean,
): {
  action: "human" | "suggest" | "reply" | "off";
  answer?: string;
  reason: string;
  intent: string;
} {
  const value = normalize(text);
  if (optedOut || /^(stop|unsubscribe|opt out|cancel messages)$/.test(value))
    return {
      action: "human",
      reason: "Customer opted out of automation",
      intent: "Opt out",
    };
  if (human)
    return {
      action: "human",
      reason: "A teammate is handling this conversation",
      intent: "Human handling",
    };
  if (/\b(human|agent|person|refund|complaint|lawyer|fraud)\b/.test(value))
    return {
      action: "human",
      reason: "Customer request requires a teammate",
      intent: "Human requested",
    };
  if (profile.mode === "off")
    return {
      action: "off",
      reason: "Automatic replies are off",
      intent: "Unmatched",
    };
  // Exact approved phrases, never inferred facts or generated answers.
  const found = faqs.filter(
    (f) => f.enabled && f.keywords.some((k) => normalize(k) === value),
  );
  if (found.length !== 1)
    return {
      action: "human",
      reason: found.length
        ? "Multiple approved replies match; review needed"
        : "No approved reply matches this message",
      intent: "Unmatched",
    };
  return {
    action: profile.mode === "suggest" ? "suggest" : "reply",
    answer: found[0].answer,
    reason: "Exact match to an approved reply",
    intent: found[0].question,
  };
}
