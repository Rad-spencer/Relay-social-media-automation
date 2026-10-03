export const platforms = [
  "instagram",
  "facebook",
  "youtube",
  "tiktok",
  "x",
  "linkedin",
  "threads",
] as const;
export type Platform = (typeof platforms)[number];
export type Role = "owner" | "admin" | "agent" | "analyst" | "viewer";
export type ReplyMode = "off" | "suggest" | "auto" | "hybrid";
export interface Profile {
  businessName: string;
  description: string;
  website: string;
  contact: string;
  hours: string;
  tone: string;
  products: string;
  services: string;
  pricing: string;
  delivery: string;
  returns: string;
  support: string;
  mode: ReplyMode;
}
export interface Account {
  id: string;
  platform: Platform;
  name: string;
  externalId: string;
  demo: boolean;
  status: "simulated" | "disconnected";
}
export interface Contact {
  id: string;
  accountId: string;
  externalId: string;
  name: string;
  username: string;
  platform: Platform;
  status: string;
  tags: string[];
  score: number;
  notes: string;
  optedOut: boolean;
  createdAt: string;
}
export interface Conversation {
  id: string;
  contactId: string;
  accountId: string;
  name: string;
  username: string;
  platform: Platform;
  lastMessage: string;
  updatedAt: string;
  unread: boolean;
  handling: "rules" | "human";
  status: "open" | "archived";
  pinned: boolean;
  intent: string;
  assignedTo: string;
  suggestion?: string;
  reason?: string;
}
export interface Message {
  id: string;
  conversationId: string;
  text: string;
  direction: "inbound" | "outbound" | "internal";
  sender: "customer" | "human" | "rule" | "system";
  kind: "message" | "comment" | "note";
  status: "received" | "simulated" | "recorded";
  createdAt: string;
}
export interface Resource {
  id: string;
  name: string;
  description: string;
  type: string;
  url: string;
  active: boolean;
  tracking: boolean;
  createdAt: string;
}
export interface Rule {
  id: string;
  name: string;
  platforms: Platform[];
  keywords: string[];
  match: "exact" | "contains" | "starts";
  ignorePunctuation: boolean;
  status: "draft" | "active" | "paused" | "archived";
  cooldownHours: number;
  oncePerPost: boolean;
  resourceId: string;
  publicReply: string;
  privateReply: string;
  tag: string;
  version: number;
  createdAt: string;
}
export interface FAQ {
  id: string;
  question: string;
  keywords: string[];
  answer: string;
  enabled: boolean;
  createdAt: string;
}
export interface SocialEvent {
  id: string;
  accountId: string;
  externalUserId: string;
  name: string;
  username: string;
  type: "comment" | "dm";
  content: string;
  postId: string;
  timestamp: string;
}
export interface Run {
  id: string;
  ruleId: string;
  ruleName: string;
  version: number;
  eventId: string;
  contactId: string;
  status: "completed" | "skipped" | "partial";
  steps: string[];
  createdAt: string;
}
export interface Audit {
  id: string;
  action: string;
  detail: string;
  actor: string;
  createdAt: string;
}
export interface Notification {
  id: string;
  title: string;
  detail: string;
  read: boolean;
  createdAt: string;
}
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  workspaceId: string;
  workspaceName: string;
  role: Role;
  demo: boolean;
  csrf: string;
}
export interface Metrics {
  messages: number;
  comments: number;
  automated: number;
  human: number;
  leads: number;
  runs: number;
  sent: number;
  clicks: number;
  attention: number;
  contacts: number;
}
export interface Dashboard {
  profile: Profile;
  accounts: Account[];
  resources: Resource[];
  rules: Rule[];
  faqs: FAQ[];
  activity: Audit[];
  notifications: Notification[];
  runs: Run[];
  metrics: Metrics;
  chart: { day: string; messages: number; comments: number }[];
  platformStats: { platform: Platform; count: number }[];
}
