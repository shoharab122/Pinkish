// =====================================================================
// Pinkish delivery zones (one place for every app: store, admin, rider, seller)
//   • Within RIDER_KM of the Bahaddarhat hub → a Pinkish rider delivers.
//   • Beyond that (up to MAX_KM) → Pathao or another partner courier delivers.
// Keep HUB / RIDER_KM identical to pk_km_from_hub() and pk_set_delivery_mode()
// in supabase-delivery-zones.sql, and the fees identical to delivery_fee_for().
// =====================================================================
export const HUB = { lat: 22.3411, lng: 91.8428, name: 'Bahaddarhat' }
export const RIDER_KM = 4, MAX_KM = 30, FEE_IN = 40, FEE_OUT = 60

export const havKm = (a, b, c, d) => {
  const R = 6371, rad = Math.PI / 180, dx = (c - a) * rad, dy = (d - b) * rad
  const h = Math.sin(dx / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(dy / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(h))
}
export const hasNum = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))
export const okLL = (lat, lng) => hasNum(lat) && hasNum(lng) && Math.abs(+lat) <= 90 && Math.abs(+lng) <= 180 && !(+lat === 0 && +lng === 0)
export const kmFromHub = (lat, lng) => (okLL(lat, lng) ? havKm(HUB.lat, HUB.lng, +lat, +lng) : null)
export const kmTxt = km => (km == null ? '' : km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1) + ' km')

// Delivery for a customer location (fee + who delivers). mode: 'pinkish' | 'courier' | null (outside)
export const deliveryFor = loc => {
  const km = kmFromHub(loc?.lat, loc?.lng)
  if (km == null) return { fee: FEE_IN, km: null, mode: 'pinkish', zone: 'inner', label: `৳${FEE_IN} · pin your location for the exact charge` }
  if (km > MAX_KM) return { fee: null, km, mode: null, zone: 'outside', label: 'Outside our delivery area' }
  if (km <= RIDER_KM) return { fee: FEE_IN, km, mode: 'pinkish', zone: 'inner', label: `৳${FEE_IN} · ${kmTxt(km)} · Pinkish rider` }
  return { fee: FEE_OUT, km, mode: 'courier', zone: 'outer', label: `৳${FEE_OUT} · ${kmTxt(km)} · Pathao / partner courier` }
}

// Orders: the database sets delivery_mode; older rows fall back to the pinned distance.
export const orderKm = o => kmFromHub(o?.address?.lat, o?.address?.lng)
export const modeOf = o => o?.delivery_mode || ((orderKm(o) ?? 0) > RIDER_KM ? 'courier' : 'pinkish')

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
