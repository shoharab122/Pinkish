-- =====================================================================
-- Pinkish marketplace v5
--   1. Delivery zones and prices
--        inner   : within 4 km of the Bahaddarhat hub  -> Pinkish rider  ৳40
--        city    : rest of Chattogram city             -> Pathao/courier ৳60
--        outside : anywhere else in Bangladesh         -> Pathao/courier ৳120
--      Prices, the free-delivery threshold and the rider radius live in
--      site_settings.key = 'delivery' and are edited from Admin -> Promotions.
--   2. Free delivery above ৳X (cash-on-delivery orders)
--   3. Coupons: site-wide (admin) and shop-only (seller), checked on the server
--   4. Back-in-stock and price-drop alerts for wishlisted products
--   5. Seller -> Pathao direct pickup, booked and controlled by Pinkish
--   6. Customers no longer need to give the rider a delivery code
--
-- Safe to run more than once. Run it in the Supabase SQL editor AFTER the
-- earlier Pinkish scripts (riders, delivery-zones, seller-ops, returns).
-- bKash / Nagad code paths are not changed.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Helpers
-- ---------------------------------------------------------------------
create or replace function public.pk_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;

-- text -> number, never throws (bad input becomes null)
create or replace function public.pk_num(v text) returns double precision
language plpgsql immutable as $$
begin
  if v is null or btrim(v) = '' then return null; end if;
  return v::double precision;
exception when others then return null;
end $$;

-- the shop owned by the signed-in seller (approved or not)
create or replace function public.pk_my_shop() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.shops where owner_id = auth.uid() order by created_at limit 1
$$;

create or replace function public.pk_shop_approved(p_shop uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shops where id = p_shop and status = 'approved')
$$;

-- ---------------------------------------------------------------------
-- 1. Delivery settings + zones
-- ---------------------------------------------------------------------
insert into public.site_settings (key, value, updated_at)
values ('delivery', jsonb_build_object(
  'inner_fee', 40, 'city_fee', 60, 'outside_fee', 120,
  'rider_km', 4, 'free_over', 0, 'free_zones', jsonb_build_array('inner', 'city')
), now())
on conflict (key) do nothing;

-- Customers no longer give the rider a code: switch the existing rider rule off.
-- (Admin -> Riders -> Rider rules can turn it back on at any time.)
insert into public.site_settings (key, value, updated_at)
values ('rider_ops', jsonb_build_object('require_code', false), now())
on conflict (key) do update
  set value = coalesce(public.site_settings.value, '{}'::jsonb) || jsonb_build_object('require_code', false),
      updated_at = now();

create or replace function public.pk_delivery_cfg() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('inner_fee', 40, 'city_fee', 60, 'outside_fee', 120, 'rider_km', 4, 'free_over', 0,
                            'free_zones', jsonb_build_array('inner', 'city'))
      || coalesce((select value from public.site_settings where key = 'delivery'), '{}'::jsonb)
$$;

-- straight-line km from the Bahaddarhat hub (same numbers as src/lib/zone.js)
create or replace function public.pk_hub_km(lat double precision, lng double precision) returns double precision
language sql immutable as $$
  select case when lat is null or lng is null then null else
    6371 * 2 * asin(sqrt(
      power(sin(radians(lat - 22.3411) / 2), 2) +
      cos(radians(22.3411)) * cos(radians(lat)) * power(sin(radians(lng - 91.8428) / 2), 2)))
  end
$$;

-- Chattogram city outline (City Corporation area: Fouzdarhat to Patenga, coast to Kalurghat / Karnaphuli).
-- Same polygon as CTG_CITY in src/lib/zone.js. Ray casting, ~15 points, very cheap.
create or replace function public.pk_in_ctg_city(lat double precision, lng double precision) returns boolean
language plpgsql immutable as $$
declare
  ys double precision[] := array[22.4450,22.4550,22.4450,22.4300,22.4050,22.3700,22.3350,22.3150,22.2850,22.2500,22.2200,22.2250,22.2800,22.3400,22.4000];
  xs double precision[] := array[91.7200,91.7700,91.8150,91.8500,91.8800,91.8950,91.8750,91.8550,91.8250,91.8300,91.8100,91.7800,91.7650,91.7350,91.7150];
  n int := 15; i int; j int := 15; inside boolean := false;
begin
  if lat is null or lng is null then return false; end if;
  for i in 1..n loop
    if ((ys[i] > lat) <> (ys[j] > lat)) and (lng < (xs[j] - xs[i]) * (lat - ys[i]) / (ys[j] - ys[i]) + xs[i]) then
      inside := not inside;
    end if;
    j := i;
  end loop;
  return inside;
end $$;

-- Rough outline of Bangladesh (about 5 km accuracy): only used to refuse pins in India / Myanmar / the sea.
-- Same polygon as BD in src/lib/zone.js.
create or replace function public.pk_in_bd(lat double precision, lng double precision) returns boolean
language plpgsql immutable as $$
declare
  ys double precision[] := array[26.63,26.30,26.40,25.95,25.30,25.20,25.17,25.10,24.90,24.20,24.05,23.65,23.10,23.30,23.10,22.50,21.90,21.20,20.60,20.70,21.40,22.00,22.20,22.60,22.85,22.40,22.00,21.70,21.70,21.62,22.30,23.05,23.80,24.30,24.80,25.15,25.27,25.60,26.00,26.33];
  xs double precision[] := array[88.43,89.00,89.85,89.90,89.85,90.50,91.60,92.40,92.50,92.20,91.65,91.30,91.40,91.95,92.35,92.65,92.65,92.35,92.30,92.05,91.90,91.80,91.74,91.62,91.45,91.10,90.90,90.10,89.50,89.07,89.00,88.90,88.55,88.60,88.05,88.45,88.95,88.40,88.20,88.55];
  n int := 40; i int; j int := 40; inside boolean := false;
begin
  if lat is null or lng is null then return false; end if;
  if lat < 20.5 or lat > 26.7 or lng < 88.0 or lng > 92.7 then return false; end if;
  for i in 1..n loop
    if ((ys[i] > lat) <> (ys[j] > lat)) and (lng < (xs[j] - xs[i]) * (lat - ys[i]) / (ys[j] - ys[i]) + xs[i]) then
      inside := not inside;
    end if;
    j := i;
  end loop;
  return inside;
end $$;

-- 'inner' | 'city' | 'outside' | 'unknown' (no pin) | 'abroad' (not in Bangladesh)
create or replace function public.pk_delivery_zone(lat double precision, lng double precision) returns text
language plpgsql stable security definer set search_path = public as $$
declare km double precision; cfg jsonb := public.pk_delivery_cfg();
begin
  if lat is null or lng is null or (lat = 0 and lng = 0) then return 'unknown'; end if;
  if public.pk_in_ctg_city(lat, lng) then
    km := public.pk_hub_km(lat, lng);
    return case when km <= coalesce((cfg->>'rider_km')::double precision, 4) then 'inner' else 'city' end;
  end if;
  if not public.pk_in_bd(lat, lng) then return 'abroad'; end if;
  km := public.pk_hub_km(lat, lng);
  if km <= coalesce((cfg->>'rider_km')::double precision, 4) then return 'inner'; end if;
  if public.pk_in_ctg_city(lat, lng) then return 'city'; end if;
  return 'outside';
end $$;

-- fee for a zone, before free delivery. null = we cannot deliver there.
create or replace function public.pk_zone_fee(lat double precision, lng double precision) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare z text := public.pk_delivery_zone(lat, lng); cfg jsonb := public.pk_delivery_cfg();
begin
  return case z
    when 'inner'   then (cfg->>'inner_fee')::numeric
    when 'city'    then (cfg->>'city_fee')::numeric
    when 'unknown' then (cfg->>'city_fee')::numeric   -- no pin: charged like the city; the app asks for a pin first
    when 'outside' then (cfg->>'outside_fee')::numeric
    else null end;
end $$;
grant execute on function public.pk_delivery_zone(double precision, double precision), public.pk_zone_fee(double precision, double precision) to anon, authenticated;

-- Point the older delivery_fee_for() (used inside place_order / place_bkash_order) at the new zones,
-- whatever its argument list is, so the old 30 km limit no longer blocks orders from the rest of Bangladesh.
do $$
declare r record; t text[]; expr text;
begin
  for r in
    select p.oid, pg_get_function_arguments(p.oid) as args, pg_get_function_result(p.oid) as res,
           array(select format_type(x, null) from unnest(p.proargtypes::oid[]) x) as types
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'delivery_fee_for'
  loop
    t := r.types; expr := null;
    if coalesce(array_length(t, 1), 0) >= 2
       and t[1] in ('numeric', 'double precision', 'real', 'integer')
       and t[2] in ('numeric', 'double precision', 'real', 'integer') then
      expr := 'public.pk_zone_fee($1::double precision, $2::double precision)';
    elsif coalesce(array_length(t, 1), 0) >= 1 and t[1] in ('jsonb', 'json') then
      expr := 'public.pk_zone_fee(public.pk_num(($1::jsonb)->>''lat''), public.pk_num(($1::jsonb)->>''lng''))';
    end if;
    if expr is not null and r.res in ('numeric', 'integer', 'double precision', 'real', 'bigint') then
      execute format('create or replace function public.delivery_fee_for(%s) returns %s language sql stable security definer set search_path = public as $f$ select (%s)::%s $f$',
                     r.args, r.res, expr, r.res);
      raise notice 'delivery_fee_for(%) now uses the new delivery zones', r.args;
    else
      raise notice 'delivery_fee_for(%) returns % and was NOT changed. Send this message to your developer.', r.args, r.res;
    end if;
  end loop;
end $$;

-- Warn (do not change) if an older function still contains a hard-coded 30 km limit.
do $$
declare r record;
begin
  for r in select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('place_order', 'place_bkash_order', 'pk_set_delivery_mode')
             and p.prosrc ~* '(>|>=)\s*30(\.0+)?\b'
  loop
    raise notice 'CHECK: %() still has a "> 30" comparison. If orders outside Chattogram fail, send that function to your developer.', r.proname;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. Order columns
-- ---------------------------------------------------------------------
alter table public.orders add column if not exists delivery_zone  text;
alter table public.orders add column if not exists coupon_code    text;
alter table public.orders add column if not exists discount       numeric not null default 0;
alter table public.orders add column if not exists shop_discounts jsonb   not null default '{}'::jsonb;
alter table public.orders add column if not exists free_delivery  boolean not null default false;
alter table public.orders add column if not exists delivery_mode  text;
alter table public.orders add column if not exists delivery_km    numeric;
alter table public.orders add column if not exists delivery_fee   numeric;

-- ---------------------------------------------------------------------
-- 3. Coupons
-- ---------------------------------------------------------------------
create table if not exists public.coupons (
  id               uuid primary key default gen_random_uuid(),
  code             text not null,
  title            text,
  shop_id          uuid references public.shops(id) on delete cascade,   -- null = whole store (Pinkish pays)
  kind             text not null default 'percent' check (kind in ('percent', 'amount', 'free_delivery')),
  value            numeric not null default 0 check (value >= 0),
  max_discount     numeric check (max_discount is null or max_discount > 0),
  min_order        numeric not null default 0 check (min_order >= 0),
  starts_at        timestamptz not null default now(),
  ends_at          timestamptz,
  max_uses         integer check (max_uses is null or max_uses > 0),
  per_user         integer not null default 1 check (per_user between 1 and 100),
  first_order_only boolean not null default false,
  is_public        boolean not null default true,     -- listed in the cart and on the shop page
  active           boolean not null default true,
  used_count       integer not null default 0,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  constraint coupons_code_fmt check (code ~ '^[A-Z0-9]{3,20}$'),
  constraint coupons_pct check (kind <> 'percent' or (value > 0 and value <= 90)),
  constraint coupons_amt check (kind <> 'amount' or value > 0),
  constraint coupons_shop_kind check (shop_id is null or kind <> 'free_delivery')
);
create unique index if not exists coupons_code_uq on public.coupons (code);
create index if not exists coupons_shop_idx on public.coupons (shop_id) where shop_id is not null;

create table if not exists public.coupon_redemptions (
  id         uuid primary key default gen_random_uuid(),
  coupon_id  uuid not null references public.coupons(id) on delete cascade,
  user_id    uuid not null,
  order_id   uuid not null references public.orders(id) on delete cascade,
  amount     numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (coupon_id, order_id)
);
create index if not exists coupon_red_user_idx on public.coupon_redemptions (coupon_id, user_id);

-- the coupon a customer applied in the cart; picked up by the order trigger (COD orders)
create table if not exists public.cart_coupons (
  user_id uuid primary key,
  code    text not null,
  set_at  timestamptz not null default now()
);

alter table public.coupons            enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.cart_coupons       enable row level security;

drop policy if exists coupons_admin_all on public.coupons;
create policy coupons_admin_all on public.coupons for all
  using (public.pk_is_admin()) with check (public.pk_is_admin());

-- sellers manage only their own shop's coupons, and only percent / amount
drop policy if exists coupons_seller_read on public.coupons;
create policy coupons_seller_read on public.coupons for select
  using (shop_id is not null and shop_id = public.pk_my_shop());
drop policy if exists coupons_seller_ins on public.coupons;
create policy coupons_seller_ins on public.coupons for insert
  with check (shop_id is not null and shop_id = public.pk_my_shop() and kind in ('percent', 'amount')
              and public.pk_shop_approved(shop_id));
drop policy if exists coupons_seller_upd on public.coupons;
create policy coupons_seller_upd on public.coupons for update
  using (shop_id is not null and shop_id = public.pk_my_shop())
  with check (shop_id = public.pk_my_shop() and kind in ('percent', 'amount'));
drop policy if exists coupons_seller_del on public.coupons;
create policy coupons_seller_del on public.coupons for delete
  using (shop_id is not null and shop_id = public.pk_my_shop() and used_count = 0);

drop policy if exists coupon_red_admin on public.coupon_redemptions;
create policy coupon_red_admin on public.coupon_redemptions for select using (public.pk_is_admin());

-- a seller cannot bump used_count or move a coupon to another shop
-- (only for requests made directly by the app: current_user is 'authenticated' there,
--  but the function owner inside Pinkish's own security-definer functions)
create or replace function public.pk_coupon_guard() returns trigger
language plpgsql as $$
begin
  new.code := upper(btrim(new.code));
  if current_user in ('authenticated', 'anon') and not public.pk_is_admin() then
    if tg_op = 'UPDATE' then
      new.used_count := old.used_count;
      new.shop_id    := old.shop_id;
      new.created_by := old.created_by;
    else
      new.used_count := 0;
      new.created_by := auth.uid();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists pk_coupon_guard on public.coupons;
create trigger pk_coupon_guard before insert or update on public.coupons
  for each row execute function public.pk_coupon_guard();

-- Keep the old demo code working as a real coupon (10% off the first order).
insert into public.coupons (code, title, kind, value, max_discount, first_order_only, per_user)
values ('SHIELD10', '10% off your first order', 'percent', 10, 300, true, 1)
on conflict (code) do nothing;

-- Checks a coupon against a cart. items: [{id, variant, qty, price?}]
-- p_trust_price = true inside the order trigger (prices come from place_order), false from the cart.
create or replace function public.pk_coupon_eval(p_code text, p_user uuid, p_items jsonb, p_trust_price boolean default false)
returns table (ok boolean, msg text, coupon_id uuid, discount numeric, free_delivery boolean, shop_id uuid, base numeric, title text)
language plpgsql stable security definer set search_path = public as $$
declare
  c public.coupons%rowtype; v_base numeric := 0; v_all numeric := 0; v_used int; v_orders int; v_disc numeric := 0;
begin
  select * into c from public.coupons where code = upper(btrim(coalesce(p_code, '')));
  if not found or not c.active then return query select false, 'This coupon code is not valid.', null::uuid, 0::numeric, false, null::uuid, 0::numeric, null::text; return; end if;
  if c.starts_at > now() then return query select false, 'This coupon is not active yet.', c.id, 0::numeric, false, c.shop_id, 0::numeric, c.title; return; end if;
  if c.ends_at is not null and c.ends_at < now() then return query select false, 'This coupon has expired.', c.id, 0::numeric, false, c.shop_id, 0::numeric, c.title; return; end if;
  if c.max_uses is not null and c.used_count >= c.max_uses then return query select false, 'This coupon has been fully used.', c.id, 0::numeric, false, c.shop_id, 0::numeric, c.title; return; end if;
  if c.shop_id is not null and not exists (select 1 from public.shops s where s.id = c.shop_id and s.status = 'approved') then
    return query select false, 'This coupon is not valid.', c.id, 0::numeric, false, c.shop_id, 0::numeric, c.title; return;
  end if;
  if p_user is null then return query select false, 'Please sign in to use a coupon.', c.id, 0::numeric, false, c.shop_id, 0::numeric, c.title; return; end if;

  select count(*) into v_used from public.coupon_redemptions r join public.orders o on o.id = r.order_id
   where r.coupon_id = c.id and r.user_id = p_user and coalesce(o.status, 0) <> 4;
  if v_used >= c.per_user then return query select false, 'You have already used this coupon.', c.id, 0::numeric, false, c.shop_id, 0::numeric, c.title; return; end if;
  if c.first_order_only then
    select count(*) into v_orders from public.orders o where o.user_id = p_user and coalesce(o.status, 0) <> 4;
    if v_orders > 0 then return query select false, 'This coupon is for your first order only.', c.id, 0::numeric, false, c.shop_id, 0::numeric, c.title; return; end if;
  end if;

  -- cart value: whole cart, or only this shop's items
  select coalesce(sum(x.line), 0), coalesce(sum(x.line) filter (where c.shop_id is null or x.sid = c.shop_id), 0)
    into v_all, v_base
  from (
    select (case when p_trust_price and public.pk_num(i->>'price') is not null then public.pk_num(i->>'price')::numeric
                 else p.price * coalesce((select public.pk_num(v->>'mult') from jsonb_array_elements(coalesce(p.variants, '[]'::jsonb)) v
                                           where v->>'label' = i->>'variant' limit 1), 1)::numeric end)
           * greatest(1, coalesce(public.pk_num(i->>'qty'), 1))::numeric as line,
           p.shop_id as sid
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
    join public.products p on p.id::text = i->>'id'
  ) x;

  if c.shop_id is not null and v_base <= 0 then
    return query select false, 'This coupon is only for products from its shop.', c.id, 0::numeric, false, c.shop_id, 0::numeric, c.title; return;
  end if;
  if v_base < c.min_order then
    return query select false, format('Add ৳%s more to use this coupon (minimum ৳%s).', ceil(c.min_order - v_base)::int, c.min_order::int), c.id, 0::numeric, false, c.shop_id, v_base, c.title; return;
  end if;

  if c.kind = 'percent' then v_disc := round(v_base * c.value / 100);
  elsif c.kind = 'amount' then v_disc := least(c.value, v_base);
  else v_disc := 0; end if;
  if c.max_discount is not null then v_disc := least(v_disc, c.max_discount); end if;

  return query select true, null::text, c.id, v_disc, c.kind = 'free_delivery', c.shop_id, v_base, c.title;
end $$;

-- Cart: check a code and remember it for the next order. Returns what the cart should show.
create or replace function public.apply_coupon(p_code text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_uid uuid := auth.uid(); v_code text := upper(btrim(coalesce(p_code, '')));
begin
  if v_uid is null then raise exception 'Please sign in to use a coupon.'; end if;
  if v_code !~ '^[A-Z0-9]{3,20}$' then raise exception 'This coupon code is not valid.'; end if;
  select * into r from public.pk_coupon_eval(v_code, v_uid, p_items, false);
  if not r.ok then raise exception '%', r.msg; end if;
  insert into public.cart_coupons (user_id, code, set_at) values (v_uid, v_code, now())
  on conflict (user_id) do update set code = excluded.code, set_at = now();
  return jsonb_build_object('code', v_code, 'discount', r.discount, 'free_delivery', r.free_delivery,
                            'shop_id', r.shop_id, 'title', r.title, 'base', r.base);
end $$;

create or replace function public.clear_cart_coupon() returns void
language sql security definer set search_path = public as $$
  delete from public.cart_coupons where user_id = auth.uid()
$$;

-- Public coupons for the cart / a shop page (never shows private ones)
create or replace function public.public_coupons(p_shops uuid[] default null)
returns table (code text, title text, kind text, value numeric, max_discount numeric, min_order numeric,
               ends_at timestamptz, shop_id uuid, first_order_only boolean)
language sql stable security definer set search_path = public as $$
  select c.code, c.title, c.kind, c.value, c.max_discount, c.min_order, c.ends_at, c.shop_id, c.first_order_only
  from public.coupons c
  where c.active and c.is_public and c.starts_at <= now()
    and (c.ends_at is null or c.ends_at > now())
    and (c.max_uses is null or c.used_count < c.max_uses)
    and (c.shop_id is null or (p_shops is not null and c.shop_id = any(p_shops)))
    and (c.shop_id is null or exists (select 1 from public.shops s where s.id = c.shop_id and s.status = 'approved'))
  order by c.shop_id nulls first, c.created_at desc
  limit 20
$$;

grant execute on function public.apply_coupon(text, jsonb), public.clear_cart_coupon() to authenticated;
grant execute on function public.public_coupons(uuid[]) to anon, authenticated;
revoke execute on function public.pk_coupon_eval(text, uuid, jsonb, boolean) from anon, authenticated, public;

-- ---------------------------------------------------------------------
-- 4. Pricing trigger on new orders
--    Runs after place_order() has priced the cart. For Cash on Delivery it sets the zone fee,
--    free delivery and the coupon. For bKash / Nagad it only records the zone (totals untouched).
--    Named zz_ so it runs after any older BEFORE INSERT trigger on orders.
-- ---------------------------------------------------------------------
create or replace function public.pk_order_pricing() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_lat double precision := public.pk_num(new.address->>'lat');
  v_lng double precision := public.pk_num(new.address->>'lng');
  v_zone text := public.pk_delivery_zone(v_lat, v_lng);
  v_cfg jsonb := public.pk_delivery_cfg();
  v_fee numeric; v_old_fee numeric := coalesce(new.delivery_fee, 0);
  v_sub numeric; v_disc numeric := 0; v_free boolean := false; v_cod boolean;
  v_code text; r record;
begin
  if v_zone = 'abroad' then
    raise exception 'We deliver inside Bangladesh only. Please pin your delivery location on the map.';
  end if;

  new.delivery_zone := v_zone;
  if v_lat is not null and v_lng is not null then new.delivery_km := round(public.pk_hub_km(v_lat, v_lng)::numeric, 2); end if;
  new.delivery_mode := case when v_zone = 'inner' or v_zone = 'unknown' then 'pinkish' else 'courier' end;

  v_cod := coalesce(new.payment, '') ilike 'cash%';
  if not v_cod then return new; end if;   -- bKash / Nagad: their totals stay exactly as before

  v_fee := public.pk_zone_fee(v_lat, v_lng);
  select coalesce(sum(public.pk_num(i->>'price')::numeric * greatest(1, coalesce(public.pk_num(i->>'qty'), 1))::numeric), 0)
    into v_sub from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) i;

  -- coupon chosen in the cart (kept for 6 hours)
  if new.user_id is not null then
    select code into v_code from public.cart_coupons where user_id = new.user_id and set_at > now() - interval '6 hours';
    if v_code is not null then
      perform 1 from public.coupons where code = v_code for update;   -- serialise max_uses
      select * into r from public.pk_coupon_eval(v_code, new.user_id, new.items, true);
      if not r.ok then
        delete from public.cart_coupons where user_id = new.user_id;
        raise exception 'Coupon %: % Remove it in your cart and try again.', v_code, r.msg;
      end if;
      v_disc := least(r.discount, v_sub);
      v_free := r.free_delivery;
      new.coupon_code := v_code;
      new.discount := v_disc;
      if r.shop_id is not null and v_disc > 0 then
        new.shop_discounts := jsonb_build_object(r.shop_id::text, v_disc);
      end if;
    end if;
  end if;

  -- free delivery above the threshold (after the discount), in the chosen zones
  if not v_free and coalesce((v_cfg->>'free_over')::numeric, 0) > 0
     and v_sub - v_disc >= (v_cfg->>'free_over')::numeric
     and (v_cfg->'free_zones') ? v_zone then
    v_free := true;
  end if;
  if v_free then v_fee := 0; end if;
  new.free_delivery := v_free;

  new.total := greatest(0, round(coalesce(new.total, v_sub + v_old_fee) - v_old_fee + coalesce(v_fee, 0) - v_disc));
  new.delivery_fee := coalesce(v_fee, 0);
  return new;
end $$;

drop trigger if exists zz_pk_order_pricing on public.orders;
create trigger zz_pk_order_pricing before insert on public.orders
  for each row execute function public.pk_order_pricing();

create or replace function public.pk_order_coupon_used() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if new.coupon_code is null then return new; end if;
  select id into v_id from public.coupons where code = new.coupon_code;
  if v_id is not null then
    insert into public.coupon_redemptions (coupon_id, user_id, order_id, amount)
    values (v_id, new.user_id, new.id, coalesce(new.discount, 0)) on conflict do nothing;
    update public.coupons set used_count = used_count + 1 where id = v_id;
  end if;
  delete from public.cart_coupons where user_id = new.user_id;
  return new;
end $$;

drop trigger if exists zz_pk_order_coupon_used on public.orders;
create trigger zz_pk_order_coupon_used after insert on public.orders
  for each row when (new.coupon_code is not null) execute function public.pk_order_coupon_used();

-- a cancelled order gives the coupon use back
create or replace function public.pk_order_coupon_release() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.coupon_code is not null and coalesce(new.status, 0) = 4 and coalesce(old.status, 0) <> 4 then
    delete from public.coupon_redemptions where order_id = new.id;
    update public.coupons set used_count = greatest(0, used_count - 1) where code = new.coupon_code;
  end if;
  return new;
end $$;
drop trigger if exists zz_pk_order_coupon_release on public.orders;
create trigger zz_pk_order_coupon_release after update of status on public.orders
  for each row execute function public.pk_order_coupon_release();

-- ---------------------------------------------------------------------
-- 5. Wishlist alerts: back in stock + price drop
-- ---------------------------------------------------------------------
create index if not exists wishlists_product_idx on public.wishlists (product_id) where user_id is not null;
create index if not exists notifications_user_link_idx on public.notifications (user_id, link, created_at desc);

create or replace function public.pk_wishlist_alerts() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_title text; v_body text; v_link text := 'product:' || new.id::text; v_drop int;
begin
  if new.is_active is false then return new; end if;

  if coalesce(old.stock, 0) <= 0 and coalesce(new.stock, 0) > 0 then
    v_title := 'Back in stock: ' || left(new.name, 60);
    v_body  := 'An item on your wishlist is available again. Order before it sells out.';
  elsif new.price < old.price and old.price > 0 and (old.price - new.price) >= greatest(1, old.price * 0.03) then
    v_drop  := round((1 - new.price / old.price) * 100);
    v_title := 'Price drop: ' || left(new.name, 60);
    v_body  := format('Now ৳%s (was ৳%s, %s%% off). It is on your wishlist.', round(new.price)::int, round(old.price)::int, v_drop);
  else
    return new;
  end if;

  insert into public.notifications (user_id, title, body, link)
  select distinct w.user_id, v_title, v_body, v_link
  from public.wishlists w
  where w.product_id = new.id::text and w.user_id is not null
    and not exists (select 1 from public.notifications n
                    where n.user_id = w.user_id and n.link = v_link and n.title = v_title
                      and n.created_at > now() - interval '12 hours');
  return new;
exception when others then
  return new;   -- an alert must never block a stock or price change
end $$;

drop trigger if exists zz_pk_wishlist_alerts on public.products;
create trigger zz_pk_wishlist_alerts after update of price, stock on public.products
  for each row when (old.price is distinct from new.price or old.stock is distinct from new.stock)
  execute function public.pk_wishlist_alerts();

-- ---------------------------------------------------------------------
-- 6. Seller -> Pathao direct pickup (booked by Pinkish in Pinkish's own Pathao account)
--    The seller never sees the customer: only the order number, courier and consignment ID.
-- ---------------------------------------------------------------------
create table if not exists public.courier_handoffs (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete cascade,
  shop_id        uuid not null references public.shops(id) on delete cascade,
  courier        text not null default 'Pathao',
  consignment_id text,
  tracking_url   text check (tracking_url is null or tracking_url ~* '^https://'),
  note           text,
  status         text not null default 'booked' check (status in ('booked', 'handed', 'cancelled')),
  booked_at      timestamptz not null default now(),
  handed_at      timestamptz,
  created_by     uuid default auth.uid(),
  unique (order_id, shop_id)
);
create index if not exists courier_handoffs_shop_idx on public.courier_handoffs (shop_id, status);
alter table public.courier_handoffs enable row level security;

drop policy if exists ch_admin_all on public.courier_handoffs;
create policy ch_admin_all on public.courier_handoffs for all
  using (public.pk_is_admin()) with check (public.pk_is_admin());
drop policy if exists ch_seller_read on public.courier_handoffs;
create policy ch_seller_read on public.courier_handoffs for select
  using (shop_id = public.pk_my_shop());

-- Everything Seller Centre needs beyond the old RPCs: coupon discount on its items + Pathao pickups
create or replace function public.seller_extras()
returns table (order_id uuid, discount numeric, courier text, consignment_id text, tracking_url text,
               note text, ship_status text, booked_at timestamptz, handed_at timestamptz)
language sql stable security definer set search_path = public as $$
  with me as (select public.pk_my_shop() as sid)
  select o.id,
         coalesce(public.pk_num(o.shop_discounts->>(select sid::text from me))::numeric, 0),
         h.courier, h.consignment_id, h.tracking_url, h.note, h.status, h.booked_at, h.handed_at
  from public.orders o
  left join public.courier_handoffs h on h.order_id = o.id and h.shop_id = (select sid from me)
  where (select sid from me) is not null
    and (h.id is not null or o.shop_discounts ? (select sid::text from me))
  order by o.created_at desc
  limit 500
$$;

create or replace function public.seller_courier_handed(p_order uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_shop uuid := public.pk_my_shop(); v_n int;
begin
  if v_shop is null then raise exception 'Please sign in again.'; end if;
  update public.courier_handoffs set status = 'handed', handed_at = now()
   where order_id = p_order and shop_id = v_shop and status = 'booked';
  get diagnostics v_n = row_count;
  if v_n = 0 then return 'none'; end if;
  -- keep the existing handover record in step (columns from supabase-seller-ops.sql)
  begin
    update public.seller_handovers set status = 'picked', picked_at = now()
     where order_id = p_order and shop_id = v_shop and status in ('new', 'packed');
  exception when others then null;
  end;
  return 'ok';
end $$;

grant execute on function public.seller_extras(), public.seller_courier_handed(uuid) to authenticated;

-- Admin books a direct pickup for one shop of an order (also fills the customer's tracking if empty)
create or replace function public.admin_book_direct(p_order uuid, p_shop uuid, p_courier text, p_consignment text, p_url text default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_url text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if not public.pk_is_admin() then raise exception 'Not allowed'; end if;
  if length(btrim(coalesce(p_consignment, ''))) < 3 then raise exception 'Enter the consignment ID'; end if;
  if v_url is not null and v_url !~* '^https://' then v_url := null; end if;
  insert into public.courier_handoffs (order_id, shop_id, courier, consignment_id, tracking_url, note, status, booked_at)
  values (p_order, p_shop, left(coalesce(nullif(btrim(p_courier), ''), 'Pathao'), 30), left(btrim(p_consignment), 40), v_url, left(nullif(btrim(coalesce(p_note, '')), ''), 200), 'booked', now())
  on conflict (order_id, shop_id) do update
    set courier = excluded.courier, consignment_id = excluded.consignment_id, tracking_url = excluded.tracking_url,
        note = excluded.note, status = case when public.courier_handoffs.status = 'handed' then 'handed' else 'booked' end;
  begin
    update public.orders
       set courier_name = coalesce(nullif(courier_name, ''), left(coalesce(nullif(btrim(p_courier), ''), 'Pathao'), 30)),
           courier_tracking = coalesce(nullif(courier_tracking, ''), left(btrim(p_consignment), 40)),
           courier_url = coalesce(courier_url, v_url),
           courier_booked_at = coalesce(courier_booked_at, now()),
           delivery_mode = 'courier'
     where id = p_order;
  exception when undefined_column then null;   -- older orders table: the handoff itself is still saved
  end;
  begin
    insert into public.notifications (user_id, title, body, link)
    select s.owner_id, 'Pathao pickup booked', 'A Pathao rider will collect an order from your shop. Open Orders to see the details.', null
    from public.shops s where s.id = p_shop and s.owner_id is not null;
  exception when others then null;
  end;
end $$;
grant execute on function public.admin_book_direct(uuid, uuid, text, text, text, text) to authenticated;

-- live updates for the admin panel
do $$ begin
  alter publication supabase_realtime add table public.courier_handoffs;
exception when others then null; end $$;

-- ---------------------------------------------------------------------
-- 7. Quick self-test (read only). Expected: inner 40, city 60, outside 120, abroad null
-- ---------------------------------------------------------------------
-- select public.pk_delivery_zone(22.3411, 91.8428), public.pk_zone_fee(22.3411, 91.8428);   -- Bahaddarhat
-- select public.pk_delivery_zone(22.3330, 91.8120), public.pk_zone_fee(22.3330, 91.8120);   -- Agrabad
-- select public.pk_delivery_zone(23.8103, 90.4125), public.pk_zone_fee(23.8103, 90.4125);   -- Dhaka
