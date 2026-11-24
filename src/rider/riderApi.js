import { supabase } from '../api.js'

// Pinkish Rider: every action goes through database functions (see supabase-riders.sql).
// Riders never read orders, customers or shops directly, so a tampered app can only do what the server allows.
// The checks below just give a quick, friendly message; supabase-rider-hardening.sql adds the server guards.
const s = (v, m = 200) => String(v ?? '').trim().slice(0, m)
const need = () => { if (!supabase) throw new Error('The app is not configured. Please try again later.') }
const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(3)), b => b.toString(16).padStart(2, '0')).join('')
const SETUP = /does not exist|schema cache|could not find the function/i
const TECH = /violates|row-level|relation|column|syntax|permission denied|pgrst|null value|duplicate key|constraint|uuid|invalid input/i
const fail = (e, fb = 'Something went wrong. Please try again.') => {
  const m = String(e?.message || e || '')
  if (SETUP.test(m)) return new Error('The rider system is not set up yet. Ask Pinkish to run supabase-riders.sql.')
  if (e?.name === 'AbortError' || /abort|timed? ?out/i.test(m)) return new Error('The connection is slow. Check your data and try again.')
  if (/failed to fetch|network|load failed/i.test(m)) return new Error('No internet connection. Check your data and try again.')
  if (/jwt|not authenticated|sign in again|refresh token/i.test(m)) return new Error('Please sign in again.')
  if (/row-level|permission denied|not allowed/i.test(m)) return new Error('You are not allowed to do that. Refresh and try again.')
  if (/too many|rate limit/i.test(m)) return new Error('Too many tries. Wait a minute and try again.')
  return new Error(m && m.length < 220 && !TECH.test(m) ? m : fb)
}
// Every call gets a time limit: a weak mobile signal shows a message instead of spinning forever.
const timed = (q, ms = 20000) => { try { if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout && q?.abortSignal) return q.abortSignal(AbortSignal.timeout(ms)) } catch { /* older browser */ } return q }
const rpc = async (fn, args, fb, ms) => { need(); const { data, error } = await timed(supabase.rpc(fn, args), ms); if (error) throw fail(error, fb); return data }
const isId = v => /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{1,18})$/i.test(String(v ?? ''))
const id = v => { if (!isId(v)) throw new Error('This job could not be found. Refresh and try again.'); return v }
// The user id always comes from the signed-in session, never only from the caller.
async function sessionUid(uid) {
  need()
  const { data } = await supabase.auth.getSession()
  const me = data?.session?.user?.id
  if (!me || (uid && uid !== me)) throw new Error('Please sign in again.')
  return me
}

export const cleanPhone = p => { let n = String(p || '').replace(/\D/g, ''); if (n.startsWith('880')) n = n.slice(2); return n.slice(0, 11) }
export const validPhone = p => /^01[3-9]\d{8}$/.test(cleanPhone(p))
export const validNid = n => /^(\d{10}|\d{13}|\d{17})$/.test(String(n || '').replace(/\D/g, ''))
export const VEHICLES = [['bike', 'Motorbike'], ['cycle', 'Bicycle'], ['car', 'Car / CNG'], ['foot', 'On foot']]
// tel: links only ever get digits and a leading +
export const telHref = p => { const n = String(p || '').replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '').slice(0, 16); return n.length >= 6 ? 'tel:' + n : '' }

export async function getMe(uid) {
  const me = await sessionUid(uid)
  const { data, error } = await timed(supabase.from('riders').select('*').eq('user_id', me).maybeSingle())
  if (error) throw fail(error, 'Could not load your rider account. Please try again.')
  return data
}

// ---------------- NID photo ----------------
// Look at the first bytes, not the file name: a renamed file never gets uploaded.
async function sniff(f) {
  try {
    const b = new Uint8Array(await f.slice(0, 12).arrayBuffer()), t = String.fromCharCode(...b)
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
    if (b[0] === 0x89 && t.slice(1, 4) === 'PNG') return 'image/png'
    if (t.startsWith('RIFF') && t.slice(8, 12) === 'WEBP') return 'image/webp'
    if (t.startsWith('%PDF')) return 'application/pdf'
  } catch { /* unreadable */ }
  return ''
}
// Resized and re-encoded in the browser: smaller upload on mobile data, and the photo's GPS location is removed.
async function shrink(file) {
  try {
    let bmp
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { bmp = await createImageBitmap(file) }
    if (bmp.width * bmp.height > 80e6) { bmp.close?.(); throw new Error('big') }
    const r = Math.min(1, 1800 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(bmp.width * r)); c.height = Math.max(1, Math.round(bmp.height * r))
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.()
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.88))
    c.width = c.height = 0 // free memory right away on low-end phones
    if (blob?.size && blob.type === 'image/jpeg') return { blob, type: 'image/jpeg', ext: 'jpg' }
  } catch { /* fall through */ }
  const real = await sniff(file)
  if (/^image\/(jpeg|png|webp)$/.test(real) && file.size <= 8 * 1024 * 1024) return { blob: file, type: real, ext: real.split('/')[1].replace('jpeg', 'jpg') }
  throw new Error('This photo format is not supported on your phone. Take a normal photo (JPG) and try again.')
}
async function uploadNid(uid, file) {
  if (!file) return null
  if (!(file instanceof Blob)) throw new Error('Upload a photo or PDF of your NID.')
  const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')
  if (!pdf && !/^image\//.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || '')) throw new Error('Upload a photo or PDF of your NID.')
  if (file.size > 20 * 1024 * 1024) throw new Error('File is too large (max 20 MB).')
  if (pdf && file.size > 10 * 1024 * 1024) throw new Error('PDF is too large (max 10 MB).')
  if (pdf && await sniff(file) !== 'application/pdf') throw new Error('This PDF could not be read. Take a clear photo of your NID instead.')
  const o = pdf ? { blob: file, type: 'application/pdf', ext: 'pdf' } : await shrink(file)
  const path = `${uid}/${Date.now()}-${rand()}-nid.${o.ext}`
  let err
  for (let a = 0; a < 3; a++) { // flaky mobile data: try again before giving up
    const { error } = await supabase.storage.from('rider-docs').upload(path, o.blob, { contentType: o.type, upsert: false })
    if (!error) return path
    err = error
    if (/row-level|not allowed|mime|too large|exceeded/i.test(String(error.message))) break
    await new Promise(r => setTimeout(r, 700 * (a + 1)))
  }
  throw fail(err, 'Could not upload your NID photo. Check your internet and try again.')
}
export async function applyRider(uid, f, doc) {
  const me = await sessionUid(uid)
  if (s(f.name, 80).length < 2) throw new Error('Enter your full name.')
  if (!validPhone(f.phone)) throw new Error('Enter a valid Bangladeshi mobile number, like 01712345678.')
  if (s(f.area, 120).length < 3) throw new Error('Enter the area where you deliver.')
  if (!validNid(f.nid)) throw new Error('NID number must be 10, 13 or 17 digits.')
  const vehicle = VEHICLES.some(v => v[0] === f.vehicle) ? f.vehicle : 'bike'
  const path = await uploadNid(me, doc)
  return rpc('rider_apply', { p_name: s(f.name, 80), p_phone: cleanPhone(f.phone), p_area: s(f.area, 120), p_vehicle: vehicle, p_nid: String(f.nid).replace(/\D/g, ''), p_doc: path }, 'Could not send your application. Please try again.')
}

// ---------------- jobs ----------------
export const getJobs = () => rpc('rider_jobs', undefined, 'Could not load your jobs. Pull down or tap Refresh.').then(d => d || {}) // never null: the app would spin forever
// Open jobs inside the 4 km Pinkish zone only (courier orders never show). Falls back to the old list until the SQL update runs.
export async function getPool() {
  need()
  let r = await timed(supabase.rpc('rider_open_jobs_zone'))
  if (r.error && SETUP.test(String(r.error.message))) r = await timed(supabase.rpc('rider_open_jobs'))
  if (r.error) throw fail(r.error, 'Could not load open jobs.')
  return Array.isArray(r.data) ? r.data : []
}
// Shop pins for the rider's own job (empty until sellers set their pickup location)
export async function pickupPoints(jid) {
  if (!supabase || !isId(jid)) return []
  try { const { data, error } = await timed(supabase.rpc('rider_pickup_points', { p_id: String(jid) }), 10000); return error || !Array.isArray(data) ? [] : data } catch { return [] }
}
export const setDuty = on => rpc('rider_set_duty', { p_on: !!on }, 'Could not change your status. Try again.')
// Location: only valid coordinates inside Bangladesh (with a margin), at most every `gap` ms (12 s while a parcel is
// on the way so the customer's map stays live, 30 s otherwise), never when offline.
let lastPing = 0
export const ping = (lat, lng, gap = 30000) => {
  const a = +lat, b = +lng, n = Date.now()
  if (!supabase || !Number.isFinite(a) || !Number.isFinite(b) || a < 19 || a > 28 || b < 86 || b > 94 || n - lastPing < Math.max(10000, gap) || navigator.onLine === false) return Promise.resolve()
  lastPing = n
  return timed(supabase.rpc('rider_ping', { p_lat: Math.round(a * 1e5) / 1e5, p_lng: Math.round(b * 1e5) / 1e5 }), 10000).then(() => {}, () => {})
}
export const claimJob = orderId => rpc('rider_claim', { p_order: id(orderId) }, 'Could not take this job. Someone may have taken it first.')
export const acceptJob = jid => rpc('rider_accept', { p_id: id(jid) }, 'Could not accept the job. Try again.')
export const declineJob = (jid, why) => rpc('rider_decline', { p_id: id(jid), p_reason: s(why, 200) }, 'Could not decline the job. Try again.')
export const startJob = jid => rpc('rider_start', { p_id: id(jid) }, 'Could not start the delivery. Try again.')
export const failJob = (jid, why) => rpc('rider_fail', { p_id: id(jid), p_reason: s(why, 200) }, 'Could not send the report. Try again.')
export async function deliverJob(jid, code, cash) {
  const c = Math.max(0, Math.round(Number(cash) || 0))
  const r = await rpc('rider_deliver', { p_id: id(jid), p_code: String(code || '').replace(/\D/g, '').slice(0, 4), p_cash: c }, 'Could not complete the delivery. Check your data and try again.', 30000)
  if (r === 'wrong') throw new Error('That code is not right. Ask the customer to check the code in their Pinkish app or SMS.')
  if (r === 'locked') throw new Error('Too many wrong codes. Keep the parcel and call Pinkish support.')
  if (r === 'closed') throw new Error('This order was cancelled. Do not hand over the parcel. Bring it back to Pinkish.')
  return r
}

// Map links open Google Maps (app on phones). Coordinates are used when the customer pinned their location.
const okCoord = (lat, lng) => lat !== null && lng !== null && lat !== '' && lng !== '' && Number.isFinite(+lat) && Number.isFinite(+lng) && Math.abs(+lat) <= 90 && Math.abs(+lng) <= 180
export const mapLink = (addr, lat, lng) => (okCoord(lat, lng)
  ? `https://www.google.com/maps/dir/?api=1&destination=${+lat},${+lng}&travelmode=driving`
  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s(addr, 300))}`)
export const mapEmbed = (addr, lat, lng) => {
  const q = okCoord(lat, lng) ? `${+lat},${+lng}` : s(addr, 300)
  return q ? `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=15&output=embed` : ''
}