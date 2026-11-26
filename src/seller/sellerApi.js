import { supabase } from '../api.js'

const s = (v, m = 200) => String(v ?? '').trim().slice(0, m)
const need = () => { if (!supabase) throw new Error('The store is not configured. Please try again later.') }
const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(3)), b => b.toString(16).padStart(2, '0')).join('')
const ext = f => ((f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5)) || 'jpg'
const slugify = n => (s(n, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'shop') + '-' + rand()
import { validNid, cleanNid } from '../lib/nid.js'
export { validNid }
const nidOf = f => cleanNid(f?.nid)
export const validPhone = p => /^(\+?88)?01[3-9]\d{8}$/.test(String(p || '').replace(/[\s-]/g, ''))
// tel: links only ever get digits and a leading + (used for "Call rider")
export const telHref = p => { const n = String(p || '').replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '').slice(0, 16); return n.length >= 6 ? 'tel:' + n : '' }
// Database / network errors become a short message a seller understands (no SQL text on screen)
const TECH = /violates|row-level|relation|column|syntax|permission denied|pgrst|null value|duplicate key|constraint|uuid|invalid input/i
const fail = (e, fb = 'Something went wrong. Please try again.') => {
  const m = String(e?.message || e || '')
  if (/failed to fetch|network|load failed/i.test(m)) return new Error('No internet connection. Check your data and try again.')
  if (/jwt|not authenticated|refresh token/i.test(m)) return new Error('Please log in again.')
  if (/row-level|permission denied/i.test(m)) return new Error('You are not allowed to do that. Refresh and try again.')
  return new Error(m && m.length < 220 && !TECH.test(m) ? m : fb)
}
// Sellers sell only through Pinkish: no phone numbers, messenger names or links in public text.
// The same rule runs in the database (supabase-seller-ops.sql), this just gives a quick, friendly message.
const BN = '০১২৩৪৫৬৭৮৯'
export const hasContact = t => {
  const x = String(t || '').toLowerCase().replace(/[০-৯]/g, d => BN.indexOf(d))
  return /01[3-9]\d{8}/.test(x.replace(/(\d)[\s.()-]+(?=\d)/g, '$1')) || /(whats ?app|wa\.me|viber|telegram|t\.me\/|\bimo\b|messenger|m\.me\/|facebook\.com|fb\.com|instagram\.com|https?:\/\/|www\.|হোয়াটস|ইমো)/.test(x)
}
const noContact = (what, ...v) => { if (v.some(hasContact)) throw new Error(`${what} cannot include phone numbers, WhatsApp or links. Customers order and pay through Pinkish.`) }

const isImg = f => !!f && (/^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(f.name || ''))
function checkFile(f, { doc = false } = {}) {
  if (doc) {
    if (!f || !(isImg(f) || f.type === 'application/pdf')) throw new Error('Upload a photo or PDF file.')
    if (f.size > 10 * 1024 * 1024) throw new Error('File is too large (max 10 MB).')
    return
  }
  if (!isImg(f)) throw new Error('Choose a picture (any photo or image).')
  if (f.size > 30 * 1024 * 1024) throw new Error('Picture is too large (max 30 MB).')
}
// Any picture in, a small optimised WebP out: resized to maxDim, EXIF-rotated, white behind transparency.
// If the browser cannot decode the file (e.g. HEIC on some devices) the original is uploaded as-is when small enough.
async function prepareImage(file, maxDim = 1600, quality = 0.84) {
  try {
    let bmp
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { bmp = await createImageBitmap(file) }
    const r = Math.min(1, maxDim / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(bmp.width * r)); c.height = Math.max(1, Math.round(bmp.height * r))
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height)
    if (bmp.close) bmp.close()
    const enc = (t, q) => new Promise(res => c.toBlob(res, t, q))
    // Some phones (iPhone Safari, older Android browsers) cannot encode WebP and silently hand back a PNG.
    // Trust the type the browser really produced, and fall back to JPEG, which every device and browser can show.
    let blob = await enc('image/webp', quality)
    if (!blob || !blob.size || blob.type !== 'image/webp') blob = await enc('image/jpeg', Math.min(0.9, quality + 0.04))
    if (blob && blob.size && /^image\/(webp|jpeg)$/.test(blob.type)) return { blob, type: blob.type, ext: blob.type === 'image/webp' ? 'webp' : 'jpg' }
  } catch { /* fall through */ }
  if (file.size > 5 * 1024 * 1024 || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('This picture format is not supported on your device. Try a JPG or PNG.')
  return { blob: file, type: file.type, ext: ext(file) }
}
// Photos are compressed the moment they are picked (while the seller fills in the form), so Save only has to upload.
const READY = new WeakSet()
export async function preparePhoto(file) {
  checkFile(file)
  const o = await prepareImage(file, 1000)
  const out = new File([o.blob], 'photo.' + o.ext, { type: o.type })
  READY.add(out)
  return out
}
// Tells any open store tab (same browser) to refresh its product list right now.
let bc
const announce = () => { try { bc = bc || new BroadcastChannel('pk-products'); bc.postMessage(Date.now()) } catch { /* not supported */ } }
const cleanPhone = p => { let n = String(p || '').replace(/\D/g, ''); if (n.startsWith('880')) n = n.slice(2); return n.slice(0, 11) }
const cleanShop = f => ({ name: s(f.name, 60), description: s(f.description, 500), phone: cleanPhone(f.phone), address: s(f.address, 300), city: s(f.city, 60) })
function checkShop(c) {
  if (c.name.length < 3) throw new Error('Shop name must be at least 3 characters.')
  noContact('Shop name and description', c.name, c.description)
  if (!validPhone(c.phone)) throw new Error('Enter a valid Bangladeshi mobile number.')
  if (c.address.length < 8) throw new Error('Enter your full business address.')
}
async function uploadDoc(uid, file) {
  checkFile(file, { doc: true })
  const o = file.type === 'application/pdf' ? { blob: file, type: file.type, ext: 'pdf' } : await prepareImage(file, 2000, 0.9)
  const path = `${uid}/${Date.now()}-${rand()}-id.${o.ext}`
  let err
  for (let a = 0; a < 3; a++) {
    const { error } = await supabase.storage.from('seller-docs').upload(path, o.blob, { contentType: o.type, upsert: false })
    if (!error) return path
    err = error
    if (/row-level|not allowed|mime|too large|exceeded/i.test(String(error.message))) break
    await new Promise(r => setTimeout(r, 700 * (a + 1)))
  }
  throw fail(err, 'Could not upload your NID photo. Check your internet and try again.')
}

export async function getMyShop(uid) {
  need()
  const { data, error } = await supabase.from('shops').select('*').eq('owner_id', uid).maybeSingle()
  if (error) throw fail(error, 'Could not load your shop. Please try again.')
  return data
}
export async function createShop(uid, form, docFile) {
  need(); const c = cleanShop(form); checkShop(c)
  const nid = nidOf(form); if (!validNid(nid)) throw new Error('Enter your NID number (10, 13 or 17 digits).')
  const id_doc_path = await uploadDoc(uid, docFile)
  const { data, error } = await supabase.from('shops').insert({ ...c, nid_number: nid, owner_id: uid, slug: slugify(c.name), id_doc_path, status: 'pending' }).select().single()
  if (error) throw /duplicate|unique/i.test(error.message) ? new Error('You already have a shop.') : fail(error, 'Could not create your shop. Please try again.')
  return data
}
// Rejected sellers fix their details and send the shop for review again.
export async function resubmitShop(uid, shop, form, docFile) {
  need(); const c = cleanShop(form); checkShop(c)
  const patch = { ...c, status: 'pending' }
  const nid = nidOf(form); if (nid) { if (!validNid(nid)) throw new Error('NID number must be 10, 13 or 17 digits.'); patch.nid_number = nid }
  if (docFile) patch.id_doc_path = await uploadDoc(uid, docFile)
  const { data, error } = await supabase.from('shops').update(patch).eq('id', shop.id).select().single()
  if (error) throw fail(error, 'Could not resubmit your shop. Please try again.')
  return data
}
// logoFile / coverFile: a File to replace the picture, or null to leave it. removeCover() clears the cover.
export async function updateShop(shop, form, logoFile, coverFile) {
  need(); const c = cleanShop(form); checkShop(c)
  const patch = { ...c }
  // direct customer contact is not allowed: the switch stays off
  if ('contact_ok' in shop) patch.contact_ok = false
  // logo and cover upload at the same time
  const [logo, cover] = await Promise.all([logoFile ? uploadImage(shop.id, logoFile, 600) : null, coverFile ? uploadImage(shop.id, coverFile, 1800) : null])
  if (logo) patch.logo_url = logo
  if (cover) patch.cover_url = cover
  const { data, error } = await supabase.from('shops').update(patch).eq('id', shop.id).select().single()
  if (error) throw /cover_url/i.test(error.message) ? error : fail(error, 'Could not save your shop details. Please try again.')
  return data
}
export async function removeCover(shop) {
  need()
  const { data, error } = await supabase.from('shops').update({ cover_url: null }).eq('id', shop.id).select().single()
  if (error) throw fail(error, 'Could not remove the cover picture.')
  return data
}
export async function uploadImage(shopId, file, maxDim = 1000) {
  need(); checkFile(file)
  const o = READY.has(file) ? { blob: file, type: file.type, ext: file.type === 'image/webp' ? 'webp' : 'jpg' } : await prepareImage(file, maxDim)
  const path = `shops/${shopId}/${Date.now()}-${rand()}.${o.ext}`
  // a flaky mobile connection is the usual reason a photo goes missing: retry before giving up
  let err
  for (let a = 0; a < 3; a++) {
    const { error } = await supabase.storage.from('media').upload(path, o.blob, { contentType: o.type, cacheControl: '31536000' })
    if (!error) { err = null; break }
    err = error; await new Promise(r => setTimeout(r, 600 * (a + 1)))
  }
  if (err) throw new Error('Could not upload the picture. Check your internet and try again.')
  const url = supabase.storage.from('media').getPublicUrl(path).data.publicUrl
  if (!url) throw new Error('Could not upload the picture. Please try again.')
  return url
}
export async function getCategoriesList() {
  need(); const { data } = await supabase.from('categories').select('id,name,icon').order('created_at'); return data || []
}
export async function myProducts(shopId) {
  need()
  const { data, error } = await supabase.from('products').select('*').eq('shop_id', shopId).order('created_at', { ascending: false })
  if (error) throw fail(error, 'Could not load your products. Please try again.')
  return data || []
}
export const PHOTOS = 4
// Photos already saved on a product (older products only have the single cover image_url).
export const existingImages = p => (Array.isArray(p?.images) && p.images.filter(Boolean).length ? p.images.filter(Boolean) : p?.image_url ? [p.image_url] : [])
// photos: array of 4 slots (File or null). Pass null to leave a product's photos untouched (e.g. hide/show toggle).
// base: a product whose saved photos fill empty slots of a NEW product (used by "Duplicate").
export async function saveProduct(shop, form, photos, existing, base = null) {
  need()
  const price = Number(form.price), stock = parseInt(form.stock, 10)
  if (s(form.name, 120).length < 2) throw new Error('Product name is required.')
  if (!form.category_id) throw new Error('Choose a category.')
  noContact('Product details', form.name, form.brand, form.tag)
  if (!Number.isFinite(price) || price <= 0 || price > 10000000) throw new Error('Enter a valid price.')
  if (!Number.isInteger(stock) || stock < 0 || stock > 100000) throw new Error('Enter a valid stock quantity.')
  const row = { name: s(form.name, 120), brand: s(form.brand, 60) || null, tag: s(form.tag, 30) || null, category_id: form.category_id, price, stock, is_active: form.is_active !== false }
  if (photos) {
    const old = existingImages(existing || base)
    const slots = Array.from({ length: PHOTOS }, (_, i) => photos[i] || null)
    if (slots.some((f, i) => !f && !old[i])) throw new Error(`Add all ${PHOTOS} product photos.`)
    slots.forEach(f => f && checkFile(f))
    const urls = await Promise.all(slots.map((f, i) => (f ? uploadImage(shop.id, f) : old[i])))
    row.images = urls
    row.image_url = urls[0]
  }
  // Flash deal: only touched when the form sends dealPrice (so the hide/show toggle never resets a running deal).
  // price = live price, old_price = regular price shown crossed out, deal_ends_at = when the price goes back.
  if ('dealPrice' in form) {
    const dp = form.dealPrice === '' || form.dealPrice == null ? null : Number(form.dealPrice)
    if (dp == null) { row.old_price = null; row.deal_ends_at = null }
    else {
      const end = new Date(form.dealEnds)
      if (!Number.isFinite(dp) || dp <= 0 || dp >= price) throw new Error('Deal price must be lower than the regular price.')
      if (!form.dealEnds || isNaN(end) || end.getTime() <= Date.now() + 60000) throw new Error('Choose a deal end time in the future.')
      if (end.getTime() > Date.now() + 30 * 864e5) throw new Error('A deal can run for up to 30 days.')
      row.old_price = price; row.price = dp; row.deal_ends_at = end.toISOString()
    }
  }
  if (existing) {
    const { data, error } = await supabase.from('products').update(row).eq('id', existing.id).eq('shop_id', shop.id).select().single()
    if (error) throw fail(error, 'Could not save the product. Please try again.'); announce(); return data
  }
  if (!photos) throw new Error(`Add ${PHOTOS} product photos.`)
  const { data, error } = await supabase.from('products').insert({ ...row, shop_id: shop.id, variants: [{ label: 'Standard', mult: 1 }], features: [] }).select().single()
  if (error) throw fail(error, 'Could not save the product. Please try again.')
  announce()
  return data
}
export async function deleteProduct(shop, id) {
  need(); const { error } = await supabase.from('products').delete().eq('id', id).eq('shop_id', shop.id); if (error) throw fail(error, /foreign key|referenced/i.test(error.message) ? 'This product has orders, so it cannot be deleted. Hide it instead.' : 'Could not delete the product.')
  announce()
}
export async function sellerOrders() {
  need(); const { data, error } = await supabase.rpc('seller_orders'); if (error) throw fail(error, 'Could not load your orders. Pull to refresh.'); return data || []
}
export async function sellerQuestions() {
  need(); const { data, error } = await supabase.rpc('seller_questions'); if (error) throw fail(error, 'Could not load questions.'); return data || []
}
export async function answerQuestion(id, answer) {
  need(); noContact('Answers', answer)
  const { error } = await supabase.rpc('answer_question', { p_id: id, p_answer: s(answer, 600) })
  if (error) throw new Error(/answer must|answers cannot|own products|not found|sign in/i.test(error.message) ? error.message : 'Could not save your answer. Please try again.')
}
// ---------------- Returns (only this seller's items; no customer details) ----------------
export async function sellerReturns() {
  need(); const { data, error } = await supabase.rpc('seller_returns')
  if (error) throw new Error(/does not exist|schema cache/i.test(error.message) ? 'Returns are not set up yet. Ask Pinkish to run the returns update.' : fail(error, 'Could not load returns.').message)
  return data || []
}
export async function respondReturn(id, response, note) {
  need(); const { error } = await supabase.rpc('seller_respond_return', { p_id: id, p_response: response, p_note: s(note, 400) || null })
  if (error) throw new Error(/disagree|agree or dispute|not found|closed/i.test(error.message) ? error.message : 'Could not save your response. Please try again.')
}
// ---------------- Stock (quick restock from the product list) ----------------
export async function setStock(shop, id, stock) {
  need()
  const n = parseInt(stock, 10)
  if (!Number.isInteger(n) || n < 0 || n > 100000) throw new Error('Enter a valid stock quantity.')
  const { data, error } = await supabase.from('products').update({ stock: n }).eq('id', id).eq('shop_id', shop.id).select().single()
  if (error) throw fail(error, 'Could not save the stock. Try again.')
  announce(); return data
}

// ---------------- Handover to the Pinkish rider ----------------
// Seller packs → marks ready → a Pinkish rider comes and tells the 4-digit pickup code → seller confirms.
// The code is never sent to the seller's device, so items can only be handed to a real Pinkish rider.
const notSetUp = e => /does not exist|schema cache|could not find/i.test(String(e?.message))
export async function sellerHandovers() {
  need()
  const { data, error } = await supabase.rpc('seller_handovers')
  if (error) { if (notSetUp(error)) return null; throw fail(error) } // null = feature not installed yet
  return data || []
}
export async function markPacked(orderId, packed = true) {
  need()
  const { error } = await supabase.rpc('seller_mark_packed', { p_order: orderId, p_packed: packed })
  if (error) throw new Error(notSetUp(error) ? 'Pickups are not set up yet. Ask Pinkish to run the seller update.' : fail(error, 'Could not update the order. Try again.').message)
}
export async function confirmPickup(orderId, code) {
  need()
  const c = String(code || '').replace(/\D/g, '')
  if (c.length !== 4) throw new Error('Enter the 4-digit code the rider tells you.')
  const { data, error } = await supabase.rpc('seller_confirm_pickup', { p_order: orderId, p_code: c })
  if (error) throw new Error(notSetUp(error) ? 'Pickups are not set up yet. Ask Pinkish to run the seller update.' : fail(error, 'Could not check the code. Try again.').message)
  if (data === 'wrong') throw new Error('That code is not right. Do not hand over the parcel. Ask the rider to check the code in the Pinkish rider app.')
  if (data === 'locked') throw new Error('Too many wrong codes. Keep the parcel and contact Pinkish support.')
  if (data === 'closed') throw new Error('This order was cancelled. Keep the parcel.')
}

// ---------------- Seller rules set by Pinkish (admin) ----------------
export const OPS0 = { mode: 'pickup', hub_address: '', hours: 'Sat–Thu, 10am–6pm', pack_hours: 24, commission: 10, notice: '' }
export async function getSellerOps() {
  if (!supabase) return OPS0
  try { const { data } = await supabase.from('site_settings').select('value').eq('key', 'seller_ops').maybeSingle(); return { ...OPS0, ...(data?.value || {}) } } catch { return OPS0 }
}
// wishlist saves per product (optional; empty when the update has not been run)
export async function productStats() {
  if (!supabase) return {}
  try { const { data, error } = await supabase.rpc('seller_product_stats'); return error ? {} : Object.fromEntries((data || []).map(r => [String(r.product_id), Number(r.saves) || 0])) } catch { return {} }
}
// ---------------- Pickup location + live rider map ----------------
// The pin riders navigate to. Stored on the shop (lat/lng), only inside Bangladesh.
export async function setShopLocation(shop, lat, lng) {
  need()
  const a = Math.round(+lat * 1e6) / 1e6, b = Math.round(+lng * 1e6) / 1e6
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 20 || a > 27 || b < 88 || b > 93) throw new Error('Move the pin to your shop in Bangladesh.')
  const { data, error } = await supabase.from('shops').update({ lat: a, lng: b }).eq('id', shop.id).select().single()
  if (error) throw new Error(/lat|lng|column/i.test(error.message) ? 'Shop pins are not set up yet. Ask Pinkish to run supabase-delivery-zones.sql.' : fail(error, 'Could not save your location. Try again.').message)
  return data
}
// Where the Pinkish rider is while they come to collect this order (null when not on the way)
export async function riderLocation(orderId) {
  if (!supabase) return null
  try { const { data, error } = await supabase.rpc('seller_rider_location', { p_order: String(orderId) }); return error ? null : data || null } catch { return null }
}
// ---------------- v5: shop coupons + Pathao direct pickup (supabase-marketplace-v5.sql) ----------------
// Coupon discount on this shop's items and Pathao pickups booked by Pinkish. null = update not installed yet.
export async function sellerExtras() {
  if (!supabase) return null
  try { const { data, error } = await supabase.rpc('seller_extras'); return error ? (notSetUp(error) ? null : []) : (data || []) } catch { return null }
}
export async function courierHanded(orderId) {
  need()
  const { data, error } = await supabase.rpc('seller_courier_handed', { p_order: String(orderId) })
  if (error) throw fail(error, 'Could not update the order. Try again.')
  if (data === 'none') throw new Error('This pickup is already marked, or Pinkish changed it. Refresh the page.')
}
const CCOLS = 'id,code,title,kind,value,max_discount,min_order,starts_at,ends_at,max_uses,per_user,is_public,active,used_count,created_at'
export async function myCoupons(shopId) {
  need()
  const { data, error } = await supabase.from('coupons').select(CCOLS).eq('shop_id', shopId).order('created_at', { ascending: false })
  if (error) { if (notSetUp(error)) return null; throw fail(error, 'Could not load your coupons.') }
  return data || []
}
// Shop coupons: percent or fixed taka off this shop's items. The shop pays the discount.
export async function saveCoupon(shop, f, existing) {
  need()
  const code = s(f.code, 20).toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!/^[A-Z0-9]{3,20}$/.test(code)) throw new Error('Code: 3 to 20 letters or numbers, like EID50.')
  const kind = f.kind === 'amount' ? 'amount' : 'percent', value = Number(f.value), min = f.min_order === '' ? 0 : Number(f.min_order)
  if (!Number.isFinite(value) || value <= 0) throw new Error('Enter how much off.')
  if (kind === 'percent' && value > 90) throw new Error('Percent off can be at most 90%.')
  if (!Number.isFinite(min) || min < 0) throw new Error('Enter a valid minimum order.')
  if (kind === 'amount' && min > 0 && value >= min) throw new Error('The discount must be smaller than the minimum order.')
  const maxD = kind === 'percent' && f.max_discount !== '' ? Number(f.max_discount) : null
  if (maxD != null && (!Number.isFinite(maxD) || maxD <= 0)) throw new Error('Enter a valid maximum discount, or leave it empty.')
  const uses = f.max_uses === '' ? null : parseInt(f.max_uses, 10)
  if (uses != null && (!Number.isInteger(uses) || uses < 1)) throw new Error('Enter how many times it can be used, or leave it empty.')
  const ends = f.ends_at ? new Date(f.ends_at) : null
  if (ends && (isNaN(ends) || ends.getTime() < Date.now() + 60000)) throw new Error('Choose an end time in the future, or leave it empty.')
  noContact('Coupon title', f.title || '')
  const row = { code, title: s(f.title, 60) || null, kind, value, min_order: min, max_discount: maxD, max_uses: uses, per_user: 1, ends_at: ends ? ends.toISOString() : null, is_public: f.is_public !== false, active: f.active !== false }
  const q = existing ? supabase.from('coupons').update(row).eq('id', existing.id) : supabase.from('coupons').insert({ ...row, shop_id: shop.id })
  const { data, error } = await q.select(CCOLS).single()
  if (error) throw new Error(/duplicate|unique/i.test(error.message) ? 'That code is already used on Pinkish. Choose another one.' : notSetUp(error) ? 'Coupons are not set up yet. Ask Pinkish to run the v5 update.' : fail(error, 'Could not save the coupon.').message)
  return data
}
export async function setCouponActive(c, active) {
  need()
  const { data, error } = await supabase.from('coupons').update({ active }).eq('id', c.id).select(CCOLS).single()
  if (error) throw fail(error, 'Could not update the coupon.')
  return data
}
export async function deleteCoupon(c) {
  need()
  const { error, count } = await supabase.from('coupons').delete({ count: 'exact' }).eq('id', c.id)
  if (error) throw fail(error, 'Could not delete the coupon.')
  if (!count) throw new Error('A coupon that customers already used cannot be deleted. Turn it off instead.')
}
