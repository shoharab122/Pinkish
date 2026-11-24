# Pinkish security hardening

## Why most fixes are in the database

The Supabase anon key is in every browser. Anyone can open DevTools and call `supabase.from('shops').update({ status: 'approved' })` directly, which skips every check in the React code. So the real protection lives in `supabase/security-hardening.sql`. The frontend changes add a second layer and fix leaks in the browser itself.

## How to apply

1. **Back up first:** Supabase Dashboard → Database → Backups (or `pg_dump`).
2. Open the SQL editor and run `supabase/security-hardening.sql` once. It is a single transaction, so on any error nothing changes. It is safe to run again.
3. Look at the result grid at the end. **No rows means every check passed.** Fix any row it shows.
4. Replace the frontend files with the ones in `src/`.
5. Add `public/_headers` (Netlify / Cloudflare Pages) **or** `vercel.json` (Vercel), depending on where you host.
6. Supabase Dashboard settings (these cannot be set from SQL):
   - Auth → Providers → Email: **minimum password length 8**, turn on **leaked password protection**, keep **Confirm email** on.
   - Auth → URL Configuration: under Redirect URLs, list only `https://<your-domain>` and `https://<your-domain>/merchant`. Remove `*` wildcards and `localhost` in production.
   - Auth → Rate Limits: keep the defaults or lower them.
   - Turn on **MFA** for every admin account.
   - Never put the `service_role` key in any `VITE_` variable.

## What was fixed

### Critical (the database could be changed from the browser console)
| # | Issue | Fix |
|---|---|---|
| 1 | A seller could approve their own shop (`status: 'approved'`) or clear a rejection | `zz_sec_shops_guard` trigger: the only status change a seller can make is rejected → pending |
| 2 | A seller could swap their NID number or document after approval | NID and document can only change while fixing a rejected application. The document path must be in the seller's own folder |
| 3 | Sellers could set fake `rating`/`reviews`, move products into another shop, use negative price multipliers (negative order totals), or run a "deal" with no end date | `zz_sec_products_guard` trigger plus owner-only RLS |
| 4 | The storefront fell back to reading the `shops` table, which holds NID numbers, phones and addresses | `shops` is now owner + admin only. The public reads `shops_public`, a view with safe columns only |
| 5 | `App.jsx` inserted rows straight into `orders` (any total, any status) | Removed. Orders are created only by `place_order()` / `place_bkash_order()`. There is no insert policy on `orders` |
| 6 | Old permissive policies could keep holes open (Postgres ORs permissive policies together) | The script drops every policy on the 11 app tables, then recreates a minimal set |
| 7 | Seller orders sent the customer's full address to the browser and only hid it on screen | `seller_orders()` rewritten: only the seller's own lines and the delivery area |

### High
| # | Issue | Fix |
|---|---|---|
| 8 | Storage: any user could upload into any shop's folder, or upload HTML/SVG files | Bucket MIME allow-lists and a 10 MB limit. Sellers can only write to `media/shops/<own approved shop>/`. NID docs: upload to your own folder only, read by admins only. Nobody can list the bucket |
| 9 | Notifications: users could rewrite title/body/link (phishing links) | Trigger: users can only flip `is_read` |
| 10 | Questions: askers could post as another user or pre-fill a fake seller answer | Trigger forces `user_id = auth.uid()` and `answer = null` |
| 11 | Leaflet was loaded from a CDN without integrity checks (a CDN compromise would run code on checkout) | Subresource Integrity hashes + `crossorigin` |
| 12 | No security headers (clickjacking, script injection) | CSP, HSTS, `X-Frame-Options`, `nosniff`, Referrer-Policy, Permissions-Policy |
| 13 | SECURITY DEFINER functions without a fixed `search_path` (classic privilege escalation) | All are pinned to `public, extensions, pg_temp` |
| 14 | Private RPCs could be called by signed-out visitors | `execute` revoked from `anon` for order, seller and admin RPCs |

### Medium / privacy
- **Hero banner:** images are accepted only from your own storage bucket, and links only with `https://`. This is checked on admin save, in a database trigger, and again when the storefront reads it.
- **Payment redirect:** only followed to known bKash/Nagad hosts (`PAY_HOSTS` in `api.js`).
- **Auth redirects:** pinned to your own domain.
- **Passwords:** one rule everywhere (8+ characters, letters and numbers). The customer app used to accept 6.
- **Password reset:** gives the same answer whether or not the email exists, so it can no longer be used to find out who has an account.
- **Public photos:** always re-encoded, which strips EXIF/GPS location data. Before, an original photo could be uploaded with its GPS data.
- **NID PDF:** the file's header bytes are checked (a renamed file is refused). Signed links now expire after 2 minutes, and paths are validated before a link is made.
- **Wishlist analytics:** no longer copies the customer's phone number.
- **Sign-out:** clears cached user data, the seller draft (shop phone and address), the admin activity log and the delivery name/phone.
- **Owner filters:** owner-scoped `.eq()` filters and ID checks added on seller writes (defense in depth).
- **Search engines:** Seller Centre and admin are marked `noindex`.

## Tested

The SQL was run on PostgreSQL 16 with a mock Supabase schema (roles, `auth.uid()`, storage), then attacked as an anonymous visitor, a customer, a rejected seller, an approved seller and an admin. 30 scenarios were tested and every attack was refused: self-approval, admin self-grant, fake order inserts, changing an order to paid, reading other shops' NIDs, cross-shop uploads, fake ratings, negative multipliers, year-long deals, tracking-pixel images and notification tampering. Legitimate actions still worked: ordering through the RPC (stock decremented), resubmitting, valid deals, hide/show, uploads and admin approval. Running the script a second time made no further changes. All JS/JSX files bundle cleanly with esbuild.

## Still on you (things I could not see)
- **`place_order`, `place_bkash_order`, `track_order`, `answer_question`, `seller_questions`, `admin_broadcast`:** I did not have their source. The script refuses to run if the order functions are not SECURITY DEFINER, and the audit grid flags obvious gaps. Confirm that `track_order` requires the phone number to match, and that `admin_broadcast` checks `is_admin()`.
- **`pay-create` Edge Function and the payment callback:** these must verify the gateway signature server-side before marking an order `paid`.
- **CSP:** if `index.html` has inline `<script>` tags, move them into a `.js` file or the CSP will block them. If you use a custom Supabase domain, add it to `connect-src` and `img-src`.
- **Guest wishlist rows:** anyone can delete them. This is analytics data only. Fixing it fully needs an RPC.
- **Renaming an approved shop:** an approved seller can still rename the shop without review. Add a re-review rule if impersonation becomes a problem.
- `/adminmainpath` is obscurity, not protection. The protection is the `admins` table with RLS, plus MFA.
