insert into storage.buckets (id, name, public)
values ('portfolio-media', 'portfolio-media', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "public can read portfolio media" on storage.objects;
create policy "public can read portfolio media"
on storage.objects for select
using (bucket_id = 'portfolio-media');

drop policy if exists "admins can upload portfolio media" on storage.objects;
create policy "admins can upload portfolio media"
on storage.objects for insert
with check (
  bucket_id = 'portfolio-media'
  and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

drop policy if exists "admins can update portfolio media" on storage.objects;
create policy "admins can update portfolio media"
on storage.objects for update
using (
  bucket_id = 'portfolio-media'
  and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
)
with check (
  bucket_id = 'portfolio-media'
  and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

drop policy if exists "admins can delete portfolio media" on storage.objects;
create policy "admins can delete portfolio media"
on storage.objects for delete
using (
  bucket_id = 'portfolio-media'
  and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);
