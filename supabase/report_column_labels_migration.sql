-- Lets a saved report override its displayed/exported column headers
-- per dimension or metric key, keyed by that field's stable `key`
-- (not its default registry label). Built for the "one entry, two
-- reports" problem: pantry staff enter data once in the portal, and
-- an office can relabel the same report's columns to match whatever
-- terms their own local food bank's submission template uses (e.g.
-- "Households Served" -> "HH Count") without needing a new report
-- module or code change per food bank - every food bank's required
-- format is different, so this has to be office-configurable rather
-- than hardcoded.
alter table report_definitions
  add column if not exists column_labels jsonb not null default '{}';

comment on column report_definitions.column_labels is
  'Optional per-report header overrides, e.g. {"visit_count": "HH Count"}, keyed by dimension/metric key. Falls back to the registry default label when a key is absent.';
