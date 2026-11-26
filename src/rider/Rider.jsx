import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import './rider.css'
import { signIn, signUp, signOut, onAuthChange, resetPassword, signInWithGoogle, supabase, onNotification } from '../api.js'
import { LiveMap } from '../lib/LiveMap.jsx'
import { HUB, RIDER_KM, okLL, havKm, kmTxt, etaMin } from '../lib/zone.js'
import { getMe, applyRider, getJobs, getPool, pickupPoints, setDuty, ping, claimJob, acceptJob, declineJob, startJob, failJob, deliverJob, mapLink, mapEmbed, telHref, validPhone, validNid, cleanPhone, VEHICLES } from './riderApi.js'

/* =====================================================================
   Pinkish Rider  ·  /rider
   Rider applies → Pinkish verifies → rider goes online, accepts jobs,
   collects parcels from sellers with the pickup code, and completes
   deliveries with the customer's 4-digit code (+ cash for COD).
   Riders reach this app only at /rider. It is not linked from the store.
   ===================================================================== */

const taka = n => '৳' + Math.round(Number(n) || 0).toLocaleString('en-BD')
const msg = e => e?.message || 'Something went wrong. Please try again.'
const ago = d => { const m = Math.max(0, Math.round((Date.now() - new Date(d)) / 6e4)); return m < 1 ? 'just now' : m < 60 ? m + 'm ago' : m < 1440 ? Math.floor(m / 60) + 'h ago' : Math.floor(m / 1440) + 'd ago' }
const when = d => { try { return new Date(d).toLocaleString('en-BD', { dateStyle: 'medium', timeStyle: 'short' }) } catch { return '' } }
const first = n => String(n || '').trim().split(/\s+/)[0] || 'Rider'
const okEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim())
const DRAFT = 'rd_draft'
// name + phone kept through the email confirmation only: expires after 7 days and is deleted on log-out
const draft = () => { try { const d = JSON.parse(localStorage.getItem(DRAFT)) || {}; if (!d.t || Date.now() - d.t > 7 * 864e5) { localStorage.removeItem(DRAFT); return {} } return d } catch { return {} } }
const keepDraft = d => { try { localStorage.setItem(DRAFT, JSON.stringify({ ...d, t: Date.now() })) } catch { /* storage unavailable */ } }
const dropDraft = () => { try { localStorage.removeItem(DRAFT) } catch { /* storage unavailable */ } }
// refresh only when someone is looking and there is a connection (saves battery and mobile data)
const live = () => !document.hidden && navigator.onLine !== false
// slow or data-saver connections: the map loads only when the rider taps it
const lowData = () => { try { const c = navigator.connection; return !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) } catch { return false } }
const FRAMED = (() => { try { return window.top !== window.self } catch { return true } })()
const FAIL = ['Customer not answering the phone', 'Customer not at the address', 'Wrong or incomplete address', 'Customer refused the parcel', 'Customer asked for another day', 'Parcel damaged']
const DECLINE = ['Too far from me', 'Vehicle problem', 'Not feeling well', 'Too many jobs right now']
// ---------- motion ----------
// riders who turned on "reduce motion" get instant screen changes
const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } }
// Screen changes slide like a native app with the View Transitions API (Chrome / Android 111+, Safari 18+).
// dir: 'fwd' (open a job), 'back' (leave a job), 'next' / 'prev' (bottom tabs). Other browsers get a CSS fade-in.
let navTok = 0
const swap = (dir, fn) => {
  const d = document, r = d.documentElement
  if (!d.startViewTransition || calm() || d.hidden) return fn()
  const tok = ++navTok; r.dataset.rxNav = dir
  const done = () => { if (navTok === tok) delete r.dataset.rxNav }
  try { d.startViewTransition(() => flushSync(fn)).finished.then(done, done) } catch { done(); fn() }
}
// numbers count up to their new value instead of jumping (only transform-free text updates, ~0.65 s)
function Num({ v, f = taka }) {
  const n = Number(v) || 0, start = calm() ? n : 0, [d, setD] = useState(start), cur = useRef(start)
  useEffect(() => {
    const a = cur.current; if (a === n) return
    if (calm() || document.hidden) { cur.current = n; setD(n); return }
    let raf, t0
    const step = t => { if (t0 == null) t0 = t; const k = Math.min(1, (t - t0) / 650), x = a + (n - a) * (1 - (1 - k) ** 3); cur.current = k < 1 ? x : n; setD(cur.current); if (k < 1) raf = requestAnimationFrame(step) }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [n])
  return <span className="rx-num">{f(d)}</span>
}
const int = x => Math.round(x)
const toUserObj = a => a ? { id: a.id, email: a.email, name: a.user_metadata?.full_name || a.user_metadata?.name || '', mobile: a.user_metadata?.phone || '' } : null

const IC = {
  bike: <><circle cx="5.5" cy="17" r="3" /><circle cx="18.5" cy="17" r="3" /><path d="M5.5 17l4-7h5l4 7M9.5 10L8 7H5.5M14.5 10l1.5-3h2.5" /></>,
  box: <><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></>,
  home: <><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-5h4v5" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></>,
  wallet: <><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a1 1 0 0 1 1 1v2" /><path d="M3 7.5V17a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5.5A2.5 2.5 0 0 1 3 7.5z" /><circle cx="16.5" cy="13.5" r="1.2" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6" /></>,
  phone: <path d="M5 4h3.5l1.7 4.3-2.2 1.4a11 11 0 0 0 6.3 6.3l1.4-2.2L20 15.5V19a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  map: <><path d="M9 4L3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z" /><path d="M9 4v13.5M15 6.5V20" /></>,
  pin: <><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  store: <><path d="M4 9l1.5-5h13L20 9" /><path d="M4 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 6 0 2.5 2.5 0 0 0 5 0" /><path d="M5 12v8h14v-8" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3M14 9l2 2" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.7 2.7L16 9.5" /></>,
  back: <path d="M15 5l-7 7 7 7" />,
  chev: <path d="M9 6l6 6-6 6" />,
  refresh: <><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4.5V9h-4.5" /></>,
  alert: <><path d="M12 3l10 18H2L12 3z" /><path d="M12 10v5M12 18h.01" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  cash: <><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.6" /><path d="M6 9.5v.01M18 14.5v.01" /></>,
  shield: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /><path d="M8.5 12l2.5 2.5L15.5 10" /></>,
  out: <><path d="M9 4H5v16h4" /><path d="M16 8l4 4-4 4M20 12H9" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 7l9 6 9-6" /></>,
  id: <><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="11" r="2" /><path d="M6 16c.6-1.6 1.8-2.4 3-2.4s2.4.8 3 2.4M14.5 10h4M14.5 13.5h3" /></>,
  ban: <><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  power: <><path d="M12 3v8" /><path d="M6.4 6.6a8 8 0 1 0 11.2 0" /></>,
  send: <path d="M21 3L10 14M21 3l-7 18-4-7-7-4 18-7z" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
}
const Ico = ({ n, s = 20 }) => <svg className="ico" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{IC[n]}</svg>
const Brand = () => <span className="rx-brand"><span className="rx-bm"><img src="/logo-mark.webp?v=2" width="26" height="22" alt="" decoding="async" /></span><span className="bp">Pink</span><span className="bi">ish</span><em>Rider</em></span>
const Field = ({ label, children, hint }) => <label className="rx-f"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
const GoogleG = () => <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.5-4.1 7-10.2 7-17.6z" /><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.3.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" /></svg>

/* Onboarding picture: drawn in code, Pinkish colours */
const Hero = () => <svg className="rx-ill" viewBox="0 0 320 210" aria-hidden="true">
  <defs><linearGradient id="rxg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#8e2a8c" /><stop offset="1" stopColor="#e0457b" /></linearGradient><linearGradient id="rxb" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#f3c9a3" /><stop offset="1" stopColor="#d99a66" /></linearGradient></defs>
  <g fill="#e9dcf2">{[[20, 120, 26, 60], [52, 95, 22, 85], [80, 110, 30, 70], [236, 100, 24, 80], [266, 80, 30, 100], [300, 115, 18, 65]].map(([x, y, w, h], i) => <rect key={i} x={x} y={y} width={w} height={h} rx="3" />)}</g>
  <ellipse cx="160" cy="196" rx="130" ry="9" fill="#e9dcf2" />
  <circle cx="160" cy="98" r="78" fill="url(#rxg)" opacity=".14" />
  <g transform="translate(92 92)"><rect x="6" y="38" width="96" height="44" rx="12" fill="url(#rxg)" /><rect x="58" y="10" width="54" height="40" rx="8" fill="url(#rxb)" /><path d="M58 24h54M85 10v40" stroke="#b9804f" strokeWidth="3" /><circle cx="24" cy="88" r="15" fill="#2d0b4a" /><circle cx="24" cy="88" r="6" fill="#fff" /><circle cx="96" cy="88" r="15" fill="#2d0b4a" /><circle cx="96" cy="88" r="6" fill="#fff" /><path d="M6 48L-6 18" stroke="#2d0b4a" strokeWidth="6" strokeLinecap="round" /><circle cx="-8" cy="14" r="6" fill="#2d0b4a" /></g>
  <g transform="translate(232 30)"><path d="M14 0a14 14 0 0 1 14 14c0 11-14 24-14 24S0 25 0 14A14 14 0 0 1 14 0z" fill="#e0457b" /><circle cx="14" cy="14" r="5" fill="#fff" /></g>
  <path d="M60 60c40-30 90-36 170-10" fill="none" stroke="#e0457b" strokeWidth="2.5" strokeDasharray="5 7" strokeLinecap="round" />
</svg>

/* ---------- small hooks ---------- */
function useToast() {
  // { m: text, id, out }: a new id restarts the pop-in, `out` plays the slide-away before it is removed
  const [t, setT] = useState(null), h = useRef(0), n = useRef(0)
  const say = useCallback(m => {
    clearTimeout(h.current); setT({ m, id: ++n.current, out: false })
    h.current = setTimeout(() => { setT(p => p && { ...p, out: true }); h.current = setTimeout(() => setT(null), 260) }, 3400)
  }, [])
  useEffect(() => () => clearTimeout(h.current), [])
  return [t, say]
}
function useOnline() {
  const [on, setOn] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine !== false)
  useEffect(() => { const a = () => setOn(true), b = () => setOn(false); addEventListener('online', a); addEventListener('offline', b); return () => { removeEventListener('online', a); removeEventListener('offline', b) } }, [])
  return on
}

/* Delivery illustrations for the home tiles and cards (drawn in code, Pinkish colours, no image downloads) */
const ArtVan = ({ className = '' }) => <svg className={'rx-art ' + className} viewBox="0 0 140 100" aria-hidden="true">
  <defs><linearGradient id="rxaV" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#e0457b" /><stop offset="1" stopColor="#8e2a8c" /></linearGradient><linearGradient id="rxaK" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f7d3a6" /><stop offset="1" stopColor="#dea067" /></linearGradient></defs>
  <ellipse cx="70" cy="91" rx="58" ry="6" fill="#2d0b4a" opacity=".12" />
  <rect x="50" y="14" width="30" height="24" rx="3" fill="url(#rxaK)" /><path d="M50 22h30" stroke="#e0457b" strokeWidth="3" />
  <rect x="82" y="6" width="34" height="32" rx="3" fill="url(#rxaK)" /><path d="M99 6v32" stroke="#e0457b" strokeWidth="3" />
  <rect x="42" y="36" width="82" height="40" rx="9" fill="url(#rxaV)" />
  <path d="M12 58c0-6 3-11 8-14l11-7h15v39H17a5 5 0 0 1-5-5z" fill="#4a1668" />
  <path d="M21 46l10-6h10v13H18z" fill="#e8dcff" />
  <circle cx="84" cy="56" r="9" fill="#fff" opacity=".92" /><path d="M80 56l3 3 5-6" stroke="#e0457b" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  <circle cx="31" cy="78" r="11" fill="#2d0b4a" /><circle cx="31" cy="78" r="4.5" fill="#f3e9fa" />
  <circle cx="104" cy="78" r="11" fill="#2d0b4a" /><circle cx="104" cy="78" r="4.5" fill="#f3e9fa" />
  <rect x="9" y="63" width="7" height="5" rx="2" fill="#ffd36b" />
</svg>
const ArtBox = ({ className = '' }) => <svg className={'rx-art ' + className} viewBox="0 0 120 112" aria-hidden="true">
  <ellipse cx="60" cy="104" rx="48" ry="6" fill="#2d0b4a" opacity=".14" />
  <path d="M60 10l50 22-50 22-50-22z" fill="#f7d3a6" /><path d="M10 32l50 22v50L10 82z" fill="#e6a86b" /><path d="M110 32L60 54v50l50-22z" fill="#d18c4d" />
  <path d="M39 19.2l50 22-8 3.6-50-22z" fill="#e0457b" opacity=".92" /><path d="M81 44.8l8-3.6V71l-8 3.6z" fill="#c2336a" opacity=".92" />
  <path d="M19 52l26 11.4v19L19 71z" fill="#fff" opacity=".95" /><path d="M23 58.5l9 4M23 63l14 6.2" stroke="#c9b6d8" strokeWidth="2" strokeLinecap="round" /><path d="M35 72.5l6 2.6v5.6l-6-2.6z" fill="#e0457b" />
</svg>
const ArtCash = ({ className = '' }) => <svg className={'rx-art ' + className} viewBox="0 0 130 100" aria-hidden="true">
  <defs><linearGradient id="rxaC" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#e0457b" /><stop offset="1" stopColor="#8e2a8c" /></linearGradient></defs>
  <ellipse cx="64" cy="92" rx="50" ry="6" fill="#2d0b4a" opacity=".12" />
  <rect x="24" y="30" width="80" height="44" rx="9" fill="#b98fd6" transform="rotate(-9 64 52)" />
  <rect x="16" y="38" width="86" height="48" rx="10" fill="url(#rxaC)" />
  <rect x="74" y="52" width="34" height="20" rx="10" fill="#4a1668" /><circle cx="85" cy="62" r="4.5" fill="#ffd36b" />
  <path d="M28 50h26M28 58h16" stroke="#fff" strokeOpacity=".65" strokeWidth="3.5" strokeLinecap="round" />
  <circle cx="104" cy="28" r="15" fill="#ffc94d" /><circle cx="104" cy="28" r="10" fill="none" stroke="#e8a21a" strokeWidth="2.5" /><text x="104" y="33.5" textAnchor="middle" fontSize="14" fontWeight="800" fill="#a86400" fontFamily="system-ui,sans-serif">৳</text>
</svg>

/* =====================================================================
   Sign in / join (email or the same Google account used on Pinkish)
   ===================================================================== */
function Auth({ onUser, lock }) {
  const [mode, setMode] = useState('in'), [f, setF] = useState({ name: '', phone: '', email: '', password: '', confirm: '' }), [show, setShow] = useState(false)
  const [err, setErr] = useState(''), [info, setInfo] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState('')
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))
  const sw = m => { setMode(m); setErr(''); setInfo(''); setDone('') }
  const google = async () => {
    setErr('')
    try { try { sessionStorage.setItem('pk_rider', '1') } catch { /* storage unavailable */ } await signInWithGoogle(location.origin + '/rider') } catch (x) { setErr(msg(x)) }
  }
  const go = async e => {
    e.preventDefault(); setErr(''); setInfo('')
    const email = f.email.trim().toLowerCase()
    try {
      if (!okEmail(email)) throw new Error('Enter a valid email address.')
      if (mode === 'forgot') { setBusy(true); await resetPassword(email); setInfo('We sent a reset link to ' + email + '.'); return }
      if (mode === 'up') {
        if (f.name.trim().length < 2) throw new Error('Enter your full name.')
        if (!validPhone(f.phone)) throw new Error('Enter a valid Bangladeshi mobile number, like 01712345678.')
        if (f.password.length < 8 || !/\d/.test(f.password) || !/[A-Za-z]/.test(f.password)) throw new Error('Password needs at least 8 characters with letters and numbers.')
        if (f.password !== f.confirm) throw new Error('Passwords do not match.')
      }
      setBusy(true); lock.current = mode === 'up'
      if (mode === 'in') return onUser(await signIn(email, f.password))
      keepDraft({ name: f.name.trim(), phone: cleanPhone(f.phone) })
      let u
      try { u = await signUp({ name: f.name.trim(), phone: cleanPhone(f.phone), email, password: f.password, redirectTo: location.origin + '/rider' }) } catch (x) {
        if (x.code !== 'exists' && x.code !== 'email_limit') throw x
        // Already a Pinkish customer with this email: log in with that password and continue to verification
        try { u = await signIn(email, f.password) } catch { throw new Error(x.code === 'exists' ? 'This email already has a Pinkish account. Log in with its password, or use Continue with Google.' : msg(x)) }
      }
      if (u?.needsConfirm) setDone(email); else onUser(u)
    } catch (x) { setErr(msg(x)) } finally { lock.current = false; setBusy(false) }
  }
  return <div className="rx-auth">
    <div className="rx-hero">
      <div className="rx-herotop"><Brand /></div>
      <Hero />
      <h1>Delivering parcels<br />made simple</h1>
      <p>Collect from verified shops, deliver to happy customers, and see every taka you earn.</p>
      <ul><li><Ico n="shield" s={16} />Verified riders</li><li><Ico n="key" s={16} />Secure codes</li><li><Ico n="wallet" s={16} />Daily earnings</li></ul>
    </div>
    <div className="rx-card rx-authc">
      {done ? <div className="rx-done"><span className="rx-big"><Ico n="mail" s={36} /></span><h2>Check your email</h2><p className="rx-mut">We sent a confirmation link to <b>{done}</b>. Open it, then come back and log in.</p><button className="rx-btn" onClick={() => sw('in')}>Go to login</button></div> : <>
        {mode !== 'forgot' && <div className={'rx-tabs' + (mode === 'up' ? ' up' : '')} role="tablist"><button role="tab" aria-selected={mode === 'in'} className={mode === 'in' ? 'on' : ''} onClick={() => sw('in')}>Log in</button><button role="tab" aria-selected={mode === 'up'} className={mode === 'up' ? 'on' : ''} onClick={() => sw('up')}>Become a rider</button></div>}
        <div className="rx-swap" key={mode}>
        <h2>{mode === 'in' ? 'Welcome back' : mode === 'up' ? 'Create your rider account' : 'Reset your password'}</h2>
        {err && <div key={err} className="rx-err" role="alert">{err}</div>}{info && <div className="rx-ok" role="status">{info}</div>}
        {mode !== 'forgot' && <>
          <button type="button" className="rx-btn wide ghost rx-google" onClick={google}><GoogleG />Continue with Google</button>
          <p className="rx-mut rx-gnote">Have a Pinkish account? Use the same Gmail. No new password needed.</p>
          <div className="rx-or"><span>or use email</span></div>
        </>}
        <form onSubmit={go} noValidate>
          {mode === 'up' && <><Field label="Full name (as on NID)"><input value={f.name} onChange={set('name')} autoComplete="name" maxLength={80} /></Field>
            <Field label="Mobile number"><input type="tel" inputMode="numeric" value={f.phone} onChange={set('phone')} placeholder="01XXXXXXXXX" autoComplete="tel" maxLength={16} /></Field></>}
          <Field label="Email"><input type="email" inputMode="email" value={f.email} onChange={set('email')} autoComplete="email" placeholder="you@example.com" /></Field>
          {mode !== 'forgot' && <Field label="Password"><span className="rx-pw"><input type={show ? 'text' : 'password'} value={f.password} onChange={set('password')} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /><button type="button" onClick={() => setShow(v => !v)}>{show ? 'Hide' : 'Show'}</button></span></Field>}
          {mode === 'up' && <Field label="Confirm password"><input type={show ? 'text' : 'password'} value={f.confirm} onChange={set('confirm')} autoComplete="new-password" /></Field>}
          <button className="rx-btn wide" disabled={busy}>{busy ? 'Please wait…' : mode === 'in' ? 'Log in' : mode === 'up' ? 'Continue' : 'Send reset link'}</button>
        </form>
        <p className="rx-alt">{mode === 'in' ? <button type="button" onClick={() => sw('forgot')}>Forgot your password?</button> : mode === 'forgot' ? <button type="button" onClick={() => sw('in')}>Back to login</button> : <span className="rx-mut">Next you add your NID. Pinkish verifies every rider before the first job.</span>}</p>
        </div>
      </>}
    </div>
  </div>
}

/* =====================================================================
   Apply (NID) · Waiting
   ===================================================================== */
function Apply({ user, rider, onDone, logout }) {
  const d = draft()
  const [f, setF] = useState({ name: rider?.name || d.name || user.name || '', phone: rider?.phone || d.phone || cleanPhone(user.mobile) || '', area: rider?.area || '', vehicle: rider?.vehicle || 'bike', nid: rider?.nid_number || '' })
  const [doc, setDoc] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))
  const go = async e => {
    e.preventDefault(); setErr('')
    if (!rider && !doc) return setErr('Add a clear photo of the front of your NID.')
    if (navigator.onLine === false) return setErr('No internet connection. Connect, then send again.')
    if (!validNid(f.nid)) return setErr('NID number must be 10, 13 or 17 digits.')
    setBusy(true)
    try { onDone(await applyRider(user.id, f, doc)); dropDraft() } catch (x) { setErr(msg(x)) }
    setBusy(false)
  }
  return <div className="rx-page narrow">
    <header className="rx-simple"><Brand /><button className="rx-ib" aria-label="Log out" onClick={logout}><Ico n="out" /></button></header>
    <div className="rx-card">
      <div className="rx-head"><span className="rx-hic"><Ico n="id" s={24} /></span><div><h1>{rider ? 'Fix and resubmit' : 'Verify yourself'}</h1><p className="rx-mut">Pinkish checks every rider. It usually takes 1 working day.</p></div></div>
      {user.email && <div className="rx-who">Signed in as <b>{user.email}</b></div>}
      {rider?.status === 'rejected' && <div className="rx-err"><b>Not approved:</b> {rider.reject_reason || 'Please check your details and NID photo.'}</div>}
      {err && <div key={err} className="rx-err" role="alert">{err}</div>}
      <form onSubmit={go} noValidate>
        <Field label="Full name (as on NID)"><input value={f.name} onChange={set('name')} maxLength={80} autoComplete="name" /></Field>
        <Field label="Mobile number (customers and sellers call this)"><input type="tel" inputMode="numeric" value={f.phone} onChange={set('phone')} placeholder="01XXXXXXXXX" maxLength={16} /></Field>
        <Field label="Area you deliver in"><input value={f.area} onChange={set('area')} maxLength={120} placeholder="e.g. Nasirabad, GEC, Agrabad" /></Field>
        <div className="rx-f"><span>Vehicle</span><div className="rx-chips">{VEHICLES.map(([k, l]) => <button type="button" key={k} className={f.vehicle === k ? 'on' : ''} aria-pressed={f.vehicle === k} onClick={() => setF(p => ({ ...p, vehicle: k }))}>{l}</button>)}</div></div>
        <Field label="NID number"><input inputMode="numeric" value={f.nid} onChange={set('nid')} placeholder="10, 13 or 17 digits" maxLength={21} /></Field>
        <Field label={rider ? 'New NID photo (optional)' : 'NID photo (front side)'}>
          <span className={'rx-file' + (doc ? ' has' : '')}><input type="file" accept="image/*,application/pdf" onChange={e => setDoc(e.target.files?.[0] || null)} /><i><Ico n={doc ? 'check' : 'id'} s={26} /></i><span><b>{doc ? doc.name : 'Tap to take or choose a photo'}</b><small>{doc ? 'Tap to change' : 'Clear, all four corners visible'}</small></span></span>
        </Field>
        <p className="rx-mut rx-lock"><Ico n="shield" s={15} /> Your NID is private. Only the Pinkish verification team can see it.</p>
        <button className="rx-btn wide" disabled={busy}>{busy ? 'Sending…' : rider ? 'Resubmit' : 'Send for verification'}</button>
      </form>
    </div>
  </div>
}
function Waiting({ rider, onRefresh, logout }) {
  useEffect(() => { const t = setInterval(() => { if (live()) onRefresh() }, 20000); return () => clearInterval(t) }, [onRefresh])
  const sus = rider.status === 'suspended'
  return <div className="rx-page narrow">
    <header className="rx-simple"><Brand /><button className="rx-ib" aria-label="Log out" onClick={logout}><Ico n="out" /></button></header>
    <div className="rx-card center">
      <span className={'rx-big' + (sus ? ' bad' : ' wait')}><Ico n={sus ? 'ban' : 'clock'} s={36} /></span>
      <h1>{sus ? 'Account paused' : 'Application sent'}</h1>
      <p className="rx-mut">{sus ? 'Your rider account is paused. Contact Pinkish support for details.' : 'Pinkish is checking your NID. This page updates by itself, and you can close the app and come back later.'}</p>
      <div className="rx-sum"><div><span>Name</span><b>{rider.name}</b></div><div><span>Phone</span><b>{rider.phone}</b></div><div><span>Area</span><b>{rider.area}</b></div><div><span>Vehicle</span><b>{(VEHICLES.find(v => v[0] === rider.vehicle) || [, rider.vehicle])[1]}</b></div></div>
      <button className="rx-btn ghost" onClick={onRefresh}><Ico n="refresh" s={18} />Check status</button>
    </div>
  </div>
}

/* =====================================================================
   Sheets and job pieces
   ===================================================================== */
function Sheet({ title, onClose, children }) {
  const box = useRef(null), close = useRef(onClose), tm = useRef(0), drag = useRef(null), [out, setOut] = useState(false)
  close.current = onClose
  // slides down before it is removed (it used to vanish in one frame)
  const shut = useCallback(() => { if (tm.current) return; if (calm()) return close.current(); setOut(true); tm.current = setTimeout(() => close.current(), 220) }, [])
  // runs once: a new onClose on every render must not re-lock the page scroll (it stayed locked after closing)
  useEffect(() => {
    const k = e => e.key === 'Escape' && shut(); addEventListener('keydown', k)
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'
    const back = document.activeElement; box.current?.focus()
    return () => { removeEventListener('keydown', k); clearTimeout(tm.current); document.body.style.overflow = prev; back?.focus?.() }
  }, [shut])
  // drag the top of the sheet down to close it (like a native bottom sheet)
  const down = e => { if (e.button > 0 || e.target.closest('button')) return; drag.current = { y: e.clientY, dy: 0 }; box.current.style.transition = 'none'; e.currentTarget.setPointerCapture?.(e.pointerId) }
  const move = e => { const d = drag.current; if (!d) return; d.dy = Math.max(0, e.clientY - d.y); box.current.style.transform = d.dy ? `translateY(${d.dy}px)` : '' }
  const up = () => { const d = drag.current, b = box.current; drag.current = null; if (!d || !b) return; b.style.transition = ''; if (d.dy > 90) shut(); else b.style.transform = '' }
  return <div className={'rx-sheet' + (out ? ' out' : '')} role="dialog" aria-modal="true" aria-label={title} onClick={e => e.target === e.currentTarget && shut()}>
    <div className="rx-sh" ref={box} tabIndex={-1}>
      <div className="rx-shh" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}><i className="rx-shg" aria-hidden="true" /><b>{title}</b><button className="rx-ib sm" aria-label="Close" onClick={shut}><Ico n="x" s={18} /></button></div>
      {children}
    </div>
  </div>
}
function ReasonSheet({ title, reasons, cta, danger, onPick, onClose }) {
  const [v, setV] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const go = async () => { if (v.trim().length < 3) return setErr('Choose or write a reason.'); setBusy(true); setErr(''); try { await onPick(v.trim()) } catch (x) { setErr(msg(x)); setBusy(false) } }
  return <Sheet title={title} onClose={onClose}>
    <div className="rx-reasons">{reasons.map(r => <button key={r} type="button" className={v === r ? 'on' : ''} onClick={() => setV(r)}>{r}</button>)}</div>
    <textarea className="rx-ta" rows={2} maxLength={200} placeholder="Or write what happened" value={reasons.includes(v) ? '' : v} onChange={e => setV(e.target.value)} />
    {err && <div key={err} className="rx-err" role="alert">{err}</div>}
    <button className={'rx-btn wide' + (danger ? ' bad' : '')} disabled={busy} onClick={go}>{busy ? 'Sending…' : cta}</button>
  </Sheet>
}

const STAGE = { assigned: ['New job', 'new'], accepted: ['Collect', 'col'], out: ['On the way', 'out'] }
const pickTxt = (p, drop) => p.status === 'picked' ? (drop ? 'At the hub ✓' : 'Collected ✓') : p.status === 'packed' ? (drop ? 'Seller bringing to hub' : 'Packed · ready for you') : 'Seller is packing'
const counts = j => { const ps = j.pickups || []; return { n: ps.length, got: ps.filter(p => p.status === 'picked').length, ready: ps.filter(p => p.status !== 'new').length } }
const units = j => (j.items || []).reduce((t, i) => t + (Number(i.qty) || 1), 0)
const CodTag = ({ j }) => j.cod == null ? <span className="rx-pill warn">Payment check</span> : j.cod > 0 ? <span className="rx-pill cash">Collect {taka(j.cod)}</span> : <span className="rx-pill ok">Paid online</span>
const fromName = j => { const ps = j.pickups || []; return ps.length ? (ps[0].shop || 'Seller') + (ps.length > 1 ? ' +' + (ps.length - 1) : '') : 'Pinkish hub' }
const fromCity = j => (j.pickups || [])[0]?.city || ''
const short = a => String(a || '').split(',')[0].trim() || 'Customer'
// how far along the route the parcel is (0 → 1). Four stops at 0, 1/3, 2/3, 1: assigned · accepted · collected · delivered.
// The rider sits between two stops (never on top of a dot), sliding a little as parcels are collected.
const progress = j => {
  const c = counts(j)
  if (j.status === 'out') return 5 / 6
  if (j.status === 'accepted') return c.n && c.got >= c.n ? 0.76 : 0.43 + 0.14 * (c.n ? c.got / c.n : 0)
  return 1 / 6
}
const reached = j => { const c = counts(j); return j.status === 'out' ? 3 : j.status === 'accepted' ? (c.n && c.got >= c.n ? 3 : 2) : 1 }
const STOPS = [0, 1 / 3, 2 / 3, 1]
const hm = d => { try { return new Date(d).toLocaleTimeString('en-BD', { hour: 'numeric', minute: '2-digit' }) } catch { return '' } }
const itemsTxt = j => { const it = j.items || [], n = it.length; return n ? it[0].name + (n > 1 ? ` +${n - 1} more` : '') : units(j) + ' item' + (units(j) === 1 ? '' : 's') }
const Thumb = ({ j }) => { const src = (j.items || []).find(i => i.image_url)?.image_url; return <span className="rx-thumb">{src ? <img src={src} alt="" loading="lazy" decoding="async" /> : <Ico n="box" s={20} />}</span> }

// Route line like a parcel tracker: stops as dots, the rider on the line, sender on the left, receiver on the right
function Route({ j, dark, left, right, tag }) {
  const p = progress(j), r = reached(j)
  return <div className={'rx-route' + (dark ? ' dk' : '')}>
    <div className="rx-rline" aria-hidden="true">
      <span className="rx-rbar"><b style={{ clipPath: `inset(0 ${((1 - p) * 100).toFixed(2)}% 0 0)` }} /></span>
      {STOPS.map((x, i) => <i key={i} className={(i < r ? 'dn' : '') + (i === 3 ? ' z' : '')} style={{ left: x * 100 + '%' }}>{i < r ? <Ico n="check" s={11} /> : i === 3 ? <Ico n="pin" s={11} /> : null}</i>)}
      <em style={{ left: p * 100 + '%' }}><small>{tag || STAGE[j.status]?.[0] || ''}</small><span><Ico n="bike" s={14} /></span></em>
    </div>
    <div className="rx-rlab">
      <span><small>{left || 'Pickup'}</small><b>{fromName(j)}</b>{fromCity(j) ? <small>{fromCity(j)}</small> : null}</span>
      <span><small>{right || 'Drop-off'}</small><b>{short(j.customer?.address)}</b></span>
    </div>
  </div>
}

// hero = the big "current delivery" card; otherwise a compact row
function JobCard({ j, onOpen, hero }) {
  const [lb, cls] = STAGE[j.status] || STAGE.assigned, c = counts(j)
  const pills = <span className="rx-jm"><CodTag j={j} />{c.n > 0 && j.status !== 'out' && <span className="rx-pill">{c.got}/{c.n} collected</span>}{j.fee > 0 && <span className="rx-pill fee">+{taka(j.fee)}</span>}</span>
  const head = <span className="rx-jh"><Thumb j={j} /><span className="rx-jid"><b>ID: #{j.order_no}</b><small>{itemsTxt(j)}</small></span><span className={'rx-st ' + cls}>{lb}</span></span>
  if (!hero) return <button className={'rx-job row ' + cls} onClick={() => onOpen(j.id)}>{head}{pills}</button>
  return <button className={'rx-job hero ' + cls} onClick={() => onOpen(j.id)}>
    {head}
    <Route j={j} left={ago(j.assigned_at || j.created_at)} right="Deliver to" />
    {pills}
    <ArtBox className="hero" />
  </button>
}

function Pickups({ j, ops }) {
  const drop = ops.mode === 'dropoff', ps = j.pickups || []
  if (!ps.length || drop) return <div className="rx-stop">
    <span className="rx-sic"><Ico n="store" s={20} /></span>
    <div className="rx-sb"><small>Collect from</small><b>Pinkish hub</b><p>{ops.hub || 'Pinkish will tell you where to collect this parcel.'}{ops.hours ? ' · ' + ops.hours : ''}</p>
      {ps.length > 0 && <ul className="rx-mini">{ps.map(p => <li key={p.id} className={p.status === 'picked' ? 'ok' : ''}>{p.shop || 'Seller'}: {pickTxt(p, true)}</li>)}</ul>}
      {ops.hub && <div className="rx-acts"><a className="rx-btn sm ghost" href={mapLink(ops.hub)} target="_blank" rel="noopener noreferrer"><Ico n="map" s={16} />Map</a></div>}</div>
  </div>
  return ps.map((p, i) => <div key={p.id} className={'rx-stop' + (p.status === 'picked' ? ' done' : '')}>
    <span className="rx-sic">{p.status === 'picked' ? <Ico n="check" s={20} /> : i + 1}</span>
    <div className="rx-sb">
      <small>Pickup {ps.length > 1 ? `${i + 1} of ${ps.length}` : ''}</small><b>{p.shop || 'Seller'}</b>
      <p>{[p.address, p.city].filter(Boolean).join(', ') || 'Address not set'}</p>
      <span className={'rx-pill ' + (p.status === 'picked' ? 'ok' : p.status === 'packed' ? 'cash' : '')}>{pickTxt(p)}</span>
      {p.status !== 'picked' && j.status === 'assigned' && <p className="rx-mut"><Ico n="key" s={14} /> Accept the job to see the pickup code.</p>}{p.status !== 'picked' && p.code && j.status === 'accepted' && <div className="rx-code"><small>Tell the seller this pickup code</small><b aria-label={'Pickup code ' + p.code.split('').join(' ')}>{p.code}</b><em>The seller types it in. Take the parcel only after their app accepts it.</em></div>}
      {p.status !== 'picked' && <div className="rx-acts"><a className="rx-btn sm ghost" href={mapLink([p.address, p.city].filter(Boolean).join(', '))} target="_blank" rel="noopener noreferrer"><Ico n="map" s={16} />Map</a>{telHref(p.phone) && <a className="rx-btn sm ghost" href={telHref(p.phone)}><Ico n="phone" s={16} />Call shop</a>}</div>}
    </div>
  </div>)
}

function Deliver({ j, ops, onDone, say }) {
  const [code, setCode] = useState(''), [cash, setCash] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const need = ops.require_code !== false, cod = j.cod
  const go = async e => {
    e.preventDefault(); setErr('')
    if (cod == null) return setErr('Pinkish is still checking this bKash payment. Call support before you hand over the parcel.')
    if (need && code.length !== 4) return setErr('Ask the customer for the 4-digit delivery code.')
    if (cod > 0 && !cash) return setErr(`Collect ${taka(cod)} in cash, then tick the box.`)
    setBusy(true)
    try { await deliverJob(j.id, code, cash ? cod : 0); navigator.vibrate?.([60, 40, 120]); say(`#${j.order_no} delivered ✓${j.fee > 0 ? ' · +' + taka(j.fee) : ''}`); onDone() } catch (x) { setErr(msg(x)); setCode('') }
    setBusy(false)
  }
  return <form className="rx-card rx-finish" onSubmit={go}>
    <h3>Hand over the parcel</h3>
    {cod == null ? <div className="rx-warn"><Ico n="alert" s={18} />bKash payment is being checked. Do not collect cash. Call support before handing over.</div>
      : cod > 0 ? <div className="rx-collect"><small>Collect in cash</small><b>{taka(cod)}</b><label className={'rx-tick' + (cash ? ' on' : '')}><input type="checkbox" checked={cash} onChange={e => setCash(e.target.checked)} /><i>{cash ? '✓' : ''}</i>I collected {taka(cod)} in cash</label></div>
        : <div className="rx-paid"><Ico n="check" s={18} />Paid online. Do not take any money.</div>}
    {need && <label className="rx-otp"><span>Customer's delivery code</span><input inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" maxLength={4} placeholder="••••" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))} aria-label="4-digit delivery code" /><small>The customer sees it in the Pinkish app (order tracking and notifications). {j.code_attempts > 0 ? `${5 - j.code_attempts} tries left.` : ''}</small></label>}
    {err && <div key={err} className="rx-err" role="alert">{err}</div>}
    <button className="rx-btn wide ok" disabled={busy || cod == null}><Ico n="check" s={20} />{busy ? 'Checking…' : 'Complete delivery'}</button>
  </form>
}

// Live job map: you (live GPS), the customer pin and the shops to collect from.
// Without a customer pin it falls back to the address map, so the rider can still navigate.
function JobMap({ j, cu, pos, ops }) {
  const [pts, setPts] = useState([])
  const collecting = j.status === 'assigned' || j.status === 'accepted'
  useEffect(() => { let on = true; if (collecting) pickupPoints(j.id).then(r => on && setPts(r)); else setPts([]); return () => { on = false } }, [j.id, collecting])
  const home = okLL(cu.lat, cu.lng), me = pos && okLL(pos.lat, pos.lng) ? pos : null
  const markers = useMemo(() => [
    me && { id: 'me', kind: 'rider', lat: me.lat, lng: me.lng, label: 'You' },
    home && { id: 'home', kind: 'home', lat: cu.lat, lng: cu.lng, label: cu.name || 'Customer' },
    ...(collecting ? pts.filter(p => okLL(p.lat, p.lng)).map(p => ({ id: 's' + p.id, kind: 'shop', lat: p.lat, lng: p.lng, label: p.shop || 'Shop' })) : []),
    collecting && ops.mode === 'dropoff' && { id: 'hub', kind: 'hub', lat: HUB.lat, lng: HUB.lng, label: 'Pinkish hub' },
  ].filter(Boolean), [me?.lat, me?.lng, home, cu.lat, cu.lng, cu.name, pts, collecting, ops.mode]) // eslint-disable-line react-hooks/exhaustive-deps
  // dashed line from you to the customer while the parcel is on the way (straight direction, not the road route)
  const [lm, setLm] = useState(null), line = useRef(null)
  useEffect(() => {
    const L = window.L; if (!lm || !L) return
    if (line.current && line.current._map !== lm) line.current = null
    const ll = j.status === 'out' && me && home ? [[me.lat, me.lng], [+cu.lat, +cu.lng]] : null
    if (!ll) { line.current?.remove(); line.current = null; return }
    if (line.current) line.current.setLatLngs(ll)
    else line.current = L.polyline(ll, { color: '#2d0b4a', weight: 4, opacity: 0.75, dashArray: '2 9', lineCap: 'round', interactive: false }).addTo(lm)
  }, [lm, j.status, me?.lat, me?.lng, home, cu.lat, cu.lng]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!home && !pts.length) { const src = mapEmbed(cu.address, cu.lat, cu.lng); return src ? <EmbedMap src={src} /> : null }
  const km = me && home ? havKm(me.lat, me.lng, +cu.lat, +cu.lng) : null
  return <div className="rx-mapwrap"><LiveMap markers={markers} zone follow={j.status === 'out' ? 'me' : undefined} lazy={lowData()} height="100%" className="rx-map rx-live" onMap={setLm}
    chip={me ? { text: km != null && j.status === 'out' ? `${kmTxt(km)} to the customer · ~${etaMin(km)} min` : 'Live · sharing your location' } : { text: 'Turn on location to see yourself', old: true }} /></div>
}
function EmbedMap({ src }) {
  const [show, setShow] = useState(() => !lowData())
  return <div className="rx-mapwrap">{!show
    ? <button type="button" className="rx-map rx-maptap" onClick={() => setShow(true)}><Ico n="map" s={26} /><b>Show map</b><small>Uses mobile data</small></button>
    : <div className="rx-map"><iframe title="Delivery location" src={src} loading="lazy" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" allow="" /></div>}</div>
}

// Slide the dark tracking sheet: drag it down for a bigger map, up for a smaller one, tap the handle to switch.
// It snaps to small / normal / big. The size lives in a CSS variable on .rx-side, so the map styles stay in CSS.
// Phones use real touch events with preventDefault (iPhone Safari ignores it on pointer events and starts
// selecting text or scrolling the page instead); a mouse uses pointer events.
function useMapSlide(on) {
  const side = useRef(null), grip = useRef(null), ended = useRef(0), def = useRef(0), [size, setSize] = useState('def'), sizeRef = useRef('def')
  const wrap = () => side.current?.querySelector('.rx-mapwrap')
  // biggest map: the sheet slides down until only its handle and the order row peek out at the bottom of the screen
  const limits = () => {
    const w = wrap(), tr = side.current?.querySelector('.rx-track'), row = side.current?.querySelector('.rx-trh')
    let hi = Math.round(innerHeight * 0.78)
    if (w && tr && row) {
      const top = Math.max(0, w.getBoundingClientRect().top), peek = row.getBoundingClientRect().bottom - tr.getBoundingClientRect().top + 14
      const lap = w.getBoundingClientRect().bottom - tr.getBoundingClientRect().top // the sheet overlaps the map (30px)
      hi = Math.round(innerHeight - top - peek + lap)
    }
    return [150, Math.max(def.current + 60, hi)]
  }
  const apply = useCallback(sz => {
    const el = side.current; if (!el) return
    el.classList.remove('drag')
    const [lo, hi] = limits()
    if (sz === 'def') el.style.removeProperty('--rx-mh'); else el.style.setProperty('--rx-mh', (sz === 'min' ? lo : hi) + 'px')
    sizeRef.current = sz; setSize(sz)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!on) apply('def') }, [on, apply])
  useEffect(() => {
    const g0 = grip.current; if (!on || !g0) return
    let d = null
    const start = (y, target) => {
      const w = wrap(); if (!w || target.closest?.('a')) return false
      const h = w.getBoundingClientRect().height
      if (!side.current.style.getPropertyValue('--rx-mh')) def.current = h
      d = { y, h, ly: y, lt: performance.now(), v: 0, moved: false }
      // switch the map off for clicks right away: the Google address map is a separate page (iframe) and once the
      // pointer slides over it the browser hands every move and the release to Google, so the bar froze
      side.current.classList.add('drag')
      return true
    }
    const drag = y => {
      if (!d) return
      const dy = y - d.y, t = performance.now()
      if (t > d.lt) d.v = 0.7 * ((y - d.ly) / (t - d.lt)) + 0.3 * d.v // px per ms, smoothed
      d.ly = y; d.lt = t
      if (!d.moved && Math.abs(dy) < 6) return
      if (!d.moved) { d.moved = true; side.current.classList.add('drag'); getSelection?.()?.removeAllRanges?.() }
      const [lo, hi] = limits()
      side.current.style.setProperty('--rx-mh', Math.round(Math.min(hi, Math.max(lo, d.h + dy))) + 'px')
    }
    const end = () => {
      const g = d; d = null; if (!g) return
      if (!g.moved) return side.current?.classList.remove('drag')
      ended.current = Date.now() // the click that follows a drag must not also switch the size
      // snap in the swipe's direction: a short pull down opens the next bigger map, a push up the next smaller one
      const dy = g.ly - g.y, [lo, hi] = limits(), df = def.current || g.h
      const pts = [['min', lo], ['def', df], ['max', hi]], aim = g.h + dy + g.v * 180
      const dir = Math.abs(dy) > 30 || Math.abs(g.v) > 0.4 ? Math.sign(dy || g.v) : 0
      const ahead = dir ? pts.filter(p => (p[1] - g.h) * dir > 12) : []
      apply((ahead.length ? ahead : pts).sort((a, b) => Math.abs(a[1] - aim) - Math.abs(b[1] - aim))[0][0])
    }
    // touch (phones and tablets)
    const ts = e => { if (e.touches.length === 1) start(e.touches[0].clientY, e.target); else { d = null; side.current?.classList.remove('drag') } }
    const tm = e => { if (!d) return; if (e.cancelable) e.preventDefault(); drag(e.touches[0].clientY) }
    const te = () => end()
    // mouse (desktop)
    // The bar does not hold (capture) the mouse: that sent the click to the bar instead of the handle, so a click on
    // the handle never switched the map size. The page listens to the moves and the release while the drag lasts.
    const pm = e => {
      if (e.pointerType !== 'mouse' || !d || d.wheel) return
      if (!e.buttons) return pu(e) // button already up: the release was lost, finish now
      e.preventDefault(); drag(e.clientY)
    }
    const pu = e => { if (e.pointerType !== 'mouse') return; removeEventListener('pointermove', pm, true); removeEventListener('pointerup', pu, true); removeEventListener('pointercancel', pu, true); if (d && !d.wheel) end() }
    const pd = e => {
      if (e.pointerType !== 'mouse' || e.button > 0 || !start(e.clientY, e.target)) return
      addEventListener('pointermove', pm, true); addEventListener('pointerup', pu, true); addEventListener('pointercancel', pu, true)
    }
    // laptop trackpad / mouse wheel on the bar: two-finger swipe down pulls the sheet down (bigger map), up pushes it back
    let wt = 0
    const wh = e => {
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return // pinch-zoom or sideways swipe: leave it to the browser
      const px = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1)
      if (!d) { if (!start(0, e.target)) return; d.wheel = true }
      if (!d.wheel) return
      e.preventDefault()
      drag(d.ly - px)
      clearTimeout(wt); wt = setTimeout(end, 160)
    }
    const L = [['touchstart', ts, { passive: true }], ['touchmove', tm, { passive: false }], ['touchend', te], ['touchcancel', te], ['pointerdown', pd], ['wheel', wh, { passive: false }]]
    L.forEach(([n, f, o]) => g0.addEventListener(n, f, o))
    return () => { clearTimeout(wt); L.forEach(([n, f]) => g0.removeEventListener(n, f)); removeEventListener('pointermove', pm, true); removeEventListener('pointerup', pu, true); removeEventListener('pointercancel', pu, true); side.current?.classList.remove('drag') }
  }, [on, apply]) // eslint-disable-line react-hooks/exhaustive-deps
  // a tap (or Enter/Space on the handle) switches between the normal and the big map
  const tap = () => { if (Date.now() - ended.current < 400) return; if (!def.current) def.current = wrap()?.getBoundingClientRect().height || 0; apply(sizeRef.current === 'def' ? 'max' : 'def') }
  return { side, grip, size, tap }
}

function JobView({ j, ops, pos, onBack, reload, say }) {
  const [busy, setBusy] = useState(false), [err, setErr] = useState(''), [sheet, setSheet] = useState(''), [spin, setSpin] = useState(false)
  const c = counts(j), ready = c.got >= c.n, st = j.status, cu = j.customer || {}, hasMap = okLL(cu.lat, cu.lng) || !!mapEmbed(cu.address, cu.lat, cu.lng)
  // header floats over the live map only. Over the Google address map it collided with Google's own place card.
  const overMap = okLL(cu.lat, cu.lng)
  const refresh = async () => { if (spin) return; setSpin(true); try { await reload() } finally { setSpin(false) } }
  useEffect(() => { // keep the screen awake while delivering (the phone drops the lock when the screen turns off, so ask again)
    if (st !== 'out' || !navigator.wakeLock) return
    let lock, gone = false
    const get = () => { if (!document.hidden && !gone) navigator.wakeLock.request('screen').then(l => { if (gone) l.release().catch(() => {}); else lock = l }, () => {}) }
    get(); document.addEventListener('visibilitychange', get)
    return () => { gone = true; document.removeEventListener('visibilitychange', get); lock?.release?.().catch?.(() => {}) }
  }, [st])
  useEffect(() => { const t = setInterval(() => { if (live()) reload() }, 10000); return () => clearInterval(t) }, [reload])
  const run = async (fn, ok) => { setBusy(true); setErr(''); try { await fn(); if (ok) say(ok); await reload() } catch (x) { setErr(msg(x)) } setBusy(false) }
  const steps = ['Accept', 'Collect', 'Deliver'], at = st === 'assigned' ? 0 : st === 'accepted' ? 1 : 2
  const kmTo = pos && okLL(cu.lat, cu.lng) ? havKm(pos.lat, pos.lng, +cu.lat, +cu.lng) : null
  const slide = useMapSlide(hasMap)
  return <div className="rx-view job">
    <div className="rx-side" ref={slide.side}>
      <header className={'rx-vh' + (overMap ? ' over' : '')}><button className="rx-ib" aria-label="Back" onClick={onBack}><Ico n="back" /></button><div><b>Live tracking</b><small>#{j.order_no} · {units(j)} item{units(j) === 1 ? '' : 's'}</small></div><button className={'rx-ib' + (spin ? ' spin' : '')} aria-label="Refresh" disabled={busy || spin} onClick={refresh}><Ico n="refresh" /></button></header>
      <JobMap j={j} cu={cu} pos={pos} ops={ops} />
      <div className={'rx-track' + (hasMap ? '' : ' nomap')} data-st={st}>
        <div className={hasMap ? 'rx-grip' : undefined} ref={hasMap ? slide.grip : undefined}>
          {hasMap ? <button type="button" className="rx-grab" title="Drag down for the full map, drag up to make it smaller" aria-label={slide.size === 'def' ? 'Make the map bigger' : 'Make the map normal size'} onClick={slide.tap}><i aria-hidden="true" /></button> : <span className="rx-grab off" aria-hidden="true" />}
          <div className="rx-trh"><span><small>Order ID</small><b>#{j.order_no}</b></span><span className="r"><small>Status</small><span className={'rx-st ' + (STAGE[st]?.[1] || 'new')}>{STAGE[st]?.[0]}</span></span></div>
          <Route j={j} dark left={'Assigned ' + hm(j.assigned_at || j.created_at)} right={st === 'out' && kmTo != null ? `~${etaMin(kmTo)} min · ${kmTxt(kmTo)}` : 'Deliver to'} tag={st === 'out' && kmTo != null ? kmTxt(kmTo) + ' away' : undefined} />
        </div>
        <div className="rx-tgrid">
          <div><small>From</small><b>{fromName(j)}</b></div>
          <div><small>To</small><b>{short(cu.address)}</b></div>
          <div><small>Collected</small><b>{c.n ? `${c.got} of ${c.n}` : 'From hub'}</b></div>
          <div><small>You earn</small><b>{taka(j.fee)}</b></div>
          <div><small>Quantity</small><b>{units(j)} item{units(j) === 1 ? '' : 's'}</b></div>
          <div><small>Cash to collect</small><b>{j.cod == null ? 'Check' : j.cod > 0 ? taka(j.cod) : 'Paid online'}</b></div>
        </div>
        <ArtBox className="dk" />
        <div className="rx-tfoot">
          <span className="rx-av sm">{first(cu.name).charAt(0).toUpperCase()}</span><span className="rx-tn"><b>{cu.name || 'Customer'}</b><small>{st === 'out' ? 'Waiting for you' : 'Customer'}</small></span>
          {telHref(cu.phone) && <a className="rx-rb hot" href={telHref(cu.phone)} aria-label="Call customer"><Ico n="phone" s={18} /></a>}
          <a className="rx-rb" href={mapLink(cu.address, cu.lat, cu.lng)} target="_blank" rel="noopener noreferrer" aria-label="Navigate to the customer"><Ico n="send" s={18} /></a>
        </div>
      </div>
    </div>
    <div className="rx-vb">
      <ol className="rx-steps">{steps.map((s, i) => <li key={s} className={i < at ? 'dn' : i === at ? 'on' : ''}><i>{i < at ? '✓' : i + 1}</i>{s}</li>)}</ol>
      {err && <div key={err} className="rx-err" role="alert">{err}</div>}
      {/* keyed by status: each new stage (accepted, on the way) rises in instead of popping in */}
      <div className="rx-stage" key={st}>
      {st === 'assigned' && <div className="rx-card rx-new">
        <h3>New delivery job</h3>
        <div className="rx-kv"><div><span>You earn</span><b>{taka(j.fee)}</b></div><div><span>Cash to collect</span><b>{j.cod == null ? 'Check' : taka(j.cod)}</b></div><div><span>Pickups</span><b>{c.n || 'Hub'}</b></div></div>
        <div className="rx-acts two"><button className="rx-btn" disabled={busy} onClick={() => run(() => acceptJob(j.id), 'Job accepted. Go collect the parcels.')}>Accept job</button><button className="rx-btn ghost" disabled={busy} onClick={() => setSheet('decline')}>Decline</button></div>
      </div>}

      {(st === 'assigned' || st === 'accepted') && <section className="rx-sec"><h3>1 · Collect {c.n > 1 ? `(${c.got}/${c.n})` : ''}</h3><Pickups j={j} ops={ops} />
        {st === 'accepted' && <><button className="rx-btn wide" disabled={busy || !ready} onClick={() => run(() => startJob(j.id), 'Delivery started. The customer has been told you are on the way.')}><Ico n="bike" s={20} />{ready ? 'Start delivery' : `Waiting for parcels (${c.got}/${c.n})`}</button>
          {!ready && <p className="rx-mut center">This updates by itself when a seller confirms your pickup code.</p>}
          <button className="rx-link" onClick={() => setSheet('decline')}>I can't do this job</button></>}
      </section>}

      <section className="rx-sec"><h3>{st === 'out' ? 'Deliver to' : '2 · Deliver to'}</h3>
        <div className="rx-stop cust">
          <span className="rx-sic"><Ico n="user" s={20} /></span>
          <div className="rx-sb"><b>{cu.name || 'Customer'}</b><p>{cu.address || '—'}</p>{cu.note && <p className="rx-note">Note: {cu.note}</p>}{pos && okLL(cu.lat, cu.lng) && <span className="rx-pill">{kmTxt(havKm(pos.lat, pos.lng, +cu.lat, +cu.lng))} from you</span>}</div>
        </div>
        <div className="rx-items">{(j.items || []).map((i, k) => <div key={k}><span className="rx-th">{i.image_url ? <img src={i.image_url} alt="" loading="lazy" decoding="async" /> : <Ico n="box" s={18} />}</span><span className="rx-it">{i.name}{i.variant && i.variant !== 'Standard' ? <small>{i.variant}</small> : null}</span><em>×{i.qty}</em></div>)}</div>
      </section>

      {st === 'out' && <><Deliver j={j} ops={ops} onDone={() => { onBack(); reload() }} say={say} /><button className="rx-link bad" onClick={() => setSheet('fail')}>Could not deliver</button></>}
      {telHref(ops.support_phone) && <a className="rx-help" href={telHref(ops.support_phone)}><Ico n="phone" s={16} />Problem? Call Pinkish support</a>}
      </div>
    </div>
    {sheet === 'decline' && <ReasonSheet title="Why can't you take this job?" reasons={DECLINE} cta="Decline job" onClose={() => setSheet('')} onPick={async r => { await declineJob(j.id, r); setSheet(''); say('Job returned to Pinkish'); onBack(); reload() }} />}
    {sheet === 'fail' && <ReasonSheet title="What happened?" reasons={FAIL} cta="Report and keep the parcel" danger onClose={() => setSheet('')} onPick={async r => { await failJob(j.id, r); setSheet(''); say('Reported. Keep the parcel safe and bring it back to Pinkish.'); onBack(); reload() }} />}
  </div>
}

/* =====================================================================
   Screens
   ===================================================================== */
const HIST = { delivered: ['Delivered', 'out', 'check'], failed: ['Not delivered', 'bad', 'alert'] }
function Jobs({ data, onOpen, goFind, goEarn, q }) {
  const { active = [], stats = {}, ops = {}, me = {}, history = [] } = data
  const order = { out: 0, accepted: 1, assigned: 2 }
  const k = q.trim().toLowerCase().replace(/^#/, '')
  const list = [...active].filter(j => !k || `${j.order_no} ${j.customer?.address || ''} ${fromName(j)}`.toLowerCase().includes(k)).sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3))
  const [cur, ...rest] = list
  const today = <div className="rx-today"><div><small>Today</small><b><Num v={stats.today} f={int} /></b><span>delivered</span></div><div><small>Earned today</small><b><Num v={stats.today_fee} /></b><span>fees</span></div><div className={stats.cash > 0 ? 'cash' : ''}><small>Cash with you</small><b><Num v={stats.cash} /></b><span>give to Pinkish</span></div></div>
  if (k) return <>
    <div className="rx-hrow"><h2 className="rx-h2">Search results {list.length > 0 && <em>{list.length}</em>}</h2></div>
    {list.length ? <div className="rx-list">{list.map(j => <JobCard key={j.id} j={j} onOpen={onOpen} />)}</div> : <p className="rx-mut">No job matches “{q}”.</p>}
  </>
  return <>
    {ops.notice && <div className="rx-notice"><Ico n="bell" s={18} /><p><b>From Pinkish</b>{ops.notice}</p></div>}
    {!me.on_duty && <div className="rx-card rx-off"><span className="rx-offic"><Ico n="power" s={20} /></span><div><b>You are offline</b><p className="rx-mut">Tap the round button below to go online{ops.pool ? ' and see open jobs' : ''}.</p></div></div>}
    <div className="rx-hrow"><h2 className="rx-h2">Current delivery</h2>{active.length > 1 && <span className="rx-pill">{active.length} active</span>}</div>
    {cur ? <JobCard hero j={cur} onOpen={onOpen} /> : <div className="rx-empty"><span><Ico n="box" s={30} /></span><b>No jobs right now</b><p>{me.on_duty ? 'New jobs appear here with a buzz. Keep the app open.' : 'Go online to start receiving jobs.'}</p>{ops.pool && me.on_duty && <button className="rx-btn sm" onClick={goFind}><Ico n="search" s={16} />Find open jobs</button>}</div>}
    {rest.length > 0 && <><div className="rx-hrow"><h2 className="rx-h2">Up next <em>{rest.length}</em></h2></div><div className="rx-list">{rest.map(j => <JobCard key={j.id} j={j} onOpen={onOpen} />)}</div></>}
    <div className="rx-hrow"><h2 className="rx-h2">Today</h2></div>
    {today}
    {history.length > 0 && <>
      <div className="rx-hrow"><h2 className="rx-h2">Recent deliveries</h2><button type="button" className="rx-see" onClick={goEarn}>See all</button></div>
      <div className="rx-list">{history.slice(0, 3).map(h => { const [lb, cls, ic] = HIST[h.status] || ['Cancelled', 'off', 'ban']; return <div key={h.id} className="rx-job row hist">
        <span className="rx-jh"><span className={'rx-thumb ' + cls}><Ico n={ic} s={20} /></span><span className="rx-jid"><b>ID: #{h.order_no}</b><small>{when(h.at)}{h.status === 'delivered' && h.fee > 0 ? ' · +' + taka(h.fee) : ''}</small></span><span className={'rx-st ' + cls}>{lb}</span></span>
      </div> })}</div>
    </>}
  </>
}

function Find({ data, say, reload, onOpen }) {
  const [rows, setRows] = useState(null), [busy, setBusy] = useState(''), [err, setErr] = useState('')
  const on = data.me?.on_duty
  const load = useCallback(() => getPool().then(r => { setRows(r); setErr('') }, x => { setErr(msg(x)); setRows(p => p || []) }), [])
  useEffect(() => { load(); const t = setInterval(() => { if (live()) load() }, 15000); return () => clearInterval(t) }, [load])
  const take = async o => { setBusy(o.order_id); setErr(''); try { const id = await claimJob(o.order_id); say(`Job #${o.order_no} is yours`); await reload(); onOpen(id) } catch (x) { setErr(msg(x)); load() } setBusy('') }
  if (!data.ops?.pool) return <div className="rx-empty"><span><Ico n="search" s={30} /></span><b>Pinkish assigns your jobs</b><p>You get a notification when a new job is assigned to you.</p></div>
  return <>
    <div className="rx-hrow"><h2 className="rx-h2">Near you {rows?.length > 0 && <em>{rows.length}</em>}</h2><button className="rx-ib sm" aria-label="Refresh" onClick={load}><Ico n="refresh" s={18} /></button></div>
    {!on && <div className="rx-warn"><Ico n="alert" s={18} />Go online to take a job.</div>}
    {err && <div key={err} className="rx-err" role="alert">{err}</div>}
    {rows === null ? <div className="rx-skel" /> : !rows.length ? <div className="rx-empty"><span><Ico n="search" s={30} /></span><b>No open jobs</b><p>This list refreshes by itself every few seconds.</p></div>
      : <div className="rx-list">{rows.map(o => <div className="rx-job pool" key={o.order_id}>
        <span className="rx-jh"><span className="rx-thumb"><Ico n="box" s={20} /></span><span className="rx-jid"><small>{ago(o.created_at)}</small><b>#{o.order_no}</b></span>{o.fee > 0 && <span className="rx-st fee">+{taka(o.fee)}</span>}</span>
        <div className="rx-route"><div className="rx-rline"><i className="a"><Ico n="store" s={12} /></i><span className="rx-rbar" /><i className="z"><Ico n="pin" s={12} /></i></div><div className="rx-rlab"><span>{(o.pickups || []).join(', ') || 'Pinkish hub'}</span><span>{o.area || '—'}</span></div></div>
        <span className="rx-jm">{o.cod == null ? <span className="rx-pill warn">Payment check</span> : o.cod > 0 ? <span className="rx-pill cash">COD {taka(o.cod)}</span> : <span className="rx-pill ok">Paid online</span>}<span className="rx-pill">{o.items} item{o.items === 1 ? '' : 's'}</span></span>
        <button className="rx-btn wide sm" disabled={!on || busy === o.order_id} onClick={() => take(o)}>{busy === o.order_id ? 'Taking…' : 'Take this job'}</button>
      </div>)}</div>}
  </>
}

function Earn({ data }) {
  const { stats = {}, history = [], ops = {} } = data, [lim, setLim] = useState(30)
  return <>
    <div className="rx-earn"><small>Last 7 days</small><b><Num v={stats.week_fee} /></b><span>{stats.week || 0} deliveries</span></div>
    <div className="rx-today"><div><small>Today</small><b><Num v={stats.today_fee} /></b><span>{stats.today || 0} done</span></div><div><small>30 days</small><b><Num v={stats.month_fee} /></b><span>{stats.month || 0} done</span></div><div className={stats.cash > 0 ? 'cash' : ''}><small>Cash with you</small><b><Num v={stats.cash} /></b><span>not handed in</span></div></div>
    {stats.cash > 0 && <div className="rx-warn"><Ico n="cash" s={18} />Hand {taka(stats.cash)} to Pinkish. It is cleared here once Pinkish confirms they received it.{telHref(ops.support_phone) ? <a href={telHref(ops.support_phone)}> Call</a> : null}</div>}
    <h2 className="rx-h2">Last 30 days</h2>
    {!history.length ? <p className="rx-mut">Finished jobs show up here.</p> : <div className="rx-hist">{history.slice(0, lim).map(h => <div key={h.id} className={h.status}>
      <span className="rx-hx"><Ico n={h.status === 'delivered' ? 'check' : h.status === 'failed' ? 'alert' : 'ban'} s={18} /></span>
      <span className="rx-ht"><b>#{h.order_no}</b><small>{h.status === 'delivered' ? 'Delivered' : h.status === 'failed' ? 'Not delivered' + (h.reason ? ' · ' + h.reason : '') : 'Cancelled'} · {when(h.at)}</small></span>
      <span className="rx-hv">{h.status === 'delivered' && <b>+{taka(h.fee)}</b>}{h.cash > 0 && <small className={h.settled ? 'ok' : 'due'}>{taka(h.cash)} cash {h.settled ? '✓' : 'due'}</small>}</span>
    </div>)}{history.length > lim && <button className="rx-btn wide ghost" onClick={() => setLim(l => l + 30)}>Show more · {history.length - lim} left</button>}</div>}
  </>
}

// Profile tab (bottom bar)
function Me({ data, user, logout }) {
  const { me = {}, ops = {}, stats = {} } = data
  return <div className="rx-prof">
    <div>
      <div className="rx-me"><span className="rx-ring"><span className="rx-av lg">{first(me.name).charAt(0).toUpperCase()}</span></span><b>{me.name}</b><small>{user.email}</small><span className="rx-pill ok"><Ico n="shield" s={13} />Verified rider</span></div>
      <div className="rx-menu">
        <div><span className="rx-mi"><Ico n="phone" s={18} /></span><span>Phone</span><b>{me.phone}</b></div>
        <div><span className="rx-mi"><Ico n="pin" s={18} /></span><span>Area</span><b>{me.area || '—'}</b></div>
        <div><span className="rx-mi"><Ico n="bike" s={18} /></span><span>Vehicle</span><b>{(VEHICLES.find(v => v[0] === me.vehicle) || [, me.vehicle])[1]}</b></div>
        <div><span className="rx-mi"><Ico n="wallet" s={18} /></span><span>Last 30 days</span><b>{taka(stats.month_fee)}</b></div>
      </div>
      <div className="rx-card"><h3>How a job works</h3><ol className="rx-how">
        <li><b>Accept</b> the job (or take one from Open jobs). Pinkish riders cover {RIDER_KM} km around {HUB.name}; orders further away go by courier.</li>
        <li>At the shop, <b>tell the seller the pickup code</b>. Take the parcel only after their app accepts it.</li>
        <li>Tap <b>Start delivery</b>. The customer gets your name{ops.require_code !== false ? ' and their delivery code' : ''}.</li>
        <li>{ops.require_code !== false ? <>Hand over the parcel, collect cash if it is COD, and enter the <b>customer's code</b> to finish.</> : <>Hand the parcel to the customer named on the job (call them if unsure), collect cash if it is COD, and tap <b>Complete delivery</b>.</>}</li>
      </ol><p className="rx-rule"><Ico n="shield" s={15} />{ops.require_code !== false ? 'Never hand a parcel to anyone without the right code, and never share customer details.' : 'Hand the parcel only to the customer at the pinned address, and never share customer details.'}</p></div>
      {telHref(ops.support_phone) && <a className="rx-btn wide ghost" href={telHref(ops.support_phone)}><Ico n="phone" s={18} />Call Pinkish support</a>}
      <button className="rx-btn wide dark" onClick={logout}><Ico n="out" s={18} />Sign out</button>
    </div>
  </div>
}

/* =====================================================================
   Main app (verified riders)
   ===================================================================== */
function RiderApp({ user, logout }) {
  const [data, setData] = useState(null), [err, setErr] = useState(''), [tab, setTab] = useState('jobs'), [open, setOpen] = useState(null), [duty, setDutyBusy] = useState(false), [q, setQ] = useState(''), [spin, setSpin] = useState(false)
  const [toast, say] = useToast(), online = useOnline(), seen = useRef(null), scr = useRef(null)
  const load = useCallback(async () => {
    try {
      const d = await getJobs(); setData(d); setErr('')
      const ids = new Set((d.active || []).map(j => j.id))
      if (seen.current) { const fresh = (d.active || []).filter(j => !seen.current.has(j.id) && j.status === 'assigned'); if (fresh.length) { say(fresh.length === 1 ? `🛵 New job #${fresh[0].order_no}` : `🛵 ${fresh.length} new jobs`); navigator.vibrate?.([120, 80, 120, 80, 200]) } }
      seen.current = ids
    } catch (x) { setErr(msg(x)) }
  }, [say])
  useEffect(() => {
    load()
    const t = setInterval(() => { if (live()) load() }, 20000)
    const vis = () => { if (live()) load() }
    document.addEventListener('visibilitychange', vis); addEventListener('online', vis)
    const off = onNotification(user.id, () => load()) // instant refresh when Pinkish assigns a job
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); removeEventListener('online', vis); off() }
  }, [load, user.id])
  const onDuty = !!data?.me?.on_duty
  // Live location, only while online (on duty): shown on your job map and shared with Pinkish.
  // Every 12 s while a parcel is out for delivery (the customer watches you on their map), every 30 s otherwise.
  const [pos, setPos] = useState(null), outRef = useRef(false)
  outRef.current = (data?.active || []).some(j => j.status === 'out')
  useEffect(() => {
    if (!onDuty || !navigator.geolocation) { setPos(null); return }
    let shown = 0
    const id = navigator.geolocation.watchPosition(p => {
      const { latitude: lat, longitude: lng, accuracy } = p.coords, n = Date.now()
      if (accuracy > 300) return // a rough network fix would make the map jump around
      if (n - shown > 3000) { shown = n; setPos({ lat, lng, acc: accuracy }) }
      ping(lat, lng, outRef.current ? 12000 : 30000)
    }, () => {}, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 })
    return () => navigator.geolocation.clearWatch(id)
  }, [onDuty])
  const toggle = async () => {
    if (!online) return say('No internet. Connect first, then go online.')
    if (onDuty && (data?.active || []).some(j => j.status === 'out') && !confirm('You have a parcel out for delivery. Go offline anyway?')) return
    navigator.vibrate?.(30)
    setDutyBusy(true); try { await setDuty(!onDuty); say(onDuty ? 'You are offline' : 'You are online. New jobs will buzz.'); await load() } catch (x) { say(msg(x)) } setDutyBusy(false)
  }
  const top = () => { scr.current?.scrollTo?.(0, 0); try { window.scrollTo(0, 0) } catch { /* old browsers */ } }
  // tabs slide toward the side they sit on in the bottom bar; a job slides in from the right and back out
  const go = t => { const a = TABS.indexOf(tab), b = TABS.indexOf(t), fn = () => { setTab(t); setOpen(null); top() }; if (t === tab && !open) return fn(); swap(open ? 'back' : b < a ? 'prev' : 'next', fn) }
  const openJob = useCallback(id => swap('fwd', () => { setOpen(id); top() }), [])
  const closeJob = useCallback(() => swap('back', () => { setOpen(null); top() }), [])
  const refresh = async () => { if (spin) return; setSpin(true); await load(); setSpin(false) }
  const job = open && data?.active?.find(j => j.id === open)
  useEffect(() => { if (open && data && !job) setOpen(null) }, [open, data, job])
  // opening or leaving a job starts at the top (it used to open halfway down, wherever the home list was scrolled)
  useEffect(() => { try { window.scrollTo(0, 0) } catch { /* old browsers */ } }, [open])
  const nActive = data?.active?.length || 0, pool = !!data?.ops?.pool
  const name = first(data?.me?.name)
  if (!data) return err ? <div className="rx-page narrow center-v"><div className="rx-card center"><span className="rx-big bad"><Ico n="alert" s={34} /></span><p>{err}</p><button className="rx-btn" onClick={load}>Try again</button><button className="rx-link" onClick={logout}>Log out</button></div></div> : <SkelHome />
  const navB = (k, l, ic, n) => <button key={k} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} onClick={() => go(k)}><Ico n={ic} s={22} /><span>{l}</span>{n > 0 && <em>{n}</em>}</button>
  const TITLE = { find: ['Open jobs', 'Inside the ' + RIDER_KM + ' km Pinkish zone'], earn: ['Earnings', 'Fees and cash for the last 30 days'], me: ['Profile', 'Your rider account'] }
  const area = data.me?.area
  return <div className={'rx-app' + (job ? ' full' : '')}>
    {!online && <div className="rx-offline">No internet. Showing your last update.</div>}
    {job ? <JobView j={job} ops={data.ops || {}} pos={pos} onBack={closeJob} reload={load} say={say} /> : <>
      <header className="rx-home">
        <div className="rx-hr1">
          <div className="rx-loc"><span className="rx-locic"><Ico n="bike" s={20} /></span><span><small>Hello, {name} 👋</small><b>{area ? 'Delivering in ' + area : 'Pinkish Rider'}</b></span></div>
          <button className={'rx-duty' + (onDuty ? ' on' : '')} role="switch" aria-checked={onDuty} disabled={duty} onClick={toggle}><i /><span>{duty ? '…' : onDuty ? 'Online' : 'Offline'}</span></button>
        </div>
        {tab === 'jobs' ? <>
          <div className="rx-srow">
            <label className="rx-search"><Ico n="search" s={18} /><input type="search" inputMode="search" enterKeyHint="search" placeholder="Search order number" aria-label="Find a job" value={q} onChange={e => setQ(e.target.value)} />{q && <button type="button" aria-label="Clear" onClick={() => setQ('')}><Ico n="x" s={16} /></button>}</label>
            <button type="button" className={'rx-sbtn' + (spin ? ' spin' : '')} aria-label="Refresh jobs" onClick={refresh}><Ico n="refresh" s={20} /></button>
          </div>
          <div className="rx-quick">
            {pool ? <button onClick={() => go('find')}><span className="t"><b>Open<br />jobs</b><small>Take a job near you</small></span><ArtVan /></button>
              : <button onClick={refresh}><span className="t"><b>New<br />jobs</b><small>Check for new jobs</small></span><ArtVan /></button>}
            <button onClick={() => go('earn')}><span className="t"><b>My<br />earnings</b><small>{taka(data.stats?.today_fee)} today</small></span><ArtCash /></button>
          </div>
        </> : <div className="rx-ttl"><h1>{TITLE[tab]?.[0]}</h1><small>{TITLE[tab]?.[1]}</small></div>}
      </header>
      <main className="rx-scr" ref={scr}>
        {err && <div className="rx-err">{err}</div>}
        <div className="rx-pane" key={tab}>
          {tab === 'jobs' && <Jobs data={data} onOpen={openJob} goFind={() => go('find')} goEarn={() => go('earn')} q={q} />}
          {tab === 'find' && <Find data={data} say={say} reload={load} onOpen={id => swap('fwd', () => { setTab('jobs'); setOpen(id); top() })} />}
          {tab === 'earn' && <Earn data={data} />}
          {tab === 'me' && <Me data={data} user={user} logout={logout} />}
        </div>
      </main>
      <nav className="rx-nav" aria-label="Rider sections"><div className="rx-navin">
        {navB('jobs', 'Home', 'home', nActive)}
        {pool ? navB('find', 'Open jobs', 'search') : navB('earn', 'Earnings', 'wallet')}
        <button className={'rx-fab' + (onDuty ? ' on' : '')} role="switch" aria-checked={onDuty} aria-label={onDuty ? 'Go offline' : 'Go online'} disabled={duty} onClick={toggle}><Ico n="power" s={24} /></button>
        {pool ? navB('earn', 'Earnings', 'wallet') : telHref(data.ops?.support_phone) ? <a href={telHref(data.ops.support_phone)}><Ico n="phone" s={22} /><span>Support</span></a> : <span aria-hidden="true" />}
        {navB('me', 'Profile', 'user')}
      </div></nav>
    </>}
    {toast && <div key={toast.id} className={'rx-toast' + (toast.out ? ' out' : '')} role="status">{toast.m}</div>}
  </div>
}
const TABS = ['jobs', 'find', 'earn', 'me']
// first load: the home layout appears at once as a shimmering outline (feels faster than a spinner)
const SkelHome = () => <div className="rx-app" aria-busy="true" aria-label="Loading">
  <div className="rx-home">
    <div className="rx-skr"><i className="rx-sk c" /><span><i className="rx-sk s" /><i className="rx-sk m" /></span><i className="rx-sk p" /></div>
    <i className="rx-sk bar" />
    <div className="rx-quick"><i className="rx-sk tile" /><i className="rx-sk tile" /></div>
  </div>
  <div className="rx-scr"><i className="rx-sk h" /><i className="rx-sk card" /><div className="rx-today"><i className="rx-sk st" /><i className="rx-sk st" /><i className="rx-sk st" /></div></div>
</div>

/* =====================================================================
   Root
   ===================================================================== */
export default function Rider() {
  const lock = useRef(false), uidRef = useRef(null), [user, setUser] = useState(undefined), [rider, setRider] = useState(undefined), [err, setErr] = useState('')
  useEffect(() => { uidRef.current = user?.id || null }, [user?.id])
  useEffect(() => {
    document.title = 'Pinkish Rider'
    try { sessionStorage.removeItem('pk_rider') } catch { /* storage unavailable */ }
    const add = (tag, attrs) => { const e = document.createElement(tag); Object.assign(e, attrs); document.head.appendChild(e); return e }
    const tc = add('meta', { name: 'theme-color', content: '#2d0b4a' }), rb = add('meta', { name: 'robots', content: 'noindex,nofollow' }), rf = add('meta', { name: 'referrer', content: 'strict-origin-when-cross-origin' })
    const mf = document.querySelector('link[rel="manifest"]'), oldMf = mf?.getAttribute('href'), m2 = mf || add('link', { rel: 'manifest' })
    m2.setAttribute('href', '/rider.webmanifest')
    supabase?.auth.getSession().then(({ data }) => setUser(toUserObj(data?.session?.user))).catch(() => setUser(null))
    const off = onAuthChange((u, ev) => {
      if (ev === 'SIGNED_OUT') { dropDraft(); setUser(null); setRider(undefined) }
      else if (u && !lock.current) {
        if (uidRef.current && uidRef.current !== u.id) setRider(undefined) // another account: never show the previous rider's jobs
        setUser(u)
      }
    })
    return () => { off(); tc.remove(); rb.remove(); rf.remove(); if (mf && oldMf) mf.setAttribute('href', oldMf); else if (!mf) m2.remove() }
  }, [])
  const loadMe = useCallback(async () => { if (!user) return; setErr(''); try { setRider(await getMe(user.id)) } catch (x) { setErr(msg(x)); setRider(null) } }, [user])
  useEffect(() => { if (user) loadMe() }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const logout = useCallback(async () => {
    try { if (rider?.status === 'approved') await setDuty(false) } catch { /* best effort */ }
    await signOut(); dropDraft(); setUser(null); setRider(undefined)
  }, [rider])

  if (FRAMED) return <div className="rx"><div className="rx-page narrow"><div className="rx-err">For your safety, Pinkish Rider only opens in its own window. <a href="/rider" target="_top" rel="noopener">Open Pinkish Rider</a></div></div></div>
  if (!supabase) return <div className="rx"><div className="rx-page narrow"><div className="rx-err">The app is not configured.</div></div></div>
  let body
  if (user === undefined || (user && rider === undefined)) body = <div className="rx-page narrow center-v"><div className="rx-spin" aria-label="Loading" /></div>
  else if (!user) body = <Auth onUser={setUser} lock={lock} />
  else if (err && !rider) body = <div className="rx-page narrow center-v"><div className="rx-card center"><p>{err}</p><button className="rx-btn" onClick={loadMe}>Try again</button><button className="rx-link" onClick={logout}>Log out</button></div></div>
  else if (!rider || rider.status === 'rejected') body = <Apply user={user} rider={rider} onDone={setRider} logout={logout} />
  else if (rider.status !== 'approved') body = <Waiting rider={rider} onRefresh={loadMe} logout={logout} />
  else body = <RiderApp key={user.id} user={user} logout={logout} />
  return <div className="rx">{body}</div>
}
