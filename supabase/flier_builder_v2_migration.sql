-- Flier Builder 2.0
--
-- * extra_pages: pages 2..n of a multi-page flier. Page 1 stays in
--   canvas_data / canvas_background so every existing reader (Fill tool,
--   Copilot create-flier routes, downloads) keeps working unchanged.
-- * program / format_label / language: template-gallery filters.
-- * thumbnail_data_url: a small PNG snapshot captured on save so the
--   gallery can show a real preview instead of a color swatch.

alter table public.flier_templates
  add column if not exists extra_pages jsonb not null default '[]'::jsonb,
  add column if not exists program text,
  add column if not exists format_label text,
  add column if not exists language text not null default 'English',
  add column if not exists thumbnail_data_url text;

create index if not exists flier_templates_program_idx on public.flier_templates (program);
create index if not exists flier_templates_language_idx on public.flier_templates (language);
