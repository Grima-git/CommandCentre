"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, MessageCircle, Users, Video } from "lucide-react";

type TeamsChat = {
  id: string;
  topic?: string;
  chatType: "oneOnOne" | "group" | "meeting";
  lastUpdatedDateTime: string;
  members?: { displayName: string; email?: string }[];
};

function relTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function chatName(chat: TeamsChat, me: string) {
  if (chat.chatType === "oneOnOne" && chat.members?.length) {
    const other = chat.members.find(m => m.displayName.toLowerCase() !== me.toLowerCase());
    return other?.displayName ?? chat.members[0]?.displayName ?? "Unknown";
  }
  return chat.topic ?? (chat.chatType === "meeting" ? "Meeting chat" : "Group chat");
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
      <a href="/api/auth/signin/microsoft-entra-id" className="bg-[#7c3aed] hover:bg-[#6d28d9] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
        Sign in with Microsoft
      </a>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2">
      {[0,1,2,3].map(i => (
        <div key={i} className="bg-[#1a1d27] rounded-lg p-4 animate-pulse flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#2a2d3a] flex-shrink-0" />
          <div className="flex-1">
            <div className="flex justify-between mb-2">
              <div className="h-4 bg-[#2a2d3a] rounded w-1/3" />
              <div className="h-3 bg-[#2a2d3a] rounded w-12" />
            </div>
            <div className="h-3 bg-[#2a2d3a] rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TeamsOverview({ userName }: { userName: string }) {
  const [chats, setChats] = useState<TeamsChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/ms/teams");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Error ${res.status}`);
      setChats(data.chats ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Teams");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const notMicrosoft = error?.toLowerCase().includes("not signed in with microsoft");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white text-lg font-semibold">Teams</h2>
          <p className="text-gray-500 text-xs">Recent chats</p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors disabled:opacity-50 px-2 py-1 rounded hover:bg-[#1a1d27]">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading ? <Skeleton />
        : notMicrosoft ? <MsSignIn context="Teams chats" />
        : error ? <div className="bg-[#1a1d27] rounded-lg p-4 text-red-400 text-sm">{error}</div>
        : chats.length === 0 ? (
          <div className="bg-[#1a1d27] rounded-lg p-8 text-center text-gray-400 text-sm">No recent chats</div>
        ) : (
          <div className="space-y-2">
            {chats.map(chat => {
              const name = chatName(chat, userName);
              const Icon = chat.chatType === "oneOnOne" ? MessageCircle : chat.chatType === "meeting" ? Video : Users;
              const memberCount = chat.chatType !== "oneOnOne" && chat.members ? chat.members.length : null;
              return (
                <button key={chat.id}
                  onClick={() => window.open("https://teams.microsoft.com", "_blank", "noopener,noreferrer")}
                  className="w-full text-left bg-[#1a1d27] hover:bg-[#21253a] rounded-lg p-4 transition-colors border border-transparent hover:border-[#7c3aed]/20">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#7c3aed]/20 flex items-center justify-center text-[#7c3aed] flex-shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-white text-sm font-semibold truncate">{name}</span>
                        <span className="text-gray-500 text-xs flex-shrink-0">{relTime(chat.lastUpdatedDateTime)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 text-xs">
                          {chat.chatType === "oneOnOne" ? "Direct message" : chat.chatType === "meeting" ? "Meeting chat" : "Group chat"}
                        </span>
                        {memberCount !== null && (
                          <span className="text-gray-600 text-xs flex items-center gap-0.5">
                            <Users className="w-3 h-3" />{memberCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
    </div>
  );
}
