// =====================================================================
// Pinkish delivery zones (one place for every app: store, admin, rider, seller)
//   inner   : within RIDER_KM of the Bahaddarhat hub      → Pinkish rider          ৳40
//   city    : the rest of Chattogram city                 → Pathao / partner courier ৳60
//   outside : anywhere else in Bangladesh                 → Pathao / partner courier ৳120
// The live prices come from site_settings.key = 'delivery' (Admin → Promotions); the numbers below
// are only defaults. Keep CTG_CITY, BD and the hub identical to pk_in_ctg_city(), pk_in_bd() and
// pk_hub_km() in supabase-marketplace-v5.sql: the server re-checks every order.
// =====================================================================
export const HUB = { lat: 22.3411, lng: 91.8428, name: 'Bahaddarhat' }
export const RIDER_KM = 4
export const DELIVERY0 = { inner_fee: 40, city_fee: 60, outside_fee: 120, rider_km: 4, free_over: 0, free_zones: ['inner', 'city'] }
// kept for older imports
export const MAX_KM = 1000, FEE_IN = 40, FEE_OUT = 60

// What couriers charged a Chattogram merchant for a ≤500 g parcel when these prices were set (Nov 2026).
// Shown in Admin → Promotions next to the price fields.
export const COURIER_RATES = [
  { k: 'Pathao', city: 60, outside: 120, note: 'same city ৳60 (≤500 g, ৳70 ≤1 kg) · other cities ৳120 (৳145 ≤1 kg) · Dhaka ৳110 · 1% COD' },
  { k: 'Steadfast', city: 60, outside: 135, note: 'same city ৳60 · city to city ৳135 · 1% COD' },
  { k: 'RedX', city: 65, outside: 120, note: 'inside city ৳65 (1 kg) · outside ৳120 (1 kg) · 1% COD outside Dhaka' },
]

let CFG = { ...DELIVERY0 }
export const setDeliveryCfg = c => { CFG = { ...DELIVERY0, ...(c || {}) }; if (!Array.isArray(CFG.free_zones)) CFG.free_zones = DELIVERY0.free_zones; return CFG }
export const deliveryCfg = () => CFG

export const havKm = (a, b, c, d) => {
  const R = 6371, rad = Math.PI / 180, dx = (c - a) * rad, dy = (d - b) * rad
  const h = Math.sin(dx / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(dy / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(h))
}
export const hasNum = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))
export const okLL = (lat, lng) => hasNum(lat) && hasNum(lng) && Math.abs(+lat) <= 90 && Math.abs(+lng) <= 180 && !(+lat === 0 && +lng === 0)
export const kmFromHub = (lat, lng) => (okLL(lat, lng) ? havKm(HUB.lat, HUB.lng, +lat, +lng) : null)
export const kmTxt = km => (km == null ? '' : km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1) + ' km')

// [lat, lng] outlines. Ray casting: a few dozen multiplications, so it is safe to call on every map move.
export const CTG_CITY = [[22.445, 91.72], [22.455, 91.77], [22.445, 91.815], [22.43, 91.85], [22.405, 91.88], [22.37, 91.895], [22.335, 91.875], [22.315, 91.855], [22.285, 91.825], [22.25, 91.83], [22.22, 91.81], [22.225, 91.78], [22.28, 91.765], [22.34, 91.735], [22.4, 91.715]]
export const BD = [[26.63, 88.43], [26.3, 89], [26.4, 89.85], [25.95, 89.9], [25.3, 89.85], [25.2, 90.5], [25.17, 91.6], [25.1, 92.4], [24.9, 92.5], [24.2, 92.2], [24.05, 91.65], [23.65, 91.3], [23.1, 91.4], [23.3, 91.95], [23.1, 92.35], [22.5, 92.65], [21.9, 92.65], [21.2, 92.35], [20.6, 92.3], [20.7, 92.05], [21.4, 91.9], [22, 91.8], [22.2, 91.74], [22.6, 91.62], [22.85, 91.45], [22.4, 91.1], [22, 90.9], [21.7, 90.1], [21.7, 89.5], [21.62, 89.07], [22.3, 89], [23.05, 88.9], [23.8, 88.55], [24.3, 88.6], [24.8, 88.05], [25.15, 88.45], [25.27, 88.95], [25.6, 88.4], [26, 88.2], [26.33, 88.55]]
const inPoly = (poly, lat, lng) => {
  let ins = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i], [yj, xj] = poly[j]
    if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) ins = !ins
  }
  return ins
}
export const inCtgCity = (lat, lng) => okLL(lat, lng) && inPoly(CTG_CITY, +lat, +lng)
export const inBD = (lat, lng) => okLL(lat, lng) && +lat >= 20.5 && +lat <= 26.7 && +lng >= 88 && +lng <= 92.7 && inPoly(BD, +lat, +lng)

// 'inner' | 'city' | 'outside' | 'unknown' (no pin) | 'abroad'   (same order of checks as pk_delivery_zone)
export const zoneOf = (lat, lng, cfg = CFG) => {
  if (!okLL(lat, lng)) return 'unknown'
  const km = havKm(HUB.lat, HUB.lng, +lat, +lng), rk = +cfg.rider_km || RIDER_KM
  if (inCtgCity(lat, lng)) return km <= rk ? 'inner' : 'city'
  if (!inBD(lat, lng)) return 'abroad'
  return km <= rk ? 'inner' : 'outside'
}
export const ZONE = {
  inner: { name: 'Pinkish rider zone', who: 'Pinkish rider', eta: 'Today or tomorrow', mode: 'pinkish' },
  city: { name: 'Chattogram city', who: 'Pathao / partner courier', eta: '1–2 days', mode: 'courier' },
  outside: { name: 'Outside Chattogram', who: 'Pathao / partner courier', eta: '2–4 days', mode: 'courier' },
  unknown: { name: 'Location not pinned', who: '', eta: '', mode: 'pinkish' },
  abroad: { name: 'Outside Bangladesh', who: '', eta: '', mode: null },
}
export const zoneFee = (z, cfg = CFG) => z === 'inner' ? +cfg.inner_fee : z === 'city' ? +cfg.city_fee : z === 'outside' ? +cfg.outside_fee : z === 'unknown' ? +cfg.city_fee : null

/**
 * Delivery for a customer location.
 * opts.subtotal   cart value after discount (for free delivery)
 * opts.cod        free delivery and coupons apply to Cash on Delivery only
 * opts.freeCoupon a free-delivery coupon is applied
 * → { fee, base, km, zone, mode, free, freeLeft, label, eta, who, pinned }
 *   fee = null means we cannot deliver there (outside Bangladesh)
 */
export const deliveryFor = (loc, opts = {}, cfg = CFG) => {
  const pinned = okLL(loc?.lat, loc?.lng), km = pinned ? kmFromHub(loc.lat, loc.lng) : null
  const zone = zoneOf(loc?.lat, loc?.lng, cfg), z = ZONE[zone], base = zoneFee(zone, cfg)
  if (base == null) return { fee: null, base: null, km, zone, mode: null, free: false, freeLeft: 0, pinned, eta: '', who: '', label: 'We deliver inside Bangladesh only' }
  const fo = +cfg.free_over || 0, cod = opts.cod !== false, sub = +opts.subtotal || 0
  const zoneOk = (cfg.free_zones || []).includes(zone)
  const free = cod && pinned && (!!opts.freeCoupon || (fo > 0 && zoneOk && sub >= fo))
  const freeLeft = cod && pinned && fo > 0 && zoneOk && !free ? Math.max(0, Math.ceil(fo - sub)) : 0
  const fee = free ? 0 : base
  const label = !pinned
    ? `৳${base} · pin your location for the exact charge (৳${+cfg.inner_fee} near ${HUB.name})`
    : `${free ? 'Free delivery' : '৳' + fee} · ${zone === 'inner' ? kmTxt(km) + ' · ' : ''}${z.who} · ${z.eta}`
  return { fee, base, km, zone, mode: z.mode, free, freeLeft, pinned, eta: z.eta, who: z.who, label }
}

// Orders: the database stores delivery_zone / delivery_mode; older rows fall back to the pinned location.
export const orderKm = o => kmFromHub(o?.address?.lat, o?.address?.lng)
export const orderZone = o => o?.delivery_zone || zoneOf(o?.address?.lat, o?.address?.lng)
export const modeOf = o => o?.delivery_mode || (ZONE[orderZone(o)]?.mode ?? 'pinkish')

// Partner couriers. {id} = tracking / consignment ID, {phone} = customer phone.
// Check each link once in your merchant panel; edit the template here if a courier changes it.
export const COURIERS = [
  { k: 'Pathao', url: 'https://merchant.pathao.com/tracking?consignment_id={id}&phone={phone}', panel: 'https://merchant.pathao.com/' },
  { k: 'Steadfast', url: 'https://steadfast.com.bd/t/{id}', panel: 'https://steadfast.com.bd/' },
  { k: 'RedX', url: 'https://redx.com.bd/track-parcel/?trackingId={id}', panel: 'https://redx.com.bd/' },
  { k: 'Other', url: '', panel: '' },
]
export const trackUrl = (tpl, id, phone) => {
  if (!tpl || !id) return ''
  const u = String(tpl).replace('{id}', encodeURIComponent(String(id).trim())).replace('{phone}', encodeURIComponent(String(phone || '').replace(/\D/g, '').replace(/^88/, '')))
  return /^https:\/\//i.test(u) ? u : ''
}
// Only https links are ever opened from stored courier URLs
export const safeUrl = u => (/^https:\/\//i.test(String(u || '')) ? String(u) : '')

// Rough arrival estimate for a motorbike in Chattogram traffic (about 18 km/h, never under 3 minutes)
export const etaMin = km => (km == null ? null : Math.max(3, Math.round(km / 18 * 60)))
export const seenAgo = t => { if (!t) return ''; const s = Math.max(0, Math.round((Date.now() - new Date(t)) / 1000)); return s < 45 ? 'live' : s < 3600 ? Math.round(s / 60) + ' min ago' : Math.round(s / 3600) + 'h ago' }
export const fresh = (t, min = 15) => !!t && Date.now() - new Date(t) < min * 6e4
