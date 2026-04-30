import { assertAllowedUrl } from "@/lib/security";

export type SageEmployee = {
  id: number;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  employment_start_date?: string | null;
  date_of_birth?: string | null;
  position?: string | null;
  position_id?: number | null;
  reports_to_employee_id?: number | null;
  work_phone?: string | null;
  mobile_phone?: string | null;
  employee_number?: string | null;
  team?: string | null;
  team_id?: number | null;
  employment_status?: string | null;
  team_history?: unknown;
  employment_status_history?: unknown;
  position_history?: unknown;
};

export type SageLeaveEntry = {
  id?: number;
  status?: string | null;
  status_code?: string | null;
  policy_id?: number | null;
  policy?: string | { id?: number; name?: string } | null;
  employee_id?: number | null;
  employee?: string | { id?: number; first_name?: string; last_name?: string; name?: string } | null;
  replacement?: string | { id?: number; name?: string } | null;
  details?: string | null;
  is_multi_date?: boolean | null;
  is_single_day?: boolean | null;
  is_part_of_day?: boolean | null;
  start_date?: string | null;
  end_date?: string | null;
  request_date?: string | null;
  approval_date?: string | null;
  hours?: number | string | null;
  start_time?: string | null;
  end_time?: string | null;
};

type SagePaged<T> = {
  data?: T[];
  meta?: {
    current_page?: number;
    next_page?: number | null;
    total_pages?: number;
    total_entries?: number;
  };
};

const DEFAULT_BASE_URL = "https://myfirst.sage.hr/api";

function baseUrl(): string {
  return assertAllowedUrl(process.env.SAGE_HR_BASE_URL || DEFAULT_BASE_URL, ["myfirst.sage.hr"]);
}

export function isSageHrConfigured(): boolean {
  return Boolean(process.env.SAGE_HR_API_KEY);
}

async function sageGet<T>(path: string, params?: Record<string, string | number | boolean>): Promise<T | null> {
  const token = process.env.SAGE_HR_API_KEY;
  if (!token) return null;

  const url = new URL(`${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, String(value));
  }

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Auth-Token": token,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Sage HR ${path} failed with ${res.status}`);
  }

  return (await res.json()) as T;
}

async function fetchPaged<T>(
  path: string,
  params?: Record<string, string | number | boolean>,
  limitPages = 10,
): Promise<T[] | null> {
  const first = await sageGet<SagePaged<T>>(path, { ...(params ?? {}), page: 1 });
  if (!first) return null;

  const rows = [...(first.data ?? [])];
  let next = first.meta?.next_page ?? null;
  let pageCount = 1;

  while (next && pageCount < limitPages) {
    const page = await sageGet<SagePaged<T>>(path, { ...(params ?? {}), page: next });
    rows.push(...(page?.data ?? []));
    next = page?.meta?.next_page ?? null;
    pageCount++;
  }

  return rows;
}

export async function fetchSageEmployees(): Promise<SageEmployee[] | null> {
  return fetchPaged<SageEmployee>("/employees", {
    team_history: true,
    employment_status_history: true,
    position_history: true,
  });
}

export async function fetchSageLeaveRequests(): Promise<SageLeaveEntry[] | null> {
  return fetchPaged<SageLeaveEntry>("/leave-management/requests");
}

export async function fetchSageOutOfOffice(date: Date): Promise<SageLeaveEntry[] | null> {
  const isoDate = date.toISOString().slice(0, 10);
  const body = await sageGet<SagePaged<SageLeaveEntry>>("/leave-management/out-of-office-today", { date: isoDate });
  return body?.data ?? null;
}
