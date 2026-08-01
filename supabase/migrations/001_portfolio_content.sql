create extension if not exists pgcrypto;

create table if not exists public.works (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('tvc', 'livestream')),
  brand_name text,
  work_title text not null,
  work_type text not null,
  poster_url text not null,
  video_url text,
  sort_order integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tvc_brand_name_required check (section <> 'tvc' or nullif(trim(brand_name), '') is not null),
  constraint livestream_brand_name_empty check (section <> 'livestream' or brand_name is null or trim(brand_name) = '')
);

create table if not exists public.work_images (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works(id) on delete restrict,
  image_url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists works_section_status_order_idx
  on public.works (section, status, sort_order);
create index if not exists work_images_work_order_idx
  on public.work_images (work_id, sort_order);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists works_set_updated_at on public.works;
create trigger works_set_updated_at
before update on public.works
for each row execute function public.set_updated_at();

alter table public.works enable row level security;
alter table public.work_images enable row level security;

drop policy if exists "published works are public" on public.works;
create policy "published works are public"
on public.works for select
using (status = 'published');

drop policy if exists "published work images are public" on public.work_images;
create policy "published work images are public"
on public.work_images for select
using (
  exists (
    select 1 from public.works
    where public.works.id = work_images.work_id
      and public.works.status = 'published'
  )
);

drop policy if exists "admins can manage works" on public.works;
create policy "admins can manage works"
on public.works for all
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "admins can manage work images" on public.work_images;
create policy "admins can manage work images"
on public.work_images for all
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
