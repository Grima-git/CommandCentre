import { getContacts, type Contact } from "@/lib/contacts";

export type OdinPeriod = "today" | "week" | "month" | "ytd";
export type OdinStatsKind = "renewals" | "calls" | "combined";
export type OdinAnswerKind =
  | "help"
  | "renewals"
  | "calls"
  | "hr_off_today"
  | "hr_pending_leave"
  | "hr_summary";

export type OdinCommand =
  | { type: "sms"; toName?: string; to?: string; message: string; confidence: "high" | "medium" }
  | { type: "stats_sms"; toName: string; kind: OdinStatsKind; period: OdinPeriod; confidence: "high" | "medium" }
  | { type: "followup_sms"; toName: string; confidence: "high" | "medium" }
  | { type: "add_contact"; name: string; phone: string; confidence: "high" | "medium" }
  | { type: "answer_intent"; kind: OdinAnswerKind; period: OdinPeriod; confidence: "high" | "medium" }
  | { type: "clarify"; prompt: string; options?: string[] };

const PERIOD_ALIASES: Array<[OdinPeriod, RegExp]> = [
  ["ytd", /\b(?:ytd|year to date|year-to-date|this year)\b/i],
  ["month", /\b(?:this month|month|monthly|mtd|month to date)\b/i],
  ["week", /\b(?:this week|week|weekly|wtd|week to date)\b/i],
  ["today", /\b(?:today|daily|day)\b/i],
];

const RENEWAL_RE = /\b(?:renewal|renewals|renewel|renewels|renwal|renwals|renewls|retention)\b/i;
const CALL_RE = /\b(?:call|calls|phone|phones|pbx|queue)\b/i;
const SEND_RE = /\b(?:send|text|sms|message|txt)\b/i;
const STATS_RE = /\b(?:stat|stats|summary|figures|numbers|performance|report|update|snapshot)\b/i;

export function cleanOdinText(text: string): string {
  return text
    .trim()
    .replace(/^(?:hey\s+)?od(?:i|1)n[,\s]+/i, "")
    .replace(/\s+/g, " ");
}

export function parseOdinCommand(rawText: string): OdinCommand | null {
  const text = cleanOdinText(rawText);
  if (!text) return null;

  return (
    parseAddContact(text) ??
    parseStatsSms(text) ??
    parseFollowupSms(text) ??
    parseSms(text) ??
    parseAnswerIntent(text)
  );
}

export function periodFromText(text: string): OdinPeriod {
  return PERIOD_ALIASES.find(([, pattern]) => pattern.test(text))?.[0] ?? "today";
}

export function periodLabel(period: OdinPeriod): string {
  if (period === "week") return "this week";
  if (period === "month") return "this month";
  if (period === "ytd") return "YTD";
  return "today";
}

export function statsKindFromText(text: string): OdinStatsKind | null {
  const hasRenewals = RENEWAL_RE.test(text);
  const hasCalls = CALL_RE.test(text);
  if (hasRenewals && hasCalls) return "combined";
  if (hasCalls) return "calls";
  if (hasRenewals) return "renewals";
  return null;
}

function parseStatsSms(text: string): OdinCommand | null {
  const lower = text.toLowerCase();
  if (!SEND_RE.test(lower)) return null;

  const kind = statsKindFromText(lower);
  if (!kind) return null;
  if (!STATS_RE.test(lower) && !/\b(?:send|text|sms|message|txt)\b.+\b(?:renewal|renewals|call|calls)\b/i.test(lower)) {
    return null;
  }

  const contact = findMentionedContact(text);
  if (!contact) {
    return { type: "clarify", prompt: "Who should I send that to?", options: getContactNames().slice(0, 5) };
  }

  return {
    type: "stats_sms",
    toName: contact.name,
    kind,
    period: periodFromText(lower),
    confidence: "high",
  };
}

function parseSms(text: string): OdinCommand | null {
  const lower = text.toLowerCase();
  if (!SEND_RE.test(lower)) return null;
  if (STATS_RE.test(lower) && statsKindFromText(lower)) return null;

  const explicit = text.match(/\b(?:send|text|sms|message|txt)\b(?:\s+(?:a|an|the))?(?:\s+(?:text|sms|message))?\s+(?:to\s+)?(.+?)\s+(?:saying|that says|with(?: the)? message|message is)\s+(.+)$/i);
  if (explicit?.[1] && explicit[2]) {
    return recipientMessageToCommand(explicit[1], explicit[2]);
  }

  const simple = text.match(/^(?:text|sms|message|send|txt)(?:\s+(?:a\s+)?(?:text|sms|message))?(?:\s+to)?\s+(.+)$/i);
  if (!simple?.[1]) return null;

  const rest = simple[1].trim();
  const phoneMatch = rest.match(/^((?:07\d{9}|447\d{9}))\s+(.+)$/);
  if (phoneMatch?.[1] && phoneMatch[2]?.trim()) {
    return { type: "sms", to: phoneMatch[1], message: phoneMatch[2].trim(), confidence: "high" };
  }

  const contact = findLeadingContact(rest);
  if (!contact) {
    return { type: "clarify", prompt: "I can send that, but I need a known contact or UK mobile number first.", options: getContactNames().slice(0, 5) };
  }

  const message = rest.slice(contact.matchText.length).trim();
  if (!message) return { type: "clarify", prompt: `What should I text ${contact.contact.name}?` };
  return { type: "sms", toName: contact.contact.name, message, confidence: "high" };
}

function recipientMessageToCommand(recipient: string, message: string): OdinCommand | null {
  const cleanRecipient = recipient.trim();
  const cleanMessage = message.trim();
  if (!cleanRecipient || !cleanMessage) return null;

  const contact = findMentionedContact(cleanRecipient);
  if (contact) return { type: "sms", toName: contact.name, message: cleanMessage, confidence: "high" };

  const phone = cleanRecipient.replace(/\s+/g, "");
  if (/^(?:07\d{9}|447\d{9})$/.test(phone)) return { type: "sms", to: phone, message: cleanMessage, confidence: "high" };

  return { type: "clarify", prompt: `I don't have a contact called ${cleanRecipient}. Add them first with: add contact ${cleanRecipient} as 07XXXXXXXXX.` };
}

function parseFollowupSms(text: string): OdinCommand | null {
  const lower = text.toLowerCase();
  if (!SEND_RE.test(lower)) return null;
  if (!/\b(?:that|this|it|above|last message|reply|same)\b/i.test(lower)) return null;

  const contact = findMentionedContact(text);
  if (!contact) {
    return { type: "clarify", prompt: "Who should I send that to?", options: getContactNames().slice(0, 5) };
  }

  return { type: "followup_sms", toName: contact.name, confidence: "medium" };
}

function parseAddContact(text: string): OdinCommand | null {
  const match = text.match(/^(?:please\s+)?add\s+(?:a\s+)?contact\s+(.+?)\s+(?:as|with(?: the)? number|number|on)\s+(\+?\d[\d\s]+)$/i);
  if (!match?.[1] || !match[2]) return null;
  return {
    type: "add_contact",
    name: titleCaseName(match[1].trim()),
    phone: match[2].trim(),
    confidence: "high",
  };
}

function parseAnswerIntent(text: string): OdinCommand | null {
  const lower = text.toLowerCase();
  const period = periodFromText(lower);

  if (/\b(?:help|what can you do|commands|capabilities)\b/.test(lower)) {
    return { type: "answer_intent", kind: "help", period, confidence: "high" };
  }
  if (/^(?:hello|hi|hey|yo|morning|afternoon|evening)(?:\s+od(?:i|1)n)?[.!?\s]*$/i.test(lower)) {
    return {
      type: "clarify",
      prompt:
        "Hello. I'm here. Ask me for renewals, calls, HR, or tell me who to text. Try: renewal stats today, who is off today, or text Thomas hello.",
    };
  }
  if (RENEWAL_RE.test(lower) && /\b(?:stat|stats|summary|figures|numbers|performance|doing|how are|today|week|month|ytd)\b/.test(lower)) {
    return { type: "answer_intent", kind: "renewals", period, confidence: "high" };
  }
  if (CALL_RE.test(lower) && /\b(?:stat|stats|summary|figures|numbers|performance|doing|how are|today|week|month|ytd)\b/.test(lower)) {
    return { type: "answer_intent", kind: "calls", period, confidence: "high" };
  }
  if (/\b(?:who|anyone|people|staff|employees|team)\b/.test(lower) && /\b(?:off|out|ooo|holiday|leave|absent|absence|annual leave)\b/.test(lower)) {
    return { type: "answer_intent", kind: "hr_off_today", period, confidence: "high" };
  }
  if (/\b(?:pending|awaiting|requested|requests?)\b/.test(lower) && /\b(?:leave|holiday|absence|annual leave)\b/.test(lower)) {
    return { type: "answer_intent", kind: "hr_pending_leave", period, confidence: "high" };
  }
  if (/\b(?:hr|headcount|staff|employees|people|team cover|teams)\b/.test(lower) && /\b(?:summary|stats|figures|numbers|headcount|cover|how many|show)\b/.test(lower)) {
    return { type: "answer_intent", kind: "hr_summary", period, confidence: "high" };
  }

  return null;
}

function findMentionedContact(text: string): Contact | null {
  const lower = text.toLowerCase();
  return contactsByLongestAlias().find(({ alias }) => new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i").test(lower))?.contact ?? null;
}

function findLeadingContact(text: string): { contact: Contact; matchText: string } | null {
  const lower = text.toLowerCase();
  const match = contactsByLongestAlias().find(({ alias }) => lower === alias || lower.startsWith(`${alias} `));
  if (!match) return null;
  return { contact: match.contact, matchText: text.slice(0, match.alias.length) };
}

function contactsByLongestAlias(): Array<{ contact: Contact; alias: string }> {
  return getContacts()
    .flatMap((contact) => contactAliases(contact).map((alias) => ({ contact, alias })))
    .sort((a, b) => b.alias.length - a.alias.length);
}

function contactAliases(contact: Contact): string[] {
  const parts = contact.name.split(/\s+/).filter(Boolean);
  const aliases = new Set<string>([
    contact.name.toLowerCase(),
    ...(contact.aliases ?? []).map((alias) => alias.toLowerCase()),
  ]);
  if (parts.length > 1) aliases.add(parts[0].toLowerCase());
  return [...aliases];
}

function getContactNames(): string[] {
  return getContacts().map((contact) => contact.name);
}

function titleCaseName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
