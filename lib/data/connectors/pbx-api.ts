import { assertAllowedUrl } from "@/lib/security";

export interface CallRecord {
  callUuid: string;
  callDate: string;
  startHour: number;
  direction: string;
  callerIdName: string;
  startStamp: string;
  billsec: number;
  waitsec: number;
  hangupCause: string;
  queueName: string | null;
  recordingFile: string | null;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function fmtDatetime(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

export function isPbxConfigured(): boolean {
  return !!(process.env.PBX_API_BASE_URL && process.env.PBX_DOMAIN_UUID && process.env.PBX_API_KEY);
}

export async function fetchCallRecords(from: Date, to: Date): Promise<CallRecord[] | null> {
  const base = process.env.PBX_API_BASE_URL;
  const domain = process.env.PBX_DOMAIN_UUID;
  const key = process.env.PBX_API_KEY;

  if (!base || !domain || !key) return null;
  const safeBase = assertAllowedUrl(base, ["pbx.sysconfig.co.uk"]);

  // Build query string using encodeURIComponent so spaces become %20 (not +)
  const qs = [
    `domain_uuid=${encodeURIComponent(domain)}`,
    `key=${encodeURIComponent(key)}`,
    `table=v_reporting_external_calls`,
    `action=get`,
    `from=${encodeURIComponent(fmtDatetime(from))}`,
    `to=${encodeURIComponent(fmtDatetime(to))}`,
  ].join("&");

  try {
    const res = await fetch(`${safeBase}?${qs}`, { cache: "no-store" });
    if (res.status === 204) return [];
    if (!res.ok) return null;
    const raw: unknown = await res.json();
    const rows = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
    return rows.map((r) => ({
      callUuid: String(r.call_uuid ?? ""),
      callDate: String(r.call_date ?? ""),
      startHour: Number(r.start_hour ?? 0),
      direction: String(r.direction ?? "inbound"),
      callerIdName: String(r.caller_id_name ?? ""),
      startStamp: String(r.start_stamp ?? ""),
      billsec: Number(r.billsec ?? 0),
      waitsec: Number(r.waitsec ?? 0),
      hangupCause: String(r.hangup_cause ?? ""),
      queueName: r.queue_name ? String(r.queue_name) : null,
      recordingFile: r.recording_file ? String(r.recording_file) : null,
    }));
  } catch {
    return null;
  }
}
