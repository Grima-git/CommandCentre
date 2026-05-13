"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, MapPin, Users, Video } from "lucide-react";

type CalendarEvent = {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location: { displayName: string };
  attendees: { emailAddress: { name: string; address: string }; status: { response: string } }[];
  isOnlineMeeting: boolean;
  onlineMeeting?: { joinUrl: string };
  organizer: { emailAddress: { name: string; address: string } };
  bodyPreview: string;
  webLink: string;
  isAllDay: boolean;
};

function fmtTime(s: string, e: string) {
  const fmt = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${fmt(new Date(s))} – ${fmt(new Date(e))}`;
}

function dayLabel(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date(); today.setHours(0,0,0,0);
  const tom = new Date(today); tom.setDate(today.getDate() + 1);
  const evDay = new Date(d); evDay.setHours(0,0,0,0);
  if (evDay.getTime() === today.getTime()) return "Today";
  if (evDay.getTime() === tom.getTime()) return "Tomorrow";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
}

function groupByDay(events: CalendarEvent[]) {
  const m = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const lbl = dayLabel(ev.start.dateTime);
    if (!m.has(lbl)) m.set(lbl, []);
    m.get(lbl)!.push(ev);
  }
  return m;
}

function Skeleton() {
  return (
    <div className="space-y-4">
      {[0,1].map(g => (
        <div key={g}>
          <div className="h-4 bg-[#2a2d3a] rounded w-24 mb-3 animate-pulse" />
          {[0,1].map(i => (
            <div key={i} className="bg-[#1a1d27] rounded-lg p-4 mb-2 animate-pulse">
              <div className="h-3 bg-[#2a2d3a] rounded w-24 mb-2" />
              <div className="h-4 bg-[#2a2d3a] rounded w-1/2" />
            </div>
          ))}
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
      <a href="/api/auth/signin/microsoft-entra-id" className="bg-[#7c3aed] hover:bg-[#6d28d9] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
        Sign in with Microsoft
      </a>
    </div>
  );
}

export default function CalendarOverview({ userName }: { userName: string }) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/ms/calendar");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Error ${res.status}`);
      setEvents(data.events ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load calendar");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const notMicrosoft = error?.toLowerCase().includes("not signed in with microsoft");
  const grouped = groupByDay(events);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white text-lg font-semibold">Calendar</h2>
          <p className="text-gray-500 text-xs">Next 7 days</p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors disabled:opacity-50 px-2 py-1 rounded hover:bg-[#1a1d27]">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading ? <Skeleton />
        : notMicrosoft ? <MsSignIn context="calendar" />
        : error ? <div className="bg-[#1a1d27] rounded-lg p-4 text-red-400 text-sm">{error}</div>
        : events.length === 0 ? (
          <div className="bg-[#1a1d27] rounded-lg p-8 text-center text-gray-400 text-sm">
            No upcoming events in the next 7 days
          </div>
        ) : (
          <div className="space-y-5">
            {Array.from(grouped.entries()).map(([lbl, dayEvents]) => (
              <div key={lbl}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{lbl}</span>
                  <div className="flex-1 h-px bg-[#2a2d3a]" />
                </div>
                <div className="space-y-2">
                  {dayEvents.map(ev => (
                    <button key={ev.id} onClick={() => window.open(ev.webLink, "_blank", "noopener,noreferrer")}
                      className="w-full text-left bg-[#1a1d27] hover:bg-[#21253a] rounded-lg p-4 transition-colors border border-transparent hover:border-[#7c3aed]/20">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="text-xs text-[#7c3aed] font-medium">
                          {ev.isAllDay ? "All day" : fmtTime(ev.start.dateTime, ev.end.dateTime)}
                        </span>
                        {ev.attendees?.length > 0 && (
                          <div className="flex items-center gap-1 text-gray-500 text-xs flex-shrink-0">
                            <Users className="w-3 h-3" />{ev.attendees.length}
                          </div>
                        )}
                      </div>
                      <p className="text-white text-sm font-semibold mb-2">{ev.subject || "(No title)"}</p>
                      <div className="flex items-center gap-3 flex-wrap">
                        {ev.isOnlineMeeting && ev.onlineMeeting?.joinUrl ? (
                          <a href={ev.onlineMeeting.joinUrl} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="flex items-center gap-1 bg-green-600/20 hover:bg-green-600/30 text-green-400 text-xs font-medium px-2 py-1 rounded transition-colors">
                            <Video className="w-3 h-3" />Join
                          </a>
                        ) : ev.location?.displayName ? (
                          <div className="flex items-center gap-1 text-gray-400 text-xs">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate max-w-[200px]">{ev.location.displayName}</span>
                          </div>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
