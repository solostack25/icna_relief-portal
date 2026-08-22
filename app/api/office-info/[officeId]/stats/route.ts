import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Powers the office dashboard's stat cards. Auth-gated (not public like
// /api/office-info) since it surfaces internal operational data, not
// public-facing content. Access is enforced here explicitly rather than
// relying only on RLS, since several of the underlying tables (helpdesk,
// finance) aren't office-scoped at the RLS level at all — they're
// scoped here in application code by joining through the submitter's
// assigned_office_id.
export async function GET(request: NextRequest, { params }: { params: Promise<{ officeId: string }> }) {
  const { officeId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase.from("employees").select("role, assigned_office_id").eq("auth_user_id", user.id).single();
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const allowed = me.role === "admin" || (me.role === "area_manager" && me.assigned_office_id === officeId);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);

  // Employees at this office, used to scope helpdesk/finance requests
  // which aren't directly office-tagged - they're tagged by submitter.
  const { data: officeEmployees } = await supabase.from("employees").select("email").eq("assigned_office_id", officeId);
  const officeEmails = (officeEmployees ?? []).map((e) => e.email?.toLowerCase()).filter(Boolean) as string[];

  const [openTickets, upcomingEventsRaw, fundraisersRaw, clientStats, backpackStats, financeRaw] = await Promise.all([
    // 1. Open help desk tickets submitted by anyone at this office
    officeEmails.length > 0
      ? supabase
          .from("helpdesk_requests")
          .select("id, title, created_at, submitted_by", { count: "exact" })
          .eq("overall_status", "open")
          .in("submitted_by_email", officeEmails)
          .order("created_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [], count: 0 }),

    // 2. Upcoming volunteer events for this office
    supabase
      .from("volunteer_events")
      .select("id, title, starts_on, ends_on, slug")
      .eq("office_id", officeId)
      .eq("is_published", true)
      .gte("starts_on", today)
      .order("starts_on", { ascending: true })
      .limit(10),

    // 3. Active (published) fundraisers for this office
    supabase
      .from("fundraisers")
      .select("id, title, goal, is_published, approval_status")
      .eq("office_id", officeId)
      .eq("is_published", true)
      .order("created_at", { ascending: false }),

    // 4. Client intake activity - total + new this month
    supabase.from("clients").select("id, registration_date", { count: "exact" }).eq("office_id", officeId),

    // 5. Backpack distributions this school year, joined through clients for office scope
    supabase
      .from("b2s_client_distributions")
      .select("backpacks_distributed, eligible_children_count, clients!inner(office_id)")
      .eq("clients.office_id", officeId),

    // 6. Finance approvals pending, submitted by this office (via helpdesk_requests join)
    officeEmails.length > 0
      ? supabase
          .from("finance_approval_requests")
          .select("id, amount, status, created_at, helpdesk_requests!inner(submitted_by_email, title)")
          .eq("status", "pending")
          .in("helpdesk_requests.submitted_by_email", officeEmails)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  // Volunteer signup counts per event (via slots)
  const eventIds = (upcomingEventsRaw.data ?? []).map((e) => e.id);
  let signupsByEvent: Record<string, number> = {};
  if (eventIds.length > 0) {
    const { data: slots } = await supabase.from("volunteer_slots").select("id, event_id, capacity").in("event_id", eventIds);
    const slotIds = (slots ?? []).map((s) => s.id);
    const slotToEvent = Object.fromEntries((slots ?? []).map((s) => [s.id, s.event_id]));
    if (slotIds.length > 0) {
      const { data: signups } = await supabase.from("volunteer_signups").select("slot_id, qty").in("slot_id", slotIds);
      for (const s of signups ?? []) {
        const eventId = slotToEvent[s.slot_id];
        if (!eventId) continue;
        signupsByEvent[eventId] = (signupsByEvent[eventId] ?? 0) + (s.qty ?? 1);
      }
    }
  }

  // Raised amount per fundraiser
  const fundraiserIds = (fundraisersRaw.data ?? []).map((f) => f.id);
  let raisedByFundraiser: Record<string, number> = {};
  if (fundraiserIds.length > 0) {
    const { data: donationEvents } = await supabase
      .from("charitystack_donation_events")
      .select("fundraiser_id, amount, status")
      .in("fundraiser_id", fundraiserIds)
      .eq("status", "succeeded");
    for (const d of donationEvents ?? []) {
      raisedByFundraiser[d.fundraiser_id] = (raisedByFundraiser[d.fundraiser_id] ?? 0) + Number(d.amount ?? 0);
    }
  }

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const newClientsThisMonth = (clientStats.data ?? []).filter(
    (c) => c.registration_date && new Date(c.registration_date) >= monthStart
  ).length;

  const backpacksThisYear = (backpackStats.data ?? []).reduce((sum, row) => sum + (row.backpacks_distributed ?? 0), 0);

  return NextResponse.json({
    helpdesk: {
      open_count: openTickets.count ?? (openTickets.data ?? []).length,
      recent: (openTickets.data ?? []).map((t) => ({ id: t.id, title: t.title, created_at: t.created_at, submitted_by: t.submitted_by })),
    },
    volunteer: {
      upcoming_events: (upcomingEventsRaw.data ?? []).map((e) => ({
        id: e.id,
        title: e.title,
        starts_on: e.starts_on,
        ends_on: e.ends_on,
        slug: e.slug,
        signups: signupsByEvent[e.id] ?? 0,
      })),
    },
    fundraisers: {
      active: (fundraisersRaw.data ?? []).map((f) => ({
        id: f.id,
        title: f.title,
        goal: f.goal,
        raised: raisedByFundraiser[f.id] ?? 0,
      })),
      total_raised: Object.values(raisedByFundraiser).reduce((a, b) => a + b, 0),
    },
    clients: {
      total_active: clientStats.count ?? (clientStats.data ?? []).length,
      new_this_month: newClientsThisMonth,
      backpacks_distributed_this_year: backpacksThisYear,
    },
    finance: {
      pending_count: (financeRaw.data ?? []).length,
      pending_total: (financeRaw.data ?? []).reduce((sum: number, r: any) => sum + Number(r.amount ?? 0), 0),
      recent: (financeRaw.data ?? []).slice(0, 5).map((r: any) => ({
        id: r.id,
        amount: r.amount,
        title: r.helpdesk_requests?.title ?? null,
        created_at: r.created_at,
      })),
    },
  });
}
