# Pinkish v5: delivery zones, coupons, alerts, Pathao direct

## Install (about 5 minutes)
1. **Supabase → SQL editor → run `supabase-marketplace-v5.sql`** (safe to run again).
   Read the messages at the bottom:
   - `delivery_fee_for(...) now uses the new delivery zones` = good.
   - A `CHECK:` or `NOT changed` message = send it to your developer before going live.
2. Copy the files in `src/` over your project (same folders), then build and deploy as usual.
3. Test: pin a Dhaka address and place a Cash on Delivery order. It should be **৳120** and go through.

## What changed
| Area | What it does |
|---|---|
| Delivery | ৳40 within 4 km of Bahaddarhat (Pinkish rider) · ৳60 rest of Chattogram city · ৳120 rest of Bangladesh (Pathao). Customers must pin their location; the server re-checks every order. Edit prices in **Admin → Promotions**. |
| Free delivery | Admin sets "free over ৳X" and which zones. Cart shows a progress bar. |
| Coupons | Admin: store-wide (% / ৳ / free delivery, first order, limits). Sellers: shop-only coupons in **Seller Centre → Shop** (shop pays). Shown in cart, product and shop pages. Server-checked. |
| Pathao direct | Admin → order → *Direct from seller*: book Pathao with the seller as pickup point, enter the consignment ID. Seller sees only order no + consignment ID and taps **Handed to Pathao**. |
| No delivery code | Riders no longer ask customers for a code (Admin → Riders → Rider rules can turn it back on). |
| Search | Typo tolerant ("lipstik", "parfume"), "Did you mean", rating filter (★4+/★3+). |
| Wishlist alerts | Back-in-stock and price-drop (≥3%) notifications, max one per 12 h per item. |
| Shop discovery | "More from this shop" and "Recently viewed" on product pages, recently viewed in search. |

Coupons and free delivery apply to **Cash on Delivery** only; bKash / Nagad code is unchanged.
