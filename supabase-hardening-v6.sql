-- =====================================================================
-- Pinkish hardening v6  (run AFTER supabase-marketplace-v5.sql)
--   1. Server-side guards: a tampered app cannot approve its own shop, move products between shops,
--      fake ratings, attach a wishlist to another customer, or write orders directly.
--   2. Rate limit on coupon checks (stops guessing private coupon codes).
--   3. Coupon use is counted again if a cancelled order is restored.
--   4. Faster Seller Centre (seller_extras) and indexes for every hot query.
--   5. Private document buckets with size and file-type limits.
--   6. A security report at the end (tables without RLS, unsafe functions).
-- Safe to run more than once. Nothing here deletes data.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Helper: is this a request made directly by the app (not by one of Pinkish's own
--    SECURITY DEFINER functions, which run as the function owner)?
-- ---------------------------------------------------------------------
create or replace function public.pk_direct() returns boolean
language sql stable as $$
  select current_user in ('authenticated', 'anon')
$$;

-- ---------------------------------------------------------------------
-- 1. Rate limiter (fixed window, per key). Only callable from Pinkish's own functions.
-- ---------------------------------------------------------------------
create table if not exists public.pk_rate (
  k   text primary key,
  win timestamptz not null default now(),
  n   integer not null default 0
);
alter table public.pk_rate enable row level security;   -- no policies: the app can never read or write it

create or replace function public.pk_rate_ok(p_key text, p_max int, p_secs int) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  insert into public.pk_rate (k, win, n) values (p_key, now(), 1)
  on conflict (k) do update
    set n   = case when public.pk_rate.win < now() - make_interval(secs => p_secs) then 1 else public.pk_rate.n + 1 end,
        win = case when public.pk_rate.win < now() - make_interval(secs => p_secs) then now() else public.pk_rate.win end
  returning n into v_n;
  if random() < 0.01 then delete from public.pk_rate where win < now() - interval '1 day'; end if;   -- tidy up now and then
  return v_n <= p_max;
end $$;
revoke execute on function public.pk_rate_ok(text, int, int) from public, anon, authenticated;

-- apply_coupon: same as v5, plus at most 15 code checks per customer per 10 minutes.
-- A refused code is RETURNED as {"error": "..."} instead of raised: raising would roll back the
-- try counter as well, and failed guesses are exactly what must be counted. (api.js reads "error".)
create or replace function public.apply_coupon(p_code text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_uid uuid := auth.uid(); v_code text := upper(btrim(coalesce(p_code, '')));
begin
  if v_uid is null then return jsonb_build_object('error', 'Please sign in to use a coupon.'); end if;
  if not public.pk_rate_ok('coupon:' || v_uid::text, 15, 600) then
    return jsonb_build_object('error', 'Too many coupon tries. Wait 10 minutes and try again.');
  end if;
  if v_code !~ '^[A-Z0-9]{3,20}$' then return jsonb_build_object('error', 'This coupon code is not valid.'); end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) is distinct from 'array' then
    return jsonb_build_object('error', 'Your cart could not be read. Refresh and try again.');
  end if;
  if jsonb_array_length(p_items) > 100 then
    return jsonb_build_object('error', 'Your cart could not be read. Refresh and try again.');
  end if;
  select * into r from public.pk_coupon_eval(v_code, v_uid, p_items, false);
  if not r.ok then return jsonb_build_object('error', r.msg); end if;
  insert into public.cart_coupons (user_id, code, set_at) values (v_uid, v_code, now())
  on conflict (user_id) do update set code = excluded.code, set_at = now();
  return jsonb_build_object('code', v_code, 'discount', r.discount, 'free_delivery', r.free_delivery,
                            'shop_id', r.shop_id, 'title', r.title, 'base', r.base);
end $$;
grant execute on function public.apply_coupon(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Coupons: cancel gives the use back (v5); restoring the order takes it again (new)
-- ---------------------------------------------------------------------
create or replace function public.pk_order_coupon_release() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if new.coupon_code is null then return new; end if;
  if coalesce(new.status, 0) = 4 and coalesce(old.status, 0) <> 4 then
    delete from public.coupon_redemptions where order_id = new.id;
    update public.coupons set used_count = greatest(0, used_count - 1) where code = new.coupon_code;
  elsif coalesce(old.status, 0) = 4 and coalesce(new.status, 0) <> 4 then
    select id into v_id from public.coupons where code = new.coupon_code;
    if v_id is not null then
      insert into public.coupon_redemptions (coupon_id, user_id, order_id, amount)
      values (v_id, new.user_id, new.id, coalesce(new.discount, 0)) on conflict do nothing;
      update public.coupons set used_count = used_count + 1 where id = v_id;
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 3. Shops: sellers edit their profile, but never their own approval
-- ---------------------------------------------------------------------
create or replace function public.pk_shop_guard() returns trigger
language plpgsql as $$
declare o jsonb; keep jsonb := '{}'::jsonb; k text;
begin
  if not public.pk_direct() or public.pk_is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    keep := jsonb_build_object('status', 'pending', 'owner_id', auth.uid());
    if to_jsonb(new) ? 'reject_reason' then keep := keep || jsonb_build_object('reject_reason', null); end if;
    if to_jsonb(new) ? 'contact_ok'    then keep := keep || jsonb_build_object('contact_ok', false); end if;
    new := jsonb_populate_record(new, keep);
    return new;
  end if;
  o := to_jsonb(old);
  -- columns a seller may never change
  foreach k in array array['owner_id', 'slug', 'created_at', 'reject_reason', 'approved_at', 'approved_by', 'verified', 'commission'] loop
    if o ? k then keep := keep || jsonb_build_object(k, o -> k); end if;
  end loop;
  if o ? 'contact_ok' then keep := keep || jsonb_build_object('contact_ok', false); end if;
  -- status: unchanged, or a rejected shop sent back for review
  if new.status is distinct from old.status and not (old.status = 'rejected' and new.status = 'pending') then
    keep := keep || jsonb_build_object('status', old.status);
  end if;
  new := jsonb_populate_record(new, keep);
  return new;
end $$;
drop trigger if exists aa_pk_shop_guard on public.shops;
create trigger aa_pk_shop_guard before insert or update on public.shops
  for each row execute function public.pk_shop_guard();

-- ---------------------------------------------------------------------
-- 4. Wishlists: a row always belongs to whoever is signed in (or nobody, for guests)
-- ---------------------------------------------------------------------
create or replace function public.pk_wish_guard() returns trigger
language plpgsql as $$
begin
  if public.pk_direct() and not public.pk_is_admin() then new.user_id := auth.uid(); end if;
  return new;
end $$;
do $$ begin
  drop trigger if exists aa_pk_wish_guard on public.wishlists;
  create trigger aa_pk_wish_guard before insert or update on public.wishlists
    for each row execute function public.pk_wish_guard();
exception when undefined_table then raise notice 'wishlists table not found: skipped';
end $$;

-- ---------------------------------------------------------------------
-- 5. Products and orders: only installed when it cannot break an older function.
--    If an older function writes these tables WITHOUT security definer, it runs as the customer,
--    so a strict guard would block it. The script then skips the guard and tells you which function to fix.
-- ---------------------------------------------------------------------
create or replace function public.pk_product_guard() returns trigger
language plpgsql as $$
declare o jsonb; keep jsonb := '{}'::jsonb; k text;
begin
  if not public.pk_direct() or public.pk_is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    if to_jsonb(new) ? 'rating'  then keep := keep || jsonb_build_object('rating', null); end if;
    if to_jsonb(new) ? 'reviews' then keep := keep || jsonb_build_object('reviews', 0); end if;
  else
    o := to_jsonb(old);
    foreach k in array array['shop_id', 'rating', 'reviews', 'created_at'] loop
      if o ? k then keep := keep || jsonb_build_object(k, o -> k); end if;
    end loop;
  end if;
  new := jsonb_populate_record(new, keep);
  return new;
end $$;

create or replace function public.pk_order_guard() returns trigger
language plpgsql as $$
begin
  if public.pk_direct() and not public.pk_is_admin() then
    raise exception 'Orders can only be changed through Pinkish checkout.' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

do $$
declare bad text;
begin
  -- products
  select string_agg(distinct p.proname, ', ') into bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and not p.prosecdef and p.prokind = 'f'
    and p.prosrc ~* '(update|insert\s+into)\s+(public\.)?products\M';
  if bad is null then
    drop trigger if exists aa_pk_product_guard on public.products;
    create trigger aa_pk_product_guard before insert or update on public.products
      for each row execute function public.pk_product_guard();
    raise notice 'OK: product guard installed';
  else
    raise notice 'SKIPPED product guard: % write products without SECURITY DEFINER. Make them security definer, then run this file again.', bad;
  end if;

  -- orders
  select string_agg(distinct p.proname, ', ') into bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and not p.prosecdef and p.prokind = 'f'
    and p.prosrc ~* '(update|insert\s+into|delete\s+from)\s+(public\.)?orders\M';
  if bad is null then
    drop trigger if exists aa_pk_order_guard on public.orders;
    create trigger aa_pk_order_guard before insert or update or delete on public.orders
      for each row execute function public.pk_order_guard();
    raise notice 'OK: order guard installed (orders are written only by place_order / admin / rider functions)';
  else
    raise notice 'SKIPPED order guard: % write orders without SECURITY DEFINER. Make them security definer, then run this file again.', bad;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. Faster Seller Centre: two index lookups instead of scanning every order
-- ---------------------------------------------------------------------
create or replace function public.seller_extras()
returns table (order_id uuid, discount numeric, courier text, consignment_id text, tracking_url text,
               note text, ship_status text, booked_at timestamptz, handed_at timestamptz)
language sql stable security definer set search_path = public as $$
  with me as (select public.pk_my_shop() as sid),
  ids as (
    select h.order_id as id from public.courier_handoffs h where h.shop_id = (select sid from me)
    union
    select o.id from public.orders o where o.shop_discounts ? (select sid::text from me)
  )
  select o.id,
         coalesce(public.pk_num(o.shop_discounts->>(select sid::text from me))::numeric, 0),
         h.courier, h.consignment_id, h.tracking_url, h.note, h.status, h.booked_at, h.handed_at
  from ids
  join public.orders o on o.id = ids.id
  left join public.courier_handoffs h on h.order_id = o.id and h.shop_id = (select sid from me)
  where (select sid from me) is not null
  order by o.created_at desc
  limit 500
$$;
grant execute on function public.seller_extras() to authenticated;

-- ---------------------------------------------------------------------
-- 7. Indexes for every hot query (each one is skipped if a matching index or the table is missing)
-- ---------------------------------------------------------------------
do $$
declare
  ix text[]; spec text[][] := array[
    -- table,               name,                          definition
    array['orders',           'pk_orders_user_created',       '(user_id, created_at desc)'],
    array['orders',           'pk_orders_paystatus_created',  '(payment_status, created_at desc)'],
    array['orders',           'pk_orders_order_no',           '(order_no)'],
    array['orders',           'pk_orders_shopdisc_gin',       'using gin (shop_discounts)'],
    array['coupon_redemptions','pk_coupon_red_order',         '(order_id)'],
    array['products',         'pk_products_created',          '(created_at desc)'],
    array['products',         'pk_products_shop_created',     '(shop_id, created_at desc)'],
    array['shops',            'pk_shops_owner',               '(owner_id)'],
    array['shops',            'pk_shops_status',              '(status)'],
    array['notifications',    'pk_notif_user_created',        '(user_id, created_at desc)'],
    array['shop_follows',     'pk_follows_user',              '(user_id)'],
    array['shop_follows',     'pk_follows_shop',              '(shop_id)'],
    array['product_questions','pk_pq_product_created',        '(product_id, created_at desc)'],
    array['return_requests',  'pk_ret_user_created',          '(user_id, created_at desc)'],
    array['wishlists',        'pk_wish_user',                 '(user_id)'],
    array['seller_handovers', 'pk_ho_shop',                   '(shop_id)'],
    array['seller_handovers', 'pk_ho_order',                  '(order_id)'],
    array['deliveries',       'pk_dl_order',                  '(order_id)'],
    array['deliveries',       'pk_dl_rider_status',           '(rider_id, status)']
  ];
  t text; nm text; def text; lead text;
begin
  for i in 1 .. array_length(spec, 1) loop
    t := spec[i][1]; nm := spec[i][2]; def := spec[i][3];
    if to_regclass('public.' || t) is null then continue; end if;
    -- skip when an index on the same leading column already exists
    lead := substring(def from '\(\s*([a-z_]+)');
    if def not like 'using%' and exists (
         select 1 from pg_indexes where schemaname = 'public' and tablename = t
           and indexdef ~* ('\(\s*' || lead || '\M') and indexname <> nm) then
      continue;
    end if;
    begin
      execute format('create index if not exists %I on public.%I %s', nm, t, def);
    exception when others then raise notice 'index % on % skipped: %', nm, t, sqlerrm;
    end;
  end loop;
end $$;

analyze public.orders;
analyze public.products;
analyze public.shops;

-- ---------------------------------------------------------------------
-- 8. Storage: documents are private, with size and type limits on every bucket
-- ---------------------------------------------------------------------
do $$ begin
  update storage.buckets set public = false, file_size_limit = 20971520,
         allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
   where id in ('seller-docs', 'rider-docs');
  update storage.buckets set file_size_limit = 10485760,
         allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
   where id = 'media';
exception when others then raise notice 'storage limits skipped: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- 9. Security report (read only): fix anything listed here
-- ---------------------------------------------------------------------
do $$
declare r record; n int := 0;
begin
  for r in select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
           where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity loop
    raise notice 'RISK: table public.% has row level security OFF. Anyone with the public key can read or change it.', r.relname; n := n + 1;
  end loop;
  for r in select p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and p.prosecdef
             and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') loop
    raise notice 'RISK: security definer function %() has no fixed search_path. Add "set search_path = public".', r.proname; n := n + 1;
  end loop;
  for r in select id from storage.buckets where public and id in ('seller-docs', 'rider-docs') loop
    raise notice 'RISK: storage bucket % is public. NID photos must be private.', r.id; n := n + 1;
  end loop;
  if n = 0 then raise notice 'Security report: no problems found.'; end if;
exception when others then raise notice 'security report could not finish: %', sqlerrm;
end $$;
