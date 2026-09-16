import { getTodayCalendarView, type CalendarEvent } from "@/lib/msgraph";

// Graph returns start/end as naive Central-time strings (see the
// comment on CalendarEvent in lib/msgraph.ts) — pull the hour/minute
// out directly instead of going through `new Date()`, which would
// misread them using the server's own timezone.
function formatTime(dateTimeStr: string): string {
  const match = dateTimeStr.match(/T(\d{2}):(\d{2})/);
  if (!match) return "";
  let hour = parseInt(match[1], 10);
  const minute = match[2];
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${ampm}`;
}

// Rendered inside a <Suspense> boundary in select-app/page.tsx, same
// reasoning as ItTicketCountCard: this is a Graph call over the
// network, so it streams in and replaces its skeleton rather than
// blocking the rest of the dashboard.
export default async function MyMeetingsCard({ email }: { email: string }) {
  let events: CalendarEvent[] = [];
  let connected = true;
  try {
    events = await getTodayCalendarView(email);
  } catch {
    connected = false;
  }

  if (!connected) {
    return (
      <div
        className="rounded-2xl p-5"
        style={{ border: "1px dashed var(--portal-line)", background: "rgba(255,255,255,0.5)" }}
      >
        <div className="text-sm font-bold mb-1">Today's Meetings</div>
        <div className="text-xs italic" style={{ color: "rgba(22,48,43,0.5)" }}>
          Not connected yet
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl bg-white p-5"
      style={{ border: "1px solid var(--portal-line)", boxShadow: "0 1px 2px rgba(22,48,43,0.04)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-bold">Today's Meetings</div>
        <a href="/calendar" className="text-xs font-semibold" style={{ color: "var(--portal-emerald)" }}>
          Full calendar
        </a>
      </div>
      {events.length === 0 ? (
        <p className="text-xs m-0" style={{ color: "rgba(22,48,43,0.5)" }}>
          Nothing on your calendar today.
        </p>
      ) : (
        <ul className="space-y-2.5 m-0 p-0" style={{ listStyle: "none" }}>
          {events.slice(0, 4).map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0">
                <div className="font-semibold truncate" style={{ color: "var(--portal-ink)" }}>
                  {e.subject}
                </div>
                <div style={{ color: "rgba(22,48,43,0.5)" }}>
                  {e.isAllDay ? "All day" : formatTime(e.start)}
                  {e.location ? ` · ${e.location}` : ""}
                </div>
              </div>
              {e.joinUrl && (
                <a
                  href={e.joinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-lg"
                  style={{ background: "var(--portal-emerald)", color: "#fff" }}
                >
                  Join
                </a>
              )}
            </li>
          ))}
          {events.length > 4 && (
            <li className="text-xs" style={{ color: "rgba(22,48,43,0.45)" }}>
              +{events.length - 4} more
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export function MyMeetingsSkeleton() {
  return (
    <div
      className="rounded-2xl p-5 animate-pulse"
      style={{ border: "1px dashed var(--portal-line)", background: "rgba(255,255,255,0.5)" }}
    >
      <div className="text-sm font-bold mb-3">Today's Meetings</div>
      <div className="text-xs" style={{ color: "rgba(22,48,43,0.4)" }}>

      </div>
    </div>
  );
}
