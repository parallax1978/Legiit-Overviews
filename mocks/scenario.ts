// Deterministic stand-in for a Google SERP with an AI Overview, shaped like DataForSEO's
// organic/advanced result. The same (keyword, location, language, device, 3-hour slot) always gives
// the same result. "best form builder" is curated; any other keyword is built from the same template
// with tool names and sources derived from the keyword. Every reference passage exists verbatim in
// the page that pageFor() generates for its URL, under a sensible heading.
//
// Per slot: about 10% have no overview, about 30% of the rest repeat the previous overview exactly,
// and tools and sources recur with fixed probabilities so the metrics show core, recurring and
// rotating items. Keywords containing "login" or starting with "no overview" never get an overview.

export const SLOT_MS = 3 * 60 * 60 * 1000;

const ABSENT_RATE = 0.1;
const REPEAT_RATE = 0.3;

// ------------------------------------------------------------------ PRNG

function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Small seeded PRNG (mulberry32). One instance per decision stream keeps decisions independent. */
export class Rng {
  private s: number;
  constructor(seed: string) {
    this.s = hash32(seed) || 1;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
  weighted<T>(items: readonly [T, number][]): T {
    const total = items.reduce((a, [, w]) => a + w, 0);
    let x = this.next() * total;
    for (const [v, w] of items) {
      x -= w;
      if (x < 0) return v;
    }
    return items[items.length - 1][0];
  }
  hex(n: number): string {
    let s = "";
    while (s.length < n) s += Math.floor(this.next() * 16).toString(16);
    return s;
  }
}

// ------------------------------------------------------------------ text helpers

/** Same rules as normalizeKeyword in _shared/normalize.ts (kept local so this module has no deps). */
export function keywordKey(raw: string): string {
  return raw.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase().replace(/[\s\p{P}]+$/u, "").trim();
}

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
}

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function titleCase(s: string): string {
  return s.split(" ").map((w) => (w.length <= 3 && /^(crm|seo|vpn|erp|hr|api|ai|pos)$/.test(w) ? w.toUpperCase() : cap(w))).join(" ");
}

function pluralize(topic: string): string {
  const m = topic.match(/^(.*?)(\s+(?:for|in|with|to|on)\s+.*)?$/)!;
  const head = m[1];
  const rest = m[2] ?? "";
  let p: string;
  if (/(s|x|ch|sh)$/.test(head)) p = head + "es";
  else if (/[^aeiou]y$/.test(head)) p = head.slice(0, -1) + "ies";
  else p = head + "s";
  return p + rest;
}

/** DataForSEO datetime format: "2026-10-07 12:00:00 +00:00". */
export function dfsDatetime(d: Date): string {
  const iso = d.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} +00:00`;
}

export function slotOf(at: Date): number {
  return Math.floor(at.getTime() / SLOT_MS);
}

export function slotStart(slot: number): Date {
  return new Date(slot * SLOT_MS);
}

/** Lookup key for a page URL: host without www, path without trailing slash, no fragment. */
export function pageKey(url: string): string {
  try {
    const u = new URL(url.split("#")[0]);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "");
    const v = u.searchParams.get("v");
    return `${host}${path}${v ? `?v=${v}` : ""}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

function hostOf(url: string): string {
  return new URL(url).hostname;
}

// ------------------------------------------------------------------ scenario model

export interface ToolSpec {
  name: string;
  alias: string | null; // alternative spelling used in some renders ("Tally Forms")
  aliasRate: number;
  p: number; // probability the tool is listed in a render
  label: string; // "best overall"
  short: string; // what it is the pick for, used in lead sentences
  role: string; // "the best overall form builder"
  reasons: [string, number][]; // one-sentence list reasons with weights
  why: string; // clause: "it pairs ..."
  feature: string; // noun phrase
  price: string; // clause: "paid plans start at $34 per month"
  priceShort: string; // table cell
  freePlan: string; // table cell
  freePlanText: string; // sentence fragment
  rating: number;
  pros: string[];
  cons: string[];
  tagline: string; // vendor page passage
  comment: string; // forum comment passage
  highlight: string; // video transcript passage
  vendorUrl: string; // homepage, for links
}

export type SourceKind = "review" | "vendor_blog" | "vendor_home" | "vendor_pricing" | "forum" | "video";

export interface SourceSpec {
  key: string;
  url: string;
  title: string;
  source: string; // site name, as DataForSEO's reference.source
  kind: SourceKind;
  p: number; // survival: probability of being cited in a render (given the tool is listed, for vendors)
  tool: string | null; // vendor pages: the tool they belong to
  style: number; // review writing style
  author: string;
  rank: number | null; // base organic rank; null when it doesn't rank
  description: string; // organic snippet
}

interface FillerSpec {
  url: string;
  title: string;
  description: string;
  rank: number;
}

export interface Scenario {
  keyword: string;
  topic: string; // "form builder"
  plural: string; // "form builders"
  tools: ToolSpec[]; // ordered by p, descending
  sources: SourceSpec[];
  fillers: FillerSpec[];
  supportSentence: string; // uncited second lead sentence
  caveats: { text: string; weight: number; reddit: boolean }[];
  pageCaveats: [string, string]; // caveat passages used on review pages
  redditCaveat: string;
  testMethod: string;
  forumQuestion: string;
  blogIntro: string;
  guideIntro: string;
  expandedTitle: string;
  expandedText: string;
  expandedComponents: { title: string; text: string }[];
  integrations: string;
  costAnswer: string;
  video: { title: string; channel: string; snippet: string; id: string; description: string };
  related: string[]; // sibling keywords for Labs
  own: { url: string; brand: string }; // a recurring source and its brand, for the demo's own page
}

// ------------------------------------------------------------------ curated: best form builder

function curatedFormBuilder(): Scenario {
  const topic = "form builder";
  const plural = "form builders";
  const t = (x: Omit<ToolSpec, "alias" | "aliasRate"> & Partial<Pick<ToolSpec, "alias" | "aliasRate">>): ToolSpec => ({ alias: null, aliasRate: 0, ...x });
  const tools: ToolSpec[] = [
    t({
      name: "Jotform", p: 0.92, label: "best overall", short: "advanced features", role: "the best overall form builder",
      reasons: [
        ["Best overall, with more than 10,000 templates and conditional logic on every plan.", 0.8],
        ["The most feature-rich option, offering payments, e-signatures and HIPAA-friendly forms.", 0.2],
      ],
      why: "it pairs more than 10,000 templates with conditional logic on every plan",
      feature: "huge template library", price: "paid plans start at $34 per month", priceShort: "$34/month",
      freePlan: "5 forms, 100 submissions/month", freePlanText: "5 forms and 100 monthly submissions", rating: 4.7,
      pros: ["More than 10,000 templates", "Payments and e-signatures built in", "HIPAA-friendly plans"],
      cons: ["The free plan caps submissions at 100 a month"],
      tagline: "Jotform offers more than 10,000 form templates, 150+ integrations and HIPAA-friendly features on its Gold plan.",
      comment: "Jotform has a template for basically everything, but the free plan caps you at 100 submissions a month.",
      highlight: "With Jotform, the template library is what impressed me most.",
      vendorUrl: "https://www.jotform.com/",
    }),
    t({
      name: "Typeform", p: 0.88, label: "best for conversational forms", short: "conversational forms", role: "the best form builder for conversational forms",
      reasons: [
        ["Best for conversational forms that show one question at a time, which tends to raise completion rates.", 0.7],
        ["Known for polished, design-led forms and surveys that feel like a conversation.", 0.3],
      ],
      why: "it shows one question at a time, which keeps completion rates high",
      feature: "one-question-at-a-time design", price: "paid plans start at $25 per month", priceShort: "$25/month",
      freePlan: "10 responses/month", freePlanText: "10 responses a month", rating: 4.5,
      pros: ["Beautiful conversational layout", "Strong logic jumps", "Good analytics"],
      cons: ["Gets expensive as responses grow"],
      tagline: "Typeform makes forms that feel like a conversation, so people actually finish them.",
      comment: "Typeform looks great but gets expensive fast once you need more than a handful of responses.",
      highlight: "With Typeform, the one-question-at-a-time flow is what impressed me most.",
      vendorUrl: "https://www.typeform.com/",
    }),
    t({
      name: "Google Forms", p: 0.85, label: "best free option", short: "simple free forms", role: "the best free form builder",
      reasons: [
        ["The best free option, with unlimited forms and responses for anyone with a Google account.", 0.75],
        ["Completely free and easy to use, with responses saved straight to Google Sheets.", 0.25],
      ],
      why: "it is free, unlimited and saves responses straight to Google Sheets",
      feature: "zero cost and Google Sheets integration", price: "it is free with a Google account", priceShort: "Free",
      freePlan: "Unlimited", freePlanText: "unlimited forms and responses", rating: 4.6,
      pros: ["Completely free", "Responses flow into Google Sheets", "Very easy to learn"],
      cons: ["Limited design and logic options"],
      tagline: "Create forms and surveys for free with Google Forms and analyze responses in real time in Google Sheets.",
      comment: "Google Forms is fine for internal stuff, but it looks generic and logic is basic.",
      highlight: "With Google Forms, the price of zero is what impressed me most.",
      vendorUrl: "https://www.google.com/forms/about/",
    }),
    t({
      name: "Tally", alias: "Tally Forms", aliasRate: 0.4, p: 0.65, label: "best free alternative", short: "unlimited free submissions", role: "the best free alternative to Google Forms",
      reasons: [
        ["A generous free plan with unlimited forms and submissions, plus a simple document-style editor.", 0.65],
        ["Great for creators who want unlimited free submissions and a Notion-like editing experience.", 0.35],
      ],
      why: "its free plan includes unlimited forms and submissions",
      feature: "unlimited free submissions", price: "paid plans start at $29 per month", priceShort: "$29/month",
      freePlan: "Unlimited forms and submissions", freePlanText: "unlimited forms and submissions", rating: 4.8,
      pros: ["Unlimited free submissions", "Fast document-style editor", "Clean default design"],
      cons: ["Fewer native integrations than Jotform"],
      tagline: "Tally is the simplest way to create forms for free, with unlimited forms and unlimited submissions.",
      comment: "We switched from Google Forms to Tally because the free plan has no submission limits and it feels like writing a doc.",
      highlight: "With Tally, the free plan is what impressed me most.",
      vendorUrl: "https://tally.so/",
    }),
    t({
      name: "Fillout", p: 0.55, label: "best for Notion and Airtable users", short: "Notion and Airtable users", role: "the best form builder for Notion and Airtable users",
      reasons: [["Best for teams that store data in Notion, Airtable or Google Sheets, thanks to native two-way integrations.", 1]],
      why: "it syncs responses both ways with Notion, Airtable and Google Sheets",
      feature: "native Notion and Airtable integrations", price: "paid plans start at $15 per month", priceShort: "$15/month",
      freePlan: "1,000 responses/month", freePlanText: "1,000 responses a month", rating: 4.8,
      pros: ["Two-way sync with Notion and Airtable", "Generous free tier"], cons: ["Smaller template library"],
      tagline: "Fillout connects natively to Notion, Airtable and Google Sheets so responses land exactly where your team works.",
      comment: "Fillout is the only one that writes back to our Airtable base without Zapier.",
      highlight: "With Fillout, the Airtable sync is what impressed me most.",
      vendorUrl: "https://www.fillout.com/",
    }),
    t({
      name: "Paperform", p: 0.5, label: "best for design-led forms", short: "design-led forms", role: "the best form builder for design-led forms",
      reasons: [["Ideal for design-led forms that look like landing pages, with built-in payments and bookings.", 1]],
      why: "its forms look like polished landing pages with payments built in",
      feature: "landing-page style design", price: "paid plans start at $24 per month", priceShort: "$24/month",
      freePlan: "14-day trial", freePlanText: "a 14-day trial", rating: 4.5,
      pros: ["Landing-page style layouts", "Payments and bookings"], cons: ["No free plan"],
      tagline: "Paperform lets you build forms that look like beautifully designed web pages, with payments and bookings built in.",
      comment: "Paperform is what we use for client intake because it looks like part of our website.",
      highlight: "With Paperform, the page-like design is what impressed me most.",
      vendorUrl: "https://paperform.co/",
    }),
    t({
      name: "Microsoft Forms", p: 0.28, label: "best for Microsoft 365 teams", short: "Microsoft 365 teams", role: "the best option for Microsoft 365 teams",
      reasons: [["A solid free choice for Microsoft 365 teams, with quizzes and responses that flow into Excel.", 1]],
      why: "it is included with Microsoft 365 and exports responses to Excel",
      feature: "built-in quizzes", price: "it is included with Microsoft 365", priceShort: "Included with Microsoft 365",
      freePlan: "With a Microsoft account", freePlanText: "free use with a Microsoft account", rating: 4.4,
      pros: ["Included with Microsoft 365", "Quizzes with auto-grading"], cons: ["Basic design options"],
      tagline: "Microsoft Forms lets you create surveys, quizzes and polls and see results as they come in.",
      comment: "If your company is on Microsoft 365 already, Microsoft Forms does the job for internal surveys.",
      highlight: "With Microsoft Forms, the quiz mode is what impressed me most.",
      vendorUrl: "https://forms.office.com/",
    }),
    t({
      name: "Zoho Forms", p: 0.25, label: "best for Zoho users", short: "Zoho users", role: "the best choice for Zoho users",
      reasons: [["Best for businesses already using Zoho CRM, with offline mobile forms and approval workflows.", 1]],
      why: "it works offline on mobile and plugs straight into Zoho CRM",
      feature: "offline mobile forms", price: "paid plans start at $10 per month", priceShort: "$10/month",
      freePlan: "3 forms, 500 submissions/month", freePlanText: "3 forms and 500 monthly submissions", rating: 4.4,
      pros: ["Offline mobile forms", "Approval workflows"], cons: ["Best value only inside Zoho"],
      tagline: "Zoho Forms lets you build online and offline forms that connect to Zoho CRM and more than 1,000 apps.",
      comment: "Zoho Forms is underrated if you already live in Zoho CRM.",
      highlight: "With Zoho Forms, the offline mode is what impressed me most.",
      vendorUrl: "https://www.zoho.com/forms/",
    }),
    t({
      name: "Formstack", p: 0.2, label: "best for enterprise workflows", short: "enterprise workflows", role: "the best form builder for enterprise workflows",
      reasons: [["Built for enterprise workflows, with document generation, approvals and strong compliance controls.", 1]],
      why: "it adds document generation, approvals and strong compliance controls",
      feature: "approval workflows and compliance tools", price: "paid plans start at $50 per month", priceShort: "$50/month",
      freePlan: "14-day trial", freePlanText: "a 14-day trial", rating: 4.3,
      pros: ["Document generation", "HIPAA and PCI compliance"], cons: ["Expensive for small teams"],
      tagline: "Formstack helps organizations automate forms, documents and e-signatures in one secure workflow.",
      comment: "Formstack is overkill for us, but our hospital client swears by it for compliance.",
      highlight: "With Formstack, the approval workflows are what impressed me most.",
      vendorUrl: "https://www.formstack.com/",
    }),
    t({
      name: "Cognito Forms", p: 0.2, label: "best for calculations", short: "complex calculations", role: "the best form builder for calculations",
      reasons: [["Great for complex calculations, repeating sections and payment forms on a free plan.", 1]],
      why: "it handles complex calculations and repeating sections on a free plan",
      feature: "calculation fields", price: "paid plans start at $15 per month", priceShort: "$15/month",
      freePlan: "Unlimited forms, 500 entries/month", freePlanText: "unlimited forms and 500 monthly entries", rating: 4.6,
      pros: ["Powerful calculations", "Repeating sections"], cons: ["Dated interface"],
      tagline: "Cognito Forms lets you build powerful forms with calculations, repeating sections and payments for free.",
      comment: "Cognito Forms handled our order form math when nothing else could.",
      highlight: "With Cognito Forms, the calculations are what impressed me most.",
      vendorUrl: "https://www.cognitoforms.com/",
    }),
  ];
  const s = (x: Omit<SourceSpec, "tool" | "style"> & Partial<Pick<SourceSpec, "tool" | "style">>): SourceSpec => ({ tool: null, style: 0, ...x });
  const sources: SourceSpec[] = [
    s({ key: "zapier", url: "https://zapier.com/blog/best-online-form-builder-software/", title: "The 9 best online form builders in 2026 | Zapier", source: "Zapier", kind: "review", p: 0.9, style: 0, author: "Dana Whitfield", rank: 1.5, description: "The best online form builders make it easy to collect information, with logic, payments and integrations for every kind of form." }),
    s({ key: "forbes", url: "https://www.forbes.com/advisor/business/software/best-form-builder/", title: "Best Online Form Builders Of 2026 – Forbes Advisor", source: "Forbes", kind: "review", p: 0.86, style: 1, author: "Marcus Lee", rank: 2.5, description: "We compared pricing, templates and integrations to find the best online form builders for small businesses." }),
    s({ key: "g2", url: "https://www.g2.com/categories/online-form-builder", title: "Best Online Form Builder Software: User Reviews from October 2026", source: "G2", kind: "review", p: 0.6, style: 2, author: "G2 Research", rank: 5, description: "Find the best online form builder software for your business based on verified user reviews and ratings." }),
    s({ key: "reddit", url: "https://www.reddit.com/r/smallbusiness/comments/1f3k9xq/whats_the_best_form_builder_right_now/", title: "What's the best form builder right now? : r/smallbusiness", source: "Reddit", kind: "forum", p: 0.52, author: "u/cleanquotes", rank: 8, description: "I run a small cleaning business and need a form builder for quote requests and bookings." }),
    s({ key: "youtube", url: "https://www.youtube.com/watch?v=Qm3c8XyF1aE", title: "Best Form Builders in 2026 (I Tested 12) - YouTube", source: "YouTube", kind: "video", p: 0.18, author: "Process Pilot", rank: 20, description: "In this video I compare Jotform, Typeform, Tally and Google Forms on templates, logic, integrations and pricing." }),
    s({ key: "jotform-blog", url: "https://www.jotform.com/blog/best-form-builder/", title: "Best form builder: 12 tools compared for 2026 | The Jotform Blog", source: "Jotform", kind: "vendor_blog", tool: "Jotform", p: 0.68, author: "Aytekin Yildiz", rank: 4, description: "Choosing the best form builder comes down to templates, logic, integrations and price. Here are 12 tools compared." }),
    s({ key: "jotform-pricing", url: "https://www.jotform.com/pricing/", title: "Jotform Pricing | Plans for every team", source: "Jotform", kind: "vendor_pricing", tool: "Jotform", p: 0.15, author: "Jotform", rank: null, description: "Compare Jotform plans and pricing. Start for free and upgrade as you grow." }),
    s({ key: "typeform", url: "https://www.typeform.com/", title: "Typeform: People-Friendly Forms and Surveys", source: "Typeform", kind: "vendor_home", tool: "Typeform", p: 0.35, author: "Typeform", rank: 7, description: "Build beautiful, interactive forms that get more responses. No coding needed." }),
    s({ key: "tally", url: "https://tally.so/", title: "Tally Forms - The simplest free online form builder", source: "Tally", kind: "vendor_home", tool: "Tally", p: 0.5, author: "Tally", rank: 13, description: "Tally is the simplest way to create forms for free. Unlimited forms, unlimited submissions." }),
    s({ key: "fillout", url: "https://www.fillout.com/", title: "Fillout | Powerful forms for Notion, Airtable and more", source: "Fillout", kind: "vendor_home", tool: "Fillout", p: 0.45, author: "Fillout", rank: 16, description: "Create forms that connect to Notion, Airtable and Google Sheets." }),
    s({ key: "paperform", url: "https://paperform.co/", title: "Paperform | Online forms that look like web pages", source: "Paperform", kind: "vendor_home", tool: "Paperform", p: 0.4, author: "Paperform", rank: 18, description: "Build beautiful forms, surveys and payment pages without code." }),
    s({ key: "google-forms", url: "https://www.google.com/forms/about/", title: "Google Forms: Online Form Builder | Google Workspace", source: "Google", kind: "vendor_home", tool: "Google Forms", p: 0.25, author: "Google", rank: 6, description: "Create online forms and surveys with multiple question types and analyze results in Google Sheets." }),
    s({ key: "techradar", url: "https://www.techradar.com/best/best-online-form-builder", title: "Best online form builder of 2026 | TechRadar", source: "TechRadar", kind: "review", p: 0.3, style: 3, author: "Owen Clarke", rank: 10, description: "We list the best online form builders, to make it simple and easy to create forms for your website." }),
    s({ key: "pcmag", url: "https://www.pcmag.com/picks/the-best-online-form-builders", title: "The Best Online Form Builders for 2026 | PCMag", source: "PCMag", kind: "review", p: 0.25, style: 4, author: "Priya Raman", rank: 11, description: "Online form builders let you collect data without code. We tested the top services to help you pick." }),
    s({ key: "capterra", url: "https://www.capterra.com/online-form-builder-software/", title: "Best Online Form Builder Software 2026 | Capterra", source: "Capterra", kind: "review", p: 0.15, style: 5, author: "Capterra", rank: 14, description: "Find the top online form builder software of 2026 on Capterra, based on thousands of reviews." }),
    s({ key: "hubspot", url: "https://blog.hubspot.com/marketing/best-form-builder", title: "The 11 Best Form Builders in 2026 - HubSpot Blog", source: "HubSpot", kind: "review", p: 0.2, style: 6, author: "Sara Novak", rank: 15, description: "Looking for the best form builder? Here are 11 tools we like for lead capture, surveys and registrations." }),
  ];
  const fillers: FillerSpec[] = [
    { url: "https://wpforms.com/best-online-form-builder/", title: "13 Best Online Form Builders (Free and Paid) for 2026", description: "Looking for the best online form builder? We compared the top options for small businesses.", rank: 3 },
    { url: "https://www.nerdwallet.com/article/small-business/best-form-builder", title: "Best Online Form Builders for Small Business - NerdWallet", description: "Compare online form builders by price, free plan and features.", rank: 6.5 },
    { url: "https://www.surveymonkey.com/mp/online-form-builder/", title: "Free Online Form Builder | SurveyMonkey", description: "Create online forms in minutes with templates and logic.", rank: 9 },
    { url: "https://www.formsite.com/", title: "Formsite: Online Form Builder", description: "Build secure online forms and surveys with no coding.", rank: 12 },
    { url: "https://www.cognitoforms.com/", title: "Cognito Forms: Free Online Form Builder", description: "Create powerful forms with calculations and payments.", rank: 17 },
    { url: "https://www.zoho.com/forms/", title: "Zoho Forms - Online Form Builder", description: "Create online forms, collect data and automate workflows.", rank: 19 },
    { url: "https://www.formstack.com/", title: "Formstack: Online Forms, Documents and E-Signatures", description: "Automate forms, documents and signatures.", rank: 21 },
    { url: "https://www.123formbuilder.com/", title: "123FormBuilder: Free Online Form Builder", description: "Drag-and-drop online form builder.", rank: 22 },
    { url: "https://forms.app/en/blog/best-form-builders", title: "20 best form builders in 2026 - forms.app", description: "A list of the best form builders with pros and cons.", rank: 23 },
    { url: "https://en.wikipedia.org/wiki/Form_(document)", title: "Form (document) - Wikipedia", description: "A form is a document with spaces in which to write or select.", rank: 24 },
  ];
  return {
    keyword: "best form builder",
    topic,
    plural,
    tools,
    sources,
    fillers,
    supportSentence: "Most of them offer a free plan, drag-and-drop editing and integrations with tools like Google Sheets and Slack.",
    caveats: [
      { text: "The best choice depends on your budget, the integrations you need and how many responses you expect each month.", weight: 0.5, reddit: false },
      { text: "Free plans usually cap monthly responses or add branding, so check the limits before you commit.", weight: 0.3, reddit: false },
      { text: "Many users on Reddit suggest starting on a free plan and upgrading only when you hit response limits.", weight: 0.2, reddit: true },
    ],
    pageCaveats: [
      "The best choice depends on your budget, the integrations you need and how many responses you expect each month.",
      "Free plans usually cap monthly responses or add branding, so check the limits before you commit.",
    ],
    redditCaveat: "Start on a free plan and only upgrade when you actually hit the response limits.",
    testMethod: "We built the same 12-question registration form in every tool, then timed setup, tested conditional logic and checked how responses sync to Google Sheets.",
    forumQuestion: "I run a small cleaning business and need a form builder for quote requests and bookings. What's the best form builder right now?",
    blogIntro: "Choosing the best form builder comes down to templates, logic, integrations and price.",
    guideIntro: "In this guide we compare pricing, templates, logic and integrations so you can pick the right tool for your team.",
    expandedTitle: "How to choose a form builder",
    expandedText: "Consider these factors when choosing a form builder.",
    expandedComponents: [
      { title: "Pricing", text: "Compare free plan limits on forms, responses and file uploads, since they vary widely between tools." },
      { title: "Integrations", text: "Check that the builder connects to the tools you already use, such as Google Sheets, Slack, HubSpot or Zapier." },
      { title: "Logic and payments", text: "Look for conditional logic, calculations and payment collection if your forms go beyond simple contact forms." },
      { title: "Compliance", text: "If you collect health or payment data, choose a builder that offers HIPAA or PCI compliance." },
    ],
    integrations: "works with Google Sheets, Slack, HubSpot, Zapier and more than 100 other apps",
    costAnswer: "Most paid plans cost between $10 and $50 per month, and nearly every form builder offers a free plan or trial.",
    video: {
      title: "Best Form Builders in 2026 (I Tested 12)",
      channel: "Process Pilot",
      snippet: "Start time is 1 minute. Segment duration is 52 seconds",
      id: "Qm3c8XyF1aE",
      description: "In this video I compare Jotform, Typeform, Tally and Google Forms on templates, logic, integrations and pricing.",
    },
    related: [
      "best free form builder", "online form builder", "jotform alternatives", "typeform vs jotform", "google forms alternative",
      "best form builder for wordpress", "form builder app", "best survey tool", "tally forms review", "jotform login", "form builder pricing",
    ],
    own: { url: "https://www.jotform.com/blog/best-form-builder/", brand: "Jotform" },
  };
}

// ------------------------------------------------------------------ generic keywords

const PREFIXES = ["Nova", "Bright", "Swift", "Clear", "Peak", "Blue", "Zen", "Atlas", "Pilot", "Orbit", "Kite", "Maple", "Cedar", "Echo", "Lumen", "Vertex", "Harbor", "Spark", "Quill", "Ember"];
const LEADING = new Set(["best", "top", "the", "most", "good", "great", "which", "what", "is", "are", "a", "an", "no", "overview"]);
const TRAILERS = new Set(["software", "tool", "tools", "app", "apps", "platform", "platforms", "service", "services", "solution", "solutions", "system", "systems", "online", "free", "cheap", "best", "for", "in", "with"]);

function genericScenario(keyword: string): Scenario {
  const rng = new Rng(`scenario|${keyword}`);
  const words = keyword.split(" ").filter(Boolean);
  while (words.length > 1 && LEADING.has(words[0])) words.shift();
  while (words.length > 1 && /^\d{4}$/.test(words[words.length - 1])) words.pop();
  const topic = words.join(" ") || keyword;
  const plural = pluralize(topic);
  const headWords = topic.split(/\s+(?:for|in|with|to|on)\s+/)[0].split(" ").filter((w) => !TRAILERS.has(w));
  const noun = headWords[0] ?? words[0] ?? "app";
  const nounCap = noun.length <= 3 ? noun.toUpperCase() : cap(noun);
  const slug = slugify(keyword);
  const prefixes = [...PREFIXES];
  for (let i = prefixes.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [prefixes[i], prefixes[j]] = [prefixes[j], prefixes[i]];
  }
  const P = [0.92, 0.88, 0.85, 0.65, 0.55, 0.5, 0.28, 0.25, 0.2, 0.2];
  const labels = ["best overall", "best for ease of use", "best free option", "best free alternative", "best for integrations", "best for design-focused teams", "best for suite users", "best for enterprise teams", "best for automation", "best for tight budgets"];
  const shorts = ["advanced features", "ease of use", "free use", "generous free plans", "integrations", "design-focused teams", "existing suite users", "enterprise security", "automation", "tight budgets"];
  const roles = [`the best overall ${topic}`, `the easiest ${topic} to use`, `the best free ${topic}`, "the best free alternative", `the best ${topic} for integrations`, `the best ${topic} for design-focused teams`, "the best choice for teams already on its suite", `the best ${topic} for enterprise teams`, `the best ${topic} for automation`, `the best ${topic} on a tight budget`];
  const reasons: [string, number][][] = [
    [["Best overall, with the most complete feature set and a free plan for small teams.", 0.8], ["The most feature-rich option, with automation, reporting and hundreds of templates.", 0.2]],
    [["Best for ease of use, with a clean interface that new users learn in minutes.", 0.7], ["Known for a polished interface and a short learning curve.", 0.3]],
    [["The best free option, with no cost for basic use and a quick setup.", 0.75], ["Completely free for basic use and easy to set up in minutes.", 0.25]],
    [["A generous free plan plus a fast, minimal editor that feels like writing a document.", 1]],
    [["Best for teams that rely on integrations with Slack, Google Workspace and Zapier.", 1]],
    [["Ideal for design-focused teams that want polished, on-brand results.", 1]],
    [["Best for businesses already using its wider software suite.", 1]],
    [["A solid choice for large organisations that need security and compliance controls.", 1]],
    [["Built for advanced automation, workflows and reporting.", 1]],
    [["Great for budget-conscious teams, with paid plans from $9 per month.", 1]],
  ];
  const whys = ["it combines the most complete feature set with a usable free plan", "its clean interface takes minutes to learn", "its free plan covers what most small teams need", "its free plan is generous and its editor is fast", "it connects to more than 1,000 apps out of the box", "its templates look polished without any design work", "it shares data with the rest of its software suite", "it offers SSO, audit logs and compliance certifications", "its workflow builder automates repetitive steps", "its paid plans start at just $9 per month"];
  const features = ["complete feature set", "clean interface", "free plan", "minimal editor", "integration library", "polished templates", "suite integration", "security controls", "workflow automation", "low price"];
  const prices = ["$29", "$19", null, "$12", "$25", "$24", "$15", "$49", "$39", "$9"];
  const freePlans = ["Up to 3 users", "Up to 5 users", "Unlimited", "Unlimited use", "Up to 2 users", "14-day trial", "Up to 3 users", "No", "Up to 5 users", "Up to 10 users"];
  const ratings = [4.7, 4.6, 4.5, 4.6, 4.5, 4.4, 4.3, 4.3, 4.2, 4.1];
  const tools: ToolSpec[] = P.map((p, i) => {
    const name = i === 3 ? prefixes[i] : `${prefixes[i]}${nounCap}`;
    const domain = `${slugify(name).replace(/-/g, "")}.com`;
    const price = prices[i] ? `paid plans start at ${prices[i]} per month` : "it is free for basic use";
    return {
      name,
      alias: i === 3 ? `${prefixes[i]} ${nounCap}` : null,
      aliasRate: i === 3 ? 0.4 : 0,
      p,
      label: labels[i],
      short: shorts[i],
      role: roles[i],
      reasons: reasons[i],
      why: whys[i],
      feature: features[i],
      price,
      priceShort: prices[i] ? `${prices[i]}/month` : "Free",
      freePlan: freePlans[i],
      freePlanText: freePlans[i].toLowerCase(),
      rating: ratings[i],
      pros: [cap(features[i]), "Responsive support", "Regular product updates"],
      cons: [i < 3 ? "Advanced features cost extra" : "Smaller community than the leaders"],
      tagline: `${name} gives teams a ${features[i]} without the usual setup.`,
      comment: `We moved to ${name} last year and the ${features[i]} has been worth it.`,
      highlight: `With ${name}, the ${features[i]} is what impressed me most.`,
      vendorUrl: `https://www.${domain}/`,
    };
  });
  const T = titleCase(plural);
  const videoId = rng.hex(11).replace(/^(.)/, "V");
  const redditId = "1" + rng.hex(6);
  const s = (x: Omit<SourceSpec, "tool" | "style"> & Partial<Pick<SourceSpec, "tool" | "style">>): SourceSpec => ({ tool: null, style: 0, ...x });
  const vendor = (i: number) => tools[i].vendorUrl;
  const sources: SourceSpec[] = [
    s({ key: "zapier", url: `https://zapier.com/blog/${slug}/`, title: `The 9 best ${plural} in 2026 | Zapier`, source: "Zapier", kind: "review", p: 0.9, style: 0, author: "Dana Whitfield", rank: 1.5, description: `We tested dozens of ${plural} to find the best options for every kind of team.` }),
    s({ key: "forbes", url: `https://www.forbes.com/advisor/business/software/${slug}/`, title: `Best ${T} Of 2026 – Forbes Advisor`, source: "Forbes", kind: "review", p: 0.86, style: 1, author: "Marcus Lee", rank: 2.5, description: `We compared pricing, features and integrations to find the best ${plural}.` }),
    s({ key: "g2", url: `https://www.g2.com/categories/${slug}`, title: `Best ${T}: User Reviews from October 2026`, source: "G2", kind: "review", p: 0.6, style: 2, author: "G2 Research", rank: 5, description: `Find the best ${plural} based on verified user reviews.` }),
    s({ key: "reddit", url: `https://www.reddit.com/r/smallbusiness/comments/${redditId}/${slug.replace(/-/g, "_")}/`, title: `What's the ${keyword} right now? : r/smallbusiness`, source: "Reddit", kind: "forum", p: 0.52, author: "u/smallbizowner", rank: 8, description: `I run a small business and I am comparing ${plural}.` }),
    s({ key: "youtube", url: `https://www.youtube.com/watch?v=${videoId}`, title: `${T} in 2026 (I Tested 12) - YouTube`, source: "YouTube", kind: "video", p: 0.18, author: "Process Pilot", rank: 20, description: `I compare ${tools[0].name}, ${tools[1].name} and ${tools[3].name} on features, ease of use and pricing.` }),
    s({ key: "vendor-blog", url: `${vendor(0)}blog/${slug}/`, title: `${cap(keyword)}: 12 tools compared for 2026 | ${tools[0].name}`, source: tools[0].name, kind: "vendor_blog", tool: tools[0].name, p: 0.68, author: `${tools[0].name} Team`, rank: 4, description: `Choosing the ${keyword} comes down to features, ease of use, integrations and price.` }),
    s({ key: "vendor-pricing", url: `${vendor(0)}pricing/`, title: `${tools[0].name} Pricing | Plans for every team`, source: tools[0].name, kind: "vendor_pricing", tool: tools[0].name, p: 0.15, author: tools[0].name, rank: null, description: `Compare ${tools[0].name} plans and pricing.` }),
    s({ key: "vendor-1", url: vendor(1), title: `${tools[1].name}: ${cap(topic)} made simple`, source: tools[1].name, kind: "vendor_home", tool: tools[1].name, p: 0.35, author: tools[1].name, rank: 7, description: tools[1].tagline }),
    s({ key: "vendor-3", url: vendor(3), title: `${tools[3].name} - The simplest free ${topic}`, source: tools[3].name, kind: "vendor_home", tool: tools[3].name, p: 0.5, author: tools[3].name, rank: 13, description: tools[3].tagline }),
    s({ key: "vendor-4", url: vendor(4), title: `${tools[4].name} | ${cap(topic)} that connects to everything`, source: tools[4].name, kind: "vendor_home", tool: tools[4].name, p: 0.45, author: tools[4].name, rank: 16, description: tools[4].tagline }),
    s({ key: "vendor-5", url: vendor(5), title: `${tools[5].name} | Beautiful ${plural}`, source: tools[5].name, kind: "vendor_home", tool: tools[5].name, p: 0.4, author: tools[5].name, rank: 18, description: tools[5].tagline }),
    s({ key: "techradar", url: `https://www.techradar.com/best/${slug}`, title: `Best ${topic} of 2026 | TechRadar`, source: "TechRadar", kind: "review", p: 0.3, style: 3, author: "Owen Clarke", rank: 10, description: `We list the best ${plural} for every budget.` }),
    s({ key: "pcmag", url: `https://www.pcmag.com/picks/the-${slug}`, title: `The ${titleCase(keyword)} for 2026 | PCMag`, source: "PCMag", kind: "review", p: 0.25, style: 4, author: "Priya Raman", rank: 11, description: `We tested the top ${plural} to help you pick.` }),
    s({ key: "capterra", url: `https://www.capterra.com/${slug}-software/`, title: `${titleCase(keyword)} Software 2026 | Capterra`, source: "Capterra", kind: "review", p: 0.15, style: 5, author: "Capterra", rank: 14, description: `Find the top ${plural} of 2026 based on thousands of reviews.` }),
    s({ key: "hubspot", url: `https://blog.hubspot.com/marketing/${slug}`, title: `The 11 Best ${T} in 2026 - HubSpot Blog`, source: "HubSpot", kind: "review", p: 0.2, style: 6, author: "Sara Novak", rank: 15, description: `Looking for the ${keyword}? Here are 11 tools we like.` }),
  ];
  const fillers: FillerSpec[] = [
    { url: `https://www.nerdwallet.com/article/small-business/${slug}`, title: `${titleCase(keyword)} for Small Business - NerdWallet`, description: `Compare ${plural} by price, free plan and features.`, rank: 3 },
    { url: `https://www.businessnewsdaily.com/${slug}`, title: `${titleCase(keyword)}: Reviews and Comparisons`, description: `Our picks for the ${keyword} this year.`, rank: 6.5 },
    { url: `https://www.investopedia.com/${slug}`, title: `${titleCase(keyword)} - Investopedia`, description: `What to look for in a ${topic}.`, rank: 9 },
    { url: vendor(2), title: `${tools[2].name}: Free ${topic}`, description: tools[2].tagline, rank: 12 },
    { url: vendor(6), title: tools[6].name, description: tools[6].tagline, rank: 17 },
    { url: vendor(7), title: tools[7].name, description: tools[7].tagline, rank: 19 },
    { url: vendor(8), title: tools[8].name, description: tools[8].tagline, rank: 21 },
    { url: vendor(9), title: tools[9].name, description: tools[9].tagline, rank: 22 },
    { url: `https://en.wikipedia.org/wiki/${encodeURIComponent(titleCase(topic).replace(/ /g, "_"))}`, title: `${titleCase(topic)} - Wikipedia`, description: `An overview of ${plural}.`, rank: 24 },
  ];
  return {
    keyword,
    topic,
    plural,
    tools,
    sources,
    fillers,
    supportSentence: "Most of them offer a free plan, a simple setup and integrations with tools like Slack and Google Workspace.",
    caveats: [
      { text: "The best choice depends on your budget, the integrations you need and the size of your team.", weight: 0.5, reddit: false },
      { text: "Free plans are usually limited, so check the caps on users and features before you commit.", weight: 0.3, reddit: false },
      { text: "Many users on Reddit suggest starting on a free plan and upgrading only when you outgrow it.", weight: 0.2, reddit: true },
    ],
    pageCaveats: [
      "The best choice depends on your budget, the integrations you need and the size of your team.",
      "Free plans are usually limited, so check the caps on users and features before you commit.",
    ],
    redditCaveat: "Start on a free plan and only upgrade when you actually outgrow it.",
    testMethod: `We set up the same real-world project in every ${topic}, timed the setup and scored each one on features, ease of use and price.`,
    forumQuestion: `I run a small business and I am comparing ${plural}. What's the ${keyword} right now?`,
    blogIntro: `Choosing the ${keyword} comes down to features, ease of use, integrations and price.`,
    guideIntro: "In this guide we compare pricing, features and integrations so you can pick the right tool for your team.",
    expandedTitle: `How to choose a ${topic}`,
    expandedText: `Consider these factors when choosing a ${topic}.`,
    expandedComponents: [
      { title: "Pricing", text: "Compare what the free plan includes and how quickly paid plans scale with your team." },
      { title: "Integrations", text: "Check that it connects to the tools you already use, such as Slack, Google Workspace or Zapier." },
      { title: "Ease of use", text: "Try two or three options with a real task before you commit, since ease of use varies a lot." },
      { title: "Security", text: "If you handle sensitive data, look for SSO, audit logs and compliance certifications." },
    ],
    integrations: "works with Slack, Google Workspace, Zapier and more than 100 other apps",
    costAnswer: `Most paid plans cost between $10 and $50 per month, and nearly every ${topic} offers a free plan or trial.`,
    video: {
      title: `${T} in 2026 (I Tested 12)`,
      channel: "Process Pilot",
      snippet: "Start time is 1 minute. Segment duration is 48 seconds",
      id: videoId,
      description: `In this video I compare ${tools[0].name}, ${tools[1].name}, ${tools[3].name} and ${tools[2].name} on features, ease of use and pricing.`,
    },
    related: [
      `best free ${topic}`, `${topic} for small business`, `${plural} comparison`, `${tools[0].name.toLowerCase()} alternatives`,
      `${tools[0].name.toLowerCase()} vs ${tools[1].name.toLowerCase()}`, `${topic} pricing`, `how to choose a ${topic}`, `${topic} reviews`,
      `${topic} login`, `cheap ${topic}`,
    ],
    own: { url: `${vendor(0)}blog/${slug}/`, brand: tools[0].name },
  };
}

// ------------------------------------------------------------------ registry

const scenarios = new Map<string, Scenario>();
const byPage = new Map<string, { scenario: Scenario; source: SourceSpec }>();

/** The scenario for a keyword (curated for "best form builder", generated otherwise). Cached. */
export function scenarioFor(keyword: string): Scenario {
  const key = keywordKey(keyword);
  let scn = scenarios.get(key);
  if (!scn) {
    scn = key === "best form builder" ? curatedFormBuilder() : genericScenario(key);
    scenarios.set(key, scn);
    for (const source of scn.sources) {
      const pk = pageKey(source.url);
      if (!byPage.has(pk)) byPage.set(pk, { scenario: scn, source });
    }
  }
  return scn;
}

scenarioFor("best form builder");

/** Names (and aliases) of the curated tools, for the fake extractor's entity detection. */
export const KNOWN_TOOLS: string[] = scenarioFor("best form builder").tools.flatMap((t) => (t.alias ? [t.name, t.alias] : [t.name]));

/** Whether Google can show an overview for this keyword at all. */
export function canHaveOverview(keyword: string): boolean {
  const k = keywordKey(keyword);
  return !k.includes("login") && !k.startsWith("no overview");
}

function findSource(url: string): { scenario: Scenario; source: SourceSpec } | null {
  const pk = pageKey(url);
  const hit = byPage.get(pk);
  if (hit) return hit;
  // Rebuild generic scenarios from the keyword slug embedded in their URLs.
  let path: string[];
  try {
    path = new URL(url.split("#")[0]).pathname.split("/").filter(Boolean);
  } catch {
    return null;
  }
  for (const seg of path) {
    for (const cand of [seg, seg.replace(/^the-/, ""), seg.replace(/-software$/, "")]) {
      const kw = cand.replace(/[-_]+/g, " ").trim();
      if (!kw || kw.length > 120) continue;
      scenarioFor(kw);
      const again = byPage.get(pk);
      if (again) return again;
    }
  }
  return null;
}

// ------------------------------------------------------------------ passages

type About = string; // a tool name, "lead", "caveat" or "general"

function toolsByP(scn: Scenario): ToolSpec[] {
  return [...scn.tools].sort((a, b) => b.p - a.p);
}

function reviewLead(scn: Scenario, style: number): string {
  const [a, b, c, d] = toolsByP(scn);
  switch (style % 7) {
    case 0:
      return `We tested dozens of ${scn.plural} and the best ${scn.topic} for most teams is ${a.name}, with ${b.name} and ${c.name} close behind for specific needs.`;
    case 1:
      return `Our analysis ranks ${a.name} as the best ${scn.topic} overall, ${b.name} as the best for ${b.short} and ${c.name} as the best for ${c.short}.`;
    case 2:
      return `Based on verified user reviews, ${a.name}, ${b.name} and ${c.name} are the highest-rated ${scn.plural} this quarter.`;
    case 3:
      return `The best ${scn.topic} right now is ${a.name}, which combines its ${a.feature} with fair pricing.`;
    case 4:
      return `${a.name} is our Editors' Choice ${scn.topic} thanks to its ${a.feature}, while ${c.name} wins on price.`;
    case 5:
      return `Software buyers most often shortlist ${a.name}, ${b.name}, ${c.name} and ${d.name} when choosing a ${scn.topic}.`;
    default:
      return `If you only try one ${scn.topic}, make it ${a.name}, because it handles everything from simple sign-ups to complex workflows.`;
  }
}

function reviewTool(t: ToolSpec, style: number): string {
  switch (style % 7) {
    case 0:
      return `${t.name} is ${t.role} because ${t.why}.`;
    case 1:
      return `In our testing, ${t.name} stood out for its ${t.feature}.`;
    case 2:
      return `Reviewers rate ${t.name} ${t.rating} out of 5 and most often praise its ${t.feature}.`;
    case 3:
      return `${t.name} earns its spot because ${t.why}.`;
    case 4:
      return `${t.name} is our pick for ${t.short} since ${t.why}.`;
    case 5:
      return `Buyers choose ${t.name} for its ${t.feature}, and ${t.price}.`;
    default:
      return `${t.name} is a strong fit if you care about ${t.short}, because ${t.why}.`;
  }
}

/** The passage Google would quote from `source` for a sentence about `about`. */
export function passageFor(scn: Scenario, source: SourceSpec, about: About): string {
  const tool = scn.tools.find((t) => t.name === about) ?? null;
  const own = source.tool ? scn.tools.find((t) => t.name === source.tool)! : null;
  switch (source.kind) {
    case "review":
      if (tool) return reviewTool(tool, source.style);
      if (about === "caveat") return scn.pageCaveats[source.style % 2];
      return reviewLead(scn, source.style);
    case "forum":
      if (tool) return tool.comment;
      if (about === "caveat") return scn.redditCaveat;
      return scn.tools[3].comment;
    case "video":
      if (tool) return tool.highlight;
      return scn.video.description;
    case "vendor_blog":
      if (about === own!.name) return own!.tagline;
      return scn.blogIntro;
    case "vendor_pricing":
      return pricingPassage(own!);
    case "vendor_home":
      return own!.tagline;
  }
}

function pricingPassage(t: ToolSpec): string {
  return `${t.name}'s free plan includes ${t.freePlanText}, and ${t.price}.`;
}

// ------------------------------------------------------------------ overview generation

interface Attach {
  source: SourceSpec;
  about: About;
}

interface ListItem {
  tool: ToolSpec;
  name: string;
  text: string;
  refs: Attach[];
}

interface Content {
  slot: number; // the slot this content was generated for (repeats point back to it)
  async: boolean;
  lead: { sentences: { text: string; refs: Attach[] }[]; image: string | null; highlight: boolean };
  list: { title: string | null; numbered: boolean; items: ListItem[] };
  table: string[][] | null;
  expanded: { title: string; text: string; components: { title: string; text: string; refs: Attach[] }[] } | null;
  video: boolean;
  caveat: { text: string; refs: Attach[] } | null;
}

function seriesSeed(keyword: string, location: number, language: string, device: string): string {
  return `${keywordKey(keyword)}|${location}|${language.toLowerCase()}|${device}`;
}

function slotState(seed: string, slot: number): "absent" | "repeat" | "fresh" {
  const r = new Rng(`${seed}|${slot}|state`);
  if (r.chance(ABSENT_RATE)) return "absent";
  return r.chance(REPEAT_RATE) ? "repeat" : "fresh";
}

/** The slot whose content this slot shows, or null when there is no overview. */
function contentSlot(keyword: string, seed: string, slot: number): number | null {
  if (!canHaveOverview(keyword)) return null;
  const state = slotState(seed, slot);
  if (state === "absent") return null;
  if (state === "fresh") return slot;
  for (let s = slot - 1; s > slot - 64; s--) {
    const st = slotState(seed, s);
    if (st === "fresh") return s;
  }
  return slot;
}

function generate(scn: Scenario, seed: string, slot: number): Content {
  const r = (purpose: string) => new Rng(`${seed}|${slot}|${purpose}`);

  // Tools: Bernoulli on each tool's recurrence, clamped to 4..7, ordered by base rank plus noise.
  const pick = r("tools");
  let chosen = scn.tools.filter((t) => pick.chance(t.p));
  for (const t of toolsByP(scn)) {
    if (chosen.length >= 4) break;
    if (!chosen.includes(t)) chosen.push(t);
  }
  const order = r("order");
  const score = new Map(chosen.map((t) => [t, scn.tools.indexOf(t) + order.next() * 2.2]));
  chosen.sort((a, b) => score.get(a)! - score.get(b)!);
  if (chosen.length > 7) chosen = chosen.slice(0, 7);

  const names = r("names");
  const displayName = new Map(chosen.map((t) => [t, t.alias && names.chance(t.aliasRate) ? t.alias : t.name]));
  const reasonRng = r("reasons");
  const items: ListItem[] = chosen.map((t) => ({ tool: t, name: displayName.get(t)!, text: reasonRng.weighted(t.reasons), refs: [] }));

  // Lead sentence.
  const [a, b, c] = items;
  const leadRng = r("lead");
  const variant = leadRng.weighted<number>([[0, 0.45], [1, 0.25], [2, 0.15], [3, 0.15]]);
  const leadText = [
    `The best ${scn.topic} for most people is ${a.name}, while ${b.name} is the top choice for ${b.tool.short} and ${c.name} is the best pick for ${c.tool.short}.`,
    `${a.name} is widely considered the best overall ${scn.topic}, but the right choice depends on whether you need ${a.tool.short}, ${b.tool.short} or ${c.tool.short}.`,
    `There is no single best ${scn.topic}, but ${a.name} leads for ${a.tool.short}, ${b.name} for ${b.tool.short} and ${c.name} for ${c.tool.short}.`,
    `Top ${scn.plural} in 2026 include ${a.name}, ${b.name} and ${c.name}, each suited to different needs and budgets.`,
  ][variant];
  const sentences: { text: string; refs: Attach[] }[] = [{ text: leadText, refs: [] }];
  if (leadRng.chance(0.85)) sentences.push({ text: scn.supportSentence, refs: [] });
  const image = leadRng.chance(0.2) ? `${a.name} ${scn.topic} templates` : null;
  const highlight = leadRng.chance(0.3);

  const layout = r("layout");
  const titleVariant = layout.weighted<number>([[0, 0.3], [1, 0.4], [2, 0.3]]);
  const listTitle = [null, `Top ${scn.plural}`, `Best ${scn.plural} by use case`][titleVariant];
  const numbered = layout.chance(0.4);
  const hasTable = layout.chance(0.35);
  const hasExpanded = layout.chance(0.25);
  const nComponents = layout.int(2, 3);
  const hasCaveat = layout.chance(0.85);
  const caveat = hasCaveat ? layout.weighted(scn.caveats.map((cv) => [cv, cv.weight] as [typeof cv, number])) : null;

  // Sources: each cited with its survival probability (vendors only when their tool is listed).
  const srcRng = r("sources");
  const listed = new Set(chosen.map((t) => t.name));
  const active = scn.sources.filter((s) => {
    const hit = srcRng.chance(s.p);
    return s.tool ? listed.has(s.tool) && hit : hit;
  });
  if (caveat?.reddit) {
    const reddit = scn.sources.find((s) => s.kind === "forum");
    if (reddit && !active.includes(reddit)) active.push(reddit);
  }
  for (const s of scn.sources.filter((x) => x.kind === "review").sort((x, y) => y.p - x.p)) {
    if (active.length >= 3) break;
    if (!active.includes(s)) active.push(s);
  }

  const expanded = hasExpanded
    ? { title: scn.expandedTitle, text: scn.expandedText, components: scn.expandedComponents.slice(0, nComponents).map((x) => ({ ...x, refs: [] as Attach[] })) }
    : null;
  const used = new Set<SourceSpec>();
  const attach = (refs: Attach[], source: SourceSpec, about: About) => {
    refs.push({ source, about });
    used.add(source);
  };
  const reviews = active.filter((s) => s.kind === "review").sort((x, y) => y.p - x.p);

  // The lead cites the top review sites; vendor pages, forum and video attach to their tools' items.
  for (const s of reviews.slice(0, 2)) attach(sentences[0].refs, s, "lead");
  for (const s of active.filter((x) => x.tool)) {
    const item = items.find((it) => it.tool.name === s.tool);
    if (item) attach(item.refs, s, s.tool!);
  }
  const forum = active.find((s) => s.kind === "forum");
  if (forum) {
    if (caveat?.reddit) {
      // attached with the caveat below
    } else {
      const item = items.find((it) => it.tool === scn.tools[3]) ?? items[items.length - 1];
      attach(item.refs, forum, item.tool.name);
    }
  }
  const video = active.find((s) => s.kind === "video");
  if (video) attach(items[0].refs, video, items[0].tool.name);
  const g2 = reviews.find((s) => s.key === "g2");
  if (expanded && g2 && !used.has(g2)) attach(expanded.components[0].refs, g2, "caveat");

  // Remaining review sites: one per list item without a review citation, then the caveat, then the lead.
  const leftover = reviews.filter((s) => !used.has(s));
  for (const item of items) {
    if (!leftover.length) break;
    if (item.refs.some((x) => x.source.kind === "review")) continue;
    attach(item.refs, leftover.shift()!, item.tool.name);
  }
  const caveatRefs: Attach[] = [];
  if (caveat?.reddit && forum) attach(caveatRefs, forum, "caveat");
  else if (caveat && leftover.length) attach(caveatRefs, leftover.shift()!, "caveat");
  while (leftover.length) attach(sentences[0].refs, leftover.shift()!, "lead");

  const table = hasTable
    ? [
      [cap(scn.topic), "Best for", "Free plan", "Paid plans from"],
      ...items.slice(0, Math.min(items.length, 4)).map((it) => [it.name, cap(it.tool.label), it.tool.freePlan, it.tool.priceShort]),
    ]
    : null;

  return {
    slot,
    async: r("async").chance(0.6),
    lead: { sentences, image, highlight },
    list: { title: listTitle, numbered, items },
    table,
    expanded,
    video: !!video && r("video").chance(0.6),
    caveat: caveat ? { text: caveat.text, refs: caveatRefs } : null,
  };
}

// ------------------------------------------------------------------ rendering (DataForSEO shape)

const IMAGE_B64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBwgHBgkIBwgKCgkLDRYPDQwMDRsUFRAWIB0iIiAdHx8kKDQsJCYxJx8fLT0tMTU3Ojo6Iys";
const AIO_XPATH = "/html[1]/body[1]/div[3]/div[1]/div[12]/div[1]/div[2]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]";

function words(s: string): string[] {
  return s.replace(/[.,;:!?]+$/, "").split(/\s+/).filter(Boolean);
}

function textFragment(passage: string): string {
  const w = words(passage);
  const start = w.slice(0, Math.min(5, w.length)).join(" ");
  const end = w.slice(Math.max(5, w.length - 3)).join(" ");
  const enc = (x: string) => encodeURIComponent(x).replace(/\(/g, "%28").replace(/\)/g, "%29");
  return `#:~:text=${enc(start)}${end ? "," + enc(end) : ""}`;
}

interface RefOut {
  source: string;
  domain: string;
  url: string;
  title: string;
  text: string;
}

function renderRef(scn: Scenario, seed: string, slot: number, a: Attach): RefOut {
  const r = new Rng(`${seed}|${slot}|ref|${a.source.key}|${a.about}`);
  const passage = passageFor(scn, a.source, a.about);
  let text = passage;
  if (r.chance(0.35) && passage.length > 90) {
    const cut = passage.slice(0, 80 + r.int(0, 20));
    text = cut.slice(0, cut.lastIndexOf(" ")) + "...";
  }
  if ((a.source.kind === "review" || a.source.kind === "forum") && r.chance(0.15)) text = `Sep 18, 2026 — ${text}`;
  const url = r.chance(0.5) ? a.source.url + textFragment(passage) : a.source.url;
  return { source: a.source.source, domain: hostOf(a.source.url), url, title: a.source.title, text };
}

function refObject(ref: RefOut, rankGroup: number, rankAbsolute: number, position: "left" | "right") {
  return {
    type: "ai_overview_reference",
    rank_group: rankGroup,
    rank_absolute: rankAbsolute,
    page: 1,
    position,
    source: ref.source,
    domain: ref.domain,
    url: ref.url,
    title: ref.title,
    text: ref.text,
  };
}

function highlightClause(sentence: string): string {
  const m = sentence.match(/^(.*?\b(?:is|include|leads for)\s)(.+?)(\.)$/);
  return m ? `${m[1]}\`${m[2]}\`${m[3]}` : sentence;
}

function renderOverview(scn: Scenario, seed: string, c: Content): Record<string, unknown> {
  const top: RefOut[] = [];
  const element = (refs: Attach[]) => {
    const out = refs.map((a) => renderRef(scn, seed, c.slot, a));
    const markers = out.map((ref) => {
      top.push(ref);
      return `[[${top.length}]](${ref.url})`;
    }).join("");
    return { refs: out, markers };
  };
  const elementRefs = (refs: RefOut[]) => (refs.length ? refs.map((ref, i) => refObject(ref, i + 1, i + 1, "left")) : null);
  const items: Record<string, unknown>[] = [];
  const md: string[] = [];
  let rank = 0;
  const base = () => ({ rank_group: ++rank, rank_absolute: rank, page: 1, position: "left" });

  // Lead.
  {
    const parts = c.lead.sentences.map((s, i) => ({ s, el: element(s.refs), hl: c.lead.highlight && i === 0 }));
    const text = c.lead.sentences.map((s) => s.text).join(" ");
    const imageMd = c.lead.image ? `![${c.lead.image}](data:image/jpeg;base64,${IMAGE_B64})` : "";
    const markdown = imageMd + parts.map((p) => (p.hl ? highlightClause(p.s.text) : p.s.text) + p.el.markers).join(" ");
    items.push({
      type: "ai_overview_element",
      ...base(),
      title: null,
      text,
      markdown,
      links: null,
      images: c.lead.image ? [{ type: "images_element", alt: c.lead.image, url: null, image_url: `https://api.dataforseo.com/cdn/i/${c.slot}-lead:1` }] : null,
      references: elementRefs(parts.flatMap((p) => p.el.refs)),
    });
    md.push(markdown);
  }

  // Ranked list or bullets.
  {
    const rendered = c.list.items.map((it, i) => {
      const el = element(it.refs);
      return { it, el, line: `${c.list.numbered ? `${i + 1}.` : "-"} **${it.name}**: ${it.text}${el.markers}` };
    });
    const markdown = (c.list.title ? `## ${c.list.title}\n\n` : "") + rendered.map((x) => x.line).join("\n");
    items.push({
      type: "ai_overview_element",
      ...base(),
      title: c.list.title,
      text: c.list.items.map((it) => `${it.name}: ${it.text}`).join("\n"),
      markdown,
      links: null,
      images: null,
      references: elementRefs(rendered.flatMap((x) => x.el.refs)),
    });
    md.push(markdown);
  }

  if (c.table) {
    const [head, ...rows] = c.table;
    const markdown = [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
    items.push({ type: "ai_overview_table_element", position: "left", markdown, table: { table_header: null, table_content: c.table }, references: null });
    md.push(markdown);
  }

  if (c.expanded) {
    const comps = c.expanded.components.map((cp) => ({ cp, el: element(cp.refs) }));
    items.push({
      type: "ai_overview_expanded_element",
      position: "left",
      title: c.expanded.title,
      text: c.expanded.text,
      components: comps.map(({ cp, el }) => ({
        type: "ai_overview_expanded_component",
        title: cp.title,
        text: cp.text,
        markdown: `${cp.text}${el.markers}`,
        images: null,
        links: null,
        references: elementRefs(el.refs),
      })),
      references: null,
    });
    md.push(`### ${c.expanded.title}\n\n${c.expanded.text}\n\n` + comps.map(({ cp, el }) => `- **${cp.title}**: ${cp.text}${el.markers}`).join("\n"));
  }

  if (c.video) {
    const ts = slotStart(c.slot - 8 * 30);
    items.push({
      type: "ai_overview_video_element",
      position: "left",
      title: scn.video.channel,
      snippet: scn.video.snippet,
      url: `https://www.youtube.com/watch?v=${scn.video.id}&t=72`,
      domain: "www.youtube.com",
      image_url: `https://i.ytimg.com/vi/${scn.video.id}/mqdefault.jpg`,
      source: "YouTube",
      date: ts.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }),
      timestamp: dfsDatetime(new Date(Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate()))),
    });
  }

  if (c.caveat) {
    const el = element(c.caveat.refs);
    const markdown = c.caveat.text + el.markers;
    items.push({ type: "ai_overview_element", ...base(), title: null, text: c.caveat.text, markdown, links: null, images: null, references: elementRefs(el.refs) });
    md.push(markdown);
  }

  return {
    type: "ai_overview",
    rank_group: 1,
    rank_absolute: 1,
    page: 1,
    position: "left",
    xpath: AIO_XPATH,
    asynchronous_ai_overview: c.async,
    markdown: md.join("\n\n"),
    items,
    references: top.map((ref, i) => refObject(ref, i + 1, 20 + i + 1, "right")),
    rectangle: null,
  };
}

// ------------------------------------------------------------------ organic and the full result

const GL: Record<number, string> = { 2840: "US", 2826: "GB", 2124: "CA", 2036: "AU", 2276: "DE", 2250: "FR", 2724: "ES", 2356: "IN", 2380: "IT", 2528: "NL" };

function organicItems(scn: Scenario, seed: string, slot: number) {
  const r = new Rng(`${seed}|${slot}|organic`);
  const pool = [
    ...scn.sources.filter((s) => s.rank !== null).map((s) => ({ url: s.url, title: s.title, description: s.description, rank: s.rank!, site: s.source })),
    ...scn.fillers.map((f) => ({ ...f, site: hostOf(f.url).replace(/^www\./, "") })),
  ];
  const ranked = pool.map((x) => ({ x, score: x.rank + (r.next() - 0.5) * 5 })).sort((a, b) => a.score - b.score).slice(0, 20);
  return ranked.map(({ x }, i) => {
    const u = new URL(x.url);
    return {
      type: "organic",
      rank_group: i + 1,
      rank_absolute: 0, // filled by the caller
      page: 1 + Math.floor(i / 10),
      position: "left",
      xpath: `/html[1]/body[1]/div[3]/div[1]/div[13]/div[1]/div[2]/div[2]/div[1]/div[1]/div[${i + 2}]`,
      domain: u.hostname,
      title: x.title,
      url: x.url,
      cache_url: null,
      related_search_url: null,
      breadcrumb: `https://${u.hostname} › ${u.pathname.split("/").filter(Boolean).slice(0, 2).join(" › ")}`.replace(/ › $/, ""),
      website_name: x.site,
      is_image: false,
      is_video: u.hostname.endsWith("youtube.com"),
      is_featured_snippet: false,
      is_malicious: false,
      is_web_story: false,
      description: x.description,
      pre_snippet: null,
      extended_snippet: null,
      images: null,
      amp_version: false,
      rating: null,
      price: null,
      highlighted: words(scn.topic),
      links: null,
      faq: null,
      extended_people_also_search: null,
      about_this_result: null,
      related_result: null,
      timestamp: null,
      rectangle: null,
    };
  });
}

export interface SerpParams {
  keyword: string;
  location_code: number;
  language_code: string;
  device: "desktop" | "mobile" | string;
  at: Date;
}

/**
 * The DataForSEO organic/advanced `result[0]` for a keyword at a time. Content is fixed per 3-hour
 * slot; `datetime` is `at` (pass a slot time to get the slot's own timestamp).
 */
export function serpResult(p: SerpParams): Record<string, unknown> {
  const scn = scenarioFor(p.keyword);
  const seed = seriesSeed(p.keyword, p.location_code, p.language_code, p.device);
  const slot = slotOf(p.at);
  const cs = contentSlot(p.keyword, seed, slot);
  const overview = cs === null ? null : renderOverview(scn, seed, generate(scn, seed, cs));
  const organic = organicItems(scn, seed, slot);
  const gl = GL[p.location_code] ?? "US";
  const [t0, , t2] = toolsByP(scn);
  const paa = {
    type: "people_also_ask",
    rank_group: 1,
    rank_absolute: 0,
    page: 1,
    position: "left",
    xpath: "/html[1]/body[1]/div[3]/div[1]/div[13]/div[1]/div[2]/div[2]/div[1]/div[1]/div[5]",
    items: [`What is the best free ${scn.topic}?`, `Is ${t0.name} better than ${t2.name}?`, `What is the easiest ${scn.topic} to use?`, `How much does a ${scn.topic} cost?`].map((q, i) => ({
      type: "people_also_ask_element",
      title: q,
      seed_question: null,
      xpath: `/html[1]/body[1]/div[3]/div[1]/div[13]/div[1]/div[2]/div[2]/div[1]/div[1]/div[5]/div[${i + 1}]`,
      expanded_element: null,
    })),
    rectangle: null,
  };
  const related = {
    type: "related_searches",
    rank_group: 1,
    rank_absolute: 0,
    page: 2,
    position: "left",
    xpath: "/html[1]/body[1]/div[3]/div[1]/div[13]/div[1]/div[4]",
    items: scn.related.slice(0, 8),
    rectangle: null,
  };
  const items: Record<string, unknown>[] = [];
  if (overview) items.push(overview);
  organic.forEach((o, i) => {
    items.push(o);
    if (i === 2) items.push(paa);
  });
  items.push(related);
  let abs = 0;
  for (const it of items) it.rank_absolute = ++abs;
  const types = [...new Set(items.map((i) => i.type as string))];
  return {
    keyword: p.keyword,
    type: "organic",
    se_domain: "google.com",
    location_code: p.location_code,
    language_code: p.language_code,
    check_url: `https://www.google.com/search?q=${encodeURIComponent(p.keyword)}&num=100&hl=${p.language_code}&gl=${gl}&gws_rd=cr&ie=UTF-8&oe=UTF-8&glp=1`,
    datetime: dfsDatetime(p.at),
    spell: null,
    refinement_chips: null,
    item_types: types,
    se_results_count: 100_000_000 + (hash32(keywordKey(p.keyword)) % 900_000_000),
    pages_count: 2,
    items_count: items.length,
    items,
  };
}

// ------------------------------------------------------------------ pages (On-Page content parsing)

export type PageBlock =
  | { kind: "p"; text: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "table"; rows: string[][] };

export interface PageSection {
  level: number;
  heading: string;
  blocks: PageBlock[];
}

export interface Page {
  url: string;
  title: string;
  site: string;
  author: string | null;
  updated: string | null; // "September 18, 2026"
  language: string;
  sections: PageSection[]; // sections[0] is the level-1 title section
  nav: string[];
}

const p = (text: string): PageBlock => ({ kind: "p", text });

function reviewPage(scn: Scenario, src: SourceSpec): Page {
  const tools = toolsByP(scn);
  const odd = src.style % 2 === 1;
  const vendorLink = (t: ToolSpec) => p(`[Visit ${t.name}](${t.vendorUrl})`);
  const intro: PageBlock[] = [
    p(`By ${src.author} · Updated September 18, 2026`),
    p(reviewLead(scn, src.style)),
    p(scn.guideIntro),
    p(`[Read how we test software](https://${hostOf(src.url)}/how-we-test/)`),
  ];
  const sections: PageSection[] = [
    { level: 1, heading: src.title.replace(/ [|–-] [^|–-]+$/, ""), blocks: intro },
    {
      level: 2,
      heading: `The best ${scn.plural} at a glance`,
      blocks: [
        { kind: "ul", items: tools.slice(0, 6).map((t) => `${t.name}: ${cap(t.label)}`) },
        { kind: "table", rows: [[cap(scn.topic), "Best for", "Free plan", "Paid plans from"], ...tools.slice(0, 6).map((t) => [t.name, cap(t.label), t.freePlan, t.priceShort])] },
      ],
    },
    { level: 2, heading: `How we test ${scn.plural}`, blocks: [p(scn.testMethod)] },
    ...tools.map((t, i): PageSection => ({
      level: 2,
      heading: odd ? `${t.name} (${cap(t.label)})` : `${i + 1}. ${t.name}`,
      blocks: [
        p(reviewTool(t, src.style)),
        p(`Pricing: ${cap(t.price)}. Free plan: ${t.freePlanText}.`),
        { kind: "ul", items: [...t.pros.map((x) => `Pro: ${x}`), ...t.cons.map((x) => `Con: ${x}`)] },
        vendorLink(t),
      ],
    })),
    {
      level: 2,
      heading: `How to choose a ${scn.topic}`,
      blocks: [p(scn.pageCaveats[src.style % 2]), { kind: "ul", items: scn.expandedComponents.map((x) => `${x.title}: ${x.text}`) }, p(scn.pageCaveats[(src.style + 1) % 2])],
    },
    ...faq(scn),
  ];
  return { url: src.url, title: src.title, site: src.source, author: src.author, updated: "September 18, 2026", language: "en", sections, nav: ["Home", "Reviews", "Guides", "About"] };
}

function faq(scn: Scenario): PageSection[] {
  const [a, b, free] = toolsByP(scn);
  return [
    { level: 2, heading: "Frequently asked questions", blocks: [] },
    { level: 3, heading: `What is the best free ${scn.topic}?`, blocks: [p(`${free.name} is the best free ${scn.topic} because ${free.why}.`)] },
    { level: 3, heading: `Is ${a.name} better than ${b.name}?`, blocks: [p(`${a.name} is better for ${a.short}, while ${b.name} is better for ${b.short}.`)] },
    { level: 3, heading: `How much does a ${scn.topic} cost?`, blocks: [p(scn.costAnswer)] },
  ];
}

function forumPage(scn: Scenario, src: SourceSpec): Page {
  const commenters = ["u/opsnerd", "u/freelance_jess", "u/data_dan", "u/smallshop_owner", "u/agencylife", "u/nonprofit_ken", "u/bookkeeper_amy"];
  const tools = toolsByP(scn);
  const comments: PageSection[] = [
    { level: 3, heading: commenters[0], blocks: [p(scn.tools[3].comment), p("Edit: their paid plan is worth it once you need custom domains.")] },
    ...tools.filter((t) => t !== scn.tools[3]).map((t, i) => ({ level: 3, heading: commenters[(i + 1) % commenters.length], blocks: [p(t.comment)] })),
    { level: 3, heading: "u/quiet_founder", blocks: [p(scn.redditCaveat)] },
  ];
  return {
    url: src.url,
    title: src.title,
    site: "Reddit",
    author: src.author,
    updated: null,
    language: "en",
    sections: [
      { level: 1, heading: src.title.replace(/ : r\/\w+$/, ""), blocks: [p(`Posted by ${src.author} in r/smallbusiness`), p(scn.forumQuestion)] },
      { level: 2, heading: "Top comments", blocks: [p("Sorted by best.")] },
      ...comments,
    ],
    nav: ["r/smallbusiness", "Popular", "All"],
  };
}

function videoPage(scn: Scenario, src: SourceSpec): Page {
  const tools = toolsByP(scn);
  return {
    url: src.url,
    title: src.title,
    site: "YouTube",
    author: src.author,
    updated: null,
    language: "en",
    sections: [
      { level: 1, heading: scn.video.title, blocks: [p(`${src.author} · 48K views · 3 months ago`), p(scn.video.description), p("Subscribe for weekly software reviews.")] },
      { level: 2, heading: "Chapters", blocks: [{ kind: "ul", items: ["0:00 Intro", ...tools.map((t, i) => `${i + 1}:${String((i * 37) % 60).padStart(2, "0")} ${t.name}`), "9:40 Final verdict"] }] },
      { level: 2, heading: "Transcript highlights", blocks: tools.map((t) => p(t.highlight)) },
    ],
    nav: ["Home", "Shorts", "Subscriptions"],
  };
}

function vendorBlogPage(scn: Scenario, src: SourceSpec): Page {
  const own = scn.tools.find((t) => t.name === src.tool)!;
  const others = toolsByP(scn).filter((t) => t !== own).slice(0, 8);
  return {
    url: src.url,
    title: src.title,
    site: own.name,
    author: src.author,
    updated: "August 30, 2026",
    language: "en",
    sections: [
      { level: 1, heading: src.title.replace(/ \| [^|]+$/, ""), blocks: [p(`By ${src.author} · Updated August 30, 2026`), p(scn.blogIntro), p(`Below we compare ${others.length + 1} options, starting with our own.`)] },
      { level: 2, heading: `1. ${own.name}`, blocks: [p(own.tagline), p(`${own.name} is ${own.role} because ${own.why}.`), p(`[Start for free](${own.vendorUrl})`)] },
      ...others.map((t, i): PageSection => ({ level: 2, heading: `${i + 2}. ${t.name}`, blocks: [p(`${t.name} is a good fit for ${t.short}.`), p(`Pricing: ${cap(t.price)}.`)] })),
      { level: 2, heading: `${own.name} pricing`, blocks: [p(pricingPassage(own)), { kind: "table", rows: [["Plan", "Price", "Includes"], ["Free", "$0", cap(own.freePlanText)], ["Paid", own.priceShort, "Higher limits, branding removal and priority support"]] }] },
      { level: 2, heading: "Frequently asked questions", blocks: [] },
      { level: 3, heading: `Is ${own.name} free?`, blocks: [p(`Yes, ${own.name} has a free plan, and ${own.price}.`)] },
      { level: 3, heading: `What is the ${scn.keyword}?`, blocks: [p(`For most teams the ${scn.keyword} is the one that matches their budget and integrations, and ${own.name} covers both.`)] },
    ],
    nav: ["Product", "Templates", "Pricing", "Blog"],
  };
}

function vendorHomePage(scn: Scenario, src: SourceSpec): Page {
  const own = scn.tools.find((t) => t.name === src.tool)!;
  return {
    url: src.url,
    title: src.title,
    site: own.name,
    author: null,
    updated: null,
    language: "en",
    sections: [
      { level: 1, heading: src.title.replace(/ [|–-] .+$/, "").replace(/: .+$/, ""), blocks: [p(own.tagline), p(`[Get started free](${own.vendorUrl})`)] },
      { level: 2, heading: "Features", blocks: [{ kind: "ul", items: own.pros }] },
      { level: 2, heading: "Pricing", blocks: [p(`${cap(own.price)}. The free plan includes ${own.freePlanText}.`)] },
      { level: 2, heading: "Integrations", blocks: [p(`${own.name} ${scn.integrations}.`)] },
    ],
    nav: ["Product", "Templates", "Pricing", "Log in"],
  };
}

function vendorPricingPage(scn: Scenario, src: SourceSpec): Page {
  const own = scn.tools.find((t) => t.name === src.tool)!;
  return {
    url: src.url,
    title: src.title,
    site: own.name,
    author: null,
    updated: null,
    language: "en",
    sections: [
      { level: 1, heading: `${own.name} Pricing`, blocks: [p(pricingPassage(own)), p("All plans include unlimited users and SSL encryption.")] },
      { level: 2, heading: "Compare plans", blocks: [{ kind: "table", rows: [["Plan", "Price", "Includes"], ["Starter", "$0", cap(own.freePlanText)], ["Bronze", own.priceShort, "Higher limits and no branding"], ["Gold", "$99/month", "HIPAA features and priority support"]] }] },
      { level: 2, heading: "Pricing FAQ", blocks: [] },
      { level: 3, heading: "Can I cancel anytime?", blocks: [p("Yes, you can downgrade or cancel at any time from your account settings.")] },
    ],
    nav: ["Product", "Templates", "Pricing", "Log in"],
  };
}

/** A plausible article for a URL outside any scenario (own pages, drafts by URL). */
function genericPage(url: string): Page {
  let host = "example.com";
  let segs: string[] = [];
  try {
    const u = new URL(url);
    host = u.hostname.replace(/^www\./, "");
    segs = u.pathname.split("/").filter(Boolean);
  } catch {
    // keep defaults
  }
  const slug = segs[segs.length - 1] ?? host.split(".")[0];
  const phrase = slug.replace(/\.[a-z]+$/, "").replace(/[-_]+/g, " ").trim() || host;
  const scn = scenarioFor(phrase);
  const [a, b, c] = toolsByP(scn);
  const site = cap(host.split(".")[0]);
  return {
    url,
    title: `${cap(phrase)} | ${site}`,
    site,
    author: `${site} Editorial Team`,
    updated: "September 2, 2026",
    language: "en",
    sections: [
      { level: 1, heading: cap(phrase), blocks: [p(`By ${site} Editorial Team · Updated September 2, 2026`), p(`This guide explains ${phrase} and compares the options most teams consider.`)] },
      { level: 2, heading: "Our recommendations", blocks: [p(`${a.name} is ${a.role} because ${a.why}.`), p(`${b.name} is a good fit for ${b.short}, and ${c.name} is ${c.role}.`)] },
      { level: 2, heading: "Pricing", blocks: [p(scn.costAnswer)] },
      { level: 2, heading: "How to choose", blocks: [p(scn.pageCaveats[0])] },
    ],
    nav: ["Home", "Blog", "Contact"],
  };
}

/** The page DataForSEO content parsing returns for `url`: scenario pages, or a generic article. */
export function pageFor(url: string): Page {
  const hit = findSource(url);
  if (!hit) return genericPage(url);
  const { scenario, source } = hit;
  switch (source.kind) {
    case "review":
      return reviewPage(scenario, source);
    case "forum":
      return forumPage(scenario, source);
    case "video":
      return videoPage(scenario, source);
    case "vendor_blog":
      return vendorBlogPage(scenario, source);
    case "vendor_pricing":
      return vendorPricingPage(scenario, source);
    case "vendor_home":
      return vendorHomePage(scenario, source);
  }
}

/** page_as_markdown for a page. */
export function pageMarkdown(page: Page): string {
  const out: string[] = [];
  for (const s of page.sections) {
    out.push(`${"#".repeat(s.level)} ${s.heading}`);
    for (const b of s.blocks) {
      if (b.kind === "p") out.push(b.text);
      else if (b.kind === "table") {
        const [head, ...rows] = b.rows;
        out.push([`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n"));
      } else out.push(b.items.map((x, i) => (b.kind === "ol" ? `${i + 1}. ${x}` : `- ${x}`)).join("\n"));
    }
  }
  return out.join("\n\n") + "\n";
}

const MD_LINK = /\[([^\]]*)\]\(([^)]+)\)/g;

function contentItem(text: string) {
  const urls = [...text.matchAll(MD_LINK)].map((m) => ({ url: m[2], anchor_text: m[1] }));
  const plain = text.replace(MD_LINK, "$1");
  return { text: plain, url: urls[0]?.url ?? null, urls: urls.length ? urls : null };
}

/** DataForSEO content_parsing `page_content` for a page (header, footer, main_topic[], ...). */
export function pageContent(page: Page): Record<string, unknown> {
  const mainTitle = page.sections[0]?.heading ?? page.title;
  const topics = page.sections.map((s) => {
    const primary = s.blocks.flatMap((b) => (b.kind === "p" ? [contentItem(b.text)] : b.kind === "ul" || b.kind === "ol" ? b.items.map(contentItem) : []));
    const tables = s.blocks.filter((b): b is Extract<PageBlock, { kind: "table" }> => b.kind === "table").map((b) => ({
      header: [{ row_cells: b.rows[0].map((text) => ({ text, urls: null, is_header: true })) }],
      body: b.rows.slice(1).map((r) => ({ row_cells: r.map((text) => ({ text, urls: null, is_header: false })) })),
    }));
    return {
      h_title: s.heading,
      main_title: mainTitle,
      author: page.author,
      language: page.language,
      level: s.level,
      primary_content: primary.length ? primary : null,
      secondary_content: null,
      table_content: tables.length ? tables : null,
    };
  });
  const origin = (() => {
    try {
      return new URL(page.url).origin;
    } catch {
      return page.url;
    }
  })();
  return {
    header: {
      primary_content: [{ text: `${page.site} » ${mainTitle}`, url: `${origin}/`, urls: [{ url: `${origin}/`, anchor_text: page.site }] }],
      secondary_content: page.nav.map((n) => ({ text: n, url: `${origin}/${slugify(n)}`, urls: [{ url: `${origin}/${slugify(n)}`, anchor_text: n }] })),
    },
    footer: { primary_content: null, secondary_content: [{ text: `© 2026 ${page.site}. All rights reserved.`, url: null, urls: null }] },
    main_topic: topics,
    secondary_topic: null,
    ratings: null,
    offers: null,
    comments: null,
    contacts: null,
  };
}

// ------------------------------------------------------------------ Labs (related keywords)

/** Labs related keywords for a seed: the scenario's sibling queries, flagged when they trigger an overview. */
export function relatedKeywordsFor(keyword: string): { keyword: string; search_volume: number; ai_overview: boolean }[] {
  const scn = scenarioFor(keyword);
  return scn.related.map((k) => {
    const r = new Rng(`related|${k}`);
    return { keyword: k, search_volume: [90, 170, 320, 590, 880, 1300, 2400, 4400][r.int(0, 7)], ai_overview: canHaveOverview(k) && r.chance(0.75) };
  });
}

/** The seed's own search volume and whether its SERP usually shows an overview. */
export function seedKeywordInfo(keyword: string): { search_volume: number; ai_overview: boolean } {
  const r = new Rng(`seed|${keywordKey(keyword)}`);
  return { search_volume: keywordKey(keyword) === "best form builder" ? 8100 : [210, 480, 1000, 2900, 6600][r.int(0, 4)], ai_overview: canHaveOverview(keyword) };
}

/** A recurring cited page and its brand, for the demo's own-page tracking. */
export function demoOwnPage(keyword: string): { url: string; brand: string } {
  return scenarioFor(keyword).own;
}
