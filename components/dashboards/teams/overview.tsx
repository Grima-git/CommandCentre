"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, MessageCircle, Users, Video, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type TeamsChat = {
  id: string;
  topic?: string;
  chatType: "oneOnOne" | "group" | "meeting";
  lastUpdatedDateTime: string;
  lastMessagePreview?: {
    createdDateTime: string;
    isDeleted?: boolean;
    body?: { content: string };
    from?: { user?: { displayName: string } };
  };
  members?: { displayName: string; email?: string }[];
};

type ChatMessage = {
  id: string;
  createdDateTime: string;
  from: {
    user?: { displayName: string; id: string };
    application?: { displayName: string };
  } | null;
  body: { contentType: "text" | "html"; content: string };
  messageType: string;
  deletedDateTime: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function msgTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function msgDate(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function chatName(chat: TeamsChat, me: string) {
  if (chat.chatType === "oneOnOne" && chat.members?.length) {
    const other = chat.members.find((m) => m.displayName.toLowerCase() !== me.toLowerCase());
    return other?.displayName ?? chat.members[0]?.displayName ?? "Direct message";
  }
  return chat.topic ?? (chat.chatType === "meeting" ? "Meeting chat" : "Group chat");
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const AVATAR_COLOURS = [
  "bg-violet-600", "bg-blue-600", "bg-emerald-600", "bg-rose-600",
  "bg-amber-600", "bg-cyan-600", "bg-pink-600", "bg-indigo-600",
];
function avatarColour(name: string) {
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return AVATAR_COLOURS[Math.abs(hash) % AVATAR_COLOURS.length];
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MsSignIn() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center p-8">
      <div className="w-14 h-14 rounded-full bg-brand-purple/20 flex items-center justify-center">
        <svg className="w-7 h-7" viewBox="0 0 21 21" fill="none">
          <rect x="1" y="1" width="9" height="9" fill="#f25022" />
          <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
          <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
          <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
        </svg>
      </div>
      <div>
        <p className="text-txt-primary font-semibold mb-1">Sign in with Microsoft</p>
        <p className="text-txt-muted text-sm">Connect to view your Teams chats</p>
      </div>
      <a
        href="/api/auth/signin/microsoft-entra-id"
        className="bg-brand-purple hover:bg-brand-purple/90 text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
      >
        Sign in with Microsoft
      </a>
    </div>
  );
}

function ChatListSkeleton() {
  return (
    <div className="space-y-px">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
          <div className="w-9 h-9 rounded-full bg-bg-elev shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 bg-bg-elev rounded w-2/3" />
            <div className="h-3 bg-bg-elev rounded w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function MessageSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3 animate-pulse">
          <div className="w-8 h-8 rounded-full bg-bg-elev shrink-0 mt-1" />
          <div className="space-y-2 flex-1">
            <div className="h-3 bg-bg-elev rounded w-1/4" />
            <div className="h-3 bg-bg-elev rounded w-3/4" />
            <div className="h-3 bg-bg-elev rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL = 10_000; // 10 seconds

export default function TeamsOverview({ userName }: { userName: string }) {
  const [chats, setChats] = useState<TeamsChat[]>([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [chatsError, setChatsError] = useState<string | null>(null);

  const [selectedChat, setSelectedChat] = useState<TeamsChat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [msgsError, setMsgsError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Track whether the user has scrolled up — if so, don't auto-scroll on refresh
  const atBottomRef = useRef(true);
  const msgsPanelRef = useRef<HTMLDivElement>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchChats = useCallback(async (silent = false) => {
    if (!silent) setChatsLoading(true);
    setChatsError(null);
    try {
      const res = await fetch("/api/ms/teams");
      const data = (await res.json()) as { chats?: TeamsChat[]; error?: string };
      if (!res.ok) throw new Error(data?.error ?? `Error ${res.status}`);
      // Sort by last message time (preview), falling back to metadata time
      const sorted = (data.chats ?? []).sort((a, b) => {
        const tA = a.lastMessagePreview?.createdDateTime ?? a.lastUpdatedDateTime;
        const tB = b.lastMessagePreview?.createdDateTime ?? b.lastUpdatedDateTime;
        return new Date(tB).getTime() - new Date(tA).getTime();
      });
      setChats(sorted);
    } catch (e) {
      if (!silent) setChatsError(e instanceof Error ? e.message : "Failed to load Teams");
    } finally {
      if (!silent) setChatsLoading(false);
    }
  }, []);

  const fetchMessages = useCallback(async (chatId: string, silent = false) => {
    if (!silent) {
      setMsgsLoading(true);
      setMsgsError(null);
      setMessages([]);
    }
    try {
      const res = await fetch(`/api/ms/teams/messages?chatId=${encodeURIComponent(chatId)}`);
      const data = (await res.json()) as { messages?: ChatMessage[]; error?: string };
      if (!res.ok) throw new Error(data?.error ?? `Error ${res.status}`);
      setMessages(data.messages ?? []);
    } catch (e) {
      if (!silent) setMsgsError(e instanceof Error ? e.message : "Failed to load messages");
    } finally {
      if (!silent) setMsgsLoading(false);
    }
  }, []);

  // ── Initial load ───────────────────────────────────────────────────────────

  useEffect(() => { void fetchChats(); }, [fetchChats]);

  useEffect(() => {
    if (selectedChat) void fetchMessages(selectedChat.id);
  }, [selectedChat, fetchMessages]);

  // ── Auto-refresh every 10s ─────────────────────────────────────────────────

  useEffect(() => {
    const id = setInterval(() => {
      void fetchChats(true);
      if (selectedChat) void fetchMessages(selectedChat.id, true);
    }, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchChats, fetchMessages, selectedChat]);

  // ── Auto-scroll (only when at bottom) ──────────────────────────────────────

  useEffect(() => {
    if (!msgsLoading && atBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, msgsLoading]);

  const handleMsgScroll = useCallback(() => {
    const el = msgsPanelRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }, []);

  // ── Derived state ──────────────────────────────────────────────────────────

  const notMicrosoft = chatsError?.toLowerCase().includes("not signed in with microsoft");

  const messagesByDate: { date: string; messages: ChatMessage[] }[] = [];
  for (const msg of messages) {
    if (msg.messageType !== "message" || msg.deletedDateTime) continue;
    const date = msgDate(msg.createdDateTime);
    const last = messagesByDate[messagesByDate.length - 1];
    if (last?.date === date) {
      last.messages.push(msg);
    } else {
      messagesByDate.push({ date, messages: [msg] });
    }
  }

  if (notMicrosoft) return <MsSignIn />;

  return (
    // flex-1 min-h-0 so this fills the remaining viewport height without growing the page
    <div className="flex flex-1 min-h-0 overflow-hidden">

      {/* ── Chat list ──────────────────────────────────────────────────────── */}
      <div
        className={cn(
          "flex flex-col border-r border-bg-line bg-bg-panel",
          // On mobile: full width when no chat selected, hidden when chat open
          // On desktop (lg): always show as fixed 288px sidebar
          selectedChat
            ? "hidden lg:flex lg:w-72 lg:shrink-0"
            : "flex w-full lg:w-72 lg:flex-none lg:shrink-0",
        )}
      >
        {/* List header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-bg-line shrink-0">
          <span className="text-sm font-semibold">Recent chats</span>
          <button
            onClick={() => void fetchChats()}
            disabled={chatsLoading}
            className="p-1 rounded hover:bg-bg-elev text-txt-muted disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", chatsLoading && "animate-spin")} />
          </button>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto">
          {chatsLoading ? (
            <ChatListSkeleton />
          ) : chatsError ? (
            <p className="p-4 text-sm text-brand-red">{chatsError}</p>
          ) : chats.length === 0 ? (
            <p className="p-4 text-sm text-txt-muted text-center">No recent chats</p>
          ) : (
            chats.map((chat) => {
              const name = chatName(chat, userName);
              const Icon =
                chat.chatType === "oneOnOne"
                  ? MessageCircle
                  : chat.chatType === "meeting"
                  ? Video
                  : Users;
              const memberCount =
                chat.chatType !== "oneOnOne" && chat.members ? chat.members.length : null;
              const isActive = selectedChat?.id === chat.id;

              // Use last message time if available, otherwise chat metadata time
              const lastTime =
                chat.lastMessagePreview?.createdDateTime ?? chat.lastUpdatedDateTime;
              // Preview text: sender + message snippet
              const previewSender = chat.lastMessagePreview?.from?.user?.displayName;
              const previewBody = chat.lastMessagePreview?.body?.content
                ? stripHtml(chat.lastMessagePreview.body.content).slice(0, 60)
                : null;
              const previewText = previewBody
                ? previewSender
                  ? `${previewSender.split(" ")[0]}: ${previewBody}`
                  : previewBody
                : chat.chatType === "oneOnOne"
                ? "Direct message"
                : chat.chatType === "meeting"
                ? "Meeting chat"
                : `Group chat${memberCount !== null ? ` · ${memberCount} members` : ""}`;

              return (
                <button
                  key={chat.id}
                  onClick={() => {
                    atBottomRef.current = true;
                    setSelectedChat(chat);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 text-left transition hover:bg-bg-elev",
                    isActive && "bg-bg-elev border-l-2 border-brand-purple",
                  )}
                >
                  <div
                    className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white",
                      avatarColour(name),
                    )}
                  >
                    {chat.chatType === "oneOnOne" ? (
                      initials(name)
                    ) : (
                      <Icon className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="text-sm font-medium truncate">{name}</span>
                      <span className="text-[11px] text-txt-muted shrink-0">
                        {relTime(lastTime)}
                      </span>
                    </div>
                    <p className="text-xs text-txt-muted truncate">{previewText}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Messages panel ─────────────────────────────────────────────────── */}
      {selectedChat ? (
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          {/* Panel header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-bg-line shrink-0">
            <button
              onClick={() => setSelectedChat(null)}
              className="lg:hidden p-1 rounded hover:bg-bg-elev text-txt-muted"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0",
                avatarColour(chatName(selectedChat, userName)),
              )}
            >
              {selectedChat.chatType === "oneOnOne" ? (
                initials(chatName(selectedChat, userName))
              ) : selectedChat.chatType === "meeting" ? (
                <Video className="w-4 h-4" />
              ) : (
                <Users className="w-4 h-4" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">
                {chatName(selectedChat, userName)}
              </p>
              <p className="text-xs text-txt-muted">
                {selectedChat.chatType === "oneOnOne"
                  ? "Direct message"
                  : `${selectedChat.members?.length ?? 0} members`}
              </p>
            </div>
            <button
              onClick={() => void fetchMessages(selectedChat.id)}
              disabled={msgsLoading}
              className="p-1 rounded hover:bg-bg-elev text-txt-muted disabled:opacity-50"
              title="Refresh messages"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", msgsLoading && "animate-spin")} />
            </button>
          </div>

          {/* Scrollable messages — flex-1 + overflow-y-auto keeps it bounded */}
          <div
            ref={msgsPanelRef}
            onScroll={handleMsgScroll}
            className="flex-1 overflow-y-auto p-4 space-y-1 min-h-0"
          >
            {msgsLoading ? (
              <MessageSkeleton />
            ) : msgsError ? (
              <p className="text-sm text-brand-red p-2">{msgsError}</p>
            ) : messagesByDate.length === 0 ? (
              <p className="text-sm text-txt-muted text-center py-8">No messages to show</p>
            ) : (
              messagesByDate.map(({ date, messages: dayMsgs }) => (
                <div key={date}>
                  {/* Date divider */}
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-bg-line" />
                    <span className="text-[11px] text-txt-muted font-medium">{date}</span>
                    <div className="flex-1 h-px bg-bg-line" />
                  </div>

                  <div className="space-y-0.5">
                    {dayMsgs.map((msg, i) => {
                      const senderName =
                        msg.from?.user?.displayName ??
                        msg.from?.application?.displayName ??
                        "Unknown";
                      const senderId =
                        msg.from?.user?.id ??
                        msg.from?.application?.displayName ??
                        senderName;
                      const content = stripHtml(msg.body.content);
                      if (!content) return null;

                      // Group with previous if same sender within 5 minutes
                      const prev = dayMsgs
                        .slice(0, i)
                        .reverse()
                        .find((m) => m.messageType === "message" && !m.deletedDateTime && stripHtml(m.body.content));
                      const prevSenderId =
                        prev?.from?.user?.id ??
                        prev?.from?.application?.displayName ??
                        prev?.from?.user?.displayName;
                      const timeDiff = prev
                        ? new Date(msg.createdDateTime).getTime() -
                          new Date(prev.createdDateTime).getTime()
                        : Infinity;
                      const isContinuation =
                        prevSenderId === senderId && timeDiff < 5 * 60 * 1000;

                      return (
                        <div
                          key={msg.id}
                          className={cn("flex gap-3", isContinuation ? "mt-0.5" : "mt-4")}
                        >
                          {/* Avatar column — avatar on first, spacer on continuation */}
                          <div className="w-9 shrink-0">
                            {!isContinuation && (
                              <div
                                className={cn(
                                  "w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white",
                                  avatarColour(senderName),
                                )}
                              >
                                {initials(senderName)}
                              </div>
                            )}
                          </div>

                          {/* Message content */}
                          <div className="flex-1 min-w-0">
                            {/* Name + time header — first message only */}
                            {!isContinuation && (
                              <div className="flex items-baseline gap-2 mb-1">
                                <span className="text-xs font-semibold text-txt-primary">
                                  {senderName}
                                </span>
                                <span className="text-[11px] text-txt-muted">
                                  {msgTime(msg.createdDateTime)}
                                </span>
                              </div>
                            )}

                            {/* Bubble card */}
                            <div className="group relative">
                              <div className="bg-bg-elev rounded-2xl px-4 py-2.5">
                                <p className="text-sm text-txt-secondary whitespace-pre-wrap break-words leading-relaxed">
                                  {content}
                                </p>
                              </div>
                              {/* Hover timestamp for continuation messages */}
                              {isContinuation && (
                                <span className="absolute -left-14 top-1/2 -translate-y-1/2 text-[10px] text-txt-muted opacity-0 group-hover:opacity-100 transition-opacity select-none pointer-events-none">
                                  {msgTime(msg.createdDateTime)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      ) : (
        <div className="hidden lg:flex flex-1 items-center justify-center">
          <div className="text-center">
            <MessageCircle className="w-10 h-10 text-txt-muted mx-auto mb-3" />
            <p className="text-sm font-medium text-txt-secondary">
              Select a chat to read messages
            </p>
            <p className="text-xs text-txt-muted mt-1">Click any conversation on the left</p>
          </div>
        </div>
      )}
    </div>
  );
}
