import { z } from "zod";
import { platforms } from "../shared/types.js";
import { safeUrl } from "./security.js";
const text = z.string().trim().max(4000);
const title = z.string().trim().min(1).max(120);
export const authInput = z.object({
  email: z
    .email()
    .max(250)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(12).max(128),
  name: title.optional(),
  workspaceName: title.optional(),
});
export const eventInput = z.object({
  id: z.string().min(1).max(150),
  accountId: z.string().uuid(),
  externalUserId: title,
  name: title,
  username: title,
  type: z.enum(["comment", "dm"]),
  content: text.min(1),
  postId: z.string().max(150).default("demo-post"),
  timestamp: z.iso.datetime(),
});
export const resourceInput = z.object({
  name: title,
  description: text,
  type: title,
  url: z
    .string()
    .max(2000)
    .refine(safeUrl, "Use a public HTTPS URL without credentials."),
  active: z.boolean(),
  tracking: z.boolean(),
});
export const ruleInput = z
  .object({
    name: title,
    platforms: z.array(z.enum(platforms)).min(1),
    keywords: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
    match: z.enum(["exact", "contains", "starts"]),
    ignorePunctuation: z.boolean(),
    status: z.enum(["draft", "active", "paused", "archived"]),
    cooldownHours: z.number().min(-1).max(87600),
    oncePerPost: z.boolean(),
    resourceId: z.string().max(100),
    publicReply: text,
    privateReply: text,
    tag: z.string().max(80),
  })
  .refine(
    (r) => r.publicReply || r.privateReply || r.tag,
    "Add at least one action.",
  );
export const faqInput = z.object({
  question: title,
  keywords: z.array(z.string().trim().min(1).max(200)).min(1).max(30),
  answer: text.min(1),
  enabled: z.boolean(),
});
export const profileInput = z.object({
  businessName: title,
  description: text,
  website: z
    .string()
    .max(2000)
    .refine((s) => !s || safeUrl(s), "Use a public HTTPS URL."),
  contact: text,
  hours: text,
  tone: text,
  products: text.default(""),
  services: text.default(""),
  pricing: text.default(""),
  delivery: text.default(""),
  returns: text.default(""),
  support: text.default(""),
  mode: z.enum(["off", "suggest", "auto", "hybrid"]),
});
export const conversationInput = z.object({
  handling: z.enum(["rules", "human"]).optional(),
  unread: z.boolean().optional(),
  status: z.enum(["open", "archived"]).optional(),
  pinned: z.boolean().optional(),
  assignedTo: z.string().max(120).optional(),
});
export const messageInput = z.object({
  text: text.min(1),
  note: z.boolean().default(false),
});
export const contactInput = z.object({
  status: z
    .enum([
      "New",
      "Active",
      "Lead",
      "Qualified Lead",
      "Customer",
      "VIP",
      "Collaboration",
      "Support",
      "Spam",
      "Archived",
    ])
    .optional(),
  tags: z.array(z.string().max(80)).max(30).optional(),
  notes: text.optional(),
  optedOut: z.boolean().optional(),
});
