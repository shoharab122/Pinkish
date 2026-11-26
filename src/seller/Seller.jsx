import React, { memo, useEffect, useState, useCallback, useMemo, useRef, useDeferredValue } from 'react'
import './seller.css'
import { signIn, signUp, signOut, onAuthChange, resetPassword, signInWithGoogle, supabase, dealLive, getFollowerCount, productUrl } from '../api.js'
import { LiveMap, PinPicker, usePoll } from '../lib/LiveMap.jsx'
import { HUB, RIDER_KM, okLL, kmFromHub, havKm, kmTxt, etaMin, seenAgo, fresh, safeUrl } from '../lib/zone.js'
import { getMyShop, createShop, resubmitShop, updateShop, removeCover, getCategoriesList, myProducts, saveProduct, deleteProduct, sellerOrders, validPhone, validNid, PHOTOS, existingImages, sellerQuestions, answerQuestion, preparePhoto, sellerReturns, respondReturn, hasContact, setStock, sellerHandovers, markPacked, confirmPickup, getSellerOps, productStats, OPS0, telHref, setShopLocation, riderLocation, sellerExtras, courierHanded, myCoupons, saveCoupon, setCouponActive, deleteCoupon } from './sellerApi.js'

const taka = n => '৳' + Number(n || 0).toLocaleString('en-BD')
const when = d => { try { return new Date(d).toLocaleString('en-BD', { dateStyle: 'medium', timeStyle: 'short' }) } catch { return '' } }
const msg = e => e?.message || 'Something went wrong. Please try again.'
const ago = d => { const m = Math.max(0, Math.round((Date.now() - new Date(d)) / 6e4)); return m < 1 ? 'just now' : m < 60 ? m + 'm ago' : m < 1440 ? Math.floor(m / 60) + 'h ago' : Math.floor(m / 1440) + 'd ago' }
const dur = ms => { const m = Math.round(Math.abs(ms) / 6e4); return m < 60 ? m + 'm' : m < 1440 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : Math.floor(m / 1440) + 'd ' + Math.floor((m % 1440) / 60) + 'h' }
const CONTACT_WARN = 'Phone numbers, WhatsApp and links are not allowed. Customers order and pay through Pinkish.'
const okEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim())
const strength = p => (p.length >= 8) + (/[a-z]/.test(p) && /[A-Z]/.test(p)) + /\d/.test(p) + (/[^A-Za-z0-9]/.test(p) || p.length >= 12)
const toLocalInput = x => { const d = new Date(x); if (isNaN(d)) return ''; d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16) }
// In-memory cache: switching tabs shows the last data instantly, then refreshes quietly in the background.
const MEM = {}, PCACHE = {}, CCACHE = { v: null }
const wipe = () => { Object.keys(MEM).forEach(k => delete MEM[k]); Object.keys(PCACHE).forEach(k => delete PCACHE[k]); CCACHE.v = null }
const DRAFT = 'sl_draft'
// The sign-up draft (shop name, phone, address) survives an email confirmation, but expires after 7 days
// and is deleted on log-out, so personal details never sit on a shared phone.
const readDraft = () => { try { const d = JSON.parse(localStorage.getItem(DRAFT)) || {}; if (!d.t || Date.now() - d.t > 7 * 864e5) { localStorage.removeItem(DRAFT); return {} } return d } catch { return {} } }
const saveDraft = d => { try { localStorage.setItem(DRAFT, JSON.stringify({ ...d, t: Date.now() })) } catch { /* storage unavailable */ } }
const clearDraft = () => { try { localStorage.removeItem(DRAFT) } catch { /* storage unavailable */ } }
const IC = {
  overview: <><path d="M3 3v18h18" /><path d="M8 17v-5M13 17V8M18 17v-9" /></>,
  box: <><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" /><path d="M9 8h6M9 12h6" /></>,
  store: <><path d="M4 9l1.5-5h13L20 9" /><path d="M4 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 6 0 2.5 2.5 0 0 0 5 0" /><path d="M5 12v8h14v-8" /><path d="M10 20v-5h4v5" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
  cart: <><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.5 12h11l2-8H6" /></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.7 2.7L16 9.5" /></>,
  alert: <><path d="M12 3l10 18H2L12 3z" /><path d="M12 10v5M12 18h.01" /></>,
  pin: <><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  truck: <><path d="M2 6h11v10H2z" /><path d="M13 9h4.5L21 12.5V16h-8" /><circle cx="6.5" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="3" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  shield: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /><path d="M8.5 12l2.5 2.5L15.5 10" /></>,
  id: <><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="11" r="2" /><path d="M6 16c.6-1.6 1.8-2.4 3-2.4s2.4.8 3 2.4M14.5 10h4M14.5 13.5h3" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 7l9 6 9-6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  ban: <><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>,
  sparkle: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" /><path d="M19 17v4M17 19h4" /></>,
  bag: <><path d="M5 8h14l-1 12H6L5 8z" /><path d="M9 8V7a3 3 0 0 1 6 0v1" /></>,
  out: <><path d="M9 4H5v16h4" /><path d="M16 8l4 4-4 4M20 12H9" /></>,
  ret: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
  chat: <><path d="M20.5 11.5a8.4 8.4 0 0 1-12.2 7.5L3.5 20.5 5 16A8.4 8.4 0 1 1 20.5 11.5z" /></>,
  pkg: <><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M7.5 5.5l9 5" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3M14 9l2 2" /></>,
  share: <><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></>,
  print: <><path d="M7 9V3h10v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 14h10v7H7z" /></>,
  heart: <path d="M12 20.5s-7.8-4.7-9.6-9.7C1.2 7.4 3.1 4.2 6.4 4.2c2 0 3.5 1 5.6 3 2.1-2 3.6-3 5.6-3 3.3 0 5.2 3.2 4 6.6-1.8 5-9.6 9.7-9.6 9.7z" />,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.7-3.6 3.3-5.5 6.5-5.5s5.8 1.9 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.7.8 2.7 2.5 3 5.2" /></>,
  wallet: <><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a1 1 0 0 1 1 1v2" /><path d="M3 7.5V17a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5.5A2.5 2.5 0 0 1 3 7.5z" /><circle cx="16.5" cy="13.5" r="1.2" /></>,
  bolt: <path d="M13.5 2 5 13.5h6L10 22l9-12h-6.2z" />,
  dl: <><path d="M12 4v11M7 10l5 5 5-5" /><path d="M4 19h16" /></>,
  chev: <path d="M9 6l6 6-6 6" />,
  phone: <path d="M5 4h3.5l1.7 4.3-2.2 1.4a11 11 0 0 0 6.3 6.3l1.4-2.2L20 15.5V19a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  tag: <><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" /><circle cx="8" cy="8" r="1.5" /></>,
}
const Ico = ({ n, s = 20 }) => <svg className="ico" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{IC[n]}</svg>
const STEP = ['Create account', 'Shop details', 'Verification', 'Start selling']
function Steps({ at }) {
  return <ol className="sl-steps" aria-label="Progress">{STEP.map((s, i) => <li key={s} className={i < at ? 'dn' : i === at ? 'on' : ''}><i>{i < at ? '✓' : i + 1}</i><span>{s}</span></li>)}</ol>
}

function useOnline() {
  const [on, setOn] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false)
  useEffect(() => { const a = () => setOn(true), b = () => setOn(false); addEventListener('online', a); addEventListener('offline', b); return () => { removeEventListener('online', a); removeEventListener('offline', b) } }, [])
  return on
}
function useObjectUrl(file) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  return url
}
const Field = ({ label, children }) => <label className="sl-f"><span>{label}</span>{children}</label>
const Inp = ({ label, value, onChange, ...r }) => <Field label={label}><input value={value ?? ''} onChange={e => onChange(e.target.value)} {...r} /></Field>

function Auth({ onUser, lock }) {
  const [mode, setMode] = useState('in'), [step, setStep] = useState(1)
  const [f, setF] = useState({ shop: '', name: '', phone: '', email: '', password: '', confirm: '', address: '', city: '', nid: '' })
  const [doc, setDoc] = useState(null), [show, setShow] = useState(false), [err, setErr] = useState(''), [info, setInfo] = useState(''), [done, setDone] = useState(null), [busy, setBusy] = useState(false), [cool, setCool] = useState(0), [ex, setEx] = useState(false)
  useEffect(() => { if (cool <= 0) return; const t = setTimeout(() => setCool(c => c - 1), 1000); return () => clearTimeout(t) }, [cool])
  const set = k => v => setF(p => ({ ...p, [k]: v }))
  const sw = m => { setMode(m); setStep(1); setErr(''); setInfo(''); setDone(null); setShow(false); setEx(false) }
  const go = async e => {
    e.preventDefault(); setErr(''); setInfo(''); setEx(false)
    try {
      const email = f.email.trim().toLowerCase()
      if (mode === 'up' && step === 1) {
        if (f.name.trim().length < 2) throw new Error('Enter your full name.')
        if (!validPhone(f.phone)) throw new Error('Enter a valid Bangladeshi mobile number, like 01712345678.')
        if (!okEmail(email)) throw new Error('Enter a valid email address.')
        if (f.password.length < 8 || !/\d/.test(f.password) || !/[A-Za-z]/.test(f.password)) throw new Error('Password needs at least 8 characters with letters and numbers.')
        if (f.password !== f.confirm) throw new Error('Passwords do not match. Type the same password in both boxes.')
        return setStep(2)
      }
      if (!okEmail(email)) throw new Error('Enter a valid email address.')
      setBusy(true); lock.current = mode === 'up'
      if (mode === 'forgot') { await resetPassword(email); setInfo('We sent a password reset link to ' + email + '. Check your inbox.') }
      else if (mode === 'up') {
        if (f.shop.trim().length < 3) throw new Error('Enter your shop name (at least 3 characters).')
        if (f.address.trim().length < 8) throw new Error('Enter your full business address.')
        if (!validNid(f.nid.replace(/[\s-]/g, ''))) throw new Error('Enter your NID number (10, 13 or 17 digits).')
        if (!doc) throw new Error('Add a clear photo of your NID.')
        const phone = f.phone.replace(/[\s-]/g, '')
        const draft = { name: f.shop.trim(), phone, address: f.address.trim(), city: f.city.trim() }
        saveDraft(draft) // keep the shop details even if sign-up is delayed or interrupted
        let u
        try { u = await signUp({ name: f.name.trim(), phone, email, password: f.password, redirectTo: location.origin + '/merchant' }) } catch (x) {
          if (x.code !== 'email_limit' && x.code !== 'exists') throw x
          // Email limit hit, or this email already has an account (e.g. a customer account): log in with the password they typed and carry on to create the shop.
          try { u = await signIn(email, f.password) } catch (y) {
            if (/confirm your email/i.test(msg(y))) throw new Error('Your account already exists but the email is not confirmed yet. Open the confirmation link we sent you, then log in here.')
            if (x.code === 'exists') { setEx(true); throw new Error('This email already has a Pinkish account, but the password you typed is not its password. Go back, type that account\'s password, or reset it.') }
            throw x
          }
        }
        if (u?.needsConfirm) setDone(email)
        else {
          // signed in already: create the shop and upload the NID right now
          try { await createShop(u.id, { ...draft, description: '', nid: f.nid }, doc); clearDraft() } catch { /* the shop form opens pre-filled so they can retry */ }
          onUser(u)
        }
      } else onUser(await signIn(email, f.password))
    } catch (x) {
      const m = msg(x)
      if (/too many attempts|rate limit/i.test(m)) { setCool(60); setErr('Too many sign-up emails were requested. Wait a minute and try again. If you already signed up, check your inbox for the confirmation link, then log in.') } else setErr(m)
    }
    lock.current = false; setBusy(false)
  }
  const google = async () => { setErr(''); try { try { sessionStorage.setItem('pk_seller', '1') } catch { /* storage unavailable */ } await signInWithGoogle(location.origin + '/merchant') } catch (x) { setErr(msg(x)) } }
  const sc = strength(f.password)
  const pw = (label, auto, k = 'password') => <Field label={label}><span className="sa-pw"><input type={show ? 'text' : 'password'} autoComplete={auto} value={f[k]} onChange={e => set(k)(e.target.value)} required /><button type="button" onClick={() => setShow(s => !s)}>{show ? 'Hide' : 'Show'}</button></span></Field>
  const up1 = mode === 'up' && step === 1, up2 = mode === 'up' && step === 2
  return (
    <div className="sa">
      <aside className="sa-hero">
        <div className="sa-brand"><span className="sa-lg"><img className="bmk" src="/logo-mark.webp?v=2" width="30" height="30" alt="" decoding="async" /></span>Pinkish <span>Seller Centre</span></div>
        <h1>Grow your business on Pinkish</h1>
        <p>Open your shop, list your products and reach customers across Bangladesh.</p>
        <ul>
          <li><i><Ico n="shield" s={22} /></i><span><b>A verified marketplace</b>Every shop is checked, so customers trust you.</span></li>
          <li><i><Ico n="box" s={22} /></i><span><b>List in minutes</b>Add photos, prices and stock from your phone.</span></li>
          <li><i><Ico n="receipt" s={22} /></i><span><b>Sell, we deliver</b>Track every sale. Pinkish handles packing and delivery.</span></li>
        </ul>
      </aside>
      <main className="sa-main"><div className="sa-card">
        {done ? <div className="sa-done">
          <div className="sa-ic"><Ico n="mail" s={44} /></div><h2>Check your email</h2>
          <p className="sl-mut">We sent a confirmation link to <b>{done}</b>. Open it, then log in. After you log in, we will ask you to attach your NID photo once more and your shop application will be sent to our team for verification.</p>
          <button className="sl-btn" style={{ width: '100%' }} onClick={() => sw('in')}>Go to login</button>
        </div> : <>
          <div className="sa-tabs" role="tablist"><button role="tab" aria-selected={mode !== 'up'} className={mode !== 'up' ? 'on' : ''} onClick={() => sw('in')}>Log in</button><button role="tab" aria-selected={mode === 'up'} className={mode === 'up' ? 'on' : ''} onClick={() => sw('up')}>Open a shop</button></div>
          <h2>{mode === 'in' ? 'Welcome back' : up1 ? 'Create your seller account' : up2 ? 'Your shop and NID' : 'Reset your password'}</h2>
          <p className="sl-mut">{mode === 'in' ? 'Log in with your email and password.' : up1 ? 'Choose your own email and password. You will use them to log in after we verify your shop.' : up2 ? 'We check your NID before your shop goes live. It is stored privately and only our verification team can see it.' : 'Enter your email and we will send you a reset link.'}</p>
          {err && <div className="sl-err" role="alert">{err}</div>}
          {ex && <div className="sl-acts" style={{ margin: '-4px 0 12px' }}><button type="button" className="sl-btn ghost sm" onClick={() => { setEx(false); setErr(''); setStep(1) }}>← Retype password</button><button type="button" className="sl-btn ghost sm" onClick={google}>Continue with Google</button><button type="button" className="sl-btn ghost sm" onClick={() => sw('forgot')}>Reset password</button><button type="button" className="sl-btn ghost sm" onClick={() => { setEx(false); setErr(''); set('email')(''); set('password')(''); set('confirm')(''); setStep(1) }}>Use another email</button></div>}{info && <div className="sl-ok">{info}</div>}
          <form onSubmit={go}>
            {up1 && <div className="sl-row"><Inp label="Your full name" value={f.name} onChange={set('name')} maxLength={80} autoComplete="name" required /><Inp label="Mobile number" type="tel" inputMode="numeric" value={f.phone} onChange={set('phone')} placeholder="01XXXXXXXXX" autoComplete="tel" required /></div>}
            {!up2 && <Inp label="Email" type="email" inputMode="email" autoComplete="email" value={f.email} onChange={set('email')} placeholder="you@example.com" required />}
            {(mode === 'in' || up1) && pw('Password', mode === 'in' ? 'current-password' : 'new-password')}
            {up1 && f.password && <div className={'sa-str s' + sc} aria-hidden="true"><i /><i /><i /><i /><small>{['Too short', 'Weak', 'Okay', 'Good', 'Strong'][sc]}</small></div>}
            {up1 && pw('Confirm password', 'new-password', 'confirm')}
            {up1 && f.confirm && <p className={'sa-match ' + (f.confirm === f.password ? 'ok' : 'no')} role="status">{f.confirm === f.password ? '✓ Passwords match' : 'Passwords do not match yet'}</p>}
            {up2 && <>
              <Inp label="Shop name" value={f.shop} onChange={set('shop')} maxLength={60} autoComplete="organization" required />
              <div className="sl-row"><Inp label="Business address" value={f.address} onChange={set('address')} maxLength={300} autoComplete="street-address" required /><Inp label="City" value={f.city} onChange={set('city')} placeholder="Chattogram" /></div>
              <Inp label="NID number" inputMode="numeric" value={f.nid} onChange={set('nid')} placeholder="10, 13 or 17 digits" maxLength={21} required />
              <Field label="NID photo"><span className={'sa-file' + (doc ? ' has' : '')}><input type="file" title={doc ? doc.name : 'Choose your NID photo'} accept="image/*,application/pdf" onChange={e => setDoc(e.target.files?.[0] || null)} /><i><Ico n={doc ? 'check' : 'id'} s={28} /></i><span><b>{doc ? doc.name : 'Tap to add your NID photo'}</b><small>{doc ? 'Tap to change it' : 'Clear photo of the front. Any photo or PDF'}</small></span></span></Field>
            </>}
            <button className="sl-btn sa-go" disabled={busy || cool > 0}>{cool > 0 ? 'Try again in ' + cool + 's' : busy ? 'Please wait…' : mode === 'in' ? 'Log in' : up1 ? 'Continue' : up2 ? 'Create seller account' : 'Send reset link'}</button>
            {up2 && <button type="button" className="sa-back" onClick={() => { setErr(''); setStep(1) }}>← Back</button>}
          </form>
          {(mode === 'in' || up1) && <>
            <div className="sa-or"><span>or</span></div>
            <button type="button" className="sl-btn ghost sa-google" onClick={google}><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.5-4.1 7-10.2 7-17.6z" /><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.3.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" /></svg>Continue with Google</button>
            {up1 && <p className="sl-mut" style={{ textAlign: 'center', margin: '8px 0 0', fontSize: 12.5 }}>Already shop on Pinkish with your Gmail? Continue with Google, then add your shop details.</p>}
          </>}
          <p className="sa-alt">{mode === 'in' && <a href="#" onClick={e => { e.preventDefault(); sw('forgot') }}>Forgot your password?</a>}{mode === 'forgot' && <a href="#" onClick={e => { e.preventDefault(); sw('in') }}>Back to login</a>}</p>
          {mode === 'up' && <Steps at={step - 1} />}
        </>}
      </div></main>
    </div>
  )
}

function ShopForm({ user, shop, onDone }) {
  const draft = readDraft()
  const [f, setF] = useState({ name: shop?.name || draft.name || '', description: shop?.description || '', phone: shop?.phone || draft.phone || user.mobile || '', address: shop?.address || draft.address || '', city: shop?.city || draft.city || '', nid: shop?.nid_number || '' })
  const [doc, setDoc] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const set = k => v => setF(p => ({ ...p, [k]: v }))
  const go = async e => {
    e.preventDefault(); setErr('')
    if (!validPhone(f.phone)) return setErr('Enter a valid Bangladeshi mobile number, like 01712345678.')
    if (!shop && !validNid(String(f.nid).replace(/[\s-]/g, ''))) return setErr('Enter your NID number (10, 13 or 17 digits).')
    if (!shop && !doc) return setErr('Add a clear photo of your NID for verification.')
    setBusy(true)
    try { const r = shop ? await resubmitShop(user.id, shop, f, doc) : await createShop(user.id, f, doc); clearDraft(); onDone(r) } catch (x) { setErr(msg(x)) }
    setBusy(false)
  }
  return (
    <div className="sl-wrap"><div style={{ maxWidth: 600, margin: '0 auto' }}><Steps at={1} />
      <div className="sl-card sl-vf">
        <div className="sl-vf-h">
          <span className="sl-vf-ic" aria-hidden="true"><Ico n="store" s={26} /></span>
          <div><h1>{shop ? 'Fix and resubmit your shop' : 'Open your shop'}</h1><p className="sl-mut">{shop ? 'Update what we asked for and send it again.' : 'Tell us about your shop and verify yourself. Our team reviews it in 1–2 working days.'}</p></div>
        </div>
        {user?.email && <div className="sl-vf-who">Signed in as <b>{user.email}</b></div>}
        {shop?.status === 'rejected' && <div className="sl-err"><b>Not approved:</b> {shop.reject_reason || 'Please check your details and documents.'}</div>}
        {err && <div className="sl-err" role="alert">{err}</div>}
        <form onSubmit={go}>
          <h3 className="sl-sec">Shop details</h3>
          <Inp label="Shop name" value={f.name} onChange={set('name')} maxLength={60} autoComplete="organization" required />
          <Field label="About your shop (optional)"><textarea rows={3} value={f.description} onChange={e => set('description')(e.target.value)} maxLength={500} placeholder="What do you sell?" /></Field>
          <div className="sl-row">
            <Inp label="Business phone" type="tel" inputMode="numeric" value={f.phone} onChange={set('phone')} placeholder="01XXXXXXXXX" autoComplete="tel" required />
            <Inp label="City" value={f.city} onChange={set('city')} placeholder="Chattogram" />
          </div>
          <Inp label="Business / pickup address" value={f.address} onChange={set('address')} maxLength={300} autoComplete="street-address" required />
          <h3 className="sl-sec">Verify your identity</h3>
          <Inp label="NID number" inputMode="numeric" value={f.nid} onChange={set('nid')} placeholder="10, 13 or 17 digits" maxLength={21} required={!shop} />
          <Field label={shop ? 'New NID photo (optional)' : 'NID photo'}>
            <span className={'sa-file' + (doc ? ' has' : '')}><input type="file" title={doc ? doc.name : 'Choose your NID photo'} accept="image/*,application/pdf" onChange={e => setDoc(e.target.files?.[0] || null)} /><i><Ico n={doc ? 'check' : 'id'} s={28} /></i><span><b>{doc ? doc.name : 'Tap to add your NID photo'}</b><small>{doc ? 'Tap to change it' : 'Clear photo of the front. Any photo or PDF'}</small></span></span>
          </Field>
          <p className="sl-mut sl-vf-note"><Ico n="lock" s={15} /> Your NID is stored privately and only our verification team can see it. Once an admin approves your shop you can log in with this same account and add products.</p>
          <button className="sl-btn sa-go" disabled={busy}>{busy ? 'Submitting…' : shop ? 'Resubmit for review' : 'Send for verification'}</button>
        </form>
      </div>
    </div></div>
  )
}

function Waiting({ shop, onRefresh }) {
  useEffect(() => { if (shop.status !== 'pending') return; const t = setInterval(() => { if (!document.hidden) onRefresh() }, 15000); return () => clearInterval(t) }, [shop.status, onRefresh])
  const sus = shop.status === 'suspended'
  return (
    <div className="sl-wrap"><div style={{ maxWidth: 520, margin: '20px auto 0' }}><Steps at={2} /></div><div className="sl-card" style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center' }}>
      <div className={'sl-state' + (sus ? ' bad' : '')}><Ico n={sus ? 'ban' : 'clock'} s={34} /></div>
      <h1>{sus ? 'Shop suspended' : 'Application submitted'}</h1>
      <p><b>{shop.name}</b> <span className={'sl-badge ' + shop.status}>{sus ? 'suspended' : 'pending review'}</span></p>
      <p className="sl-mut">{sus ? 'Your shop is currently not visible. Contact support for details.' : 'Our team is checking your details and NID. This usually takes 1–2 working days. This page updates by itself, and you can log in any time with your email and password to check.'}</p>
      {!sus && <ol className="sl-tl"><li className="dn"><i>✓</i><span>Application sent{shop.created_at ? <small>{when(shop.created_at)}</small> : null}</span></li><li className="on"><i>2</i><span>Admin verification<small>In progress</small></span></li><li><i>3</i><span>Start selling<small>Add products once verified</small></span></li></ol>}
      <div className="sl-sum">
        <div><span>Phone</span><b>{shop.phone}</b></div>
        <div><span>City</span><b>{shop.city || '—'}</b></div>
        <div><span>Address</span><b>{shop.address}</b></div>
        <div><span>NID</span><b>{shop.id_doc_path ? 'Uploaded ✓' : 'Missing'}</b></div>
      </div>
      <button className="sl-btn ghost" onClick={onRefresh}>Check status</button>
    </div></div>
  )
}

function PhotoSlot({ n, file, saved, onPick }) {
  const url = useObjectUrl(file), src = url || saved
  return (
    <label className={'sl-ph' + (src ? ' has' : '')} title={`Photo ${n}`}>
      {src ? <img src={src} alt={`Product photo ${n}`} /> : <span className="sl-ph-add"><b>+</b><small>Photo {n}</small></span>}
      {n === 1 && <em className="sl-ph-tag">Cover</em>}
      <input type="file" accept="image/*" aria-label={`Product photo ${n}`} onChange={e => { onPick(e.target.files?.[0] || null); e.target.value = '' }} />
    </label>
  )
}

function ProductForm({ shop, cats, product, copy, onSaved, onCancel }) {
  const src = product || copy
  const [f, setF] = useState({ name: copy ? copy.name + ' (copy)' : src?.name || '', brand: src?.brand || '', tag: src?.tag || '', category_id: src?.category_id || '', price: (dealLive(src) ? src.old_price : src?.price) ?? '', stock: copy ? '' : src?.stock ?? '', is_active: src?.is_active !== false, dealPrice: product && dealLive(product) ? product.price : '', dealEnds: product && dealLive(product) ? toLocalInput(product.deal_ends_at) : '' })
  const [files, setFiles] = useState(() => Array(PHOTOS).fill(null)), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [prep, setPrep] = useState(0)
  const pick = async (i, file) => {
    if (!file) return setFiles(a => a.map((x, k) => (k === i ? null : x)))
    setErr(''); setPrep(n => n + 1)
    try { const out = await preparePhoto(file); setFiles(a => a.map((x, k) => (k === i ? out : x))) } catch (x) { setErr(msg(x)) }
    setPrep(n => n - 1)
  }
  useEffect(() => {
    if (!busy && !prep) return
    const h = e => { e.preventDefault(); e.returnValue = '' }
    addEventListener('beforeunload', h); return () => removeEventListener('beforeunload', h)
  }, [busy, prep])
  const saved = useMemo(() => existingImages(src), [src])
  const filled = files.filter((f, i) => f || saved[i]).length
  const set = k => v => setF(p => ({ ...p, [k]: v }))
  const bad = hasContact(f.name) || hasContact(f.brand) || hasContact(f.tag)
  const go = async e => {
    e.preventDefault(); setErr('')
    if (prep) return setErr('Photos are still being prepared. Wait a second.')
    if (filled < PHOTOS) return setErr(`Add all ${PHOTOS} product photos (${filled}/${PHOTOS} added).`)
    if (bad) return setErr(CONTACT_WARN)
    setBusy(true)
    try { onSaved(await saveProduct(shop, f, files, product, copy)) } catch (x) { setErr(msg(x)) }
    setBusy(false)
  }
  return (
    <form className="sl-card sl-pform" onSubmit={go}>
      <div className="sl-head"><div><h2>{product ? 'Edit product' : copy ? 'Duplicate product' : 'Add product'}</h2><p className="sl-mut">{copy ? 'Photos and details are copied. Change what is different and save.' : 'Clear photos and a good name sell more.'}</p></div><button type="button" className="sl-btn ghost sm" onClick={onCancel}>Cancel</button></div>
      {err && <div className="sl-err" role="alert">{err}</div>}
      <div className="sl-f"><span>Product photos: add {PHOTOS} (any photo, resized automatically) · {filled}/{PHOTOS} added</span>
        <div className="sl-photos">{files.map((f, i) => <PhotoSlot key={i} n={i + 1} file={f} saved={saved[i]} onPick={nf => pick(i, nf)} />)}</div></div>
      <Inp label="Product name" value={f.name} onChange={set('name')} maxLength={120} required />
      {bad && <p className="sl-warn" role="alert"><Ico n="alert" s={15} />{CONTACT_WARN}</p>}
      <div className="sl-row">
        <Field label="Category"><select value={f.category_id} onChange={e => set('category_id')(e.target.value)} required><option value="">Select…</option>{cats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></Field>
        <Inp label="Brand" value={f.brand} onChange={set('brand')} maxLength={60} />
      </div>
      <div className="sl-row">
        <Inp label="Price (৳)" type="number" inputMode="decimal" min="1" step="0.01" value={f.price} onChange={set('price')} required />
        <Inp label="Stock" type="number" inputMode="numeric" min="0" step="1" value={f.stock} onChange={set('stock')} required />
      </div>
      <Inp label="Tag (optional, e.g. New, Best seller)" value={f.tag} onChange={set('tag')} maxLength={30} />
      <div className="sl-deal"><b><Ico n="bolt" s={16} /> Flash deal (optional)</b><p className="sl-mut">Set a lower price for a limited time. The regular price is shown crossed out and comes back automatically when the deal ends. Your followers are notified.</p>
        <div className="sl-row">
          <Inp label="Deal price (৳)" type="number" inputMode="decimal" min="1" step="0.01" value={f.dealPrice} onChange={set('dealPrice')} />
          <Inp label="Deal ends" type="datetime-local" value={f.dealEnds} onChange={set('dealEnds')} />
        </div>
        {+f.dealPrice > 0 && +f.price > +f.dealPrice && <p className="sl-dealtag">Customers save {taka(f.price - f.dealPrice)} ({Math.round((1 - f.dealPrice / f.price) * 100)}% off)</p>}
        {f.dealPrice !== '' && <button type="button" className="sl-btn ghost sm" onClick={() => setF(p => ({ ...p, dealPrice: '', dealEnds: '' }))}>Remove deal</button>}</div>
      <label className="sl-f"><input type="checkbox" checked={f.is_active} onChange={e => set('is_active')(e.target.checked)} /> Visible in the store</label>
      <div className="sl-acts sl-sticky"><button className="sl-btn" disabled={busy || prep > 0}>{busy ? 'Saving…' : prep ? 'Preparing photos…' : 'Save product'}</button><button type="button" className="sl-btn ghost" onClick={onCancel}>Cancel</button></div>
    </form>
  )
}

// quick restock: tap − / + and it saves by itself a moment later
function StockStep({ p, onSave }) {
  const [v, setV] = useState(p.stock ?? 0), t = useRef(0), pend = useRef(null), save = useRef(onSave)
  save.current = onSave
  useEffect(() => { if (pend.current == null) setV(p.stock ?? 0) }, [p.stock])
  useEffect(() => {
    if (v === (p.stock ?? 0)) { pend.current = null; return }
    pend.current = v
    clearTimeout(t.current); t.current = setTimeout(() => { pend.current = null; save.current(p, v) }, 700)
  }, [v]) // eslint-disable-line react-hooks/exhaustive-deps
  // leaving the page (tab switch, edit) saves straight away instead of dropping the change
  useEffect(() => () => { clearTimeout(t.current); if (pend.current != null) save.current(p, pend.current) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const low = v <= 5
  return <div className={'sl-step' + (low ? ' low' : '')} aria-label={'Stock for ' + p.name}>
    <button type="button" aria-label="One less" onClick={() => setV(x => Math.max(0, x - 1))}>−</button>
    <span><b>{v}</b><small>{v === 0 ? 'sold out' : low ? 'low stock' : 'in stock'}</small></span>
    <button type="button" aria-label="One more" onClick={() => setV(x => Math.min(100000, x + 1))}>+</button>
  </div>
}

const share = async (p, say) => {
  const url = productUrl(p); if (!url) return
  try { if (navigator.share) { await navigator.share({ title: p.name, text: `${p.name} · ${taka(p.price)} on Pinkish`, url }); return } } catch (e) { if (e?.name === 'AbortError') return }
  try { await navigator.clipboard.writeText(url); say('Product link copied. Share it to bring customers to your Pinkish page.') } catch { say(url) }
}
const PF = [['all', 'All'], ['live', 'Live'], ['hidden', 'Hidden'], ['low', 'Low stock'], ['deal', 'On deal']]
const PS = { new: ['Newest', (a, b) => new Date(b.created_at) - new Date(a.created_at)], sold: ['Best selling', null], stock: ['Lowest stock', (a, b) => (a.stock ?? 0) - (b.stock ?? 0)], price: ['Price', (a, b) => a.price - b.price] }
function Products({ shop, list, put, cats, reload, sold, saves, say }) {
  const [edit, setEdit] = useState(null), [err, setErr] = useState(''), [q, setQ] = useState(''), [pf, setPf] = useState('all'), [ps, setPs] = useState('new'), [lim, setLim] = useState(24)
  const dq = useDeferredValue(q)
  useEffect(() => { setLim(24) }, [dq, pf, ps])
  const del = async p => { if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return; try { await deleteProduct(shop, p.id); put(l => l.filter(x => x.id !== p.id)); say('Product deleted') } catch (x) { setErr(msg(x)) } }
  const toggle = async p => { try { const n = await saveProduct(shop, { ...p, price: p.price, stock: p.stock ?? 0, is_active: !(p.is_active !== false) }, null, p); put(l => l.map(x => x.id === p.id ? n : x)); say(n.is_active !== false ? 'Live in the store' : 'Hidden from the store') } catch (x) { setErr(msg(x)) } }
  const restock = useCallback(async (p, n) => { try { const r = await setStock(shop, p.id, n); put(l => l.map(x => x.id === p.id ? r : x)); say(`Stock saved: ${n}`) } catch (x) { setErr(msg(x)) } }, [shop, put, say])
  const saved = n => { put(l => (l.some(x => x.id === n.id) ? l.map(x => (x.id === n.id ? n : x)) : [n, ...l])); setEdit(null); setErr(''); say(n.is_active !== false ? 'Saved. It is live in the store now.' : 'Saved. It is hidden from the store.'); reload() }
  const cnt = useMemo(() => { const c = { all: 0, live: 0, hidden: 0, low: 0, deal: 0 }; (list || []).forEach(p => { c.all++; p.is_active !== false ? c.live++ : c.hidden++; if ((p.stock ?? 0) <= 5) c.low++; if (dealLive(p)) c.deal++ }); return c }, [list])
  const shown = useMemo(() => {
    const k = dq.trim().toLowerCase()
    const r = (list || []).filter(p => (pf === 'all' || (pf === 'live' ? p.is_active !== false : pf === 'hidden' ? p.is_active === false : pf === 'low' ? (p.stock ?? 0) <= 5 : dealLive(p))) && (!k || `${p.name} ${p.brand || ''} ${p.tag || ''}`.toLowerCase().includes(k)))
    return [...r].sort(ps === 'sold' ? (a, b) => (sold[b.name] || 0) - (sold[a.name] || 0) : PS[ps][1])
  }, [list, dq, pf, ps, sold])
  if (edit) return <ProductForm shop={shop} cats={cats} product={edit.p || null} copy={edit.copy || null} onCancel={() => setEdit(null)} onSaved={saved} />
  return (
    <>
      <div className="sl-stats">
        <div className="sl-stat"><span className="ic" aria-hidden="true"><Ico n="box" s={22} /></span><div><b>{list?.length ?? '–'}</b><span className="sl-mut">Products</span></div></div>
        <div className="sl-stat ok"><span className="ic" aria-hidden="true"><Ico n="check" s={22} /></span><div><b>{list ? cnt.live : '–'}</b><span className="sl-mut">Live</span></div></div>
        <div className="sl-stat warn" role="button" tabIndex={0} onClick={() => setPf('low')} onKeyDown={e => e.key === 'Enter' && setPf('low')}><span className="ic" aria-hidden="true"><Ico n="alert" s={22} /></span><div><b>{list ? cnt.low : '–'}</b><span className="sl-mut">Low stock</span></div></div>
      </div>
      {err && <div className="sl-err" role="alert">{err}</div>}
      <div className="sl-head"><div><h2>Your products</h2><p className="sl-mut">Tap − / + to restock. Changes go live straight away.</p></div><button className="sl-btn" onClick={() => setEdit({})}>+ Add product</button></div>
      {list?.length > 0 && <div className="sl-tools">
        <label className="sl-search"><Ico n="search" s={18} /><input type="search" inputMode="search" enterKeyHint="search" placeholder="Search your products" aria-label="Search products" value={q} onChange={e => setQ(e.target.value)} /></label>
        <select className="sl-sel" aria-label="Sort" value={ps} onChange={e => setPs(e.target.value)}>{Object.entries(PS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>}
      {list?.length > 0 && <div className="sl-seg" role="tablist" aria-label="Filter products">{PF.map(([k, l]) => <button key={k} role="tab" aria-selected={pf === k} className={pf === k ? 'on' : ''} onClick={() => setPf(k)}>{l}<em>{cnt[k]}</em></button>)}</div>}
      {list === null ? <div className="sl-grid">{[0, 1, 2].map(i => <div key={i} className="sl-skel" />)}</div> : !list.length ? <div className="sl-empty"><i><Ico n="bag" s={34} /></i><b>No products yet</b><p>Add your first product and it appears in the store instantly.</p><button className="sl-btn sm" onClick={() => setEdit({})}>+ Add product</button></div> : !shown.length ? <p className="sl-mut">No products match.</p> : (
        <><div className="sl-grid">{shown.slice(0, lim).map(p => (
          <div className={'sl-prod' + (p.is_active !== false ? '' : ' off')} key={p.id}>
            <div className="sl-pimg">
              {p.image_url ? <img src={p.image_url} alt="" width="400" height="300" loading="lazy" decoding="async" /> : <div className="sl-ph">{p.emoji || <Ico n="bag" s={40} />}</div>}
              <span className={'sl-badge ' + (p.is_active !== false ? 'approved' : 'pending')}>{p.is_active !== false ? 'Live' : 'Hidden'}</span>
              <button className="sl-pshare" aria-label={'Share ' + p.name} onClick={() => share(p, say)}><Ico n="share" s={16} /></button>
            </div>
            <div className="b"><div className="n">{p.name}</div>
              <div className="sl-price">{taka(p.price)}{dealLive(p) && <s className="sl-old">{taka(p.old_price)}</s>}</div>
              {dealLive(p) && <div className="sl-dealtag">⚡ Deal until {when(p.deal_ends_at)}</div>}
              <div className="sl-pm"><span><Ico n="cart" s={13} />{sold[p.name] || 0} sold</span>{saves[String(p.id)] > 0 && <span><Ico n="heart" s={13} />{saves[String(p.id)]} saved</span>}</div>
              <StockStep p={p} onSave={restock} />
              <div className="sl-acts">
                <button className="sl-btn ghost sm" onClick={() => setEdit({ p })}>Edit</button>
                <button className="sl-btn ghost sm" onClick={() => toggle(p)}>{p.is_active !== false ? 'Hide' : 'Show'}</button>
                <button className="sl-btn ghost sm" aria-label={'Duplicate ' + p.name} onClick={() => setEdit({ copy: p })}><Ico n="copy" s={15} /></button>
                <button className="sl-btn bad sm" aria-label={'Delete ' + p.name} onClick={() => del(p)}>Delete</button>
              </div></div>
          </div>))}</div>
        {shown.length > lim && <button className="sl-btn ghost" onClick={() => setLim(l => l + 24)}>Show more · {shown.length - lim} left</button>}</>
      )}
    </>
  )
}

function Questions({ rows, reload, say }) {
  const [err, setErr] = useState(''), [draft, setDraft] = useState({}), [busy, setBusy] = useState(''), [f, setF] = useState('open')
  const send = async q => {
    const a = (draft[q.id] || '').trim(); if (!a) return setErr('Write an answer first.')
    if (hasContact(a)) return setErr(CONTACT_WARN)
    setBusy(q.id); setErr('')
    try { await answerQuestion(q.id, a); setDraft(d => ({ ...d, [q.id]: '' })); say('Answer posted. The customer is notified.'); await reload() } catch (x) { setErr(msg(x)) }
    setBusy('')
  }
  if (rows === null) return <p className="sl-mut">Loading…</p>
  const open = rows.filter(q => !q.answer), list = f === 'open' ? open : rows.filter(q => q.answer)
  return (
    <>
      <div className="sl-head"><div><h2>Customer questions</h2><p className="sl-mut">{open.length ? `${open.length} waiting for your answer. Quick answers sell more. ` : 'You are all caught up. '}Answers are public on the product page.</p></div></div>
      <div className="sl-note"><span aria-hidden="true"><Ico n="shield" s={22} /></span><p><b>Answer here, never outside Pinkish.</b> Phone numbers, WhatsApp and links are blocked. Sharing them can get your shop suspended.</p></div>
      {err && <div className="sl-err" role="alert">{err}</div>}
      <div className="sl-seg" role="tablist" aria-label="Questions"><button role="tab" aria-selected={f === 'open'} className={f === 'open' ? 'on' : ''} onClick={() => setF('open')}>To answer<em>{open.length}</em></button><button role="tab" aria-selected={f === 'done'} className={f === 'done' ? 'on' : ''} onClick={() => setF('done')}>Answered<em>{rows.length - open.length}</em></button></div>
      {!list.length ? <div className="sl-empty"><i><Ico n="chat" s={34} /></i><b>{f === 'open' ? 'Nothing to answer' : 'No answers yet'}</b><p>When a customer asks about one of your products, it shows up here.</p></div> : list.map(q => {
        const d = draft[q.id] || '', bad = hasContact(d)
        return <div className={'sl-card sl-q' + (q.answer ? '' : ' need')} key={q.id}>
          <div className="sl-mut">{q.product_name} · {q.user_name || 'Customer'} · {ago(q.created_at)}</div>
          <p><b>Q:</b> {q.question}</p>
          {q.answer ? <p className="sl-a"><b>A:</b> {q.answer}</p> : <>
            <textarea rows={2} maxLength={600} placeholder="Write your answer…" value={d} onChange={e => setDraft(x => ({ ...x, [q.id]: e.target.value }))} aria-invalid={bad} className={bad ? 'bad' : ''} />
            {bad && <p className="sl-warn" role="alert"><Ico n="alert" s={15} />{CONTACT_WARN}</p>}
            <div className="sl-acts"><button className="sl-btn sm" disabled={busy === q.id || bad} onClick={() => send(q)}>{busy === q.id ? 'Sending…' : 'Send answer'}</button></div></>}
        </div>
      })}
    </>
  )
}

// Return requests on this seller's products. Only the seller's own items are shown, never the customer's details.
const RST = { requested: ['Requested', 'pending'], approved: ['Approved · pick-up', 'st2'], received: ['Received', 'st1'], completed: ['Completed', 'approved'], rejected: ['Rejected', 'rejected'] }
const RF = [['open', 'Open'], ['completed', 'Completed'], ['rejected', 'Rejected']]
const openRet = r => r.status === 'requested' || r.status === 'approved' || r.status === 'received'
const needsYou = r => (r.status === 'requested' || r.status === 'approved') && !r.seller_response
function Returns({ onCount }) {
  const [rows, setRows] = useState(() => MEM.returns ?? null), [err, setErr] = useState(''), [f, setF] = useState('open'), [note, setNote] = useState({}), [busy, setBusy] = useState(''), [ok, setOk] = useState(''), [edit, setEdit] = useState({})
  const load = useCallback(() => sellerReturns().then(r => { MEM.returns = r; setRows(r); onCount?.(r.filter(needsYou).length) }).catch(x => { setErr(msg(x)); setRows(p => p ?? []) }), [onCount])
  useEffect(() => { load() }, [load])
  const cnt = useMemo(() => { const c = { open: 0, completed: 0, rejected: 0 }; (rows || []).forEach(r => { openRet(r) ? c.open++ : c[r.status] !== undefined && c[r.status]++ }); return c }, [rows])
  const list = useMemo(() => (rows || []).filter(r => (f === 'open' ? openRet(r) : r.status === f)).sort((a, b) => needsYou(b) - needsYou(a)), [rows, f])
  const respond = async (r, response) => {
    const n = (note[r.id] || '').trim()
    if (response === 'dispute' && n.length < 5) return setErr('Tell Pinkish why you disagree (at least 5 characters).')
    setBusy(r.id); setErr(''); setOk('')
    try { await respondReturn(r.id, response, n); setOk(response === 'agree' ? 'Thanks. Pinkish will handle the pick-up and the refund.' : 'Sent. Pinkish will review your note before deciding.'); setEdit(e => ({ ...e, [r.id]: false })); await load() } catch (x) { setErr(msg(x)) }
    setBusy('')
  }
  if (rows === null) return <p className="sl-mut">Loading…</p>
  return (
    <>
      <div className="sl-note"><span aria-hidden="true"><Ico n="ret" s={22} /></span><p><b>Pinkish handles returns for you.</b> We collect the item and refund the customer. Tell us if you agree, or dispute with a short note, so we can decide fairly.</p></div>
      {err && <div className="sl-err" role="alert">{err}</div>}{ok && <div className="sl-ok" role="status">{ok}</div>}
      <div className="sl-seg" role="tablist" aria-label="Return status">{RF.map(([k, l]) => <button key={k} role="tab" aria-selected={f === k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l}<em>{cnt[k]}</em></button>)}</div>
      {!list.length ? <div className="sl-empty"><i><Ico n="ret" s={34} /></i><b>{f === 'open' ? 'No open returns' : 'Nothing here'}</b><p>{f === 'open' ? 'When a customer asks to return one of your products, it shows up here.' : 'Returns move here once Pinkish closes them.'}</p></div>
        : list.map(r => {
          const [lb, cls] = RST[r.status] || RST.requested, canAct = r.status === 'requested' || r.status === 'approved', showForm = canAct && (!r.seller_response || edit[r.id])
          return <div className={'sl-ord sl-ret ' + r.status + (needsYou(r) ? ' need' : '')} key={r.id}>
            <div className="h"><b>#{r.order_no}</b><span className="tot">{taka(r.amount)}</span></div>
            <div className="meta"><span className={'sl-badge ' + cls}>{lb}</span><span className="sl-badge st0">{r.kind === 'replace' ? 'Replacement' : 'Refund'}</span><span className="sl-mut">{when(r.created_at)}</span>{needsYou(r) && <span className="sl-need">Needs your response</span>}</div>
            <ul>{(r.items || []).map((i, k) => <li key={k}>{i.name}{i.variant && i.variant !== 'Standard' ? ` (${i.variant})` : ''} × {i.qty}</li>)}</ul>
            <div className="sl-why"><b>{r.reason}</b>{r.details && <p>{r.details}</p>}</div>
            {r.seller_response && !edit[r.id] && <div className={'sl-resp ' + r.seller_response}><b>{r.seller_response === 'agree' ? '✓ You agreed' : '⚑ You disputed'}</b>{r.seller_note && <p>{r.seller_note}</p>}{canAct && <button type="button" className="sl-btn ghost sm" onClick={() => setEdit(e => ({ ...e, [r.id]: true }))}>Change</button>}</div>}
            {r.admin_note && <div className="sl-resp admin"><b>Pinkish</b><p>{r.admin_note}</p></div>}
            {showForm && <div className="sl-rf">
              <textarea rows={2} maxLength={400} placeholder="Note for Pinkish (needed to dispute)" value={note[r.id] ?? r.seller_note ?? ''} onChange={e => setNote(n => ({ ...n, [r.id]: e.target.value }))} />
              <div className="sl-acts"><button className="sl-btn sm" disabled={busy === r.id} onClick={() => respond(r, 'agree')}>{busy === r.id ? 'Saving…' : 'Agree'}</button><button className="sl-btn bad sm" disabled={busy === r.id} onClick={() => respond(r, 'dispute')}>Dispute</button>{edit[r.id] && <button className="sl-btn ghost sm" onClick={() => setEdit(e => ({ ...e, [r.id]: false }))}>Cancel</button>}</div></div>}
          </div>
        })}
    </>
  )
}

// ---------------- Orders: pack → hand to the Pinkish rider → delivered ----------------
// Sellers never see the customer (no name, phone or address). They only see where to send the parcel.
const STG = { pack: ['To pack', 'st0'], ready: ['Ready for pickup', 'st1'], handed: ['With Pinkish', 'st2'], done: ['Delivered', 'approved'], cancel: ['Cancelled', 'rejected'] }
const OTABS = ['pack', 'ready', 'handed', 'done', 'cancel']
const stageOf = (o, h) => o.status === 4 || h?.status === 'cancelled' ? 'cancel' : o.status === 3 ? 'done' : (o.status || 0) >= 2 || h?.status === 'picked' || o.ship?.ship_status === 'handed' ? 'handed' : h?.status === 'packed' ? 'ready' : 'pack'
const earn = (o, ops) => Math.max(0, Number(o.subtotal || 0) - Number(o.shop_discount || 0)) * (1 - (Number(ops.commission) || 0) / 100)

// Where the seller sends the parcel: set by Pinkish in the admin (Merchants → Seller rules)
function SendTo({ ops, shop, compact, open }) {
  const drop = ops.mode === 'dropoff'
  return <div className={'sl-send' + (compact ? ' cmp' : '')}>
    <span className="ic" aria-hidden="true"><Ico n={drop ? 'store' : 'truck'} s={22} /></span>
    <div>
      <small>Where to send your products</small>
      <b>{drop ? 'Drop off at the Pinkish hub' : 'A Pinkish rider collects from you'}</b>
      <p>{drop ? (ops.hub_address || 'Pinkish will tell you the hub address.') : 'Pickup address: ' + (shop.address || 'your shop address')}{ops.hours ? ' · ' + ops.hours : ''}</p>
      {!compact && <details className="sl-hw" open={open}><summary>How handover works</summary><ol className="sl-how"><li>Pack the items and tap <b>Mark packed</b>.</li><li>{drop ? 'Bring the parcel to the hub.' : 'Wait for the Pinkish rider.'} Ask for the <b>4-digit pickup code</b>.</li><li>Enter the code. Only hand the parcel over if the code is accepted.</li></ol>
        <p className="sl-rule"><Ico n="truck" s={14} />Orders outside Chattogram: Pinkish may book <b>Pathao</b> to collect from you directly. The order then shows a consignment ID. Hand that parcel only to the Pathao rider and tap <b>Handed to Pathao</b>.</p>
        <p className="sl-rule"><Ico n="lock" s={14} />Never give a parcel to the customer or anyone else, and never sell outside Pinkish. Pinkish delivers every order.</p></details>}
    </div>
  </div>
}

function printSlip(o, shop) {
  const f = document.createElement('iframe')
  f.setAttribute('aria-hidden', 'true'); f.setAttribute('sandbox', 'allow-modals allow-same-origin')
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  document.body.appendChild(f)
  const w = f.contentWindow
  if (!w) { f.remove(); return false }
  setTimeout(() => f.remove(), 60000)
  const e = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  w.document.write(`<!doctype html><title>Packing slip #${e(o.order_no)}</title><style>body{font:14px/1.45 system-ui,sans-serif;margin:24px;color:#2a1a3a}h1{font-size:22px;margin:0}small{color:#777}.no{font:700 34px monospace;letter-spacing:2px;margin:10px 0;padding:10px;border:3px dashed #8e2a8c;text-align:center;border-radius:12px}table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:8px 4px;border-bottom:1px solid #eee}td:last-child{text-align:right;font-weight:700}.ft{margin-top:18px;padding:10px;border-radius:10px;background:#f6effa;font-size:12px}</style>
  <h1>Pinkish · packing slip</h1><small>${e(shop.name)} · ${e(when(o.created_at))}</small><div class="no">#${e(o.order_no)}</div>
  <table>${(o.lines || []).map(l => `<tr><td>☐ ${e(l.name)}${l.variant && l.variant !== 'Standard' ? ' (' + e(l.variant) + ')' : ''}</td><td>× ${e(l.qty)}</td></tr>`).join('')}</table>
  <div class="ft">Hand this parcel ONLY to a Pinkish rider who tells you the correct pickup code. Pinkish delivers to the customer.</div>`)
  w.document.close()
  setTimeout(() => { try { w.focus(); w.print() } catch { /* printing unavailable */ } }, 250)
  return true
}

// The Pinkish rider on the map while they come to collect this parcel (only when a rider-app job is on its way)
function RiderComing({ o, shop, on }) {
  const r = usePoll(() => riderLocation(o.id), 10000, on, [o.id])
  if (!r || !okLL(r.lat, r.lng)) return null
  const me = okLL(shop.lat, shop.lng), km = me ? havKm(+r.lat, +r.lng, +shop.lat, +shop.lng) : null
  const markers = [{ id: 'rider', kind: 'rider', lat: r.lat, lng: r.lng, label: (r.name || 'Rider') + ' · ' + seenAgo(r.seen) }, me && { id: 'shop', kind: 'shop', lat: shop.lat, lng: shop.lng, label: shop.name }].filter(Boolean)
  return <div className="sl-live"><LiveMap markers={markers} follow="rider" height={200} chip={{ text: `${r.name || 'Rider'} · ${km != null ? (km < 0.15 ? 'arriving now' : kmTxt(km) + ' away · ~' + etaMin(km) + ' min') : seenAgo(r.seen)}`, old: !fresh(r.seen, 2) }} />
    {!me && <p className="sl-mut">Set your pickup pin in Shop settings so riders find you faster.</p>}</div>
}

// Pinkish booked Pathao to collect this parcel straight from the shop. The seller never sees the customer.
function PathaoPickup({ o, x, stage, say, onHanded }) {
  const [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const done = x.ship_status === 'handed', url = safeUrl(x.tracking_url)
  const go = async () => {
    if (!confirm(`Did you hand order #${o.order_no} to the ${x.courier || 'Pathao'} rider? Only confirm after the parcel has left your shop.`)) return
    setBusy(true); setErr('')
    try { await courierHanded(o.id); say(`#${o.order_no} handed to ${x.courier || 'Pathao'} ✓`); onHanded() } catch (e) { setErr(msg(e)) }
    setBusy(false)
  }
  return <div className={'sl-ptao' + (done ? ' dn' : '')}>
    <div className="sl-ptao-h"><span className="ic"><Ico n="truck" s={18} /></span><span><small>{done ? 'Handed to courier' : `${x.courier || 'Pathao'} collects from your shop`}</small><b>{x.courier || 'Pathao'} · {x.consignment_id || 'booking…'}</b></span>{url && <a className="sl-btn ghost sm" href={url} target="_blank" rel="noopener noreferrer">Track</a>}</div>
    {!done && <ol className="sl-how"><li>Pack the parcel{stage === 'pack' ? ' and tap Mark packed' : ''}. Write <b>#{o.order_no}</b> and <b>{x.consignment_id}</b> on it.</li><li>Give it only to the {x.courier || 'Pathao'} rider who asks for this consignment ID.</li><li>Tap <b>Handed to {x.courier || 'Pathao'}</b>.</li></ol>}
    {x.note && <p className="sl-mut">Note from Pinkish: {x.note}</p>}
    {err && <div className="sl-err" role="alert">{err}</div>}
    {done ? <p className="sl-okline"><Ico n="check" s={16} />Handed {x.handed_at ? when(x.handed_at) : ''}. Pinkish tracks the delivery.</p>
      : <button type="button" className="sl-btn" disabled={busy || stage === 'pack'} onClick={go}><Ico n="truck" s={17} />{busy ? 'Saving…' : stage === 'pack' ? 'Mark packed first' : `Handed to ${x.courier || 'Pathao'}`}</button>}
  </div>
}

const SOrder = memo(function SOrder({ o, h, stage, ops, hoOn, img, shop, onPack, onConfirm, say, reload }) {
  const [tick, setTick] = useState(() => new Set()), [code, setCode] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const lines = o.lines || [], n = lines.reduce((t, l) => t + Number(l.qty || 0), 0)
  const due = new Date(o.created_at).getTime() + (Number(ops.pack_hours) || 24) * 36e5, left = due - Date.now()
  const all = lines.length > 0 && tick.size === lines.length
  const run = async fn => { setBusy(true); setErr(''); try { await fn() } catch (x) { setErr(msg(x)) } setBusy(false) }
  const [lb, cls] = STG[stage]
  return <article className={'sl-ord so-' + stage + (stage === 'pack' && left < 0 ? ' late' : '')}>
    <div className="h"><b>#{o.order_no}</b><span className="tot">{taka(o.subtotal)}</span></div>
    <div className="meta"><span className={'sl-badge ' + cls}>{lb}</span><span className="sl-mut">{ago(o.created_at)} · {n} item{n === 1 ? '' : 's'}</span>
      {stage === 'pack' && <span className={'sl-due' + (left < 0 ? ' late' : left < 3 * 36e5 ? ' soon' : '')}><Ico n="clock" s={13} />{left < 0 ? 'Late by ' + dur(left) : 'Pack within ' + dur(left)}</span>}</div>
    <ul className="sl-lines">{lines.map((l, i) => {
      const on = tick.has(i), src = l.image_url || img[l.name]
      return <li key={i}>{stage === 'pack' && hoOn ? <label className={'sl-tick' + (on ? ' on' : '')}><input type="checkbox" checked={on} onChange={() => setTick(s => { const x = new Set(s); x.has(i) ? x.delete(i) : x.add(i); return x })} /><i aria-hidden="true">{on ? '✓' : ''}</i></label> : null}
        <span className="sl-lth">{src ? <img src={src} alt="" loading="lazy" decoding="async" /> : <Ico n="bag" s={18} />}</span>
        <span className="sl-lt"><b>{l.name}</b>{l.variant && l.variant !== 'Standard' ? <small>{l.variant}</small> : null}</span><em>× {l.qty}</em></li>
    })}</ul>
    {+o.shop_discount > 0 && <p className="sl-cpl"><Ico n="tag" s={14} />Your shop coupon: −{taka(o.shop_discount)} on this order</p>}
    {err && <div className="sl-err" role="alert">{err}</div>}
    {o.ship?.consignment_id && (stage === 'pack' || stage === 'ready') && <PathaoPickup o={o} x={o.ship} stage={stage} say={say} onHanded={reload} />}
    {stage === 'pack' && <div className="sl-oact">
      {hoOn ? <button className="sl-btn" disabled={busy} onClick={() => { if (!all && !confirm('Not every item is ticked. Mark the parcel packed anyway?')) return; run(async () => { await onPack(o, true); say(`#${o.order_no} is packed. ${ops.mode === 'dropoff' ? 'Bring it to the hub.' : 'A rider will collect it.'}`) }) }}><Ico n="pkg" s={18} />{busy ? 'Saving…' : 'Mark packed & ready'}</button>
        : <p className="sl-mut">Pack it now. Pinkish will collect it and update the status.</p>}
      <button className="sl-btn ghost sm" onClick={() => { if (!printSlip(o, shop)) say('Printing is not available on this device.') }}><Ico n="print" s={15} />Packing slip</button>
    </div>}
    {stage === 'ready' && !o.ship?.consignment_id && <div className="sl-hand">
      <RiderComing o={o} shop={shop} on={hoOn && ops.mode !== 'dropoff'} />
      {h?.rider_name ? <div className="sl-rider"><span className="ic"><Ico n="truck" s={18} /></span><span><small>Pinkish rider</small><b>{h.rider_name}</b></span>{telHref(h.rider_phone) && <a className="sl-btn ghost sm" href={telHref(h.rider_phone)}><Ico n="phone" s={15} />Call rider</a>}</div>
        : <p className="sl-mut"><Ico n="clock" s={14} /> {ops.mode === 'dropoff' ? 'Bring the parcel to the hub. Staff there will give you the code.' : 'Pinkish is assigning a rider. You will get a notification.'}</p>}
      <form className="sl-code" onSubmit={e => { e.preventDefault(); run(async () => { await onConfirm(o, code); setCode(''); say(`#${o.order_no} handed to Pinkish ✓`) }) }}>
        <label><span>Pickup code from the rider</span><input inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" maxLength={4} placeholder="••••" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))} aria-label="4-digit pickup code" /></label>
        <button className="sl-btn" disabled={busy || code.length !== 4}><Ico n="key" s={17} />{busy ? 'Checking…' : 'Confirm handover'}</button>
      </form>
      <button type="button" className="sa-back" disabled={busy} onClick={() => run(() => onPack(o, false))}>Not packed yet? Undo</button>
    </div>}
    {stage === 'handed' && <p className="sl-okline"><Ico n="check" s={16} />{o.ship?.ship_status === 'handed' ? `Handed to ${o.ship.courier || 'Pathao'} · ${o.ship.consignment_id}` : 'Handed to Pinkish'}{(o.ship?.handed_at || h?.picked_at) ? ' · ' + when(o.ship?.handed_at || h.picked_at) : ''}. We are delivering it.</p>}
    {stage === 'done' && <p className="sl-okline"><Ico n="wallet" s={16} />Delivered · your payout {taka(earn(o, ops))}</p>}
    {stage === 'cancel' && <p className="sl-mut">This order was cancelled. If you already packed it, keep the items in stock.</p>}
  </article>
})

function Orders({ orders, ho, hoOn, ops, shop, img, reload, say, err }) {
  const [t, setT] = useState(null), [q, setQ] = useState(''), [lim, setLim] = useState(20)
  const dq = useDeferredValue(q)
  const hm = useMemo(() => new Map((ho || []).map(h => [String(h.order_id), h])), [ho])
  const rows = useMemo(() => (orders || []).map(o => { const h = hm.get(String(o.id)); return { o, h, stage: stageOf(o, h) } }), [orders, hm])
  const cnt = useMemo(() => { const c = { pack: 0, ready: 0, handed: 0, done: 0, cancel: 0 }; rows.forEach(r => c[r.stage]++); return c }, [rows])
  const tab = t || (cnt.pack ? 'pack' : cnt.ready ? 'ready' : 'handed')
  const list = useMemo(() => { const k = dq.trim().toLowerCase(); return rows.filter(r => r.stage === tab && (!k || `${r.o.order_no} ${(r.o.lines || []).map(l => l.name).join(' ')}`.toLowerCase().includes(k))).sort((a, b) => tab === 'pack' ? new Date(a.o.created_at) - new Date(b.o.created_at) : 0) }, [rows, tab, dq])
  useEffect(() => { setLim(20) }, [tab, dq])
  const onPack = useCallback(async (o, v) => { await markPacked(o.id, v); await reload() }, [reload])
  const onConfirm = useCallback(async (o, c) => { await confirmPickup(o.id, c); await reload() }, [reload])
  const csv = () => {
    const c = v => { v = String(v ?? ''); if (/^[=+\-@\t\r|]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"' }
    const out = [['Order', 'Date', 'Items', 'Status', 'Sales', 'Shop coupon', 'Courier', 'Your payout'], ...rows.map(r => [r.o.order_no, r.o.created_at, (r.o.lines || []).map(l => `${l.name}${l.variant ? ' (' + l.variant + ')' : ''} x${l.qty}`).join('; '), STG[r.stage][0], r.o.subtotal, r.o.shop_discount || 0, r.o.ship?.consignment_id ? (r.o.ship.courier || 'Pathao') + ' ' + r.o.ship.consignment_id : '', Math.round(earn(r.o, ops))])]
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + out.map(r => r.map(c).join(',')).join('\r\n')], { type: 'text/csv' })); a.download = `pinkish-orders-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  if (orders === null) return <div className="sl-skel tall" />
  return (
    <>
      <SendTo ops={ops} shop={shop} open={!orders.length} />
      {!hoOn && <div className="sl-ok">Pinkish will collect your orders and update their status here.</div>}
      {err && <div className="sl-err" role="alert">{err}</div>}
      <div className="sl-otabs" role="tablist" aria-label="Order status">{OTABS.map(k => <button key={k} role="tab" aria-selected={tab === k} className={'s-' + k + (tab === k ? ' on' : '')} onClick={() => setT(k)}><b>{cnt[k]}</b><span>{STG[k][0]}</span></button>)}</div>
      {orders.length > 0 && <div className="sl-tools"><label className="sl-search"><Ico n="search" s={18} /><input type="search" inputMode="search" enterKeyHint="search" placeholder="Search order number or product" aria-label="Search orders" value={q} onChange={e => setQ(e.target.value)} /></label><button className="sl-btn ghost sm" onClick={csv}><Ico n="dl" s={15} />CSV</button></div>}
      {!list.length ? <div className="sl-empty"><i><Ico n={tab === 'pack' ? 'pkg' : 'receipt'} s={34} /></i><b>{tab === 'pack' ? 'Nothing to pack' : 'Nothing here'}</b><p>{!orders.length ? 'New orders from customers will show up here. You get a notification too.' : tab === 'pack' ? 'You are all caught up. New orders appear here first.' : 'Orders move here as they progress.'}</p></div>
        : list.slice(0, lim).map(r => <SOrder key={r.o.id} o={r.o} h={r.h} stage={r.stage} ops={ops} hoOn={hoOn} img={img} shop={shop} onPack={onPack} onConfirm={onConfirm} say={say} reload={reload} />)}
      {list.length > lim && <button className="sl-btn ghost" onClick={() => setLim(l => l + 20)}>Show more · {list.length - lim} left</button>}
    </>
  )
}

// ---------------- Overview: today's to-do, shop health, sales and payouts ----------------
const dayKey = d => { const x = new Date(d); return x.getFullYear() + '-' + x.getMonth() + '-' + x.getDate() }
function Ring({ v }) {
  const r = 34, c = 2 * Math.PI * r
  return <svg className="sl-ring" viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r={r} fill="none" stroke="#efe6f7" strokeWidth="9" /><circle cx="40" cy="40" r={r} fill="none" stroke="url(#slg)" strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} transform="rotate(-90 40 40)" /><defs><linearGradient id="slg" x1="0" x2="1"><stop offset="0" stopColor="#8e2a8c" /><stop offset="1" stopColor="#e0457b" /></linearGradient></defs><text x="40" y="46" textAnchor="middle">{v}</text></svg>
}
function Overview({ shop, go, orders, ho, hoOn, ops, prods, qs, retN, followers, err }) {
  const s = useMemo(() => {
    const all = orders || [], live = all.filter(o => o.status !== 4), now = new Date()
    const sum = a => a.reduce((t, o) => t + Number(o.subtotal || 0), 0)
    const units = o => (o.lines || []).reduce((t, l) => t + Number(l.qty || 0), 0)
    const month = live.filter(o => { const d = new Date(o.created_at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() })
    const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(now); d.setDate(now.getDate() - (13 - i)); return { k: dayKey(d), label: d.toLocaleDateString('en-BD', { day: 'numeric', month: 'short' }), v: 0 } })
    const idx = Object.fromEntries(days.map((d, i) => [d.k, i]))
    live.forEach(o => { const i = idx[dayKey(o.created_at)]; if (i !== undefined) days[i].v += Number(o.subtotal || 0) })
    const top = {}
    live.forEach(o => (o.lines || []).forEach(l => { top[l.name] = (top[l.name] || 0) + Number(l.qty || 0) }))
    const hm = new Map((ho || []).map(h => [String(h.order_id), h]))
    const st = { pack: 0, ready: 0, late: 0 }, ph = (Number(ops.pack_hours) || 24) * 36e5
    all.forEach(o => { const g = stageOf(o, hm.get(String(o.id))); if (g === 'pack') { st.pack++; if (Date.now() - new Date(o.created_at) > ph) st.late++ } if (g === 'ready') st.ready++ })
    const timed = (ho || []).filter(h => h.packed_at || h.picked_at), onTime = timed.filter(h => new Date(h.packed_at || h.picked_at) - new Date(h.created_at) <= ph).length
    const done = all.filter(o => o.status === 3), prog = live.filter(o => o.status !== 3)
    return {
      revenue: sum(live), monthRev: sum(month), orders: live.length, items: live.reduce((t, o) => t + units(o), 0), days, max: Math.max(1, ...days.map(d => d.v)),
      top: Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 5), week: days.slice(7).reduce((t, d) => t + d.v, 0), st,
      onTime: timed.length ? onTime / timed.length : null, paid: done.reduce((t, o) => t + earn(o, ops), 0), coming: prog.reduce((t, o) => t + earn(o, ops), 0),
    }
  }, [orders, ho, ops])
  const lp = prods || [], liveP = lp.filter(p => p.is_active !== false), outP = liveP.filter(p => (p.stock ?? 0) === 0), lowP = liveP.filter(p => (p.stock ?? 0) > 0 && (p.stock ?? 0) <= 5)
  const qOpen = (qs || []).filter(q => !q.answer).length, qRate = qs?.length ? (qs.length - qOpen) / qs.length : 1
  const H = [
    [!!shop.logo_url, 10, 'Add your shop logo', 'shop'], [!!shop.cover_url || okLL(shop.lat, shop.lng), 5, okLL(shop.lat, shop.lng) ? 'Add a cover picture' : 'Pin your pickup location on the map', 'shop'], [(shop.description || '').trim().length >= 30, 5, 'Write a short "About" for your shop', 'shop'],
    [liveP.length >= 5, 15, `List at least 5 products (${liveP.length}/5)`, 'products'], [!outP.length, 15, `Restock ${outP.length} sold-out product${outP.length === 1 ? '' : 's'}`, 'products'],
    [qRate >= 0.9, 20, `Answer customer questions (${qOpen} waiting)`, 'questions'], [s.onTime == null || s.onTime >= 0.9, 20, `Pack orders within ${ops.pack_hours || 24}h (${s.onTime == null ? '' : Math.round(s.onTime * 100) + '% on time'})`, 'orders'],
    [lp.some(dealLive), 10, 'Run a flash deal to bring followers back', 'products'],
  ]
  const score = H.reduce((t, [ok, w]) => t + (ok ? w : 0), 0), lvl = score >= 85 ? ['Top seller', 'approved'] : score >= 65 ? ['Good standing', 'st2'] : ['Needs attention', 'pending']
  const todo = [
    [s.st.pack, 'pkg', `order${s.st.pack === 1 ? '' : 's'} to pack`, s.st.late ? `${s.st.late} late` : 'Pack and mark ready', 'orders', s.st.late > 0],
    [s.st.ready, 'truck', 'waiting for the rider', 'Have the parcel ready', 'orders'],
    [retN, 'ret', `return${retN === 1 ? '' : 's'} need your response`, 'Agree or dispute', 'returns'],
    [qOpen, 'chat', `question${qOpen === 1 ? '' : 's'} to answer`, 'Quick answers sell more', 'questions'],
    [lowP.length + outP.length, 'alert', 'products low or sold out', 'Restock with − / +', 'products'],
  ].filter(x => x[0] > 0)
  if (orders === null) return <div className="sl-skel tall" />
  return (
    <>
      {err && <div className="sl-err">{err}</div>}
      {ops.notice && <div className="sl-notice"><span aria-hidden="true"><Ico n="bell" s={18} /></span><p><b>From Pinkish</b>{ops.notice}</p></div>}
      <div className="sl-hero">
        <div>
          <span className="sl-hero-k">Total sales</span>
          <b className="sl-hero-v">{taka(s.revenue)}</b>
          <span className="sl-hero-s">From {s.orders} order{s.orders === 1 ? '' : 's'} · cancelled orders not counted</span>
        </div>
        <div className="sl-hero-side"><span>Last 7 days</span><b>{taka(s.week)}</b></div>
      </div>
      <section className="sl-card sl-todo"><div className="sl-head"><h2>Today's to-do</h2>{todo.length > 0 && <span className="sl-badge pending">{todo.length}</span>}</div>
        {!todo.length ? <p className="sl-allok"><Ico n="check" s={18} />All caught up. New orders and questions show up here.</p>
          : <div className="sl-tdl">{todo.map(([n, ic, l, sub, to, hot]) => <button key={l} className={'sl-td' + (hot ? ' hot' : '')} onClick={() => go(to)}><span className="ic"><Ico n={ic} s={19} /></span><span className="t"><b>{n} {l}</b><small>{sub}</small></span><Ico n="chev" s={16} /></button>)}</div>}
      </section>
      <div className="sl-stats">
        <div className="sl-stat"><span className="ic" aria-hidden="true"><Ico n="calendar" s={22} /></span><div><b>{taka(s.monthRev)}</b><span className="sl-mut">This month</span></div></div>
        <div className="sl-stat ok"><span className="ic" aria-hidden="true"><Ico n="cart" s={22} /></span><div><b>{s.items}</b><span className="sl-mut">Items sold</span></div></div>
        <div className="sl-stat warn"><span className="ic" aria-hidden="true"><Ico n="users" s={22} /></span><div><b>{followers ?? '–'}</b><span className="sl-mut">Followers</span></div></div>
      </div>
      <div className="sl-two">
        <section className="sl-card sl-health"><div className="sl-hh"><Ring v={score} /><div><h2>Shop health</h2><span className={'sl-badge ' + lvl[1]}>{lvl[0]}</span><p className="sl-mut">Healthy shops rank higher and sell more.</p></div></div>
          <ul className="sl-tips">{H.map(([ok, w, l, to]) => <li key={l} className={ok ? 'ok' : ''}>{ok ? <i>✓</i> : <i>+{w}</i>}<span>{ok ? l.replace(/\s*\(.*\)$/, '') : l}</span>{!ok && <button className="sl-btn ghost sm" onClick={() => go(to)}>Fix</button>}</li>)}</ul>
        </section>
        <section className="sl-card sl-pay"><h2>Payouts</h2>
          <div className="sl-payg"><div><span>Earned (delivered)</span><b>{taka(s.paid)}</b></div><div><span>Coming (in progress)</span><b>{taka(s.coming)}</b></div></div>
          <p className="sl-mut">Estimate after Pinkish commission of {Number(ops.commission) || 0}%. Pinkish collects payment from the customer and pays you for delivered orders.</p>
          {hoOn && <><h3 className="sl-sec">Where to send products</h3><SendTo ops={ops} shop={shop} compact /></>}
        </section>
      </div>
      <div className="sl-two">
        <div className="sl-card">
          <h2>Sales, last 14 days</h2>
          {s.days.every(d => !d.v) ? <p className="sl-mut">No sales in this period yet. Share your product links and run a flash deal to get started.</p> : (
            <div className="sl-chart" role="img" aria-label="Daily sales for the last 14 days">
              {s.days.map(d => <div className="sl-bar" key={d.k} title={d.label + ': ' + taka(d.v)}><i style={{ height: Math.max(4, d.v / s.max * 100) + '%' }} className={d.v ? '' : 'z'} /><small>{d.label.split(' ')[0]}</small></div>)}
            </div>
          )}
        </div>
        <div className="sl-card">
          <h2>Best sellers</h2>
          {!s.top.length ? <p className="sl-mut">Your top products will appear after your first sale.</p> : <ol className="sl-top5">{s.top.map(([n, q], i) => <li key={n}><i>{i + 1}</i><span>{n}</span><b>{q} sold</b></li>)}</ol>}
        </div>
      </div>
    </>
  )
}

const initial = n => String(n || 'S').trim().charAt(0).toUpperCase()
// Pickup location on the map: riders navigate straight to this pin. Private, customers never see it.
function PickupPin({ shop, onSaved }) {
  const has = okLL(shop.lat, shop.lng), [pt, setPt] = useState(has ? { lat: +shop.lat, lng: +shop.lng } : null), [edit, setEdit] = useState(!has)
  const [busy, setBusy] = useState(false), [gps, setGps] = useState(false), [err, setErr] = useState(''), [ok, setOk] = useState('')
  const km = pt ? kmFromHub(pt.lat, pt.lng) : null
  const locate = () => {
    if (!navigator.geolocation) return setErr('Location is not supported on this device.')
    setGps(true); setErr('')
    navigator.geolocation.getCurrentPosition(p => { setGps(false); setPt({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }) },
      e => { setGps(false); setErr(e.code === 1 ? 'Location permission denied. Move the map to your shop instead.' : 'Could not get your location. Move the map to your shop instead.') },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 })
  }
  const save = async () => { if (!pt) return setErr('Move the map so the pin sits on your shop.'); setBusy(true); setErr(''); setOk(''); try { onSaved(await setShopLocation(shop, pt.lat, pt.lng)); setOk('Pickup location saved. Riders navigate straight to it.'); setEdit(false) } catch (x) { setErr(msg(x)) } setBusy(false) }
  return <div className="sl-card sl-pin">
    <div className="sl-head"><div><h2>Pickup location</h2><p className="sl-mut">Riders use this pin to find your shop. Only Pinkish sees it.</p></div>{has && !edit && <button type="button" className="sl-btn ghost sm" onClick={() => setEdit(true)}>Move pin</button>}</div>
    {err && <div className="sl-err" role="alert">{err}</div>}{ok && <div className="sl-ok" role="status">{ok}</div>}
    {edit ? <PinPicker value={pt} onChange={setPt} height={260} />
      : <LiveMap markers={[{ id: 'shop', kind: 'shop', lat: shop.lat, lng: shop.lng, label: shop.name }, { id: 'hub', kind: 'hub', lat: HUB.lat, lng: HUB.lng, label: 'Pinkish hub · ' + HUB.name }]} zone height={200} />}
    {km != null && <p className={'sl-zone' + (km <= RIDER_KM ? ' in' : '')}><Ico n={km <= RIDER_KM ? 'truck' : 'pin'} s={15} />{kmTxt(km)} from the Pinkish hub ({HUB.name}){km <= RIDER_KM ? ' · inside the Pinkish rider zone' : ` · outside the ${RIDER_KM} km rider zone`}</p>}
    {edit && <div className="sl-acts"><button type="button" className="sl-btn" disabled={busy || !pt} onClick={save}>{busy ? 'Saving…' : 'Save pickup location'}</button><button type="button" className="sl-btn ghost sm" disabled={gps} onClick={locate}><Ico n="pin" s={15} />{gps ? 'Finding you…' : 'Use my location'}</button>{has && <button type="button" className="sl-btn ghost sm" onClick={() => { setPt({ lat: +shop.lat, lng: +shop.lng }); setEdit(false) }}>Cancel</button>}</div>}
  </div>
}
// Shop coupons: the shop pays the discount, only on its own items. Shown on the shop and product pages.
const CF0 = { code: '', title: '', kind: 'percent', value: '', min_order: '', max_discount: '', max_uses: '', ends_at: '', is_public: true, active: true }
const cDesc = c => (c.kind === 'percent' ? `${+c.value}% off${c.max_discount ? ' up to ' + taka(c.max_discount) : ''}` : taka(c.value) + ' off') + (+c.min_order > 0 ? ` on ${taka(c.min_order)}+` : '')
function ShopCoupons({ shop }) {
  const [list, setList] = useState(null), [f, setF] = useState(null), [busy, setBusy] = useState(false), [err, setErr] = useState(''), [ok, setOk] = useState('')
  const load = useCallback(() => myCoupons(shop.id).then(setList).catch(x => { setErr(msg(x)); setList([]) }), [shop.id])
  useEffect(() => { load() }, [load])
  const set = k => e => setF(x => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const save = async e => { e.preventDefault(); setBusy(true); setErr(''); setOk(''); try { await saveCoupon(shop, f, f.id ? f : null); setOk(f.id ? 'Coupon saved.' : `Coupon ${f.code.toUpperCase()} is live. Customers see it on your shop and product pages.`); setF(null); load() } catch (x) { setErr(msg(x)) } setBusy(false) }
  const tog = async c => { try { await setCouponActive(c, !c.active); load() } catch (x) { setErr(msg(x)) } }
  const del = async c => { if (!confirm(`Delete coupon ${c.code}?`)) return; try { await deleteCoupon(c); load() } catch (x) { setErr(msg(x)) } }
  const now = Date.now(), state = c => !c.active ? ['Off', 'pending'] : c.ends_at && new Date(c.ends_at) < now ? ['Ended', 'rejected'] : c.max_uses && c.used_count >= c.max_uses ? ['Used up', 'rejected'] : ['Live', 'approved']
  if (list === null) return <div className="sl-card sl-cps"><h2>Shop coupons</h2><p className="sl-mut">Loading…</p></div>
  return <div className="sl-card sl-cps">
    <div className="sl-head"><div><h2>Shop coupons</h2><p className="sl-mut">Bring customers back with a discount on your items. Your shop pays the discount; Pinkish commission is on what the customer pays.</p></div>{!f && <button type="button" className="sl-btn sm" onClick={() => { setF({ ...CF0 }); setOk('') }}>+ New coupon</button>}</div>
    {err && <div className="sl-err" role="alert">{err}</div>}{ok && <div className="sl-ok" role="status">{ok}</div>}
    {f && <form className="sl-cpf" onSubmit={save}>
      <div className="sl-row"><Field label="Code (customers type this)"><input value={f.code} onChange={e => setF(x => ({ ...x, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20) }))} placeholder="EID50" disabled={!!f.id} required /></Field>
        <Field label="Title (optional)"><input value={f.title || ''} onChange={set('title')} maxLength={60} placeholder="Eid special" /></Field></div>
      <div className="sl-row"><Field label="Type"><select value={f.kind} onChange={set('kind')}><option value="percent">% off</option><option value="amount">৳ off</option></select></Field>
        <Field label={f.kind === 'percent' ? 'Percent off' : 'Taka off'}><input type="number" inputMode="decimal" min="1" max={f.kind === 'percent' ? 90 : undefined} step="1" value={f.value} onChange={set('value')} required /></Field></div>
      <div className="sl-row"><Field label="Minimum order of your items (৳)"><input type="number" inputMode="numeric" min="0" step="1" value={f.min_order ?? ''} onChange={set('min_order')} placeholder="0" /></Field>
        {f.kind === 'percent' ? <Field label="Maximum discount (৳, optional)"><input type="number" inputMode="numeric" min="1" step="1" value={f.max_discount ?? ''} onChange={set('max_discount')} placeholder="No limit" /></Field>
          : <Field label="How many uses in total (optional)"><input type="number" inputMode="numeric" min="1" step="1" value={f.max_uses ?? ''} onChange={set('max_uses')} placeholder="No limit" /></Field>}</div>
      <div className="sl-row"><Field label="Ends (optional)"><input type="datetime-local" value={f.ends_at || ''} onChange={set('ends_at')} /></Field>
        {f.kind === 'percent' && <Field label="How many uses in total (optional)"><input type="number" inputMode="numeric" min="1" step="1" value={f.max_uses ?? ''} onChange={set('max_uses')} placeholder="No limit" /></Field>}</div>
      <label className="sl-f"><input type="checkbox" checked={f.is_public !== false} onChange={set('is_public')} /> Show it on my shop and product pages (otherwise only people you tell the code)</label>
      <p className="sl-mut">Each customer can use it once. It only counts your items in the cart.</p>
      <div className="sl-acts"><button className="sl-btn" disabled={busy}>{busy ? 'Saving…' : f.id ? 'Save coupon' : 'Create coupon'}</button><button type="button" className="sl-btn ghost" onClick={() => { setF(null); setErr('') }}>Cancel</button></div>
    </form>}
    {!list.length && !f ? <p className="sl-mut">No coupons yet.</p> : <ul className="sl-cpl-l">{list.map(c => { const [lb, cls] = state(c); return <li key={c.id}>
      <span className="sl-cpc">{c.code}</span><span className="t"><b>{c.title || cDesc(c)}</b><small>{c.title ? cDesc(c) + ' · ' : ''}{c.used_count} used{c.max_uses ? ' of ' + c.max_uses : ''}{c.ends_at ? ' · ends ' + when(c.ends_at) : ''}{c.is_public ? '' : ' · private'}</small></span>
      <span className={'sl-badge ' + cls}>{lb}</span>
      <span className="sl-acts"><button type="button" className="sl-btn ghost sm" onClick={() => tog(c)}>{c.active ? 'Turn off' : 'Turn on'}</button><button type="button" className="sl-btn ghost sm" onClick={() => { setF({ ...CF0, ...c, value: String(c.value), min_order: c.min_order ? String(c.min_order) : '', max_discount: c.max_discount ? String(c.max_discount) : '', max_uses: c.max_uses ? String(c.max_uses) : '', ends_at: c.ends_at ? toLocalInput(c.ends_at) : '' }); setOk('') }}>Edit</button>{!c.used_count && <button type="button" className="sl-btn bad sm" onClick={() => del(c)}>Delete</button>}</span></li> })}</ul>}
  </div>
}
function ShopSettings({ shop, onSaved }) {
  const [f, setF] = useState({ name: shop.name, description: shop.description || '', phone: shop.phone, address: shop.address, city: shop.city || '' })
  const [err, setErr] = useState(''), [ok, setOk] = useState(''), [busy, setBusy] = useState(false), [lbusy, setLbusy] = useState(false), [cbusy, setCbusy] = useState(false)
  const set = k => v => setF(p => ({ ...p, [k]: v }))
  const bad = hasContact(f.name) || hasContact(f.description)
  const profile = { name: shop.name, description: shop.description || '', phone: shop.phone, address: shop.address, city: shop.city || '' }
  const go = async e => { e.preventDefault(); setErr(''); setOk(''); if (bad) return setErr(CONTACT_WARN); setBusy(true); try { onSaved(await updateShop(shop, f, null)); setOk('Shop details saved.') } catch (x) { setErr(msg(x)) } setBusy(false) }
  // logo and cover save on their own the moment they are chosen
  const pickLogo = async e => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setErr(''); setOk(''); setLbusy(true)
    try { onSaved(await updateShop(shop, profile, file)); setOk('Logo updated. It now shows on your products in the store.') } catch (x) { setErr(msg(x)) }
    setLbusy(false)
  }
  const pickCover = async e => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setErr(''); setOk(''); setCbusy(true)
    try { onSaved(await updateShop(shop, profile, null, file)); setOk('Cover picture updated. It now shows at the top of your shop page.') } catch (x) { setErr(/cover_url/i.test(String(x?.message)) ? 'Cover pictures are not enabled yet. Run the cover_url SQL update first.' : msg(x)) }
    setCbusy(false)
  }
  const dropCover = async () => { setErr(''); setOk(''); setCbusy(true); try { onSaved(await removeCover(shop)); setOk('Cover picture removed.') } catch (x) { setErr(msg(x)) } setCbusy(false) }
  return (
    <div className="sl-shopset">
      {err && <div className="sl-err" role="alert">{err}</div>}{ok && <div className="sl-ok" role="status">{ok}</div>}
      <div className="sl-card sl-cover">
        <h2>Shop cover picture</h2>
        <div className={'sl-cover-pv' + (shop.cover_url ? ' has' : '')}>{shop.cover_url ? <img src={shop.cover_url} alt="Shop cover" decoding="async" /> : <span>No cover picture yet</span>}</div>
        <div className="sl-cover-a">
          <label className={'sl-btn sm sl-up' + (cbusy ? ' dis' : '')}>{cbusy ? 'Uploading…' : shop.cover_url ? 'Change cover' : 'Add cover picture'}<input type="file" accept="image/*" onChange={pickCover} disabled={cbusy} /></label>
          {shop.cover_url && <button type="button" className="sl-btn ghost sm" onClick={dropCover} disabled={cbusy}>Remove</button>}
        </div>
        <small className="sl-mut">Wide picture works best (3:1). Do not put phone numbers or social media handles in pictures.</small>
      </div>
      <div className="sl-card sl-brand">
        <span className="sl-av lg">{shop.logo_url ? <img src={shop.logo_url} alt="" /> : initial(shop.name)}</span>
        <div className="sl-brand-t">
          <h2>{shop.name}</h2>
          <p className="sl-mut">Your logo and name appear on every product you sell.</p>
          <label className={'sl-btn sm sl-up' + (lbusy ? ' dis' : '')}>{lbusy ? 'Uploading…' : shop.logo_url ? 'Change logo' : 'Upload logo'}<input type="file" accept="image/*" onChange={pickLogo} disabled={lbusy} /></label>
          <small className="sl-mut">Square image works best. Any picture works, we resize it for you.</small>
        </div>
      </div>
      <ShopCoupons shop={shop} />
      <PickupPin shop={shop} onSaved={onSaved} />
      <form className="sl-card" onSubmit={go}>
        <h2>Shop details</h2>
        <Inp label="Shop name" value={f.name} onChange={set('name')} maxLength={60} required />
        <Field label="About (shown to customers)"><textarea rows={3} value={f.description} onChange={e => set('description')(e.target.value)} maxLength={500} placeholder="What you sell and why customers love it" /></Field>
        {bad && <p className="sl-warn" role="alert"><Ico n="alert" s={15} />{CONTACT_WARN}</p>}
        <div className="sl-row"><Inp label="Business phone (private, only Pinkish sees it)" type="tel" inputMode="numeric" value={f.phone} onChange={set('phone')} required /><Inp label="City" value={f.city} onChange={set('city')} /></div>
        <Inp label="Pickup address (where the Pinkish rider collects)" value={f.address} onChange={set('address')} required />
        <p className="sl-mut sl-vf-note"><Ico n="lock" s={15} /> Customers never see your phone or address. Pinkish handles every order, payment and delivery.</p>
        <button className="sl-btn" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
      </form>
    </div>
  )
}

function Welcome({ shop, user }) {
  const key = 'sl_w_' + shop.id
  const [on, setOn] = useState(() => { try { return !localStorage.getItem(key) } catch { return false } })
  if (!on) return null
  const close = () => { try { localStorage.setItem(key, '1') } catch { /* storage unavailable */ } setOn(false) }
  return <div className="sl-card sl-welcome">
    <h2><Ico n="sparkle" s={20} /> {shop.name} is verified!</h2>
    <p className="sl-mut">Add products and they go live straight away. When an order comes in: pack it, mark it ready, and hand it only to the Pinkish rider with the right pickup code. Log in any time with {user?.email ? <b>{user.email}</b> : 'this account'}.</p>
    <button className="sl-btn sm" onClick={close}>Got it</button>
  </div>
}

// All seller data in one place: loaded once, refreshed quietly every 45 s while the tab is visible.
function useSellerData(shop, say) {
  const [orders, setOrders] = useState(() => MEM.orders ?? null), [ho, setHo] = useState(() => MEM.ho), [ops, setOps] = useState(() => MEM.ops || OPS0)
  const [prods, setProds] = useState(() => PCACHE[shop.id] || null), [cats, setCats] = useState(() => CCACHE.v || []), [qs, setQs] = useState(() => MEM.qs ?? null), [saves, setSaves] = useState({}), [followers, setFollowers] = useState(null), [err, setErr] = useState('')
  const seen = useRef(null), inflight = useRef(null)
  // calls made while a refresh is still on its way share it (timers, tab switches and buttons can overlap)
  const load = useCallback(() => inflight.current || (inflight.current = loadNow().finally(() => { inflight.current = null })), []) // eslint-disable-line react-hooks/exhaustive-deps
  const loadNow = async () => {
    const [o0, h, q, ex] = await Promise.all([
      sellerOrders().catch(x => { setErr(msg(x)); return null }),
      sellerHandovers().catch(() => MEM.ho ?? null),
      sellerQuestions().catch(() => null),
      sellerExtras(),
    ])
    // coupon discount on this shop's items + Pathao pickups, merged into each order
    const xm = new Map((ex || []).map(x => [String(x.order_id), x]))
    const o = o0 && (xm.size ? o0.map(r => { const x = xm.get(String(r.id)); return x ? { ...r, shop_discount: +x.discount || 0, ship: x.consignment_id ? x : null } : r }) : o0)
    if (o) {
      const ids = new Set(o.map(x => String(x.id)))
      if (seen.current) { const fresh = o.filter(x => !seen.current.has(String(x.id)) && x.status !== 4); if (fresh.length) { say(fresh.length === 1 ? `🛍️ New order #${fresh[0].order_no}. Pack it now.` : `🛍️ ${fresh.length} new orders`); navigator.vibrate?.([80, 60, 80]) } }
      seen.current = ids; MEM.orders = o; setOrders(o); setErr('')
    } else setOrders(p => p ?? [])
    MEM.ho = h; setHo(h)
    if (q) { MEM.qs = q; setQs(q) } else setQs(p => p ?? [])
  }
  const putProds = useCallback(fn => setProds(l => { const n = fn(l || []); PCACHE[shop.id] = n; return n }), [shop.id])
  const loadProds = useCallback(async () => {
    try { const [p, c] = await Promise.all([myProducts(shop.id), CCACHE.v || getCategoriesList()]); CCACHE.v = c; setCats(c); PCACHE[shop.id] = p; setProds(p) } catch (x) { setErr(msg(x)); setProds(l => l || []) }
    productStats().then(setSaves)
  }, [shop.id])
  useEffect(() => {
    load(); loadProds()
    getSellerOps().then(o => { MEM.ops = o; setOps(o) })
    getFollowerCount(shop.id).then(setFollowers)
    const live = () => !document.hidden && navigator.onLine !== false
    const t = setInterval(() => { if (live()) load() }, 45000)
    const vis = () => { if (live()) load() }
    document.addEventListener('visibilitychange', vis); addEventListener('online', vis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); removeEventListener('online', vis) }
  }, [load, loadProds, shop.id])
  const sold = useMemo(() => { const m = {}; (orders || []).filter(o => o.status !== 4).forEach(o => (o.lines || []).forEach(l => { m[l.name] = (m[l.name] || 0) + Number(l.qty || 0) })); return m }, [orders])
  const img = useMemo(() => Object.fromEntries((prods || []).filter(p => p.image_url).map(p => [p.name, p.image_url])), [prods])
  const toPack = useMemo(() => { const hm = new Map((ho || []).map(h => [String(h.order_id), h])); return (orders || []).filter(o => stageOf(o, hm.get(String(o.id))) === 'pack').length }, [orders, ho])
  return { orders, ho, hoOn: Array.isArray(ho), ops, prods, putProds, loadProds, cats, qs, saves, followers, err, load, sold, img, toPack, qOpen: (qs || []).filter(q => !q.answer).length }
}

function Dashboard({ shop, user, setShop, logout }) {
  const [tab, setTab] = useState(() => { try { return sessionStorage.getItem('sl_tab') || 'overview' } catch { return 'overview' } }), [toast, setToast] = useState(''), tt = useRef(0), scr = useRef(null)
  const say = useCallback(m => { setToast(m); clearTimeout(tt.current); tt.current = setTimeout(() => setToast(''), 3200) }, [])
  const D = useSellerData(shop, say), online = useOnline()
  const [retN, setRetN] = useState(() => (MEM.returns || []).filter(needsYou).length)
  useEffect(() => {
    const run = () => { if (!document.hidden && navigator.onLine !== false) sellerReturns().then(r => { MEM.returns = r; setRetN(r.filter(needsYou).length) }).catch(() => {}) }
    run(); const t = setInterval(run, 60000); return () => clearInterval(t)
  }, [])
  const go = useCallback(t => { setTab(t); try { sessionStorage.setItem('sl_tab', t) } catch { /* storage unavailable */ } scr.current?.scrollTo?.(0, 0) }, [])
  const NAV = [['overview', 'Home', 'overview'], ['orders', 'Orders', 'receipt', D.toPack], ['products', 'Products', 'box'], ['returns', 'Returns', 'ret', retN], ['questions', 'Q&A', 'chat', D.qOpen], ['shop', 'Shop', 'store']]
  const TITLE = { overview: 'Overview', products: 'Products', orders: 'Orders', returns: 'Returns', questions: 'Questions', shop: 'Shop settings' }
  return (
    <div className="slx app"><div className="shell">
      <nav className="sb" aria-label="Seller sections">
        <div className="brand"><span className="bm"><img src="/logo-mark.webp?v=2" width="26" height="22" alt="" decoding="async" /></span><span className="bp">Pink</span><span className="bi">ish</span></div>
        <div className="me"><span className="mav" aria-hidden="true">{shop.logo_url ? <img src={shop.logo_url} alt="" /> : initial(shop.name)}</span><b>{shop.name}</b><small>Seller Centre{D.followers ? ' · ' + D.followers + ' followers' : ''}</small></div>
        <div className="nv">{NAV.map(([k, l, ic, n]) => <button key={k} title={l} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} onClick={() => go(k)}><span className="ic" aria-hidden="true"><Ico n={ic} s={20} /></span><span className="lb">{l}</span>{n > 0 && <em aria-label={n + ' need attention'}>{n > 99 ? '99+' : n}</em>}</button>)}</div>
        <div className="sp" />
        <a className="lo vs" href="/"><i aria-hidden="true"><Ico n="bag" s={15} /></i>View store</a>
        <button className="lo" onClick={logout}><i aria-hidden="true"><Ico n="out" s={15} /></i>Log out</button>
      </nav>
      <main className="mn">
        {!online && <div className="sl-offline" role="status">No internet. Showing your last update. Changes need a connection.</div>}
        <header className="top"><h1>{TITLE[tab]}</h1><div className="ta"><a className="ib2" href="/" aria-label="View store"><Ico n="bag" s={20} /></a><button className="ib2 mo" aria-label="Log out" onClick={logout}><Ico n="out" s={20} /></button></div></header>
        <div className="scr" ref={scr}><div className="pg" key={tab}>
          <Welcome shop={shop} user={user} />
          {!shop.logo_url && tab !== 'shop' && tab !== 'overview' && <div className="sl-card sl-nudge"><span className="sl-av">{initial(shop.name)}</span><div><b>Add your shop logo</b><p className="sl-mut">Customers see your logo and name on every product. It takes a few seconds.</p></div><button className="sl-btn sm" onClick={() => go('shop')}>Add logo</button></div>}
          {tab === 'overview' && <Overview shop={shop} go={go} retN={retN} {...D} />}
          {tab === 'orders' && <Orders orders={D.orders} ho={D.ho} hoOn={D.hoOn} ops={D.ops} shop={shop} img={D.img} reload={D.load} say={say} err={D.err} />}
          {tab === 'products' && <Products shop={shop} list={D.prods} put={D.putProds} cats={D.cats} reload={D.loadProds} sold={D.sold} saves={D.saves} say={say} />}
          {tab === 'returns' && <Returns onCount={setRetN} />}
          {tab === 'questions' && <Questions rows={D.qs} reload={D.load} say={say} />}
          {tab === 'shop' && <ShopSettings shop={shop} onSaved={setShop} />}
        </div></div>
      </main>
    </div>
    {toast && <div className="sl-toast" role="status">{toast}</div>}</div>
  )
}

// Seller Centre must never be shown inside another site's frame (clickjacking protection, also set as a header on the server)
const FRAMED = (() => { try { return window.top !== window.self } catch { return true } })()
export default function Seller() {
  const lock = useRef(false), [user, setUser] = useState(undefined), [shop, setShop] = useState(undefined), [err, setErr] = useState('')

  const uidRef = useRef(null)
  useEffect(() => {
    document.title = 'Seller Centre · Pinkish'
    try { sessionStorage.removeItem('pk_seller') } catch { /* storage unavailable */ }
    // private area: keep it out of search engines and give phones the right theme colour
    const meta = (name, content) => { let m = document.querySelector(`meta[name="${name}"]`); const had = !!m, old = m?.getAttribute('content'); if (!m) { m = document.createElement('meta'); m.name = name; document.head.appendChild(m) } m.setAttribute('content', content); return () => { if (had) m.setAttribute('content', old || ''); else m.remove() } }
    const undo = [meta('robots', 'noindex,nofollow'), meta('theme-color', '#f7effb'), meta('referrer', 'strict-origin-when-cross-origin')]
    // session comes straight from local storage: no extra admin/profile lookups for sellers
    supabase?.auth.getSession().then(({ data }) => { const a = data?.session?.user; setUser(a ? { id: a.id, email: a.email, name: a.user_metadata?.full_name || a.email?.split('@')[0] || 'Seller', mobile: a.user_metadata?.phone || '' } : null) }).catch(() => setUser(null))
    const off = onAuthChange((u, ev) => {
      if (ev === 'SIGNED_OUT') { wipe(); clearDraft(); setUser(null); setShop(undefined) }
      else if (u && !lock.current) {
        // another account signed in (e.g. in a second tab): never show the previous seller's cached data
        if (uidRef.current && uidRef.current !== u.id) { wipe(); setShop(undefined) }
        setUser(u)
      }
    })
    return () => { off(); undo.forEach(f => f()) }
  }, [])
  useEffect(() => { uidRef.current = user?.id || null }, [user?.id])
  const loadShop = useCallback(async u => { setErr(''); try { setShop(await getMyShop(u.id)) } catch (x) { setErr(msg(x)); setShop(null) } }, [])
  useEffect(() => { if (user) loadShop(user) }, [user?.id, loadShop]) // eslint-disable-line react-hooks/exhaustive-deps

  if (FRAMED) return <div className="slx"><div className="sl-wrap"><div className="sl-err">For your safety, Seller Centre only opens in its own window. <a href="/merchant" target="_top" rel="noopener">Open Seller Centre</a></div></div></div>
  if (!supabase) return <div className="slx"><div className="sl-wrap"><div className="sl-err">The store is not configured.</div></div></div>
  if (user === undefined) return <div className="slx"><div className="sl-wrap sl-mut">Loading…</div></div>
  if (!user) return <div className="slx"><Auth onUser={setUser} lock={lock} /></div>

  const logout = () => signOut().then(() => { wipe(); clearDraft(); try { sessionStorage.removeItem('sl_tab') } catch { /* storage unavailable */ } setUser(null); setShop(undefined) })
  if (shop && shop.status === 'approved') return <Dashboard shop={shop} user={user} setShop={setShop} logout={logout} />
  const top = (
    <div className="sl-top"><div className="sl-top-in">
      <div className="sl-who"><span className="sl-logo" aria-label="Pinkish Seller Centre"><img className="bmk" src="/logo-mark.webp?v=2" width="34" height="34" alt="" decoding="async" /><span className="wm"><span className="bp">Pink</span><span className="bi">ish</span></span><em className="sl-tag">Seller</em></span>{shop && <span className="sl-shopname"><span className="sl-av">{shop.logo_url ? <img src={shop.logo_url} alt="" /> : initial(shop.name)}</span><span className="sl-mut">{shop.name}</span> <span className={'sl-badge ' + shop.status}>{shop.status}</span></span>}</div>
      <div className="sl-acts"><a className="sl-btn ghost sm" href="/" style={{ textDecoration: 'none' }}>View store</a><button className="sl-btn ghost sm" onClick={logout}>Log out</button></div>
    </div></div>
  )
  const errBox = err && <div className="sl-wrap"><div className="sl-err">{err}</div></div>
  let body
  if (shop === undefined) body = <div className="sl-wrap sl-mut">Loading…</div>
  else if (!shop || shop.status === 'rejected') body = <ShopForm user={user} shop={shop} onDone={setShop} />
  else body = <Waiting shop={shop} onRefresh={() => loadShop(user)} />
  return <div className="slx">{top}{errBox}{body}</div>
}
