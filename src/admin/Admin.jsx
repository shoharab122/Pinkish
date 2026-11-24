import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase as sb } from '../api'
import './admin.css'
import { LiveMap } from '../lib/LiveMap.jsx'
import { HUB, RIDER_KM, COURIERS, modeOf, orderKm, okLL, kmTxt, trackUrl, safeUrl, fresh, seenAgo } from '../lib/zone.js'

const ago = d => { const m = Math.max(0, Math.round((Date.now() - new Date(d)) / 6e4)); return m < 1 ? 'Just now' : m < 60 ? m + 'm ago' : m < 1440 ? Math.floor(m / 60) + 'h ago' : Math.floor(m / 1440) + 'd ago' }
const ini = n => (n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
const NEXT = ['Start processing', 'Send out for delivery', 'Mark as delivered']
const RANGES = [['all', 'All time'], ['today', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days']]
const taka = n => '৳' + Math.round(+n || 0).toLocaleString()
const STEPS = ['Placed', 'Processing', 'Out for delivery', 'Delivered']
const IDLE = 20 * 60 * 1000
const fmt = d => new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
const wa = (p, t) => { const n = (p || '').replace(/\D/g, ''); return 'https://wa.me/' + (n.startsWith('0') ? '88' + n : n) + (t ? '?text=' + encodeURIComponent(t) : '') }
// Seller handovers: sellers pack, a Pinkish rider collects with the pickup code. Admin controls riders and rules.
const HO = { new: ['Seller packing', 's0'], packed: ['Ready for pickup', 's1'], picked: ['Picked up', 's3'], cancelled: ['Cancelled', 'bad'] }
const OPS0 = { mode: 'pickup', hub_address: '', hours: 'Sat–Thu, 10am–6pm', pack_hours: 24, commission: 10, notice: '' }
const hoOpen = (o, hs) => (o.status || 0) < 2 && o.status !== 4 && (hs || []).some(h => h.status === 'new' || h.status === 'packed')
const readRiders = () => { try { const a = JSON.parse(localStorage.getItem('adm-riders') || '[]'); return Array.isArray(a) ? a.slice(0, 12) : [] } catch { return [] } }
const NAV = [['dash', 'Overview'], ['orders', 'Orders'], ['returns', 'Returns'], ['wish', 'Wishlist'], ['products', 'Products'], ['shops', 'Merchants'], ['riders', 'Riders'], ['cats', 'Categories'], ['notify', 'Notify'], ['hero', 'Hero']]

const ICN = {
  dash: <><rect x="3" y="3" width="7.5" height="9" rx="2.2" /><rect x="13.5" y="3" width="7.5" height="5.5" rx="2.2" /><rect x="13.5" y="12" width="7.5" height="9" rx="2.2" /><rect x="3" y="15.5" width="7.5" height="5.5" rx="2.2" /></>,
  orders: <><path d="M5 7h14l-1.2 12.1A2 2 0 0 1 15.8 21H8.2a2 2 0 0 1-2-1.9z" /><path d="M9 10V6.5a3 3 0 0 1 6 0V10" /></>,
  bag: <><path d="M5 7h14l-1.2 12.1A2 2 0 0 1 15.8 21H8.2a2 2 0 0 1-2-1.9z" /><path d="M9 10V6.5a3 3 0 0 1 6 0V10" /></>,
  wish: <path d="M12 20.5s-7.8-4.7-9.6-9.7C1.2 7.4 3.1 4.2 6.4 4.2c2 0 3.5 1 5.6 3 2.1-2 3.6-3 5.6-3 3.3 0 5.2 3.2 4 6.6-1.8 5-9.6 9.7-9.6 9.7z" />,
  products: <><path d="M21 8l-9-5-9 5v8l9 5 9-5z" /><path d="M3.3 8.2L12 13l8.7-4.8M12 13v8" /></>,
  cats: <><rect x="3" y="3" width="7.5" height="7.5" rx="2.2" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="2.2" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="2.2" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2.2" /></>,
  hero: <><rect x="3" y="4" width="18" height="16" rx="3.5" /><circle cx="9" cy="9.8" r="1.7" /><path d="M21 16l-4.8-4.8L7 20" /></>,
  bell: <><path d="M6.2 9.4a5.8 5.8 0 0 1 11.6 0c0 4.4 1.9 5.9 1.9 5.9H4.3s1.9-1.5 1.9-5.9z" /><path d="M10 19a2.1 2.1 0 0 0 4 0" /></>,
  refresh: <><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4.5V9h-4.5" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M4 8l8 6 8-6" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="3" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 15v2" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeoff: <><path d="M3 3l18 18M10.6 5.7A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3.2 4M6.5 7.6A16 16 0 0 0 2.5 12S6 18.5 12 18.5c1.5 0 2.8-.4 4-1M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  out: <><path d="M9.5 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20h3" /><path d="M15.5 8l4 4-4 4M19.5 12H9.5" /></>,
  rev: <><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a1 1 0 0 1 1 1v2" /><path d="M3 7.5V17a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5.5A2.5 2.5 0 0 1 3 7.5z" /><circle cx="16.5" cy="13.5" r="1.2" /></>,
  avg: <path d="M4 20V11M10 20V4M16 20v-6M21 20H3" />,
  inbox: <><path d="M4 13l2.2-7.2A1.5 1.5 0 0 1 7.6 4.8h8.8a1.5 1.5 0 0 1 1.4 1l2.2 7.2v5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18z" /><path d="M4 13h4.5l1 2.5h5l1-2.5H20" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5.2l3.2 1.9" /></>,
  truck: <><path d="M2.5 6.5h10.5v10H2.5zM13 10h4.2l3.3 3.3v3.2H13" /><circle cx="7" cy="18" r="1.9" /><circle cx="17" cy="18" r="1.9" /></>,
  riders: <><circle cx="5.5" cy="17" r="3" /><circle cx="18.5" cy="17" r="3" /><path d="M5.5 17l4-7h5l4 7M9.5 10L8 7H5.5M14.5 10l1.5-3h2.5" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="M7.8 12.4l2.9 2.9 5.5-6" /></>,
  chat: <><path d="M20.5 11.5a8.4 8.4 0 0 1-12.2 7.5L3.5 20.5 5 16A8.4 8.4 0 1 1 20.5 11.5z" /><path d="M9.2 8.8c.1 2.7 2.6 5.2 5.4 5.4l1.2-1.4-2-1-.9.8a4 4 0 0 1-2-2l.8-.9-1-2z" /></>,
  phone: <path d="M5 4h3.5l1.7 4.3-2.2 1.4a11 11 0 0 0 6.3 6.3l1.4-2.2L20 15.5V19a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></>,
  plus: <path d="M12 5v14M5 12h14" />, minus: <path d="M5 12h14" />,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />,
  close: <path d="M6 6l12 12M18 6L6 18" />, chev: <path d="M9 6l6 6-6 6" />,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16.2v.1" /></>,
  pin: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></>,
  shops: <><path d="M4 9.5L5.6 4h12.8L20 9.5" /><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" /><path d="M5.5 12.5V20h13v-7.5" /><path d="M10 20v-4.5h4V20" /></>,
  shield: <><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8-7.5 9.5-4.3-1.5-7.5-4.9-7.5-9.5V6z" /><path d="M8.7 12.2l2.2 2.2 4.4-4.6" /></>,
  doc: <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 16h5" /></>,
  ban: <><circle cx="12" cy="12" r="9" /><path d="M5.7 5.7l12.6 12.6" /></>,
  returns: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3M14 9l2 2" /></>,
  pkg: <><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M7.5 5.5l9 5" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>
}
const Ic = ({ n, s = 22 }) => <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{ICN[n]}</svg>

// animated counter: eases from the previous value to the new one
function Count({ to, f = v => Math.round(v).toLocaleString() }) {
  const [v, setV] = useState(0), from = useRef(0)
  useEffect(() => {
    const end = +to || 0
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { from.current = end; setV(end); return }
    const a = from.current, t0 = performance.now(); let raf
    const step = t => { const k = Math.min(1, (t - t0) / 800), val = a + (end - a) * (1 - Math.pow(1 - k, 3)); from.current = val; setV(val); if (k < 1) raf = requestAnimationFrame(step) }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [to])
  return <>{f(v)}</>
}

async function upload(file, folder) {
  if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(file.name || '')) throw new Error('Choose a picture (any photo or image)')
  if (file.size > 30e6) throw new Error('Picture is too large (max 30 MB)')
  let bmp
  try { try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { bmp = await createImageBitmap(file) } } catch { throw new Error('This picture format is not supported on your device. Try a JPG or PNG.') }
  // hero pictures keep more detail (they are shown large); everything else stays small
  const r = Math.min(1, (folder === 'hero' ? 2400 : 1200) / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * r); c.height = Math.round(bmp.height * r)
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
  const blob = await new Promise(res => c.toBlob(res, 'image/webp', 0.85))
  const path = `${folder}/${crypto.randomUUID()}.webp`
  const { error } = await sb.storage.from('media').upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000' })
  if (error) throw error
  return sb.storage.from('media').getPublicUrl(path).data.publicUrl
}

const F = ({ l, err, children }) => <label className={'f' + (err ? ' bad' : '')}><span>{l}</span>{children}{err && <em className="fe">{err}</em>}</label>
function Modal({ title, onClose, children, footer, cls = '' }) {
  useEffect(() => { const h = e => e.key === 'Escape' && onClose(); addEventListener('keydown', h); return () => removeEventListener('keydown', h) }, [onClose])
  const host = useMemo(() => document.querySelector('.adm') || document.body, [])
  return createPortal(<div className={'mb ' + cls} onMouseDown={e => e.target === e.currentTarget && onClose()}><div className="md" role="dialog" aria-modal="true" aria-label={title}><div className="mh"><b>{title}</b><button className="x" aria-label="Close" onClick={onClose}><Ic n="close" s={18} /></button></div><div className="mc">{children}</div>{footer && <div className="mf">{footer}</div>}</div></div>, host)
}
function Img({ value, onChange, folder, say, onBusy, wide }) {
  const [b, setB] = useState(false)
  const pick = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; setB(true); onBusy?.(true); try { onChange(await upload(f, folder)) } catch (x) { say(x.message || 'Upload failed') } setB(false); onBusy?.(false) }
  return <div className={'img' + (wide ? ' wide' : '')}>{value ? <img src={value} alt="" /> : <span>No image</span>}<div><label className="bt g sm">{b ? 'Uploading…' : value ? 'Replace image' : 'Upload image'}<input type="file" accept="image/*" hidden onChange={pick} /></label>{value && <button className="bt g sm" onClick={() => onChange('')}>Remove</button>}</div></div>
}

export default function Admin() {
  const [st, setSt] = useState('loading'), [user, setUser] = useState(null)
  useEffect(() => {
    document.title = 'Pinkish Admin'
    const m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex,nofollow'; document.head.appendChild(m)
    const vp = document.querySelector('meta[name="viewport"]'), old = vp?.content
    if (vp && !/viewport-fit/.test(old)) vp.content = old + ',viewport-fit=cover'
    const tc = document.createElement('meta'); tc.name = 'theme-color'; tc.content = '#f7effb'; document.head.appendChild(tc)
    document.documentElement.classList.add('adm-on')
    return () => { m.remove(); tc.remove(); if (vp && old != null) vp.content = old; document.documentElement.classList.remove('adm-on') }
  }, [])
  const check = useCallback(async s => {
    if (!s) { setUser(null); return setSt('login') }
    const { data } = await sb.from('admins').select('user_id').eq('user_id', s.user.id).maybeSingle()
    setUser(s.user); setSt(data ? 'ok' : 'denied')
  }, [])
  useEffect(() => {
    if (!sb) return setSt('nosb')
    const { data: { subscription } } = sb.auth.onAuthStateChange((_e, s) => { setTimeout(() => check(s), 0) })
    return () => subscription.unsubscribe()
  }, [check])
  if (st === 'loading') return <div className="adm"><div className="ctr"><i className="spin" /></div></div>
  if (st === 'nosb') return <div className="adm"><div className="ctr"><div className="lg"><h1>Supabase not configured</h1><p className="mut">Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then rebuild.</p></div></div></div>
  if (st === 'denied') return <div className="adm"><div className="ctr"><div className="lg"><h1>No admin access</h1><p className="mut">{user?.email} is not an admin account. Ask the store owner to add it.</p><button className="bt" onClick={() => sb.auth.signOut()}>Sign out</button></div></div></div>
  if (st === 'login') return <Login />
  return <Shell user={user} />
}

function Login() {
  const [f, setF] = useState({ e: '', p: '' }), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [show, setShow] = useState(false), [caps, setCaps] = useState(false), fails = useRef(0), lock = useRef(0)
  useEffect(() => {
    const t = document.querySelector('meta[name="theme-color"]'), old = t?.content
    if (t) t.content = '#4a1668'
    return () => { if (t && old != null) t.content = old }
  }, [])
  const go = async e => {
    e.preventDefault()
    if (Date.now() < lock.current) return setErr('Too many attempts. Wait a minute and try again.')
    setBusy(true); setErr('')
    const { error } = await sb.auth.signInWithPassword({ email: f.e.trim(), password: f.p })
    setBusy(false)
    if (error) { if (++fails.current >= 5) { lock.current = Date.now() + 60000; fails.current = 0 } setErr('Email or password is incorrect.') }
  }
  const ck = e => setCaps(!!e.getModifierState?.('CapsLock'))
  return <div className="adm"><div className="al">
    <aside className="al-hero">
      <div className="al-brand"><span className="al-lg"><img className="bmk" src="/logo-mark.webp?v=2" width="30" height="26" alt="" decoding="async" /></span>Pinkish <span>Admin</span></div>
      <h1>Run your store from one place</h1>
      <p>Orders, merchants and your catalogue, all in one private dashboard.</p>
      <ul>
        <li><i><Ic n="orders" s={22} /></i><span><b>Every order, live</b>Confirm, pack and deliver with one tap.</span></li>
        <li><i><Ic n="shops" s={22} /></i><span><b>Verify merchants</b>Review NID documents and approve shops.</span></li>
        <li><i><Ic n="products" s={22} /></i><span><b>Control the catalogue</b>Products, categories and the home banner.</span></li>
      </ul>
    </aside>
    <main className="al-main"><form className="al-card" onSubmit={go}>
      <span className="al-pill"><Ic n="shield" s={15} />Admin sign-in</span>
      <h2>Welcome back</h2>
      <p className="al-mut">Sign in to manage your store.</p>
      <label className="al-f"><span>Email</span><input type="email" inputMode="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck="false" enterKeyHint="next" placeholder="you@example.com" required value={f.e} onChange={e => setF({ ...f, e: e.target.value })} /></label>
      <label className="al-f"><span>Password</span><span className="al-pw"><input type={show ? 'text' : 'password'} autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck="false" enterKeyHint="go" placeholder="Your password" required value={f.p} onChange={e => setF({ ...f, p: e.target.value })} onKeyUp={ck} onKeyDown={ck} onBlur={() => setCaps(false)} /><button type="button" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow(v => !v)}>{show ? 'Hide' : 'Show'}</button></span>{caps && <em className="al-caps">Caps Lock is on</em>}</label>
      {err && <div className="al-err" role="alert">{err}</div>}
      <button className="bt al-go" disabled={busy}>{busy ? <><i className="spin sm" aria-hidden="true" />Signing in…</> : 'Sign in'}</button>
      <p className="al-note"><Ic n="lock" s={15} />Private admin area. You are signed out after 20 minutes idle.</p>
    </form></main>
  </div></div>
}

const first = o => (o.address?.name || 'there').trim().split(/\s+/)[0]
const WA = [
  ['Confirm', 'check', o => `Hi ${first(o)}, thank you for shopping with Pinkish! 💗 Your order #${o.order_no} (${taka(o.total)}) is confirmed. We'll pack it discreetly and keep you updated.`],
  ['Payment', 'rev', o => `Hi ${first(o)}, to confirm order #${o.order_no} please send ${taka(o.total)} via bKash and reply with the Transaction ID. Thank you!`],
  ['On the way', 'truck', o => `Hi ${first(o)}, your Pinkish order #${o.order_no} is out for delivery 🚚 ${o.payment_status === 'paid' ? 'Our rider will call you when nearby.' : 'Please keep ' + taka(o.total) + ' ready. Our rider will call you.'}`],
  ['Delivered', 'check', o => `Hi ${first(o)}, your order #${o.order_no} has been delivered. Thank you for choosing Pinkish! 💗 We'd love to hear your feedback.`],
  ['Address', 'pin', o => `Hi ${first(o)}, we're about to dispatch order #${o.order_no}. Could you please confirm your delivery address: ${o.address?.address || ''}`]
]
const defTpl = o => { const s = o.status || 0; return o.payment === 'bKash' && o.payment_status !== 'paid' && s === 0 ? 1 : [0, 0, 2, 3][s] }
const payLabel = o => o.payment_status === 'paid' ? 'Paid' : o.payment_status === 'verifying' ? 'Verifying' : 'Unpaid'
const invText = o => `🧾 Pinkish invoice #${o.order_no}\n${fmt(o.created_at)}\n\n` + (o.items || []).map(i => `• ${i.name}${i.variant ? ' (' + i.variant + ')' : ''} ×${i.qty} — ${taka(i.price * i.qty)}`).join('\n') + `${o.delivery_fee != null ? `\nDelivery: ${taka(o.delivery_fee)}` : ''}\n\nTotal: ${taka(o.total)}\nPayment: ${o.payment || '—'} (${payLabel(o)})\nThank you! 💗`

function Invoice({ o, onClose }) {
  const its = o.items || [], sub = its.reduce((a, i) => a + i.price * i.qty, 0), fee = o.delivery_fee == null ? null : +o.delivery_fee, disc = Math.max(0, sub + (fee || 0) - o.total), paid = o.payment_status === 'paid', trx = o.payment_ref || o.bkash_trx
  useEffect(() => {
    document.body.classList.add('inv-on')
    const h = e => e.key === 'Escape' && onClose(); addEventListener('keydown', h)
    return () => { document.body.classList.remove('inv-on'); removeEventListener('keydown', h) }
  }, [onClose])
  return createPortal(<div className="invp" role="dialog" aria-modal="true" aria-label={'Invoice #' + o.order_no}>
    <div className="invp-bar"><button className="invp-b" onClick={onClose}>← Back</button><div>{o.address?.phone && <a className="invp-b wa" href={wa(o.address.phone, invText(o))} target="_blank" rel="noopener noreferrer">WhatsApp</a>}<button className="invp-b pr" onClick={() => window.print()}>Print / Save PDF</button></div></div>
    <div className="invp-scroll"><article className="invp-sheet">
      {paid && <span className="stp">PAID</span>}
      <header className="ih"><div><div className="lk" aria-label="Pinkish"><img className="bmk" src="/logo-mark.webp?v=2" width="44" height="44" alt="" decoding="async" /><span className="wm"><span className="bp">Pink</span><span className="bi">ish</span></span></div><small>Discreet delivery across Chattogram</small></div><div className="it"><h2>INVOICE</h2><b>#{o.order_no}</b></div></header>
      <div className="im"><div><span>Date</span><b>{fmt(o.created_at)}</b></div><div><span>Order status</span><b>{STEPS[o.status || 0]}</b></div><div><span>Payment method</span><b>{o.payment || '—'}</b></div><div><span>Payment status</span><b className={'bg ' + (paid ? 'ok' : o.payment_status === 'verifying' ? 'w' : '')}>{payLabel(o)}</b></div>{trx && o.payment === 'bKash' && <div><span>bKash TrxID</span><b>{trx}</b></div>}</div>
      <div className="bd"><span className="bl">Bill to</span><p><b>{o.address?.name || 'Customer'}</b></p>{o.address?.phone && <p>{o.address.phone}</p>}<p>{o.address?.address || '—'}</p>{o.address?.note && <p className="nt2">Note: {o.address.note}</p>}</div>
      <table><thead><tr><th>Item</th><th className="r">Qty</th><th className="r">Amount</th></tr></thead><tbody>{its.map((i, ix) => <tr key={i.key || ix}><td>{i.name}<small>{i.variant ? i.variant + ' · ' : ''}{taka(i.price)} each</small></td><td className="r">{i.qty}</td><td className="r">{taka(i.price * i.qty)}</td></tr>)}</tbody></table>
      <div className="tot"><div><span>Subtotal</span><span>{taka(sub)}</span></div>{disc > 0.5 && <div><span>Discount</span><span>−{taka(disc)}</span></div>}{fee != null && <div><span>Delivery</span><span>{taka(fee)}</span></div>}<div className="g"><span>Total</span><span>{taka(o.total)}</span></div></div>
      <footer className="ft">Thank you for shopping with Pinkish 💗<br />Your order is packed discreetly.</footer>
    </article></div></div>, document.body)
}

const KIND = { order: ['bag', 'o'], pay: ['rev', 'p'], wish: ['wish', 'w'], shop: ['shops', 'w'], ret: ['returns', 'p'] }
function Notifs({ orders, shops, rets = [], ho = [], onShop, onReturn, notes, onClose, onOrder, onWish, onRead, onClear }) {
  const [tab, setTab] = useState('act'), [snap] = useState(() => new Set(notes.filter(n => !n.read).map(n => n.id)))
  useEffect(() => { onRead() }, [onRead])
  const ptodo = useMemo(() => shops.filter(s => s.status === 'pending'), [shops])
  const rtodo = useMemo(() => rets.filter(r => r.status === 'requested'), [rets])
  const htodo = useMemo(() => { const om = new Map(orders.map(o => [String(o.id), o])), sm = new Map(shops.map(s => [s.id, s])); return ho.filter(h => h.status === 'packed' && !h.rider_name).map(h => ({ h, o: om.get(String(h.order_id)), s: sm.get(h.shop_id) })).filter(x => x.o) }, [ho, orders, shops])
  const todo = useMemo(() => orders.filter(o => !o.status || o.payment_status === 'verifying').sort((a, b) => (b.payment_status === 'verifying') - (a.payment_status === 'verifying') || new Date(b.created_at) - new Date(a.created_at)), [orders])
  return <Modal cls="np" title="Notifications" onClose={onClose} footer={tab === 'log' && notes.length > 0 ? <button className="bt g sm" onClick={onClear}>Clear activity</button> : null}>
    <div className="seg nt" role="tablist" aria-label="Notification type">
      <button role="tab" aria-selected={tab === 'act'} className={tab === 'act' ? 'on' : ''} onClick={() => setTab('act')}>Action needed{todo.length + ptodo.length + rtodo.length + htodo.length > 0 && <em>{todo.length + ptodo.length + rtodo.length + htodo.length}</em>}</button>
      <button role="tab" aria-selected={tab === 'log'} className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>Activity{notes.length > 0 && <em className="g">{notes.length}</em>}</button></div>
    {tab === 'act' ? (todo.length + ptodo.length + rtodo.length + htodo.length ? <div className="nl">{htodo.map(({ h, o, s }) => <button key={h.id} className="nr" onClick={() => onOrder(o.id)}><span className="nk w"><Ic n="truck" s={19} /></span><span className="g1"><b>Assign a rider for pickup</b><small>#{o.order_no} · {s?.name || 'Seller'} packed it{s?.city ? ' · ' + s.city : ''}</small></span><span className="tm"><small>{ago(h.packed_at || h.created_at)}</small><Ic n="chev" s={16} /></span></button>)}{rtodo.map(r => <button key={r.id} className="nr" onClick={() => onReturn(r.id)}><span className="nk p"><Ic n="returns" s={19} /></span><span className="g1"><b>Review return request</b><small>#{r.order_no} · {r.reason} · {taka(r.amount)}</small></span><span className="tm"><small>{ago(r.created_at)}</small><Ic n="chev" s={16} /></span></button>)}{ptodo.map(s => <button key={s.id} className="nr" onClick={onShop}><span className="nk w"><Ic n="shops" s={19} /></span><span className="g1"><b>Verify new merchant</b><small>{s.name} · {s.city || s.phone}</small></span><span className="tm"><small>{ago(s.created_at)}</small><Ic n="chev" s={16} /></span></button>)}{todo.map(o => { const v = o.payment_status === 'verifying'; return <button key={o.id} className="nr" onClick={() => onOrder(o.id)}>
      <span className={'nk ' + (v ? 'p' : 'o')}><Ic n={v ? 'rev' : 'bag'} s={19} /></span>
      <span className="g1"><b>{v ? 'Verify bKash payment' : 'New order to process'}</b><small>#{o.order_no} · {o.address?.name || 'Customer'} · {taka(o.total)}</small></span>
      <span className="tm"><small>{ago(o.created_at)}</small><Ic n="chev" s={16} /></span></button> })}</div>
      : <div className="ne"><i><Ic n="check" s={28} /></i><b>You're all caught up</b><small>New orders and payments to verify show up here.</small></div>)
      : (notes.length ? <div className="nl">{notes.map(n => { const [ic, c] = KIND[n.k] || KIND.order; return <button key={n.id} className="nr" onClick={() => n.k === 'shop' ? onShop() : n.rid ? onReturn(n.rid) : n.oid ? onOrder(n.oid) : n.k === 'wish' ? onWish() : onClose()}>
        <span className={'nk ' + c}><Ic n={ic} s={19} /></span>
        <span className="g1"><b>{n.title}</b><small>{n.sub}</small></span>
        <span className="tm"><small>{ago(n.t)}</small>{snap.has(n.id) ? <i className="udot" aria-label="New" /> : <Ic n="chev" s={16} />}</span></button> })}</div>
        : <div className="ne"><i><Ic n="bell" s={26} /></i><b>No activity yet</b><small>Live updates appear here while you are signed in.</small></div>)}
  </Modal>
}

const readNotes = () => { try { const a = JSON.parse(localStorage.getItem('adm-notes') || '[]'); return Array.isArray(a) ? a.slice(0, 40) : [] } catch { return [] } }
const stab = (m, rows) => rows.map(r => { const s = JSON.stringify(r), h = m.get(r.id); if (h && h.s === s) return h.r; m.set(r.id, { s, r }); return r })

function Shell({ user }) {
  const [tab, setTab] = useState(() => { const h = location.hash.slice(1); return NAV.some(n => n[0] === h) ? h : 'dash' }), [d, setD] = useState({ orders: [], products: [], cats: [], wish: [], wishErr: false, shops: [], shopsErr: false, returns: [], retErr: false, ho: [], hoErr: false, ops: OPS0, riders: [], ridersErr: false, dl: [], rops: RO0 }), [toast, setToast] = useState(''), [ld, setLd] = useState(true), [rf, setRf] = useState(false), tt = useRef(0), lt = useRef(0), [notes, setNotes] = useState(readNotes), [nOpen, setNOpen] = useState(false), [focus, setFocus] = useState(null), cache = useRef({ o: new Map(), p: new Map() })
  const say = useCallback(m => { setToast(m); clearTimeout(tt.current); tt.current = setTimeout(() => setToast(''), 2400) }, [])
  const ridersRef = useRef([]); ridersRef.current = d.riders || []
  const push = useCallback(n => { setNotes(a => [{ id: Date.now() + Math.random(), t: Date.now(), read: false, ...n }, ...a].slice(0, 40)); if (n.k !== 'wish') navigator.vibrate?.(60) }, [])
  const readAll = useCallback(() => setNotes(a => a.some(n => !n.read) ? a.map(n => n.read ? n : { ...n, read: true }) : a), [])
  const openOrder = useCallback(id => { setFocus(id); setNOpen(false); setTab('orders'); history.replaceState(null, '', '#orders') }, [])
  const clearFocus = useCallback(() => setFocus(null), [])
  const [rfocus, setRfocus] = useState(null), [opre, setOpre] = useState(null), hoSeen = useRef(new Map()), dlSeen = useRef(new Map())
  const openPickups = useCallback(() => { setOpre('pick'); setTab('orders'); history.replaceState(null, '', '#orders') }, [])
  const clearPre = useCallback(() => setOpre(null), [])
  const openReturn = useCallback(id => { setRfocus(id); setNOpen(false); setTab('returns'); history.replaceState(null, '', '#returns') }, [])
  const clearRfocus = useCallback(() => setRfocus(null), [])
  useEffect(() => { try { localStorage.setItem('adm-notes', JSON.stringify(notes)) } catch { /* storage unavailable */ } }, [notes])
  const go = t => { setTab(t); history.replaceState(null, '', '#' + t); document.querySelector('.scr')?.scrollTo?.(0, 0) }
  const load = useCallback(async () => {
    const [o, p, c, w, sp, rr, hv, so, rd, dv, ro] = await Promise.all([sb.from('orders').select('*').in('payment_status', ['unpaid', 'verifying', 'paid']).order('created_at', { ascending: false }).limit(500), sb.from('products').select('*').order('created_at', { ascending: false }), sb.from('categories').select('*').order('created_at'), sb.from('wishlists').select('*').order('created_at', { ascending: false }).limit(1000), sb.from('shops').select('*').order('created_at', { ascending: false }), sb.from('return_requests').select('*').order('created_at', { ascending: false }).limit(500), sb.from('seller_handovers').select('*').order('created_at', { ascending: false }).limit(1000), sb.from('site_settings').select('value').eq('key', 'seller_ops').maybeSingle(), sb.from('riders').select('*').order('created_at', { ascending: false }), sb.from('deliveries').select('*').order('created_at', { ascending: false }).limit(1000), sb.from('site_settings').select('value').eq('key', 'rider_ops').maybeSingle()])
    const er = o.error || p.error || c.error; if (er) say(er.message)
    setD({ orders: stab(cache.current.o, o.data || []), products: stab(cache.current.p, p.data || []), cats: c.data || [], wish: w.data || [], wishErr: !!w.error, shops: sp.data || [], shopsErr: !!sp.error, returns: rr.data || [], retErr: !!rr.error, ho: hv.data || [], hoErr: !!hv.error, ops: { ...OPS0, ...(so.data?.value || {}) }, riders: rd.data || [], ridersErr: !!rd.error, dl: dv.data || [], rops: { ...RO0, ...(ro.data?.value || {}) } }); hoSeen.current = new Map((hv.data || []).map(h => [h.id, h.status])); dlSeen.current = new Map((dv.data || []).map(x => [x.id, x.status])); setLd(false)
  }, [say])
  useEffect(() => {
    const later = () => { clearTimeout(lt.current); lt.current = setTimeout(load, 400) } // coalesce bursts of realtime events
    load()
    const ch = sb.channel('adm-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, p => { const r = p.new || {}; say('🛍️ New order #' + r.order_no); push({ k: 'order', title: 'New order #' + r.order_no, sub: (r.address?.name || 'Customer') + ' · ' + taka(r.total), oid: r.id }); later() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, p => { const r = p.new || {}; if (r.payment_status === 'verifying' && p.old?.payment_status !== 'verifying') { say('💗 bKash payment to verify'); push({ k: 'pay', title: 'Verify bKash payment', sub: `#${r.order_no} · ${r.address?.name || 'Customer'} · ${taka(r.total)}`, oid: r.id }) } later() })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wishlists' }, p => { say('♡ Item added to a wishlist'); push({ k: 'wish', title: 'Saved to wishlist', sub: p.new?.product_name || 'A product' }); later() })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shops' }, p => { const r = p.new || {}; say('🏪 New merchant: ' + (r.name || 'shop')); push({ k: 'shop', title: 'New merchant to verify', sub: (r.name || 'Shop') + (r.city ? ' · ' + r.city : '') }); later() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shops' }, later)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'seller_handovers' }, later)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'seller_handovers' }, p => { const r = p.new || {}, was = hoSeen.current.get(r.id); hoSeen.current.set(r.id, r.status); if (was !== r.status) { if (r.status === 'packed') { say('📦 A seller packed an order'); push({ k: 'shop', title: 'Seller packed an order', sub: r.rider_name ? 'Rider ' + r.rider_name + ' can collect it' : 'Assign a rider to collect it', oid: r.order_id }) } else if (r.status === 'picked') push({ k: 'order', title: 'Parcel handed to rider', sub: 'Seller confirmed with the pickup code', oid: r.order_id }) } later() })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'return_requests' }, p => { const r = p.new || {}; say('↩ Return requested #' + r.order_no); push({ k: 'ret', title: 'Return requested #' + r.order_no, sub: (r.reason || 'Return') + ' · ' + taka(r.amount), rid: r.id }); later() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'return_requests' }, p => { const r = p.new || {}; if (r.seller_response && r.seller_response !== p.old?.seller_response) push({ k: 'ret', title: (r.seller_response === 'dispute' ? 'Seller disputed return #' : 'Seller agreed to return #') + r.order_no, sub: r.seller_note || r.reason || '', rid: r.id }); later() })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'riders' }, p => { const r = p.new || {}; say('🛵 New rider: ' + (r.name || 'rider')); push({ k: 'shop', title: 'New rider to verify', sub: (r.name || 'Rider') + (r.area ? ' · ' + r.area : '') }); later() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'riders' }, p => { const r = p.new; const old = r?.user_id && ridersRef.current.find(y => y.user_id === r.user_id); if (!old || old.status !== r.status) return later(); setD(x => ({ ...x, riders: x.riders.map(y => y.user_id === r.user_id ? { ...y, ...r } : y) })) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, p => { const r = p.new || {}, was = dlSeen.current.get(r.id); if (r.id) dlSeen.current.set(r.id, r.status); if (r.status && was && was !== r.status) { if (r.status === 'failed') { say('⚠️ A rider could not deliver'); push({ k: 'order', title: 'Delivery failed', sub: r.fail_reason || 'Rider could not deliver', oid: r.order_id }) } else if (r.status === 'delivered') push({ k: 'order', title: 'Delivered by rider', sub: 'Customer code confirmed', oid: r.order_id }) } if (r.status === 'assigned' && !r.rider_id && r.fail_reason) push({ k: 'order', title: 'Rider declined a job', sub: r.fail_reason, oid: r.order_id }); later() })
      .subscribe()
    return () => { clearTimeout(lt.current); sb.removeChannel(ch) }
  }, [load, say, push])
  const refresh = async () => { setRf(true); await load(); setRf(false) }
  useEffect(() => {
    let t; const reset = () => { clearTimeout(t); t = setTimeout(() => sb.auth.signOut(), IDLE) }, ev = ['pointerdown', 'keydown', 'scroll', 'touchmove']
    ev.forEach(e => addEventListener(e, reset, { passive: true, capture: true })); reset()
    return () => { clearTimeout(t); ev.forEach(e => removeEventListener(e, reset, { capture: true })) }
  }, [])
  const pend = d.orders.filter(o => !o.status).length, pshop = (d.shops || []).filter(s => s.status === 'pending').length, pret = (d.returns || []).filter(r => r.status === 'requested').length, prider = (d.ho || []).filter(h => h.status === 'packed' && !h.rider_name).length, pridr = (d.riders || []).filter(r => r.status === 'pending').length, fdl = (d.dl || []).filter(x => x.status === 'failed').length, todo = d.orders.filter(o => !o.status || o.payment_status === 'verifying').length + pshop + pret + prider + pridr + fdl, unread = notes.filter(n => !n.read).length, title = NAV.find(n => n[0] === tab)?.[1] || 'Overview'
  const nm = user.user_metadata?.full_name || (user.email || 'admin').split('@')[0]
  const p = { d, reload: load, say, go, focus, clearFocus, openOrder, openReturn, openPickups }
  return <div className="adm"><div className="shell"><nav className="sb" aria-label="Admin sections"><div className="brand"><span className="bm"><img src="/logo-mark.webp?v=2" width="26" height="22" alt="" decoding="async" /></span><span className="bp">Pink</span><span className="bi">ish</span></div>
    <div className="me"><span className="mav" aria-hidden="true">{ini(nm)}</span><b>{nm}</b><small>Store admin</small></div>
    <div className="nv">{NAV.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} onClick={() => go(k)}><span className="ic" aria-hidden="true"><Ic n={k === 'notify' ? 'bell' : k} /></span><span className="lb">{l}</span>{k === 'orders' && pend > 0 && <em>{pend}</em>}{k === 'shops' && pshop > 0 && <em>{pshop}</em>}{k === 'returns' && pret > 0 && <em>{pret}</em>}{k === 'riders' && pridr + fdl > 0 && <em>{pridr + fdl}</em>}</button>)}</div>
    <div className="sp" /><button className="lo" onClick={() => sb.auth.signOut()}><i aria-hidden="true"><Ic n="out" s={15} /></i>Log out</button></nav>
    <main className="mn"><header className="top"><h1>{title}</h1><div className="ta"><button className={'ib2 bell' + (todo ? ' has' : '')} aria-label={todo ? todo + ' items need attention' : 'Notifications'} aria-haspopup="dialog" onClick={() => setNOpen(true)}><Ic n="bell" s={21} />{todo > 0 ? <i>{todo > 99 ? '99+' : todo}</i> : unread > 0 && <i className="dot" />}</button><button className={'ib2' + (rf ? ' spinning' : '')} aria-label="Refresh" onClick={refresh}><Ic n="refresh" s={20} /></button><button className="ib2 mo" aria-label="Sign out" onClick={() => sb.auth.signOut()}><Ic n="out" s={20} /></button></div></header>
      <div className="scr">
      {ld ? <div className="ctr"><i className="spin" /></div> : tab === 'dash' ? <Dash {...p} /> : tab === 'orders' ? <Orders {...p} pre={opre} clearPre={clearPre} /> : tab === 'returns' ? <Returns {...p} focus={rfocus} clearFocus={clearRfocus} /> : tab === 'wish' ? <Wish {...p} /> : tab === 'products' ? <Products {...p} /> : tab === 'cats' ? <Cats {...p} /> : tab === 'notify' ? <Notify {...p} /> : tab === 'shops' ? <Shops {...p} /> : tab === 'riders' ? <Riders {...p} /> : tab === 'hero' ? <Hero say={say} d={d} /> : <Dash {...p} />}</div></main></div>
    {nOpen && <Notifs orders={d.orders} shops={d.shops || []} rets={d.returns || []} ho={d.ho || []} onReturn={openReturn} onShop={() => { setNOpen(false); go('shops') }} notes={notes} onClose={() => setNOpen(false)} onOrder={openOrder} onWish={() => { setNOpen(false); go('wish') }} onRead={readAll} onClear={() => setNotes([])} />}
    {toast && <div className="toast" role="status">{toast}</div>}</div>
}

const sh = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + 'm' : n >= 1e3 ? (n / 1e3).toFixed(1).replace('.0', '') + 'k' : String(Math.round(n))
const pct = (a, b) => b ? Math.round((a - b) / b * 100) : a ? 100 : 0
const clamp = v => Math.min(100, Math.max(0, v))
// smooth curve through points (Catmull-Rom -> cubic bezier), in a 0-100 box
const smooth = pts => pts.length < 2 ? '' : pts.reduce((s, p, i, a) => {
  if (!i) return `M${p[0]},${p[1]}`
  const p0 = a[i - 2] || a[i - 1], p1 = a[i - 1], p3 = a[i + 1] || p
  return s + `C${p1[0] + (p[0] - p0[0]) / 6},${clamp(p1[1] + (p[1] - p0[1]) / 6)} ${p[0] - (p3[0] - p1[0]) / 6},${clamp(p[1] - (p3[1] - p1[1]) / 6)} ${p[0]},${p[1]}`
}, '')
const IC = ['inbox', 'clock', 'truck', 'check']

function Activity({ orders }) {
  const [r, setR] = useState(7), [hi, setHi] = useState(null), box = useRef(null)
  const days = useMemo(() => {
    const m = new Map()
    orders.forEach(o => { const k = new Date(o.created_at).toDateString(), e = m.get(k) || { v: 0, n: 0 }; e.v += +o.total || 0; e.n++; m.set(k, e) })
    return [...Array(r)].map((_, i) => { const t = new Date(); t.setDate(t.getDate() - (r - 1) + i); const e = m.get(t.toDateString()) || { v: 0, n: 0 }; return { t, v: e.v, n: e.n } })
  }, [orders, r])
  const top = Math.max(1, ...days.map(x => x.v)) * 1.1, X = i => i / (r - 1) * 100, Y = v => 96 - v / top * 90
  const line = smooth(days.map((x, i) => [X(i), Y(x.v)])), best = days.reduce((b, x, i) => x.v >= days[b].v ? i : b, 0)
  const a = hi ?? best, cur = days[a], step = r === 7 ? 1 : r === 14 ? 2 : 5, G = [0, 1, 2, 3, 4]
  const move = e => { const b = box.current?.getBoundingClientRect(); if (!b || !b.width) return; setHi(Math.round(Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)) * (r - 1))) }
  return <section className="sec"><div className="sh"><h2>Activity</h2>
    <div className="seg" role="group" aria-label="Date range">{[7, 14, 30].map(n => <button key={n} className={r === n ? 'on' : ''} aria-pressed={r === n} onClick={() => { setR(n); setHi(null) }}>{n} days</button>)}</div></div>
    <div className="act">
      <div className="ay" aria-hidden="true">{G.map(i => <span key={i} style={{ top: 96 - 22.5 * i + '%' }}>{sh(top * i / 4)}</span>)}</div>
      <div className="ap" ref={box} onPointerMove={move} onPointerDown={move} onPointerLeave={() => setHi(null)} role="img" aria-label={`Revenue per day for the last ${r} days`}>
        {G.map(i => <i className="gl" key={i} style={{ top: 96 - 22.5 * i + '%' }} />)}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs>
          <linearGradient id="agl" x1="0" x2="1"><stop offset="0" stopColor="#8e2a8c" /><stop offset="1" stopColor="#e0457b" /></linearGradient>
          <linearGradient id="agf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e0457b" stopOpacity=".26" /><stop offset="1" stopColor="#e0457b" stopOpacity="0" /></linearGradient></defs>
          <path d={line + 'L100,96L0,96Z'} fill="url(#agf)" /><path d={line} fill="none" stroke="url(#agl)" strokeWidth="3.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" /></svg>
        <i className="adot" style={{ left: X(a) + '%', top: Y(cur.v) + '%' }} />
        <div className={'atip' + (Y(cur.v) < 38 ? ' lw' : '')} style={{ left: Math.min(86, Math.max(14, X(a))) + '%', top: Y(cur.v) + '%' }}><b>{taka(cur.v)}</b><small>{cur.t.toLocaleDateString([], { month: 'short', day: 'numeric' })} · {cur.n} order{cur.n === 1 ? '' : 's'}</small></div>
      </div>
      <div className="ax" aria-hidden="true">{days.map((x, i) => ((i % step === 0 && r - 1 - i >= step) || i === r - 1) && <span key={i} style={{ left: X(i) + '%' }}>{r === 7 ? x.t.toLocaleDateString([], { weekday: 'short' }) : x.t.getDate()}</span>)}</div>
    </div></section>
}

function Dash({ d, go, openPickups }) {
  const { orders, products } = d, hby = useMemo(() => { const m = new Map(); (d.ho || []).forEach(h => { const k = String(h.order_id); m.set(k, [...(m.get(k) || []), h]) }); return m }, [d.ho])
  const pick = useMemo(() => { let ready = 0, packing = 0, n = 0; orders.forEach(o => { const hs = hby.get(String(o.id)); if (!hoOpen(o, hs)) return; n++; hs.forEach(h => { if (h.status === 'packed') ready++; else if (h.status === 'new') packing++ }) }); return { n, ready, packing } }, [orders, hby]), pshops = (d.shops || []).filter(s => s.status === 'pending'), prets = (d.returns || []).filter(r => r.status === 'requested')
  const S = useMemo(() => {
    const T = new Date().setHours(0, 0, 0, 0), D = 864e5, at = o => +new Date(o.created_at)
    const sum = (a, b) => orders.reduce((s, o) => at(o) >= a && at(o) < b ? s + (+o.total || 0) : s, 0), cnt = (a, b) => orders.filter(o => at(o) >= a && at(o) < b).length
    const c4 = [0, 0, 0, 0]; orders.forEach(o => { const s = o.status || 0; if (s in c4) c4[s]++ })
    const m = new Map()
    orders.forEach(o => (o.items || []).forEach(i => { const k = String(i.id ?? i.name), e = m.get(k) || { name: i.name, img: i.image_url, em: i.emoji, q: 0, v: 0 }; e.q += +i.qty || 0; e.v += (+i.price || 0) * (+i.qty || 0); m.set(k, e) }))
    const all = [...m.values()].sort((x, y) => y.q - x.q), tq = all.reduce((s, x) => s + x.q, 0) || 1
    return { rev: orders.reduce((a, o) => a + (+o.total || 0), 0), r7: sum(T - 6 * D, T + D), p7: sum(T - 13 * D, T - 6 * D), today: cnt(T, T + D), yest: cnt(T - D, T), c4, best: all.slice(0, 4).map(x => ({ ...x, p: Math.round(x.q / tq * 100) })) }
  }, [orders])
  const low = products.filter(x => x.stock != null && x.stock <= 5), pend = S.c4[0]
  const K = [['Revenue', S.rev, taka, pct(S.r7, S.p7), 'rev', 'Last 7 days vs the 7 before'], ['Orders today', S.today, undefined, pct(S.today, S.yest), 'bag', 'Today vs yesterday'], ['Avg. order', orders.length ? S.rev / orders.length : 0, taka, null, 'avg'], ['Live products', products.filter(x => x.is_active !== false).length, undefined, null, 'products']]
  return <div className="pg dg">
    <div className="kps">{K.map(([l, v, f, t, ic, tip], i) => <div className={'kpi k' + i} key={l}><div className="kl"><span className="ki"><Ic n={ic} s={19} /></span>{t != null && <i className={'tr ' + (t >= 0 ? 'up' : 'dn')} title={tip}>{t >= 0 ? '↑' : '↓'} {Math.abs(t)}%</i>}</div><b><Count to={v} f={f} /></b><span className="kn">{l}</span></div>)}</div>
    <div className="promo"><div><small>Needs attention</small><h2><em><Count to={pend} /></em> order{pend === 1 ? '' : 's'} waiting</h2><p>{pend ? 'Start processing to keep customers happy.' : 'You are all caught up. Nice work!'}</p><button className="bt sm" onClick={() => go('orders')}>{pend ? 'Review now' : 'View orders'}</button></div>
      <div className="ring" aria-hidden="true"><svg viewBox="0 0 130 100" fill="none" strokeLinecap="round"><path d="M10 96A55 55 0 0 1 65 41" stroke="#ffb3d5" strokeWidth="9" /><path d="M24 96A41 41 0 0 1 65 55" stroke="#8e2a8c" strokeWidth="9" /><path d="M38 96A27 27 0 0 1 65 69" stroke="#e0457b" strokeWidth="9" /><path d="M65 41A55 55 0 0 1 120 96" stroke="#c9b6f7" strokeWidth="9" /></svg><b><Count to={pend} /></b></div></div>
    {pshops.length > 0 && <button className="mq" onClick={() => go('shops')}><span className="mq-i"><Ic n="shops" s={22} /></span><span className="g1"><b>{pshops.length} merchant{pshops.length === 1 ? '' : 's'} waiting for verification</b><small>{pshops.slice(0, 2).map(s => s.name).join(', ')}{pshops.length > 2 ? ' +' + (pshops.length - 2) : ''}</small></span><Ic n="chev" s={18} /></button>}
    {prets.length > 0 && <button className="mq rq2" onClick={() => go('returns')}><span className="mq-i"><Ic n="returns" s={22} /></span><span className="g1"><b>{prets.length} return request{prets.length === 1 ? '' : 's'} to review</b><small>{prets.slice(0, 2).map(r => '#' + r.order_no + ' · ' + r.reason).join(', ')}{prets.length > 2 ? ' +' + (prets.length - 2) : ''}</small></span><Ic n="chev" s={18} /></button>}
    {pick.n > 0 && <button className="mq pk" onClick={openPickups}><span className="mq-i"><Ic n="truck" s={22} /></span><span className="g1"><b>{pick.ready} parcel{pick.ready === 1 ? '' : 's'} ready to collect from sellers</b><small>{pick.packing} still packing · {pick.n} order{pick.n === 1 ? '' : 's'} waiting for seller pickup</small></span><Ic n="chev" s={18} /></button>}
    <Activity orders={orders} />
    <section className="sec"><div className="sh"><h2>Top sellers</h2></div>
      <div className="tp">{S.best.length ? S.best.map(x => <div className="tpr" key={x.name}><span className="th">{x.img ? <img src={x.img} alt="" loading="lazy" /> : x.em || '🛍️'}</span><div className="g1"><b>{x.name}</b><small>{x.q} sold · {taka(x.v)}</small></div><b className="pc">{x.p}%</b></div>) : <p className="mut">Your best sellers will show up after the first orders.</p>}</div>
      {S.best.length > 0 && <button className="vm" onClick={() => go('products')}>View products ›</button>}</section>
    <section className="chn"><div><h2>Order pipeline</h2><p className="mut">Where your {orders.length} recent order{orders.length === 1 ? '' : 's'} stand right now.</p></div>
      <div className="cc">{STEPS.map((l, i) => <button key={l} className={'s' + i} onClick={() => go('orders')}><i aria-hidden="true"><Ic n={IC[i]} s={20} /></i><span>{l}</span><b><Count to={S.c4[i]} /></b></button>)}<button className="full" onClick={() => go('orders')}><span>All orders</span><em aria-hidden="true">→</em></button></div></section>
    <section className="cd"><div className="rh"><h2>Recent orders</h2><button className="bt g sm" onClick={() => go('orders')}>View all</button></div>{orders.slice(0, 5).map(o => <div className="ln" key={o.id}><span>#{o.order_no} · {o.address?.name}</span><span className={'pl s' + (o.status || 0)}>{STEPS[o.status || 0]}</span><b>{taka(o.total)}</b></div>)}{!orders.length && <p className="mut">No orders yet.</p>}</section>
    <section className="cd"><h2>Low stock</h2>{low.length ? low.slice(0, 6).map(x => <div className="ln" key={x.id}><span>{x.name}</span><b className={x.stock ? 'wn' : 'er'}>{x.stock ? x.stock + ' left' : 'Sold out'}</b></div>) : <p className="mut">Nothing running low. Set a stock count on a product to track it.</p>}</section>
  </div>
}

const PAGE = 25
const OrderCard = memo(function OrderCard({ o, hs, dv, onOpen, onNext }) {
  const hr = (hs || []).filter(h => h.status !== 'cancelled'), hReady = hr.filter(h => h.status !== 'new').length, hDone = hr.length > 0 && hr.every(h => h.status === 'picked')
  const st = o.status || 0, its = o.items || [], n = its.reduce((a, i) => a + i.qty, 0), ph = o.address?.phone
  return <article className={'oc s' + st}>
    <button className="ob-main" onClick={() => onOpen(o.id)}>
      <span className="av">{ini(o.address?.name)}</span>
      <span className="g1"><b>{o.address?.name || 'Customer'} {st === 0 && <i className="nw">NEW</i>}</b><small>#{o.order_no} · {ago(o.created_at)}</small></span>
      <span className="rt"><b>{taka(o.total)}</b><span className={'pl s' + st}>{STEPS[st]}</span></span>
      <span className="its">{its.map(i => `${i.name}${i.qty > 1 ? ' ×' + i.qty : ''}`).join(', ') || 'No items'}</span>
      <span className="pm"><span>{n} item{n === 1 ? '' : 's'}</span><span>{o.payment}</span>{o.payment_status === 'paid' && <span className="pd">✓ Paid</span>}{o.payment_status === 'verifying' && <span className="vf">⏳ Verify</span>}{hr.length > 0 && st < 2 && <span className={hDone ? 'pd' : 'hv'}>{hDone ? '✓ Collected from sellers' : `📦 ${hReady}/${hr.length} seller${hr.length === 1 ? '' : 's'} ready`}</span>}{modeOf(o) === 'courier' && st < 4 && <span className={'crb' + (o.courier_tracking ? ' ok' : '')}>📦 {o.courier_tracking ? (o.courier_name || 'Courier') + ' booked' : 'Courier · book it'}</span>}{dv && dv.status !== 'cancelled' && st < 4 && <span className={'rdc ' + dv.status}>🛵 {dv.rname ? dv.rname + ' · ' : ''}{(DLV[dv.status] || DLV.assigned)[0]}</span>}</span>
    </button>
    <div className="oa"><small><Ic n="pin" s={13} /> {o.address?.address || 'No address'}</small>
      <div className="oq">{ph && <a className="ib3" href={'tel:' + ph} aria-label="Call customer"><Ic n="phone" s={17} /></a>}{ph && <a className="ib3 wa" href={wa(ph, WA[defTpl(o)][2](o))} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp customer"><Ic n="chat" s={17} /></a>}
        {st < 3 ? <button className="bt sm" onClick={() => onNext(o)}>{NEXT[st]} →</button> : <span className="ok">✓ Completed</span>}</div></div>
  </article>
})

function Orders({ d: { orders, returns = [], ho = [], shops = [], products = [], riders = [], dl = [], ridersErr }, reload, say, focus, clearFocus, openReturn, pre, clearPre }) {
  const [f, setF] = useState('all'), [q, setQ] = useState(''), [rg, setRg] = useState('all'), [sel, setSel] = useState(null), [busy, setBusy] = useState(false), [vo, setVo] = useState(false), [lim, setLim] = useState(PAGE), [inv, setInv] = useState(false), bz = useRef(false)
  const [po, setPo] = useState(false), [nr, setNr] = useState(false), [cb, setCb] = useState(false)
  const dby = useMemo(() => { const rn = new Map(riders.map(r => [r.user_id, (r.name || '').split(' ')[0]])); return new Map(dl.map(x => [String(x.order_id), { ...x, rname: rn.get(x.rider_id) || '' }])) }, [dl, riders])
  const noRider = useCallback(o => modeOf(o) !== 'courier' && (o.status || 0) >= 1 && (o.status || 0) < 3 && !dby.get(String(o.id))?.rider_id, [dby])
  const toBook = useCallback(o => modeOf(o) === 'courier' && (o.status || 0) >= 1 && (o.status || 0) < 3 && !o.courier_tracking, [])
  const hby = useMemo(() => { const m = new Map(); ho.forEach(h => { const k = String(h.order_id); m.set(k, [...(m.get(k) || []), h]) }); return m }, [ho])
  useEffect(() => { if (pre === 'pick') { setPo(true); setF('all'); clearPre() } }, [pre, clearPre])
  const dq = useDeferredValue(q)
  const base = useMemo(() => {
    const k = dq.trim().toLowerCase(), now = new Date()
    return orders.filter(o => {
      const t = new Date(o.created_at)
      const okR = rg === 'all' || (rg === 'today' ? t.toDateString() === now.toDateString() : now - t <= +rg * 864e5)
      return okR && (!k || `${o.order_no} ${o.address?.name} ${o.address?.phone} ${o.address?.address}`.toLowerCase().includes(k))
    })
  }, [orders, dq, rg])
  const cnt = useMemo(() => { const m = [0, 0, 0, 0]; base.forEach(o => { m[o.status || 0]++ }); return m }, [base])
  const vcnt = useMemo(() => base.filter(o => o.payment_status === 'verifying').length, [base])
  const pcnt = useMemo(() => base.filter(o => hoOpen(o, hby.get(String(o.id)))).length, [base, hby])
  const ncnt = useMemo(() => riders.length ? base.filter(noRider).length : 0, [base, noRider, riders.length])
  const ccnt = useMemo(() => base.filter(toBook).length, [base, toBook])
  const list = useMemo(() => base.filter(o => (f === 'all' || (o.status || 0) === +f) && (!vo || o.payment_status === 'verifying') && (!po || hoOpen(o, hby.get(String(o.id)))) && (!nr || noRider(o)) && (!cb || toBook(o))), [base, f, vo, po, hby, nr, noRider, cb, toBook])
  useEffect(() => { setLim(PAGE) }, [f, dq, rg, vo, po, nr, cb])
  useEffect(() => { if (focus) { setF('all'); setVo(false); setSel(focus); clearFocus() } }, [focus, clearFocus])
  const sum = useMemo(() => list.reduce((a, o) => a + (+o.total || 0), 0), [list])
  const setStatus = useCallback(async (o, s) => {
    if (bz.current || s === (o.status || 0)) return
    if (s === 2 && modeOf(o) === 'courier' && !o.courier_tracking && !confirm('No courier tracking ID is saved for this order yet. Mark it Out for delivery anyway?')) return
    if (s >= 2 && s < 4 && hoOpen(o, hby.get(String(o.id))) && !confirm('Some sellers have not handed over their items yet. Mark this order as ' + STEPS[s] + ' anyway? Their pickups will be marked as collected.')) return
    bz.current = true; setBusy(true)
    const { error } = await sb.from('orders').update({ status: s }).eq('id', o.id)
    bz.current = false; setBusy(false)
    if (error) return say(error.message); say(`#${o.order_no} → ${STEPS[s]}`); reload()
  }, [reload, say, hby])
  const next = useCallback(o => setStatus(o, (o.status || 0) + 1), [setStatus])
  const openSel = useCallback(id => setSel(id), [])
  const closeSel = useCallback(() => { setSel(null); setInv(false) }, [])
  const closeInv = useCallback(() => setInv(false), [])
  const setPay = async (o, ok) => {
    if (bz.current) return
    if (!ok && !confirm('Reject this Transaction ID? The customer will be able to submit it again.')) return
    bz.current = true; setBusy(true)
    const { error } = await sb.from('orders').update(ok ? { payment_status: 'paid', payment_ref: o.bkash_trx } : { payment_status: 'unpaid', bkash_trx: null, bkash_sender: null, bkash_submitted_at: null }).eq('id', o.id)
    bz.current = false; setBusy(false); if (error) return say(error.message)
    say(ok ? `#${o.order_no} payment verified ✓` : `#${o.order_no} payment rejected`); reload()
  }
  const copy = (t, m) => { navigator.clipboard?.writeText(t || '').then(() => say(m + ' copied'), () => say('Could not copy')) }
  const csv = () => {
    const c = v => { v = String(v ?? ''); if (/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"' }
    const rows = [['Order', 'Date', 'Customer', 'Phone', 'Address', 'Items', 'Payment', 'Status', 'Total'], ...list.map(o => [o.order_no, o.created_at, o.address?.name, o.address?.phone, o.address?.address, (o.items || []).map(i => `${i.name}${i.variant ? ' (' + i.variant + ')' : ''} x${i.qty}`).join('; '), o.payment, STEPS[o.status || 0], o.total])]
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map(r => r.map(c).join(',')).join('\n')], { type: 'text/csv' })); a.download = 'orders.csv'; a.click(); URL.revokeObjectURL(a.href)
  }
  const cur = sel && orders.find(o => o.id === sel)
  const st = cur ? cur.status || 0 : 0, ph = cur?.address?.phone
  const sub = cur ? (cur.items || []).reduce((a, i) => a + i.price * i.qty, 0) : 0
  const curRet = cur ? returns.find(r => r.order_id === String(cur.id)) : null
  return <div className="pg">
    <div className="ob">{STEPS.map((l, i) => <button key={l} className={'s' + i + (f === String(i) ? ' on' : '')} aria-pressed={f === String(i)} onClick={() => setF(f === String(i) ? 'all' : String(i))}><span className="oi"><Ic n={IC[i]} s={16} /></span><small>{l}</small><b><Count to={cnt[i]} /></b></button>)}</div>
    <div className="tl"><label className="sr"><Ic n="search" s={18} /><input className="in" type="search" inputMode="search" enterKeyHint="search" placeholder="Search order, name, phone, address" aria-label="Search orders" value={q} onChange={e => setQ(e.target.value)} /></label>
      <select className="in rg" aria-label="Date range" value={rg} onChange={e => setRg(e.target.value)}>{RANGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      {(pcnt > 0 || po) && <button className={'vchip pk' + (po ? ' on' : '')} aria-pressed={po} onClick={() => setPo(v => !v)}><Ic n="truck" s={15} />Seller pickups<em>{pcnt}</em></button>}
      {(ncnt > 0 || nr) && <button className={'vchip pk' + (nr ? ' on' : '')} aria-pressed={nr} onClick={() => setNr(v => !v)}><Ic n="riders" s={15} />Needs rider<em>{ncnt}</em></button>}
      {(ccnt > 0 || cb) && <button className={'vchip pk' + (cb ? ' on' : '')} aria-pressed={cb} onClick={() => setCb(v => !v)}><Ic n="pkg" s={15} />Book courier<em>{ccnt}</em></button>}
      {(vcnt > 0 || vo) && <button className={'vchip' + (vo ? ' on' : '')} aria-pressed={vo} onClick={() => setVo(v => !v)}><Ic n="alert" s={15} />Verify payment<em>{vcnt}</em></button>}
      <button className="bt g sm csvb" onClick={csv}>Export CSV</button></div>
    <p className="sum"><b>{list.length}</b> order{list.length === 1 ? '' : 's'} · <b>{taka(sum)}</b>{(f !== 'all' || po || nr || cb) && <> · <button className="lk" onClick={() => { setF('all'); setPo(false); setNr(false); setCb(false) }}>Clear filter</button></>}</p>
    <div className="ol">{list.slice(0, lim).map(o => <OrderCard key={o.id} o={o} hs={hby.get(String(o.id))} dv={dby.get(String(o.id))} onOpen={openSel} onNext={next} />)}{!list.length && <p className="mut pad cd">No orders match. Orders placed in the store appear here instantly.</p>}</div>
    {list.length > lim && <button className="bt g more" onClick={() => setLim(l => l + PAGE)}>Show {Math.min(PAGE, list.length - lim)} more · {list.length - lim} left</button>}
    {cur && <Modal title={'Order #' + cur.order_no} onClose={closeSel} footer={<>{st < 3 && <button className="bt" disabled={busy} onClick={() => setStatus(cur, st + 1)}>{NEXT[st]} →</button>}<button className={'bt' + (st < 3 ? ' g' : '')} onClick={() => setInv(true)}><Ic n="receipt" s={17} />Invoice</button></>}>
      <div className="steps">{STEPS.map((s, i) => <button key={s} disabled={busy} className={st === i ? 'on' : st > i ? 'dn' : ''} onClick={() => setStatus(cur, i)}>{st > i ? '✓ ' : ''}{s}</button>)}</div>
      {curRet && <button className={'mq rq2 rlink ' + curRet.status} onClick={() => { closeSel(); openReturn(curRet.id) }}><span className="mq-i"><Ic n="returns" s={20} /></span><span className="g1"><b>Return {RLBL[curRet.status].toLowerCase()}</b><small>{curRet.kind === 'replace' ? 'Replacement' : 'Refund'} · {curRet.reason} · {taka(curRet.amount)}</small></span><Ic n="chev" s={18} /></button>}
      <div className="cu"><span className="av lg">{ini(cur.address?.name)}</span><span className="g1"><b>{cur.address?.name}</b><small>{ph}</small></span><span className={'pl s' + st}>{STEPS[st]}</span></div>
      <ZoneCard o={cur} dv={dby.get(String(cur.id))} riders={riders} reload={reload} say={say} />
      {modeOf(cur) !== 'courier' && <Delivery o={cur} dv={dby.get(String(cur.id))} riders={riders} dl={dl} err={ridersErr} reload={reload} say={say} />}
      {(hby.get(String(cur.id)) || []).length > 0 && <Pickups o={cur} hs={hby.get(String(cur.id))} shops={shops} products={products} reload={reload} say={say} />}
      <div className="qa">{ph && <a className="bt g sm" href={'tel:' + ph}><Ic n="phone" s={16} />Call</a>}{ph && <a className="bt sm wa" href={wa(ph, WA[defTpl(cur)][2](cur))} target="_blank" rel="noopener noreferrer"><Ic n="chat" s={16} />WhatsApp</a>}</div>
      {ph && <div className="cd wcd"><h3>Message on WhatsApp</h3><div className="wcs">{WA.map(([l, ic, fn]) => <a key={l} className="wc" href={wa(ph, fn(cur))} target="_blank" rel="noopener noreferrer"><Ic n={ic} s={15} />{l}</a>)}</div></div>}
      {cur.payment === 'bKash' && <><h3>bKash payment</h3>
        <div className={'cd bk-a' + (cur.payment_status === 'verifying' ? ' wait' : '')}>
          {cur.payment_status === 'paid' ? <p className="ok">✓ Verified · TrxID {cur.payment_ref || cur.bkash_trx}</p>
            : cur.bkash_trx ? <><p><small>Transaction ID</small><b>{cur.bkash_trx}</b></p><p><small>Paid from</small><b>{cur.bkash_sender}</b></p><p><small>Expected amount</small><b>{taka(cur.total)}</b></p>
              <p className="mut">Check your bKash app or SMS: the TrxID, sender number and amount must all match before you verify.</p>
              <div className="acts"><button className="bt sm" disabled={busy} onClick={() => setPay(cur, true)}>✓ Verify payment</button><button className="bt d sm" disabled={busy} onClick={() => setPay(cur, false)}>Reject</button><button className="bt g sm" onClick={() => copy(cur.bkash_trx, 'TrxID')}>Copy TrxID</button></div></>
            : <><p className="wn">Customer has not submitted a Transaction ID yet.</p>{ph && <a className="bt g sm" href={wa(ph, WA[1][2](cur))} target="_blank" rel="noopener noreferrer"><Ic n="chat" s={15} />Request payment</a>}</>}
        </div></>}
      <h3>Delivery address</h3>
      <div className="cd ad"><p>{cur.address?.address || '—'}</p>{cur.address?.note && <p className="mut">Note: {cur.address.note}</p>}<button className="bt g sm" onClick={() => copy(cur.address?.address, 'Address')}><Ic n="copy" s={15} />Copy address</button></div>
      <h3>Items</h3>
      {(cur.items || []).map((i, ix) => <div className="ln it" key={i.key || ix}><span className="th">{i.image_url ? <img src={i.image_url} alt="" loading="lazy" decoding="async" /> : i.emoji || '🛍️'}</span><span className="g1"><b>{i.name}</b><small>{i.variant ? i.variant + ' · ' : ''}{taka(i.price)} × {i.qty}</small></span><b>{taka(i.price * i.qty)}</b></div>)}
      <div className="sm2"><div><span>Subtotal</span><span>{taka(sub)}</span></div>{sub + (+cur.delivery_fee || 0) - cur.total > 0.5 && <div><span>Discount</span><span className="ok">−{taka(sub + (+cur.delivery_fee || 0) - cur.total)}</span></div>}{cur.delivery_fee != null && <div><span>Delivery{cur.delivery_km != null && ` · ${(+cur.delivery_km).toFixed(1)} km`}</span><span>{taka(cur.delivery_fee)}</span></div>}<div><span>Payment</span><span>{cur.payment} · {payLabel(cur)}</span></div><div className="tt"><span>Total</span><span>{taka(cur.total)}</span></div></div>
      <p className="mut">Placed {fmt(cur.created_at)} · {ago(cur.created_at)}</p>
    </Modal>}
    {cur && inv && <Invoice o={cur} onClose={closeInv} />}</div>
}

// Who delivers this order: Pinkish rider (≤ 4 km from the hub) or Pathao / partner courier. Live map + courier booking.
function ZoneCard({ o, dv, riders, reload, say }) {
  const mode = modeOf(o), km = orderKm(o), ad = o.address || {}, st = o.status || 0, home = okLL(ad.lat, ad.lng)
  const r = dv?.rider_id && ['accepted', 'out'].includes(dv.status) ? riders.find(x => x.user_id === dv.rider_id) : null
  const live = r && okLL(r.last_lat, r.last_lng) && fresh(r.last_seen) ? r : null
  const [f, setF] = useState({}), [busy, setBusy] = useState(false)
  useEffect(() => { setF({ name: o.courier_name || 'Pathao', id: o.courier_tracking || '', url: '' }) }, [o.id, o.courier_name, o.courier_tracking])
  const tpl = COURIERS.find(c => c.k === f.name) || COURIERS[COURIERS.length - 1], cod = o.payment_status === 'paid' ? 0 : +o.total || 0
  const markers = useMemo(() => [{ id: 'hub', kind: 'hub', lat: HUB.lat, lng: HUB.lng, label: 'Pinkish hub · ' + HUB.name }, home && { id: 'home', kind: 'home', lat: ad.lat, lng: ad.lng, label: ad.name || 'Customer' }, live && { id: 'rider', kind: 'rider', lat: live.last_lat, lng: live.last_lng, label: live.name + ' · ' + seenAgo(live.last_seen) }].filter(Boolean), [home, ad.lat, ad.lng, ad.name, live?.last_lat, live?.last_lng, live?.last_seen, live?.name]) // eslint-disable-line react-hooks/exhaustive-deps
  const setMode = async to => {
    if (to === mode) return
    const active = dv?.rider_id && ['assigned', 'accepted', 'out'].includes(dv.status)
    if (to === 'courier' && !confirm(active ? 'A rider is on this order. Remove the rider and send it by courier instead?' : 'Send this order by Pathao / partner courier instead of a Pinkish rider?')) return
    setBusy(true)
    if (to === 'courier' && active) { const { error } = await sb.rpc('admin_assign_rider', { p_order: o.id, p_rider: null }); if (error) { setBusy(false); return say(error.message) } }
    const { error } = await sb.from('orders').update({ delivery_mode: to }).eq('id', o.id)
    setBusy(false); if (error) return say(/delivery_mode/i.test(error.message) ? 'Run supabase-delivery-zones.sql first' : error.message)
    say(to === 'courier' ? 'Order moved to courier delivery' : 'Order moved to Pinkish riders'); reload()
  }
  const book = async () => {
    const id = String(f.id || '').trim().slice(0, 40)
    if (id.length < 3) return say('Enter the tracking / consignment ID from the courier')
    const url = f.url.trim() ? safeUrl(f.url.trim()) : trackUrl(tpl.url, id, ad.phone)
    if (f.url.trim() && !url) return say('The tracking link must start with https://')
    setBusy(true)
    const { error } = await sb.from('orders').update({ courier_name: f.name === 'Other' ? (f.other || 'Courier').trim().slice(0, 30) : f.name, courier_tracking: id, courier_url: url || null, courier_booked_at: new Date().toISOString() }).eq('id', o.id)
    setBusy(false); if (error) return say(/courier_/i.test(error.message) ? 'Run supabase-delivery-zones.sql first' : error.message)
    say('Courier booked · the customer got the tracking ID'); reload()
  }
  const brief = `${ad.name || 'Customer'}\n${ad.phone || ''}\n${ad.address || ''}${ad.note ? '\nNote: ' + ad.note : ''}\nOrder #${o.order_no} · ${(o.items || []).reduce((a, i) => a + (+i.qty || 1), 0)} item(s)\nCollect (COD): ${cod ? taka(cod) : '0 (paid online)'}`
  return <><h3>Delivery zone</h3><div className={'cd zn ' + mode}>
    <div className="zn-h"><span className="mq-i"><Ic n={mode === 'courier' ? 'pkg' : 'riders'} s={20} /></span><span className="g1"><b>{mode === 'courier' ? 'Pathao / partner courier' : 'Pinkish rider'}</b><small>{km == null ? 'Customer did not pin a location · check the address' : `${kmTxt(km)} from ${HUB.name} · ${km <= RIDER_KM ? 'inside' : 'outside'} the ${RIDER_KM} km rider zone`}</small></span>
      {st < 3 && st !== 4 && <button className="bt g sm" disabled={busy} onClick={() => setMode(mode === 'courier' ? 'pinkish' : 'courier')}>{mode === 'courier' ? 'Use a rider' : 'Send by courier'}</button>}</div>
    {(home || live) && <LiveMap markers={markers} zone follow={live ? 'rider' : undefined} height={220} chip={live ? { text: `${live.name.split(' ')[0]} · ${seenAgo(live.last_seen)}`, old: !fresh(live.last_seen, 2) } : null} />}
    {mode === 'courier' && <div className="zn-c">{o.courier_tracking && <p className="ok">✓ Booked with {o.courier_name} · <b>{o.courier_tracking}</b>{o.courier_booked_at ? ' · ' + ago(o.courier_booked_at) : ''}{safeUrl(o.courier_url) && <> · <a href={safeUrl(o.courier_url)} target="_blank" rel="noopener noreferrer">Track</a></>}</p>}
      {st < 3 && st !== 4 && <>
        <div className="seg zn-p" role="group" aria-label="Courier">{COURIERS.map(c => <button key={c.k} type="button" className={f.name === c.k ? 'on' : ''} aria-pressed={f.name === c.k} onClick={() => setF(x => ({ ...x, name: c.k }))}>{c.k}</button>)}</div>
        <div className="pk-r">{f.name === 'Other' && <input className="in" placeholder="Courier name" maxLength={30} value={f.other || ''} onChange={e => setF(x => ({ ...x, other: e.target.value }))} />}<input className="in" placeholder="Tracking / consignment ID" maxLength={40} value={f.id || ''} onChange={e => setF(x => ({ ...x, id: e.target.value }))} /><button className="bt sm" disabled={busy} onClick={book}>{o.courier_tracking ? 'Update' : 'Save booking'}</button></div>
        {(f.name === 'Other' || !tpl.url) && <input className="in" type="url" placeholder="Tracking link (https://…, optional)" value={f.url || ''} onChange={e => setF(x => ({ ...x, url: e.target.value }))} />}
        <div className="acts"><button className="bt g sm" onClick={() => navigator.clipboard?.writeText(brief).then(() => say('Parcel details copied'), () => say('Could not copy'))}><Ic n="copy" s={15} />Copy parcel details</button>{tpl.panel && <a className="bt g sm" href={tpl.panel} target="_blank" rel="noopener noreferrer">Open {tpl.k} panel</a>}</div>
        <p className="mut">Book the parcel in the courier's merchant panel (COD {cod ? taka(cod) : '৳0, paid online'}), then save the tracking ID here. The customer is notified and can track it in the app.</p></>}</div>}
  </div></>
}

// Live map of every online rider and every active Pinkish delivery (updates as riders move)
function Fleet({ riders, dl, orders }) {
  const om = useMemo(() => new Map(orders.map(o => [String(o.id), o])), [orders])
  const act = useMemo(() => dl.filter(x => ACTIVE.includes(x.status)), [dl])
  const on = riders.filter(r => r.status === 'approved' && r.on_duty && okLL(r.last_lat, r.last_lng) && fresh(r.last_seen))
  const markers = useMemo(() => [
    { id: 'hub', kind: 'hub', lat: HUB.lat, lng: HUB.lng, label: 'Pinkish hub · ' + HUB.name },
    ...on.map(r => ({ id: 'r' + r.user_id, kind: 'rider', lat: r.last_lat, lng: r.last_lng, off: !fresh(r.last_seen, 3), label: `${r.name} · ${act.filter(x => x.rider_id === r.user_id).length} job(s) · ${seenAgo(r.last_seen)}` })),
    ...act.map((x, i) => { const o = om.get(String(x.order_id)), a = o?.address; return a && okLL(a.lat, a.lng) ? { id: 'd' + x.id, kind: 'dest', text: String(i + 1), lat: a.lat, lng: a.lng, label: `#${o.order_no} · ${DLV[x.status][0]}` } : null }).filter(Boolean),
  ], [on, act, om]) // eslint-disable-line react-hooks/exhaustive-deps
  return <section className="cd fleet"><div className="rh"><h2>Live map</h2><small className="mut">{on.length} rider{on.length === 1 ? '' : 's'} sharing location · {act.length} active deliver{act.length === 1 ? 'y' : 'ies'} · dashed circle = {RIDER_KM} km rider zone</small></div>
    <LiveMap markers={markers} zone height={340} /></section>
}

// Seller pickups for one order: assign a rider, give them the code, track the handover.
function Pickups({ o, hs, shops, products, reload, say }) {
  const sm = useMemo(() => new Map(shops.map(s => [s.id, s])), [shops]), pm = useMemo(() => new Map(products.map(p => [String(p.id), p.shop_id])), [products])
  const [rd, setRd] = useState({}), [busy, setBusy] = useState(''), [riders, setRiders] = useState(readRiders)
  const upd = async (h, patch, ok) => {
    setBusy(h.id)
    const { data, error } = await sb.from('seller_handovers').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', h.id).select()
    setBusy('')
    if (error) return say(error.message); if (!data?.length) return say('Not saved. Run supabase-seller-ops.sql and check admin access.')
    say(ok); reload()
  }
  const assign = h => {
    const r = rd[h.id] || {}, name = (r.name ?? h.rider_name ?? '').trim(), phone = (r.phone ?? h.rider_phone ?? '').replace(/[^\d+]/g, '')
    if (name.length < 2) return say('Enter the rider name')
    const next = [{ name, phone }, ...riders.filter(x => x.name !== name)].slice(0, 12); setRiders(next); try { localStorage.setItem('adm-riders', JSON.stringify(next)) } catch { /* storage unavailable */ }
    upd(h, { rider_name: name, rider_phone: phone || null }, 'Rider assigned · seller notified')
  }
  const brief = (h, s, its) => `Pinkish pickup · order #${o.order_no}\nFrom: ${s?.name || 'Seller'}\n${s?.address || ''}${s?.city ? ', ' + s.city : ''}\nSeller phone: ${s?.phone || '—'}\nItems: ${its.map(i => i.name + ' ×' + i.qty).join(', ')}\nPICKUP CODE: ${h.pickup_code}\nTell the seller this code. They enter it before handing over the parcel.`
  return <><h3>Seller pickups</h3><div className="pks">{hs.map(h => {
    const s = sm.get(h.shop_id), its = (o.items || []).filter(i => (i.shop_id || pm.get(String(i.id))) === h.shop_id), [lb, cls] = HO[h.status] || HO.new, r = rd[h.id] || {}, open = h.status === 'new' || h.status === 'packed'
    const msg = brief(h, s, its), phone = (h.rider_phone || '').replace(/\D/g, '')
    return <div className={'cd pk-c ' + h.status} key={h.id}>
      <div className="pk-h"><span className="sc-av">{s?.logo_url ? <img src={s.logo_url} alt="" loading="lazy" /> : ini(s?.name)}</span><span className="g1"><b>{s?.name || 'Seller'}</b><small>{[s?.address, s?.city].filter(Boolean).join(', ') || 'No address'}</small></span><span className={'pl ' + cls}>{lb}</span></div>
      <div className="pk-its">{its.length ? its.map((i, k) => <span key={k}>{i.name}{i.variant && i.variant !== 'Standard' ? ' (' + i.variant + ')' : ''} ×{i.qty}</span>) : <span>Items from this seller</span>}</div>
      <div className="pk-meta">{h.packed_at && <span>Packed {ago(h.packed_at)}</span>}{h.picked_at && <span className="ok">Handed over {ago(h.picked_at)}</span>}{h.attempts > 0 && h.status !== 'picked' && <span className="er">{h.attempts} wrong code{h.attempts === 1 ? '' : 's'}{h.attempts >= 5 ? ' · locked' : ''}</span>}</div>
      {open && <div className="pk-code"><span><small>Pickup code (give it to the rider only)</small><b>{h.pickup_code}</b></span><button className="ib3" aria-label="Copy pickup brief" onClick={() => navigator.clipboard?.writeText(msg).then(() => say('Pickup brief copied'), () => say('Could not copy'))}><Ic n="copy" s={17} /></button>{phone && <a className="ib3 wa" href={wa(phone, msg)} target="_blank" rel="noopener noreferrer" aria-label="Send brief to rider"><Ic n="chat" s={17} /></a>}</div>}
      {open && <div className="pk-r"><input className="in" list="adm-riders" placeholder="Rider name" value={r.name ?? h.rider_name ?? ''} onChange={e => { const v = e.target.value, k = riders.find(x => x.name === v); setRd(x => ({ ...x, [h.id]: { ...r, name: v, ...(k ? { phone: k.phone } : {}) } })) }} /><input className="in" type="tel" inputMode="tel" placeholder="Rider phone" value={r.phone ?? h.rider_phone ?? ''} onChange={e => setRd(x => ({ ...x, [h.id]: { ...r, phone: e.target.value } }))} /><button className="bt sm" disabled={busy === h.id} onClick={() => assign(h)}>{h.rider_name ? 'Update rider' : 'Assign rider'}</button></div>}
      <div className="acts">{open && <button className="bt g sm" disabled={busy === h.id} onClick={() => upd(h, { status: 'picked', picked_at: new Date().toISOString() }, 'Marked as collected')}><Ic n="check" s={15} />Mark collected</button>}
        {h.attempts >= 5 && open && <button className="bt g sm" disabled={busy === h.id} onClick={() => upd(h, { attempts: 0 }, 'Code unlocked')}>Unlock code</button>}
        {h.status === 'picked' && (o.status || 0) < 2 && <button className="bt g sm" disabled={busy === h.id} onClick={() => upd(h, { status: 'packed', picked_at: null }, 'Pickup reopened')}>Reopen pickup</button>}
        {s?.phone && <a className="bt g sm" href={'tel:' + s.phone}><Ic n="phone" s={15} />Call seller</a>}</div>
    </div>
  })}</div><datalist id="adm-riders">{riders.map(x => <option key={x.name} value={x.name}>{x.phone}</option>)}</datalist></>
}

function Wish({ d: { wish, products, wishErr, orders } }) {
  const pm = useMemo(() => Object.fromEntries(products.map(p => [String(p.id), p])), [products])
  const rows = useMemo(() => {
    const m = {}
    wish.forEach(w => { const r = m[w.product_id] || (m[w.product_id] = { id: w.product_id, name: w.product_name, n: 0, who: new Set(), last: w.created_at }); r.n++; r.who.add(w.user_label || 'Guest'); if (w.created_at > r.last) r.last = w.created_at })
    return Object.values(m).sort((a, b) => b.n - a.n)
  }, [wish])
  const ordered = useMemo(() => { const s = new Set(); orders.forEach(o => (o.items || []).forEach(i => s.add(String(i.id)))); return s }, [orders])
  const people = new Set(wish.map(w => w.device_id)).size, top = rows[0]?.n || 1
  if (wishErr) return <div className="cd"><h2>Wishlist tracking isn't set up yet</h2><p className="mut">Run the SQL in <b>supabase-setup.sql</b> in the Supabase SQL editor, then press Refresh. Customers' wishlists will then show up here.</p></div>
  const nm = r => pm[r.id]?.name || r.name || 'Product ' + r.id
  return <div className="pg"><div className="kp"><div className="cd"><small>Total saves</small><b><Count to={wish.length} /></b></div><div className="cd"><small>Products wished</small><b><Count to={rows.length} /></b></div><div className="cd"><small>Customers</small><b><Count to={people} /></b></div><div className="cd"><small>Wished, never ordered</small><b><Count to={rows.filter(r => !ordered.has(String(r.id))).length} /></b></div></div>
    <div className="two"><section className="cd lst"><div className="rh pad"><h2>Most wished products</h2></div>{rows.map(r => { const p = pm[r.id]; return <div className="rw" key={r.id}><span className="th">{p?.image_url ? <img src={p.image_url} alt="" loading="lazy" /> : p?.emoji || '♡'}</span><span className="g1"><b>{nm(r)}</b><small>{[...r.who].slice(0, 3).join(', ')}{r.who.size > 3 ? ` +${r.who.size - 3}` : ''}</small><i className="bar"><i style={{ width: r.n / top * 100 + '%' }} /></i></span><span className="pl">♥ {r.n}</span>{!ordered.has(String(r.id)) && <span className="pl s1 dm">Not ordered</span>}</div> })}{!rows.length && <p className="mut pad">Nothing wishlisted yet. When customers tap ♡ in the store it shows here.</p>}</section>
      <section className="cd"><h2>Recent activity</h2>{wish.slice(0, 20).map(w => <div className="ln" key={w.id}><span><b>{w.user_label || 'Guest'}</b> saved <b>{pm[w.product_id]?.name || w.product_name || 'a product'}</b></span><small>{ago(w.created_at)}</small></div>)}{!wish.length && <p className="mut">No activity yet.</p>}</section></div></div>
}

// ---------------- Returns & refunds ----------------
const RLBL = { requested: 'Requested', approved: 'Approved', received: 'Received', completed: 'Completed', rejected: 'Rejected' }
const RCLS = { requested: 's0', approved: 's2', received: 's1', completed: 's3', rejected: '' }
const RPL = { requested: '', approved: 's2', received: 's1', completed: 's3', rejected: 'bad' }
const RTABS = [['requested', 'Requested', 'inbox', 0], ['approved', 'Approved', 'truck', 2], ['received', 'Received', 'clock', 1], ['completed', 'Completed', 'check', 3]]
const RREJ = ['Outside the return window', 'Item was used or opened', 'Photos do not show a problem', 'Not eligible for return']
const doneLbl = r => r.kind === 'replace' ? 'Replaced' : 'Refunded'

const ReturnCard = memo(function ReturnCard({ r, o, onOpen }) {
  const n = (r.items || []).reduce((a, i) => a + (+i.qty || 1), 0), name = o?.address?.name || 'Customer'
  return <article className={'oc rc ' + RCLS[r.status]}>
    <button className="ob-main" onClick={() => onOpen(r.id)}>
      <span className="av">{ini(name)}</span>
      <span className="g1"><b>{name} {r.status === 'requested' && <i className="nw">NEW</i>}</b><small>#{r.order_no} · {ago(r.created_at)}</small></span>
      <span className="rt"><b>{taka(r.refund_amount ?? r.amount)}</b><span className={'pl ' + RPL[r.status]}>{r.status === 'completed' ? doneLbl(r) : RLBL[r.status]}</span></span>
      <span className="its">{(r.items || []).map(i => `${i.name}${i.qty > 1 ? ' ×' + i.qty : ''}`).join(', ')}</span>
      <span className="pm"><span>{r.kind === 'replace' ? '↻ Replacement' : '৳ Refund'}</span><span>{n} item{n === 1 ? '' : 's'}</span><span>{r.reason}</span>{r.seller_response === 'agree' && <span className="pd">Seller agrees</span>}{r.seller_response === 'dispute' && <span className="vf">Seller disputes</span>}</span>
    </button>
  </article>
})

function Returns({ d: { returns = [], orders, retErr }, reload, say, focus, clearFocus, openOrder }) {
  const [f, setF] = useState(() => returns.some(r => r.status === 'requested') ? 'requested' : ''), [q, setQ] = useState(''), [sel, setSel] = useState(null), [busy, setBusy] = useState(false), [note, setNote] = useState(''), [amt, setAmt] = useState(''), [rej, setRej] = useState(false), bz = useRef(false)
  const dq = useDeferredValue(q)
  const om = useMemo(() => new Map(orders.map(o => [String(o.id), o])), [orders])
  useEffect(() => { if (focus) { setF(''); setSel(focus); clearFocus() } }, [focus, clearFocus])
  const cur = sel && returns.find(r => r.id === sel), co = cur ? om.get(cur.order_id) : null
  useEffect(() => { setNote(''); setRej(false); setAmt(cur ? String(cur.refund_amount ?? cur.amount ?? '') : '') }, [sel]) // eslint-disable-line react-hooks/exhaustive-deps
  const cnt = useMemo(() => { const c = { requested: 0, approved: 0, received: 0, completed: 0, rejected: 0 }; returns.forEach(r => { if (r.status in c) c[r.status]++ }); return c }, [returns])
  const list = useMemo(() => {
    const k = dq.trim().toLowerCase()
    return returns.filter(r => (!f || r.status === f) && (!k || `${r.order_no} ${r.reason} ${om.get(r.order_id)?.address?.name || ''} ${om.get(r.order_id)?.address?.phone || ''} ${(r.items || []).map(i => i.name).join(' ')}`.toLowerCase().includes(k)))
      .sort((a, b) => (b.status === 'requested') - (a.status === 'requested') || new Date(b.created_at) - new Date(a.created_at))
  }, [returns, f, dq, om])
  const act = async status => {
    if (bz.current || !cur) return
    if (status === 'rejected' && note.trim().length < 3) return say('Tell the customer why')
    const refund = cur.kind === 'refund' && status === 'completed' ? +amt : null
    if (refund != null && !(refund >= 0 && refund <= Math.max(+cur.amount || 0, 0) * 2 + 1)) return say('Enter a valid refund amount')
    bz.current = true; setBusy(true)
    const { error } = await sb.rpc('admin_set_return', { p_id: cur.id, p_status: status, p_note: note.trim() || null, p_refund: refund })
    bz.current = false; setBusy(false)
    if (error) return say(error.message)
    say(`#${cur.order_no} → ${status === 'completed' ? doneLbl(cur) : RLBL[status]} · customer notified`); setNote(''); setRej(false); reload()
  }
  if (retErr) return <div className="cd"><h2>Returns are not set up yet</h2><p className="mut">Run <b>supabase-returns-contact.sql</b> in the Supabase SQL editor, then press Refresh.</p></div>
  const ph = co?.address?.phone, first = (co?.address?.name || 'there').trim().split(/\s+/)[0]
  const waTxt = cur ? `Hi ${first}, this is Pinkish about your return for order #${cur.order_no}. ` + (cur.status === 'approved' ? 'Our rider will collect the item(s). When is a good time?' : cur.status === 'completed' && cur.kind === 'refund' ? `We have sent ${taka(cur.refund_amount ?? cur.amount)}${cur.refund_to ? ' to ' + cur.refund_to : ''}.` : '') : ''
  const step = cur ? Math.max(0, ['requested', 'approved', 'received', 'completed'].indexOf(cur.status)) : 0
  const foot = !cur ? null : rej ? null
    : cur.status === 'requested' ? <><button className="bt" disabled={busy} onClick={() => act('approved')}>✓ Approve return</button><button className="bt g" disabled={busy} onClick={() => setRej(true)}>Reject</button></>
    : cur.status === 'approved' ? <><button className="bt" disabled={busy} onClick={() => act('received')}>Mark item received</button><button className="bt g" disabled={busy} onClick={() => act('completed')}>{cur.kind === 'replace' ? 'Replace without pick-up' : 'Refund without pick-up'}</button></>
    : cur.status === 'received' ? <><button className="bt" disabled={busy} onClick={() => act('completed')}>{cur.kind === 'replace' ? '✓ Mark replaced' : `✓ Mark refunded${+amt >= 0 && amt !== '' ? ' · ' + taka(+amt) : ''}`}</button><button className="bt g" disabled={busy} onClick={() => setRej(true)}>Reject</button></>
    : null
  return <div className="pg">
    <div className="ob">{RTABS.map(([k, l, ic, s]) => <button key={k} className={'s' + s + (f === k ? ' on' : '')} aria-pressed={f === k} onClick={() => setF(f === k ? '' : k)}><span className="oi"><Ic n={ic} s={16} /></span><small>{l}</small><b><Count to={cnt[k]} /></b></button>)}</div>
    <div className="tl"><label className="sr"><Ic n="search" s={18} /><input className="in" type="search" inputMode="search" enterKeyHint="search" placeholder="Search order, customer, item, reason" aria-label="Search returns" value={q} onChange={e => setQ(e.target.value)} /></label>
      {cnt.rejected > 0 && <button className={'vchip' + (f === 'rejected' ? ' on' : '')} aria-pressed={f === 'rejected'} onClick={() => setF(f === 'rejected' ? '' : 'rejected')}><Ic n="ban" s={15} />Rejected<em>{cnt.rejected}</em></button>}</div>
    <p className="sum"><b>{list.length}</b> return{list.length === 1 ? '' : 's'} · <b>{taka(list.reduce((a, r) => a + (+(r.refund_amount ?? r.amount) || 0), 0))}</b>{f && <> · <button className="lk" onClick={() => setF('')}>Show all ({returns.length})</button></>}</p>
    <div className="ol">{list.map(r => <ReturnCard key={r.id} r={r} o={om.get(r.order_id)} onOpen={setSel} />)}{!list.length && <p className="mut pad cd">{returns.length ? 'No returns match.' : 'No return requests yet. Customers can ask for a return on delivered orders, within 14 days.'}</p>}</div>
    {cur && <Modal cls="pm" title={'Return · #' + cur.order_no} onClose={() => setSel(null)} footer={foot}>
      <div className="steps rsteps">{(cur.status === 'rejected' ? ['Rejected'] : ['Requested', 'Approved', 'Received', doneLbl(cur)]).map((l, i) => <button key={l} disabled className={cur.status === 'rejected' ? 'on' : step === i ? 'on' : step > i ? 'dn' : ''}>{cur.status !== 'rejected' && step > i ? '✓ ' : ''}{l}</button>)}</div>
      {rej && <div className="rsn"><b>Why are you rejecting this return?</b><textarea className="in" rows="3" autoFocus placeholder="The customer sees this in their notifications" value={note} onChange={e => setNote(e.target.value)} />
        <div className="rq">{RREJ.map(x => <button key={x} type="button" onClick={() => setNote(x)}>{x}</button>)}</div>
        <div className="acts"><button className="bt d sm" disabled={busy} onClick={() => act('rejected')}>Confirm rejection</button><button className="bt g sm" onClick={() => setRej(false)}>Cancel</button></div></div>}
      <div className="cu"><span className="av lg">{ini(co?.address?.name)}</span><span className="g1"><b>{co?.address?.name || 'Customer'}</b><small>{ph || 'Order not in the recent list'}</small></span><span className={'pl ' + RPL[cur.status]}>{cur.status === 'completed' ? doneLbl(cur) : RLBL[cur.status]}</span></div>
      <div className="qa">{ph && <a className="bt g sm" href={'tel:' + ph}><Ic n="phone" s={16} />Call</a>}{ph && <a className="bt sm wa" href={wa(ph, waTxt)} target="_blank" rel="noopener noreferrer"><Ic n="chat" s={16} />WhatsApp</a>}{co && <button className="bt g sm" onClick={() => { setSel(null); openOrder(co.id) }}><Ic n="receipt" s={16} />Open order</button>}</div>
      <h3>What happened</h3>
      <div className="cd sd-info"><div><span>Request</span><b>{cur.kind === 'replace' ? 'Replacement' : 'Refund'}</b></div><div><span>Reason</span><b>{cur.reason}</b></div>{cur.details && <div><span>Details</span><b>{cur.details}</b></div>}{cur.kind === 'refund' && <div><span>Refund to</span><b>{cur.refund_to || 'Not given'}</b></div>}<div><span>Order payment</span><b>{co ? `${co.payment || '—'} · ${payLabel(co)}` : '—'}</b></div><div><span>Requested</span><b>{fmt(cur.created_at)}</b></div>{cur.updated_at && cur.updated_at !== cur.created_at && <div><span>Last update</span><b>{fmt(cur.updated_at)}</b></div>}</div>
      <h3>Items to return</h3>
      {(cur.items || []).map((i, ix) => <div className="ln it" key={ix}><span className="th">{i.image_url ? <img src={i.image_url} alt="" loading="lazy" decoding="async" /> : '🛍️'}</span><span className="g1"><b>{i.name}</b><small>{i.variant ? i.variant + ' · ' : ''}{taka(i.price)} × {i.qty}{i.shop_id ? '' : ' · Pinkish'}</small></span><b>{taka(i.price * i.qty)}</b></div>)}
      {cur.seller_response && <div className={'cd sd-note rs-' + cur.seller_response}><small>{cur.seller_response === 'agree' ? 'Seller agrees with this return' : 'Seller disputes this return'}</small>{cur.seller_note && <p>{cur.seller_note}</p>}</div>}
      {!cur.seller_response && (cur.items || []).some(i => i.shop_id) && cur.status === 'requested' && <p className="mut">Waiting for the seller to agree or dispute. You can decide without them.</p>}
      {cur.admin_note && <div className="cd"><small>Note sent to the customer</small><p>{cur.admin_note}</p></div>}
      {!rej && cur.status !== 'completed' && cur.status !== 'rejected' && <>
        {cur.kind === 'refund' && <F l={`Refund amount (৳) · items worth ${taka(cur.amount)}`}><span className="pf"><i>৳</i><input className="in" type="number" min="0" inputMode="decimal" value={amt} onChange={e => setAmt(e.target.value)} /></span></F>}
        <F l="Note to the customer (optional)"><textarea className="in" rows="2" maxLength={600} placeholder="e.g. Our rider will come tomorrow between 2 and 5 pm" value={note} onChange={e => setNote(e.target.value)} /></F></>}
      {cur.status === 'completed' && cur.kind === 'refund' && <p className="ok">✓ {taka(cur.refund_amount ?? cur.amount)} refunded{cur.refund_to ? ' to ' + cur.refund_to : ''}</p>}
    </Modal>}
  </div>
}

// ---------------- Merchants (marketplace sellers) ----------------
const SHOP_TABS = [['pending', 'Pending', 'clock', 1], ['approved', 'Verified', 'shield', 3], ['rejected', 'Rejected', 'alert', 0], ['suspended', 'Suspended', 'ban', 2]]
const SHOP_LBL = { pending: 'Pending review', approved: 'Verified', rejected: 'Rejected', suspended: 'Suspended' }
const SHOP_PL = { pending: 's1', approved: 's3', rejected: '', suspended: 'bad' }
const REASONS = ['ID photo is blurry', 'Name does not match ID', 'Invalid phone number', 'Address is incomplete']

const ShopCard = memo(function ShopCard({ s, n, onOpen, onVerify }) {
  return <article className={'sc ' + s.status}>
    <button className="sc-main" onClick={() => onOpen(s.id)}>
      <span className="sc-av">{s.logo_url ? <img src={s.logo_url} alt="" loading="lazy" decoding="async" /> : ini(s.name)}</span>
      <span className="sc-t"><b>{s.name}</b><small>{[s.city, s.phone].filter(Boolean).join(' · ') || '—'}</small></span>
      <span className={'pl ' + SHOP_PL[s.status]}>{SHOP_LBL[s.status]}</span>
      <span className="sc-meta"><span>{n.p} product{n.p === 1 ? '' : 's'}</span><span>{n.sold} sold</span>{n.pend > 0 && <span className="hv">📦 {n.pend} to collect</span>}{n.timed > 0 && <span>{Math.round(n.onTime / n.timed * 100)}% packed on time</span>}<span>Applied {ago(s.created_at)}</span></span>
    </button>
    {s.status === 'pending' && <div className="sc-act"><small>Check the ID, then verify</small><button className="bt sm" onClick={() => onVerify(s)}>✓ Verify</button></div>}
  </article>
})

// Seller rules: how parcels reach Pinkish, packing time, commission and a notice shown in every Seller Centre.
function SellerOps({ ops, say, reload, hoErr }) {
  const [f, setF] = useState(() => ({ ...OPS0, ...ops })), [busy, setBusy] = useState(false), [open, setOpen] = useState(false)
  useEffect(() => { setF({ ...OPS0, ...ops }) }, [ops])
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }))
  const dirty = JSON.stringify({ ...OPS0, ...ops }) !== JSON.stringify(f)
  const save = async () => {
    const v = { mode: f.mode === 'dropoff' ? 'dropoff' : 'pickup', hub_address: String(f.hub_address || '').trim().slice(0, 200), hours: String(f.hours || '').trim().slice(0, 80), pack_hours: Math.min(168, Math.max(1, Math.round(+f.pack_hours || 24))), commission: Math.min(60, Math.max(0, +f.commission || 0)), notice: String(f.notice || '').trim().slice(0, 400) }
    if (v.mode === 'dropoff' && v.hub_address.length < 6) return say('Enter the hub address for drop-off')
    setBusy(true)
    const { error } = await sb.from('site_settings').upsert({ key: 'seller_ops', value: v, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    setBusy(false); if (error) return say(error.message)
    say('Seller rules saved. Sellers see them now.'); reload()
  }
  return <section className="cd sop"><button className="sop-h" aria-expanded={open} onClick={() => setOpen(v => !v)}><span className="mq-i"><Ic n="gear" s={20} /></span><span className="g1"><b>Seller rules</b><small>{ops.mode === 'dropoff' ? 'Sellers drop off at the hub' : 'Riders collect from sellers'} · pack within {ops.pack_hours || 24}h · {+ops.commission || 0}% commission</small></span><Ic n="chev" s={18} /></button>
    {open && <div className="sop-b">
      {hoErr && <p className="wn">Pickups are not set up yet. Run <b>supabase-seller-ops.sql</b> in the Supabase SQL editor.</p>}
      <div className="fg"><F l="How parcels reach Pinkish"><select className="in" value={f.mode} onChange={set('mode')}><option value="pickup">A Pinkish rider collects from the seller</option><option value="dropoff">Seller drops off at the Pinkish hub</option></select></F>
        <F l="Pickup / hub hours"><input className="in" maxLength={80} value={f.hours} onChange={set('hours')} placeholder="Sat–Thu, 10am–6pm" /></F></div>
      <F l={f.mode === 'dropoff' ? 'Hub address (sellers see this) *' : 'Hub address (optional)'}><input className="in" maxLength={200} value={f.hub_address} onChange={set('hub_address')} placeholder="e.g. Pinkish Hub, House 12, Road 3, Nasirabad, Chattogram" /></F>
      <div className="fg"><F l="Sellers must pack within (hours)"><input className="in" type="number" min="1" max="168" inputMode="numeric" value={f.pack_hours} onChange={set('pack_hours')} /></F>
        <F l="Pinkish commission (%)"><span className="pf"><i>%</i><input className="in" type="number" min="0" max="60" step="0.5" inputMode="decimal" value={f.commission} onChange={set('commission')} /></span></F></div>
      <F l={`Notice to all sellers (optional) · ${String(f.notice || '').length}/400`}><textarea className="in" rows="2" maxLength={400} value={f.notice} onChange={set('notice')} placeholder="e.g. Eid rush: pack orders within 12 hours this week." /></F>
      <p className="mut">Sellers can only hand parcels to a Pinkish rider who tells them the pickup code. Customer details are never shown to sellers, and phone numbers or links are blocked in their shop, products and answers.</p>
      <div className="acts"><button className="bt" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save seller rules'}</button>{dirty && <button className="bt g" onClick={() => setF({ ...OPS0, ...ops })}>Undo changes</button>}</div>
    </div>}
  </section>
}

function Shops({ d: { shops = [], products, orders, shopsErr, ho = [], hoErr, ops = OPS0 }, reload, say }) {
  const [f, setF] = useState(() => shops.some(s => s.status === 'pending') ? 'pending' : ''), [q, setQ] = useState(''), [sel, setSel] = useState(null), [busy, setBusy] = useState(false), [rej, setRej] = useState(null), [doc, setDoc] = useState(null), bz = useRef(false)
  const dq = useDeferredValue(q)
  useEffect(() => { setRej(null); setDoc(null) }, [sel])
  const stat = useMemo(() => {
    const m = {}, pm = new Map()
    shops.forEach(s => { m[s.id] = { p: 0, live: 0, sold: 0, rev: 0, pend: 0, timed: 0, onTime: 0 } })
    const ph = (+ops.pack_hours || 24) * 36e5
    ho.forEach(h => { const e = m[h.shop_id]; if (!e) return; if (h.status === 'new' || h.status === 'packed') e.pend++; const t = h.packed_at || h.picked_at; if (t) { e.timed++; if (new Date(t) - new Date(h.created_at) <= ph) e.onTime++ } })
    products.forEach(p => { if (p.shop_id && m[p.shop_id]) { m[p.shop_id].p++; if (p.is_active !== false) m[p.shop_id].live++; pm.set(String(p.id), p.shop_id) } })
    orders.forEach(o => (o.items || []).forEach(i => { const e = m[pm.get(String(i.id))]; if (e) { e.sold += +i.qty || 0; e.rev += (+i.price || 0) * (+i.qty || 0) } }))
    return m
  }, [shops, products, orders, ho, ops.pack_hours])
  const cnt = useMemo(() => { const c = { pending: 0, approved: 0, rejected: 0, suspended: 0 }; shops.forEach(s => { if (s.status in c) c[s.status]++ }); return c }, [shops])
  const list = useMemo(() => { const k = dq.trim().toLowerCase(); return shops.filter(s => (!f || s.status === f) && (!k || `${s.name} ${s.phone} ${s.city || ''} ${s.address || ''}`.toLowerCase().includes(k))).sort((a, b) => (b.status === 'pending') - (a.status === 'pending') || new Date(b.created_at) - new Date(a.created_at)) }, [shops, f, dq])
  const setStatus = useCallback(async (s, status, reason) => {
    if (bz.current) return
    bz.current = true; setBusy(true)
    const patch = status === 'rejected' ? { status, reject_reason: reason } : { status }
    const { data, error } = await sb.from('shops').update(patch).eq('id', s.id).select()
    bz.current = false; setBusy(false)
    if (error) return say(error.message)
    if (!data?.length) return say('Not saved. Run supabasesellers.sql first and make sure this account is an admin.')
    say(`${s.name} → ${SHOP_LBL[status]}`); setRej(null); reload()
  }, [reload, say])
  const verify = useCallback(s => setStatus(s, 'approved'), [setStatus])
  const open = useCallback(id => setSel(id), [])
  const cur = sel && shops.find(s => s.id === sel)
  const n = cur ? stat[cur.id] || { p: 0, live: 0, sold: 0, rev: 0, pend: 0, timed: 0, onTime: 0 } : null
  const mine = useMemo(() => cur ? products.filter(p => p.shop_id === cur.id).slice(0, 5) : [], [cur, products])
  const showDoc = async () => {
    setDoc({ busy: true })
    const { data, error } = await sb.storage.from('seller-docs').createSignedUrl(cur.id_doc_path, 300)
    if (error || !data?.signedUrl) { setDoc(null); return say('Could not open the document') }
    setDoc({ url: data.signedUrl, pdf: /\.pdf$/i.test(cur.id_doc_path) })
  }
  const askReject = () => { setRej(''); setTimeout(() => document.querySelector('.md .mc')?.scrollTo({ top: 0, behavior: 'smooth' }), 30) }
  const doReject = () => { if (!rej.trim()) return say('Tell the merchant why, so they can fix it'); setStatus(cur, 'rejected', rej.trim()) }
  const suspend = () => { if (window.confirm(`Suspend "${cur.name}"? All of its products disappear from the store until you reinstate it.`)) setStatus(cur, 'suspended') }
  if (shopsErr) return <div className="cd"><h2>Merchants are not set up yet</h2><p className="mut">Run <b>supabasesellers.sql</b> in the Supabase SQL editor, then press Refresh.</p></div>
  const ph = cur?.phone
  const foot = !cur ? null : cur.status === 'pending' ? <><button className="bt" disabled={busy} onClick={() => verify(cur)}>✓ Verify merchant</button><button className="bt g" disabled={busy} onClick={askReject}>Reject</button></>
    : cur.status === 'approved' ? <button className="bt d" disabled={busy} onClick={suspend}><Ic n="ban" s={17} />Suspend shop</button>
    : cur.status === 'rejected' ? <><button className="bt" disabled={busy} onClick={() => verify(cur)}>✓ Verify anyway</button></>
    : <button className="bt" disabled={busy} onClick={() => verify(cur)}>Reinstate shop</button>
  return <div className="pg">
    <SellerOps ops={ops} say={say} reload={reload} hoErr={hoErr} />
    <div className="ob">{SHOP_TABS.map(([k, l, ic, s]) => <button key={k} className={'s' + s + (f === k ? ' on' : '')} aria-pressed={f === k} onClick={() => setF(f === k ? '' : k)}><span className="oi"><Ic n={ic} s={16} /></span><small>{l}</small><b><Count to={cnt[k]} /></b></button>)}</div>
    <div className="tl"><label className="sr"><Ic n="search" s={18} /><input className="in" type="search" inputMode="search" enterKeyHint="search" placeholder="Search shop, phone, city" aria-label="Search merchants" value={q} onChange={e => setQ(e.target.value)} /></label></div>
    <p className="sum"><b>{list.length}</b> merchant{list.length === 1 ? '' : 's'}{f && <> · <button className="lk" onClick={() => setF('')}>Show all ({shops.length})</button></>}</p>
    <div className="sl">{list.map(s => <ShopCard key={s.id} s={s} n={stat[s.id] || { p: 0, sold: 0 }} onOpen={open} onVerify={verify} />)}
      {!list.length && <p className="mut pad cd">{shops.length ? 'No merchants match.' : 'No merchants yet. When someone opens pinkish.shop/merchant and creates a shop, it appears here for verification.'}</p>}</div>
    {cur && <Modal cls="pm" title="Merchant" onClose={() => setSel(null)} footer={foot}>
      <div className="sd-h"><span className="sc-av lg">{cur.logo_url ? <img src={cur.logo_url} alt="" /> : ini(cur.name)}</span><span className="sc-t"><b>{cur.name}</b><small>{cur.city || 'No city'} · applied {ago(cur.created_at)}</small></span><span className={'pl ' + SHOP_PL[cur.status]}>{SHOP_LBL[cur.status]}</span></div>
      {rej !== null && <div className="rsn"><b>Why are you rejecting this shop?</b><textarea className="in" rows="3" autoFocus placeholder="The merchant will see this and can resubmit" value={rej} onChange={e => setRej(e.target.value)} />
        <div className="rq">{REASONS.map(r => <button key={r} type="button" onClick={() => setRej(r)}>{r}</button>)}</div>
        <div className="acts"><button className="bt d sm" disabled={busy} onClick={doReject}>Confirm rejection</button><button className="bt g sm" onClick={() => setRej(null)}>Cancel</button></div></div>}
      {cur.status === 'rejected' && cur.reject_reason && <div className="cd sd-note"><small>Rejection reason</small><p>{cur.reject_reason}</p></div>}
      {ph && <div className="qa"><a className="bt g sm" href={'tel:' + ph}><Ic n="phone" s={16} />Call</a><a className="bt sm wa" href={wa(ph, `Hi, this is Pinkish about your shop "${cur.name}".`)} target="_blank" rel="noopener noreferrer"><Ic n="chat" s={16} />WhatsApp</a></div>}
      <div className="sd-stats"><div><b>{n.p}</b><small>Products</small></div><div><b>{n.live}</b><small>Live</small></div><div><b>{n.sold}</b><small>Sold</small></div><div><b>{taka(n.rev)}</b><small>Sales</small></div></div>
      {(n.pend > 0 || n.timed > 0) && <p className="sum">Pickups: <b>{n.pend}</b> waiting{n.timed > 0 && <> · <b className={n.onTime / n.timed < 0.8 ? 'wn' : ''}>{Math.round(n.onTime / n.timed * 100)}%</b> packed within {ops.pack_hours || 24}h</>}</p>}
      <h3>Business details</h3>
      <div className="cd sd-info"><div><span>Phone</span><b>{cur.phone || '—'}</b></div><div><span>City</span><b>{cur.city || '—'}</b></div><div><span>Address</span><b>{cur.address || '—'}</b></div><div><span>NID number</span><b>{cur.nid_number || '—'}</b></div><div><span>Applied</span><b>{fmt(cur.created_at)}</b></div>{cur.verified_at && <div><span>Verified</span><b>{fmt(cur.verified_at)}</b></div>}<div><span>Shop link</span><b>{cur.slug}</b></div></div>
      {cur.description && <><h3>About</h3><div className="cd"><p>{cur.description}</p></div></>}
      <h3>Verification document</h3>
      <div className="cd sd-doc">{!cur.id_doc_path ? <p className="wn">No document was uploaded.</p> : !doc ? <button className="bt g sm" onClick={showDoc}><Ic n="doc" s={16} />View NID / licence</button>
        : doc.busy ? <p className="mut">Opening…</p> : doc.pdf ? <a className="bt g sm" href={doc.url} target="_blank" rel="noopener noreferrer"><Ic n="doc" s={16} />Open PDF</a>
        : <><img src={doc.url} alt="Verification document" /><a className="bt g sm" href={doc.url} target="_blank" rel="noopener noreferrer">Open full size</a></>}
        <small>Private file. The link expires in 5 minutes.</small></div>
      {mine.length > 0 && <><h3>Latest products</h3><div className="cd lst">{mine.map(p => <div className="rw" key={p.id}><span className="th">{p.image_url ? <img src={p.image_url} alt="" loading="lazy" /> : p.emoji || '🛍️'}</span><span className="g1"><b>{p.name}</b><small>{taka(p.price)} · {stockTxt(p.stock)}</small></span><span className={'pl ' + (p.is_active !== false ? 's3' : 's1')}>{p.is_active !== false ? 'Live' : 'Hidden'}</span></div>)}</div></>}
    </Modal>}
  </div>
}

// ---------------- Riders: the Pinkish Rider app (/rider). Run supabase-riders.sql first. ----------------
const RO0 = { fee: 60, require_code: true, pool: true, max_active: 5, support_phone: '', notice: '' }
const RIDER_LBL = { pending: 'Pending review', approved: 'Active', rejected: 'Rejected', suspended: 'Paused' }
const RIDER_PL = { pending: 's1', approved: 's3', rejected: '', suspended: 'bad' }
const RIDER_TABS = [['pending', 'Pending', 'clock', 1], ['approved', 'Active', 'shield', 3], ['rejected', 'Rejected', 'alert', 0], ['suspended', 'Paused', 'ban', 2]]
const RREASONS = ['NID photo is blurry', 'Name does not match the NID', 'Invalid phone number', 'We do not cover this area yet']
const VEH = { bike: 'Motorbike', cycle: 'Bicycle', car: 'Car / CNG', foot: 'On foot' }
const DLV = { assigned: ['Waiting for rider', 's1'], accepted: ['Rider collecting', 's1'], out: ['Out for delivery', 's2'], delivered: ['Delivered', 's3'], failed: ['Not delivered', 'bad'], cancelled: ['Cancelled', ''] }
const ACTIVE = ['assigned', 'accepted', 'out']
const seenNow = r => !!r?.last_seen && Date.now() - new Date(r.last_seen) < 15 * 6e4

// Delivery card in the order details: pick a rider, see progress, code and cash.
function Delivery({ o, dv, riders, dl, err, reload, say }) {
  const [pick, setPick] = useState(''), [busy, setBusy] = useState(false)
  const st = o.status || 0
  const load = useMemo(() => { const m = new Map(); dl.forEach(x => { if (ACTIVE.includes(x.status) && x.rider_id) m.set(x.rider_id, (m.get(x.rider_id) || 0) + 1) }); return m }, [dl])
  const list = useMemo(() => riders.filter(r => r.status === 'approved').sort((a, b) => (b.on_duty - a.on_duty) || ((load.get(a.user_id) || 0) - (load.get(b.user_id) || 0)) || a.name.localeCompare(b.name)), [riders, load])
  useEffect(() => { setPick(dv?.rider_id || '') }, [dv?.rider_id, o.id])
  if (err) return <div className="cd dlv"><h3>Delivery rider</h3><p className="mut">The rider app is not set up yet. Run <b>supabase-riders.sql</b> in the Supabase SQL editor, then press Refresh.</p></div>
  if (st === 4 && !dv) return null
  const r = dv?.rider_id ? riders.find(x => x.user_id === dv.rider_id) : null, [lb, cls] = dv ? DLV[dv.status] || DLV.assigned : ['No rider yet', 's1']
  const done = dv?.status === 'delivered' || st >= 3, locked = (dv?.code_attempts || 0) >= 5
  const assign = async id => {
    setBusy(true)
    const { error } = await sb.rpc('admin_assign_rider', { p_order: o.id, p_rider: id || null })
    setBusy(false); if (error) return say(error.message)
    say(id ? 'Rider assigned · they got a notification' : 'Rider removed'); reload()
  }
  const unlock = async () => { setBusy(true); const { error } = await sb.from('deliveries').update({ code_attempts: 0, updated_at: new Date().toISOString() }).eq('id', dv.id); setBusy(false); if (error) return say(error.message); say('Delivery code unlocked'); reload() }
  return <><h3>Delivery rider</h3><div className={'cd dlv ' + (dv?.status || 'none')}>
    <div className="dlv-h"><span className="sc-av">{r ? ini(r.name) : <Ic n="riders" s={20} />}</span><span className="g1"><b>{r ? r.name : 'No rider assigned'}</b><small>{r ? [r.phone, VEH[r.vehicle], r.on_duty ? '🟢 online' : 'offline'].filter(Boolean).join(' · ') : st < 1 ? 'Confirm the order, then assign a rider' : 'Assign a rider, or let riders take it from Open jobs'}</small></span><span className={'pl ' + cls}>{lb}</span></div>
    {dv?.fail_reason && dv.status !== 'delivered' && <p className="wn">{dv.status === 'failed' ? 'Not delivered: ' : ''}{dv.fail_reason}</p>}
    {dv && !done && dv.status !== 'cancelled' && <div className="pk-code"><span><small>Customer's delivery code (support only — never tell the rider)</small><b>{dv.delivery_code}</b></span>{locked ? <button className="bt g sm" disabled={busy} onClick={unlock}>Unlock</button> : dv.code_attempts > 0 ? <small className="er">{dv.code_attempts} wrong</small> : null}</div>}
    {dv?.status === 'delivered' && <p className="ok">✓ Delivered {dv.delivered_at ? ago(dv.delivered_at) : ''}{+dv.cash_collected > 0 ? ` · rider collected ${taka(dv.cash_collected)} ${dv.cash_settled ? '(handed in ✓)' : '(still with rider)'}` : ''}</p>}
    {!done && st !== 4 && <div className="pk-r"><select className="in" aria-label="Choose rider" value={pick} onChange={e => setPick(e.target.value)}><option value="">{list.length ? 'Choose a rider…' : 'No active riders yet'}</option>{list.map(x => <option key={x.user_id} value={x.user_id}>{x.on_duty ? '🟢 ' : '⚪ '}{x.name} · {x.area || 'any area'} · {load.get(x.user_id) || 0} job{load.get(x.user_id) === 1 ? '' : 's'}</option>)}</select>
      <button className="bt sm" disabled={busy || !pick || pick === dv?.rider_id} onClick={() => assign(pick)}>{dv?.rider_id ? 'Reassign' : 'Assign rider'}</button></div>}
    <div className="acts">{r?.phone && <a className="bt g sm" href={'tel:' + r.phone}><Ic n="phone" s={15} />Call rider</a>}{dv?.rider_id && !done && st !== 4 && <button className="bt g sm" disabled={busy} onClick={() => confirm('Remove the rider from this order?') && assign(null)}>Remove rider</button>}</div>
  </div></>
}

// Rider rules: pay per delivery, delivery code, open jobs, support number, notice.
function RiderOps({ rops, say, reload }) {
  const [f, setF] = useState(() => ({ ...RO0, ...rops })), [busy, setBusy] = useState(false), [open, setOpen] = useState(false)
  useEffect(() => { setF({ ...RO0, ...rops }) }, [rops])
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }))
  const dirty = JSON.stringify({ ...RO0, ...rops }) !== JSON.stringify(f)
  const save = async () => {
    const ph = String(f.support_phone || '').replace(/[^\d+]/g, '').slice(0, 16)
    const v = { fee: Math.min(5000, Math.max(0, Math.round(+f.fee || 0))), require_code: String(f.require_code) !== 'false', pool: String(f.pool) !== 'false', max_active: Math.min(20, Math.max(1, Math.round(+f.max_active || 5))), support_phone: ph, notice: String(f.notice || '').trim().slice(0, 400) }
    setBusy(true)
    const { error } = await sb.from('site_settings').upsert({ key: 'rider_ops', value: v, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    setBusy(false); if (error) return say(error.message)
    say('Rider rules saved. Riders see them now.'); reload()
  }
  return <section className="cd sop"><button className="sop-h" aria-expanded={open} onClick={() => setOpen(v => !v)}><span className="mq-i"><Ic n="gear" s={20} /></span><span className="g1"><b>Rider rules</b><small>{taka(rops.fee)} per delivery · {rops.require_code !== false ? 'customer code required' : 'no customer code'} · {rops.pool !== false ? 'riders can take open jobs' : 'admin assigns jobs'}</small></span><Ic n="chev" s={18} /></button>
    {open && <div className="sop-b">
      <div className="fg"><F l="Rider pay per delivery (৳)"><span className="pf"><i>৳</i><input className="in" type="number" min="0" max="5000" inputMode="numeric" value={f.fee} onChange={set('fee')} /></span></F>
        <F l="Max jobs at once per rider"><input className="in" type="number" min="1" max="20" inputMode="numeric" value={f.max_active} onChange={set('max_active')} /></F></div>
      <div className="fg"><F l="Proof of delivery"><select className="in" value={String(f.require_code)} onChange={set('require_code')}><option value="true">Customer's 4-digit code (recommended)</option><option value="false">No code (rider just confirms)</option></select></F>
        <F l="How riders get jobs"><select className="in" value={String(f.pool)} onChange={set('pool')}><option value="true">Riders can also take open jobs</option><option value="false">Only admin assigns jobs</option></select></F></div>
      <F l="Support phone (riders can call it from the app)"><input className="in" type="tel" inputMode="tel" maxLength={16} value={f.support_phone} onChange={set('support_phone')} placeholder="01XXXXXXXXX" /></F>
      <F l={`Notice to all riders (optional) · ${String(f.notice || '').length}/400`}><textarea className="in" rows="2" maxLength={400} value={f.notice} onChange={set('notice')} placeholder="e.g. Rain today: keep parcels in plastic bags." /></F>
      <p className="mut">Riders open <b>{location.host}/rider</b>, apply with their NID and start after you verify them. Open jobs are confirmed orders (Processing) without a rider.</p>
      <div className="acts"><button className="bt" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save rider rules'}</button>{dirty && <button className="bt g" onClick={() => setF({ ...RO0, ...rops })}>Undo changes</button>}</div>
    </div>}
  </section>
}

const RiderCard = memo(function RiderCard({ r, n, onOpen, onVerify }) {
  return <article className={'sc ' + r.status}>
    <button className="sc-main" onClick={() => onOpen(r.user_id)}>
      <span className="sc-av">{ini(r.name)}{r.status === 'approved' && <i className={'rd-dot' + (r.on_duty ? ' on' : '')} aria-label={r.on_duty ? 'Online' : 'Offline'} />}</span>
      <span className="sc-t"><b>{r.name}</b><small>{[r.area, r.phone, VEH[r.vehicle]].filter(Boolean).join(' · ')}</small></span>
      <span className={'pl ' + RIDER_PL[r.status]}>{RIDER_LBL[r.status]}</span>
      <span className="sc-meta">{n.active > 0 && <span className="hv">🛵 {n.active} active</span>}<span>{n.done} delivered (30d)</span>{n.cash > 0 && <span className="hv">{taka(n.cash)} cash to collect</span>}{n.failed > 0 && <span className="er">{n.failed} failed</span>}{r.status === 'approved' ? <span>{r.on_duty ? 'Online' : 'Seen ' + (r.last_seen ? ago(r.last_seen) : 'never')}</span> : <span>Applied {ago(r.created_at)}</span>}</span>
    </button>
    {r.status === 'pending' && <div className="sc-act"><small>Check the NID, then verify</small><button className="bt sm" onClick={() => onVerify(r)}>✓ Verify</button></div>}
  </article>
})

function Riders({ d: { riders = [], dl = [], orders = [], ridersErr, rops = RO0 }, reload, say, openOrder }) {
  const [f, setF] = useState(() => riders.some(r => r.status === 'pending') ? 'pending' : ''), [q, setQ] = useState(''), [sel, setSel] = useState(null), [busy, setBusy] = useState(false), [rej, setRej] = useState(null), [doc, setDoc] = useState(null), bz = useRef(false)
  const dq = useDeferredValue(q)
  useEffect(() => { setRej(null); setDoc(null) }, [sel])
  const om = useMemo(() => new Map(orders.map(o => [String(o.id), o])), [orders])
  const stat = useMemo(() => {
    const m = {}, t30 = Date.now() - 30 * 864e5
    riders.forEach(r => { m[r.user_id] = { active: 0, done: 0, failed: 0, cash: 0, fees: 0, jobs: [], recent: [] } })
    dl.forEach(x => { const e = m[x.rider_id]; if (!e) return
      if (ACTIVE.includes(x.status)) { e.active++; e.jobs.push(x) }
      if (x.status === 'delivered' && !x.cash_settled) e.cash += +x.cash_collected || 0
      if (new Date(x.updated_at) > t30) { if (x.status === 'delivered') { e.done++; e.fees += +x.fee || 0 } if (x.status === 'failed') e.failed++; if (!ACTIVE.includes(x.status)) e.recent.push(x) } })
    return m
  }, [riders, dl])
  const cnt = useMemo(() => { const c = { pending: 0, approved: 0, rejected: 0, suspended: 0 }; riders.forEach(r => { if (r.status in c) c[r.status]++ }); return c }, [riders])
  const online = riders.filter(r => r.status === 'approved' && r.on_duty).length, cashOut = Object.values(stat).reduce((t, e) => t + e.cash, 0)
  const failed = useMemo(() => dl.filter(x => x.status === 'failed'), [dl])
  const list = useMemo(() => { const k = dq.trim().toLowerCase(); return riders.filter(r => (!f || r.status === f) && (!k || `${r.name} ${r.phone} ${r.area || ''}`.toLowerCase().includes(k))).sort((a, b) => (b.status === 'pending') - (a.status === 'pending') || (b.on_duty - a.on_duty) || new Date(b.created_at) - new Date(a.created_at)) }, [riders, f, dq])
  const setStatus = useCallback(async (r, status, reason) => {
    if (bz.current) return
    bz.current = true; setBusy(true)
    const patch = { status, updated_at: new Date().toISOString(), ...(status === 'rejected' ? { reject_reason: reason } : {}), ...(status === 'approved' ? { verified_at: r.verified_at || new Date().toISOString(), reject_reason: null } : {}), ...(status !== 'approved' ? { on_duty: false } : {}) }
    const { data, error } = await sb.from('riders').update(patch).eq('user_id', r.user_id).select()
    bz.current = false; setBusy(false)
    if (error) return say(error.message)
    if (!data?.length) return say('Not saved. Run supabase-riders.sql first and make sure this account is an admin.')
    say(`${r.name} → ${RIDER_LBL[status]}`); setRej(null); reload()
  }, [reload, say])
  const verify = useCallback(r => setStatus(r, 'approved'), [setStatus])
  const open = useCallback(id => setSel(id), [])
  const cur = sel && riders.find(r => r.user_id === sel), n = cur ? stat[cur.user_id] : null
  const showDoc = async () => {
    setDoc({ busy: true })
    const { data, error } = await sb.storage.from('rider-docs').createSignedUrl(cur.id_doc_path, 300)
    if (error || !data?.signedUrl) { setDoc(null); return say('Could not open the document') }
    setDoc({ url: data.signedUrl, pdf: /\.pdf$/i.test(cur.id_doc_path) })
  }
  const settle = async () => {
    if (!confirm(`Confirm you received ${taka(n.cash)} in cash from ${cur.name}?`)) return
    setBusy(true); const { data, error } = await sb.rpc('admin_settle_rider_cash', { p_rider: cur.user_id }); setBusy(false)
    if (error) return say(error.message); say(`${taka(data)} received from ${cur.name.split(' ')[0]} ✓`); reload()
  }
  const doReject = () => { if (!rej.trim()) return say('Tell the rider why, so they can fix it'); setStatus(cur, 'rejected', rej.trim()) }
  const pause = () => { if (confirm(`Pause ${cur.name}? They cannot take or finish jobs until you reactivate them.${n.active ? ` They still have ${n.active} active job${n.active === 1 ? '' : 's'}: reassign them in Orders.` : ''}`)) setStatus(cur, 'suspended') }
  if (ridersErr) return <div className="pg"><div className="cd"><h2>The rider app is not set up yet</h2><p className="mut">Run <b>supabase-riders.sql</b> in the Supabase SQL editor, then press Refresh. Riders sign up at <b>{location.host}/rider</b>.</p></div></div>
  const foot = !cur ? null : cur.status === 'pending' ? <><button className="bt" disabled={busy} onClick={() => verify(cur)}>✓ Verify rider</button><button className="bt g" disabled={busy} onClick={() => setRej('')}>Reject</button></>
    : cur.status === 'approved' ? <button className="bt d" disabled={busy} onClick={pause}><Ic n="ban" s={17} />Pause rider</button>
    : <button className="bt" disabled={busy} onClick={() => verify(cur)}>{cur.status === 'rejected' ? '✓ Verify anyway' : 'Reactivate rider'}</button>
  return <div className="pg">
    <RiderOps rops={rops} say={say} reload={reload} />
    {cnt.approved > 0 && <Fleet riders={riders} dl={dl} orders={orders} />}
    {failed.length > 0 && <div className="cd rd-fail"><h3>Not delivered · needs a decision</h3>{failed.map(x => { const o = om.get(String(x.order_id)), r = riders.find(y => y.user_id === x.rider_id); return <button key={x.id} className="nr" onClick={() => o && openOrder(o.id)}><span className="nk w"><Ic n="alert" s={18} /></span><span className="g1"><b>#{o?.order_no || '—'} · {r?.name || 'Rider'}</b><small>{x.fail_reason || 'No reason'} · {ago(x.failed_at || x.updated_at)}</small></span><Ic n="chev" s={16} /></button> })}<p className="mut">Call the customer, then reassign a rider (or the same one) from the order, or cancel it.</p></div>}
    <div className="sd-stats rd-top"><div><b>{online}</b><small>Online now</small></div><div><b>{dl.filter(x => ACTIVE.includes(x.status)).length}</b><small>Active jobs</small></div><div><b>{taka(cashOut)}</b><small>Cash with riders</small></div><div><b>{cnt.approved}</b><small>Active riders</small></div></div>
    <div className="ob">{RIDER_TABS.map(([k, l, ic, s2]) => <button key={k} className={'s' + s2 + (f === k ? ' on' : '')} aria-pressed={f === k} onClick={() => setF(f === k ? '' : k)}><span className="oi"><Ic n={ic} s={16} /></span><small>{l}</small><b><Count to={cnt[k]} /></b></button>)}</div>
    <div className="tl"><label className="sr"><Ic n="search" s={18} /><input className="in" type="search" inputMode="search" enterKeyHint="search" placeholder="Search name, phone, area" aria-label="Search riders" value={q} onChange={e => setQ(e.target.value)} /></label></div>
    <p className="sum"><b>{list.length}</b> rider{list.length === 1 ? '' : 's'}{f && <> · <button className="lk" onClick={() => setF('')}>Show all ({riders.length})</button></>}</p>
    <div className="sl">{list.map(r => <RiderCard key={r.user_id} r={r} n={stat[r.user_id]} onOpen={open} onVerify={verify} />)}
      {!list.length && <p className="mut pad cd">{riders.length ? 'No riders match.' : `No riders yet. Share ${location.host}/rider with your delivery men: they sign up with their NID and appear here for verification.`}</p>}</div>
    {cur && <Modal cls="pm" title="Rider" onClose={() => setSel(null)} footer={foot}>
      <div className="sd-h"><span className="sc-av lg">{ini(cur.name)}</span><span className="sc-t"><b>{cur.name}</b><small>{cur.area || 'No area'} · {cur.status === 'approved' ? (cur.on_duty ? '🟢 online' : 'offline') : 'applied ' + ago(cur.created_at)}</small></span><span className={'pl ' + RIDER_PL[cur.status]}>{RIDER_LBL[cur.status]}</span></div>
      {rej !== null && <div className="rsn"><b>Why are you rejecting this rider?</b><textarea className="in" rows="3" autoFocus placeholder="The rider will see this and can resubmit" value={rej} onChange={e => setRej(e.target.value)} />
        <div className="rq">{RREASONS.map(x => <button key={x} type="button" onClick={() => setRej(x)}>{x}</button>)}</div>
        <div className="acts"><button className="bt d sm" disabled={busy} onClick={doReject}>Confirm rejection</button><button className="bt g sm" onClick={() => setRej(null)}>Cancel</button></div></div>}
      {cur.status === 'rejected' && cur.reject_reason && <div className="cd sd-note"><small>Rejection reason</small><p>{cur.reject_reason}</p></div>}
      <div className="qa"><a className="bt g sm" href={'tel:' + cur.phone}><Ic n="phone" s={16} />Call</a><a className="bt sm wa" href={wa(cur.phone, `Hi ${cur.name.split(' ')[0]}, this is Pinkish.`)} target="_blank" rel="noopener noreferrer"><Ic n="chat" s={16} />WhatsApp</a>{cur.on_duty && okLL(cur.last_lat, cur.last_lng) && seenNow(cur) && <a className="bt g sm" href={`https://www.google.com/maps/search/?api=1&query=${cur.last_lat},${cur.last_lng}`} target="_blank" rel="noopener noreferrer"><Ic n="pin" s={16} />Live location</a>}</div>
      <div className="sd-stats"><div><b>{n.active}</b><small>Active</small></div><div><b>{n.done}</b><small>Delivered 30d</small></div><div><b>{n.failed}</b><small>Failed 30d</small></div><div><b>{taka(n.fees)}</b><small>Earned 30d</small></div></div>
      {n.cash > 0 && <div className="cd rd-cash"><span className="g1"><small>Cash the rider is holding</small><b>{taka(n.cash)}</b></span><button className="bt sm" disabled={busy} onClick={settle}>Mark received</button></div>}
      {n.jobs.length > 0 && <><h3>Active jobs</h3><div className="cd lst">{n.jobs.map(x => { const o = om.get(String(x.order_id)); return <button className="rw rd-job" key={x.id} onClick={() => o && openOrder(o.id)}><span className="g1"><b>#{o?.order_no || '—'}</b><small>{o?.address?.address || ''}</small></span><span className={'pl ' + DLV[x.status][1]}>{DLV[x.status][0]}</span></button> })}</div></>}
      <h3>Details</h3>
      <div className="cd sd-info"><div><span>Phone</span><b>{cur.phone}</b></div><div><span>Area</span><b>{cur.area || '—'}</b></div><div><span>Vehicle</span><b>{VEH[cur.vehicle] || cur.vehicle}</b></div><div><span>NID number</span><b>{cur.nid_number || '—'}</b></div><div><span>Applied</span><b>{fmt(cur.created_at)}</b></div>{cur.verified_at && <div><span>Verified</span><b>{fmt(cur.verified_at)}</b></div>}{cur.last_seen && <div><span>Last seen</span><b>{ago(cur.last_seen)}</b></div>}</div>
      <h3>NID</h3>
      <div className="cd sd-doc">{!cur.id_doc_path ? <p className="wn">No document was uploaded.</p> : !doc ? <button className="bt g sm" onClick={showDoc}><Ic n="doc" s={16} />View NID</button>
        : doc.busy ? <p className="mut">Opening…</p> : doc.pdf ? <a className="bt g sm" href={doc.url} target="_blank" rel="noopener noreferrer"><Ic n="doc" s={16} />Open PDF</a>
        : <><img src={doc.url} alt="Rider NID" /><a className="bt g sm" href={doc.url} target="_blank" rel="noopener noreferrer">Open full size</a></>}
        <small>Private file. The link expires in 5 minutes.</small></div>
      {n.recent.length > 0 && <><h3>Last 30 days</h3><div className="cd lst">{n.recent.slice(0, 8).map(x => { const o = om.get(String(x.order_id)); return <div className="rw" key={x.id}><span className="g1"><b>#{o?.order_no || '—'}</b><small>{fmt(x.delivered_at || x.failed_at || x.updated_at)}{x.fail_reason && x.status === 'failed' ? ' · ' + x.fail_reason : ''}</small></span><span className={'pl ' + (DLV[x.status] || DLV.assigned)[1]}>{(DLV[x.status] || DLV.assigned)[0]}</span></div> })}</div></>}
    </Modal>}
  </div>
}

const blank = { name: '', brand: '', tag: '', category_id: '', price: '', stock: '', emoji: '', image_url: '', is_active: true, variants: [{ label: 'Standard', mult: 1 }], features: '100% original product\nDiscreet packaging' }
const PRESET = ['1 pc', '3 pcs', '5 pcs', '10 pcs', '20 pcs']
const stockTxt = s => s == null || s === '' ? 'Unlimited' : s + ' in stock'

const ProdRow = memo(function ProdRow({ p, cat, shop, onToggle, onEdit, onDup, onDel }) {
  const low = p.stock != null && p.stock <= 5, on = p.is_active !== false
  return <div className={'rw pw' + (on ? '' : ' off')}>
    <span className="th">{p.image_url ? <img src={p.image_url} alt="" loading="lazy" decoding="async" /> : p.emoji || '🛍️'}</span>
    <span className="g1"><b>{p.name}</b><small>{[p.brand, cat].filter(Boolean).join(' · ') || '—'}</small><small className="shn"><Ic n="shops" s={12} />{shop}</small></span>
    <span className="pr"><b>{taka(p.price)}</b><small className={low ? 'wn' : ''}>{stockTxt(p.stock)}</small></span>
    <span className="ra"><button className={'tg' + (on ? ' on' : '')} role="switch" aria-checked={on} aria-label={`${p.name} visible in store`} onClick={() => onToggle(p)}><i /></button><span className="tl2">{on ? 'Live' : 'Hidden'}</span>
      <span className="rb"><button className="ib3" aria-label={'Edit ' + p.name} onClick={() => onEdit(p)}><Ic n="edit" s={17} /></button><button className="ib3" aria-label={'Duplicate ' + p.name} onClick={() => onDup(p)}><Ic n="copy" s={17} /></button><button className="ib3 dg" aria-label={'Delete ' + p.name} onClick={() => onDel(p)}><Ic n="trash" s={17} /></button></span></span>
  </div>
})

function Products({ d, reload, say }) {
  const [q, setQ] = useState(''), [cf, setCf] = useState(''), [sf, setSf] = useState(''), [e, setE] = useState(null), [busy, setBusy] = useState(false), [up, setUp] = useState(false), [lim, setLim] = useState(PAGE), [er, setEr] = useState({}), orig = useRef('')
  const dq = useDeferredValue(q)
  const cn = useMemo(() => Object.fromEntries(d.cats.map(c => [c.id, c.name])), [d.cats])
  const sn = useMemo(() => Object.fromEntries((d.shops || []).map(s => [s.id, s.name])), [d.shops])
  const shopOf = p => p.shop_id ? (sn[p.shop_id] || 'Merchant') : 'Pinkish'
  const cc = useMemo(() => { const m = {}; d.products.forEach(p => { m[p.category_id] = (m[p.category_id] || 0) + 1 }); return m }, [d.products])
  const list = useMemo(() => { const k = dq.trim().toLowerCase(); return d.products.filter(p => (!cf || p.category_id === cf) && (!sf || (sf === 'own' ? !p.shop_id : p.shop_id === sf)) && (!k || `${p.name} ${p.brand || ''}`.toLowerCase().includes(k))) }, [d.products, dq, cf, sf])
  const stats = useMemo(() => ({ live: list.filter(p => p.is_active !== false).length, low: list.filter(p => p.stock != null && p.stock <= 5).length }), [list])
  useEffect(() => { setLim(PAGE) }, [cf, dq, sf])
  const dirty = !!e && JSON.stringify(e) !== orig.current
  const open = useCallback((p, dup) => {
    const v = p ? { ...blank, ...p, stock: p.stock ?? '', emoji: p.emoji || '', brand: p.brand || '', tag: p.tag || '', image_url: p.image_url || '', is_active: p.is_active !== false, variants: (p.variants?.length ? p.variants : blank.variants).map(x => ({ ...x })), features: (p.features || []).join('\n') } : { ...blank, variants: blank.variants.map(x => ({ ...x })), category_id: cf || d.cats[0]?.id || '' }
    if (dup) { delete v.id; v.name = v.name + ' (copy)' }
    orig.current = JSON.stringify(v); setE(v); setEr({}); setUp(false)
  }, [cf, d.cats])
  const edit = useCallback(p => open(p, false), [open])
  const dup = useCallback(p => open(p, true), [open])
  const close = () => { if (dirty && !window.confirm('Discard your unsaved changes?')) return; setE(null) }
  const toggle = useCallback(async p => { const { data, error } = await sb.from('products').update({ is_active: p.is_active === false }).eq('id', p.id).select(); if (error) return say(error.message); if (!data?.length) return say('Not saved. This account may not have permission to edit products.'); reload() }, [say, reload])
  const del = useCallback(async p => { if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return; const { data, error } = await sb.from('products').delete().eq('id', p.id).select(); if (error) return say(error.message); if (!data?.length) return say('Not deleted. This account may not have permission to delete products.'); say('Product deleted'); reload() }, [say, reload])
  const save = async () => {
    const x = {}
    if (!e.name.trim()) x.name = 'Enter a product name'
    if (!e.category_id) x.category_id = 'Choose a category'
    if (!(+e.price > 0)) x.price = 'Enter a price above 0'
    if (Object.keys(x).length) { setEr(x); say('Fix the highlighted fields'); setTimeout(() => document.querySelector('.md .f.bad .in')?.focus(), 60); return }
    const v = e.variants.filter(y => y.label.trim()).map(y => ({ label: y.label.trim(), mult: +y.mult || 1 }))
    const row = { name: e.name.trim(), brand: e.brand.trim() || null, tag: e.tag.trim() || null, category_id: e.category_id, price: +e.price, stock: e.stock === '' ? null : Math.max(0, +e.stock), emoji: e.emoji || null, image_url: e.image_url || null, is_active: e.is_active, variants: v.length ? v : blank.variants, features: e.features.split('\n').map(s => s.trim()).filter(Boolean), ...(e.id ? {} : { rating: 4.5, reviews: 0 }) }
    setBusy(true); const { data, error } = await (e.id ? sb.from('products').update(row).eq('id', e.id).select() : sb.from('products').insert(row).select()); setBusy(false)
    if (error) return say(error.message); if (!data?.length) return say('Not saved. This account may not have permission to change products.')
    say(e.id ? 'Product saved' : 'Product added. It is live in the store.'); setE(null); reload()
  }
  const s = (k, v) => { setE(x => ({ ...x, [k]: v })); if (er[k]) setEr(r => ({ ...r, [k]: undefined })) }
  const sv = (i, k, v) => setE(x => ({ ...x, variants: x.variants.map((y, j) => j === i ? { ...y, [k]: v } : y) }))
  const step = n => s('stock', String(Math.max(0, (+e.stock || 0) + n)))
  const preset = l => setE(x => x.variants.some(v => v.label === l) ? x : { ...x, variants: [...x.variants.filter(v => v.label.trim()), { label: l, mult: parseFloat(l) || 1 }] })
  return <div className="pg">
    <div className="tl"><label className="sr"><Ic n="search" s={18} /><input className="in" type="search" inputMode="search" enterKeyHint="search" placeholder="Search products or brand" aria-label="Search products" value={q} onChange={x => setQ(x.target.value)} /></label>
      {(d.shops || []).length > 0 && <select className="in rg" aria-label="Filter by shop" value={sf} onChange={x => setSf(x.target.value)}><option value="">All shops</option><option value="own">Pinkish (own)</option>{d.shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
      <button className="bt add" onClick={() => open()} disabled={!d.cats.length} title={d.cats.length ? '' : 'Add a category first'}><Ic n="plus" s={18} />Add product</button></div>
    <div className="chips"><button className={!cf ? 'on' : ''} onClick={() => setCf('')}>All ({d.products.length})</button>{d.cats.map(c => <button key={c.id} className={cf === c.id ? 'on' : ''} onClick={() => setCf(cf === c.id ? '' : c.id)}>{c.icon} {c.name} ({cc[c.id] || 0})</button>)}</div>
    <p className="sum"><b>{list.length}</b> product{list.length === 1 ? '' : 's'} · <b>{stats.live}</b> live · <b className={stats.low ? 'wn' : ''}>{stats.low}</b> low stock</p>
    <div className="cd lst">{list.slice(0, lim).map(p => <ProdRow key={p.id} p={p} cat={cn[p.category_id]} shop={shopOf(p)} onToggle={toggle} onEdit={edit} onDup={dup} onDel={del} />)}{!list.length && <p className="mut pad">{d.products.length ? 'No products match your search.' : 'No products yet. Add your first one.'}</p>}</div>
    {list.length > lim && <button className="bt g more" onClick={() => setLim(l => l + PAGE)}>Show {Math.min(PAGE, list.length - lim)} more · {list.length - lim} left</button>}
    {!e && d.cats.length > 0 && <button className="fab" aria-label="Add product" onClick={() => open()}><Ic n="plus" s={26} /></button>}
    {e && <Modal cls="pm" title={e.id ? 'Edit product' : 'Add product'} onClose={close} footer={<><button className="bt" disabled={busy || up} onClick={save}>{busy ? 'Saving…' : up ? 'Uploading image…' : e.id ? 'Save changes' : 'Add product'}</button><button className="bt g" onClick={close}>Cancel</button></>}>
      <div className="pp"><span className="th lg">{e.image_url ? <img src={e.image_url} alt="" /> : e.emoji || '🛍️'}</span><span className="g1"><b>{e.name.trim() || 'New product'}</b><small>{cn[e.category_id] || 'No category'}{e.tag ? ' · ' + e.tag : ''} · {shopOf(e)}</small></span><span className="pr"><b>{+e.price > 0 ? taka(e.price) : '৳—'}</b><small>{stockTxt(e.stock)}</small></span></div>
      <section className="fs"><h3>Basics</h3>
        <F l="Name *" err={er.name}><input className="in" autoComplete="off" enterKeyHint="next" value={e.name} onChange={x => s('name', x.target.value)} /></F>
        <div className="fg"><F l="Category *" err={er.category_id}><select className="in" value={e.category_id} onChange={x => s('category_id', x.target.value)}><option value="" disabled>Choose…</option>{d.cats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></F>
          <F l="Brand"><input className="in" autoComplete="off" value={e.brand} onChange={x => s('brand', x.target.value)} /></F></div>
        <F l="Label (e.g. Thin, Flavoured)"><input className="in" autoComplete="off" value={e.tag} onChange={x => s('tag', x.target.value)} /></F></section>
      <section className="fs"><h3>Price & stock</h3>
        <div className="fg"><F l="Base price (৳) *" err={er.price}><span className="pf"><i>৳</i><input className="in" type="number" min="0" inputMode="decimal" enterKeyHint="next" value={e.price} onChange={x => s('price', x.target.value)} /></span></F>
          <F l="Stock (blank = unlimited)"><span className="st"><button type="button" className="ib3" aria-label="Decrease stock" onClick={() => step(-1)}><Ic n="minus" s={18} /></button><input className="in" type="number" min="0" inputMode="numeric" placeholder="Unlimited" value={e.stock} onChange={x => s('stock', x.target.value)} /><button type="button" className="ib3" aria-label="Increase stock" onClick={() => step(1)}><Ic n="plus" s={18} /></button></span></F></div></section>
      <section className="fs"><h3>Image</h3><Img value={e.image_url} folder="products" say={say} onBusy={setUp} onChange={v => s('image_url', v)} /><F l="Emoji shown when there is no image"><input className="in sm" maxLength={8} value={e.emoji} onChange={x => s('emoji', x.target.value)} /></F></section>
      <section className="fs"><h3>Variants</h3>
        {e.variants.map((v, i) => <div className="vr" key={i}><input className="in" aria-label="Variant name" placeholder="e.g. 10 pcs" value={v.label} onChange={x => sv(i, 'label', x.target.value)} /><input className="in" aria-label="Price multiplier" type="number" step="0.05" min="0" inputMode="decimal" value={v.mult} onChange={x => sv(i, 'mult', x.target.value)} /><b>{taka(+e.price * (+v.mult || 1))}</b><button type="button" className="ib3 dg" aria-label="Remove variant" onClick={() => setE(x => ({ ...x, variants: x.variants.filter((_, j) => j !== i) }))}><Ic n="close" s={16} /></button></div>)}
        <div className="pre" aria-label="Quick add variant">{PRESET.map(l => <button type="button" key={l} onClick={() => preset(l)}>+ {l}</button>)}</div>
        <button type="button" className="bt g sm" onClick={() => setE(x => ({ ...x, variants: [...x.variants, { label: '', mult: 1 }] }))}><Ic n="plus" s={15} />Custom variant</button>
        <small>Variant price = base price × multiplier.</small></section>
      <section className="fs"><h3>Details</h3><F l="Features (one per line)"><textarea className="in" rows="4" value={e.features} onChange={x => s('features', x.target.value)} /></F></section>
      <div className="vis"><span><b>Visible in the store</b><small>{e.is_active ? 'Customers can see and order it' : 'Hidden from customers'}</small></span><button type="button" className={'tg' + (e.is_active ? ' on' : '')} role="switch" aria-checked={e.is_active} aria-label="Visible in store" onClick={() => s('is_active', !e.is_active)}><i /></button></div>
    </Modal>}</div>
}

function Cats({ d, reload, say }) {
  const [n, setN] = useState({ name: '', icon: '🛍️' }), [e, setE] = useState(null)
  const cnt = useMemo(() => { const m = {}; d.products.forEach(p => { m[p.category_id] = (m[p.category_id] || 0) + 1 }); return m }, [d.products])
  const run = async (q, ok) => { const { error } = await q; if (error) { say(error.message); return false } say(ok); reload(); return true }
  const add = async () => { if (!n.name.trim()) return say('Enter a category name'); if (await run(sb.from('categories').insert({ name: n.name.trim(), icon: n.icon || '🛍️' }), 'Category added')) setN({ name: '', icon: '🛍️' }) }
  const del = c => window.confirm(cnt[c.id] ? `Delete "${c.name}" and its ${cnt[c.id]} products? This cannot be undone.` : `Delete "${c.name}"?`) && run(sb.from('categories').delete().eq('id', c.id), 'Category deleted')
  return <div className="pg"><div className="cd"><h2>Add category</h2><div className="tl"><input className="in ic" aria-label="Icon" maxLength={8} value={n.icon} onChange={x => setN({ ...n, icon: x.target.value })} /><input className="in" placeholder="e.g. Lubricants" value={n.name} onChange={x => setN({ ...n, name: x.target.value })} /><button className="bt" onClick={add}>Add category</button></div></div>
    <div className="cd lst">{d.cats.map(c => <div className="rw" key={c.id}>{e?.id === c.id ? <><input className="in ic" aria-label="Icon" value={e.icon} onChange={x => setE({ ...e, icon: x.target.value })} /><input className="in g1" aria-label="Name" value={e.name} onChange={x => setE({ ...e, name: x.target.value })} /><button className="bt sm" onClick={async () => { if (!e.name.trim()) return say('Enter a category name'); if (await run(sb.from('categories').update({ name: e.name.trim(), icon: e.icon || '🛍️' }).eq('id', c.id), 'Category saved')) setE(null) }}>Save</button><button className="bt g sm" onClick={() => setE(null)}>Cancel</button></> : <><span className="th">{c.icon}</span><span className="g1"><b>{c.name}</b><small>{cnt[c.id] || 0} products</small></span><button className="bt g sm" onClick={() => setE({ ...c })}>Edit</button><button className="bt d sm" aria-label={'Delete ' + c.name} onClick={() => del(c)}>Delete</button></>}</div>)}{!d.cats.length && <p className="mut pad">No categories yet.</p>}</div></div>
}

// Send a push-style notification to customers (shows in the bell on the storefront, live).
function Notify({ d, say }) {
  const [f, setF] = useState({ title: '', body: '', aud: 'all', pid: '' }), [busy, setBusy] = useState(false), [last, setLast] = useState(null)
  const prods = useMemo(() => d.products.filter(p => p.is_active !== false).slice(0, 300), [d.products])
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))
  const send = async () => {
    const title = f.title.trim()
    if (title.length < 2) return say('Enter a title')
    if (!window.confirm(`Send this notification to ${f.aud === 'buyers' ? 'customers who have ordered' : 'ALL customers'}? This cannot be undone.`)) return
    setBusy(true)
    const { data, error } = await sb.rpc('admin_broadcast', { p_title: title, p_body: f.body.trim() || null, p_link: f.pid ? 'product:' + f.pid : null, p_audience: f.aud })
    setBusy(false)
    if (error) return say(error.message)
    setLast({ n: data, title }); setF(p => ({ ...p, title: '', body: '', pid: '' })); say(`Sent to ${data} ${data === 1 ? 'person' : 'people'}`)
  }
  return <div className="pg"><div className="cd"><h2>Send a notification</h2>
    <p style={{ opacity: .7, margin: '0 0 12px' }}>Customers see it in the bell on the store, instantly. Use it for offers, new arrivals and announcements.</p>
    <F l={`Title · ${f.title.length}/80`}><input className="in" maxLength={80} enterKeyHint="next" placeholder="e.g. Weekend sale is live" value={f.title} onChange={set('title')} /></F>
    <F l={`Message (optional) · ${f.body.length}/300`}><textarea className="in" rows={3} maxLength={300} placeholder="Short and clear works best" value={f.body} onChange={set('body')} /></F>
    <div className="tl"><F l="Send to"><select className="in" value={f.aud} onChange={set('aud')}><option value="all">All customers</option><option value="buyers">Customers who have ordered</option></select></F>
      <F l="Open product when tapped (optional)"><select className="in" value={f.pid} onChange={set('pid')}><option value="">Just open notifications</option>{prods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></F></div>
    <div className="ntp-l">Preview · how it looks on a customer's phone</div>
    <div className="ntp"><span className="ntp-ic" aria-hidden="true">🔔</span><div className="ntp-t"><div className="ntp-h"><b>{f.title.trim() || 'Your title appears here'}</b><em>now</em></div>{f.body.trim() && <p>{f.body.trim()}</p>}{f.pid && <span className="ntp-go">View ›</span>}</div></div>
    <button className="bt ntp-send" disabled={busy || f.title.trim().length < 2} onClick={send}>{busy ? 'Sending…' : 'Send notification'}</button>
    {last && <p style={{ margin: '12px 0 0', color: '#1a7f4b' }}>✓ “{last.title}” sent to {last.n} {last.n === 1 ? 'person' : 'people'}.</p>}</div></div>
}

const HERO_BG = { purple: ['#2d0b4a', '#8e2a8c', '#c2377f'], pink: ['#7a1648', '#e0457b', '#ff8fb8'], ocean: ['#0b2a5b', '#1f6fd1', '#38c6e0'], sunset: ['#7a1f2b', '#e8542f', '#ffb347'], forest: ['#0d3b2e', '#1f8a5b', '#7bd88f'], night: ['#0c0713', '#2a1a3a', '#4a1668'] }
const BG_NAMES = { purple: 'Purple', pink: 'Pink', ocean: 'Ocean', sunset: 'Sunset', forest: 'Forest', night: 'Night', custom: 'Custom' }
const heroBg = x => {
  if (x.bg === 'custom' && /^#[0-9a-f]{6}$/i.test(x.c1 || '') && /^#[0-9a-f]{6}$/i.test(x.c2 || '')) return `linear-gradient(120deg,${x.c1},${x.c2})`
  const c = HERO_BG[x.bg] || HERO_BG.purple
  return `linear-gradient(120deg,${c[0]},${c[1]} 70%,${c[2]})`
}
const SPEEDS = [3, 4, 5, 6, 8, 10]
const SLIDE0 = { chip: '', lines: '', sub: '', emoji: '', image: '', on: true, cta: 'Shop Now', link: '', bg: 'purple', c1: '#2d0b4a', c2: '#c2377f', layout: 'side', tone: 'light' }
const DEF = [{ ...SLIDE0, chip: 'Limited Offer', lines: 'Privacy. Confidence.\nComfort. Wellness.', emoji: '🛡️' }, { ...SLIDE0, chip: 'Delivery from ৳40', lines: 'Discreet delivery\nacross Chattogram', emoji: '🚚' }, { ...SLIDE0, chip: 'Use code SHIELD10', lines: 'Get 10% off\nyour first order', emoji: '🎁' }]
const isLogo = v => v === '🛡️' || v === '🛡'
function Hero({ say, d }) {
  const [s, setS] = useState(null), [cfg, setCfg] = useState({ auto: true, speed: 4 }), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false)
  const cats = d?.cats || [], prods = d?.products || []
  // picture shapes: the store shows a wide picture as a whole-picture slide, so the preview does the same
  const [ars, setArs] = useState({}), asked = useRef(new Set())
  useEffect(() => {
    let on = true
    ;(s || []).forEach(x => {
      if (!x.image || asked.current.has(x.image)) return
      asked.current.add(x.image)
      const im = new Image()
      im.onload = () => { if (on) setArs(a => ({ ...a, [x.image]: (im.naturalWidth || 1) / (im.naturalHeight || 1) })) }
      im.onerror = () => { if (on) setArs(a => ({ ...a, [x.image]: 1 })) }
      im.src = x.image
    })
    return () => { on = false }
  }, [s])
  useEffect(() => {
    let live = true
    sb.from('site_settings').select('value').eq('key', 'hero').maybeSingle().then(({ data, error }) => {
      if (!live) return
      if (error) say(error.message)
      const v = data?.value?.slides
      setCfg({ auto: data?.value?.auto !== false, speed: SPEEDS.includes(+data?.value?.speed) ? +data.value.speed : 4 })
      setS(Array.isArray(v) && v.length ? v.map(x => ({ ...SLIDE0, ...x })) : DEF)
    })
    return () => { live = false }
  }, [say])
  useEffect(() => {
    if (!dirty) return
    const h = e => { e.preventDefault(); e.returnValue = '' }
    addEventListener('beforeunload', h); return () => removeEventListener('beforeunload', h)
  }, [dirty])
  if (!s) return <div className="ctr"><i className="spin" /></div>
  const upd = fn => { setS(fn); setDirty(true) }
  const set = (i, k, v) => upd(a => a.map((x, j) => j === i ? { ...x, [k]: v } : x))
  const mv = (i, d) => upd(a => { const b = [...a], j = i + d; if (j < 0 || j >= b.length) return a;[b[i], b[j]] = [b[j], b[i]]; return b })
  const setC = p => { setCfg(c => ({ ...c, ...p })); setDirty(true) }
  const save = async () => {
    const bad = s.findIndex(x => x.on !== false && !(x.lines || '').trim() && !(x.layout === 'full' && x.image))
    if (bad >= 0) return say(`Slide ${bad + 1} is shown but has no text. Add text, hide it or delete it.`)
    if (!s.some(x => x.on !== false)) return say('Show at least one slide, or the store uses its default banner.')
    const badUrl = s.findIndex(x => (x.link || '').startsWith('url:') && !/^https?:\/\/\S+\.\S+/i.test(x.link.slice(4).trim()))
    if (badUrl >= 0) return say(`Slide ${badUrl + 1}: the web link must start with https://`)
    const slides = s.map(x => ({ chip: (x.chip || '').trim(), lines: (x.lines || '').split('\n').map(l => l.trim()).filter(Boolean).join('\n'), sub: (x.sub || '').trim().slice(0, 90), emoji: (x.emoji || '').trim(), image: x.image || '', on: x.on !== false, cta: (x.cta || '').trim().slice(0, 24), link: (x.link || '').startsWith('url:') ? 'url:' + x.link.slice(4).trim() : x.link || '', bg: x.bg || 'purple', c1: x.c1 || '#2d0b4a', c2: x.c2 || '#c2377f', layout: x.layout === 'cover' || x.layout === 'full' ? x.layout : 'side', tone: x.tone === 'dark' ? 'dark' : 'light' }))
    setBusy(true)
    const { error } = await sb.from('site_settings').upsert({ key: 'hero', value: { slides, auto: cfg.auto, speed: cfg.speed }, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    setBusy(false)
    if (error) return say(error.message)
    setS(slides); setDirty(false); say('Hero saved. It is live on the storefront.')
  }
  return <div className="pg"><p className="mut">The slides on the storefront home banner. Customers see slides marked Show, in this order. {dirty && <b className="wn">Unsaved changes</b>}</p>
    <div className="cd"><div className="fg"><label className="ck"><input type="checkbox" checked={cfg.auto} onChange={e => setC({ auto: e.target.checked })} /> Slide automatically</label><F l="Time on each slide"><select className="in" disabled={!cfg.auto} value={cfg.speed} onChange={e => setC({ speed: +e.target.value })}>{SPEEDS.map(v => <option key={v} value={v}>{v} seconds</option>)}</select></F></div></div>
    {s.map((x, i) => {
      const cov = x.layout === 'cover' && !!x.image, full = !!x.image && x.layout !== 'cover' && (x.layout === 'full' || ars[x.image] >= 1.25), autoWide = full && x.layout !== 'full', lk = x.link || '', lt = lk.startsWith('cat:') ? 'cat' : lk.startsWith('prod:') ? 'prod' : lk.startsWith('url:') ? 'url' : ''
      const pv = { background: heroBg(x), color: x.tone === 'dark' ? '#2a1a3a' : '#fff' }
      if (cov) pv.background = `linear-gradient(90deg,${x.tone === 'dark' ? '#fffd' : '#000b'},#0000), url(${JSON.stringify(x.image)}) center/cover`
      if (full) { pv.background = `url(${JSON.stringify(x.image)}) center/contain no-repeat, ${heroBg(x)}`; pv.aspectRatio = '2.4/1'; pv.minHeight = 0 }
      return <div className="cd hs" key={i}><div className="pv" style={pv}>{!full && <div>{x.chip && <span style={{ fontSize: '.7rem', opacity: .85, letterSpacing: '.08em', textTransform: 'uppercase' }}>{x.chip}</span>}{(x.lines || '').split('\n').filter(Boolean).map((l, k) => <span key={k}>{l}</span>)}{x.sub && <span className="pvs">{x.sub}</span>}{x.cta && <span className="pvb">{x.cta} ↗</span>}</div>}{!cov && !full && <i>{x.image ? <img src={x.image} alt="" /> : isLogo(x.emoji) ? <img src="/logo-mark.webp?v=2" alt="" /> : x.emoji}</i>}</div>
        <div><F l="Headline (one line per row)"><textarea className="in" rows="3" value={x.lines} onChange={e => set(i, 'lines', e.target.value)} /></F>
          <div className="fg"><F l="Small text under the headline (optional)"><input className="in" maxLength={90} value={x.sub} onChange={e => set(i, 'sub', e.target.value)} /></F><F l="Badge (small label above the headline)"><input className="in" maxLength={30} value={x.chip} onChange={e => set(i, 'chip', e.target.value)} /></F></div>
          <div className="fg"><F l="Button text (empty = no button)"><input className="in" maxLength={24} value={x.cta} onChange={e => set(i, 'cta', e.target.value)} /></F>
            <F l="Tapping the slide opens"><select className="in" value={lt} onChange={e => set(i, 'link', e.target.value === 'cat' ? 'cat:' + (cats[0]?.id ?? '') : e.target.value === 'prod' ? 'prod:' + (prods[0]?.id ?? '') : e.target.value === 'url' ? 'url:https://' : '')}><option value="">All categories</option>{cats.length > 0 && <option value="cat">One category</option>}{prods.length > 0 && <option value="prod">One product</option>}<option value="url">A web link</option></select></F></div>
          {lt === 'cat' && <F l="Category"><select className="in" value={lk.slice(4)} onChange={e => set(i, 'link', 'cat:' + e.target.value)}>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></F>}
          {lt === 'prod' && <F l="Product"><select className="in" value={lk.slice(5)} onChange={e => set(i, 'link', 'prod:' + e.target.value)}>{prods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></F>}
          {lt === 'url' && <F l="Web link (opens in a new tab)"><input className="in" inputMode="url" placeholder="https://" value={lk.slice(4)} onChange={e => set(i, 'link', 'url:' + e.target.value)} /></F>}
          <F l="Background colour"><div className="sw">{Object.keys(BG_NAMES).map(k => <button key={k} type="button" title={BG_NAMES[k]} aria-label={BG_NAMES[k]} aria-pressed={(x.bg || 'purple') === k} className={(x.bg || 'purple') === k ? 'on' : ''} style={{ background: k === 'custom' ? 'conic-gradient(#e0457b,#f5c542,#3fbf7f,#2f80ed,#8e2a8c,#e0457b)' : heroBg({ bg: k }) }} onClick={() => set(i, 'bg', k)} />)}</div></F>
          {x.bg === 'custom' && <div className="fg"><F l="Colour 1"><input className="in col" type="color" value={x.c1 || '#2d0b4a'} onChange={e => set(i, 'c1', e.target.value)} /></F><F l="Colour 2"><input className="in col" type="color" value={x.c2 || '#c2377f'} onChange={e => set(i, 'c2', e.target.value)} /></F></div>}
          <div className="fg"><F l="Picture style"><select className="in" value={x.layout === 'cover' || x.layout === 'full' ? x.layout : 'side'} onChange={e => set(i, 'layout', e.target.value)}><option value="side">Picture on the right</option><option value="cover">Picture behind the text</option><option value="full">Picture only (whole picture, no text)</option></select></F>
            <F l="Text colour"><select className="in" value={x.tone === 'dark' ? 'dark' : 'light'} onChange={e => set(i, 'tone', e.target.value)}><option value="light">White (for dark backgrounds)</option><option value="dark">Dark (for light backgrounds)</option></select></F></div>
          <F l="Emoji (used when there is no picture)"><input className="in sm" maxLength={8} value={x.emoji} onChange={e => set(i, 'emoji', e.target.value)} /></F>
          <Img wide value={x.image} folder="hero" say={say} onChange={v => set(i, 'image', v)} />
          <p className="mut">Best picture: wide, 2400 × 1000 px (2.4:1). It is shown whole across the banner. Square or tall pictures sit beside the text.</p>
          {autoWide && <p className="hnote">This picture is wide, so the store shows it as a whole-picture slide and hides the headline and button. To keep the text, choose "Picture behind the text".</p>}
          {x.layout === 'cover' && !x.image && <p className="mut">Upload a picture to use this style. Wide photos (3:2) with the subject on the right work best.</p>}
          {x.layout === 'full' && <p className="mut">{x.image ? 'The whole picture is shown on the banner, nothing is cut. Tapping it opens the link above.' : 'Upload a wide picture, best 2400 × 1000 px (about 2.4:1). Put any text inside the picture itself.'}</p>}
          <div className="acts"><label className="ck"><input type="checkbox" checked={x.on !== false} onChange={e => set(i, 'on', e.target.checked)} /> Show</label><button className="bt g sm" disabled={!i} onClick={() => mv(i, -1)}>Move up</button><button className="bt g sm" disabled={i === s.length - 1} onClick={() => mv(i, 1)}>Move down</button><button className="bt d sm" onClick={() => { if (window.confirm(`Delete slide ${i + 1}?`)) upd(a => a.filter((_, j) => j !== i)) }}>Delete</button></div></div></div>
    })}
    {!s.length && <p className="mut cd">No slides. Add one, or save to let the store use its default banner.</p>}
    <div className="acts"><button className="bt g" onClick={() => upd(a => [...a, { ...SLIDE0, emoji: '✨' }])}>Add slide</button><button className="bt g" onClick={() => { if (window.confirm('Reset to the default slides? Nothing is saved until you press Save hero.')) upd(() => DEF) }}>Reset to defaults</button><button className="bt" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save hero'}</button></div></div>
}