export type ExecRole =
  | "renewals"
  | "exec-2"
  | "exec-3"
  | "exec-4"
  | "exec-5";

export type ExecUser = {
  email: string;
  name: string;
  title: string;
  role: ExecRole;
  homePath: `/dashboard/${ExecRole}`;
};

// The 5 C-suite users. Replace the placeholder emails with real Entra ID UPNs
// once you know the other four execs. The slugs (renewals, exec-2…) drive
// the URL paths and become the per-exec dashboard folders under app/(dashboard).
export const EXEC_USERS: ExecUser[] = [
  {
    email: "george@youngdriver.example",
    name: "George",
    title: "Head of Renewals",
    role: "renewals",
    homePath: "/dashboard/renewals",
  },
  {
    email: "exec2@youngdriver.example",
    name: "TBD",
    title: "C-Suite (slot 2)",
    role: "exec-2",
    homePath: "/dashboard/exec-2",
  },
  {
    email: "exec3@youngdriver.example",
    name: "TBD",
    title: "C-Suite (slot 3)",
    role: "exec-3",
    homePath: "/dashboard/exec-3",
  },
  {
    email: "exec4@youngdriver.example",
    name: "TBD",
    title: "C-Suite (slot 4)",
    role: "exec-4",
    homePath: "/dashboard/exec-4",
  },
  {
    email: "exec5@youngdriver.example",
    name: "TBD",
    title: "C-Suite (slot 5)",
    role: "exec-5",
    homePath: "/dashboard/exec-5",
  },
];

export function findExecByEmail(email: string | null | undefined): ExecUser | null {
  if (!email) return null;
  const lower = email.toLowerCase();
  return EXEC_USERS.find((u) => u.email.toLowerCase() === lower) ?? null;
}

export function findExecByRole(role: ExecRole): ExecUser {
  const user = EXEC_USERS.find((u) => u.role === role);
  if (!user) throw new Error(`Unknown role: ${role}`);
  return user;
}

export const DEV_USER: ExecUser = EXEC_USERS[0];
