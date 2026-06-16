-- Barbearia Agenda V1.9 - Storage para upload de identidade visual
-- Execute uma vez no Supabase SQL Editor.
-- Cria o bucket público usado pelo painel para logo, capa/banner e favicon.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'branding',
  'branding',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "branding_public_read" on storage.objects;
create policy "branding_public_read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'branding');

drop policy if exists "branding_public_insert" on storage.objects;
create policy "branding_public_insert"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'branding');

drop policy if exists "branding_public_update" on storage.objects;
create policy "branding_public_update"
on storage.objects
for update
to anon, authenticated
using (bucket_id = 'branding')
with check (bucket_id = 'branding');

drop policy if exists "branding_public_delete" on storage.objects;
create policy "branding_public_delete"
on storage.objects
for delete
to anon, authenticated
using (bucket_id = 'branding');
