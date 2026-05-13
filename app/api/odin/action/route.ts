import { findContactByName, getContacts } from "@/lib/contacts";
import { fetchRenewalsTracker } from "@/lib/data/connectors/opengi-soap";
import { fetchCallRecords, isPbxConfigured } from "@/lib/data/connectors/pbx-api";
import {
  fetchSageEmployees,
  fetchSageLeaveRequests,
  fetchSageOutOfOffice,
  isSageHrConfigured,
  type SageEmployee,
  type SageLeaveEntry,
} from "@/lib/data/connectors/sage-hr";
import { parseOdinCommand, type OdinAnswerKind, type OdinPeriod } from "@/lib/odin/command-engine";
import { requireApiAccess, safeText } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ActionBody = { text?: string };
type Period = "today" | "week" | "month" | "ytd";

const QUEUE = "New-Renewals";

function cleanText(text: string): string {
  return text
    .trim()
    .replace(/^(?:hey\s+)?od(?:i|1)n[,\s]+/i, "")
    .replace(/\s+/g, " ");
}

function periodFromText(text: string): "today" | "week" | "month" | "ytd" {
  if (/\b(?:ytd|year to date)\b/i.test(text)) return "ytd";
  if (/\b(?:this month|month)\b/i.test(text)) return "month";
  if (/\b(?:this week|week|weekly)\b/i.test(text)) return "week";
  return "today";
}

function statsKindFromText(text: string): "renewals" | "calls" | null {
  if (/\b(?:call|calls|phone|phones|pbx)\b/i.test(text)) return "calls";
  if (/\b(?:renewal|renewals|renewel|renewels|renwal|renwals|renewel|renewls)\b/i.test(text)) return "renewals";
  return null;
}

function periodLabel(period: Period): string {
  if (period === "week") return "this week";
  if (period === "month") return "this month";
  if (period === "ytd") return "YTD";
  return "today";
}

function getDateRange(period: Period): [Date, Date] {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (period === "week") {
    const start = new Date(now);
    const day = now.getDay();
    start.setDate(now.getDate() + (day === 0 ? -6 : 1 - day));
    start.setHours(0, 0, 0, 0);
    return [start, end];
  }
  if (period === "month") return [new Date(now.getFullYear(), now.getMonth(), 1), end];
  if (period === "ytd") return [new Date(now.getFullYear(), 0, 1), end];

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return [start, end];
}

function fmtCurrency(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtSec(seconds: number): string {
  if (seconds <= 0) return "0s";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m ? `${m}m ${s}s` : `${s}s`;
}

function findMentionedContact(text: string): string | null {
  const lower = text.toLowerCase();
  return getContacts()
    .sort((a, b) => b.name.length - a.name.length)
    .find((contact) => new RegExp(`\\b${escapeRegExp(contact.name.toLowerCase())}\\b`, "i").test(lower))?.name ?? null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseStats(text: string) {
  const lower = text.toLowerCase();
  const toName = findMentionedContact(text);
  if (!toName) return null;

  const wantsSend = /\b(?:send|text|sms|message)\b/.test(lower);
  const wantsStats = /\b(?:stat|stats|summary|figures|numbers|performance|report|update)\b/.test(lower);
  const kind = statsKindFromText(lower);

  if (!wantsSend || !kind) return null;
  if (!wantsStats && !/\b(?:send|text|sms|message)\b.+\b(?:renewal|renewals|call|calls)\b/i.test(lower)) return null;
  return {
    type: "stats_sms",
    toName,
    kind,
    period: periodFromText(text),
  };
}

function parseSms(text: string) {
  const match = text.match(/\b(?:send|text|sms|message)\b(?:\s+(?:a|an|the))?(?:\s+(?:text|sms|message))?\s+(?:to\s+)?(.+?)\s+(?:saying|that says|with(?: the)? message)\s+(.+)$/i);
  if (!match) return null;

  const recipient = match[1]?.trim();
  const message = match[2]?.trim();
  if (!recipient || !message) return null;

  const contact = findContactByName(recipient);
  if (contact) return { type: "sms", toName: contact.name, message };

  const phone = recipient.replace(/\s+/g, "");
  if (/^(?:07\d{9}|447\d{9})$/.test(phone)) return { type: "sms", to: phone, message };

  return null;
}

function parseSimpleSms(text: string) {
  const match = text.match(/^(?:text|sms|message|send)(?:\s+(?:a\s+)?(?:text|sms|message))?(?:\s+to)?\s+(.+)$/i);
  if (!match) return null;

  const rest = match[1]?.trim() ?? "";
  const contacts = getContacts().sort((a, b) => b.name.length - a.name.length);
  for (const contact of contacts) {
    const lowerName = contact.name.toLowerCase();
    const lowerRest = rest.toLowerCase();
    if (lowerRest === lowerName || !lowerRest.startsWith(`${lowerName} `)) continue;
    const message = rest.slice(contact.name.length).trim();
    if (message) return { type: "sms", toName: contact.name, message };
  }

  const phoneMatch = rest.match(/^((?:07\d{9}|447\d{9}))\s+(.+)$/);
  if (phoneMatch?.[1] && phoneMatch[2]?.trim()) {
    return { type: "sms", to: phoneMatch[1], message: phoneMatch[2].trim() };
  }

  return null;
}

function parseFollowupSms(text: string) {
  const lower = text.toLowerCase();
  const toName = findMentionedContact(text);
  if (!toName) return null;
  const wantsSend = /\b(?:send|text|sms|message)\b/.test(lower);
  const wantsFollowup = /\b(?:that|this|it|above|last message|reply)\b/.test(lower);
  if (!wantsSend || !wantsFollowup) return null;
  return { type: "followup_sms", toName };
}

function fullName(e: SageEmployee): string {
  return [e.first_name, e.last_name].filter(Boolean).join(" ").trim() || e.email || `Employee ${e.id}`;
}

function leaveEmployeeName(row: SageLeaveEntry, employees: Map<number, SageEmployee>): string {
  if (row.employee_id && employees.has(row.employee_id)) return fullName(employees.get(row.employee_id)!);
  if (typeof row.employee === "string") return row.employee;
  if (row.employee?.name) return row.employee.name;
  return [row.employee?.first_name, row.employee?.last_name].filter(Boolean).join(" ").trim() || "Unknown";
}

function parseAnswerIntent(text: string) {
  const lower = text.toLowerCase();
  const period = periodFromText(text);

  if (/\b(?:help|what can you do|commands)\b/.test(lower)) return { kind: "help" as const, period };
  if (/\b(?:renewal|renewals)\b/.test(lower) && /\b(?:stat|stats|summary|figures|numbers|performance|doing|how are)\b/.test(lower)) {
    return { kind: "renewals" as const, period };
  }
  if (/\b(?:call|calls|phone|pbx)\b/.test(lower) && /\b(?:stat|stats|summary|figures|numbers|performance|doing|how are)\b/.test(lower)) {
    return { kind: "calls" as const, period };
  }
  if (/\b(?:who|anyone|people|staff|employees)\b/.test(lower) && /\b(?:off|out|ooo|holiday|leave|absent)\b/.test(lower)) {
    return { kind: "hr_off_today" as const, period };
  }
  if (/\b(?:pending|awaiting|requested)\b/.test(lower) && /\b(?:leave|holiday|absence|requests?)\b/.test(lower)) {
    return { kind: "hr_pending_leave" as const, period };
  }
  if (/\b(?:headcount|employees|staff|people|team cover|teams)\b/.test(lower) && /\b(?:hr|people|staff|employees|team|teams|headcount|cover)\b/.test(lower)) {
    return { kind: "hr_summary" as const, period };
  }
  return null;
}

async function buildRenewalsAnswer(period: Period): Promise<string | null> {
  const [start, end] = getDateRange(period);
  const rows = await fetchRenewalsTracker(start, end);
  if (!rows) return null;

  const renewedRows = rows.filter((row) => row.totalPremium > 0 || row.earn > 0);
  const renewed = renewedRows.length;
  const gwp = rows.reduce((sum, row) => sum + row.totalPremium, 0);
  const earn = rows.reduce((sum, row) => sum + row.earn, 0);
  const avg = renewed ? gwp / renewed : 0;
  const financePen = renewed ? Math.round((renewedRows.filter((row) => row.financed).length / renewed) * 100) : 0;

  return `Renewals ${periodLabel(period)}: ${renewed} renewed, ${fmtCurrency(gwp)} GWP, ${fmtCurrency(earn)} net earn, avg premium ${fmtCurrency(avg)}, finance penetration ${financePen}%.`;
}

async function buildCallsAnswer(period: Period): Promise<string | null> {
  if (!isPbxConfigured()) return "Call stats are not available yet because PBX is not configured.";
  const [start, end] = getDateRange(period);
  const rows = await fetchCallRecords(start, end);
  if (!rows) return null;
  const calls = rows.filter((row) => row.queueName === QUEUE);
  const total = calls.length;
  const avgWait = total ? Math.round(calls.reduce((sum, row) => sum + row.waitsec, 0) / total) : 0;
  const avgDuration = total ? Math.round(calls.reduce((sum, row) => sum + row.billsec, 0) / total) : 0;
  const longestWait = calls.reduce((max, row) => Math.max(max, row.waitsec), 0);
  return `Calls ${periodLabel(period)}: ${total} New-Renewals calls, avg wait ${fmtSec(avgWait)}, avg duration ${fmtSec(avgDuration)}, longest wait ${fmtSec(longestWait)}.`;
}

async function buildHrAnswer(kind: "hr_off_today" | "hr_pending_leave" | "hr_summary"): Promise<string | null> {
  if (!isSageHrConfigured()) return "Sage HR is not configured yet, so I cannot read HR data.";
  const now = new Date();
  const [employees, requests, outToday] = await Promise.all([
    fetchSageEmployees(),
    fetchSageLeaveRequests(),
    fetchSageOutOfOffice(now),
  ]);
  if (!employees || !requests || !outToday) return null;

  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));

  if (kind === "hr_off_today") {
    if (outToday.length === 0) return "Nobody is showing as out of office today.";
    const names = outToday.slice(0, 8).map((row) => leaveEmployeeName(row, employeeMap));
    const extra = outToday.length > names.length ? `, plus ${outToday.length - names.length} more` : "";
    return `Out of office today: ${names.join(", ")}${extra}.`;
  }

  const pending = requests.filter((row) => {
    const status = `${row.status ?? row.status_code ?? ""}`.toLowerCase();
    return status.includes("pending") || status.includes("awaiting") || status.includes("requested");
  });

  if (kind === "hr_pending_leave") {
    if (pending.length === 0) return "There are no pending leave requests showing in Sage HR.";
    const names = pending.slice(0, 8).map((row) => leaveEmployeeName(row, employeeMap));
    const extra = pending.length > names.length ? `, plus ${pending.length - names.length} more` : "";
    return `${pending.length} pending leave request${pending.length === 1 ? "" : "s"}: ${names.join(", ")}${extra}.`;
  }

  const teamCounts = new Map<string, number>();
  for (const employee of employees) {
    const team = employee.team ?? "Unassigned";
    teamCounts.set(team, (teamCounts.get(team) ?? 0) + 1);
  }
  const topTeams = [...teamCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([team, count]) => `${team} ${count}`)
    .join(", ");
  return `HR summary: ${employees.length} employees, ${outToday.length} out today, ${pending.length} pending leave requests. Largest teams: ${topTeams}.`;
}

async function buildAnswerFromIntent(kind: OdinAnswerKind, period: OdinPeriod): Promise<{ type: "answer"; answer: string }> {
  if (kind === "help") {
    return {
      type: "answer",
      answer: "Try: text Thomas hello, send Thomas renewal stats this week, send Thomas renewal and call stats this month, call stats today, who is off today, pending leave, or add contact Sarah as 07123456789.",
    };
  }

  const answer =
    kind === "renewals" ? await buildRenewalsAnswer(period) :
    kind === "calls" ? await buildCallsAnswer(period) :
    await buildHrAnswer(kind);

  return { type: "answer", answer: answer ?? "I could not reach that data source just now." };
}

export async function POST(req: Request) {
  const access = await requireApiAccess(req, { section: "home", limit: { windowMs: 60_000, max: 60 } });
  if (access.response) return access.response;

  let body: ActionBody;
  try {
    body = (await req.json()) as ActionBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const text = cleanText(safeText(body.text, 1000));
  if (!text) return Response.json({ ok: true, action: null });

  const command = parseOdinCommand(text);
  const action =
    command?.type === "answer_intent" ? await buildAnswerFromIntent(command.kind, command.period) :
    command?.type === "clarify" ? { type: "answer", answer: command.options?.length ? `${command.prompt} Options: ${command.options.join(", ")}.` : command.prompt } :
    command ?? null;

  return Response.json({ ok: true, action });
}
