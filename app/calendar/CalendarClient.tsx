"use client";

import { useCallback, useEffect, useState } from "react";

type CalendarEvent = {
  id: string;
  subject: string;
  start: string;
  end: string;
  isAllDay: boolean;
  isOnlineMeeting: boolean;
  joinUrl: string | null;
  location: string | null;
  organizerName: string | null;
};

function centralDateString(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(d);
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`); // noon avoids DST-edge date rollover
  d.setDate(d.getDate() + days);
  return centralDateString(d);
}

function dayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// Graph returns naive Central-time strings — pull hour/minute directly
// rather than going through `new Date()` (see lib/msgraph.ts).
function formatTime(dateTimeStr: string): string {
  const match = dateTimeStr.match(/T(\d{2}):(\d{2})/);
  if (!match) return "";
  let hour = parseInt(match[1], 10);
  const minute = match[2];
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${ampm}`;
}

function sundayOfWeek(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return addDaysToDateStr(dateStr, -d.getDay());
}

export default function CalendarClient() {
  const [weekStart, setWeekStart] = useState<string>(() => sundayOfWeek(centralDateString(new Date())));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (start: string) => {
    setLoading(true);
    const end = addDaysToDateStr(start, 7);
    try {
      const res = await fetch(`/api/me/calendar?start=${start}T00:00:00&end=${end}T00:00:00`);
      const data = await res.json();
      setEvents(data.events ?? []);
      setError(data.error ?? null);
    } catch {
      setEvents([]);
      setError("Could not load calendar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(weekStart);
  }, [weekStart, load]);

  const days = Array.from({ length: 7 }, (_, i) => addDaysToDateStr(weekStart, i));
  const todayStr = centralDateString(new Date());

  const eventsByDay: Record<string, CalendarEvent[]> = {};
  for (const day of days) eventsByDay[day] = [];
  for (const e of events) {
    const day = e.start.slice(0, 10);
    if (eventsByDay[day]) eventsByDay[day].push(e);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => setWeekStart((w) => addDaysToDateStr(w, -7))}
          className="text-sm px-3 py-1.5 rounded-lg"
          style={{ border: "1px solid var(--portal-line)", background: "#fff" }}
        >
          ← Previous week
        </button>
        <div className="text-sm font-semibold">
          {dayLabel(days[0])} – {dayLabel(days[6])}
        </div>
        <button
          onClick={() => setWeekStart((w) => addDaysToDateStr(w, 7))}
          className="text-sm px-3 py-1.5 rounded-lg"
          style={{ border: "1px solid var(--portal-line)", background: "#fff" }}
        >
          Next week →
        </button>
      </div>

      {error && (
        <p className="text-xs mb-4" style={{ color: "#b55139" }}>
          Calendar isn't connected yet ({error}). Contact an admin.
        </p>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
          Loading…
        </p>
      ) : (
        <div className="space-y-4">
          {days.map((day) => (
            <div
              key={day}
              className="rounded-2xl bg-white p-4"
              style={{
                border: day === todayStr ? "1.5px solid var(--portal-emerald)" : "1px solid var(--portal-line)",
              }}
            >
              <div
                className="text-xs font-bold mb-2"
                style={{ color: day === todayStr ? "var(--portal-emerald)" : "var(--portal-ink)" }}
              >
                {dayLabel(day)}
                {day === todayStr ? " · Today" : ""}
              </div>
              {eventsByDay[day].length === 0 ? (
                <p className="text-xs m-0" style={{ color: "rgba(22,48,43,0.4)" }}>
                  No meetings
                </p>
              ) : (
                <ul className="space-y-2 m-0 p-0" style={{ listStyle: "none" }}>
                  {eventsByDay[day].map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{e.subject}</div>
                        <div className="text-xs" style={{ color: "rgba(22,48,43,0.5)" }}>
                          {e.isAllDay ? "All day" : `${formatTime(e.start)} – ${formatTime(e.end)}`}
                          {e.location ? ` · ${e.location}` : ""}
                          {e.organizerName ? ` · ${e.organizerName}` : ""}
                        </div>
                      </div>
                      {e.joinUrl && (
                        <a
                          href={e.joinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg"
                          style={{ background: "var(--portal-emerald)", color: "#fff" }}
                        >
                          Join
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
