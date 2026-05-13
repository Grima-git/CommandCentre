"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Paperclip, Circle } from "lucide-react";

type MailMessage = {
  id: string;
  subject: string;
  from: { emailAddress: { name: string; address: string } };
  receivedDateTime: string;
  bodyPreview: string;
  isRead: boolean;
  importance: string;
  hasAttachments: boolean;
  webLink: string;
};

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - 6);
  if (date >= startOfToday)
    return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (date >= startOfWeek)
    return date.toLocaleDateString("en-GB", { weekday: "short" });
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" });
}

function Skeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-[#1a1d27] rounded-lg p-4 animate-pulse">
          <div className="flex justify-between mb-2">
            <div className="h-4 bg-[#2a2d3a] rounded w-1/3" />
            <div className="h-4 bg-[#2a2d3a] rounded w-16" />
          </div>
          <div className="h-4 bg-[#2a2d3a] rounded w-2/3 mb-2" />
          <div className="h-3 bg-[#2a2d3a] rounded w-full" />
        </div>
      ))}
    </div>
  );
}

function MsSignIn({ context }: { context: string }) {
  return (
    <div className="bg-[#1a1d27] rounded-lg p-6 flex flex-col items-center gap-4 text-center">
      <div className="w-12 h-12 rounded-full bg-[#7c3aed]/20 flex items-center justify-center">
        <svg className="w-6 h-6" viewBox="0 0 21 21" fill="none">
          <rect x="1" y="1" width="9" height="9" fill="#f25022" />
          <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
          <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
          <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
        </svg>
      </div>
      <div>
        <p className="text-white font-medium mb-1">Sign in with Microsoft</p>
        <p className="text-gray-400 text-sm">Connect your account to view your {context}</p>
      </div>
      <a
        href="/api/auth/signin/microsoft-entra-id"
        className="bg-[#7c3aed] hover:bg-[#6d28d9] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
      >
        Sign in with Microsoft
      </a>
    </div>
  );
}

export default function EmailOverview({ userName }: { userName: string }) {
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ms/mail");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Error ${res.status}`);
      setMessages(data.messages ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inbox");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const unread = messages.filter((m) => !m.isRead).length;
  const notMicrosoft = error?.toLowerCase().includes("not signed in with microsoft");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-white text-lg font-semibold">Inbox</h2>
          {unread > 0 && (
            <span className="bg-[#7c3aed] text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {unread}
            </span>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors disabled:opacity-50 px-2 py-1 rounded hover:bg-[#1a1d27]"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <Skeleton />
      ) : notMicrosoft ? (
        <MsSignIn context="inbox" />
      ) : error ? (
        <div className="bg-[#1a1d27] rounded-lg p-4 text-red-400 text-sm">{error}</div>
      ) : messages.length === 0 ? (
        <div className="bg-[#1a1d27] rounded-lg p-8 text-center text-gray-400 text-sm">
          Your inbox is empty
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map((msg) => (
            <button
              key={msg.id}
              onClick={() => window.open(msg.webLink, "_blank", "noopener,noreferrer")}
              className={`w-full text-left bg-[#1a1d27] hover:bg-[#21253a] rounded-lg p-4 transition-colors border ${
                msg.isRead ? "border-transparent" : "border-[#7c3aed]/30"
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  {!msg.isRead && (
                    <Circle className="w-2 h-2 text-blue-400 fill-blue-400 flex-shrink-0" />
                  )}
                  <span className={`text-sm truncate ${msg.isRead ? "text-gray-300" : "text-white font-semibold"}`}>
                    {msg.from.emailAddress.name || msg.from.emailAddress.address}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {msg.importance === "high" && (
                    <Circle className="w-2 h-2 text-red-400 fill-red-400" />
                  )}
                  {msg.hasAttachments && <Paperclip className="w-3 h-3 text-gray-400" />}
                  <span className="text-xs text-gray-500">{formatTime(msg.receivedDateTime)}</span>
                </div>
              </div>
              <p className={`text-sm mb-1 truncate ${msg.isRead ? "text-gray-300" : "text-white"}`}>
                {msg.subject || "(No subject)"}
              </p>
              <p className="text-xs text-gray-400 truncate">{msg.bodyPreview}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
