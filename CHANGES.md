# Pinkish hardening v6

## Deploy order
1. Supabase SQL editor: run `sql/supabase-hardening-v6.sql` (after v5). Read the NOTICE lines it prints.
2. Replace the 6 frontend files (same paths as your project) and deploy.
   Do both together: `apply_coupon` now returns refused codes as `{ error }`, and the new api.js reads that.

## Security (tested against Postgres)
- Sellers could approve their own shop, insert a shop as "approved", move products to another shop and set fake ratings by calling the API directly. Now blocked by triggers (`pk_shop_guard`, `pk_product_guard`).
- Orders can no longer be inserted, edited or deleted directly by customers; only through place_order / place_bkash_order / admin / rider functions (`pk_order_guard`). Installed only if no older function would break; otherwise the script names it.
- Wishlist rows always belong to the signed-in user (stops sending alerts to someone else).
- Coupon checks are rate-limited: 15 tries per 10 minutes per customer (stops guessing private codes).
- NID buckets forced private; 20 MB and image/PDF-only limits; product media 10 MB, images only.
- App.jsx: removed the leftover direct `orders.insert` that sent browser-made prices.
- Admin: refuses to open inside a frame; stored notification list (customer names, totals) is wiped on sign-out, idle sign-out and account switch.
- Leaflet map script and CSS pinned with Subresource Integrity hashes.
- The SQL ends with a security report: tables without RLS, definer functions without search_path, public document buckets.

## Reliability
- Every Supabase request has a time limit (reads 20 s, writes 60 s, uploads 3 min); reads retry once after a network drop. Writes are never retried, so no double orders.
- Admin access check retries and shows "Connection problem" instead of wrongly saying "No admin access" on bad internet; hourly token refresh no longer re-checks and re-renders the panel.
- Cancelled-then-restored orders count their coupon use again.
- Rider jobs, Seller Centre refresh and live-map polling no longer stack duplicate requests on slow networks.

## Speed
- Store: full catalogue re-download every 30 s replaced by realtime + a 2-minute safety poll.
- Order tracking polls pause when the tab is hidden or offline.
- Admin: realtime bursts merged into one reload (1.2 s window).
- `seller_extras()` uses two index lookups instead of scanning every order.
- New indexes on orders, products, shops, notifications, follows, questions, returns, wishlists, handovers, deliveries (skipped when one already exists).
