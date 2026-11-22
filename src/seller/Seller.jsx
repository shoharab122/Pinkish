import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import './seller.css'
import { signIn, signUp, signOut, restoreUser, onAuthChange, resetPassword, signInWithGoogle, supabase, dealLive } from '../api.js'
import { getMyShop, createShop, resubmitShop, updateShop, getCategoriesList, myProducts, saveProduct, deleteProduct, sellerOrders, validPhone, validNid, PHOTOS, existingImages, sellerQuestions, answerQuestion } from './sellerApi.js'

const taka = n => '৳' + Number(n || 0).toLocaleString('en-BD')
const when = d => { try { return new Date(d).toLocaleString('en-BD', { dateStyle: 'medium', timeStyle: 'short' }) } catch { return '' } }
const msg = e => e?.message || 'Something went wrong. Please try again.'
const okEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim())
const strength = p => (p.length >= 8) + (/[a-z]/.test(p) && /[A-Z]/.test(p)) + /\d/.test(p) + (/[^A-Za-z0-9]/.test(p) || p.length >= 12)
const toLocalInput = x => { const d = new Date(x); if (isNaN(d)) return ''; d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16) }
const DRAFT = 'sl_draft'
const readDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT)) || {} } catch { return {} } }
const saveDraft = d => { try { localStorage.setItem(DRAFT, JSON.stringify(d)) } catch { /* storage unavailable */ } }
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
}
const Ico = ({ n, s = 20 }) => <svg className="ico" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{IC[n]}</svg>
const STEP = ['Create account', 'Shop details', 'Verification', 'Start selling']
function Steps({ at }) {
  return <ol className="sl-steps" aria-label="Progress">{STEP.map((s, i) => <li key={s} className={i < at ? 'dn' : i === at ? 'on' : ''}><i>{i < at ? '✓' : i + 1}</i><span>{s}</span></li>)}</ol>
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
              <Field label="NID photo"><span className={'sa-file' + (doc ? ' has' : '')}><input type="file" title={doc ? doc.name : 'Choose your NID photo'} accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => setDoc(e.target.files?.[0] || null)} /><i><Ico n={doc ? 'check' : 'id'} s={28} /></i><span><b>{doc ? doc.name : 'Tap to add your NID photo'}</b><small>{doc ? 'Tap to change it' : 'Clear photo of the front. JPG, PNG or PDF, max 5 MB'}</small></span></span></Field>
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
            <span className={'sa-file' + (doc ? ' has' : '')}><input type="file" title={doc ? doc.name : 'Choose your NID photo'} accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => setDoc(e.target.files?.[0] || null)} /><i><Ico n={doc ? 'check' : 'id'} s={28} /></i><span><b>{doc ? doc.name : 'Tap to add your NID photo'}</b><small>{doc ? 'Tap to change it' : 'Clear photo of the front. JPG, PNG or PDF, max 5 MB'}</small></span></span>
          </Field>
          <p className="sl-mut sl-vf-note"><Ico n="lock" s={15} /> Your NID is stored privately and only our verification team can see it. Once an admin approves your shop you can log in with this same account and add products.</p>
          <button className="sl-btn sa-go" disabled={busy}>{busy ? 'Submitting…' : shop ? 'Resubmit for review' : 'Send for verification'}</button>
        </form>
      </div>
    </div></div>
  )
}

function Waiting({ shop, onRefresh }) {
  useEffect(() => { if (shop.status !== 'pending') return; const t = setInterval(onRefresh, 15000); return () => clearInterval(t) }, [shop.status, onRefresh])
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
      <input type="file" accept="image/jpeg,image/png,image/webp" aria-label={`Product photo ${n}`} onChange={e => { onPick(e.target.files?.[0] || null); e.target.value = '' }} />
    </label>
  )
}

function ProductForm({ shop, cats, product, onSaved, onCancel }) {
  const [f, setF] = useState({ name: product?.name || '', brand: product?.brand || '', tag: product?.tag || '', category_id: product?.category_id || '', price: (dealLive(product) ? product.old_price : product?.price) ?? '', stock: product?.stock ?? '', is_active: product?.is_active !== false, dealPrice: dealLive(product) ? product.price : '', dealEnds: dealLive(product) ? toLocalInput(product.deal_ends_at) : '' })
  const [files, setFiles] = useState(() => Array(PHOTOS).fill(null)), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const saved = useMemo(() => existingImages(product), [product])
  const filled = files.filter((f, i) => f || saved[i]).length
  const set = k => v => setF(p => ({ ...p, [k]: v }))
  const go = async e => {
    e.preventDefault(); setErr('')
    if (filled < PHOTOS) return setErr(`Add all ${PHOTOS} product photos (${filled}/${PHOTOS} added).`)
    setBusy(true)
    try { onSaved(await saveProduct(shop, f, files, product)) } catch (x) { setErr(msg(x)) }
    setBusy(false)
  }
  return (
    <form className="sl-card" onSubmit={go}>
      <h2>{product ? 'Edit product' : 'Add product'}</h2>
      {err && <div className="sl-err">{err}</div>}
      <div className="sl-f"><span>Product photos: add {PHOTOS} (JPG/PNG/WebP, max 3 MB each) · {filled}/{PHOTOS} added</span>
        <div className="sl-photos">{files.map((f, i) => <PhotoSlot key={i} n={i + 1} file={f} saved={saved[i]} onPick={nf => setFiles(a => a.map((x, k) => (k === i ? nf : x)))} />)}</div></div>
      <Inp label="Product name" value={f.name} onChange={set('name')} maxLength={120} required />
      <div className="sl-row">
        <Field label="Category"><select value={f.category_id} onChange={e => set('category_id')(e.target.value)} required><option value="">Select…</option>{cats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></Field>
        <Inp label="Brand" value={f.brand} onChange={set('brand')} maxLength={60} />
      </div>
      <div className="sl-row">
        <Inp label="Price (৳)" type="number" min="1" step="0.01" value={f.price} onChange={set('price')} required />
        <Inp label="Stock" type="number" min="0" step="1" value={f.stock} onChange={set('stock')} required />
      </div>
      <Inp label="Tag (optional, e.g. New, Best seller)" value={f.tag} onChange={set('tag')} maxLength={30} />
      <div className="sl-deal"><b>⚡ Flash deal (optional)</b><p className="sl-mut">Set a lower price for a limited time. The regular price above is shown crossed out, and it returns automatically when the deal ends. Followers of your shop are notified.</p>
        <div className="sl-row">
          <Inp label="Deal price (৳)" type="number" min="1" step="0.01" value={f.dealPrice} onChange={set('dealPrice')} />
          <Inp label="Deal ends" type="datetime-local" value={f.dealEnds} onChange={set('dealEnds')} />
        </div>
        {f.dealPrice !== '' && <button type="button" className="sl-btn ghost sm" onClick={() => setF(p => ({ ...p, dealPrice: '', dealEnds: '' }))}>Remove deal</button>}</div>
      <label className="sl-f"><input type="checkbox" checked={f.is_active} onChange={e => set('is_active')(e.target.checked)} /> Visible in the store</label>
      <div className="sl-acts"><button className="sl-btn" disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button><button type="button" className="sl-btn ghost" onClick={onCancel}>Cancel</button></div>
    </form>
  )
}

function Products({ shop }) {
  const [list, setList] = useState(null), [cats, setCats] = useState([]), [edit, setEdit] = useState(null), [err, setErr] = useState('')
  const load = useCallback(async () => { try { const [p, c] = await Promise.all([myProducts(shop.id), getCategoriesList()]); setList(p); setCats(c) } catch (x) { setErr(msg(x)); setList([]) } }, [shop.id])
  useEffect(() => { load() }, [load])
  const del = async p => { if (!confirm(`Delete "${p.name}"?`)) return; try { await deleteProduct(shop, p.id); setList(l => l.filter(x => x.id !== p.id)) } catch (x) { setErr(msg(x)) } }
  const toggle = async p => { try { const n = await saveProduct(shop, { ...p, price: p.price, stock: p.stock ?? 0, is_active: !(p.is_active !== false) }, null, p); setList(l => l.map(x => x.id === p.id ? n : x)) } catch (x) { setErr(msg(x)) } }
  if (edit) return <ProductForm shop={shop} cats={cats} product={edit === 'new' ? null : edit} onCancel={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />
  return (
    <>
      <div className="sl-stats">
        <div className="sl-stat"><span className="ic" aria-hidden="true"><Ico n="box" s={22} /></span><div><b>{list?.length ?? '–'}</b><span className="sl-mut">Products</span></div></div>
        <div className="sl-stat ok"><span className="ic" aria-hidden="true"><Ico n="check" s={22} /></span><div><b>{list?.filter(p => p.is_active !== false).length ?? '–'}</b><span className="sl-mut">Live</span></div></div>
        <div className="sl-stat warn"><span className="ic" aria-hidden="true"><Ico n="alert" s={22} /></span><div><b>{list?.filter(p => (p.stock ?? 0) <= 5).length ?? '–'}</b><span className="sl-mut">Low stock</span></div></div>
      </div>
      {err && <div className="sl-err">{err}</div>}
      <div className="sl-head"><div><h2>Your products</h2><p className="sl-mut">Manage what customers see in the store.</p></div><button className="sl-btn" onClick={() => setEdit('new')}>+ Add product</button></div>
      {list === null ? <p className="sl-mut">Loading…</p> : !list.length ? <div className="sl-empty"><i><Ico n="bag" s={34} /></i><b>No products yet</b><p>Add your first product and it appears in the store instantly.</p></div> : (
        <div className="sl-grid">{list.map(p => (
          <div className={'sl-prod' + (p.is_active !== false ? '' : ' off')} key={p.id}>
            <div className="sl-pimg">
              {p.image_url ? <img src={p.image_url} alt="" /> : <div className="sl-ph">{p.emoji || <Ico n="bag" s={40} />}</div>}
              <span className={'sl-badge ' + (p.is_active !== false ? 'approved' : 'pending')}>{p.is_active !== false ? 'Live' : 'Hidden'}</span>
            </div>
            <div className="b"><div className="n">{p.name}</div>
              <div className="sl-price">{taka(p.price)}{dealLive(p) && <s className="sl-old">{taka(p.old_price)}</s>}</div>
              {dealLive(p) && <div className="sl-dealtag">⚡ Deal until {when(p.deal_ends_at)}</div>}
              <div className={'sl-stk' + ((p.stock ?? 0) <= 5 ? ' low' : '')}>Stock {p.stock ?? 0}{(p.stock ?? 0) <= 5 ? ' · running low' : ''}</div>
              <div className="sl-acts">
                <button className="sl-btn ghost sm" onClick={() => setEdit(p)}>Edit</button>
                <button className="sl-btn ghost sm" onClick={() => toggle(p)}>{p.is_active !== false ? 'Hide' : 'Show'}</button>
                <button className="sl-btn bad sm" onClick={() => del(p)}>Delete</button>
              </div></div>
          </div>))}</div>
      )}
    </>
  )
}

function Questions() {
  const [rows, setRows] = useState(null), [err, setErr] = useState(''), [draft, setDraft] = useState({}), [busy, setBusy] = useState('')
  const load = useCallback(() => sellerQuestions().then(setRows).catch(x => { setErr(msg(x)); setRows([]) }), [])
  useEffect(() => { load() }, [load])
  const send = async q => {
    const a = (draft[q.id] || '').trim(); if (!a) return setErr('Write an answer first.')
    setBusy(q.id); setErr('')
    try { await answerQuestion(q.id, a); setDraft(d => ({ ...d, [q.id]: '' })); await load() } catch (x) { setErr(msg(x)) }
    setBusy('')
  }
  if (rows === null) return <p className="sl-mut">Loading…</p>
  const open = rows.filter(q => !q.answer).length
  return (
    <>
      <div className="sl-head"><div><h2>Customer questions</h2><p className="sl-mut">{open ? `${open} waiting for your answer. ` : 'You are all caught up. '}Answers appear on the product page and the customer is notified.</p></div></div>
      {err && <div className="sl-err">{err}</div>}
      {!rows.length ? <div className="sl-empty"><i><Ico n="bell" s={34} /></i><b>No questions yet</b><p>When a customer asks about one of your products, it shows up here.</p></div> : rows.map(q => (
        <div className="sl-card sl-q" key={q.id}>
          <div className="sl-mut">{q.product_name} · {q.user_name || 'Customer'} · {when(q.created_at)}</div>
          <p><b>Q:</b> {q.question}</p>
          {q.answer ? <p className="sl-a"><b>A:</b> {q.answer}</p> : <>
            <textarea rows={2} maxLength={600} placeholder="Write your answer…" value={draft[q.id] || ''} onChange={e => setDraft(d => ({ ...d, [q.id]: e.target.value }))} />
            <div className="sl-acts"><button className="sl-btn sm" disabled={busy === q.id} onClick={() => send(q)}>{busy === q.id ? 'Sending…' : 'Send answer'}</button></div></>}
        </div>))}
    </>
  )
}

// Sales overview: built only from this seller's own orders (the seller_orders RPC is already scoped to the seller).
const dayKey = d => { const x = new Date(d); return x.getFullYear() + '-' + x.getMonth() + '-' + x.getDate() }
function Overview({ shop, go }) {
  const [rows, setRows] = useState(null), [err, setErr] = useState('')
  useEffect(() => { sellerOrders().then(setRows).catch(x => { setErr(msg(x)); setRows([]) }) }, [])
  const s = useMemo(() => {
    const all = rows || [], live = all.filter(o => o.status !== 4), now = new Date()
    const sum = a => a.reduce((t, o) => t + Number(o.subtotal || 0), 0)
    const units = o => (o.lines || []).reduce((t, l) => t + Number(l.qty || 0), 0)
    const month = live.filter(o => { const d = new Date(o.created_at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() })
    const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(now); d.setDate(now.getDate() - (13 - i)); return { k: dayKey(d), label: d.toLocaleDateString('en-BD', { day: 'numeric', month: 'short' }), v: 0 } })
    const idx = Object.fromEntries(days.map((d, i) => [d.k, i]))
    live.forEach(o => { const i = idx[dayKey(o.created_at)]; if (i !== undefined) days[i].v += Number(o.subtotal || 0) })
    const top = {}
    live.forEach(o => (o.lines || []).forEach(l => { top[l.name] = (top[l.name] || 0) + Number(l.qty || 0) }))
    return {
      revenue: sum(live), monthRev: sum(month), orders: live.length, items: live.reduce((t, o) => t + units(o), 0),
      fresh: all.filter(o => !o.status).length, days, max: Math.max(1, ...days.map(d => d.v)),
      top: Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 5), week: days.slice(7).reduce((t, d) => t + d.v, 0),
    }
  }, [rows])
  if (rows === null) return <p className="sl-mut">Loading…</p>
  return (
    <>
      {err && <div className="sl-err">{err}</div>}
      <div className="sl-hero">
        <div>
          <span className="sl-hero-k">Total revenue</span>
          <b className="sl-hero-v">{taka(s.revenue)}</b>
          <span className="sl-hero-s">From {s.orders} order{s.orders === 1 ? '' : 's'} · cancelled orders not counted</span>
        </div>
        <div className="sl-hero-side"><span>Last 7 days</span><b>{taka(s.week)}</b></div>
      </div>
      <div className="sl-stats">
        <div className="sl-stat"><span className="ic" aria-hidden="true"><Ico n="calendar" s={22} /></span><div><b>{taka(s.monthRev)}</b><span className="sl-mut">This month</span></div></div>
        <div className="sl-stat ok"><span className="ic" aria-hidden="true"><Ico n="cart" s={22} /></span><div><b>{s.items}</b><span className="sl-mut">Items sold</span></div></div>
        <div className="sl-stat warn" role="button" tabIndex={0} onClick={() => go('orders')} onKeyDown={e => e.key === 'Enter' && go('orders')} style={{ cursor: 'pointer' }}><span className="ic" aria-hidden="true"><Ico n="bell" s={22} /></span><div><b>{s.fresh}</b><span className="sl-mut">New orders</span></div></div>
      </div>
      <div className="sl-two">
        <div className="sl-card">
          <h2>Sales, last 14 days</h2>
          {s.days.every(d => !d.v) ? <p className="sl-mut">No sales in this period yet.</p> : (
            <div className="sl-chart" role="img" aria-label="Daily revenue for the last 14 days">
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

// Sellers only see the delivery area. Customer name, phone and street address are never shown here: Pinkish processes and delivers every order.
const areaOf = a => {
  const direct = a?.city || a?.area || a?.district || a?.thana
  if (direct) return String(direct)
  const parts = String(a?.address || '').split(',').map(x => x.trim()).filter(Boolean)
  return parts.length ? parts.slice(-2).join(', ') : 'Location not available'
}
const STATUS = ['New', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled']
function Orders() {
  const [rows, setRows] = useState(null), [err, setErr] = useState('')
  useEffect(() => { sellerOrders().then(setRows).catch(x => { setErr(msg(x)); setRows([]) }) }, [])
  if (rows === null) return <p className="sl-mut">Loading…</p>
  return (
    <>
      <div className="sl-note"><span aria-hidden="true"><Ico n="truck" s={22} /></span><p><b>Pinkish handles everything after you sell.</b> We confirm, pack, ship and deliver every order, and we deal with the customer. You only see the delivery area.</p></div>
      {err && <div className="sl-err">{err}</div>}
      {!rows.length ? <div className="sl-empty"><i><Ico n="receipt" s={34} /></i><b>No orders yet</b><p>New orders from customers will show up here.</p></div> : rows.map(o => (
        <div className="sl-ord" key={o.id}>
          <div className="h"><b>#{o.order_no}</b><span className="tot">{taka(o.subtotal)}</span></div>
          <div className="meta"><span className={'sl-badge st' + (STATUS[o.status] ? o.status : 0)}>{STATUS[o.status] || 'New'}</span><span className="sl-mut">{when(o.created_at)} · {o.payment}{o.payment_status === 'paid' ? ' (paid)' : o.payment_status === 'unpaid' ? ' (collect on delivery)' : ''}</span></div>
          <ul>{(o.lines || []).map((l, i) => <li key={i}>{l.name}{l.variant ? ` (${l.variant})` : ''} × {l.qty}</li>)}</ul>
          <div className="ship"><span className="sl-loc"><Ico n="pin" s={15} />{areaOf(o.address)}</span></div>
        </div>))}
    </>
  )
}

const initial = n => String(n || 'S').trim().charAt(0).toUpperCase()
function ShopSettings({ shop, onSaved }) {
  const [f, setF] = useState({ name: shop.name, description: shop.description || '', phone: shop.phone, address: shop.address, city: shop.city || '' })
  const [err, setErr] = useState(''), [ok, setOk] = useState(''), [busy, setBusy] = useState(false), [lbusy, setLbusy] = useState(false)
  const set = k => v => setF(p => ({ ...p, [k]: v }))
  const go = async e => { e.preventDefault(); setErr(''); setOk(''); setBusy(true); try { onSaved(await updateShop(shop, f, null)); setOk('Shop details saved.') } catch (x) { setErr(msg(x)) } setBusy(false) }
  // The logo saves on its own the moment it is chosen
  const pickLogo = async e => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setErr(''); setOk(''); setLbusy(true)
    try { onSaved(await updateShop(shop, { name: shop.name, description: shop.description || '', phone: shop.phone, address: shop.address, city: shop.city || '' }, file)); setOk('Logo updated. It now shows on your products in the store.') } catch (x) { setErr(msg(x)) }
    setLbusy(false)
  }
  return (
    <div style={{ maxWidth: 600 }}>
      <div className="sl-card sl-brand">
        <span className="sl-av lg">{shop.logo_url ? <img src={shop.logo_url} alt="" /> : initial(shop.name)}</span>
        <div className="sl-brand-t">
          <h2>{shop.name}</h2>
          <p className="sl-mut">Your logo and name appear on every product you sell.</p>
          <label className={'sl-btn sm sl-up' + (lbusy ? ' dis' : '')}>{lbusy ? 'Uploading…' : shop.logo_url ? 'Change logo' : 'Upload logo'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickLogo} disabled={lbusy} /></label>
          <small className="sl-mut">Square image works best. JPG, PNG or WebP, max 3 MB.</small>
        </div>
      </div>
      <form className="sl-card" onSubmit={go}>
        <h2>Shop details</h2>{err && <div className="sl-err" role="alert">{err}</div>}{ok && <div className="sl-ok" role="status">{ok}</div>}
        <Inp label="Shop name" value={f.name} onChange={set('name')} maxLength={60} required />
        <Field label="About"><textarea rows={3} value={f.description} onChange={e => set('description')(e.target.value)} maxLength={500} /></Field>
        <div className="sl-row"><Inp label="Phone" value={f.phone} onChange={set('phone')} required /><Inp label="City" value={f.city} onChange={set('city')} /></div>
        <Inp label="Address" value={f.address} onChange={set('address')} required />
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
  return <div className="sl-card" style={{ borderColor: '#bbf7d0', background: '#f0fdf4' }}>
    <h2><Ico n="sparkle" s={20} /> {shop.name} is verified!</h2>
    <p className="sl-mut" style={{ color: '#166534' }}>You can now add products and they go live in the store straight away. Log in any time with {user?.email ? <b>{user.email}</b> : 'this account'} (your password or Google).</p>
    <button className="sl-btn sm" onClick={close}>Got it</button>
  </div>
}

export default function Seller() {
  const lock = useRef(false), [user, setUser] = useState(undefined), [shop, setShop] = useState(undefined), [tab, setTab] = useState('overview'), [err, setErr] = useState('')

  useEffect(() => {
    document.title = 'Seller Centre · Pinkish'
    try { sessionStorage.removeItem('pk_seller') } catch { /* storage unavailable */ }
    restoreUser().then(u => setUser(u || null)).catch(() => setUser(null))
    return onAuthChange((u, ev) => { if (ev === 'SIGNED_OUT') { setUser(null); setShop(undefined) } else if (u && !lock.current) setUser(u) })
  }, [])
  const loadShop = useCallback(async u => { setErr(''); try { setShop(await getMyShop(u.id)) } catch (x) { setErr(msg(x)); setShop(null) } }, [])
  useEffect(() => { if (user) loadShop(user) }, [user, loadShop])

  if (!supabase) return <div className="slx"><div className="sl-wrap"><div className="sl-err">The store is not configured.</div></div></div>
  if (user === undefined) return <div className="slx"><div className="sl-wrap sl-mut">Loading…</div></div>
  if (!user) return <div className="slx"><Auth onUser={setUser} lock={lock} /></div>

  const logout = () => signOut().then(() => { setUser(null); setShop(undefined) })
  const top = (
    <div className="sl-top"><div className="sl-top-in">
      <div className="sl-who"><span className="sl-logo" aria-label="Pinkish Seller Centre"><img className="bmk" src="/logo-mark.webp?v=2" width="34" height="34" alt="" decoding="async" /><span className="wm"><span className="bp">Pink</span><span className="bi">ish</span></span><em className="sl-tag">Seller</em></span>{shop && <span className="sl-shopname"><span className="sl-av">{shop.logo_url ? <img src={shop.logo_url} alt="" /> : initial(shop.name)}</span><span className="sl-mut">{shop.name}</span> <span className={'sl-badge ' + shop.status}>{shop.status}</span></span>}</div>
      <div className="sl-acts"><a className="sl-btn ghost sm" href="/" style={{ textDecoration: 'none' }}>View store</a><button className="sl-btn ghost sm" onClick={logout}>Log out</button></div>
    </div></div>
  )
  const errBox = err && <div className="sl-wrap"><div className="sl-err">{err}</div></div>
  if (shop && shop.status === 'approved') {
    const NAV = [['overview', 'Overview', 'overview'], ['products', 'Products', 'box'], ['orders', 'Orders', 'receipt'], ['questions', 'Questions', 'bell'], ['shop', 'Shop', 'store']]
    const TITLE = { overview: 'Overview', products: 'Products', orders: 'Orders', questions: 'Questions', shop: 'Shop settings' }
    return (
      <div className="slx app"><div className="shell">
        <nav className="sb" aria-label="Seller sections">
          <div className="brand"><span className="bm"><img src="/logo-mark.webp?v=2" width="26" height="22" alt="" decoding="async" /></span><span className="bp">Pink</span><span className="bi">ish</span></div>
          <div className="me"><span className="mav" aria-hidden="true">{shop.logo_url ? <img src={shop.logo_url} alt="" /> : initial(shop.name)}</span><b>{shop.name}</b><small>Seller Centre</small></div>
          <div className="nv">{NAV.map(([k, l, ic]) => <button key={k} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}><span className="ic" aria-hidden="true"><Ico n={ic} s={20} /></span><span className="lb">{l}</span></button>)}</div>
          <div className="sp" />
          <a className="lo vs" href="/"><i aria-hidden="true"><Ico n="bag" s={15} /></i>View store</a>
          <button className="lo" onClick={logout}><i aria-hidden="true"><Ico n="out" s={15} /></i>Log out</button>
        </nav>
        <main className="mn">
          <header className="top"><h1>{TITLE[tab]}</h1><div className="ta"><a className="ib2" href="/" aria-label="View store"><Ico n="bag" s={20} /></a><button className="ib2 mo" aria-label="Log out" onClick={logout}><Ico n="out" s={20} /></button></div></header>
          <div className="scr"><div className="pg" key={tab}>
            {err && <div className="sl-err">{err}</div>}
            <Welcome shop={shop} user={user} />
            {!shop.logo_url && tab !== 'shop' && <div className="sl-card sl-nudge"><span className="sl-av">{initial(shop.name)}</span><div><b>Add your shop logo</b><p className="sl-mut">Customers see your logo and name on every product. It takes a few seconds.</p></div><button className="sl-btn sm" onClick={() => setTab('shop')}>Add logo</button></div>}
            {tab === 'overview' && <Overview shop={shop} go={setTab} />}
            {tab === 'products' && <Products shop={shop} />}
            {tab === 'orders' && <Orders />}
            {tab === 'questions' && <Questions />}
            {tab === 'shop' && <ShopSettings shop={shop} onSaved={setShop} />}
          </div></div>
        </main>
      </div></div>
    )
  }
  let body
  if (shop === undefined) body = <div className="sl-wrap sl-mut">Loading…</div>
  else if (!shop || shop.status === 'rejected') body = <ShopForm user={user} shop={shop} onDone={setShop} />
  else body = <Waiting shop={shop} onRefresh={() => loadShop(user)} />
  return <div className="slx">{top}{errBox}{body}</div>
}
