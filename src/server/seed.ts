import type { DB } from "../db/database.js";
import type {
  Account,
  Contact,
  Conversation,
  FAQ,
  Message,
  Profile,
  Resource,
  Rule,
} from "../shared/types.js";
import { id, now, put, audit } from "./repository.js";
export const emptyProfile: Profile = {
  businessName: "My business",
  description: "",
  website: "",
  contact: "",
  hours: "",
  tone: "Friendly and concise",
  products: "",
  services: "",
  pricing: "",
  delivery: "",
  returns: "",
  support: "",
  mode: "suggest",
};
export async function seedDemo(db: DB, w: string) {
  const accounts: Account[] = [
    {
      id: id(),
      platform: "instagram",
      name: "Studio North",
      externalId: "demo-instagram",
      demo: true,
      status: "simulated",
    },
    {
      id: id(),
      platform: "facebook",
      name: "Studio North",
      externalId: "demo-facebook",
      demo: true,
      status: "simulated",
    },
    {
      id: id(),
      platform: "youtube",
      name: "Studio North",
      externalId: "demo-youtube",
      demo: true,
      status: "simulated",
    },
  ];
  for (const a of accounts) await put(db, w, "accounts", a);
  const resources: Resource[] = [
    "Design portfolio",
    "Brand strategy guide",
    "Services catalogue",
    "Pricing overview",
    "Discovery call",
    "Project checklist",
    "Brand workbook",
    "Studio website",
  ].map((name, i) => ({
    id: id(),
    name,
    description: "Sample resource — replace the example URL before real use.",
    type: i === 4 ? "Booking link" : i === 7 ? "Website" : "PDF",
    url: `https://example.com/resources/${i + 1}`,
    active: true,
    tracking: true,
    createdAt: now(),
  }));
  for (const r of resources) await put(db, w, "resources", r);
  const rules: Rule[] = [
    "Portfolio delivery",
    "Free brand guide",
    "Services catalogue",
    "Pricing request",
    "Book a discovery call",
  ].map((name, i) => ({
    id: id(),
    name,
    platforms: i === 2 ? ["facebook"] : ["instagram", "facebook"],
    keywords: [["PORTFOLIO", "GUIDE", "CATALOGUE", "PRICE", "CALL"][i]],
    match: "contains",
    ignorePunctuation: true,
    status: i < 2 ? "active" : i === 2 ? "paused" : "draft",
    cooldownHours: 24,
    oncePerPost: false,
    resourceId: resources[i].id,
    publicReply: "Thanks for your interest!",
    privateReply:
      "Hi {{first_name}}! Here is the resource you requested: {{resource_link}}",
    tag: [
      "Portfolio lead",
      "Guide lead",
      "Catalogue lead",
      "Pricing lead",
      "Discovery lead",
    ][i],
    version: 1,
    createdAt: now(),
  }));
  for (const r of rules) {
    await put(db, w, "rules", r);
    await put(db, w, "versions", { ...r, id: `${r.id}:1`, ruleId: r.id });
  }
  const faqs: FAQ[] = [
    {
      id: id(),
      question: "What do you do?",
      keywords: ["what do you do", "what services do you offer"],
      answer:
        "We help businesses with brand strategy, visual identity, and website design. Tell us a little about your project and our team will help.",
      enabled: true,
      createdAt: now(),
    },
    {
      id: id(),
      question: "How can I reach your team?",
      keywords: ["how can i reach your team"],
      answer:
        "You can leave your question here. A member of our team will get back to you.",
      enabled: true,
      createdAt: now(),
    },
  ];
  for (const f of faqs) await put(db, w, "faqs", f);
  const names = [
    "Sophie Chen",
    "Alex Morgan",
    "Priya Sharma",
    "James Wilson",
    "Olivia Taylor",
    "Daniel Kim",
    "Maya Patel",
    "Noah Williams",
    "Emma Davis",
    "Lucas Brown",
    "Ava Garcia",
    "Ethan Jones",
    "Isabella Lee",
    "Liam Martin",
    "Amelia Clark",
    "Harper Young",
    "Arjun Thapa",
    "Mia Thomas",
    "Leo Walker",
    "Charlotte Hall",
    "Henry Allen",
    "Ella King",
    "Jack Wright",
    "Grace Scott",
    "Theo Green",
  ];
  const prompts = [
    "I’d love to know more about your branding packages.",
    "PORTFOLIO please!",
    "Can I speak to someone about my project?",
    "Thanks, the guide is really helpful!",
    "What services do you offer?",
    "Do you have availability next month?",
  ];
  for (let i = 0; i < 25; i++) {
    const a = accounts[i % 3];
    const c: Contact = {
      id: id(),
      accountId: a.id,
      externalId: `demo-user-${i}`,
      name: names[i],
      username: names[i].toLowerCase().replace(/ /g, "."),
      platform: a.platform,
      status: i % 4 === 0 ? "Qualified Lead" : i % 3 === 0 ? "Lead" : "Active",
      tags: i % 3 === 0 ? ["Portfolio lead"] : ["New contact"],
      score: (i % 4) * 15 + 10,
      notes: "",
      optedOut: false,
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
    };
    await put(db, w, "contacts", c);
    for (let j = 0; j < 2; j++) {
      const createdAt = new Date(
        Date.now() - (i * 120 + j * 700) * 60000,
      ).toISOString();
      const conv: Conversation = {
        id: id(),
        contactId: c.id,
        accountId: a.id,
        name: c.name,
        username: c.username,
        platform: a.platform,
        lastMessage: prompts[i % 6],
        updatedAt: createdAt,
        unread: j === 0 && i < 8,
        handling: i % 4 === 0 ? "human" : "rules",
        status: j === 0 ? "open" : "archived",
        pinned: i === 0 && j === 0,
        intent: i % 4 === 0 ? "Human requested" : "Product enquiry",
        assignedTo: "",
        reason:
          i % 4 === 0
            ? "A teammate is needed to answer this question"
            : undefined,
      };
      await put(db, w, "conversations", conv);
      for (let m = 0; m < 4; m++)
        await put<Message>(db, w, "messages", {
          id: id(),
          conversationId: conv.id,
          text:
            m === 0
              ? "Hi! I found your studio on social media."
              : m === 1
                ? "Welcome! What would you like to know about our studio?"
                : m === 2
                  ? "I’m planning a new project."
                  : prompts[i % 6],
          direction: m === 1 ? "outbound" : "inbound",
          sender: m === 1 ? "rule" : "customer",
          kind: i < 10 && j === 0 && m === 0 ? "comment" : "message",
          status: m === 1 ? "simulated" : "received",
          createdAt: new Date(
            new Date(createdAt).getTime() - (3 - m) * 60000,
          ).toISOString(),
        });
    }
  }
  await db.query("UPDATE workspaces SET profile=$2 WHERE id=$1", [
    w,
    JSON.stringify({
      ...emptyProfile,
      businessName: "Studio North",
      description:
        "Independent design studio. Brand strategy, identity, and digital experiences.",
      hours: "Monday–Friday, 09:00–18:00",
      mode: "suggest",
    }),
  ]);
  await audit(
    db,
    w,
    "system",
    "Demo workspace created",
    "25 contacts · 50 conversations · 200 messages · 5 rules · 8 resources. All interactions are simulated.",
  );
}
