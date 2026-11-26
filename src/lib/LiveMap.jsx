import { useEffect, useMemo, useRef, useState } from 'react'
import { HUB, RIDER_KM } from './zone.js'

// =====================================================================
// Live maps for every Pinkish app (store, admin, rider, seller).
// Leaflet + OpenStreetMap, loaded once from a CDN (no npm install, no API key).
// Markers move smoothly to their new position instead of jumping.
// =====================================================================
let leafletP
export const loadLeaflet = () => leafletP || (leafletP = new Promise((res, rej) => {
  if (typeof window === 'undefined') return rej(new Error('leaflet'))
  if (window.L) return res(window.L)
  if (!document.querySelector('link[data-leaflet]')) { const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css'; css.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='; css.crossOrigin = ''; css.dataset.leaflet = '1'; document.head.appendChild(css) }
  const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js'; sc.async = true
  // Subresource integrity: the browser refuses the file if the CDN copy was ever changed
  sc.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='; sc.crossOrigin = ''
  sc.onload = () => (window.L ? res(window.L) : rej(new Error('leaflet')))
  sc.onerror = () => { leafletP = null; sc.remove(); rej(new Error('leaflet')) }
  document.head.appendChild(sc)
}))
export const TILE = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
export const TILE_ATTR = '© OpenStreetMap'

const CSS = `
.lm{position:relative;border-radius:20px;overflow:hidden;background:#ece4f7;border:1px solid #eadcf3;isolation:isolate}
.lm-map{position:absolute;inset:0;z-index:1}
.lm .leaflet-container{font:inherit;background:#ece4f7}
.lm .leaflet-control-attribution{font-size:9px!important;background:#ffffffcc!important}
.lm .leaflet-control-zoom{display:none}
.lm-ph{position:absolute;inset:0;z-index:2;display:grid;place-items:center;text-align:center;padding:16px;color:#8b8197;font-size:13px}
.lm-tap{all:unset;box-sizing:border-box;cursor:pointer;position:absolute;inset:0;z-index:3;display:grid;place-content:center;justify-items:center;gap:4px;color:#4a1668;font-weight:700;background:linear-gradient(135deg,#f6e9fb,#fde7f0)}
.lm-tap small{font-weight:500;color:#8b8197}
.lm-btn{all:unset;cursor:pointer;position:absolute;right:10px;bottom:10px;z-index:500;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:#fff;color:#4a1668;box-shadow:0 6px 16px #4a166844}
.lm-btn:active{transform:scale(.92)}
.lm-chip{position:absolute;left:10px;top:10px;z-index:500;max-width:calc(100% - 20px);display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:99px;background:#fffffff2;color:#4a1668;font-size:12px;font-weight:700;box-shadow:0 6px 16px #4a166826;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lm-chip i{width:8px;height:8px;border-radius:50%;background:#1f8a54;flex:none;box-shadow:0 0 0 0 #1f8a5488;animation:lmPulse 1.6s infinite}
.lm-chip.old i{background:#b86e00;animation:none}
.lm-ic{display:grid;place-items:center;border-radius:50%;color:#fff;border:2.5px solid #fff;box-shadow:0 6px 14px #4a166866;font:700 12px/1 system-ui,sans-serif}
.lm-ic svg{display:block}
.lm-rider{width:38px;height:38px;background:linear-gradient(135deg,#8e2a8c,#e0457b);position:relative}
.lm-rider::after{content:'';position:absolute;inset:-7px;border-radius:50%;border:2px solid #e0457b88;animation:lmRing 1.8s ease-out infinite}
.lm-rider.off{background:#9a8fa8}.lm-rider.off::after{display:none}
.lm-home{width:34px;height:34px;background:#4a1668}
.lm-shop{width:32px;height:32px;background:#e69500}
.lm-hub{width:34px;height:34px;background:#2d0b4a}
.lm-dest{width:26px;height:26px;background:#2757b3;font-size:10px}
.lm-tip{font:600 12px/1.3 system-ui,sans-serif;color:#2a1a3a}
@keyframes lmRing{from{transform:scale(.7);opacity:1}to{transform:scale(1.5);opacity:0}}
@keyframes lmPulse{to{box-shadow:0 0 0 7px #1f8a5400}}
@media(prefers-reduced-motion:reduce){.lm-rider::after,.lm-chip i{animation:none}}
.lm-pin{position:absolute;left:50%;top:50%;width:40px;height:50px;margin:-50px 0 0 -20px;z-index:500;pointer-events:none;filter:drop-shadow(0 8px 6px #4a166855);transition:transform .2s}
.lm.mv .lm-pin{transform:translateY(-8px)}
`
const injectCss = () => { if (typeof document === 'undefined' || document.getElementById('lm-css')) return; const s = document.createElement('style'); s.id = 'lm-css'; s.textContent = CSS; document.head.appendChild(s) }

const SV = (d, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`
const GLYPH = {
  rider: SV('<circle cx="5.5" cy="17" r="3"/><circle cx="18.5" cy="17" r="3"/><path d="M5.5 17l4-7h5l4 7M9.5 10L8 7H5.5M14.5 10l1.5-3h2.5"/>'),
  home: SV('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>', 16),
  shop: SV('<path d="M4 9l1.5-5h13L20 9"/><path d="M5 12v8h14v-8"/>', 15),
  hub: SV('<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/>', 16),
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const SIZE = { rider: 38, home: 34, shop: 32, hub: 34, dest: 26 }
const iconFor = (L, m) => {
  const k = SIZE[m.kind] ? m.kind : 'home', s = SIZE[k]
  const inner = k === 'dest' ? esc(m.text || '') : GLYPH[k] || ''
  return L.divIcon({ className: '', html: `<span class="lm-ic lm-${k}${m.off ? ' off' : ''}">${inner}</span>`, iconSize: [s, s], iconAnchor: [s / 2, s / 2], popupAnchor: [0, -s / 2] })
}
const valid = m => m && Number.isFinite(+m.lat) && Number.isFinite(+m.lng) && !(+m.lat === 0 && +m.lng === 0)

// Smooth move: interpolate between the old and new position (≈0.9 s)
function glide(mk, to) {
  const from = mk.getLatLng(); if (!from || (from.lat === to[0] && from.lng === to[1])) return
  cancelAnimationFrame(mk._pkRaf)
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return mk.setLatLng(to)
  const t0 = performance.now(), D = 900
  const step = t => { const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3); mk.setLatLng([from.lat + (to[0] - from.lat) * e, from.lng + (to[1] - from.lng) * e]); if (k < 1) mk._pkRaf = requestAnimationFrame(step) }
  mk._pkRaf = requestAnimationFrame(step)
}

/**
 * markers: [{ id, lat, lng, kind: 'rider'|'home'|'shop'|'hub'|'dest', label, text, off }]
 * zone: true → draws the 4 km Pinkish rider zone around the hub
 * follow: marker id kept in view while it moves
 * chip: { text, old } small live label in the corner
 * lazy: on slow / data-saver connections the map loads only after a tap
 */
export function LiveMap({ markers = [], zone = false, follow, chip, height = 240, lazy = false, className = '', onMap }) {
  const el = useRef(null), map = useRef(null), layer = useRef(new Map()), circle = useRef(null), fitted = useRef(''), touched = useRef(false), [ok, setOk] = useState(null), [show, setShow] = useState(!lazy)
  const list = useMemo(() => markers.filter(valid), [markers])
  const idKey = useMemo(() => list.map(m => m.id).sort().join('|'), [list])
  injectCss()

  useEffect(() => {
    if (!show) return
    let dead = false, ro
    loadLeaflet().then(L => {
      if (dead || !el.current) return
      const m = L.map(el.current, { zoomControl: false, attributionControl: true, center: [HUB.lat, HUB.lng], zoom: 13 })
      L.tileLayer(TILE, { maxZoom: 19, attribution: TILE_ATTR, crossOrigin: true }).addTo(m)
      m.on('dragstart zoomstart', e => { if (e?.originalEvent || e?.type === 'dragstart') touched.current = true })
      map.current = m; setOk(true); onMap?.(m)
      if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => m.invalidateSize()); ro.observe(el.current) }
      setTimeout(() => { if (!dead) m.invalidateSize() }, 200)
    }).catch(() => !dead && setOk(false))
    return () => { dead = true; ro?.disconnect(); layer.current.forEach(mk => cancelAnimationFrame(mk._pkRaf)); layer.current.clear(); circle.current = null; fitted.current = ''; map.current?.remove(); map.current = null }
  }, [show]) // eslint-disable-line react-hooks/exhaustive-deps

  // the 4 km rider zone
  useEffect(() => {
    const m = map.current, L = window.L; if (!ok || !m || !L) return
    if (zone && !circle.current) circle.current = L.circle([HUB.lat, HUB.lng], { radius: RIDER_KM * 1000, color: '#e0457b', weight: 2, dashArray: '6 6', fillColor: '#e0457b', fillOpacity: 0.06, interactive: false }).addTo(m)
    if (!zone && circle.current) { circle.current.remove(); circle.current = null }
  }, [ok, zone])

  // add / move / remove markers
  useEffect(() => {
    const m = map.current, L = window.L; if (!ok || !m || !L) return
    const seen = new Set()
    list.forEach(d => {
      seen.add(d.id)
      const pos = [+d.lat, +d.lng], sig = `${d.kind}|${d.text || ''}|${d.off ? 1 : 0}`
      let mk = layer.current.get(d.id)
      if (!mk) { mk = L.marker(pos, { icon: iconFor(L, d), keyboard: false, zIndexOffset: d.kind === 'rider' ? 1000 : 0 }).addTo(m); mk._pkSig = sig; layer.current.set(d.id, mk) }
      else { glide(mk, pos); if (mk._pkSig !== sig) { mk.setIcon(iconFor(L, d)); mk._pkSig = sig } }
      if (d.label) { if (mk._pkLbl !== d.label) { mk.unbindTooltip(); mk.bindTooltip(`<span class="lm-tip">${esc(d.label)}</span>`, { direction: 'top', offset: [0, -14] }); mk._pkLbl = d.label } }
    })
    layer.current.forEach((mk, id) => { if (!seen.has(id)) { cancelAnimationFrame(mk._pkRaf); mk.remove(); layer.current.delete(id) } })
    // fit the view when the set of markers changes (not on every move, so panning is not undone)
    if (fitted.current !== idKey && list.length) { fitted.current = idKey; touched.current = false; fit() }
    else if (follow && !touched.current) { const f = list.find(x => x.id === follow); if (f && !m.getBounds().pad(-0.15).contains([+f.lat, +f.lng])) m.panTo([+f.lat, +f.lng], { animate: true }) }
  }, [ok, list, idKey, follow]) // eslint-disable-line react-hooks/exhaustive-deps

  function fit() {
    const m = map.current, L = window.L; if (!m || !L) return
    const pts = list.map(d => [+d.lat, +d.lng])
    if (!pts.length) return m.setView([HUB.lat, HUB.lng], 13)
    if (pts.length === 1) return m.setView(pts[0], 15)
    m.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 16 })
  }

  return <div className={'lm ' + className} style={{ height }}>
    {show ? <div ref={el} className="lm-map" /> : <button type="button" className="lm-tap" onClick={() => setShow(true)}><b>Show live map</b><small>Uses a little mobile data</small></button>}
    {show && ok === null && <div className="lm-ph">Loading map…</div>}
    {show && ok === false && <div className="lm-ph">The map could not load. Check your internet and try again.</div>}
    {show && ok && chip?.text && <span className={'lm-chip' + (chip.old ? ' old' : '')}><i />{chip.text}</span>}
    {show && ok && list.length > 0 && <button type="button" className="lm-btn" aria-label="Recenter map" onClick={() => { touched.current = false; fit() }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg></button>}
  </div>
}

// Pick a point by moving the map under a fixed pin (used for the seller's pickup location)
export function PinPicker({ value, onChange, height = 260, zone = true }) {
  const el = useRef(null), map = useRef(null), cb = useRef(onChange), [ok, setOk] = useState(null), [mv, setMv] = useState(false)
  cb.current = onChange
  injectCss()
  useEffect(() => {
    let dead = false
    loadLeaflet().then(L => {
      if (dead || !el.current) return
      const has = valid(value), m = L.map(el.current, { zoomControl: false, center: has ? [+value.lat, +value.lng] : [HUB.lat, HUB.lng], zoom: has ? 17 : 13 })
      L.tileLayer(TILE, { maxZoom: 19, attribution: TILE_ATTR }).addTo(m)
      if (zone) L.circle([HUB.lat, HUB.lng], { radius: RIDER_KM * 1000, color: '#e0457b', weight: 2, dashArray: '6 6', fillOpacity: 0.05, interactive: false }).addTo(m)
      m.on('movestart', () => setMv(true))
      m.on('moveend', () => { setMv(false); const c = m.getCenter(); cb.current?.({ lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6) }) })
      map.current = m; setOk(true); setTimeout(() => !dead && m.invalidateSize(), 200)
    }).catch(() => !dead && setOk(false))
    return () => { dead = true; map.current?.remove(); map.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const m = map.current; if (m && valid(value)) { const c = m.getCenter(); if (Math.abs(c.lat - value.lat) > 1e-5 || Math.abs(c.lng - value.lng) > 1e-5) m.setView([+value.lat, +value.lng], Math.max(m.getZoom(), 16)) } }, [value?.lat, value?.lng]) // eslint-disable-line react-hooks/exhaustive-deps
  return <div className={'lm' + (mv ? ' mv' : '')} style={{ height }}>
    <div ref={el} className="lm-map" />
    {ok === null && <div className="lm-ph">Loading map…</div>}
    {ok === false && <div className="lm-ph">The map could not load. Check your internet and try again.</div>}
    {ok && <><span className="lm-chip">{mv ? 'Release to set the pin' : 'Drag the map to move the pin'}</span><svg className="lm-pin" viewBox="0 0 44 54" aria-hidden="true"><path d="M22 52S4 33 4 20a18 18 0 0 1 36 0c0 13-18 32-18 32z" fill="#8e2a8c" stroke="#fff" strokeWidth="2.5" /><circle cx="22" cy="20" r="7" fill="#fff" /></svg></>}
  </div>
}

// Poll a location function while `on` (pauses when the tab is hidden or offline).
export function usePoll(fn, ms, on, deps = []) {
  const [v, setV] = useState(null), f = useRef(fn)
  f.current = fn
  useEffect(() => {
    if (!on) { setV(null); return }
    let live = true, busy = false
    // never start a new request while the last one is still on its way (slow networks would pile them up)
    const run = () => { if (busy || document.hidden || navigator.onLine === false) return; busy = true; Promise.resolve(f.current()).then(r => { if (live) setV(r ?? null) }, () => {}).finally(() => { busy = false }) }
    run(); const t = setInterval(run, ms)
    const vis = () => { if (!document.hidden) run() }
    document.addEventListener('visibilitychange', vis)
    return () => { live = false; clearInterval(t); document.removeEventListener('visibilitychange', vis) }
  }, [on, ms, ...deps]) // eslint-disable-line react-hooks/exhaustive-deps
  return v
}
