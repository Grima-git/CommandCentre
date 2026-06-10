// OpenGI InfoService SOAP connector.
//
// Wraps the XML-in-SOAP-body pattern that OpenGI's ExecuteQuery endpoint uses.
// Each public function calls a specific stored procedure and returns typed rows.
// Returns null on any failure so callers can fall back to mock data.
//
// Requests are routed through a lightweight Node.js proxy running on the
// whitelisted Windows Server VM (SOAP_PROXY_URL) rather than calling OpenGI
// directly, because Netlify serverless functions have no fixed outbound IP.

const PROXY_URL = (process.env.SOAP_PROXY_URL ?? "").replace(/\/$/, "");
const PROXY_SECRET = process.env.SOAP_PROXY_SECRET ?? "";

export function isOpenGiConfigured(): boolean {
  return !!(PROXY_URL && PROXY_SECRET);
}

// ---------- SOAP plumbing ----------

function escapeXmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function callSoap(storedProc: string, params: string[]): Promise<string | null> {
  const placeholders = params.map(() => "?").join(",");
  const execute = `{call ${storedProc}(${placeholders})}`;
  const paramXml = params
    .map((p) => `&lt;Parameter value="${escapeXmlAttr(p)}"&gt;&lt;/Parameter&gt;`)
    .join("\n");

  const soap = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <ExecuteQuery xmlns="www.opengi.co.uk">
      <inputXML xmlns="">&lt;Query&gt;&lt;Datasource&gt;defaultDB&lt;/Datasource&gt;&lt;Execute&gt;${execute}&lt;/Execute&gt;&lt;ParameterList&gt;${paramXml}&lt;/ParameterList&gt;&lt;/Query&gt;</inputXML>
    </ExecuteQuery>
  </soap:Body>
</soap:Envelope>`;

  if (!PROXY_URL || !PROXY_SECRET) return null;

  try {
    const res = await fetch(PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "x-proxy-secret": PROXY_SECRET,
        "SOAPAction": `"www.opengi.co.uk/ExecuteQuery"`,
      },
      body: soap,
      cache: "no-store",
      // Abort cleanly at 22 s — well within Netlify's 26 s function limit.
      signal: AbortSignal.timeout(22_000),
    });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

function extractInnerXml(soapXml: string): string | null {
  const m = soapXml.match(/<return>([\s\S]*?)<\/return>/);
  if (!m) return null;
  // The content is HTML-entity-encoded XML — decode it
  return m[1]
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// ---------- Date helpers ----------

export function formatDDMMYYYY(d: Date): string {
  return [
    String(d.getDate()).padStart(2, "0"),
    String(d.getMonth() + 1).padStart(2, "0"),
    d.getFullYear(),
  ].join("/");
}

export function parseDDMMYYYY(s: string): Date {
  const [dd, mm, yyyy] = s.split("/");
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}

export function shortLabel(ddmmyyyy: string): string {
  const d = parseDDMMYYYY(ddmmyyyy);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ---------- Renewals Tracker ----------

export type RenewalRow = {
  date: string;           // DD/MM/YYYY - date renewal was processed
  processedDate: string;  // DD/MM/YYYY - explicit alias for processed date
  policyRef: string;
  clientName: string;
  totalPremium: number;
  financeFees: number;
  deposit: number;
  fees: number;
  commission: number;
  earn: number;
  advisor: string;
  legalSold: string;      // "" | "Free" | "Yes"
  breakdownSold: string;  // "" | "Yes"
  insurer: string;
  financed: boolean;
  inceptionDate: string;  // DD/MM/YYYY
  daysInAdv: number;
  pctDeposit: number;
};

export type RenewalDueRow = {
  policyRef: string;
  clientName: string;
  phone: string;
  insurer: string;
  renewalDate: string;
  product: string;
};

export type NewBusinessRow = {
  date: string;
  processedDate: string;
  policyRef: string;
  clientName: string;
  totalPremium: number;
  financeFees: number;
  deposit: number;
  fees: number;
  commission: number;
  earn: number;
  advisor: string;
  legalSold: string;
  breakdownSold: string;
  insurer: string;
  financed: boolean;
  inceptionDate: string;
  daysInAdv: number;
  pctDeposit: number;
};

export type PolicyInfoRow = {
  clientName: string;
  postcode: string;
  policyRef: string;
  makeDescription: string;
  model: string;
  vehicleType: string;
  insuranceScheme: string;
  vehicleValue: number;
  classOfUse: string;
  licenceDescription: string;
  privateMileage: number;
};

function parseRenewalRows(soapXml: string): RenewalRow[] {
  const inner = extractInnerXml(soapXml);
  if (!inner) return [];

  const rowMatches = inner.matchAll(/<Row>([\s\S]*?)<\/Row>/g);
  const rows: RenewalRow[] = [];

  for (const [, rowXml] of rowMatches) {
    const cols: Record<string, string> = {};
    for (const [, id, val] of rowXml.matchAll(/<Col id="(\d+)" value="([^"]*)"\s*\/>/g)) {
      cols[id] = val.trim();
    }
    rows.push({
      date: cols["1"] ?? "",
      processedDate: cols["1"] ?? "",
      policyRef: cols["2"] ?? "",
      clientName: cols["3"] ?? "",
      totalPremium: parseFloat(cols["4"]) || 0,
      financeFees: parseFloat(cols["5"]) || 0,
      deposit: parseFloat(cols["6"]) || 0,
      fees: parseFloat(cols["7"]) || 0,
      commission: parseFloat(cols["8"]) || 0,
      earn: parseFloat(cols["9"]) || 0,
      advisor: cols["10"] ?? "",
      legalSold: cols["11"] ?? "",
      breakdownSold: cols["12"] ?? "",
      insurer: (cols["13"] ?? "").trim(),
      financed: cols["14"] === "Yes",
      inceptionDate: cols["15"] ?? "",
      daysInAdv: parseInt(cols["16"]) || 0,
      pctDeposit: parseFloat(cols["17"]) || 0,
    });
  }

  return rows;
}

export async function fetchRenewalsTracker(
  start: Date,
  end: Date
): Promise<RenewalRow[] | null> {
  const xml = await callSoap("[usp_Report_Renewals_Tracker]", [
    formatDDMMYYYY(start),
    formatDDMMYYYY(end),
  ]);
  if (!xml) return null;
  return parseRenewalRows(xml);
}

function parseNewBusinessRows(soapXml: string): NewBusinessRow[] {
  const inner = extractInnerXml(soapXml);
  if (!inner) return [];

  const rowMatches = inner.matchAll(/<Row>([\s\S]*?)<\/Row>/g);
  const rows: NewBusinessRow[] = [];

  for (const [, rowXml] of rowMatches) {
    const cols: Record<string, string> = {};
    for (const [, id, val] of rowXml.matchAll(/<Col id="(\d+)" value="([^"]*)"\s*\/>/g)) {
      cols[id] = val.trim();
    }

    const processedDate = cols["1"] ?? "";
    const inceptionDate = cols["13"] ?? "";
    let daysInAdv = 0;
    if (processedDate && inceptionDate) {
      const start = parseDDMMYYYY(processedDate);
      const end = parseDDMMYYYY(inceptionDate);
      daysInAdv = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
    }

    const financeFees = parseFloat(cols["5"]) || 0;
    const fees = parseFloat(cols["7"]) || 0;
    const commission = parseFloat(cols["8"]) || 0;

    rows.push({
      date: processedDate,
      processedDate,
      policyRef: cols["2"] ?? "",
      clientName: cols["3"] ?? "",
      totalPremium: parseFloat(cols["4"]) || 0,
      financeFees,
      deposit: parseFloat(cols["6"]) || 0,
      fees,
      commission,
      earn: financeFees + fees + commission,
      financed: cols["9"] === "Yes",
      breakdownSold: cols["10"] === "Yes" ? "Yes" : "",
      legalSold: cols["11"] === "Yes" ? "Yes" : "",
      insurer: (cols["12"] ?? "").trim(),
      inceptionDate,
      daysInAdv,
      pctDeposit: parseFloat(cols["15"]) || 0,
      advisor: (cols["18"] || cols["19"] || "").trim(),
    });
  }

  return rows;
}

export async function fetchNewBusinessTracker(
  start: Date,
  end: Date
): Promise<NewBusinessRow[] | null> {
  const xml = await callSoap("[usp_Report_NewBusiness_Tracker]", [
    formatDDMMYYYY(start),
    formatDDMMYYYY(end),
  ]);
  if (!xml) return null;
  return parseNewBusinessRows(xml);
}

function parsePolicyInfoRows(soapXml: string): PolicyInfoRow[] {
  const inner = extractInnerXml(soapXml);
  if (!inner) return [];

  const rowMatches = inner.matchAll(/<Row>([\s\S]*?)<\/Row>/g);
  const rows: PolicyInfoRow[] = [];

  for (const [, rowXml] of rowMatches) {
    const cols: Record<string, string> = {};
    for (const [, id, val] of rowXml.matchAll(/<Col id="(\d+)" value="([^"]*)"\s*\/>/g)) {
      cols[id] = val.trim();
    }
    rows.push({
      clientName: cols["1"] ?? "",
      postcode: cols["2"] ?? "",
      policyRef: cols["3"] ?? "",
      makeDescription: cols["4"] ?? "",
      model: cols["5"] ?? "",
      vehicleType: cols["6"] ?? "",
      insuranceScheme: cols["7"] ?? "",
      vehicleValue: parseFloat(cols["8"]) || 0,
      classOfUse: cols["9"] ?? "",
      licenceDescription: cols["10"] ?? "",
      privateMileage: parseInt(cols["11"], 10) || 0,
    });
  }

  return rows;
}

export async function fetchPolicyInfo(policyRef: string): Promise<PolicyInfoRow[] | null> {
  const xml = await callSoap("[usp_GetPolicyInfo]", [policyRef]);
  if (!xml) return null;
  return parsePolicyInfoRows(xml);
}

function formatDueRenewalDate(raw: string): string {
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function parseRenewalDueRows(soapXml: string): RenewalDueRow[] {
  const inner = extractInnerXml(soapXml);
  if (!inner) return [];

  const rowMatches = inner.matchAll(/<Row>([\s\S]*?)<\/Row>/g);
  const rows: RenewalDueRow[] = [];

  for (const [, rowXml] of rowMatches) {
    const cols: Record<string, string> = {};
    for (const [, id, val] of rowXml.matchAll(/<Col id="(\d+)" value="([^"]*)"\s*\/>/g)) {
      cols[id] = val.trim();
    }
    rows.push({
      policyRef: cols["1"] ?? "",
      clientName: cols["2"] ?? "",
      phone: cols["3"] ?? "",
      insurer: (cols["4"] ?? "").trim(),
      renewalDate: formatDueRenewalDate(cols["5"] ?? ""),
      product: cols["7"] ?? "",
    });
  }

  return rows;
}

export async function fetchRenewalsDue(
  start: Date,
  end: Date
): Promise<RenewalDueRow[] | null> {
  const xml = await callSoap("[usp_Report_Renewals_Due]", [
    formatDDMMYYYY(start),
    formatDDMMYYYY(end),
  ]);
  if (!xml) return null;
  return parseRenewalDueRows(xml);
}

// React cache() deduplicates identical calls within a single SSR render pass.
// All dashboard sections share the same two date windows — without this, each
// section would fire its own pair of SOAP requests.
import { cache } from "react";

export const cachedRenewalsTracker = cache(
  async (startStr: string, endStr: string): Promise<RenewalRow[] | null> => {
    return fetchRenewalsTracker(parseDDMMYYYY(startStr), parseDDMMYYYY(endStr));
  }
);

// ---------- Aggregation helpers ----------

export function sumField(rows: RenewalRow[], field: keyof RenewalRow): number {
  return rows.reduce((acc, r) => acc + (r[field] as number), 0);
}

export function avgField(rows: RenewalRow[], field: keyof RenewalRow): number {
  if (!rows.length) return 0;
  return sumField(rows, field) / rows.length;
}

export function deltaPct(now: number, prev: number): number {
  if (!prev) return 0;
  return ((now - prev) / Math.abs(prev)) * 100;
}

export function deltaPP(now: number, prev: number): number {
  return now - prev;
}

export function groupByDate(
  rows: RenewalRow[],
  field: keyof RenewalRow
): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.date, (map.get(r.date) ?? 0) + (r[field] as number));
  }
  return map;
}

export function sortedDates(map: Map<string, number>): [string, number][] {
  return [...map.entries()].sort(
    (a, b) => parseDDMMYYYY(a[0]).getTime() - parseDDMMYYYY(b[0]).getTime()
  );
}
