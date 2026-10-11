-- YehiaFlowers database: catalog, photos, orders, settings, access rules and photo storage.
-- Safe to run more than once. Paste into the Supabase SQL editor and run.

-- ============ TABLES ============

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name_en text not null,
  name_ar text not null,
  sort int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.flowers (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  slug text unique not null,
  name_en text not null,
  name_ar text not null,
  stems_per_pack int not null default 160 check (stems_per_pack between 1 and 5000),
  stems_per_bunch int not null default 10 check (stems_per_bunch between 1 and 500),
  sort int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
-- Storefront images: an optional custom cover per category, and the hero slider.
alter table public.categories add column if not exists cover_path text;
alter table public.categories add column if not exists cover_focus_x int not null default 50 check (cover_focus_x between 0 and 100);
alter table public.categories add column if not exists cover_focus_y int not null default 50 check (cover_focus_y between 0 and 100);

alter table public.flowers add column if not exists stems_per_pack int not null default 160;
alter table public.flowers add column if not exists stems_per_bunch int not null default 10;

create table if not exists public.colors (
  id uuid primary key default gen_random_uuid(),
  flower_id uuid not null references public.flowers(id) on delete cascade,
  name_en text not null,
  name_ar text not null,
  hex text not null check (hex ~ '^#[0-9A-Fa-f]{6}$'),
  in_stock boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- "path" is the full-size file inside the flower-photos bucket.
-- The thumbnail lives next to it with the suffix _t.webp (created by the admin panel).
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  color_id uuid not null references public.colors(id) on delete cascade,
  path text not null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- focus_x / focus_y (0-100) choose which part of a photo stays visible when it is cropped.
alter table public.photos add column if not exists focus_x int not null default 50 check (focus_x between 0 and 100);
alter table public.photos add column if not exists focus_y int not null default 50 check (focus_y between 0 and 100);

create table if not exists public.hero_slides (
  id uuid primary key default gen_random_uuid(),
  path text not null,
  focus_x int not null default 50 check (focus_x between 0 and 100),
  focus_y int not null default 50 check (focus_y between 0 and 100),
  sort int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  public_token text unique not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  customer_name text not null,
  customer_phone text,
  customer_city text,
  customer_note text,
  lang text not null default 'ar' check (lang in ('ar', 'en')),
  status text not null default 'new' check (status in ('new', 'quoted', 'confirmed', 'delivered', 'cancelled')),
  note text,                       -- private note written by the owner
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.orders add column if not exists customer_note text;
-- Make phone optional for stores that don't collect it
alter table public.orders alter column customer_phone drop not null;
-- Store client IP for rate-limiting (never exposed to customers via RLS)
alter table public.orders add column if not exists client_ip text;

-- Names, color, pack size and cover photo are copied at order time,
-- so old orders stay correct if the catalog changes later.
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  color_id uuid references public.colors(id) on delete set null,
  flower_name_en text not null,
  flower_name_ar text not null,
  color_name_en text not null,
  color_name_ar text not null,
  color_hex text not null,
  photo_path text,
  stems_per_pack int not null default 160,
  stems_per_bunch int not null default 10,
  packs int not null check (packs between 1 and 99),
  unique (order_id, color_id)
);
alter table public.order_items add column if not exists stems_per_pack int not null default 160;
alter table public.order_items add column if not exists stems_per_bunch int not null default 10;

-- Public, non-secret settings such as the WhatsApp number.
create table if not exists public.settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.settings (key, value) values ('whatsapp_number', '') on conflict (key) do nothing;

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create index if not exists flowers_category_idx on public.flowers(category_id);
create index if not exists colors_flower_idx on public.colors(flower_id);
create index if not exists photos_color_idx on public.photos(color_id, sort);
create index if not exists orders_status_idx on public.orders(status, created_at desc);
create index if not exists orders_created_idx on public.orders(created_at desc);
create index if not exists order_items_order_idx on public.order_items(order_id);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();
drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- ============ ACCESS RULES ============

create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;

alter table public.admins enable row level security;  -- no policies: nobody reads it directly

do $$
declare t text;
begin
  foreach t in array array['categories','flowers','colors','photos','orders','order_items','settings','hero_slides'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format('create policy admin_all on public.%I for all to authenticated
                    using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Customers can read the active catalog and the public settings. They cannot read orders.
drop policy if exists public_read on public.categories;
create policy public_read on public.categories for select to anon, authenticated using (is_active);

drop policy if exists public_read on public.flowers;
create policy public_read on public.flowers for select to anon, authenticated using (is_active);

drop policy if exists public_read on public.colors;
create policy public_read on public.colors for select to anon, authenticated
  using (exists (select 1 from public.flowers f where f.id = flower_id and f.is_active));

drop policy if exists public_read on public.photos;
create policy public_read on public.photos for select to anon, authenticated
  using (exists (select 1 from public.colors c join public.flowers f on f.id = c.flower_id
                 where c.id = color_id and f.is_active));

drop policy if exists public_read on public.hero_slides;
create policy public_read on public.hero_slides for select to anon, authenticated using (is_active);

drop policy if exists public_read on public.settings;
create policy public_read on public.settings for select to anon, authenticated using (true);

-- ============ PLACING AN ORDER (the only way customers write data) ============
-- Validates everything and copies names, pack size and photo from the database, never from the browser.

drop function if exists public.create_order(text, text, text, text, jsonb);

create or replace function public.create_order(
  p_name text, p_phone text default null, p_city text default null, p_lang text default 'ar', p_items jsonb default '[]', p_note text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_order_id uuid;
  v_token text;
  it jsonb;
  v_color public.colors%rowtype;
  v_flower public.flowers%rowtype;
  v_cover text;
  v_packs int;
  v_ip text;
  v_recent int;
begin
  -- ---- Input validation ----
  if length(trim(coalesce(p_name, ''))) not between 2 and 80 then
    raise exception 'invalid name';
  end if;
  if length(coalesce(p_note, '')) > 500 then
    raise exception 'note too long';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 60 then
    raise exception 'invalid items';
  end if;

  -- ---- Per-IP rate limit: max 5 orders per hour ----
  v_ip := coalesce(
    current_setting('request.headers', true)::jsonb->>'x-forwarded-for',
    current_setting('request.headers', true)::jsonb->>'x-real-ip',
    'unknown'
  );
  -- Take only the first IP in a forwarded chain
  v_ip := trim(split_part(v_ip, ',', 1));
  select count(*) into v_recent
  from public.orders
  where client_ip = v_ip
    and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    raise exception 'too many orders – please try again later';
  end if;

  insert into public.orders (customer_name, customer_phone, customer_city, customer_note, lang, client_ip)
  values (trim(p_name), nullif(trim(coalesce(p_phone, '')), ''), nullif(trim(coalesce(p_city, '')), ''),
          nullif(trim(coalesce(p_note, '')), ''),
          case when p_lang in ('ar', 'en') then p_lang else 'ar' end,
          v_ip)
  returning id, public_token into v_order_id, v_token;

  for it in select * from jsonb_array_elements(p_items) loop
    v_packs := (it->>'packs')::int;
    if v_packs is null or v_packs not between 1 and 99 then
      raise exception 'invalid packs';
    end if;

    select c.* into v_color
    from public.colors c join public.flowers f on f.id = c.flower_id
    where c.id = (it->>'color_id')::uuid and f.is_active and c.in_stock;
    if not found then
      raise exception 'color unavailable';
    end if;

    select * into v_flower from public.flowers where id = v_color.flower_id;
    select path into v_cover from public.photos
      where color_id = v_color.id order by sort, created_at limit 1;

    insert into public.order_items (order_id, color_id, flower_name_en, flower_name_ar,
      color_name_en, color_name_ar, color_hex, photo_path, stems_per_pack, stems_per_bunch, packs)
    values (v_order_id, v_color.id, v_flower.name_en, v_flower.name_ar,
      v_color.name_en, v_color.name_ar, v_color.hex, v_cover,
      v_flower.stems_per_pack, v_flower.stems_per_bunch, v_packs);
  end loop;

  return v_token;
end $$;

-- The order page opened from the WhatsApp link. The phone number is NOT included.
create or replace function public.get_order_by_token(p_token text) returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'created_at', o.created_at,
    'status', o.status,
    'customer_name', o.customer_name,
    'customer_city', o.customer_city,
    'customer_note', o.customer_note,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'flower_en', i.flower_name_en, 'flower_ar', i.flower_name_ar,
        'color_en', i.color_name_en, 'color_ar', i.color_name_ar,
        'hex', i.color_hex, 'photo_path', i.photo_path, 'packs', i.packs,
        'stems_per_pack', i.stems_per_pack, 'stems_per_bunch', i.stems_per_bunch)
        order by i.flower_name_en, i.color_name_en)
      from public.order_items i where i.order_id = o.id), '[]'::jsonb)
  )
  from public.orders o where o.public_token = p_token
$$;

revoke all on function public.create_order(text, text, text, text, jsonb, text) from public;
revoke all on function public.get_order_by_token(text) from public;
grant execute on function public.create_order(text, text, text, text, jsonb, text) to anon, authenticated;
grant execute on function public.get_order_by_token(text) to anon, authenticated;

-- ============ PHOTO STORAGE ============
-- Public bucket: anyone can view photos, only the admin can upload, replace or delete.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('flower-photos', 'flower-photos', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

drop policy if exists "admin upload photos" on storage.objects;
create policy "admin upload photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'flower-photos' and public.is_admin());

drop policy if exists "admin update photos" on storage.objects;
create policy "admin update photos" on storage.objects for update to authenticated
  using (bucket_id = 'flower-photos' and public.is_admin());

drop policy if exists "admin delete photos" on storage.objects;
create policy "admin delete photos" on storage.objects for delete to authenticated
  using (bucket_id = 'flower-photos' and public.is_admin());

-- ============ AFTER RUNNING THIS ============
-- 1. Authentication > Users > Add user (his email and password).
-- 2. Make him the admin, using the user id shown in that list:
--      insert into public.admins (user_id) values ('PASTE-USER-ID-HERE');
-- 3. Open /admin, sign in, and use Catalog > Load starter catalog (or add flowers by hand).
