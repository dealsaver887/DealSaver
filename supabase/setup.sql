-- DealSaver database and public product-image bucket.
-- Run this once in the Supabase SQL Editor for the project used by DealSaver.

create extension if not exists pgcrypto;

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  store text not null,
  category text not null check (
    category in (
      'Electronics',
      'Home',
      'Beauty',
      'Health',
      'Clothing',
      'Kids',
      'Grocery',
      'Pets',
      'Other'
    )
  ),
  original_price numeric(10, 2) not null check (original_price > 0),
  sale_price numeric(10, 2) not null check (
    sale_price >= 0 and sale_price <= original_price
  ),
  affiliate_url text not null,
  image_url text,
  description text,
  start_date date not null default current_date,
  end_date date,
  is_featured boolean not null default false,
  is_hot boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deals_public_listing_idx
  on public.deals (is_active, start_date, end_date);
create index if not exists deals_category_idx
  on public.deals (category);
create index if not exists deals_created_at_idx
  on public.deals (created_at desc);

create or replace function public.deals_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists deals_set_updated_at on public.deals;
create trigger deals_set_updated_at
before update on public.deals
for each row
execute function public.deals_set_updated_at();

-- Browser clients never receive the service-role key. Reads and writes are
-- proxied through the server, so direct table access is intentionally closed.
alter table public.deals enable row level security;

-- The API uses only the server-side service_role key. Grant it the exact
-- table operations needed by public reads and admin CRUD; RLS stays enabled.
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.deals to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'deal-images',
  'deal-images',
  true,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No deals are seeded. Add real deals through the DealSaver admin page.