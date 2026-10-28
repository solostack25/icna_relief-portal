-- Flier Builder 2.0: AI "generate a flier" (gpt-image-1.5) + review gate
--
-- * brand_guidelines.reference_flier_urls: 3-6 of marketing's real fliers,
--   sent to the image model as style references so generated fliers look
--   like ICNA Relief's, not generic AI.
-- * brand_guidelines.ai_style_notes: free text marketing adds for the
--   image prompt ("photography-led, warm, lots of white space").
-- * flier_templates.review_status: AI-generated fliers are 'pending' and
--   only show in the office gallery once marketing approves them; the
--   requester can still open/download their own.
-- * flier_templates.source / generated_image_url: provenance.
-- * storage bucket flier-ai: generated images + reference fliers (public
--   read, service-role write).

alter table public.brand_guidelines
  add column if not exists reference_flier_urls jsonb not null default '[]'::jsonb,
  add column if not exists ai_style_notes text;

alter table public.flier_templates
  add column if not exists review_status text not null default 'approved',
  add column if not exists source text not null default 'builder',
  add column if not exists generated_image_url text;

create index if not exists flier_templates_review_status_idx on public.flier_templates (review_status);

insert into storage.buckets (id, name, public)
values ('flier-ai', 'flier-ai', true)
on conflict (id) do nothing;

do $$ begin
  create policy "flier-ai public read" on storage.objects for select using (bucket_id = 'flier-ai');
exception when duplicate_object then null; end $$;
