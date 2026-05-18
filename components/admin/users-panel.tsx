"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Save, ShieldCheck, ToggleLeft, ToggleRight } from "lucide-react";
import { SECTIONS, TOGGLEABLE_MODULES, type SectionId, type UserRole } from "@/lib/access-control";
import { cn } from "@/lib/utils";

type PublicUser = {
  id: string;
  email: string;
  name: string;
  title: string;
  role: UserRole;
  sections: SectionId[];
  createdAt: string;
  updatedAt: string;
};

type AdminResponse = { ok?: boolean; users?: PublicUser[]; error?: string };
type ModulesResponse = { ok?: boolean; enabledModules?: SectionId[]; toggleableModules?: SectionId[]; error?: string };

type Tab = "users" | "modules";

const MODULE_LABELS: Record<SectionId, string> = {
  renewals: "Renewals",
  calls: "Calls",
  hr: "HR",
  home: "Home",
  "ai-query": "AI Query",
  email: "Email",
  teams: "Teams",
  calendar: "Calendar",
  admin: "Admin",
  notifications: "Notifications",
  settings: "Settings",
  account: "Account",
};

const MODULE_DESC: Partial<Record<SectionId, string>> = {
  renewals: "OpenGI renewals KPIs, advisor performance and AI insights",
  calls: "FusionPBX call-centre analytics",
  hr: "Sage HR headcount and absence data",
};

export function AdminUsersPanel({ currentUserEmail, currentRole }: { currentUserEmail: string; currentRole: UserRole }) {
  const [tab, setTab] = useState<Tab>("users");

  // ── Users state ──────────────────────────────────────────────────────────
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [selectedEmail, setSelectedEmail] = useState("");
  const [draftRole, setDraftRole] = useState<UserRole>("user");
  const [draftSections, setDraftSections] = useState<SectionId[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // ── Modules state ─────────────────────────────────────────────────────────
  const [enabledModules, setEnabledModules] = useState<SectionId[]>(["renewals", "calls", "hr"]);
  const [modulesLoading, setModulesLoading] = useState(false);
  const [modulesSaving, setModulesSaving] = useState(false);
  const [modulesMessage, setModulesMessage] = useState<string | null>(null);

  const selectedUser = useMemo(
    () => users.find((u) => u.email === selectedEmail) ?? users[0],
    [selectedEmail, users],
  );

  // ── Load users ────────────────────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/users");
      const json = (await res.json()) as AdminResponse;
      if (!res.ok || !json.ok || !json.users) throw new Error(json.error ?? "Could not load users");
      setUsers(json.users);
      const first = selectedEmail ? json.users.find((u) => u.email === selectedEmail) : json.users[0];
      if (first) {
        setSelectedEmail(first.email);
        setDraftRole(first.role);
        setDraftSections(first.sections);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not load users");
    } finally {
      setLoading(false);
    }
  }, [selectedEmail]);

  // ── Load modules ──────────────────────────────────────────────────────────
  const loadModules = useCallback(async () => {
    setModulesLoading(true);
    try {
      const res = await fetch("/api/admin/modules");
      const json = (await res.json()) as ModulesResponse;
      if (json.ok && json.enabledModules) setEnabledModules(json.enabledModules);
    } catch {
      // silently fallback
    } finally {
      setModulesLoading(false);
    }
  }, []);

  useEffect(() => { void loadUsers(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadModules(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedUser) return;
    setDraftRole(selectedUser.role);
    setDraftSections(selectedUser.sections);
  }, [selectedUser]);

  function toggleSection(section: SectionId) {
    if (section === "home") return;
    setDraftSections((prev) =>
      prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section],
    );
  }

  async function saveUser() {
    if (!selectedUser) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: selectedUser.email, role: draftRole, sections: draftSections }),
      });
      const json = (await res.json()) as { ok?: boolean; user?: PublicUser; error?: string };
      if (!res.ok || !json.ok || !json.user) throw new Error(json.error ?? "Could not save user");
      setUsers((prev) => prev.map((u) => (u.email === json.user!.email ? json.user! : u)));
      setMessage(`Saved access for ${json.user.name}.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save user");
    } finally {
      setSaving(false);
    }
  }

  async function saveModules() {
    setModulesSaving(true);
    setModulesMessage(null);
    try {
      const res = await fetch("/api/admin/modules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabledModules }),
      });
      const json = (await res.json()) as ModulesResponse;
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not save modules");
      if (json.enabledModules) setEnabledModules(json.enabledModules);
      setModulesMessage("Module settings saved.");
    } catch (e) {
      setModulesMessage(e instanceof Error ? e.message : "Could not save modules");
    } finally {
      setModulesSaving(false);
    }
  }

  function toggleModule(moduleId: SectionId) {
    setEnabledModules((prev) =>
      prev.includes(moduleId) ? prev.filter((m) => m !== moduleId) : [...prev, moduleId],
    );
  }

  const canEditRole = currentRole === "global_admin";

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Admin Centre</h2>
          <p className="mt-0.5 text-sm text-txt-muted">Manage logins, roles, section access and modules.</p>
        </div>
        <button
          onClick={() => void (tab === "users" ? loadUsers() : loadModules())}
          disabled={tab === "users" ? loading : modulesLoading}
          className="rounded-lg border border-bg-line bg-bg-card p-2 text-txt-muted hover:text-txt-primary disabled:opacity-50"
          aria-label="Refresh"
        >
          <RefreshCw className={cn("h-4 w-4", (tab === "users" ? loading : modulesLoading) && "animate-spin")} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex rounded-lg overflow-hidden border border-bg-line w-fit">
        <button
          onClick={() => setTab("users")}
          className={cn(
            "px-5 py-2 text-sm font-medium transition",
            tab === "users" ? "bg-brand-purple text-white" : "text-txt-muted hover:bg-bg-elev",
          )}
        >
          Users
        </button>
        <button
          onClick={() => setTab("modules")}
          className={cn(
            "px-5 py-2 text-sm font-medium transition",
            tab === "modules" ? "bg-brand-purple text-white" : "text-txt-muted hover:bg-bg-elev",
          )}
        >
          Modules
        </button>
      </div>

      {/* ── Users tab ── */}
      {tab === "users" && (
        <>
          {message && (
            <div className="rounded-xl border border-bg-line bg-bg-card px-4 py-3 text-sm text-txt-secondary">
              {message}
            </div>
          )}
          <div className="grid grid-cols-[320px_1fr] gap-4">
            <div className="rounded-xl border border-bg-line bg-bg-card overflow-hidden">
              <div className="border-b border-bg-line px-5 py-4">
                <h3 className="text-sm font-semibold">Users</h3>
                <p className="mt-0.5 text-xs text-txt-muted">{users.length} local accounts</p>
              </div>
              <div className="divide-y divide-bg-line/60">
                {users.map((user) => (
                  <button
                    key={user.email}
                    onClick={() => setSelectedEmail(user.email)}
                    className={cn(
                      "w-full px-5 py-4 text-left transition hover:bg-bg-elev/50",
                      selectedUser?.email === user.email && "bg-bg-elev",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{user.name}</p>
                        <p className="truncate text-xs text-txt-muted">{user.email}</p>
                      </div>
                      {user.role === "global_admin" && <ShieldCheck className="h-4 w-4 shrink-0 text-brand-green" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-bg-line bg-bg-card p-5">
              {selectedUser ? (
                <div className="space-y-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold">{selectedUser.name}</h3>
                      <p className="mt-0.5 text-sm text-txt-muted">{selectedUser.email}</p>
                      <p className="mt-1 text-xs text-txt-muted">{selectedUser.title}</p>
                    </div>
                    <button
                      onClick={() => void saveUser()}
                      disabled={saving || (selectedUser.email === currentUserEmail && selectedUser.role === "global_admin")}
                      className="inline-flex items-center gap-2 rounded-lg bg-brand-purple px-4 py-2 text-sm font-semibold text-white hover:bg-brand-purple/90 disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      Save access
                    </button>
                  </div>

                  <div>
                    <label className="text-xs text-txt-muted">Role</label>
                    <select
                      value={draftRole}
                      onChange={(e) => setDraftRole(e.target.value as UserRole)}
                      disabled={!canEditRole || selectedUser.role === "global_admin"}
                      className="mt-1 w-full max-w-xs rounded-lg border border-bg-line bg-bg-elev px-3 py-2 text-sm outline-none focus:border-brand-purple disabled:opacity-60"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                      <option value="global_admin">Global Admin</option>
                    </select>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold">Visible Sections</h4>
                    <p className="mt-0.5 text-xs text-txt-muted">Home always stays enabled.</p>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      {SECTIONS.map((section) => {
                        const checked = draftSections.includes(section.id);
                        const disabled = section.id === "home" || selectedUser.role === "global_admin";
                        return (
                          <label
                            key={section.id}
                            className={cn(
                              "flex items-center gap-3 rounded-lg border border-bg-line bg-bg-elev/50 px-3 py-3 text-sm",
                              checked && "border-brand-purple/50 bg-brand-purple/10",
                              disabled && "opacity-70",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={() => toggleSection(section.id)}
                              className="h-4 w-4 accent-brand-purple"
                            />
                            <span>{section.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-20 text-center text-sm text-txt-muted">
                  No users yet. Create a login from the sign-in page.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Modules tab ── */}
      {tab === "modules" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-bg-line bg-bg-card p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold">Global modules</h3>
              <p className="mt-0.5 text-xs text-txt-muted">
                Toggle modules on or off for the entire app. Disabled modules are hidden from all users,
                regardless of their individual section access.
              </p>
            </div>

            {modulesMessage && (
              <div className="rounded-lg border border-bg-line bg-bg-elev px-4 py-2 text-sm text-txt-secondary">
                {modulesMessage}
              </div>
            )}

            <div className="space-y-3">
              {TOGGLEABLE_MODULES.map((moduleId) => {
                const enabled = enabledModules.includes(moduleId);
                return (
                  <div
                    key={moduleId}
                    className={cn(
                      "flex items-center justify-between gap-4 rounded-lg border px-5 py-4 transition",
                      enabled ? "border-brand-purple/30 bg-brand-purple/5" : "border-bg-line bg-bg-elev/40",
                    )}
                  >
                    <div>
                      <p className="text-sm font-semibold">{MODULE_LABELS[moduleId]}</p>
                      {MODULE_DESC[moduleId] && (
                        <p className="text-xs text-txt-muted mt-0.5">{MODULE_DESC[moduleId]}</p>
                      )}
                    </div>
                    <button
                      onClick={() => toggleModule(moduleId)}
                      disabled={currentRole !== "global_admin"}
                      className="shrink-0 text-txt-muted hover:text-txt-primary disabled:opacity-40 transition"
                      aria-label={enabled ? `Disable ${MODULE_LABELS[moduleId]}` : `Enable ${MODULE_LABELS[moduleId]}`}
                    >
                      {enabled ? (
                        <ToggleRight className="w-8 h-8 text-brand-purple" />
                      ) : (
                        <ToggleLeft className="w-8 h-8" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => void saveModules()}
              disabled={modulesSaving || currentRole !== "global_admin"}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-purple px-4 py-2 text-sm font-semibold text-white hover:bg-brand-purple/90 disabled:opacity-50 transition"
            >
              <Save className="h-4 w-4" />
              {modulesSaving ? "Saving…" : "Save module settings"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
