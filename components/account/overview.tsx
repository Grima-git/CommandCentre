"use client";

import { signOut } from "next-auth/react";
import { LogOut, Mail, Shield, ShieldCheck, User, Wifi, WifiOff } from "lucide-react";
import { SECTIONS, type SectionId, type UserRole } from "@/lib/access-control";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  email: string;
  title: string;
  role: UserRole;
  sections: SectionId[];
  msConnected: boolean;
};

const ROLE_LABEL: Record<UserRole, string> = {
  global_admin: "Global Admin",
  admin: "Admin",
  user: "User",
};

const ROLE_COLOUR: Record<UserRole, string> = {
  global_admin: "text-brand-green border-brand-green/30 bg-brand-green/10",
  admin: "text-brand-purple border-brand-purple/30 bg-brand-purple/10",
  user: "text-txt-secondary border-bg-line bg-bg-elev",
};

export function AccountOverview({ name, email, title, role, sections, msConnected }: Props) {
  const allowedSections = new Set(sections);
  const visibleSections = SECTIONS.filter(
    (s) => s.id !== "admin" && s.id !== "account" && s.id !== "notifications" && s.id !== "settings",
  );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">Account</h2>
        <p className="mt-0.5 text-sm text-txt-muted">Your profile and access information.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Profile card */}
        <div className="rounded-xl border border-bg-line bg-bg-card p-6 space-y-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-grad-blue flex items-center justify-center text-xl font-bold shrink-0">
              {name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold truncate">{name}</p>
              <p className="text-sm text-txt-muted truncate">{title}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Mail className="w-4 h-4 text-txt-muted shrink-0" />
              <span className="text-txt-secondary truncate">{email}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <ShieldCheck className="w-4 h-4 text-txt-muted shrink-0" />
              <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold", ROLE_COLOUR[role])}>
                {ROLE_LABEL[role]}
              </span>
            </div>
          </div>
        </div>

        {/* Microsoft 365 connection */}
        <div className="rounded-xl border border-bg-line bg-bg-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 21 21" fill="none">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            <h3 className="text-sm font-semibold">Microsoft 365</h3>
          </div>

          {msConnected ? (
            <div className="flex items-start gap-3 rounded-lg border border-brand-green/20 bg-brand-green/5 px-4 py-3">
              <Wifi className="w-4 h-4 text-brand-green mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-brand-green">Connected</p>
                <p className="text-xs text-txt-muted mt-0.5">Email, Calendar and Teams are available.</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-lg border border-bg-line bg-bg-elev px-4 py-3">
              <WifiOff className="w-4 h-4 text-txt-muted mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-txt-secondary">Not connected</p>
                <p className="text-xs text-txt-muted mt-0.5">
                  Sign in with Microsoft to unlock Email, Calendar and Teams.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Accessible sections */}
      <div className="rounded-xl border border-bg-line bg-bg-card p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Your access</h3>
          <p className="mt-0.5 text-xs text-txt-muted">Sections visible to you in Command Centre.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {visibleSections.map((section) => {
            const Icon = section.icon;
            const enabled = role === "global_admin" || allowedSections.has(section.id);
            return (
              <div
                key={section.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-3 py-3 text-sm",
                  enabled
                    ? "border-brand-purple/30 bg-brand-purple/5 text-txt-primary"
                    : "border-bg-line bg-bg-elev/30 text-txt-muted opacity-50",
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{section.label}</span>
                {enabled && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-green shrink-0" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Sign out */}
      <div className="rounded-xl border border-bg-line bg-bg-card p-6">
        <h3 className="text-sm font-semibold mb-1">Session</h3>
        <p className="text-xs text-txt-muted mb-4">Signing out will return you to the login page.</p>
        <button
          onClick={() => void signOut({ callbackUrl: "/login" })}
          className="inline-flex items-center gap-2 rounded-lg border border-brand-red/30 bg-brand-red/10 px-4 py-2 text-sm font-semibold text-brand-red hover:bg-brand-red/20 transition"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}
