import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getMarketingContactsAccess } from "@/lib/marketingContactsAccess";

// CSV import for the Contacts platform (Pardot replacement path).
// The client does the CSV parsing + column mapping UI; this route
// receives already-mapped rows so it stays format-agnostic and easy
// to test. Dedup key is email (case-insensitive) - matches the
// partial unique index on contacts.email. Rows with no email are
// still created (phone-only contacts are valid) but can never be
// matched against a future import, so those always land as "created".

type MappedRow = {
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  tags?: string[]; // e.g. from a static "apply this tag to everyone in this import" option
  fields?: Record<string, string>; // leftover columns that don't map to a fixed field
};

type ImportBody = {
  filename: string;
  columnMapping: Record<string, string>;
  rows: MappedRow[];
  applyTags?: string[]; // tags applied to every contact in this batch, e.g. "ramadan_2026"
};

export async function POST(req: Request) {
  const access = await getMarketingContactsAccess();
  if (!access.ok) {
    return NextResponse.json({ error: "Not authorized" }, { status: access.status });
  }

  const body: ImportBody = await req.json();
  const { filename, columnMapping, rows, applyTags = [] } = body;

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No rows to import" }, { status: 400 });
  }
  if (rows.length > 20000) {
    return NextResponse.json(
      { error: "Batch too large for a single request (max 20,000 rows) - split the CSV and import in parts" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: batch, error: batchError } = await admin
    .from("contact_import_batches")
    .insert({
      filename,
      column_mapping: columnMapping,
      status: "processing",
      imported_by: access.employeeId,
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    return NextResponse.json({ error: batchError?.message ?? "Could not start import batch" }, { status: 500 });
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const email = row.email?.trim().toLowerCase() || null;
    const hasAnyData = email || row.phone?.trim() || row.first_name?.trim() || row.last_name?.trim();
    if (!hasAnyData) {
      skipped++;
      continue;
    }

    try {
      let contactId: string;

      // Match on email when present - the only reliable dedup key.
      const existing = email
        ? (await admin.from("contacts").select("id").ilike("email", email).maybeSingle()).data
        : null;

      if (existing) {
        const { error: updateError } = await admin
          .from("contacts")
          .update({
            phone: row.phone?.trim() || undefined,
            first_name: row.first_name?.trim() || undefined,
            last_name: row.last_name?.trim() || undefined,
          })
          .eq("id", existing.id);
        if (updateError) throw new Error(updateError.message);
        contactId = existing.id;
        updated++;
      } else {
        const { data: inserted, error: insertError } = await admin
          .from("contacts")
          .insert({
            email,
            phone: row.phone?.trim() || null,
            first_name: row.first_name?.trim() || null,
            last_name: row.last_name?.trim() || null,
            source: "import",
          })
          .select("id")
          .single();
        if (insertError || !inserted) throw new Error(insertError?.message ?? "insert failed");
        contactId = inserted.id;
        created++;
      }

      const tags = [...new Set([...(row.tags ?? []), ...applyTags])];
      if (tags.length > 0) {
        await admin
          .from("contact_tags")
          .upsert(
            tags.map((tag) => ({ contact_id: contactId, tag })),
            { onConflict: "contact_id,tag", ignoreDuplicates: true }
          );
      }

      if (row.fields && Object.keys(row.fields).length > 0) {
        const fieldRows = Object.entries(row.fields)
          .filter(([, v]) => v != null && v !== "")
          .map(([field_key, field_value]) => ({ contact_id: contactId, field_key, field_value }));
        if (fieldRows.length > 0) {
          await admin.from("contact_fields").upsert(fieldRows, { onConflict: "contact_id,field_key" });
        }
      }
    } catch (err) {
      skipped++;
      const message = err instanceof Error ? err.message : "unknown error";
      if (errors.length < 25) errors.push(`${email ?? row.phone ?? "row"}: ${message}`);
    }
  }

  await admin
    .from("contact_import_batches")
    .update({
      status: "completed",
      rows_created: created,
      rows_updated: updated,
      rows_skipped: skipped,
      error_summary: errors.length > 0 ? errors.join("\n") : null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", batch.id);

  return NextResponse.json({
    batchId: batch.id,
    created,
    updated,
    skipped,
    errors,
  });
}
