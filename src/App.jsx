import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as api from './api'
import { HUB, RIDER_KM, deliveryFor, kmTxt, okLL, havKm, modeOf, orderZone, ZONE, setDeliveryCfg, safeUrl, etaMin, seenAgo, fresh } from './lib/zone.js'
import { makeIndex, searchIn as fuzzySearch, norm as fnorm, words as fwords, dist as fdist } from './lib/search.js'
import { LiveMap, loadLeaflet, usePoll } from './lib/LiveMap.jsx'

const taka = n => '৳' + Math.round(n).toLocaleString()
const NONE = [] // shared empty list: keeps memoised children from redrawing
// Shared product links look like /?p=<id>: remember the id, then tidy the address bar.
const DEEP = (() => { try { const u = new URL(location.href), p = u.searchParams.get('p'); if (p) { u.searchParams.delete('p'); history.replaceState(history.state, '', u.pathname + u.search + u.hash) } return p } catch { return null } })()

// ===== Delivery zone (Bahaddarhat hub, Chattogram): shared with admin, rider and seller apps =====
// ≤ 4 km: a Pinkish rider delivers · 4–30 km: Pathao or a partner courier delivers (see src/lib/zone.js)
const OUT_MSG = 'Sorry, we deliver inside Bangladesh only. Pin your delivery location on the map.'
const PIN_MSG = 'Pin your delivery location on the map so we can price your delivery.'
const feeTxt = d => d.fee == null ? 'Not available' : d.free ? 'Free' : '৳' + d.fee
const NAV = [['home', 'home', 'Home'], ['categories', 'grid', 'Categories'], ['cart', 'bag', 'Cart'], ['orders', 'receipt', 'Orders'], ['profile', 'user', 'Profile']]
const TABS = NAV.map(n => n[0])
const STEPS = ['Order Placed', 'Processing', 'Out for Delivery', 'Delivered']
const PAYS = [['Cash on Delivery', 'Pay when you receive', '💵'], ['bKash', 'Send money, then enter your TrxID', '🌸'], ['Nagad', 'Pay with Nagad', '🟠'], ['Debit/Credit Card', 'Visa, Mastercard', '💳']]
const OFFERS = [['Limited Offer', 'Privacy. Confidence.|Comfort. Wellness.', '🛡️'], ['Delivery from ৳40', 'Discreet delivery|across Bangladesh', '🚚'], ['Use code SHIELD10', 'Get 10% off|your first order', '🎁']]
const SORTS = { pop: ['Popular', (a, b) => (b.reviews || 0) - (a.reviews || 0)], new: ['Newest', (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)], lo: ['Price: Low → High', (a, b) => a.price - b.price], hi: ['Price: High → Low', (a, b) => b.price - a.price], rate: ['Top rated', (a, b) => b.rating - a.rating] }
const RIPPLE = '.nav button,.oc,.nt-i,.store.link,.wl-skip,.wl-bars button,.bshop,.cc,.btn,.fab,.add,.cat,.card,.pay,.menu,.ib,.tabs button,.chips button,.var button,.heart,.qty button,.promo button,.social'
const NOMOTION = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

// graceful API wrapper: never throws, returns fallback
const safe = async (fn, fb = null) => { try { return await fn() } catch { return fb } }
const readLS = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage full / blocked */ } }
const PayLogo = ({ k }) => {
  const box = { width: 64, height: 44, borderRadius: 12, flex: 'none', display: 'block', boxShadow: '0 4px 10px #4a166822' }
  const t = { fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif' }
  if (k === 1) return <svg style={box} viewBox="0 0 64 44" role="img" aria-label="bKash"><rect width="64" height="44" rx="12" fill="#E2136E" /><path d="M9 9l9 3-4 8z" fill="#fff" opacity=".9" /><path d="M9 9l5 11-8 2z" fill="#ffd1e5" /><text x="34" y="29" textAnchor="middle" fill="#fff" fontSize="15" fontWeight="800" fontStyle="italic" style={t}>bKash</text></svg>
  if (k === 2) return <svg style={box} viewBox="0 0 64 44" role="img" aria-label="Nagad"><defs><linearGradient id="ng" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F7941D" /><stop offset="1" stopColor="#ED1C24" /></linearGradient></defs><rect width="64" height="44" rx="12" fill="url(#ng)" /><circle cx="14" cy="22" r="6" fill="none" stroke="#fff" strokeWidth="3" /><text x="40" y="27" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="800" style={t}>Nagad</text></svg>
  if (k === 3) return <svg style={box} viewBox="0 0 64 44" role="img" aria-label="Card"><rect width="64" height="44" rx="12" fill="#1a1f71" /><circle cx="25" cy="22" r="10" fill="#EB001B" /><circle cx="39" cy="22" r="10" fill="#F79E1B" /><path d="M32 13.7a10 10 0 0 1 0 16.6 10 10 0 0 1 0-16.6z" fill="#FF5F00" /></svg>
  return <svg style={box} viewBox="0 0 64 44" role="img" aria-label="Cash on delivery"><rect width="64" height="44" rx="12" fill="#1f8a54" /><rect x="12" y="12" width="40" height="20" rx="4" fill="#fff" opacity=".95" /><circle cx="32" cy="22" r="6" fill="#1f8a54" /><text x="32" y="26" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="800" style={t}>৳</text><circle cx="17" cy="22" r="1.8" fill="#1f8a54" /><circle cx="47" cy="22" r="1.8" fill="#1f8a54" /></svg>
}
const devId = () => { let d = readLS('ms_dev', null); if (!d) { d = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'd' + Date.now() + Math.random().toString(36).slice(2); writeLS('ms_dev', d) } return d }
const realUid = u => (u?.id && u.id !== 'local' ? u.id : null)

/* ---------- Liquid button skin: injected once, layered on top of styles.css ---------- */
const LIQUID_CSS = `
/* specular light that follows the pointer */
.btn::before{inset:0;background:radial-gradient(130px circle at var(--mx,-999px) var(--my,-999px),#ffffff8c,#fff0 70%),linear-gradient(#ffffff40,#ffffff00 52%)}
.fab::before,.add::before,.ib::before,.heart::before,.qty button::before,.chips button::before,.var button::before,.promo button::before{content:'';position:absolute;inset:0;border-radius:inherit;background:radial-gradient(70px circle at var(--mx,-999px) var(--my,-999px),#ffffffb0,#fff0 70%);opacity:0;transition:opacity .35s;pointer-events:none;z-index:-1}
/* liquid shape: buttons breathe like a droplet */
@keyframes lqWob{0%,100%{border-radius:18px 24px 18px 24px/24px 18px 24px 18px}50%{border-radius:24px 18px 26px 18px/18px 26px 18px 24px}}
@keyframes lqBlob{0%,100%{border-radius:50%}33%{border-radius:56% 44% 52% 48%/47% 55% 45% 53%}66%{border-radius:45% 55% 47% 53%/54% 46% 54% 46%}}
@keyframes lqRp{from{transform:scale(0);opacity:1}to{transform:scale(1);opacity:0}}
@keyframes lqPop{0%{transform:scale(1)}28%{transform:scale(.8,1.14)}56%{transform:scale(1.12,.9)}80%{transform:scale(.97,1.03)}100%{transform:scale(1)}}
@keyframes lqGlow{0%,100%{filter:drop-shadow(0 0 0 #e0457b00)}50%{filter:drop-shadow(0 4px 10px #e0457b66)}}
.btn:not(:disabled):active{transform:scale(.95,.9);border-radius:28px 28px 28px 28px/22px 22px 22px 22px}
.fab,.add{animation:lqBlob 6s ease-in-out infinite,lqGlow 3.2s ease-in-out infinite}
.lq-pop{animation:lqPop .55s var(--spring) !important}
/* richer, rounder ripple: a soft ring plus a glow core */
.rp{background:radial-gradient(circle,#fff0 0,#fff0 40%,#ffffff99 50%,#ffffff40 60%,#fff0 72%),radial-gradient(circle,#ffffffb3,#fff0 58%);animation:lqRp .85s var(--ease) forwards}
.btn.o .rp,.ib .rp,.heart .rp,.qty button .rp,.chips button:not(.on) .rp,.var button:not(.on) .rp,.menu .rp,.pay .rp,.cat .rp,.card .rp,.tabs button:not(.on) .rp{background:radial-gradient(circle,#fff0 0,#fff0 40%,#e0457b55 50%,#8e2a8c26 60%,#fff0 72%),radial-gradient(circle,#e0457b33,#fff0 58%)}
/* selected pills & variants get a living gradient */
.chips .on,.var .on{background-size:220% 100%;box-shadow:0 8px 20px #8e2a8c55,inset 0 1.5px 0 #ffffff70,inset 0 -6px 10px #4a166844}
.chips button,.var button,.qty button,.promo button,.ib,.heart{transition:transform .4s var(--spring),box-shadow .3s,background-color .3s}
@media (hover:hover){
  .btn:not(.o):not(:disabled):hover{animation:lqWob 1.6s ease-in-out infinite;filter:saturate(1.12) brightness(1.04)}
  .btn.o:hover{box-shadow:0 12px 26px #8e2a8c33,inset 0 1px 0 #fffd;transform:translateY(-2px)}
  .fab:hover,.add:hover{transform:scale(1.14);box-shadow:0 12px 26px #e0457b77,inset 0 1.5px 0 #ffffff90,inset 0 -6px 10px #4a166844}
  .ib:hover,.heart:hover,.qty button:hover{transform:translateY(-2px) scale(1.08);box-shadow:0 10px 22px #8e2a8c40,inset 0 1px 0 #fffd}
  .chips button:hover,.var button:hover{transform:translateY(-2px);box-shadow:0 10px 22px #8e2a8c33,inset 0 1px 0 #fffd}
  .promo button:hover{filter:brightness(1.12)}
  .fab:hover::before,.add:hover::before,.ib:hover::before,.heart:hover::before,.qty button:hover::before,.chips button:hover::before,.var button:hover::before,.promo button:hover::before{opacity:1}
}
/* ---------- Profile page ---------- */
.scr.narrow.pf{max-width:880px}
.pf{display:grid;grid-auto-rows:max-content;gap:20px;align-content:start}
.pf>*{min-width:0;flex-shrink:0}
.pf-hero{position:relative;overflow:hidden;min-height:132px;border-radius:30px;padding:24px 26px;display:flex;align-items:center;gap:18px;color:#fff;background:linear-gradient(125deg,#4a1668,#8e2a8c 55%,#e0457b);box-shadow:0 22px 44px #8e2a8c44,inset 0 1px 0 #ffffff66}
.pf-hero::before{content:'';position:absolute;width:260px;height:260px;right:-70px;top:-110px;border-radius:50%;background:radial-gradient(circle,#ffffff50,#fff0 70%)}
.pf-hero::after{content:'';position:absolute;width:200px;height:200px;left:30%;bottom:-130px;border-radius:50%;background:radial-gradient(circle,#ff9ac455,#fff0 70%)}
.pf-av{position:relative;z-index:1;flex:none;padding:5px;border-radius:50%;background:#ffffff38;box-shadow:0 0 0 1px #ffffff66,0 12px 26px #4a166866}
.pf-av .av{width:82px;height:82px;font-size:34px;background:#fff;color:var(--p2);box-shadow:inset 0 -8px 14px #8e2a8c22}
.pf-id{position:relative;z-index:1;min-width:0;display:grid;gap:2px;justify-items:start}
.pf-id em{font-style:normal;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#ffffffb8;font-weight:600}
.pf-id b{font-size:24px;line-height:1.2;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pf-id small{color:#ffffffd0;font-size:13px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pf-bd{margin-top:8px;font-size:11px;font-weight:700;padding:4px 11px;border-radius:99px;background:#ffffff2e;border:1px solid #ffffff55}
.pf-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.pf-stats>*{display:grid;grid-template-columns:44px 1fr;grid-template-rows:auto auto;align-items:center;column-gap:12px;text-align:left;padding:14px;border-radius:22px;background:var(--glass);border:1px solid var(--edge);box-shadow:var(--sh);transition:transform .35s var(--spring),box-shadow .3s}
.pf-stats i{grid-row:span 2;width:44px;height:44px;border-radius:14px;display:grid;place-items:center;font-style:normal;font-size:20px;box-shadow:inset 0 1px 0 #fffb,0 4px 10px #4a166814}
.pf-stats b{font-size:18px;color:var(--p1);align-self:end;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pf-stats small{color:var(--mute);font-size:11px;align-self:start}
.pf-stats button:active{transform:scale(.95)}
@media (hover:hover){.pf-stats button:hover{transform:translateY(-3px);box-shadow:0 16px 30px #8e2a8c2e,inset 0 1px 0 #fffd}}
.pf-cols{display:grid;grid-template-columns:1fr;gap:20px;align-items:start}
.pf-col{display:grid;gap:20px;align-content:start;min-width:0}
@media (min-width:900px){.pf-cols{grid-template-columns:1fr 1fr}}
.pf-t{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--mute);margin:0 6px 8px;font-weight:700}
.pf-g{border-radius:26px;overflow:hidden;background:var(--glass);border:1px solid var(--edge);box-shadow:var(--sh)}
.pf .pm{align-items:center;gap:14px;padding:12px 16px;min-height:68px;border-radius:0;border-bottom:1px solid #4a166812}
.pf .pm:last-child{border-bottom:0}
.pi{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;font-size:20px;flex:none;box-shadow:inset 0 1px 0 #fffb,0 4px 10px #4a166814}
.pt{display:grid;gap:1px;text-align:left;min-width:0}.pt b{color:var(--ink);font-size:15px}.pt small{color:var(--mute);font-size:12px;font-weight:400}
.pf .pm>span:last-child{font-size:24px;line-height:1;transition:transform .3s var(--spring)}
@media (hover:hover){.pf .pm:hover{background:#ffffff80}.pf .pm:hover>span:last-child{transform:translateX(4px);color:var(--p3)}}
.pf .pf-out{justify-content:center;align-items:center;gap:10px;padding:15px;min-height:56px;border-radius:22px;border:1.5px solid #f6c6d3;background:linear-gradient(145deg,#fff3f6,#ffe7ee);color:#c62d4a;font-weight:700;box-shadow:0 8px 20px #c62d4a1a}
.pf .pf-out span:last-child{margin-left:0;color:inherit}
@media (max-width:520px){.pf-hero{padding:20px 18px;gap:14px}.pf-av .av{width:68px;height:68px;font-size:28px}.pf-stats{grid-template-columns:1fr 1fr}.pf-stats>:last-child{grid-column:span 2}}
/* ================= Modern shop layout (same brand colours) ================= */
.ico{display:block;flex:none}
.hdr{display:grid;grid-template-columns:46px 1fr 46px;align-items:center;gap:12px;text-align:center;background:none;-webkit-backdrop-filter:none;backdrop-filter:none;font-size:17px}
.hdr .ht{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hdr .ib,.topbar .ib{width:46px;height:46px;background:#fff;color:var(--ink);box-shadow:0 6px 18px #4a166822}
.ib.ghost{visibility:hidden;pointer-events:none}
.ib .cb{position:absolute;top:4px;right:3px;margin:0;min-width:17px;text-align:center;font-size:10px;line-height:1.5}
.topbar{display:flex;align-items:center;justify-content:space-between;gap:12px}
.loc{display:grid;text-align:center;gap:1px}.loc small{font-size:11px}.loc b{font-size:14px}
.search{min-height:56px;border-radius:999px;padding:0 7px 0 18px;margin:14px 0;background:#fff;color:var(--mute);box-shadow:0 8px 24px #4a16681a}
.search input{color:var(--ink);padding:16px 4px;min-width:0}
.sf{width:42px;height:42px;border-radius:50%;flex:none;display:grid;place-items:center;background:#f6effb;color:var(--p1)}
.bw{margin:2px 0 6px}
.banner{font-size:inherit;margin:0;min-height:176px;padding:22px;border-radius:30px;display:flex;align-items:center}
.bt{max-width:62%;align-items:flex-start;gap:6px}
.bchip{background:var(--ink);color:#fff;font-size:11px;font-weight:600;padding:5px 12px;border-radius:99px}
.bt h3{display:grid;font-size:19px;line-height:1.2;font-weight:800;margin-top:4px}
.bshop{display:inline-flex;align-items:center;gap:12px;margin-top:10px;padding:6px 6px 6px 18px;border-radius:999px;background:var(--ink);color:#fff;font-weight:700;font-size:14px;position:relative;overflow:hidden;isolation:isolate}
.bshop i{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:#fff;color:var(--ink);font-style:normal;font-size:16px}
.be{top:0;bottom:0;right:16px;display:grid;place-items:center}
.bd{position:static;justify-content:center;margin-top:10px}
.bd i{background:#d9c8ea}.bd i.on{width:22px;background:var(--grad)}
.sec{align-items:center;font-size:17px;margin:14px 2px 12px}.sec a{font-size:13px}
.catrow{display:flex;gap:10px;overflow-x:auto;padding:2px 2px 14px;scrollbar-width:none}.catrow::-webkit-scrollbar{display:none}
.cc{flex:none;display:flex;align-items:center;gap:10px;padding:8px 8px 8px 16px;border-radius:22px;background:#fff;border:1px solid var(--edge);box-shadow:0 6px 18px #4a16681a;position:relative;overflow:hidden;isolation:isolate;transition:transform .35s var(--spring)}
.cc b{font-size:14px;text-align:left;line-height:1.2;max-width:84px}
.cc span{width:46px;height:46px;border-radius:16px;background:linear-gradient(135deg,#f3e9fb,#fde7f0);display:grid;place-items:center;font-size:24px}
.cc span img{width:1.2em;height:auto;display:block}
.cc:active{transform:scale(.95)}
.card{padding:8px 8px 12px;border-radius:26px;background:linear-gradient(#fff,#fffafd);box-shadow:0 10px 26px #4a16681f}
.card .pic{height:auto;aspect-ratio:1/1.05;border-radius:20px;font-size:60px}
.card .heart{left:auto;right:14px;top:14px;background:#fff}
.card .cinfo{display:grid;gap:2px;padding:10px 6px 0}
.card .cinfo small{padding:0;font-size:11px}
.card .cinfo h4{margin:0;font-size:14px;min-height:2.6em;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.cfoot{display:flex;align-items:center;justify-content:space-between;margin-top:6px}
.card .cfoot b{padding:0;margin:0;font-size:16px}
.card .cfoot .add{position:relative;right:auto;bottom:auto;width:36px;height:36px;font-size:20px}
.skel{height:230px;border-radius:26px}
.chips button{background:#fff;border-radius:999px;min-height:42px}
.cats .cat,.cats .cat:nth-child(2n){border-radius:26px;background:linear-gradient(160deg,#fff,#fdf3f8)}
.pd .big{height:auto;aspect-ratio:1/.92;max-height:44vh;border-radius:30px;margin-bottom:0;font-size:120px}
.pdp{gap:16px}
.pdp-info{display:grid;gap:12px;align-content:start}
.pk{text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--mute);font-weight:600}
.pdp-info .row{gap:12px;align-items:flex-start}.pdp-info .row h3{font-size:24px;line-height:1.15}
.heart.inl{left:auto;top:auto;right:auto;width:46px;height:46px;background:#fff;box-shadow:0 6px 18px #4a166822}
.store{display:flex;align-items:center;gap:12px;padding:10px;border-radius:22px;background:#fff;border:1px solid var(--edge);box-shadow:0 6px 18px #4a166814}
.store .sl{width:46px;height:46px;border-radius:14px;background:linear-gradient(135deg,#f3e9fb,#fde7f0);display:grid;place-items:center;flex:none}.store .sl img{width:28px;height:auto}
.store>div{flex:1;min-width:0;display:grid}.store b{font-size:14px}.store small{font-size:12px}
.store .vf{display:inline-grid;place-items:center;width:16px;height:16px;border-radius:50%;background:var(--grad);color:#fff;font-size:10px;font-style:normal;margin-left:6px;vertical-align:middle}
.store .fl{padding:9px 16px;border-radius:999px;background:var(--ink);color:#fff;font-size:13px;font-weight:600}
.store .sl.shop{overflow:hidden;background:linear-gradient(135deg,#fde7f0,#efe0fb)}.store .sl.shop img{width:100%;height:100%;object-fit:contain}.store .sl.shop em{font-style:normal;font-weight:800;font-size:20px;color:#b0236b}
.store b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.store.link{cursor:pointer;transition:transform .15s,box-shadow .15s}.store.link:hover{box-shadow:0 10px 24px #4a166826}.store.link:active{transform:scale(.99)}.store.link:focus-visible{outline:3px solid #f5b8d6;outline-offset:2px}
.shp{display:flex;align-items:center;gap:16px;padding:16px;border-radius:24px;background:linear-gradient(135deg,#fff,#fbf1fb);border:1px solid var(--edge);box-shadow:0 8px 22px #4a166814;margin-bottom:14px}
.shp-lg{flex:none;width:76px;height:76px;border-radius:22px;overflow:hidden;display:grid;place-items:center;background:linear-gradient(135deg,#fde7f0,#efe0fb);box-shadow:0 8px 20px #7a1d8c33}
.shp-lg img{width:100%;height:100%;object-fit:contain}.shp-lg em{font-style:normal;font-weight:800;font-size:32px;color:#b0236b}
.shp-cv{position:relative;width:100%;aspect-ratio:3/1;max-height:240px;border-radius:24px 24px 0 0;overflow:hidden;background:linear-gradient(135deg,#fde7f0,#efe0fb)}
.shp-cv img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block}
.shp.has-cv{border-radius:0 0 24px 24px}.shp.has-cv .shp-lg{margin-top:-34px;box-shadow:0 0 0 4px #fff,0 8px 20px #7a1d8c33}
@media (max-width:520px){.shp-cv{aspect-ratio:2/1}.shp.has-cv .shp-lg{margin-top:-26px}}
.shp-t{display:grid;gap:3px;min-width:0}.shp-t b{font-size:19px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.shp-t .vf{display:inline-grid;place-items:center;width:17px;height:17px;border-radius:50%;background:var(--grad);color:#fff;font-size:10px;font-style:normal;margin-left:7px;vertical-align:middle}
.shp-t small{font-size:13px;color:var(--mute)}.shp-n{justify-self:start;margin-top:4px;padding:4px 12px;border-radius:999px;background:#f4ecf8;color:#6b5b7b;font-size:12px;font-weight:600}
.opt{display:flex;justify-content:space-between;align-items:flex-end;gap:12px}
.opt-l{display:grid;gap:8px;min-width:0;flex:1}.opt-l>span,.opt-r>span{font-size:12px;color:var(--mute);font-weight:600}
.pdp-info .var{margin:0;gap:8px}
.pdp-info .var button{flex:0 0 auto;min-width:54px;min-height:46px;padding:0 14px;border-radius:14px;background:#fff;font-weight:600}
.pdp-info .var .on{background:var(--grad);color:#fff}
.opt-r{display:grid;gap:8px;justify-items:end}
.pdp-info .qty{background:#fff;border:1px solid var(--line);border-radius:16px;padding:4px;gap:4px;box-shadow:0 6px 18px #4a166814;font-weight:700}
.pdp-info .qty button{border:0;width:38px;height:38px;border-radius:12px;background:#f6effb;color:var(--p1)}
.pdp-info .qty button:last-child{background:var(--grad);color:#fff}
.qn{min-width:26px;text-align:center}
.dsc h5{font-size:12px;color:var(--mute);margin-bottom:4px;text-transform:uppercase;letter-spacing:.08em}
.buybar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:6px 14px calc(14px + env(safe-area-inset-bottom));padding:9px 9px 9px 22px;border-radius:999px;background:#ffffffee;border:1px solid var(--edge);box-shadow:0 16px 40px #4a166833;position:relative;z-index:6}
.buybar small{display:block;color:var(--mute);font-size:12px}.buybar b{font-size:22px;font-weight:800;color:var(--p1)}
.btn.buy{width:auto;flex:none;padding:0 26px;display:inline-flex;align-items:center;justify-content:center;gap:8px}
.item{border-radius:26px;background:#fff;box-shadow:0 8px 22px #4a166818}
.item .pic{width:84px;height:84px;border-radius:18px;font-size:38px}
.item .qty{background:#f6effb;border-radius:999px;padding:3px;gap:4px}
.item .qty button{width:34px;height:34px;border:0;background:#fff;color:var(--p1)}
.item .qty button:last-child{background:var(--grad);color:#fff}
.sum{background:#fff;border-radius:24px;padding:16px;box-shadow:0 8px 22px #4a166818;margin-top:6px}
.promo{border-radius:999px;background:#fff;padding:5px}.promo input{padding:12px 16px}.promo button{border-radius:999px}
.inp{border-radius:18px;background:#fff;border:1.5px solid var(--line)}
.pay{border-radius:22px;background:#fff;padding:16px}
.tl{background:#fff;border-radius:24px;padding:18px 18px 4px;box-shadow:0 8px 22px #4a166818}
.way{border-radius:22px}
.stp{display:flex;justify-content:space-between;position:relative;margin:2px 6px 18px}
.stp::before{content:'';position:absolute;left:16%;right:16%;top:15px;height:2px;background:var(--line)}
.stp>div{position:relative;display:grid;justify-items:center;gap:6px;font-size:12px;color:var(--mute);flex:1}
.stp i{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-weight:700;font-size:13px;background:#fff;border:2px solid var(--line);color:var(--mute)}
.stp .on{color:var(--p1);font-weight:600}.stp .on i{background:var(--grad);border-color:transparent;color:#fff}
@media(max-width:899px){
 .nav{margin:4px 14px calc(10px + env(safe-area-inset-bottom));padding:6px;gap:2px;border-radius:999px;border:1px solid var(--edge);background:#ffffffe6;box-shadow:0 16px 40px #4a166833;justify-content:space-between}
 .nav button{flex:1;min-height:50px;font-size:0;flex-direction:row;gap:8px;border-radius:999px;justify-content:center}
 .nav button::before{inset:0;border-radius:999px;background:linear-gradient(135deg,#f6e9fb,#fde7f0);box-shadow:inset 0 1px 0 #fff}
 .nav button span{font-size:22px}
 .nav .on{flex:0 0 auto;padding:0 20px;font-size:13px}
 .nav .on span{filter:none;opacity:1;transform:none;font-size:20px}
 .nav em{top:6px;right:calc(50% - 22px)}.nav .on em{right:10px}
 .toast{bottom:calc(92px + env(safe-area-inset-bottom))}
}
@media(min-width:900px){
 .buybar{max-width:760px;width:calc(100% - 48px);margin:8px auto 20px}
 .pd .big{aspect-ratio:auto;height:420px;max-height:none}
 .bt{max-width:55%}.bt h3{font-size:30px}
}
/* ================= Mobile polish & performance ================= */
.add{animation:none}
.fab{animation:lqBlob 6s ease-in-out infinite}
@media(max-width:899px){
 .app::before{animation:none}
 .pg>.scr:not(:first-child){padding-top:10px}
 .pg>.scr:last-child{padding-bottom:calc(24px + env(safe-area-inset-bottom))}
 .btn,.ib,.cc,.chips button,.var button,.add,.menu,.nav button,.heart,.qty button{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
 img{-webkit-touch-callout:none}
 .hdr{position:relative;padding-bottom:6px}
 .banner{min-height:168px}
 .store .fl{padding:8px 14px}
 .opt{flex-wrap:wrap}
}
@media(max-width:360px){.bt{max-width:68%}.bt h3{font-size:17px}.buybar{padding-left:16px}.btn.buy{padding:0 18px}}
/* ---------- delivery address ---------- */
.loc{text-align:left;max-width:70%;padding:4px 8px 4px 2px;border-radius:14px;justify-items:start}
.loc b{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.loc b i{font-style:normal;color:var(--p3)}
.lbl{display:grid;gap:6px;font-size:12px;font-weight:600;color:var(--mute);margin-bottom:12px}
.lbl .inp{margin:0;font-weight:400;color:var(--ink);resize:none}
.chips.wrap{flex-wrap:wrap;overflow:visible;padding:0 0 16px;gap:8px}
.chips.wrap button{flex:none;padding:0 16px;min-height:40px;line-height:1;font-size:14px}
.lbl{font-size:13px}
.prev{display:flex;gap:12px;align-items:center;padding:14px;border-radius:22px;background:#fff;border:1px solid var(--edge);box-shadow:0 6px 18px #4a166814;margin-bottom:16px}
.prev>span{width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,#f3e9fb,#fde7f0);display:grid;place-items:center;font-size:20px;flex:none}
.prev div{display:grid;min-width:0}.prev b{font-size:14px;overflow-wrap:anywhere}.prev small{font-size:11px}
.buybar.one{padding:8px}.buybar.one .btn{width:100%}
/* ---------- modern navigation buttons ---------- */
.nav button span{display:grid;place-items:center;line-height:0;filter:none;opacity:1}
.nav .ico{width:22px;height:22px}
.nav button{transition:color .25s,transform .3s var(--spring)}
.nav button:active{transform:scale(.92)}
.nav button.on{color:#fff}
.nav button.on::before{opacity:1;transform:none;background:var(--grad);box-shadow:inset 0 1.5px 0 #ffffff77,inset 0 -8px 12px #2d0b4a40,0 10px 20px -6px #ff3358aa}
.nav button.on span{filter:none;opacity:1;animation:lqPop .5s var(--spring)}
.nav button.on em{background:#fff;color:var(--coral);box-shadow:none}
@media(min-width:900px){.nav button.on{color:#fff}.nav button.on span{transform:none}}
/* ---------- modern profile buttons ---------- */
.pi,.pf-stats i{transition:background .3s,color .3s,transform .35s var(--spring)}
.pi .ico,.pf-stats i .ico{width:22px;height:22px}
.t1{background:linear-gradient(135deg,#ffeaf0,#ffd3df);color:#e0457b}
.t2{background:linear-gradient(135deg,#f6ecfc,#e6d3f7);color:#8e2a8c}
.t3{background:linear-gradient(135deg,#efe8fb,#dccff4);color:#4a1668}
.pf .pm .chev{width:30px;height:30px;border-radius:50%;background:#f6effb;color:var(--p1);display:grid;place-items:center;font-size:0;margin-left:auto;transition:background .3s,color .3s,transform .3s var(--spring)}
.pf .pm .chev .ico{width:16px;height:16px}
.pf .pm:active .pi{transform:scale(.92)}
@media(hover:hover){
 .pf .pm:hover .pi,.pf-stats button:hover i{background:var(--grad);color:#fff}
 .pf .pm:hover .chev{background:var(--grad);color:#fff;transform:translateX(3px)}
}
.pf .pf-out{background:#fff;border:1.5px solid #ffd0da;color:#d12a4f;box-shadow:0 8px 20px #ff33581f;gap:12px;transition:background .3s,color .3s,transform .35s var(--spring)}
.pf .pf-out span:first-child{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:#fff0f3;color:#d12a4f;transition:background .3s,color .3s}
.pf .pf-out .ico{width:18px;height:18px}
.pf .pf-out:active{transform:scale(.97)}
@media(hover:hover){.pf .pf-out:hover{background:linear-gradient(120deg,#ff7a9c,#ff3358 55%,#b8174f);border-color:transparent;color:#fff}.pf .pf-out:hover span:first-child{background:#ffffff33;color:#fff}}
/* ---------- Login v2: compact logo, aligned fields, modern glass ---------- */
.auth{padding:calc(18px + env(safe-area-inset-top)) max(20px,env(safe-area-inset-right)) calc(18px + env(safe-area-inset-bottom)) max(20px,env(safe-area-inset-left))}
.auth-in{max-width:380px;display:flex;flex-direction:column;align-items:center;margin:auto}
.auth .lgcard{width:clamp(104px,30vw,128px);padding:12px 14px;margin:0 auto 10px;border-radius:28px;box-shadow:inset 0 2px 8px #fff,0 14px 32px #1a063a55,0 0 0 6px #ffffff1a}
.auth .lgcard img{animation-duration:4s}
.auth .tag{font-size:12px;letter-spacing:.08em;margin:0 0 18px;color:#ffffffc9;text-align:center}
.auth .auth-card{width:100%;margin:0;padding:14px;border-radius:30px;display:grid;gap:12px;align-content:start}
.auth .auth-card>*{margin:0}
.auth .tabs{height:50px;padding:4px}
.auth .tabs button{padding:0;display:grid;place-items:center;font-size:15px}
.auth .fld{min-height:56px;padding:0 8px 0 7px;gap:10px;border-radius:18px}
.auth .fld .fi{width:40px;height:40px;border-radius:13px;display:grid;place-items:center;flex:none;background:#ffffff2b;color:#fff;opacity:1;box-shadow:inset 0 1px 0 #ffffff40}
.auth .fld .fi .ico{width:20px;height:20px}
.auth .fld input{padding:0;height:54px;line-height:54px}
.auth .fld .eye{width:40px;height:40px;border-radius:13px;display:grid;place-items:center;flex:none;color:#fff;opacity:.9;background:none}
.auth .fld .eye .ico{width:21px;height:21px}
.auth .forgot{text-align:right;margin:-2px 4px 0;font-size:13px}
.auth .msg{text-align:center;font-size:13.5px;line-height:1.5;color:#ffffffd9;margin:2px 6px 4px}.auth .msg b{font-size:16px;color:#fff}
.auth .btn{min-height:54px;font-size:16px;display:flex;align-items:center;justify-content:center;gap:8px;padding:0 20px}
.auth .or{margin:2px 0;gap:12px;font-size:12px}
.auth .socials{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.auth .social{width:100%;min-height:52px;padding:0 10px;font-size:15px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:9px;background:#ffffff30;border-color:#ffffff59}
.auth .social .ico{flex:none}
.auth .sw{margin:16px 0 0;font-size:13.5px}
.auth .trust{margin:10px 0 0;display:flex;align-items:center;justify-content:center;gap:6px;font-size:11.5px}
.auth .trust .ico{width:13px;height:13px}
.auth-in>.lgcard,.auth-in>.tag,.auth-in>.sw,.auth-in>.trust{animation:up .55s var(--ease) both}
.auth-in>.tag{animation-delay:.05s}.auth-in>.sw{animation-delay:.2s}.auth-in>.trust{animation-delay:.28s}
.splash .lgcard{width:clamp(140px,42vw,176px);padding:16px 18px}
@media(max-height:700px){
 .auth{padding-top:calc(12px + env(safe-area-inset-top));padding-bottom:calc(12px + env(safe-area-inset-bottom))}
 .auth .lgcard{width:92px;padding:10px 12px;margin-bottom:6px;border-radius:24px}
 .auth .tag{margin-bottom:12px;font-size:11.5px}
 .auth .auth-card{padding:12px;gap:10px}
 .auth .tabs{height:46px}.auth .fld{min-height:52px}.auth .fld input{height:50px;line-height:50px}
 .auth .btn{min-height:50px}.auth .social{min-height:48px}.auth .sw{margin-top:12px}
}
@media(max-width:340px){.auth .social{font-size:14px;gap:6px}.auth .tabs button{font-size:14px}}
@media (prefers-reduced-motion:reduce){.fab,.add,.btn{animation:none!important}.rp{display:none}.lq-pop{animation:none!important}}
/* category tiles: round icon badge with the name underneath */
.catrow{gap:6px;padding:4px 2px 14px}
.cc{width:78px;flex-direction:column;align-items:center;gap:8px;padding:0;border-radius:0;background:none;border:0;box-shadow:none;overflow:visible}
.cc .rp{display:none}
.cc span{width:66px;height:66px;border-radius:50%;background:linear-gradient(145deg,#fff1f6,#f3e9fb);box-shadow:0 8px 18px #8e2a8c1f,inset 0 1px 0 #fff;color:var(--p3);transition:transform .35s var(--spring),background .25s,color .25s}
.cc b{font-size:12.5px;font-weight:600;text-align:center;max-width:78px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cc:active{transform:none}.cc:active span{transform:scale(.9)}
.cico{width:30px;height:30px;display:block}
.cc span img,.cats .cat>span img{width:32px;height:32px;object-fit:contain}
@media(hover:hover){.cc:hover span,.cats .cat:hover>span{background:linear-gradient(145deg,var(--p3),var(--p2));color:#fff}}
.cats{grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:12px}
.cats .cat,.cats .cat:nth-child(2n){padding:16px 6px 14px;border-radius:24px;background:#fff;gap:8px;font-size:13px;font-weight:600;text-align:center;line-height:1.2}
.cats .cat>span{width:60px;height:60px;border-radius:50%;background:linear-gradient(145deg,#fff1f6,#f3e9fb);color:var(--p3);display:grid;place-items:center;font-size:26px;box-shadow:inset 0 1px 0 #fff;transition:background .25s,color .25s}
.cats .cat small{font-size:11px}
.menu>span:first-child .cico{width:22px;height:22px;color:var(--p3)}
/* product page photo gallery */
.gal{display:grid;gap:12px;min-width:0}
.gal .big img{animation:galIn .35s var(--ease) both}
@keyframes galIn{from{opacity:0;transform:scale(1.03)}to{opacity:1;transform:none}}
.gth{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.gth button{aspect-ratio:1;padding:0;overflow:hidden;border-radius:16px;border:2px solid transparent;background:#fff;box-shadow:0 6px 14px #4a16681a;opacity:.72;transition:opacity .2s,border-color .2s,transform .3s var(--spring)}
.gth button.on{border-color:var(--p3);opacity:1;transform:translateY(-2px)}
.gth img{width:100%;height:100%;object-fit:contain;display:block}
@media (prefers-reduced-motion:reduce){.gal .big img{animation:none}}
/* home hero: stacked slides (cross-fade), swipe, mobile-first sizing */
.bw .banner.hb{position:relative;height:clamp(176px,48vw,224px);min-height:0;padding:0;display:block;overflow:hidden;touch-action:pan-y;user-select:none;-webkit-user-select:none;background:none}
.bw .banner.hb.lk{cursor:pointer}
.bw .banner.hb::before{display:none}
.bs{position:absolute;inset:0;display:flex;align-items:center;padding:20px 20px 20px 22px;color:#fff;opacity:0;visibility:hidden;transition:opacity .5s var(--ease),visibility 0s .5s;overflow:hidden}
.bs.on{opacity:1;visibility:visible;transition:opacity .5s var(--ease),visibility 0s}
.bs.dk{color:var(--ink)}
.bs::after{content:'';position:absolute;width:190px;height:190px;right:-50px;top:-70px;border-radius:50%;background:radial-gradient(circle at 32% 30%,#ffffff40,#fff0 70%);pointer-events:none}
/* phones: text and picture never overlap; the picture gets its own column */
@media (max-width:719px){.bw .bs.pic .bt{max-width:60%}.bw .bs.pic .bart{right:12px;top:14px;bottom:14px;height:calc(100% - 28px);max-width:34%}.bw .bs.pic .bt h3{font-size:clamp(16px,5vw,20px)}}
@media (max-width:719px){.bw .banner.hb{transition:aspect-ratio .3s var(--ease)}.bw .banner.hb.fit{height:auto;aspect-ratio:var(--ar)}}
.bs.full{padding:0;display:block}.bs.full::after{display:none}
.bfull-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(24px) saturate(1.15) brightness(.92);transform:scale(1.25);pointer-events:none}
.bfull{position:absolute;inset:0;z-index:1;width:100%;height:100%;object-fit:contain;object-position:center;display:block;pointer-events:none}
.bs.cov::after{inset:0;width:auto;height:auto;right:auto;top:auto;border-radius:0;background:linear-gradient(90deg,#000b,#0005 58%,#0000)}
.bs.cov.dk::after{background:linear-gradient(90deg,#fffd,#fff7 58%,#fff0)}
.bcov{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.bw .bs .bt{position:relative;z-index:1;max-width:64%;gap:5px;animation:none}
.bw .bs.on .bt{animation:up .5s both}
.bs.cov .bt{max-width:72%}
.bw .bs .bchip{background:#ffffff33;color:#fff;font-size:11px;font-weight:600;padding:4px 11px;border-radius:99px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bw .bs.dk .bchip{background:#2a1a3a14;color:var(--ink)}
.bw .bs .bt h3{font-size:clamp(16px,5.2vw,21px);line-height:1.18;font-weight:800;margin-top:2px;overflow-wrap:anywhere}
.bsub{font-size:12.5px;line-height:1.35;font-weight:500;opacity:.9;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.bw .bs .bshop{margin-top:6px;padding:5px 5px 5px 16px;font-size:13.5px;gap:10px;max-width:100%}
.bw .bs.dk .bshop{background:var(--ink);color:#fff}
.bart{position:absolute;z-index:1;right:14px;top:12px;bottom:12px;height:calc(100% - 24px);width:auto;max-width:46%;object-fit:contain;object-position:center;display:block;pointer-events:none;filter:drop-shadow(0 10px 18px #0000004d)}
/* bigger banner on tablets and desktops so the whole picture shows large and sharp */
@media (min-width:720px){.bw .banner.hb{height:clamp(260px,30vw,340px);border-radius:32px}.bw .bs{padding:28px 48px}.bw .bs .bt{gap:8px;max-width:56%}.bw .bs.cov .bt{max-width:60%}.bw .bs .bchip{font-size:13px;padding:5px 14px}.bw .bs .bt h3{font-size:clamp(26px,3vw,40px);line-height:1.12}.bsub{font-size:16px;-webkit-line-clamp:3}.bw .bs .bshop{margin-top:12px;font-size:16px;padding:7px 7px 7px 22px}.bart{right:36px;top:18px;bottom:18px;height:calc(100% - 36px);max-width:40%}.bw .bs .be{right:48px}}
@media (min-width:720px) and (max-width:1000px){.bw .banner.hb{height:clamp(240px,34vw,300px)}}
.bs .be{z-index:1;pointer-events:none}
.bw .bd{gap:0;margin-top:6px}
.bw .bd button{width:24px;height:24px;display:grid;place-items:center;padding:0}
.bw .bd button::before{content:'';width:6px;height:6px;border-radius:6px;background:#d9c8ea;transition:.35s var(--spring)}
.bw .bd button.on::before{width:20px;background:var(--grad)}
@media(max-width:360px){.bw .bs .bt{max-width:70%}.bsub{font-size:12px}.bs{padding:16px 14px 16px 16px}}
@media (prefers-reduced-motion:reduce){.bs,.bs.on{transition:none}.bw .bs.on .bt{animation:none}}
/* full-screen photo viewer */
.zm{position:relative;cursor:zoom-in}
.gzoom{position:absolute;right:12px;bottom:12px;width:36px;height:36px;border-radius:50%;background:#2a1a3acc;color:#fff;display:grid;place-items:center;pointer-events:none}
.gzoom svg{width:18px;height:18px}
.lb{position:fixed;inset:0;z-index:2000;background:#0c0713;color:#fff;display:flex;flex-direction:column;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);animation:lbIn .22s var(--ease) both}
@keyframes lbIn{from{opacity:0}to{opacity:1}}
.lb-top{flex:none;display:flex;align-items:center;justify-content:space-between;padding:12px 14px}
.lb-top b{font-size:14px;font-weight:600}.lb-acts{display:flex;gap:8px}
.lb-btn{width:42px;height:42px;border-radius:50%;background:#ffffff1f;color:#fff;display:grid;place-items:center}
.lb-btn:hover{background:#ffffff38}
.lb-mid{flex:1;min-height:0;position:relative;display:flex}
.lb-stage{flex:1;min-width:0;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;display:grid;place-items:center;cursor:zoom-in}
.lb-img{max-width:100%;max-height:100%;object-fit:contain;transform-origin:center;will-change:transform;pointer-events:none;-webkit-user-drag:none}
.lb-img.a{transition:transform .25s var(--ease)}
.lb-nav{position:absolute;top:50%;translate:0 -50%}.lb-nav.l{left:10px}.lb-nav.r{right:10px}
@media(hover:none){.lb-nav{display:none}}
.lb-bot{flex:none;display:flex;justify-content:center;gap:8px;padding:12px 14px 16px}
.lb-bot button{width:56px;height:56px;padding:0;overflow:hidden;border-radius:12px;border:2px solid transparent;opacity:.6;transition:opacity .2s,border-color .2s}
.lb-bot button.on{border-color:var(--p3);opacity:1}
.lb-bot img{width:100%;height:100%;object-fit:contain;display:block}
@media (prefers-reduced-motion:reduce){.lb{animation:none}.lb-img.a{transition:none}}
`
const SHOP_CSS = `
/* ===== cart / orders / tracking / suggestions (mobile-first) ===== */
.ptl{font-size:22px;margin:4px 2px 14px;color:var(--ink)}
.emp{display:grid;justify-items:center;text-align:center;gap:8px;padding:48px 24px}
.emp-i{width:96px;height:96px;border-radius:30px;background:linear-gradient(135deg,#f3e9fb,#fde7f0);display:grid;place-items:center;font-size:46px;box-shadow:var(--sh);margin-bottom:8px}
.emp h3{font-size:19px;color:var(--ink)}.emp p{color:var(--mute);font-size:14px;margin-bottom:14px;max-width:260px}.emp .btn{width:auto;padding:0 30px}
.frb{display:flex;gap:12px;align-items:center;padding:12px 14px;margin:2px 0 14px;border-radius:20px;background:linear-gradient(135deg,#eafaf1,#fff);border:1px solid #cdeedb;box-shadow:0 6px 18px #2a8a5214}
.frb span{width:38px;height:38px;border-radius:12px;background:#fff;display:grid;place-items:center;font-size:20px;box-shadow:0 4px 10px #2a8a5222;flex:none}
.frb b{display:block;font-size:13px;color:#1f7a47}.frb small{color:var(--mute);font-size:12px}
.item.ci{align-items:flex-start;gap:14px;padding:12px;border-radius:24px}
.item.ci .pic{width:84px;height:84px;flex:none;margin:0}
.ci-b{flex:1;min-width:0;display:flex;flex-direction:column;align-self:stretch;gap:6px}
.ci-t{display:flex;gap:8px;justify-content:space-between;align-items:flex-start}
.ci-t b{font-size:14px;line-height:1.25;color:var(--ink)}
.ci-x{flex:none;width:28px;height:28px;border-radius:50%;background:#f6effb;color:var(--mute);font-size:12px;display:grid;place-items:center}
.ci-x:active{background:#fde7f0;color:#e0457b}
.vtag{align-self:flex-start;font-size:11px;font-weight:600;padding:3px 10px;border-radius:99px;background:#f6effb;color:var(--p2)}
.ci-f{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:auto}
.ci-p b{display:block;font-size:16px;color:var(--p1);line-height:1.1}.ci-p small{font-size:11px;color:var(--mute)}
.item .qty span{min-width:20px;text-align:center;font-weight:700;font-size:14px}
.mini{display:flex;justify-content:space-between;align-items:center;background:#fff;border:1px solid var(--edge);border-radius:18px;padding:12px 16px;margin:0 0 14px;box-shadow:0 6px 16px #4a166814;font-size:13px;color:var(--mute)}.mini b{color:var(--p1);font-size:17px}
.rail{margin:22px -18px 6px}.rail .sec{padding:0 18px}
.rail-s{display:flex;gap:12px;overflow-x:auto;padding:4px 18px 14px;scroll-snap-type:x proximity;scrollbar-width:none;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain}
.rail-s::-webkit-scrollbar{display:none}
.rail-s .card{flex:0 0 152px;width:152px;scroll-snap-align:start;content-visibility:visible}
.rail-s .pic{height:118px}
.oc{display:block;width:100%;text-align:left;background:#fff;border:1px solid var(--edge);border-radius:24px;padding:14px 14px 14px 18px;margin-bottom:12px;box-shadow:0 8px 22px #4a166818;cursor:pointer;position:relative;overflow:hidden;transition:transform .3s var(--spring)}
.oc:active{transform:scale(.985)}
.oc::before{content:'';position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--line)}
.oc.s0::before{background:#e0457b}.oc.s1::before{background:#e69a1c}.oc.s2::before{background:#3b6fd9}.oc.s3::before{background:#3ab36b}
.oc-h{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:12px}
.oc-h b{display:block;font-size:15px;color:var(--ink)}.oc-h small{color:var(--mute);font-size:12px}
.sp{font-size:11.5px;font-weight:700;padding:4px 11px;border-radius:99px;white-space:nowrap}
.sp.s0{background:#fdecf2;color:#d93a75}.sp.s1{background:#fff3df;color:#b86e00}.sp.s2{background:#e6effd;color:#2757b3}.sp.s3{background:#e4f6ec;color:#1f8a54}
.oc-m{display:flex;align-items:center;gap:12px}
.ths{display:flex;flex:none}
.ths .pic,.ti .pic{width:46px;height:46px;font-size:22px;border-radius:14px;margin:0;border:2px solid #fff;box-shadow:0 4px 10px #4a166822;flex:none}
.ths>*+*{margin-left:-14px}
.ths .more{width:46px;height:46px;border-radius:14px;background:var(--grad);color:#fff;display:grid;place-items:center;font-weight:700;font-size:13px;border:2px solid #fff}
.oc-t{flex:1;min-width:0;font-size:13px;color:var(--ink)}.oc-t span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.oc-t small{color:var(--mute);font-size:12px}
.oc-p{font-size:16px;color:var(--p1);flex:none}
.prg{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:14px}.prg i{height:5px;border-radius:99px;background:var(--line)}.prg i.on{background:var(--grad)}
/* ----- My Orders: mobile-first card refresh ----- */
.ochips{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding:4px 4px 14px;margin:0 -4px -4px;scroll-snap-type:x proximity}
.ochips::-webkit-scrollbar{display:none}
.ochips button{flex:none;min-height:44px;scroll-snap-align:start;display:inline-flex;align-items:center}
.ochips .cnt{margin-left:7px;min-width:20px;padding:1px 7px;border-radius:99px;background:#8e2a8c1a;color:var(--p1);font-size:11.5px;font-weight:700;text-align:center}
.ochips .on .cnt{background:#ffffff38;color:#fff}
.oc{padding:16px 16px 14px 21px;border-radius:26px;margin-bottom:14px;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.oc:focus-visible{outline:3px solid #8e2a8c66;outline-offset:2px}
.oc-h{margin-bottom:14px;align-items:center}
.oc-h b{font-size:16px;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis}.oc-h>div{min-width:0}
.oc-h small{display:block;margin-top:1px}
.sp{display:inline-flex;align-items:center;font-size:12px;padding:5px 12px 5px 10px}
.sp>i{display:inline-block;width:7px;height:7px;border-radius:50%;background:currentColor;margin-right:7px}
.oc-m{padding:12px;margin:0 -4px;border-radius:18px;background:#faf6fd}
.oc .pic img{width:100%;height:100%;object-fit:contain;border-radius:inherit;display:block}
.oc-m.one .ths .pic{width:56px;height:56px;border-radius:16px;font-size:26px}
.oc-t span{font-size:14.5px;font-weight:700}.oc-t small{display:block;margin-top:2px}
.oc-p{font-size:17px;font-weight:800;letter-spacing:-.01em;background:var(--grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.prg{gap:6px;margin-top:16px}.prg i{height:6px}
.oc-f{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:12px;padding-top:11px;border-top:1.5px dashed var(--line);font-size:12.5px;color:var(--mute)}
.oc-f span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.oc-f em{flex:none;font-style:normal;font-weight:700;color:var(--p1);display:inline-flex;align-items:center;gap:2px;min-height:24px}
.oc-f svg{width:16px;height:16px}
@media(prefers-reduced-motion:no-preference){.sp.s0>i,.sp.s1>i,.sp.s2>i{animation:ocDot 1.8s ease-in-out infinite}}
@keyframes ocDot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}
@media(max-width:380px){.oc{padding:14px 12px 12px 17px;border-radius:22px}.oc-h b{font-size:15px}.sp{font-size:11px;padding:4px 10px 4px 8px}.oc-m{padding:10px;gap:10px}.oc-p{font-size:15px}.oc-t span{font-size:13.5px}.ochips button{padding-inline:16px}}
.tkc{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:6px}
.tkc>div{background:#fff;border-radius:18px;padding:12px;box-shadow:0 6px 16px #4a166814;border:1px solid var(--edge);min-width:0}
.tkc small{display:block;color:var(--mute);font-size:11px;margin-bottom:2px}.tkc b{font-size:14px;color:var(--ink);word-break:break-word}
.cd2{background:#fff;border:1px solid var(--edge);border-radius:24px;padding:16px;margin-top:14px;box-shadow:0 8px 22px #4a166818}
.cd2 h5{font-size:12px;color:var(--mute);font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px}
.ti{display:flex;gap:12px;align-items:center;padding:10px 0}.ti+.ti{border-top:1px solid var(--line)}
.ti>div{flex:1;min-width:0;font-size:13px}.ti b{color:var(--ink)}.ti small{display:block;color:var(--mute)}.ti>b:last-child{color:var(--p1);flex:none}
.dl p{font-size:14px;line-height:1.55;color:var(--ink)}.dl small{color:var(--mute)}
.scr.narrow .sum{margin-top:14px}
@media(min-width:900px){.rail{margin-inline:-36px}.rail .sec{padding-inline:36px}.rail-s{padding-inline:36px}.rail-s .card{flex-basis:190px;width:190px}.rail-s .pic{height:150px}.oc:hover{transform:translateY(-2px)}}
@media(max-width:360px){.item.ci .pic{width:72px;height:72px}.tkc{grid-template-columns:1fr 1fr}.tkc>div:last-child{grid-column:span 2}.rail-s .card{flex-basis:140px;width:140px}}
@media(prefers-reduced-motion:reduce){.oc{transition:none}}

/* ===== order tracking: animated progress card + grouped detail cards ===== */
.trk{position:relative;overflow:hidden;border-radius:26px;padding:18px 18px 14px;margin:14px 0;color:#fff;background:linear-gradient(135deg,#4a1668,#8e2a8c 55%,#e0457b);box-shadow:0 18px 36px -14px #8e2a8ccc,inset 0 1.5px 0 #ffffff55}
.trk:before,.trk:after{content:'';position:absolute;border-radius:50%;background:#ffffff1f;pointer-events:none;animation:trkOrb 9s ease-in-out infinite alternate}
.trk:before{width:160px;height:160px;right:-50px;top:-70px}.trk:after{width:110px;height:110px;left:-40px;bottom:-60px;animation-delay:-4s}
.trk.fin{background:linear-gradient(135deg,#1f7a4d,#2fa86a 60%,#6fd39a)}
.trk-top{display:flex;gap:14px;align-items:center;position:relative;z-index:1}
.trk-art{flex:none;width:64px;height:64px;border-radius:20px;background:#ffffffeb;display:grid;place-items:center;font-size:42px;box-shadow:0 10px 22px #2d0b4a40;animation:flt 3.2s ease-in-out infinite}
.trk-tx{font-size:13px;line-height:1.45;color:#ffffffd9}.trk-tx b{font-size:17px;color:#fff;letter-spacing:-.01em}
.trk-rail{position:relative;z-index:1;height:20px;margin:18px 10px 6px}
.trk-line{position:absolute;left:0;right:0;top:8px;height:4px;border-radius:4px;background:#ffffff40;overflow:hidden}
.trk-fill{display:block;height:100%;border-radius:4px;background:#fff;box-shadow:0 0 12px #fff;transform-origin:left;animation:trkGrow 1.1s var(--ease) both;position:relative;overflow:hidden}
.trk-fill:after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,#e0457b88,transparent);background-size:200% 100%;animation:sh 1.8s linear infinite}
.trk-n{position:absolute;top:4px;width:12px;height:12px;margin-left:-6px;border-radius:50%;background:#ffffff59;border:2px solid #ffffff80;transition:.4s var(--spring)}
.trk-n.on{background:#fff;border-color:#fff;transform:scale(1.15)}
.trk-n.cur{width:20px;height:20px;top:0;margin-left:-10px;box-shadow:0 0 0 0 #ffffffaa;animation:trkRing 1.8s infinite}
.trk-lb{position:relative;z-index:1;display:flex;justify-content:space-between;gap:4px;font-size:10px;letter-spacing:.01em}
.trk-lb small{color:#ffffff8c;font-weight:600;text-align:center;flex:1}.trk-lb small:first-child{text-align:left}.trk-lb small:last-child{text-align:right}.trk-lb small.on{color:#fff}
.trkscr .tk-meta,.trkscr .tk-card,.trkscr .trk,.trkscr .btn{animation:up .55s var(--ease) both}
.trkscr .trk{animation-delay:.08s}.trkscr .tk-card:nth-of-type(1){animation-delay:.16s}.trkscr .tk-card:nth-of-type(2){animation-delay:.22s}.trkscr .tk-card:nth-of-type(3){animation-delay:.28s}
/* order meta strip */
.tk-meta{display:grid;grid-template-columns:1fr 1fr 1fr;background:#fff;border:1px solid var(--edge);border-radius:24px;box-shadow:0 8px 22px #4a166818;overflow:hidden}
.tk-meta>div{padding:14px;min-width:0;display:grid;gap:2px;align-content:start}
.tk-meta>div+div{border-left:1px solid var(--line)}
.tk-meta small{font-size:11px;color:var(--mute);font-weight:600}
.tk-meta b{font-size:15px;color:var(--ink);word-break:break-word}
.tk-meta em{font-style:normal;font-size:11.5px;color:var(--mute)}
.tk-meta b.g{font-size:17px;background:var(--grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
/* grouped cards */
.tk-card{background:#fff;border:1px solid var(--edge);border-radius:24px;padding:4px 16px 8px;margin-top:14px;box-shadow:0 8px 22px #4a166818}
.tk-card>header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 0 6px}
.tk-card h5{font-size:15px;font-weight:800;color:var(--ink);letter-spacing:-.01em;margin:0}
.tk-pill{padding:4px 11px;border-radius:999px;background:#f6effb;color:var(--p1);font-size:12px;font-weight:700}
.tk-row{display:flex;gap:12px;align-items:flex-start;padding:12px 0}.tk-row+.tk-row{border-top:1px solid var(--line)}
.tk-ic{flex:none;width:40px;height:40px;border-radius:14px;display:grid;place-items:center;background:var(--grad);color:#fff;box-shadow:0 6px 14px #8e2a8c40}
.tk-row>div{flex:1;min-width:0}.tk-row small{display:block;color:var(--mute);font-size:12px;margin-bottom:1px}
.tk-row b{color:var(--ink);font-size:14.5px}.tk-row p{font-size:13.5px;line-height:1.5;color:var(--ink);margin:2px 0 0}
.tk-row em{display:block;font-style:normal;font-size:12px;color:var(--mute);margin-top:4px}
.tk-chip{flex:none;align-self:center;padding:5px 11px;border-radius:999px;font-size:12px;font-weight:700}
.tk-chip.ok{background:#e4f7ec;color:#1f7a4d}.tk-chip.wait{background:#fff3dc;color:#a86a00}.tk-chip.no{background:#fde7ee;color:#c0245a}
/* delivery code (Pinkish Rider) */
.tk-dc{border-color:#f0b4cf;background:linear-gradient(160deg,#fff7fb,#fff 60%)}
.tk-code{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 0 10px}
.tk-code small{display:block;color:var(--mute);font-size:12px}
.tk-code b{display:block;font:800 30px/1.1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.3em;color:var(--p1)}
.tk-code a{flex:none;display:inline-flex;align-items:center;gap:6px;padding:10px 16px;border-radius:999px;background:var(--grad);color:#fff;font-weight:700;font-size:13.5px;text-decoration:none}
.tk-dc p.h{font-size:12.5px;color:var(--mute);margin:0 0 10px;line-height:1.45}
/* bill */
.tk-bill .r{display:flex;justify-content:space-between;gap:12px;padding:7px 0;font-size:14px;color:var(--mute)}
.tk-bill .r span:last-child{color:var(--ink);font-weight:600;text-align:right}
.tk-bill .r.g span:last-child{color:#3ab36b;font-weight:700}
.tk-bill .tot{display:flex;justify-content:space-between;align-items:baseline;margin:8px -16px -8px;padding:14px 16px;border-top:1.5px dashed var(--line);background:linear-gradient(#faf5fd,#f6effb);border-radius:0 0 23px 23px}
.tk-bill .tot span:first-child{font-weight:700;color:var(--ink);font-size:15px}
.tk-bill .tot span:last-child{font-size:21px;font-weight:800;background:var(--grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
@media(max-width:360px){.tk-meta b{font-size:13px}.tk-meta b.g{font-size:14px}.tk-meta>div{padding:12px 10px}}
@keyframes trkGrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes trkRing{0%{box-shadow:0 0 0 0 #ffffffaa}100%{box-shadow:0 0 0 14px #ffffff00}}
@keyframes trkOrb{to{transform:translate3d(-24px,18px,0) scale(1.2)}}
@media(prefers-reduced-motion:reduce){.trk *,.trk:before,.trk:after,.trkscr *{animation:none!important}}
`
const POP = '.add,.fab,.qty button,.ib'
const LP = { x: 0, y: 0, t: 0 } // last tap / click position, shared by the liquid effects
const lite = () => NOMOTION || document.documentElement.classList.contains('lite')
// "Added to cart": the product picture flies in an arc to the cart button, which then bounces (Web Animations API, compositor only)
function flyToCart(src) {
  try {
    if (lite() || Date.now() - LP.t > 1500 || !Element.prototype.animate) return
    const tgt = [...document.querySelectorAll('.nav button[data-k="cart"],.ib[aria-label="Open cart"]')].find(el => el.offsetParent !== null && el.getBoundingClientRect().width > 0)
    if (!tgt) return
    const r = tgt.getBoundingClientRect(), dx = r.left + r.width / 2 - LP.x, dy = r.top + r.height / 2 - LP.y
    const f = document.createElement('i'); f.className = 'fly'; f.style.cssText = `left:${LP.x - 24}px;top:${LP.y - 24}px`
    if (src) { const im = new Image(); im.src = src; im.alt = ''; im.decoding = 'async'; f.appendChild(im) }
    document.body.appendChild(f)
    const a = f.animate([{ transform: 'translate3d(0,0,0) scale(.6)', opacity: 0 }, { transform: 'translate3d(0,0,0) scale(1.05)', opacity: 1, offset: .12 }, { transform: `translate3d(${dx * .45}px,${dy * .45 - 90}px,0) scale(.85)`, offset: .5 }, { transform: `translate3d(${dx}px,${dy}px,0) scale(.2)`, opacity: .4 }], { duration: 720, easing: 'cubic-bezier(.45,0,.55,1)' })
    a.onfinish = a.oncancel = () => { f.remove(); tgt.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.28,.82)' }, { transform: 'scale(.9,1.12)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' }) }
  } catch { /* decoration only */ }
}

/* Delegated listeners power the liquid feel everywhere: ripple, pointer-tracking light and squish-pop (no per-component handlers) */
// Keeps the UI smooth on weak phones / heavy load:
//  - pauses every animation while the tab is hidden
//  - weak devices (<=4 cores / <=4 GB / data saver) start in "lite" mode (no blur, no ambient animation)
//  - a frame-rate watchdog switches to lite mode if the first seconds run below ~30 fps
function usePerf() {
  useEffect(() => {
    const root = document.documentElement
    const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4 || !!navigator.connection?.saveData
    if (weak) root.classList.add('lite')
    const vis = () => root.classList.toggle('paused', document.hidden)
    document.addEventListener('visibilitychange', vis)
    let raf = 0, boot = 0, last = 0, n = 0, bad = 0
    if (!weak && !NOMOTION) {
      const tick = t => {
        if (last) { const d = t - last; if (d < 500) { n++; if (d > 45) bad++ } }
        last = t
        if (n >= 120) { if (bad / n > 0.3) root.classList.add('lite'); return }
        raf = requestAnimationFrame(tick)
      }
      boot = setTimeout(() => { raf = requestAnimationFrame(tick) }, 2500) // skip start-up jank
    }
    return () => { document.removeEventListener('visibilitychange', vis); clearTimeout(boot); cancelAnimationFrame(raf) }
  }, [])
}
function useLiquid() {
  useEffect(() => {
    let st = document.getElementById('lq-css')
    if (!st) { st = document.createElement('style'); st.id = 'lq-css'; document.head.appendChild(st) }
    const all = LIQUID_CSS + LOC_CSS + SHOP_CSS + GATE_CSS + FEAT_CSS + MOTION_CSS + WEL_CSS
    if (st.textContent !== all) st.textContent = all
    if (NOMOTION) return
    const light = (el, e) => {
      const r = el.getBoundingClientRect()
      el.style.setProperty('--mx', e.clientX - r.left + 'px'); el.style.setProperty('--my', e.clientY - r.top + 'px')
    }
    const down = e => {
      LP.x = e.clientX; LP.y = e.clientY; LP.t = Date.now()
      const el = e.target.closest?.(RIPPLE)
      if (!el || el.disabled) return
      const r = el.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2.2, s = document.createElement('span')
      s.className = 'rp'
      s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`
      el.appendChild(s)
      s.addEventListener('animationend', () => s.remove(), { once: true })
      light(el, e)
      if (el.matches(POP)) {
        el.classList.remove('lq-pop'); void el.offsetWidth; el.classList.add('lq-pop')
        el.addEventListener('animationend', ev => { if (ev.animationName === 'lqPop') el.classList.remove('lq-pop') }, { once: true })
      }
    }
    let raf = 0
    const move = e => {
      if (e.pointerType !== 'mouse' || raf) return
      raf = requestAnimationFrame(() => { raf = 0; const el = e.target.closest?.(RIPPLE); if (el && !el.disabled) light(el, e) })
    }
    document.addEventListener('pointerdown', down, { passive: true })
    document.addEventListener('pointermove', move, { passive: true })
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('pointermove', move); cancelAnimationFrame(raf) }
  }, [])
}

// Picture warm-up: start downloading pictures before they are needed, so they are already in the browser cache when shown.
const warmed = new Set()
const saveData = () => { try { return !!navigator.connection?.saveData } catch { return false } }
const warm = urls => { if (saveData()) return; for (const u of urls) { if (!u || warmed.has(u)) continue; warmed.add(u); try { const im = new Image(); im.decoding = 'async'; im.src = u } catch { /* ignore */ } } }
// eager = the first products on screen: load at once with high priority (no lazy wait); the rest stay lazy.
const Pic = memo(({ p, big, eager }) => <div className={big ? 'big' : 'pic'}>{p.image_url ? <img src={p.image_url} alt={p.name} loading={eager ? 'eager' : 'lazy'} fetchpriority={eager ? 'high' : undefined} decoding="async" /> : p.emoji || '🛍️'}</div>)
const imgsOf = p => { const a = Array.isArray(p.images) ? p.images.filter(Boolean) : []; return a.length ? a : p.image_url ? [p.image_url] : [] }
const SV = (d, extra) => <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}{extra}</svg>
const clampT = (s, x, y, w, h) => { const mx = (s - 1) * w / 2, my = (s - 1) * h / 2; return { s, x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) } }
// Full-screen photo viewer: pinch / double-tap / wheel to zoom, drag to pan, swipe for next photo, swipe down or Esc to close
const Lightbox = ({ list, start, name, onClose }) => {
  const [i, setI] = useState(start), [t, setT] = useState({ s: 1, x: 0, y: 0, a: true })
  const box = useRef(null), pts = useRef(new Map()), g = useRef({}), tt = useRef(t), ir = useRef(i)
  tt.current = t; ir.current = i
  const close = () => onClose(ir.current)
  const dims = () => { const r = box.current?.getBoundingClientRect(); return r ? { w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 } : { w: 1, h: 1, cx: 0, cy: 0 } }
  const zoomTo = (s, px, py, a = true) => {
    const d = dims(), c = tt.current; s = Math.max(1, Math.min(5, s)); const k = s / c.s, qx = px - d.cx, qy = py - d.cy
    setT({ ...clampT(s, qx - (qx - c.x) * k, qy - (qy - c.y) * k, d.w, d.h), a })
  }
  const go = n => { setI(k => (k + n + list.length) % list.length); setT({ s: 1, x: 0, y: 0, a: true }) }
  const pick = n => { setI(n); setT({ s: 1, x: 0, y: 0, a: true }) }
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1) }
    const ov = document.body.style.overflow; document.body.style.overflow = 'hidden'; addEventListener('keydown', k)
    return () => { document.body.style.overflow = ov; removeEventListener('keydown', k) }
  }, [])
  const down = e => {
    e.currentTarget.setPointerCapture?.(e.pointerId); pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); const c = tt.current
    if (pts.current.size === 2) { const [p, q] = [...pts.current.values()]; g.current.pinch = { d: Math.hypot(p.x - q.x, p.y - q.y) || 1, s: c.s }; g.current.one = null }
    else if (pts.current.size === 1) g.current.one = { x: e.clientX, y: e.clientY, tx: c.x, ty: c.y, moved: false }
  }
  const move = e => {
    if (!pts.current.has(e.pointerId)) return
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); const d = dims(), c = tt.current
    if (pts.current.size === 2 && g.current.pinch) {
      const [p, q] = [...pts.current.values()], s = Math.max(1, Math.min(5, g.current.pinch.s * Math.hypot(p.x - q.x, p.y - q.y) / g.current.pinch.d))
      const k = s / c.s, qx = (p.x + q.x) / 2 - d.cx, qy = (p.y + q.y) / 2 - d.cy
      return setT({ ...clampT(s, qx - (qx - c.x) * k, qy - (qy - c.y) * k, d.w, d.h), a: false })
    }
    const o = g.current.one; if (!o) return
    const dx = e.clientX - o.x, dy = e.clientY - o.y
    if (Math.abs(dx) + Math.abs(dy) > 8) o.moved = true
    if (c.s > 1) setT({ ...clampT(c.s, o.tx + dx, o.ty + dy, d.w, d.h), a: false })
  }
  const up = e => {
    if (!pts.current.delete(e.pointerId)) return
    if (pts.current.size === 1) { const [p] = [...pts.current.values()], c = tt.current; g.current.pinch = null; g.current.one = { x: p.x, y: p.y, tx: c.x, ty: c.y, moved: true }; return }
    if (pts.current.size) return
    g.current.pinch = null; const o = g.current.one; g.current.one = null; if (!o) return
    const dx = e.clientX - o.x, dy = e.clientY - o.y, c = tt.current
    if (!o.moved) { const now = Date.now(); if (now - (g.current.tap || 0) < 300) { g.current.tap = 0; zoomTo(c.s > 1.02 ? 1 : 2.5, e.clientX, e.clientY) } else g.current.tap = now; return }
    if (c.s <= 1.02) {
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4 && list.length > 1) go(dx < 0 ? 1 : -1)
      else if (dy > 90 && dy > Math.abs(dx) * 1.4) close()
    }
  }
  const step = f => { const d = dims(); zoomTo(tt.current.s * f, d.cx, d.cy) }
  return createPortal(<div className="lb" role="dialog" aria-modal="true" aria-label={(name || 'Product') + ' photos'}>
    <div className="lb-top"><b>{i + 1} / {list.length}</b><div className="lb-acts">
      <button className="lb-btn" aria-label="Zoom out" onClick={() => step(1 / 1.6)}>{SV(<path d="M5 12h14" />)}</button>
      <button className="lb-btn" aria-label="Zoom in" onClick={() => step(1.6)}>{SV(<path d="M5 12h14M12 5v14" />)}</button>
      <button className="lb-btn" aria-label="Close" autoFocus onClick={close}>{SV(<path d="M6 6l12 12M18 6 6 18" />)}</button></div></div>
    <div className="lb-mid">
      <div className="lb-stage" ref={box} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={e => zoomTo(tt.current.s * Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY, false)}>
        <img className={'lb-img' + (t.a ? ' a' : '')} src={list[i]} alt={name || ''} draggable="false" style={{ transform: `translate(${t.x}px,${t.y}px) scale(${t.s})` }} /></div>
      {list.length > 1 && <><button className="lb-btn lb-nav l" aria-label="Previous photo" onClick={() => go(-1)}>{SV(<path d="M15 5l-7 7 7 7" />)}</button><button className="lb-btn lb-nav r" aria-label="Next photo" onClick={() => go(1)}>{SV(<path d="M9 5l7 7-7 7" />)}</button></>}</div>
    {list.length > 1 && <div className="lb-bot">{list.map((u, n) => <button key={n} className={n === i ? 'on' : ''} aria-label={'Photo ' + (n + 1)} onClick={() => pick(n)}><img src={u} alt="" draggable="false" /></button>)}</div>}
  </div>, document.body)
}
// Product page photos: large image (tap to open full screen + zoom) and a thumbnail strip
const Gallery = ({ p }) => {
  const list = useMemo(() => imgsOf(p), [p]), [k, setK] = useState(0), [open, setOpen] = useState(false)
  useEffect(() => { setK(0); setOpen(false) }, [p.id])
  useEffect(() => { warm(list) }, [list])
  if (!list.length) return <Pic p={p} big />
  const show = () => setOpen(true)
  return <div className="gal"><div className="big zm" role="button" tabIndex={0} aria-label="View full photo and zoom" onClick={show} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show() } }}>
    <img key={k} src={list[k] || list[0]} alt={p.name} loading="eager" fetchpriority="high" decoding="async" draggable="false" />
    <span className="gzoom">{SV(<><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2M11 8.5v5M8.5 11h5" /></>)}</span></div>
    {list.length > 1 && <div className="gth" role="group" aria-label="Product photos">{list.map((u, i) => <button key={i} className={i === k ? 'on' : ''} aria-label={'Photo ' + (i + 1)} aria-current={i === k} onClick={() => setK(i)}><img src={u} alt="" loading="eager" decoding="async" draggable="false" /></button>)}</div>}
    {open && <Lightbox list={list} start={k} name={p.name} onClose={n => { setK(n); setOpen(false) }} />}</div>
}
// Brand-aware icon: the 🛡️ emoji (or an image URL) renders as the real Pinkish logo mark
// Small illustrations for empty states and order-status banner (inline SVG, brand colors)
const CartArt = () => (
  <svg viewBox="0 0 120 120" width="1em" height="1em" role="img" aria-label="Empty cart" style={{ display: 'block' }}>
    <defs>
      <linearGradient id="caa" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a23fb8" /><stop offset="1" stopColor="#ec4a7c" /></linearGradient>
      <linearGradient id="cab" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffe3ef" /><stop offset="1" stopColor="#f79ac0" /></linearGradient>
      <linearGradient id="cac" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6fd39a" /><stop offset="1" stopColor="#2fa86a" /></linearGradient>
    </defs>
    <path d="M14 30 h16 l10 46 h46 l10 -34 H36" fill="none" stroke="url(#caa)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M36 42 h60 l-9 34 H44 z" fill="url(#cab)" opacity=".9" />
    <circle cx="50" cy="94" r="8" fill="url(#caa)" /><circle cx="82" cy="94" r="8" fill="url(#caa)" />
    <circle cx="50" cy="94" r="3" fill="#fff" /><circle cx="82" cy="94" r="3" fill="#fff" />
    <path d="M66 14 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 z" fill="#ec4a7c" opacity=".8" />
    <path d="M100 20 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" fill="#a23fb8" opacity=".6" />
  </svg>
)
const OrdersArt = () => (
  <svg viewBox="0 0 120 120" width="1em" height="1em" role="img" aria-label="No orders yet" style={{ display: 'block' }}>
    <defs>
      <linearGradient id="oaa" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a23fb8" /><stop offset="1" stopColor="#ec4a7c" /></linearGradient>
      <linearGradient id="oab" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffe3ef" /><stop offset="1" stopColor="#f79ac0" /></linearGradient>
      <linearGradient id="oac" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6fd39a" /><stop offset="1" stopColor="#2fa86a" /></linearGradient>
    </defs>
    <g strokeLinejoin="round">
      <path d="M60 34 L96 50 V82 L60 98 L24 82 V50 Z" fill="#8e3bb8" />
      <path d="M60 34 L96 50 V82 L60 98 Z" fill="url(#oaa)" />
      <path d="M60 34 L96 50 L60 66 L24 50 Z" fill="url(#oab)" />
      <path d="M60 34 L78 42 L42 58 L24 50 Z" fill="#fff" opacity=".55" />
    </g>
    <path d="M60 66 V98" stroke="#fff" strokeOpacity=".35" strokeWidth="2" />
    <path d="M94 16 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 z" fill="#ec4a7c" opacity=".8" />
    <path d="M16 28 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" fill="#a23fb8" opacity=".6" />
  </svg>
)
const NotifArt = () => (
  <svg viewBox="0 0 120 120" width="1em" height="1em" role="img" aria-label="No notifications yet" style={{ display: 'block' }}>
    <defs>
      <linearGradient id="nfa" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a23fb8" /><stop offset="1" stopColor="#ec4a7c" /></linearGradient>
      <linearGradient id="nfb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe3ef" /><stop offset="1" stopColor="#f79ac0" /></linearGradient>
      <linearGradient id="nfc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff7a9c" /><stop offset="1" stopColor="#ff3358" /></linearGradient>
    </defs>
    <ellipse cx="60" cy="104" rx="26" ry="5" fill="#8e3bb8" opacity=".12" />
    <path d="M60 18c-17 0-28 13-28 30v20c0 6-4 10-8 14h72c-4-4-8-8-8-14V48c0-17-11-30-28-30z" fill="url(#nfa)" />
    <path d="M60 18c-17 0-28 13-28 30v20c0 6-4 10-8 14h36z" fill="url(#nfb)" opacity=".9" />
    <path d="M44 30c4-4 9-6 14-6" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none" opacity=".7" />
    <path d="M50 86a10 10 0 0 0 20 0z" fill="#8e2a8c" />
    <circle cx="60" cy="13" r="5" fill="#8e2a8c" />
    <circle cx="88" cy="30" r="11" fill="url(#nfc)" stroke="#fff" strokeWidth="3" />
    <path d="M10 52l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#ec4a7c" opacity=".7" />
    <path d="M100 74l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="#a23fb8" opacity=".6" />
  </svg>
)
const StatusArt = ({ st }) => (
  <svg viewBox="0 0 120 120" width="1.2em" height="1.2em" role="img" aria-label="Order status" style={{ display: 'block' }}>
    <defs>
      <linearGradient id="saa" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a23fb8" /><stop offset="1" stopColor="#ec4a7c" /></linearGradient>
      <linearGradient id="sab" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffe3ef" /><stop offset="1" stopColor="#f79ac0" /></linearGradient>
      <linearGradient id="sac" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6fd39a" /><stop offset="1" stopColor="#2fa86a" /></linearGradient>
    </defs>
    {st === 0 && <><rect x="26" y="20" width="68" height="84" rx="14" fill="url(#sab)" /><rect x="40" y="12" width="40" height="18" rx="8" fill="url(#saa)" /><path d="M42 54 h36 M42 70 h36 M42 86 h22" stroke="#d93d7a" strokeWidth="6" strokeLinecap="round" opacity=".75" /></>}
    {st === 1 && <><g strokeLinejoin="round"><path d="M60 26 L98 43 V80 L60 98 L22 80 V43 Z" fill="#8e3bb8" /><path d="M60 26 L98 43 V80 L60 98 Z" fill="url(#saa)" /><path d="M60 26 L98 43 L60 60 L22 43 Z" fill="url(#sab)" /></g></>}
    {st === 2 && <><path d="M8 62 h22 M14 78 h20 M20 94 h16" stroke="#e8b9d0" strokeWidth="6" strokeLinecap="round" /><path d="M44 40 h38 l16 22 v28 H44 z" fill="url(#saa)" /><path d="M82 48 l10 14 H74 V48 z" fill="#fff" opacity=".6" /><circle cx="58" cy="94" r="10" fill="#4a1a6b" /><circle cx="88" cy="94" r="10" fill="#4a1a6b" /><circle cx="58" cy="94" r="4" fill="#fff" /><circle cx="88" cy="94" r="4" fill="#fff" /></>}
    {st >= 3 && <><circle cx="60" cy="60" r="44" fill="url(#sac)" /><circle cx="60" cy="60" r="44" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="3" /><path d="M38 61 l15 15 29 -32" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" /></>}
  </svg>
)
// Custom illustration for the first onboarding slide: glass shield, heart + lock, floating gift box and sparkles
const PrivacyArt = () => (
  <svg viewBox="0 0 200 200" width="1.15em" height="1.15em" role="img" aria-label="Private and safe delivery" style={{ display: 'block' }}>
    <defs>
      <linearGradient id="pa-sh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a23fb8" /><stop offset="1" stopColor="#ec4a7c" /></linearGradient>
      <linearGradient id="pa-gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".55" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
      <linearGradient id="pa-bx" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffd1e3" /><stop offset="1" stopColor="#f79ac0" /></linearGradient>
      <filter id="pa-bl" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#c23a78" floodOpacity=".35" /></filter>
    </defs>
    <circle cx="100" cy="104" r="78" fill="#fff" opacity=".35" />
    <g filter="url(#pa-bl)">
      <path d="M100 26 L154 46 V98 C154 136 130 160 100 174 C70 160 46 136 46 98 V46 Z" fill="url(#pa-sh)" />
      <path d="M100 26 L154 46 V98 C154 136 130 160 100 174 C70 160 46 136 46 98 V46 Z" fill="url(#pa-gl)" />
      <path d="M100 38 L143 54 V98 C143 129 124 149 100 161 C76 149 57 129 57 98 V54 Z" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="2" />
    </g>
    <path d="M100 126 C82 114 76 104 76 94 a13 13 0 0 1 24 -6 a13 13 0 0 1 24 6 c0 10 -6 20 -24 32 z" fill="#fff" />
    <rect x="92" y="88" width="16" height="13" rx="3.5" fill="#d93d7a" />
    <path d="M95 88 v-4 a5 5 0 0 1 10 0 v4" fill="none" stroke="#d93d7a" strokeWidth="3" strokeLinecap="round" />
    <g transform="translate(138 126) rotate(8)">
      <rect width="42" height="36" rx="8" fill="url(#pa-bx)" /><rect y="12" width="42" height="6" fill="#fff" opacity=".7" /><rect x="18" width="6" height="36" fill="#fff" opacity=".7" />
      <path d="M21 0 c-8 -12 -18 -2 -8 0 z M21 0 c8 -12 18 -2 8 0 z" fill="#fff" />
    </g>
    <path d="M40 60 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 z" fill="#fff" />
    <path d="M168 54 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" fill="#fff" opacity=".9" />
    <circle cx="32" cy="130" r="4" fill="#fff" opacity=".8" /><circle cx="172" cy="100" r="3" fill="#fff" opacity=".7" />
  </svg>
)
// Custom illustration for the third onboarding slide: plain unbranded parcel, location pin, speed lines, "delivered" badge
const DeliveryArt = () => (
  <svg viewBox="0 0 200 200" width="1.15em" height="1.15em" role="img" aria-label="Fast delivery to your door" style={{ display: 'block' }}>
    <defs>
      <linearGradient id="da-top" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffe3ef" /><stop offset="1" stopColor="#f9b4d0" /></linearGradient>
      <linearGradient id="da-l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c45bd0" /><stop offset="1" stopColor="#8e3bb8" /></linearGradient>
      <linearGradient id="da-r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ec4a7c" /><stop offset="1" stopColor="#b02f93" /></linearGradient>
      <linearGradient id="da-pin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a23fb8" /><stop offset="1" stopColor="#ec4a7c" /></linearGradient>
      <filter id="da-sh" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="8" stdDeviation="7" floodColor="#c23a78" floodOpacity=".35" /></filter>
    </defs>
    <ellipse cx="100" cy="166" rx="52" ry="9" fill="#b02f93" opacity=".18" />
    <g stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".85">
      <path d="M18 104 H48" /><path d="M10 120 H40" opacity=".7" /><path d="M24 136 H50" opacity=".5" />
    </g>
    <g filter="url(#da-sh)" strokeLinejoin="round">
      <path d="M100 82 L152 104 V146 L100 168 L48 146 V104 Z" fill="url(#da-l)" />
      <path d="M100 82 L152 104 V146 L100 168 Z" fill="url(#da-r)" />
      <path d="M100 82 L152 104 L100 126 L48 104 Z" fill="url(#da-top)" />
      <path d="M100 82 L126 93 L74 115 L48 104 Z" fill="#fff" opacity=".55" />
      <path d="M100 126 L100 168" stroke="#fff" strokeOpacity=".35" strokeWidth="2" />
    </g>
    <path d="M100 82 L152 104 L100 126 L48 104 Z" fill="none" stroke="#fff" strokeOpacity=".8" strokeWidth="1.5" strokeLinejoin="round" />
    <g filter="url(#da-sh)">
      <path d="M100 20 c-17 0 -28 12 -28 27 c0 20 28 42 28 42 s28 -22 28 -42 c0 -15 -11 -27 -28 -27 z" fill="url(#da-pin)" />
      <circle cx="100" cy="47" r="11" fill="#fff" />
      <path d="M94.5 47.5 l4 4 7.5 -8" fill="none" stroke="#d93d7a" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </g>
    <path d="M160 62 l2.5 6.5 6.5 2.5 -6.5 2.5 -2.5 6.5 -2.5 -6.5 -6.5 -2.5 6.5 -2.5 z" fill="#fff" />
    <path d="M40 64 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" fill="#fff" opacity=".9" />
    <circle cx="170" cy="130" r="4" fill="#fff" opacity=".8" /><circle cx="30" cy="160" r="3" fill="#fff" opacity=".7" />
  </svg>
)
// Welcome slide 1: shopping bags, a lipstick and a heart tag
const ShopArt = () => (
  <svg viewBox="0 0 200 200" width="1.15em" height="1.15em" role="img" aria-label="Shop beauty, fashion and essentials" style={{ display: 'block' }}>
    <defs>
      <linearGradient id="sh-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a23fb8" /><stop offset="1" stopColor="#ec4a7c" /></linearGradient>
      <linearGradient id="sh-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffe3ef" /><stop offset="1" stopColor="#f79ac0" /></linearGradient>
      <linearGradient id="sh-c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff7a9c" /><stop offset="1" stopColor="#d1236a" /></linearGradient>
      <filter id="sh-s" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="8" stdDeviation="7" floodColor="#c23a78" floodOpacity=".35" /></filter>
    </defs>
    <ellipse cx="100" cy="170" rx="58" ry="8" fill="#b02f93" opacity=".18" />
    <g filter="url(#sh-s)">
      <path d="M40 74 h62 l-5 92 H45 z" fill="url(#sh-b)" />
      <path d="M57 74 v-10 a14 14 0 0 1 28 0 v10" fill="none" stroke="#d93d7a" strokeWidth="5" strokeLinecap="round" />
      <path d="M86 60 h72 l-6 108 H92 z" fill="url(#sh-a)" />
      <path d="M106 60 v-12 a16 16 0 0 1 32 0 v12" fill="none" stroke="#7a1f7e" strokeWidth="6" strokeLinecap="round" />
      <path d="M122 100 c-8 -7 -18 -1 -14 8 c3 6 14 13 14 13 s11 -7 14 -13 c4 -9 -6 -15 -14 -8 z" fill="#fff" />
    </g>
    <g transform="translate(150 118) rotate(18)" filter="url(#sh-s)">
      <rect x="0" y="22" width="18" height="30" rx="3" fill="#4a1668" /><rect x="2" y="10" width="14" height="14" rx="2" fill="#e6c26e" />
      <path d="M3 10 V2 l12 -6 v16 z" fill="url(#sh-c)" />
    </g>
    <path d="M34 42 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 z" fill="#fff" />
    <path d="M168 40 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" fill="#fff" opacity=".9" />
    <circle cx="26" cy="120" r="4" fill="#fff" opacity=".8" />
  </svg>
)
// Welcome slide 2: a little storefront with a striped awning and a heart sign
const StoreArt = () => (
  <svg viewBox="0 0 200 200" width="1.15em" height="1.15em" role="img" aria-label="Verified shops in one marketplace" style={{ display: 'block' }}>
    <defs>
      <linearGradient id="st-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a23fb8" /><stop offset="1" stopColor="#ec4a7c" /></linearGradient>
      <linearGradient id="st-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#fde7f0" /></linearGradient>
      <filter id="st-s" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="8" stdDeviation="7" floodColor="#c23a78" floodOpacity=".35" /></filter>
    </defs>
    <ellipse cx="100" cy="168" rx="62" ry="8" fill="#b02f93" opacity=".18" />
    <g filter="url(#st-s)">
      <rect x="46" y="78" width="108" height="86" rx="8" fill="url(#st-w)" />
      <path d="M38 58 h124 l-6 26 H44 z" fill="url(#st-a)" />
      <g fill="#fff" opacity=".85"><path d="M58 58 h16 l-3 26 h-15 z" /><path d="M92 58 h16 v26 h-16 z" /><path d="M126 58 h16 l2 26 h-15 z" /></g>
      <path d="M44 84 q9 10 18 0 q9 10 18 0 q9 10 18 0 q9 10 18 0 q9 10 18 0 q9 10 18 0" fill="none" stroke="#d93d7a" strokeWidth="4" strokeLinecap="round" />
      <rect x="60" y="104" width="34" height="60" rx="5" fill="url(#st-a)" /><circle cx="86" cy="136" r="3" fill="#fff" />
      <rect x="104" y="104" width="38" height="30" rx="5" fill="#f3e9fb" stroke="#e0b6d6" strokeWidth="2" />
      <path d="M123 116 c-5 -4 -11 0 -8 5 c2 4 8 7 8 7 s6 -3 8 -7 c3 -5 -3 -9 -8 -5 z" fill="#ec4a7c" />
    </g>
    <g filter="url(#st-s)"><circle cx="152" cy="46" r="16" fill="#2fa86a" /><path d="M144 46 l6 6 10 -11" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></g>
    <path d="M30 50 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 z" fill="#fff" />
    <circle cx="176" cy="104" r="3" fill="#fff" opacity=".8" /><circle cx="24" cy="126" r="4" fill="#fff" opacity=".7" />
  </svg>
)
const Glyph = ({ v }) => v === 'art:shop' ? <ShopArt /> : v === 'art:store' ? <StoreArt /> : v === 'art:privacy' ? <PrivacyArt /> : v === 'art:delivery' ? <DeliveryArt /> : (v === '🛡️' || v === '🛡' || /^(https?:|\/)/.test(v || '')) ? <img src={/^(https?:|\/)/.test(v) ? v : '/logo-mark.webp?v=2'} alt="" decoding="async" draggable="false" /> : <>{v}</>
// Category logos: modern line icons picked from the category name (custom image icons set by admin still win)
const CAT_SVG = {
  clothes: <path d="M8 3 3 6l2 4 3-1.5V21h8V8.5L19 10l2-4-5-3a4 4 0 0 1-8 0z" />,
  electronics: <><rect x="4" y="5" width="16" height="11" rx="2" /><path d="M2 19.5h20" /></>,
  phone: <><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></>,
  shoes: <><path d="M3 17V8l4 2c1 1.5 3 2 5 2l1.5 1.5c1 .8 4 1 6.5 2.3V17z" /><path d="M3 17h18v2H3zM9 12.5l1.2-1.6M12 14l1.2-1.6" /></>,
  watch: <><rect x="7" y="6.5" width="10" height="11" rx="3" /><path d="M9 6.5 9.7 3h4.6l.7 3.5M9 17.5l.7 3.5h4.6l.7-3.5M12 10v2.2l1.6 1" /></>,
  beauty: <><rect x="9" y="12" width="6" height="9" rx="1.2" /><path d="M10 12V9h4v3M10.5 9l1-5.5 3 2.5-.5 3" /></>,
  bag: <><path d="M5 8h14l1 13H4z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></>,
  jewelry: <><path d="M6 3h12l4 6-10 12L2 9z" /><path d="M2 9h20M9 3 7 9l5 12 5-12-2-6" /></>,
  glasses: <><circle cx="6.5" cy="14" r="3.5" /><circle cx="17.5" cy="14" r="3.5" /><path d="M10 14h4M3 14l1.5-6M21 14l-1.5-6" /></>,
  home: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10M10 20v-6h4v6" /></>,
  kitchen: <><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 1.5-3 4-3 7h3" /></>,
  grocery: <><path d="M3 10h18l-2 10H5z" /><path d="M8 10l3-6M16 10l-3-6" /></>,
  toys: <><rect x="3" y="12" width="8" height="8" rx="1.5" /><rect x="13" y="12" width="8" height="8" rx="1.5" /><rect x="8" y="3" width="8" height="8" rx="1.5" /></>,
  gaming: <><path d="M7 8h10a4 4 0 0 1 4 4.5l-.6 4a2.2 2.2 0 0 1-3.8 1.2L15 16H9l-1.6 1.7a2.2 2.2 0 0 1-3.8-1.2l-.6-4A4 4 0 0 1 7 8z" /><path d="M8 11v3M6.5 12.5h3M15.5 11.5h.01M17.5 13.5h.01" /></>,
  sports: <><circle cx="12" cy="12" r="9" /><path d="M12 3v18M3 12h18M5.6 5.6c3 2.4 3 10.4 0 12.8M18.4 5.6c-3 2.4-3 10.4 0 12.8" /></>,
  books: <path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z" />,
  health: <><rect x="3" y="3" width="18" height="18" rx="5" /><path d="M12 8v8M8 12h8" /></>,
  auto: <><path d="M4 15l1.5-5a2 2 0 0 1 2-1.5h9a2 2 0 0 1 2 1.5L20 15v4h-3v-2H7v2H4z" /><path d="M4 15h16M7.5 12.5h.01M16.5 12.5h.01" /></>,
  pets: <><circle cx="6" cy="10" r="2" /><circle cx="10" cy="6" r="2" /><circle cx="14" cy="6" r="2" /><circle cx="18" cy="10" r="2" /><path d="M12 12c3 0 5 3 5 5.5 0 1.8-1.5 2.5-3 2-.8-.3-1.3-.5-2-.5s-1.2.2-2 .5c-1.5.5-3-.2-3-2C7 15 9 12 12 12z" /></>,
  grid: <><rect x="3" y="3" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="2" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" /></>,
}
const CAT_RULES = [
  [/phone|mobile|tablet/i, 'phone'], [/shoe|sneaker|footwear|sandal|boot|slipper/i, 'shoes'], [/watch|clock/i, 'watch'],
  [/cloth|fashion|apparel|wear|shirt|dress|garment|saree|panjabi|punjabi|t-?shirt/i, 'clothes'],
  [/electronic|gadget|appliance|laptop|computer|camera|headphone|audio|speaker|\btvs?\b/i, 'electronics'],
  [/toy|baby|\bkids?\b|child/i, 'toys'], [/beauty|cosmetic|makeup|make-up|skin|perfume|fragrance|grooming/i, 'beauty'],
  [/\bbags?\b|handbag|luggage|wallet|backpack/i, 'bag'], [/jewel|ornament|\bgold\b|\brings?\b|necklace/i, 'jewelry'],
  [/glass|eyewear|sunglass|accessor/i, 'glasses'], [/home|furniture|decor|living|bedding/i, 'home'],
  [/kitchen|cook|dining|restaurant|food/i, 'kitchen'], [/grocer|fruit|vegetable|supermarket|snack|beverage|drink/i, 'grocery'],
  [/game|gaming|console/i, 'gaming'], [/sport|fitness|gym|outdoor|cricket|football/i, 'sports'],
  [/book|stationer|office|education|school/i, 'books'], [/health|medic|pharma|wellness|vitamin/i, 'health'],
  [/\bcars?\b|auto|vehicle|\bbikes?\b|motor/i, 'auto'], [/\bpets?\b/i, 'pets'],
]
const catKind = n => { const s = String(n || ''); for (const [r, k] of CAT_RULES) if (r.test(s)) return k; return null }
const CatIcon = ({ c }) => {
  const ic = c?.icon, k = catKind(c?.name)
  if (/^(https?:|\/)/.test(ic || '')) return <Glyph v={ic} />
  if (!k && ic && ic !== '🛍️') return <Glyph v={ic} />
  return <svg className="cico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{CAT_SVG[k || 'grid']}</svg>
}
const ICONS = {
  shield: <><path d="M12 3l7 3v5c0 4.6-3 8.2-7 10-4-1.8-7-5.4-7-10V6l7-3z" /><path d="M9 12l2.2 2.2L15.5 10" /></>,
  truck: <><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H13v11H3V6.5z" /><path d="M13 9h4l3 3.2V16h-7V9z" /><circle cx="7.5" cy="17.5" r="1.8" /><circle cx="16.5" cy="17.5" r="1.8" /></>,
  box: <><path d="M12 3l8 4.2v9.6L12 21l-8-4.2V7.2L12 3z" /><path d="M4 7.2l8 4.3 8-4.3M12 11.5V21" /></>,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  pin: <><path d="M12 21s-6-5.2-6-10a6 6 0 0 1 12 0c0 4.8-6 10-6 10z" /><circle cx="12" cy="11" r="2.2" /></>,
  card: <><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M3 10.5h18M7 15h3" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  logout: <><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" /><path d="M15 8l4 4-4 4M19 12H9" /></>,
  chev: <path d="M9 6l6 6-6 6" />,
  home: <path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-8z" />,
  grid: <><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" /><path d="M9 8h6M9 12h6" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M4 7l8 6 8-6" /></>,
  phone: <><rect x="7" y="2.8" width="10" height="18.4" rx="2.6" /><path d="M10.5 18h3" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeoff: <><path d="M3 3l18 18" /><path d="M6.5 7.6A16 16 0 0 0 2 12s3.6 7 10 7c1.7 0 3.2-.4 4.5-1M10.6 5.1C11 5 11.5 5 12 5c6.4 0 10 7 10 7a16 16 0 0 1-2.4 3.2" /><path d="M9.9 10a3 3 0 0 0 4.1 4.1" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h10" />, back: <path d="M15 5l-7 7 7 7" />, search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  share: <><circle cx="18" cy="5.5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="18.5" r="2.5" /><path d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1" /></>,
  call: <path d="M5 4h3.5l1.7 4.3-2.2 1.4a11 11 0 0 0 6.3 6.3l1.4-2.2L20 15.5V19a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  ret: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  bag: <><path d="M6 8h12l-1 11H7L6 8z" /><path d="M9 8a3 3 0 0 1 6 0" /></>, sliders: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>,
}
const Icon = ({ n }) => <svg className="ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[n]}</svg>
const GoogleG = () => <svg className="ico" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" /><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" /><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" /><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" /></svg>
const AppleMark = () => <svg className="ico" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" /></svg>
const Steps = ({ n }) => <div className="stp">{['Cart', 'Details', 'Payment'].map((l, i) => <div key={l} className={i <= n ? 'on' : ''}><i>{i < n ? '✓' : i + 1}</i><span>{l}</span></div>)}</div>
const copyText = async (t, say, msg) => {
  try { await navigator.clipboard.writeText(t) }
  catch { try { const a = document.createElement('textarea'); a.value = t; a.style.position = 'fixed'; a.style.opacity = '0'; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove() } catch { return say('Could not copy. Please copy it by hand.') } }
  say(msg)
}
const BkashPay = ({ total, cart, promo, addr, back, say, onDone }) => {
  const [trx, setTrx] = useState(''), [from, setFrom] = useState(addr.phone || ''), [busy, setBusy] = useState(false)
  const amt = Number(total), amtTxt = Number.isInteger(amt) ? String(amt) : amt.toFixed(2), app = api.bkashAppLink()
  const submit = async () => {
    const t = trx.replace(/\s/g, '').toUpperCase()
    if (!/^[A-Z0-9]{8,12}$/.test(t)) return say('Enter the Transaction ID from your bKash SMS (8 to 12 letters/numbers)', 3200)
    if (!/^(?:\+?88)?01[3-9]\d{8}$/.test(from.replace(/[\s-]/g, ''))) return say('Enter the bKash number you paid from (01XXXXXXXXX)', 3200)
    setBusy(true)
    try { onDone(await api.placeBkashOrder({ items: cart, promo, address: addr, amount: amt, trx: t, sender: from })) }
    catch (e) { say(e?.message || 'Could not submit. Please try again.', 3500); setBusy(false) }
  }
  return <><Hdr title="Pay with bKash" back={back} /><div className="scr narrow bk">
    <div className="bk-hero"><small>Amount to send</small><b>৳{amtTxt}</b><span>Your order is placed after you submit the TrxID</span>
      <button className="bk-mini" onClick={() => copyText(amtTxt, say, 'Amount copied')}>Copy amount</button></div>
    <div className="bk-card"><PayLogo k={1} /><div className="bk-num"><small>bKash number · {api.BKASH.mode}</small><b>{api.BKASH.number}</b></div>
      <button className="bk-copy" onClick={() => copyText(api.BKASH.number, say, 'Number copied')}>Copy</button></div>
    {app && <a className="bk-app" href={app}>Open bKash app</a>}
    <ol className="bk-steps"><li>Open the bKash app and choose <b>{api.BKASH.mode}</b>.</li><li>Send exactly <b>৳{amtTxt}</b> to <b>{api.BKASH.number}</b>.</li><li>Copy the <b>Transaction ID (TrxID)</b> from the confirmation SMS and enter it below.</li></ol>
    <label className="lbl">Transaction ID (TrxID)<input className="inp bk-trx" placeholder="e.g. 9G7A5B3C2D" value={trx} onChange={e => setTrx(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" spellCheck="false" maxLength={14} /></label>
    <label className="lbl">bKash number you paid from<input className="inp" type="tel" inputMode="tel" placeholder="01XXXXXXXXX" value={from} onChange={e => setFrom(e.target.value)} autoComplete="tel" /></label>
    <div className="note">🔒 We confirm your payment before your order is prepared. This usually takes a few minutes.</div>
    <button className="btn" disabled={busy} onClick={submit}>{busy ? <i className="spin" /> : 'Submit payment'}</button>
  </div></>
}
// Toast: owns its own state, so showing a message redraws only this bubble, not the whole store.
function Toast({ api: r }) {
  const [m, setM] = useState(''), t = useRef(0)
  useEffect(() => {
    const o = r.current
    o.fn = (msg, ms) => { clearTimeout(t.current); setM(msg); t.current = setTimeout(() => setM(''), ms) }
    if (o.pend) { const [a, b] = o.pend; o.pend = null; o.fn(a, b) } // a message sent while the splash screen was up
    return () => { clearTimeout(t.current); o.fn = null }
  }, [r])
  return m ? <div className="toast" role="status">{m}</div> : null
}
const Hdr = ({ title, back, right }) => <div className="hdr"><button className="ib" aria-label="Back" onClick={back}><Icon n="back" /></button><span className="ht">{title}</span>{right || <span className="ib ghost" />}</div>
const Heart = ({ on, toggle, inl }) => <button className={'heart' + (on ? ' on' : '') + (inl ? ' inl' : '')} aria-label="Wishlist" aria-pressed={on} onClick={e => { e.stopPropagation(); toggle() }}>{on ? '♥' : '♡'}</button>

function Money({ v }) {
  const [n, setN] = useState(v), from = useRef(v)
  useEffect(() => {
    if (NOMOTION) { setN(v); from.current = v; return }
    const a = from.current, t0 = performance.now(); let r
    const f = t => { const k = Math.min(1, (t - t0) / 450); setN(a + (v - a) * (1 - Math.pow(1 - k, 3))); if (k < 1) r = requestAnimationFrame(f); else from.current = v }
    r = requestAnimationFrame(f); return () => cancelAnimationFrame(r)
  }, [v])
  return taka(n)
}

const HERO_BG = { purple: ['#2d0b4a', '#8e2a8c', '#c2377f'], pink: ['#7a1648', '#e0457b', '#ff8fb8'], ocean: ['#0b2a5b', '#1f6fd1', '#38c6e0'], sunset: ['#7a1f2b', '#e8542f', '#ffb347'], forest: ['#0d3b2e', '#1f8a5b', '#7bd88f'], night: ['#0c0713', '#2a1a3a', '#4a1668'] }
const heroBg = x => {
  if (x.bg === 'custom' && /^#[0-9a-f]{6}$/i.test(x.c1 || '') && /^#[0-9a-f]{6}$/i.test(x.c2 || '')) return `linear-gradient(120deg,${x.c1},${x.c2})`
  const c = HERO_BG[x.bg] || HERO_BG.purple
  return `linear-gradient(120deg,${c[0]},${c[1]} 70%,${c[2]})`
}
// Home hero: every slide (text, button, link, colours, picture) and the autoplay speed are set in the admin panel.
// Mobile: swipe left/right, tap anywhere to open the slide's link, pauses while touched, no autoplay with reduced motion.
// The banner settings are fetched once per visit and kept on the device, so the real banner shows instantly
// (no default banner flashing first) and going back to Home never downloads them again.
const HERO0 = { slides: OFFERS.map(o => ({ chip: o[0], lines: o[1], emoji: o[2] })), auto: true, speed: 4 }
let heroMem = null, heroAt = 0
const ARS = {} // picture shape cache: width / height, shared across visits to Home
function BannerImpl({ shop, go, open, cats, prods }) {
  const [cfg, setCfg] = useState(() => heroMem || readLS('pk_hero', null) || HERO0)
  const [i, setI] = useState(0), [hold, setHold] = useState(false), [inView, setInView] = useState(true), sw = useRef(null), box = useRef(null)
  const cfgR = useRef(cfg); cfgR.current = cfg
  useEffect(() => {
    if (heroMem && Date.now() - heroAt < 120000) return
    let on = true
    api.getHeroFull().then(h => {
      heroAt = Date.now(); const v = h || HERO0; heroMem = v
      if (h) writeLS('pk_hero', h); else try { localStorage.removeItem('pk_hero') } catch { /* storage unavailable */ }
      if (on && JSON.stringify(cfgR.current) !== JSON.stringify(v)) { setCfg(v); setI(0) }
    }).catch(() => {})
    return () => { on = false }
  }, [])
  const list = cfg.slides, n = list.length, cur = i % n
  // Only the slides that have been on screen (and the next one) load their pictures: hidden slides cost no mobile data.
  const [seen, setSeen] = useState(() => new Set([0, 1]))
  useEffect(() => { const nx = (cur + 1) % n; setSeen(s => (s.has(cur) && s.has(nx) ? s : new Set([...s, cur, nx]))) }, [cur, n])
  useEffect(() => { setSeen(new Set([0, 1])) }, [list])
  // Picture shapes: a wide (landscape) picture next to text never fits on a phone, so it is shown as a whole-picture slide instead.
  const [ars, setArs] = useState(() => ({ ...ARS }))
  useEffect(() => {
    let on = true
    list.forEach((x, k) => {
      if (!seen.has(k) || !x.image || x.layout === 'cover' || ARS[x.image] !== undefined) return
      const im = new Image(), done = v => { ARS[x.image] = v; if (on) setArs(a => (a[x.image] === v ? a : { ...a, [x.image]: v })) }
      im.decoding = 'async'
      im.onload = () => done((im.naturalWidth || 1) / (im.naturalHeight || 1))
      im.onerror = () => done(1)
      im.src = x.image
    })
    return () => { on = false }
  }, [list, seen])
  // autoplay stops while the banner is scrolled off screen or the tab is hidden (no work nobody can see)
  useEffect(() => {
    const el = box.current; if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.25 })
    io.observe(el); return () => io.disconnect()
  }, [])
  const reduce = NOMOTION
  useEffect(() => {
    if (!cfg.auto || n < 2 || hold || reduce || !inView) return
    const t = setTimeout(() => { if (!document.hidden) setI(x => (x + 1) % n) }, cfg.speed * 1000)
    return () => clearTimeout(t)
  }, [i, n, cfg.auto, cfg.speed, hold, reduce, inView])
  const live = x => x.cta !== '' || !!x.link
  const act = x => {
    const l = String(x.link || '')
    if (l.startsWith('cat:')) { const c = (cats || []).find(c => String(c.id) === l.slice(4)); if (c) return go('category', { c }) }
    else if (l.startsWith('prod:')) { const p = (prods || []).find(p => String(p.id) === l.slice(5)); if (p) return open(p) }
    else if (l.startsWith('url:')) { if (/^https?:\/\//i.test(l.slice(4))) return void window.open(l.slice(4), '_blank', 'noopener,noreferrer') }
    shop('categories')
  }
  const down = e => { sw.current = { x: e.clientX, y: e.clientY, m: false }; setHold(true) }
  const move = e => { const s = sw.current; if (s && (Math.abs(e.clientX - s.x) > 8 || Math.abs(e.clientY - s.y) > 8)) s.m = true }
  const up = e => {
    setHold(false); const s = sw.current; if (!s) return
    const dx = e.clientX - s.x, dy = e.clientY - s.y
    if (s.m && n > 1 && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) setI(k => (k % n + (dx < 0 ? 1 : -1) + n) % n)
  }
  const x0 = list[cur]
  // On phones the banner takes the shape of a whole-picture slide, so the full picture shows with no empty bars.
  const ar0 = x0.image && x0.layout !== 'cover' ? ars[x0.image] : 0
  const fit = !!ar0 && (x0.layout === 'full' || ar0 >= 1.25)
  return <div className="bw" ref={box} role="region" aria-roledescription="carousel" aria-label="Offers">
    <div className={'banner hb' + (live(x0) ? ' lk' : '') + (fit ? ' fit' : '')} style={fit ? { '--ar': Math.min(3, Math.max(1.15, ar0)) } : undefined} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={e => { if (sw.current) sw.current.m = true; setHold(false) }} onClick={() => { if (!sw.current?.m && live(x0)) act(x0) }}>
      {list.map((x, k) => {
        const cov = x.layout === 'cover' && !!x.image, art = x.image || x.emoji || '🛡️', btn = x.cta === undefined ? 'Shop Now' : x.cta
        // "Picture only": the whole picture is always visible (never cropped); a blurred copy fills any spare space
        const wide = !!x.image && x.layout !== 'cover' && (x.layout === 'full' || ars[x.image] >= 1.25)
        const ld = seen.has(k), pr = k === 0 ? 'high' : undefined
        if (wide) return <div key={k} className={'bs full' + (k === cur ? ' on' : '')} style={{ background: heroBg(x) }} aria-hidden={k !== cur} aria-label={`Slide ${k + 1} of ${n}`}>
          {ld && <><img className="bfull-bg" src={x.image} alt="" aria-hidden="true" decoding="async" draggable="false" />
          <img className="bfull" src={x.image} alt="Special offer" decoding="async" draggable="false" fetchpriority={pr} /></>}
        </div>
        return <div key={k} className={'bs' + (k === cur ? ' on' : '') + (cov ? ' cov' : '') + (!cov && x.image ? ' pic' : '') + (x.tone === 'dark' ? ' dk' : '')} style={{ background: heroBg(x) }} aria-hidden={k !== cur} aria-label={`Slide ${k + 1} of ${n}`}>
          {cov && ld && <img className="bcov" src={x.image} alt="" decoding="async" draggable="false" fetchpriority={pr} />}
          <div className="bt">{x.chip && <span className="bchip">{x.chip}</span>}<h3>{x.lines.split('|').map((l, j) => <span key={j}>{l}</span>)}</h3>{x.sub && <p className="bsub">{x.sub}</p>}
            {btn && <button type="button" className="bshop" tabIndex={k === cur ? 0 : -1} onClick={e => { e.stopPropagation(); act(x) }}>{btn}<i>↗</i></button>}</div>
          {!cov && (x.image ? (ars[x.image] === undefined || !ld ? null : <img className="bart" src={x.image} alt="" decoding="async" draggable="false" fetchpriority={pr} />) : <div className="be"><Glyph v={art} /></div>)}
        </div>
      })}
    </div>
    {n > 1 && <div className="bd">{list.map((_, k) => <button key={k} type="button" aria-label={`Show slide ${k + 1}`} aria-current={k === cur} className={k === cur ? 'on' : ''} onClick={() => setI(k)} />)}</div>}
  </div>
}

const Banner = memo(BannerImpl)

// Liquid tab bar: one gradient "drop" glides between tabs. The edge in the direction of travel leads and the other
// edge follows a moment later, so the drop stretches and settles like a liquid. Buttons that shift are FLIP-animated.
// Only one small element moves; nothing in the page re-renders while it animates.
const Nav = memo(({ s, count, tab }) => {
  const ref = useRef(null), blob = useRef(null), last = useRef({ i: -1, pos: null })
  const i = TABS.indexOf(s)
  useLayoutEffect(() => {
    const nav = ref.current, b = blob.current; if (!nav || !b) return
    const btns = [...nav.querySelectorAll('button[data-k]')]
    const place = instant => {
      const on = btns[TABS.indexOf(s)]
      if (!on || !on.offsetWidth) { b.classList.remove('on'); return }
      const l = on.offsetLeft, t = on.offsetTop
      if (instant) b.classList.add('nt')
      b.style.cssText = `--l:${l}px;--t:${t}px;--r:${nav.clientWidth - l - on.offsetWidth}px;--b:${nav.clientHeight - t - on.offsetHeight}px`
      b.classList.add('on')
      if (instant) { void b.offsetWidth; b.classList.remove('nt') }
    }
    const prev = last.current
    b.dataset.d = i >= prev.i ? 'f' : 'b'
    // FLIP: buttons that moved because the active tab grew slide to their new place instead of jumping
    if (prev.pos && !lite()) btns.forEach((x, k) => {
      const o = prev.pos[k]; if (!o) return
      const dx = o[0] - x.offsetLeft, dy = o[1] - x.offsetTop
      if (!dx && !dy) return
      x.style.transition = 'none'; x.style.transform = `translate(${dx}px,${dy}px)`; void x.offsetWidth
      x.style.transition = ''; x.style.transform = ''
    })
    place(prev.i < 0 || i < 0)
    last.current = { i, pos: btns.map(x => [x.offsetLeft, x.offsetTop]) }
    if (typeof ResizeObserver === 'undefined') return
    let first = true
    const ro = new ResizeObserver(() => { if (first) { first = false; return } place(true); last.current.pos = btns.map(x => [x.offsetLeft, x.offsetTop]) })
    ro.observe(nav)
    return () => ro.disconnect()
  }, [s, i])
  return <nav ref={ref} className={'nav lq' + (TABS.includes(s) ? '' : ' hide-m')}><i ref={blob} className="nv-blob" aria-hidden="true" /><div className="nv-brand"><div className="lk" aria-label="Pinkish"><img className="bmk" src="/logo-mark.webp?v=2" width="34" height="34" alt="" decoding="async" /><span className="wm" style={{ filter: 'none', opacity: 1, fontSize: 26 }}><span className="bp" style={{ color: '#e0457b', filter: 'none', opacity: 1, fontSize: 'inherit' }}>Pink</span><span className="bi" style={{ color: '#000', filter: 'none', opacity: 1, fontSize: 'inherit' }}>ish</span></span></div></div>{NAV.map(([k, ic, l]) => <button key={k} data-k={k} className={s === k ? 'on' : ''} aria-current={s === k ? 'page' : undefined} aria-label={l} onClick={() => s === k ? document.querySelector('.main .scr')?.scrollTo({ top: 0, behavior: lite() ? 'auto' : 'smooth' }) : tab(k)}><span><Icon n={ic} /></span><b className="nl">{l}</b>{k === 'cart' && count > 0 && <em key={count}>{count}</em>}</button>)}</nav>
})


// ---------- Marketplace: deals, countdown, notifications, Q&A ----------
const Countdown = ({ end }) => {
  const [n, setN] = useState(() => Date.now())
  useEffect(() => { const i = setInterval(() => setN(Date.now()), 1000); return () => clearInterval(i) }, [])
  const ms = new Date(end).getTime() - n
  if (!(ms > 0)) return <span className="cd">Ended</span>
  const h = Math.floor(ms / 36e5), m = Math.floor(ms % 36e5 / 6e4), sec = Math.floor(ms % 6e4 / 1e3)
  return <span className="cd">{h >= 48 ? Math.floor(h / 24) + 'd ' + (h % 24) + 'h' : [h, m, sec].map(x => String(x).padStart(2, '0')).join(':')}</span>
}
const ago = d => { const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 6e4)); return m < 1 ? 'now' : m < 60 ? m + 'm' : m < 1440 ? Math.floor(m / 60) + 'h' : Math.floor(m / 1440) + 'd' }
const FlameIc = () => <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M12.5 2c.5 3.3-1.1 4.9-2.6 6.6C8.4 10.3 7 12 7 14.5a5 5 0 0 0 10 0c0-1.7-.7-3-1.6-4-.2 1.3-.9 2-1.8 2.300.8-3.600-.2-7.400-1.100-10.800z" /><path d="M12 21a2.5 2.5 0 0 1-2.5-2.5c0-1.200.8-2 1.6-2.9.3 1 .9 1.500 1.7 1.8.3-.5.4-1 .4-1.500.9.800 1.3 1.7 1.3 2.600A2.5 2.5 0 0 1 12 21z" fill="#fff" opacity=".55" /></svg>
const BoltIc = () => <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M13.5 2 5 13.500h6L10 22l9-12h-6.2z" /></svg>
const RailT = ({ k, children }) => <span className="rt"><i className={'rt-i ' + k}>{k === 'hot' ? <FlameIc /> : <BoltIc />}</i>{children}</span>
const BellSvg = () => SV(<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>)

// Corner bell: memoised so it only re-renders when the unread count changes.
const NotifBell = memo(({ n, authed, onOpen }) => <button className={'ib bellb' + (n ? ' ring' : '')} aria-label={n ? n + ' unread notifications' : 'Notifications'} onClick={onOpen}><BellSvg />{authed && n > 0 && <em className="bdg" key={n}>{n > 9 ? '9+' : n}</em>}</button>)

function Notifications({ list, back, onOpen, onReadAll }) {
  const fresh = list.filter(n => !n.is_read), seen = list.filter(n => n.is_read), unread = fresh.length > 0
  const row = n => <button key={n.id} type="button" className={'nt-i' + (n.is_read ? '' : ' un')} onClick={() => onOpen(n)}>
    <span className="nt-ic" aria-hidden="true"><BellSvg /></span>
    <span className="nt-t"><span className="nt-h"><b>{n.title}</b><em>{!n.is_read && <i className="nt-d" aria-label="Unread" />}{ago(n.created_at)}</em></span>{n.body && <small>{n.body}</small>}{n.link && <span className="nt-go">View ›</span>}</span>
  </button>
  return <><Hdr title="Notifications" back={back} right={unread ? <button className="ib nt-all" aria-label="Mark all as read" onClick={onReadAll}>✓</button> : null} />
    <div className="scr narrow">{!list.length ? <div className="emp"><div className="emp-i"><NotifArt /></div><h3>No notifications yet</h3><p>Follow shops to hear about new products and deals. Answers to your questions show up here too.</p></div>
      : <div className="nt">{unread && <h4 className="nt-s">New</h4>}{fresh.map(row)}{seen.length > 0 && <h4 className="nt-s">{unread ? 'Earlier' : 'All notifications'}</h4>}{seen.map(row)}</div>}</div></>
}

function QA({ p, user, say, login }) {
  const [list, setList] = useState(null), [q, setQ] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { let on = true; api.getQuestions(p.id).then(r => on && setList(r)); return () => { on = false } }, [p.id])
  const ask = async e => {
    e.preventDefault()
    if (!user?.id || user.id === 'local') return login ? login('ask') : say('Please log in to ask a question')
    setBusy(true)
    try { const r = await api.askQuestion(user.id, p.id, q); setList(l => [r, ...(l || [])]); setQ(''); say('Question sent. The seller will answer soon.', 2600) } catch (x) { say(x.message, 3000) }
    setBusy(false)
  }
  return <section className="qa"><h5>Questions &amp; answers</h5>
    <form onSubmit={ask}><input value={q} maxLength={300} placeholder="Ask about this product…" onChange={e => setQ(e.target.value)} /><button className="btn" disabled={busy || q.trim().length < 5}>{busy ? '…' : 'Ask'}</button></form>
    {list === null ? <small className="qa-m">Loading…</small> : !list.length ? <small className="qa-m">No questions yet. Be the first to ask.</small>
      : list.map(x => <div className="qa-i" key={x.id}><p><b>Q:</b> {x.question}<small> · {x.user_name || 'Customer'}</small></p>{x.answer ? <p className="qa-a"><b>A:</b> {x.answer}</p> : <small className="qa-m">Waiting for the seller's answer</small>}</div>)}
    <small className="qa-m">Answers are public. Phone numbers and outside links are not allowed, so always order on Pinkish.</small>
  </section>
}

const ProductCard = memo(({ p, i, add, open, liked, like, eager }) => <div className={'card rise' + (stockOf(p) === 0 ? ' so' : '')} style={{ '--i': Math.min(i, 12) }} onPointerDown={() => warm(imgsOf(p))} onClick={() => open(p)}><Heart on={liked} toggle={() => like(p.id)} />{api.dealLive(p) && <span className="dl">-{api.dealPct(p)}%</span>}<div className="pwrap"><Pic p={p} eager={eager} /><StockTag p={p} /></div>
  <div className="cinfo"><small>{p.tag || p.brand}</small><h4>{p.name}</h4><div className="cfoot"><b>{taka(p.price)}{api.dealLive(p) && <s>{taka(p.old_price)}</s>}</b><button className="add" aria-label={stockOf(p) === 0 ? 'Sold out' : 'Add to cart'} onClick={e => { e.stopPropagation(); add(p) }}>+</button></div></div></div>)

const CHUNK = 24
const Grid = memo(({ list, loading, add, open, wish, like }) => {
  const [n, setN] = useState(CHUNK), end = useRef(null), first = list[0]?.id
  useEffect(() => { setN(CHUNK) }, [first])
  // the sentinel overlaps the last 400px of the list, so the next batch is ready before you scroll to it
  useEffect(() => {
    const el = end.current
    if (!el || n >= list.length || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) setN(x => x + CHUNK) })
    io.observe(el)
    return () => io.disconnect()
  }, [n, list.length])
  if (loading) return <div className="grid">{[...Array(6)].map((_, i) => <div key={i} className="skel" />)}</div>
  if (!list.length) return <p className="empty">No products found.</p>
  const shown = n >= list.length ? list : list.slice(0, n)
  return <><div className="grid">{shown.map((p, i) => <ProductCard key={p.id} {...{ p, i, add, open, like }} eager={i < 6} liked={wish.has(p.id)} />)}</div>{n < list.length && <div ref={end} aria-hidden="true" style={{ height: 400, marginTop: -400, pointerEvents: 'none' }} />}</>
})

/* ---------- Location: chip + map picker ---------- */
const LOC_CSS = `
.topbar .loc{display:flex;align-items:center;gap:10px;max-width:calc(100% - 60px);padding:6px 14px 6px 6px;border-radius:999px;background:#fff;border:1px solid var(--edge);box-shadow:0 8px 22px #4a166822;text-align:left;min-width:0}
.loc .lp{width:38px;height:38px;border-radius:50%;flex:none;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,#8e2a8c,#e0457b);box-shadow:0 6px 14px #e0457b55,inset 0 1px 0 #ffffff70;position:relative}
.loc .lp::after{content:'';position:absolute;inset:-4px;border-radius:50%;border:2px solid #e0457b55;animation:locPulse 2.4s ease-out infinite}
@keyframes locPulse{from{transform:scale(.85);opacity:1}to{transform:scale(1.35);opacity:0}}
.loc .lt{display:grid;min-width:0;line-height:1.2}
.loc .lt small{font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);font-weight:600}
.loc .lt b{font-size:14px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink)}
.loc>i{font-style:normal;color:var(--p3);font-size:13px;flex:none}
.mp{display:grid;gap:12px;padding-bottom:6px}
.mp-box{position:relative;height:min(46dvh,380px);min-height:260px;border-radius:24px;overflow:hidden;border:1px solid var(--edge);box-shadow:0 12px 30px #4a166826;background:#ece4f7}
.mp-map{position:absolute;inset:0;z-index:1;touch-action:none}
.mp-pin{position:absolute;left:50%;top:50%;width:44px;height:54px;margin:-54px 0 0 -22px;z-index:500;pointer-events:none;filter:drop-shadow(0 8px 6px #4a166855);transition:transform .2s}
.mp-box.mv .mp-pin{transform:translateY(-10px)}
.mp-dot{position:absolute;left:50%;top:50%;width:14px;height:6px;margin:-3px 0 0 -7px;border-radius:50%;background:#4a166855;z-index:499;pointer-events:none;transition:transform .2s,opacity .2s}
.mp-box.mv .mp-dot{transform:scale(1.6);opacity:.4}
.mp-gps{position:absolute;right:12px;bottom:12px;z-index:600;width:48px;height:48px;border-radius:50%;background:#fff;color:var(--p1);display:grid;place-items:center;box-shadow:0 8px 20px #4a166844;border:0;cursor:pointer}
.mp-gps:active{transform:scale(.92)}
.mp-gps.ld svg{animation:locSpin 1s linear infinite}@keyframes locSpin{to{transform:rotate(360deg)}}
.mp-hint{position:absolute;left:12px;top:12px;z-index:600;max-width:calc(100% - 24px);background:#fffffff0;border-radius:999px;padding:7px 14px;font-size:12px;font-weight:600;color:var(--p1);box-shadow:0 6px 16px #4a166822}
.mp-ph{position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:20px;color:var(--mute);font-size:13px;z-index:2}
.mp-sr{position:relative}.mp-sr .search{margin:0}
.mp-res{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:700;background:#fff;border-radius:18px;border:1px solid var(--edge);box-shadow:0 16px 36px #4a166833;overflow:hidden;max-height:240px;overflow-y:auto}
.mp-res button{all:unset;box-sizing:border-box;width:100%;display:flex;gap:10px;align-items:flex-start;padding:12px 14px;cursor:pointer;font-size:13px;border-top:1px solid var(--edge);line-height:1.3}
.mp-res button:first-child{border-top:0}.mp-res button:active,.mp-res button:hover{background:#faf5fd}
.mp-res button span{color:var(--p3);flex:none}
.mp-card{display:flex;gap:12px;align-items:center;padding:14px;border-radius:22px;background:#fff;border:1px solid var(--edge);box-shadow:0 6px 18px #4a166814}
.mp-card>span{width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,#f3e9fb,#fde7f0);display:grid;place-items:center;color:var(--p3);flex:none}
.mp-card div{display:grid;min-width:0}.mp-card small{font-size:11px;color:var(--mute)}.mp-card b{font-size:14px;overflow-wrap:anywhere}
.mp-err{font-size:12px;color:#c62d4a;margin:0}
.mp-man{border:1px dashed #d9c8e8;border-radius:22px;padding:14px;display:grid;gap:2px;background:#fffc}
.mp-man h5{margin:0 0 10px;font-size:13px;color:var(--p1)}
.mp-sect{font-size:12px;font-weight:700;color:var(--mute);letter-spacing:.06em;text-transform:uppercase;margin:4px 2px 0}
.dl-card.cour{border-color:#f3d3a0;background:linear-gradient(145deg,#fffaf0,#fff)}
.dl-card .dl-sub{display:block;font-size:11.5px;color:var(--mute);margin-top:2px;line-height:1.35}
.tk-live .lm{margin:2px 0 12px}
.tk-wait{font-size:13px;color:var(--mute);margin:4px 0 12px;line-height:1.45}
.tk-cr{border-color:#f3d3a0;background:linear-gradient(160deg,#fffaf0,#fff 60%)}
.tk-cr .tk-ic{font-size:20px}.tk-tid{font:800 18px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.06em}
.tk-go{display:flex;justify-content:center;margin:2px 0 10px;text-decoration:none}
.leaflet-container{font:inherit;background:#ece4f7}.leaflet-control-attribution{font-size:9px!important;background:#ffffffcc!important}
.leaflet-control-zoom{display:none}
@media(max-width:480px){.mp-box{height:42dvh;border-radius:20px}.topbar .loc{padding-right:12px}}
@media(min-width:900px){.mp{grid-template-columns:1.2fr 1fr;align-items:start}.mp-box{grid-row:span 3;height:480px}}
`

// Leaflet is loaded once by src/lib/LiveMap.jsx (shared by all apps)
const CTG = [22.3569, 91.7832]
const nom = async (path, signal) => { const r = await fetch('https://nominatim.openstreetmap.org/' + path + '&format=jsonv2&addressdetails=1&accept-language=en', { signal }); if (!r.ok) throw new Error('geo'); return r.json() }
const parseAddr = a => {
  if (!a) return {}
  const area = a.suburb || a.neighbourhood || a.quarter || a.city_district || a.village || ''
  const line = [a.house_number, a.road].filter(Boolean).join(', ')
  const city = a.city || a.town || a.state_district || a.county || ''
  return { area, line, city: city.replace(/ (City|District|Division)$/i, '') }
}
const PinSvg = () => <svg viewBox="0 0 44 54" width="44" height="54" aria-hidden="true"><defs><linearGradient id="pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8e2a8c" /><stop offset="1" stopColor="#e0457b" /></linearGradient></defs><path d="M22 52S4 33 4 20a18 18 0 0 1 36 0c0 13-18 32-18 32z" fill="url(#pg)" stroke="#fff" strokeWidth="2.5" /><circle cx="22" cy="20" r="7" fill="#fff" /></svg>
const LocChip = ({ loc, onClick }) => <button className="loc" aria-label="Change delivery location" onClick={onClick}><span className="lp"><Icon n="pin" /></span><span className="lt"><small>Deliver to</small><b>{loc.area || loc.city}</b></span><i>⌄</i></button>

const fullAddr = l => l ? [l.line, l.area, l.city].filter(Boolean).join(', ') : ''
const AREAS = ['GEC Circle', 'Agrabad', 'Nasirabad', 'Khulshi', 'Halishahar', 'Pahartali', 'Chawkbazar', 'Kotwali', 'Panchlaish', 'Bayezid', 'Patenga', 'Muradpur', 'Oxygen', '2 No Gate', 'Bahaddarhat']

// Delivery charge + who delivers (Pinkish rider inside 4 km, partner courier beyond)
const DeliveryCard = ({ d }) => <div className={'dl-card' + (d.fee == null ? ' bad' : '') + (d.mode === 'courier' ? ' cour' : '') + (d.free ? ' free' : '')}>
  <span className="dl-ic">{d.fee == null ? '🚫' : d.mode === 'courier' ? '📦' : '🛵'}</span>
  <div><small>{d.pinned ? ZONE[d.zone]?.name : 'Delivery charge'}{d.zone === 'inner' && d.km != null ? ` · ${kmTxt(d.km)} from ${HUB.name}` : ''}</small>
    <b>{d.fee == null ? 'We deliver inside Bangladesh only' : !d.pinned ? 'Pin your location for the exact charge' : d.mode === 'courier' ? 'Delivered by Pathao or a partner courier' : 'Delivered by a Pinkish rider'}</b>
    {d.fee != null && d.pinned && <span className="dl-sub">{d.eta}{d.mode === 'courier' ? ' · you get a tracking ID once it ships' : ' · track your rider live on the map'}</span>}
    {d.freeLeft > 0 && <span className="dl-sub dl-fl">Add ৳{d.freeLeft} more for free delivery</span>}</div>
  <em>{d.free && d.base > 0 && <s>৳{d.base}</s>}{feeTxt(d)}</em></div>

function AddressScreen({ loc, back, onSave }) {
  const [f, setF] = useState(loc)
  const [pt, setPt] = useState(loc.lat ? [loc.lat, loc.lng] : null)
  const [mapOk, setMapOk] = useState(null), [moving, setMoving] = useState(false), [gps, setGps] = useState(false), [err, setErr] = useState('')
  const [sq, setSq] = useState(''), [res, setRes] = useState([]), [sb, setSb] = useState(false)
  const el = useRef(null), map = useRef(null), skip = useRef(false), ab = useRef(null), tm = useRef(0)
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }))
  const clean = { city: f.city.trim() || 'Chattogram', area: f.area.trim(), line: f.line.trim(), ...(pt ? { lat: +pt[0].toFixed(6), lng: +pt[1].toFixed(6) } : {}) }
  const save = () => onSave(clean.area || clean.line ? clean : null)

  const reverse = useCallback(async (lat, lng) => {
    ab.current?.abort(); ab.current = new AbortController(); setErr('')
    try {
      const d = await nom(`reverse?lat=${lat}&lon=${lng}&zoom=18`, ab.current.signal)
      const a = parseAddr(d.address)
      setF(x => ({ ...x, city: a.city || x.city || 'Chattogram', area: a.area || x.area, line: a.line || x.line }))
    } catch (e) { if (e.name !== 'AbortError') setErr('Could not read the address here. Please fill it in below.') }
  }, [])

  useEffect(() => {
    let dead = false
    loadLeaflet().then(L => {
      if (dead || !el.current) return
      const m = L.map(el.current, { center: pt || CTG, zoom: pt ? 17 : 13, zoomControl: false, attributionControl: true })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m)
      // the 4 km Pinkish rider zone: inside it our own rider delivers, outside a partner courier does
      L.circle([HUB.lat, HUB.lng], { radius: RIDER_KM * 1000, color: '#e0457b', weight: 2, dashArray: '6 6', fillColor: '#e0457b', fillOpacity: 0.06, interactive: false }).addTo(m)
      m.on('movestart', () => setMoving(true))
      m.on('moveend', () => {
        setMoving(false)
        if (skip.current) { skip.current = false; return }
        const c = m.getCenter(); setPt([c.lat, c.lng])
        clearTimeout(tm.current); tm.current = setTimeout(() => reverse(c.lat, c.lng), 450)
      })
      map.current = m; setMapOk(true)
      setTimeout(() => m.invalidateSize(), 250)
    }).catch(() => !dead && setMapOk(false))
    return () => { dead = true; clearTimeout(tm.current); ab.current?.abort(); map.current?.remove(); map.current = null }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const locate = () => {
    if (!navigator.geolocation) return setErr('Location is not supported on this device.')
    setGps(true); setErr('')
    navigator.geolocation.getCurrentPosition(
      p => { setGps(false); const { latitude: a, longitude: b } = p.coords; setPt([a, b]); map.current?.setView([a, b], 17); if (!map.current) reverse(a, b) },
      e => { setGps(false); setErr(e.code === 1 ? 'Location permission denied. Allow it in your browser settings, or move the map manually.' : 'Could not get your location. Move the map or type your address.') },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 })
  }

  useEffect(() => {
    if (sq.trim().length < 3) { setRes([]); return }
    const c = new AbortController()
    const t = setTimeout(async () => {
      setSb(true)
      try { const d = await nom(`search?q=${encodeURIComponent(sq)}&limit=6&countrycodes=bd&viewbox=91.68,22.48,91.98,22.18`, c.signal); setRes(d) } catch { /* ignore */ }
      setSb(false)
    }, 500)
    return () => { clearTimeout(t); c.abort() }
  }, [sq])

  const pick = r => {
    const lat = +r.lat, lng = +r.lon, a = parseAddr(r.address)
    setRes([]); setSq(''); setPt([lat, lng])
    setF(x => ({ ...x, city: a.city || x.city, area: a.area || x.area, line: a.line || x.line }))
    skip.current = true; map.current?.setView([lat, lng], 17)
  }

  return <><Hdr title="Delivery Location" back={back} />
    <div className="scr narrow addr mp">
      <div className="mp-sr">
        <div className="search"><Icon n="search" /><input placeholder="Search area, road, landmark or district" value={sq} onChange={e => setSq(e.target.value)} aria-label="Search location" />{sb && <i className="spin" />}</div>
        {res.length > 0 && <div className="mp-res" role="listbox">{res.map(r => <button key={r.place_id} type="button" onClick={() => pick(r)}><span>📍</span><div>{r.display_name}</div></button>)}</div>}
      </div>
      <div className={'mp-box' + (moving ? ' mv' : '')}>
        <div ref={el} className="mp-map" />
        {mapOk === null && <div className="mp-ph"><i className="spin" /></div>}
        {mapOk === false && <div className="mp-ph">Map could not load.<br />You can still type your address below.</div>}
        {mapOk && <><span className="mp-dot" /><span className="mp-pin"><PinSvg /></span><div className="mp-hint">{moving ? 'Release to set pin' : 'Drag the map · inside the dashed circle a Pinkish rider delivers'}</div></>}
        <button type="button" className={'mp-gps' + (gps ? ' ld' : '')} aria-label="Use my current location" onClick={locate}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
        </button>
      </div>
      {err && <p className="mp-err" role="alert">{err}</p>}
      <div className="mp-card"><span><Icon n="pin" /></span><div><small>Delivering to</small><b>{fullAddr(clean) || 'Move the pin or search to set location'}</b></div></div>
      <DeliveryCard d={deliveryFor(clean)} />
      {!pt && <p className="mp-err" role="status">Move the map or tap the location button to pin your exact delivery point.</p>}
      <div className="mp-man">
        <h5>✏️ Adjust manually</h5>
        <label className="lbl">City<input className="inp" value={f.city} onChange={set('city')} autoComplete="address-level2" /></label>
        <label className="lbl">Area<input className="inp" placeholder="e.g. Agrabad, Khulshi" value={f.area} onChange={set('area')} autoComplete="address-level3" /></label>
        <div className="chips wrap" role="group" aria-label="Popular areas">{AREAS.map(a => <button key={a} type="button" className={f.area === a ? 'on' : ''} onClick={() => setF(x => ({ ...x, area: a }))}>{a}</button>)}</div>
        <label className="lbl" style={{ marginTop: 12 }}>House, road &amp; landmark<textarea className="inp" rows="3" placeholder="House 12, Road 3, near ..." value={f.line} onChange={set('line')} autoComplete="street-address" /></label>
      </div>
    </div>
    <div className="buybar one"><button className="btn" onClick={save}>Confirm location</button></div></>
}

const suggest = (prods, refs, skip, n = 8) => prods.filter(x => !skip.has(x.id) && x.is_active !== false).map(x => ({ x, v: Math.max(0, ...refs.map(r => (r.category_id === x.category_id ? 4 : 0) + (r.brand && r.brand === x.brand ? 2 : 0) + (r.tag && r.tag === x.tag ? 1 : 0))) + (x.rating || 0) / 10 + Math.min(x.reviews || 0, 2000) / 20000 })).sort((p, q) => q.v - p.v).slice(0, n).map(o => o.x)

const Rail = ({ title, action, list, add, open, wish, like }) => list.length ? <section className="rail"><div className="sec"><span>{title}</span>{action}</div><div className="rail-s">{list.map((p, i) => <ProductCard key={p.id} {...{ p, i, add, open, like }} liked={wish.has(p.id)} />)}</div></section> : null

const CartItem = memo(({ i, qty }) => <div className="item ci rise"><Pic p={i} />
  <div className="ci-b"><div className="ci-t"><b>{i.name}</b><button className="ci-x" aria-label={'Remove ' + i.name} onClick={() => qty(i.key, -i.qty)}>✕</button></div>
    {i.variant && i.variant !== 'Standard' && <span className="vtag">{i.variant}</span>}
    <div className="ci-f"><span className="ci-p"><b>{taka(i.price * i.qty)}</b>{i.qty > 1 && <small>{taka(i.price)} each</small>}</span>
      <div className="qty"><button aria-label="Decrease" onClick={() => qty(i.key, -1)}>−</button><span>{i.qty}</span><button aria-label="Increase" onClick={() => qty(i.key, 1)}>+</button></div></div></div></div>)

const HINT = ['Waiting for confirmation', 'Being prepared for you', 'On its way to you', 'Delivered. Enjoy!']
const OrderCard = memo(({ o, st, open, ret }) => { const its = o.items || [], n = its.reduce((a, i) => a + (i.qty || 1), 0), names = its.slice(0, 2).map(i => i.name).join(', ')
  return <div className={'oc rise s' + st} role="button" tabIndex={0} aria-label={`Order ${o.order_no}, ${STEPS[st]}`} onClick={() => open(o)} onKeyDown={e => e.key === 'Enter' && open(o)}>
    <div className="oc-h"><div><b>#{o.order_no}</b><small>{new Date(o.created_at).toLocaleDateString([], { dateStyle: 'medium' })}</small></div><span className={'sp s' + st}><i />{STEPS[st]}</span></div>
    <div className={'oc-m' + (its.length === 1 ? ' one' : '')}><div className="ths">{its.slice(0, 3).map((i, k) => <Pic key={k} p={i} />)}{its.length > 3 && <span className="more">+{its.length - 3}</span>}</div>
      <div className="oc-t"><span>{names || 'Order'}{its.length > 2 ? ` +${its.length - 2} more` : ''}</span><small>{n} item{n === 1 ? '' : 's'}</small></div><b className="oc-p">{taka(o.total)}</b></div>
    <div className="prg" aria-hidden="true">{STEPS.map((_, k) => <i key={k} className={k <= st ? 'on' : ''} />)}</div>
    <div className="oc-f">{ret ? <span className={'rtag r-' + ret.status}>↩ Return: {api.returnLabel(ret)}</span> : <span>{HINT[st]}</span>}<em>{st < 3 ? 'Track order' : 'View details'}<Icon n="chev" /></em></div></div> })

// ===================== Stock · share · seller contact · search & filters · returns =====================
const LOW = 5
const stockOf = p => (p?.stock == null || p.stock === '' ? null : Number(p.stock))
const StockTag = ({ p }) => { const s = stockOf(p); return s === 0 ? <span className="stk so">Sold out</span> : s != null && s > 0 && s <= LOW ? <span className="stk">Only {s} left</span> : null }
const shareProduct = async (p, say) => {
  const url = api.productUrl(p); if (!url) return
  const text = `${p.name} · ${taka(p.price)} on Pinkish`
  if (typeof navigator !== 'undefined' && navigator.share) { try { await navigator.share({ title: p.name, text, url }); return } catch (e) { if (e?.name === 'AbortError') return } }
  copyText(url, say, 'Link copied. Paste it anywhere to share.')
}
// Every order goes through Pinkish: sellers hand items to our rider, we pack and deliver. No direct seller contact.
const Fulfil = memo(({ shop }) => <div className="ffb" role="note"><span className="ffb-i"><Icon n="truck" /></span><div><b>{shop ? 'Sold by ' + (shop.name || 'a verified seller') + ' · ' : ''}Delivered by Pinkish</b><small>Order only on Pinkish. We collect from the seller, pack discreetly and deliver to you, with returns protected.</small></div></div>)

// --- search: one normalised index, all words must match (name, brand, tag, category and shop) ---
// typo tolerant engine in src/lib/search.js: "lipstik", "parfume", "t shirt" all find the right products
const norm = fnorm
const toks = q => fwords(q)
const searchIn = (idx, q) => fuzzySearch(idx, q)
// loose match for short labels (category, brand, shop names) in the suggestion box
const nearHas = (s, ts) => { const ws = fwords(s); return ts.every(t => ws.some(w => w.startsWith(t) || (t.length > 3 && fdist(t, w.slice(0, t.length + 1), 1) <= 1))) }
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const Hi = ({ s, ts }) => { if (!ts.length) return s; const parts = String(s).split(new RegExp('(' + ts.map(esc).join('|') + ')', 'ig')); return parts.map((x, i) => i % 2 ? <mark key={i}>{x}</mark> : x) }

// --- filters: work on any product list in the browser ---
const F0 = { min: '', max: '', stock: false, deal: false, rating: 0, brands: [], shops: [] }
const fCount = f => (f.min !== '' || f.max !== '' ? 1 : 0) + (f.stock ? 1 : 0) + (f.deal ? 1 : 0) + (f.rating ? 1 : 0) + f.brands.length + f.shops.length
const applyF = (list, f) => {
  if (!fCount(f)) return list
  const mn = f.min === '' ? null : +f.min, mx = f.max === '' ? null : +f.max, bs = new Set(f.brands), ss = new Set(f.shops)
  return list.filter(p => (mn == null || p.price >= mn) && (mx == null || p.price <= mx) && (!f.stock || stockOf(p) !== 0) && (!f.deal || api.dealLive(p)) && (!f.rating || ((+p.reviews || 0) > 0 && +p.rating >= f.rating)) && (!bs.size || bs.has(p.brand || '')) && (!ss.size || ss.has(p.shop_id || 'own')))
}
const NICE = [100, 200, 300, 500, 1000, 2000, 3000, 5000, 10000, 20000, 50000]
const priceRanges = max => {
  let ts = NICE.filter(t => t < max * 0.9); if (!ts.length) return []
  if (ts.length > 3) ts = [ts[Math.floor(ts.length * 0.25)], ts[Math.floor(ts.length * 0.6)], ts[ts.length - 1]].filter((v, i, a) => a.indexOf(v) === i)
  const k = n => n >= 1000 ? n / 1000 + 'k' : n
  return [['Under ৳' + k(ts[0]), 0, ts[0]], ...ts.slice(1).map((t, i) => ['৳' + k(ts[i]) + '–' + k(t), ts[i], t]), ['৳' + k(ts[ts.length - 1]) + '+', ts[ts.length - 1], null]]
}
const shopName = (id, shops) => id ? (shops[id]?.name || 'Marketplace seller') : 'Pinkish Store'
const useSheet = onClose => useEffect(() => {
  const k = e => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k)
  const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'
  return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev }
}, [onClose])
const Switch = ({ on, set, label, sub }) => <button type="button" role="switch" aria-checked={on} className={'fs-sw' + (on ? ' on' : '')} onClick={() => set(!on)}><span><b>{label}</b>{sub && <small>{sub}</small>}</span><i /></button>

function FilterSheet({ base, shops, f, onApply, onClose }) {
  const [d, setD] = useState(f)
  useSheet(onClose)
  const brands = useMemo(() => [...new Set(base.map(p => p.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b)).slice(0, 40), [base])
  const shopOpts = useMemo(() => { const m = new Map(); for (const p of base) { const k = p.shop_id || 'own'; if (!m.has(k)) m.set(k, shopName(p.shop_id, shops)) } return [...m] }, [base, shops])
  const ranges = useMemo(() => priceRanges(Math.max(0, ...base.map(p => +p.price || 0))), [base])
  const n = useMemo(() => applyF(base, d).length, [base, d])
  const tog = (k, v) => setD(x => ({ ...x, [k]: x[k].includes(v) ? x[k].filter(y => y !== v) : [...x[k], v] }))
  const num = k => e => setD(x => ({ ...x, [k]: e.target.value.replace(/[^\d.]/g, '').slice(0, 8) }))
  return <div className="gt-bg" onClick={onClose}><div className="gt fsh" role="dialog" aria-modal="true" aria-label="Filters" onClick={e => e.stopPropagation()}>
    <span className="gt-bar" aria-hidden="true" /><button type="button" className="gt-x" aria-label="Close" onClick={onClose}>✕</button>
    <h3>Filters</h3>
    <section><h5>Price (৳)</h5><div className="fs-pr"><input inputMode="decimal" placeholder="Min" aria-label="Minimum price" value={d.min} onChange={num('min')} /><span>to</span><input inputMode="decimal" placeholder="Max" aria-label="Maximum price" value={d.max} onChange={num('max')} /></div>
      {ranges.length > 0 && <div className="chips wrap">{ranges.map(([l, a, b]) => { const on = d.min === String(a) && d.max === (b == null ? '' : String(b)); return <button type="button" key={l} className={on ? 'on' : ''} onClick={() => setD(x => on ? { ...x, min: '', max: '' } : { ...x, min: String(a), max: b == null ? '' : String(b) })}>{l}</button> })}</div>}</section>
    <section className="fs-tg"><Switch on={d.stock} set={v => setD(x => ({ ...x, stock: v }))} label="In stock only" sub="Hide sold-out items" /><Switch on={d.deal} set={v => setD(x => ({ ...x, deal: v }))} label="On sale" sub="Flash deals right now" /></section>
    <section><h5>Customer rating</h5><div className="chips wrap">{[[4, '★ 4 & up'], [3, '★ 3 & up']].map(([r, l]) => <button type="button" key={r} className={d.rating === r ? 'on' : ''} aria-pressed={d.rating === r} onClick={() => setD(x => ({ ...x, rating: x.rating === r ? 0 : r }))}>{l}</button>)}</div></section>
    {brands.length > 1 && <section><h5>Brand</h5><div className="chips wrap">{brands.map(b => <button type="button" key={b} className={d.brands.includes(b) ? 'on' : ''} aria-pressed={d.brands.includes(b)} onClick={() => tog('brands', b)}>{b}</button>)}</div></section>}
    {shopOpts.length > 1 && <section><h5>Shop</h5><div className="chips wrap">{shopOpts.map(([k, l]) => <button type="button" key={k} className={d.shops.includes(k) ? 'on' : ''} aria-pressed={d.shops.includes(k)} onClick={() => tog('shops', k)}>{l}</button>)}</div></section>}
    <div className="fs-ft"><button type="button" className="btn o" disabled={!fCount(d)} onClick={() => setD(F0)}>Reset</button><button type="button" className="btn" onClick={() => onApply(d)}>Show {n} result{n === 1 ? '' : 's'}</button></div>
  </div></div>
}
// active filters as removable chips
const FChips = ({ f, set, shops }) => {
  if (!fCount(f)) return null
  const rm = p => set({ ...f, ...p })
  return <div className="fchips">
    {(f.min !== '' || f.max !== '') && <button type="button" onClick={() => rm({ min: '', max: '' })}>{f.min !== '' && f.max !== '' ? `৳${f.min}–${f.max}` : f.min !== '' ? `From ৳${f.min}` : `Up to ৳${f.max}`}<i>✕</i></button>}
    {f.stock && <button type="button" onClick={() => rm({ stock: false })}>In stock<i>✕</i></button>}
    {f.deal && <button type="button" onClick={() => rm({ deal: false })}>On sale<i>✕</i></button>}
    {f.rating > 0 && <button type="button" onClick={() => rm({ rating: 0 })}>★ {f.rating}+<i>✕</i></button>}
    {f.brands.map(b => <button type="button" key={'b' + b} onClick={() => rm({ brands: f.brands.filter(x => x !== b) })}>{b}<i>✕</i></button>)}
    {f.shops.map(s => <button type="button" key={'s' + s} onClick={() => rm({ shops: f.shops.filter(x => x !== s) })}>{shopName(s === 'own' ? null : s, shops)}<i>✕</i></button>)}
    <button type="button" className="clr" onClick={() => set(F0)}>Clear all</button></div>
}
const FBtn = ({ n, onClick }) => <button type="button" className={'fbtn' + (n ? ' on' : '')} onClick={onClick} aria-label={n ? `Filters, ${n} active` : 'Filters'}><Icon n="sliders" /><span>Filters</span>{n > 0 && <em>{n}</em>}</button>

// Live suggestions under a search box: products, categories, brands and shops (or recent searches when empty)
const Suggest = memo(({ q, idx, cats, shops, recent, onPick, onClearRecent }) => {
  const dq = useDeferredValue(q)
  const res = useMemo(() => {
    const qt = toks(dq); if (!qt.length) return null
    const all = searchIn(idx, dq), ts = all.hl.length ? all.hl : qt, has = s => nearHas(s, qt)
    return { ts, fixed: all.fixed, total: all.length, prods: all.slice(0, 5), cs: cats.filter(c => has(c.name)).slice(0, 3), brands: (idx?.brands || []).filter(has).slice(0, 3), sh: Object.values(shops).filter(s => s?.name && has(s.name)).slice(0, 3) }
  }, [dq, idx, cats, shops])
  const stop = e => e.preventDefault() // keep the input focused while tapping a suggestion
  if (!res) return recent.length ? <div className="sg" onMouseDown={stop} role="listbox" aria-label="Recent searches"><div className="sg-h"><span>Recent searches</span><button type="button" onClick={onClearRecent}>Clear</button></div><div className="sg-rc">{recent.map(t => <button type="button" key={t} onClick={() => onPick({ k: 'q', v: t })}><Icon n="clock" />{t}</button>)}</div></div> : null
  const empty = !res.prods.length && !res.cs.length && !res.brands.length && !res.sh.length
  return <div className="sg" onMouseDown={stop} role="listbox" aria-label="Suggestions">
    {empty && <p className="sg-no">No matches for “{q.trim()}”. Try another word.</p>}
    {res.fixed && <button type="button" className="sg-fix" onClick={() => onPick({ k: 'q', v: res.fixed })}>Did you mean <b>{res.fixed}</b>?</button>}
    {res.prods.map(p => <button type="button" key={p.id} className="sg-p" onClick={() => onPick({ k: 'p', v: p })}><Pic p={p} /><span><b><Hi s={p.name} ts={res.ts} /></b><small>{[p.brand, shopName(p.shop_id, shops)].filter(Boolean).join(' · ')}</small></span><em>{taka(p.price)}</em></button>)}
    {(res.cs.length > 0 || res.brands.length > 0 || res.sh.length > 0) && <div className="sg-t">
      {res.cs.map(c => <button type="button" key={'c' + c.id} onClick={() => onPick({ k: 'c', v: c })}><i>Category</i><Hi s={c.name} ts={res.ts} /></button>)}
      {res.brands.map(b => <button type="button" key={'b' + b} onClick={() => onPick({ k: 'b', v: b })}><i>Brand</i><Hi s={b} ts={res.ts} /></button>)}
      {res.sh.map(s => <button type="button" key={'s' + s.id} onClick={() => onPick({ k: 's', v: s })}><i>Shop</i><Hi s={s.name} ts={res.ts} /></button>)}</div>}
    {res.total > 0 && <button type="button" className="sg-all" onClick={() => onPick({ k: 'q', v: q.trim() })}>See all {res.total} result{res.total === 1 ? '' : 's'} · filter &amp; sort <Icon n="chev" /></button>}
  </div>
})

function SearchScreen({ q0 = '', f0 = F0, idx, prods, cats, shops, loading, back, gp, go, recent, addRecent, clearRecent, seen = NONE }) {
  const [q, setQ] = useState(q0), [f, setF] = useState(f0), [sort, setSort] = useState('rel'), [sheet, setSheet] = useState(false), [foc, setFoc] = useState(false), inp = useRef(null)
  const dq = useDeferredValue(q)
  useEffect(() => { if (!q0 && !fCount(f0)) inp.current?.focus() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const base = useMemo(() => (dq.trim() ? searchIn(idx, dq) : prods), [idx, dq, prods])
  const list = useMemo(() => { const r = applyF(base, f); return sort === 'rel' ? (dq.trim() ? r : [...r].sort(SORTS.pop[1])) : [...r].sort(SORTS[sort][1]) }, [base, f, sort, dq])
  const submit = e => { e.preventDefault(); if (q.trim()) addRecent(q); inp.current?.blur() }
  const pick = ({ k, v }) => {
    if (k === 'q') { setQ(v); addRecent(v); inp.current?.blur() }
    else if (k === 'p') { addRecent(q); gp.open(v) }
    else if (k === 'c') go('category', { c: v })
    else if (k === 'b') { setQ(''); setF(x => ({ ...x, brands: [v] })); inp.current?.blur() }
    else if (k === 's') go('shop', { shop: v })
  }
  const closeSheet = useCallback(() => setSheet(false), [])
  return <><Hdr title="Search" back={back} /><div className="scr srch">
    <div className="sbox"><form className="search" onSubmit={submit} role="search"><Icon n="search" /><input ref={inp} type="search" enterKeyHint="search" placeholder="Search products, brands, shops" aria-label="Search" value={q} onChange={e => setQ(e.target.value)} onFocus={() => setFoc(true)} onBlur={() => setTimeout(() => setFoc(false), 120)} />{q && <button type="button" className="sx" aria-label="Clear search" onMouseDown={e => e.preventDefault()} onClick={() => { setQ(''); inp.current?.focus() }}>✕</button>}</form>
      {foc && <Suggest q={q} idx={idx} cats={cats} shops={shops} recent={recent} onPick={pick} onClearRecent={clearRecent} />}</div>
    <div className="tools ftools"><FBtn n={fCount(f)} onClick={() => setSheet(true)} /><select className="inp sort" aria-label="Sort" value={sort} onChange={e => setSort(e.target.value)}><option value="rel">{dq.trim() ? 'Best match' : 'Popular'}</option>{Object.entries(SORTS).filter(([k]) => k !== 'pop').map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</select></div>
    <FChips f={f} set={setF} shops={shops} />
    <p className="rcount">{loading ? 'Loading…' : <><b>{list.length}</b> result{list.length === 1 ? '' : 's'}{dq.trim() && <> for “{dq.trim()}”</>}</>}</p>
    {dq.trim() && base.fixed && <p className="sfix">Showing results for <b>{base.fixed}</b>. <button type="button" onClick={() => setQ(base.fixed)}>Search that instead</button></p>}
    {dq.trim() && base.loose && <p className="sfix">No product matches every word, so these match most of them.</p>}
    {!dq.trim() && !fCount(f) && seen.length > 0 && <Rail title="Recently viewed" list={seen} {...gp} />}
    {!loading && !list.length ? <div className="emp"><div className="emp-i"><Icon n="search" /></div><h3>Nothing found</h3><p>{fCount(f) ? 'Try removing a filter or two.' : 'Check the spelling or try a shorter word.'}</p>{fCount(f) > 0 && <button className="btn" onClick={() => setF(F0)}>Clear filters</button>}</div> : <Grid list={list} loading={loading} {...gp} />}
    {sheet && <FilterSheet base={base} shops={shops} f={f} onApply={v => { setF(v); setSheet(false) }} onClose={closeSheet} />}
  </div></>
}

// --- live delivery: rider on the map (Pinkish zone) or courier tracking (outside 4 km) ---
const LiveTrack = ({ o, st }) => {
  const courier = modeOf(o) === 'courier', ad = o.address || {}, home = okLL(ad.lat, ad.lng)
  const r = usePoll(() => api.myRiderLocation(o.id), 8000, !courier && st === 2 && /^[0-9a-f-]{36}$/i.test(String(o.id)), [o.id])
  if (st >= 3 || st === 4) return null
  if (courier) {
    const url = safeUrl(o.courier_url)
    return <section className="tk-card tk-cr"><header><h5>Courier delivery</h5><span className="tk-pill">{o.courier_name || 'Partner courier'}</span></header>
      <div className="tk-row"><span className="tk-ic">📦</span><div>{o.courier_tracking
        ? <><small>Tracking ID</small><b className="tk-tid">{o.courier_tracking}</b><p>Your parcel is with {o.courier_name || 'our courier partner'}. They will call you before delivery.</p></>
        : <><small>{ZONE[orderZone(o)]?.name || 'Courier delivery'} · {ZONE[orderZone(o)]?.eta || '1–4 days'}</small><b>Pathao or a partner courier delivers this order</b><p>Pinkish packs it and hands it to the courier. Your tracking ID appears here, and you get a notification.</p></>}</div></div>
      {url && <a className="btn tk-go" href={url} target="_blank" rel="noopener noreferrer">Track with {o.courier_name || 'courier'} →</a>}</section>
  }
  if (st !== 2) return null
  const rl = r && okLL(r.lat, r.lng) ? r : null, km = rl && home ? havKm(+rl.lat, +rl.lng, +ad.lat, +ad.lng) : null, eta = etaMin(km)
  const markers = [rl && { id: 'rider', kind: 'rider', lat: rl.lat, lng: rl.lng, label: (rl.name || 'Your rider') + ' · ' + seenAgo(rl.seen) }, home && { id: 'home', kind: 'home', lat: ad.lat, lng: ad.lng, label: 'You' }].filter(Boolean)
  return <section className="tk-card tk-live"><header><h5>Live delivery</h5>{rl && <span className="tk-pill">{km != null ? (km < 0.15 ? 'Arriving now' : `${kmTxt(km)} · about ${eta} min`) : 'On the way'}</span>}</header>
    {markers.length > 0 ? <LiveMap markers={markers} follow="rider" height={230} lazy={lowData()} chip={rl ? { text: (rl.name || 'Rider') + ' · ' + seenAgo(rl.seen), old: !fresh(rl.seen, 2) } : { text: 'Waiting for the rider\'s location…', old: true }} />
      : <p className="tk-wait">Your rider is on the way. The live map appears as soon as their location comes in.</p>}
    {!home && <p className="tk-wait">Tip: pin your location in Addresses next time, so the rider finds you faster.</p>}</section>
}
const lowData = () => { try { const c = navigator.connection; return !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) } catch { return false } }

// --- delivery code from the Pinkish Rider system (only for the signed-in customer's own order) ---
const DeliveryCode = ({ o, st }) => {
  const [d, setD] = useState(null)
  const live = st < 3 && st !== 4 && api.supabase && /^[0-9a-f-]{36}$/i.test(String(o.id))
  useEffect(() => {
    if (!live) return
    let on = true
    const pull = () => api.supabase.rpc('my_delivery', { p_order: String(o.id) }).then(({ data, error }) => { if (on && !error) setD(data || null) }, () => {})
    pull(); const t = setInterval(pull, 20000)
    return () => { on = false; clearInterval(t) }
  }, [live, o.id])
  if (!live || !d?.code) return null
  return <section className="tk-card tk-dc"><header><h5>Delivery code</h5>{d.rider && <span className="tk-pill">Rider {d.rider}</span>}</header>
    <div className="tk-code"><div><small>Give this to the rider</small><b>{d.code}</b></div>{d.rider_phone && <a href={'tel:' + d.rider_phone}><Icon n="call" />Call rider</a>}</div>
    <p className="h">Share it only after you have your parcel in hand{o.payment_status !== 'paid' ? ' and paid the rider' : ''}. Pinkish staff will never ask for it on the phone.</p></section>
}

// --- returns & refunds ---
const RHINT = { requested: 'We review requests within 1–2 working days.', approved: 'Keep the item(s) in their packaging. Our rider will collect them and call you first.', received: 'We received the item(s) and are checking them.' }
const ReturnCard = ({ o, st, ret, onStart }) => {
  if (ret) {
    const k = api.returnStep(ret), rej = ret.status === 'rejected', done = ret.status === 'completed', n = (ret.items || []).reduce((a, i) => a + (+i.qty || 1), 0)
    const hint = done ? (ret.kind === 'replace' ? 'Your replacement is on its way.' : `${taka(ret.refund_amount ?? ret.amount)} refunded${ret.refund_to ? ' to ' + ret.refund_to : ''}.`) : rej ? '' : RHINT[ret.status]
    return <section className={'tk-card rtn' + (rej ? ' rej' : done ? ' fin' : '')}><header><h5>Return request</h5><span className={'tk-chip ' + (rej ? 'no' : done ? 'ok' : 'wait')}>{api.returnLabel(ret)}</span></header>
      {!rej && <div className="rtn-st">{api.RETURN_STEPS.map((l, i) => <div key={l} className={i <= k ? 'on' : ''}><i>{i < k || done ? '✓' : i + 1}</i><small>{i === 3 ? (ret.kind === 'replace' ? 'Replaced' : 'Refunded') : l}</small></div>)}</div>}
      <div className="tk-row"><span className="tk-ic"><Icon n="ret" /></span><div><small>{ret.kind === 'replace' ? 'Replacement' : 'Refund'} · {n} item{n === 1 ? '' : 's'} · {new Date(ret.created_at).toLocaleDateString([], { dateStyle: 'medium' })}</small><b>{ret.reason}</b>{ret.details && <p>{ret.details}</p>}<em>{(ret.items || []).map(i => i.name + (i.qty > 1 ? ' ×' + i.qty : '')).join(', ')}</em></div></div>
      {ret.admin_note && <div className="rtn-note"><b>Pinkish:</b> {ret.admin_note}</div>}
      {hint && <p className="rtn-hint">{hint}</p>}
      {rej && api.canReturn(o) && <button className="btn o" onClick={onStart}>Request again</button>}
    </section>
  }
  if (st !== 3) return null
  if (!api.canReturn(o)) return api.supabase && /^[0-9a-f-]{36}$/i.test(String(o.id)) ? <p className="rtn-closed">The {api.RETURN_DAYS}-day return window for this order has closed.</p> : null
  return <section className="tk-card rtn cta"><div className="rtn-cta"><span className="tk-ic"><Icon n="ret" /></span><div><b>Something not right?</b><small>Request a return or refund · {api.returnDaysLeft(o)} day{api.returnDaysLeft(o) === 1 ? '' : 's'} left</small></div></div><button className="btn o" onClick={onStart}>Request return / refund</button></section>
}
const BDPHONE = /^(?:\+?88)?01[3-9]\d{8}$/
function ReturnScreen({ o, user, back, say, onDone }) {
  const its = o.items || []
  const [sel, setSel] = useState(() => (its.length === 1 ? { 0: its[0].qty || 1 } : {}))
  const [reason, setReason] = useState(''), [kind, setKind] = useState('refund'), [details, setDetails] = useState(''), [busy, setBusy] = useState(false)
  const [to, setTo] = useState(() => o.bkash_sender || o.address?.phone || user?.mobile || '')
  const picked = Object.keys(sel), amount = picked.reduce((a, i) => a + (+its[i].price || 0) * sel[i], 0), needWhy = reason === 'Other' || reason === 'Not as described' || reason === 'Damaged or broken'
  const toggle = i => setSel(s => { const n = { ...s }; if (n[i]) delete n[i]; else n[i] = its[i].qty || 1; return n })
  const step = (i, d) => setSel(s => ({ ...s, [i]: Math.max(1, Math.min(its[i].qty || 1, s[i] + d)) }))
  const submit = async () => {
    if (!picked.length) return say('Choose the item(s) you want to return')
    if (!reason) return say('Tell us what happened')
    if (needWhy && details.trim().length < 10) return say('Add a few words about the problem (at least 10 characters)', 3000)
    if (kind === 'refund' && !BDPHONE.test(to.replace(/[\s-]/g, ''))) return say('Enter the bKash / Nagad number for your refund (01XXXXXXXXX)', 3200)
    setBusy(true)
    try { onDone(await api.requestReturn({ order: o, items: picked.map(i => ({ id: its[i].id, variant: its[i].variant, qty: sel[i] })), kind, reason, details, refundTo: kind === 'refund' ? to.replace(/[\s-]/g, '') : '' })) }
    catch (e) { say(e?.message || 'Could not send your request.', 3500); setBusy(false) }
  }
  return <><Hdr title="Return or refund" back={back} /><div className="scr narrow rtf">
    <div className="rtf-hero"><span><Icon n="ret" /></span><div><b>Order #{o.order_no}</b><small>{api.returnDaysLeft(o)} day{api.returnDaysLeft(o) === 1 ? '' : 's'} left to request · free pick-up</small></div></div>
    <h5 className="rtf-t">1. Which items?</h5>
    <div className="rtf-its">{its.map((i, k) => { const on = !!sel[k]; return <div key={i.key || k} className={'rti' + (on ? ' on' : '')}>
      <button type="button" className="rti-m" role="checkbox" aria-checked={on} onClick={() => toggle(k)}><i className="rti-c">{on ? '✓' : ''}</i><Pic p={i} /><span><b>{i.name}</b><small>{i.variant && i.variant !== 'Standard' ? i.variant + ' · ' : ''}{taka(i.price)} × {i.qty}</small></span></button>
      {on && (i.qty || 1) > 1 && <div className="qty rti-q"><button type="button" aria-label="Fewer" onClick={() => step(k, -1)}>−</button><span>{sel[k]}</span><button type="button" aria-label="More" onClick={() => step(k, 1)}>+</button></div>}</div> })}</div>
    <h5 className="rtf-t">2. What happened?</h5>
    <div className="chips wrap">{api.RETURN_REASONS.map(r => <button type="button" key={r} className={reason === r ? 'on' : ''} aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>)}</div>
    <label className="lbl">{needWhy ? 'Describe the problem' : 'Anything else? (optional)'}<textarea className="inp" rows="3" maxLength={600} placeholder={reason === 'Damaged or broken' ? 'What is damaged? Was the box damaged too?' : 'Tell us more so we can help faster'} value={details} onChange={e => setDetails(e.target.value)} /></label>
    <h5 className="rtf-t">3. What would you like?</h5>
    <div className="rtf-k">{[['refund', 'Refund my money', 'Sent to your bKash / Nagad', 'card'], ['replace', 'Replacement', 'Same item, sent again', 'box']].map(([k, l, d, ic]) => <button type="button" key={k} className={kind === k ? 'on' : ''} aria-pressed={kind === k} onClick={() => setKind(k)}><span><Icon n={ic} /></span><b>{l}</b><small>{d}</small></button>)}</div>
    {kind === 'refund' && <label className="lbl">bKash / Nagad number for the refund<input className="inp" type="tel" inputMode="tel" autoComplete="tel" placeholder="01XXXXXXXXX" value={to} onChange={e => setTo(e.target.value)} /></label>}
    <div className="rtf-sum"><span>{kind === 'refund' ? 'Estimated refund' : 'Items to replace'}</span><b>{kind === 'refund' ? taka(amount) : picked.reduce((a, i) => a + sel[i], 0) + ' item(s)'}</b></div>
    <div className="note">📦 Keep the item(s) and packaging. If we approve, our rider collects them from your address. Delivery charges are not refunded.</div>
  </div>
  <div className="buybar one"><button className="btn" disabled={busy} onClick={submit}>{busy ? <i className="spin" /> : 'Send request'}</button></div></>
}

const Profile = memo(({ user, admin, count, wishCount, place, hasAddr, tab, go, say, onLogout, authed, onLogin }) => {
  const cols = useMemo(() => [
    [['Account', [['receipt', 'My Orders', 'Track your deliveries', () => tab('orders'), 't1'], ['heart', 'Wishlist', `${wishCount} saved item${wishCount === 1 ? '' : 's'}`, () => go('wishlist'), 't2'], ['pin', 'Addresses', hasAddr ? place : 'Set your delivery address', () => go('address'), 't3'], ['card', 'Payment Methods', 'Cards & mobile wallets', null, 't1']]]],
    [...(admin ? [['Store admin', [['grid', 'Manage Categories & Products', 'Add or remove items', () => go('manage'), 't2']]]] : []),
      ['Support', [['lock', 'Privacy & Help', 'Your data, your control', null, 't3'], ['info', 'About Pinkish', 'Our story & version', null, 't2']]]],
  ], [admin, wishCount, tab, go, hasAddr, place])
  return <div className="scr narrow pf">
    <div className="pf-hero"><div className="pf-av"><div className="av">{(user?.name || 'G')[0].toUpperCase()}</div></div>
      <div className="pf-id"><em>{authed ? 'Welcome back' : 'Welcome'}</em><b>{authed ? user?.name || 'Guest' : 'Guest'}</b><small>{authed ? user?.phone || 'Welcome back' : 'Log in to order and track deliveries'}</small>{admin && <span className="pf-bd">★ Store Admin</span>}</div></div>
    <div className="pf-stats">
      <button onClick={() => tab('cart')}><i className="t1"><Icon n="bag" /></i><b>{count}</b><small>In cart</small></button>
      <button onClick={() => go('wishlist')}><i className="t2"><Icon n="heart" /></i><b>{wishCount}</b><small>Wishlist</small></button>
      <button onClick={() => go('address')}><i className="t3"><Icon n="pin" /></i><b>{place}</b><small>Delivery area</small></button></div>
    <div className="pf-cols">{cols.map((col, n) => <div className="pf-col" key={n}>{col.map(([t, rows]) => <section key={t}><h5 className="pf-t">{t}</h5><div className="pf-g">
      {rows.map(([i, l, d, f, tone]) => <button key={l} className="menu pm" onClick={f || (() => say('Coming soon'))}><span className={'pi ' + tone}><Icon n={i} /></span><span className="pt"><b>{l}</b><small>{d}</small></span><span className="chev"><Icon n="chev" /></span></button>)}</div></section>)}</div>)}</div>
    {authed ? <button className="menu pf-out" onClick={onLogout}><span><Icon n="logout" /></span><span>Log out</span></button>
      : <button className="menu pf-out pf-in" onClick={onLogin}><span><Icon n="user" /></span><span>Log in / Sign up</span></button>}
  </div>
})

// ---------- Welcome (first visit): one clean screen, like a modern marketplace ----------
// Real products from the cached catalogue make the hero; no slides, no timers, CSS-only motion.
const WEL_PTS = [['truck', 'Delivery', 'from ৳40'], ['card', 'Cash or bKash', 'on delivery'], ['shield', 'Verified', 'sellers']]
function Welcome({ prods = NONE, cats = NONE, onStart, onLogin }) {
  const [out, setOut] = useState(false)
  // four best-looking products with a picture (highest rated first) for the mosaic
  const pics = useMemo(() => prods.filter(p => p.image_url && p.is_active !== false && stockOf(p) !== 0).sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.reviews || 0) - (a.reviews || 0)).slice(0, 4), [prods])
  const chips = useMemo(() => cats.slice(0, 8), [cats])
  useEffect(() => { warm(['/logo-mark.webp?v=2']) }, [])
  const leave = then => { if (out) return; writeLS('pk_wel', 1); if (lite()) return then(); setOut(true); setTimeout(then, 220) }
  return <div className={'wl' + (out ? ' out' : '')}>
    <header className="wl-top">
      <span className="wl-logo"><img src="/logo-mark.webp?v=2" width="30" height="30" alt="" decoding="async" draggable="false" /><b className="wm"><span className="bp">Pink</span><span className="bi">ish</span></b></span>
      <button type="button" className="wl-skip" onClick={() => leave(onStart)}>Skip</button>
    </header>

    <div className="wl-body">
      <div className="wl-hero">
        <span className="wl-tag"><i />Chattogram's marketplace for her</span>
        {pics.length >= 3
          ? <div className={'wl-mos n' + pics.length} aria-hidden="true">{pics.map((p, k) => <span key={p.id}><img src={p.image_url} alt="" width="160" height="160" loading="eager" fetchpriority={k === 0 ? 'high' : undefined} decoding="async" draggable="false" />{k === 0 && api.dealLive(p) && <em>-{api.dealPct(p)}%</em>}</span>)}</div>
          : <div className="wl-art" aria-hidden="true"><ShopArt /></div>}
      </div>

      <h1>Everything you love,<em>delivered discreetly.</em></h1>
      <p className="wl-sub">Beauty, fashion and self-care from verified local shops. Order in seconds, pay when it arrives.</p>

      {chips.length > 0 && <div className="wl-cats" aria-label="Popular categories">{chips.map(c => <button type="button" key={c.id} onClick={() => leave(onStart)}><span><CatIcon c={c} /></span>{c.name}</button>)}</div>}

      <ul className="wl-pts">{WEL_PTS.map(([ic, a, b]) => <li key={a}><i><Icon n={ic} /></i><span><b>{a}</b><small>{b}</small></span></li>)}</ul>
    </div>

    <div className="wl-cta">
      <button type="button" className="btn wl-go" onClick={() => leave(onStart)}>Start shopping<Icon n="chev" /></button>
      <p className="wl-in">Already have an account? <button type="button" onClick={() => leave(onLogin)}>Log in</button></p>
    </div>
  </div>
}

export default function App() {
  const [oflt, setOflt] = useState('all')
  useLiquid(); usePerf()
  const [stack, setStack] = useState([{ s: 'splash' }])
  const [user, setUser] = useState(() => { try { return api.getUser() } catch { return null } })
  const [cats, setCats] = useState(() => readLS('pk_c', [])), [prods, setProds] = useState(() => readLS('pk_p', [])), [shops, setShops] = useState(() => readLS('pk_s', {})), [loading, setLoading] = useState(() => !readLS('pk_p', []).length)
  const [cart, setCart] = useState(() => readLS('ms_cart', []))
  const [orders, setOrders] = useState([]), [liveSt, setLiveSt] = useState({})
  const [mode, setMode] = useState(() => api.RECOVERY_LINK ? 'reset' : api.LINK_EXPIRED ? 'forgot' : 'login')
  const [form, setForm] = useState({ name: '', phone: '', id: '', pw: '', pw2: '' }), [showPw, setShowPw] = useState(false), [shake, setShake] = useState(false), [busy, setBusy] = useState(false)
  const [loc, setLoc] = useState(() => ({ city: 'Chattogram', area: '', line: '', ...readLS('ms_loc', {}) }))
  const [addr, setAddr] = useState(() => {
    const l = readLS('ms_loc', null)
    return { name: '', phone: '', address: fullAddr(l), note: '', lat: l?.lat, lng: l?.lng }
  })
  const [pay, setPay] = useState(0), [promo, setPromo] = useState(() => readLS('pk_promo', '')), [coupon, setCoupon] = useState(null), [cbusy, setCbusy] = useState(false), [pubC, setPubC] = useState(NONE)
  const [dcfg, setDcfg] = useState(() => setDeliveryCfg(api.cachedDeliveryCfg()))
  const [q, setQ] = useState(''), [nc, setNc] = useState({ name: '', icon: '🛍️' })
  const [np, setNp] = useState({ name: '', price: '', category_id: '', image_url: '' })
  const [wish, setWish] = useState(() => readLS('ms_wish', []))
  const [dir, setDir] = useState('fade'), [sort, setSort] = useState('pop'), [chip, setChip] = useState('All'), dq = useDeferredValue(q)
  const toastR = useRef({}), wishPrev = useRef(null), wishUser = useRef(''), prodsR = useRef([]), recov = useRef(!!api.RECOVERY_LINK)

  const [gate, setGate] = useState(null) // why the "please log in" sheet is open (null = closed)
  const [rv, setRv] = useState(() => readLS('pk_rv', [])), [recent, setRecent] = useState(() => readLS('pk_rs', [])), [sgOn, setSgOn] = useState(false)
  const [cf, setCf] = useState(F0), [csheet, setCsheet] = useState(false), [rets, setRets] = useState([]), [retTick, setRetTick] = useState(0)
  const cartR = useRef(cart); cartR.current = cart
  const cur = stack[stack.length - 1]
  const s = cur.s
  const admin = useMemo(() => !!user && !!safeAdmin(user), [user])

  const depth = useRef(0), after = useRef(null), popped = useRef(false)
  // collapse every pushed history entry (used when jumping to a tab / finishing an order), then run fn
  const collapse = useCallback(fn => {
    const n = depth.current; depth.current = 0
    if (!n) return fn()
    after.current = fn
    try { history.go(-n) } catch { after.current = null; return fn() }
    setTimeout(() => { const f = after.current; if (f) { after.current = null; f() } }, 400)
  }, [])
  const go = useCallback((s, p = {}) => {
    if (s === 'category') { setQ(''); setCf(F0); setChip('All') }
    setDir('fwd'); depth.current++
    try { history.pushState({ ms: depth.current }, '') } catch { /* history blocked */ }
    setStack(a => [...a, { s, ...p }])
  }, [])
  const tab = useCallback(s => { setQ(''); setDir('fade'); setStack([{ s }]); collapse(() => {}) }, [collapse])
  const popOne = useCallback(() => { if (depth.current > 0) { depth.current--; setDir('back'); setStack(a => (a.length > 1 ? a.slice(0, -1) : a)) } }, [])
  const back = useCallback(() => {
    if (depth.current > 0) {
      popped.current = false
      try { history.back() } catch { popOne(); return }
      setTimeout(() => { if (!popped.current) popOne() }, 300) // fallback if the browser never fires popstate
    } else tab('home')
  }, [popOne, tab])
  useEffect(() => {
    const h = () => {
      popped.current = true
      const f = after.current
      if (f) { after.current = null; f(); return }
      popOne()
    }
    window.addEventListener('popstate', h)
    return () => window.removeEventListener('popstate', h)
  }, [popOne])
  const say = useCallback((m, ms = 1800) => { const o = toastR.current; if (o.fn) o.fn(m, ms); else o.pend = [m, ms] }, [])
  const open = useCallback(p => go('product', { p }), [go])
  const openTrack = useCallback(order => go('tracking', { order }), [go])
  const like = useCallback(id => setWish(w => w.includes(id) ? w.filter(x => x !== id) : [...w, id]), [])
  const logout = useCallback(async () => { await safe(() => api.signOut()); setUser(null); tab('home'); say('You have been logged out') }, [tab, say])
  const saveLoc = useCallback(v => {
    if (!v) return say('Add your area or full address')
    setLoc(v); writeLS('ms_loc', v); setAddr(a => ({ ...a, address: fullAddr(v), lat: v.lat, lng: v.lng })); say('Address saved'); back()
  }, [say, back])
  const bad = useCallback(m => { say(m); setShake(true); setTimeout(() => setShake(false), 480) }, [say])
  // ---- login on demand: browsing is open to everyone, an account is needed only to order / ask / follow ----
  const authed = !!realUid(user) || (!api.supabase && !!user)
  const pending = useRef(null) // what the person was doing when we asked them to log in ('checkout' resumes it)
  const needLogin = useCallback(why => setGate(why || 'login'), [])
  const goLogin = useCallback(() => { pending.current = null; setMode('login'); go('auth') }, [go])
  const openAuth = m => { pending.current = gate === 'checkout' ? 'checkout' : null; setGate(null); setMode(m); go('auth') }
  const finishAuth = () => {
    const n = pending.current; pending.current = null
    if (n === 'checkout') { setDir('fwd'); setStack(a => [...a.slice(0, -1), { s: 'checkout' }]) } // swap the login screen for checkout
    else if (depth.current > 0) back()
    else tab('home')
  }
  const googleGate = () => { try { sessionStorage.setItem('pk_after', gate === 'checkout' ? 'checkout' : '') } catch { /* storage unavailable */ } setGate(null); api.signInWithGoogle().catch(e => say(e?.message || 'Google login failed')) }
  const closeAuth = () => { pending.current = null; setMode('login'); if (depth.current > 0) back(); else tab('home') }

  const busyL = useRef(false), againL = useRef(null), sigs = useRef({ c: '', p: '', s: '' })
  // only = 'p' reloads just the products (cheap); anything else reloads everything.
  // Never runs two loads at once, and skips the re-render when the data did not change.
  const load = useCallback(async only => {
    if (busyL.current) { againL.current = againL.current === 'all' || only !== 'p' ? 'all' : 'p'; return }
    busyL.current = true
    try {
      const [c, p, sh] = await Promise.all([only === 'p' ? null : safe(() => api.getCategories()), safe(() => api.getProducts()), only === 'p' ? null : safe(() => api.getShops())])
      const put = (k, v, set, sg, store) => { if (!v) return; if (sigs.current[k] !== sg) { sigs.current[k] = sg; set(v); setTimeout(() => writeLS(store, v), 0) } }
      put('c', c, setCats, c && JSON.stringify(c), 'pk_c')
      put('p', p, setProds, p && p.map(x => [x.id, x.name, x.price, x.old_price, x.deal_ends_at, x.stock, x.is_active, x.image_url, x.tag, x.brand, x.rating, x.reviews, x.category_id, x.shop_id, JSON.stringify(x.variants), JSON.stringify(x.features), (x.images || []).join(',')].join('|')).join('~'), 'pk_p')
      put('s', sh, setShops, sh && JSON.stringify(sh), 'pk_s')
      if (!c && !p && only !== 'p') say('Could not load products. Check your connection.')
    } finally { busyL.current = false; setLoading(false) }
    const next = againL.current; againL.current = null
    if (next) load(next === 'p' ? 'p' : undefined)
  }, [say])

  useEffect(() => { load() }, [load])
  // delivery prices + rider rules (Admin → Promotions). Refreshed when the app comes back to the front.
  useEffect(() => {
    const run = () => { if (!document.hidden) api.getDeliveryCfg().then(v => { if (v) setDcfg(setDeliveryCfg(v)) }) }
    run(); document.addEventListener('visibilitychange', run)
    return () => document.removeEventListener('visibilitychange', run)
  }, [])
  // while the person looks at the first products, quietly fetch the next pictures so scrolling shows them instantly
  useEffect(() => {
    if (!prods.length) return
    const run = () => warm(prods.slice(0, 24).map(x => x.image_url))
    const ric = typeof requestIdleCallback === 'function'
    const id = ric ? requestIdleCallback(run, { timeout: 1500 }) : setTimeout(run, 400)
    return () => { ric ? cancelIdleCallback(id) : clearTimeout(id) }
  }, [prods])
  // best sellers: separate from load() because it is heavier and changes slowly
  const [best, setBest] = useState([]), [notifs, setNotifs] = useState([]), [following, setFollowing] = useState(() => new Set())
  useEffect(() => {
    let on = true; const run = () => { if (!document.hidden) api.getBestSellers(12).then(r => on && setBest(r)) }
    run(); const i = setInterval(run, 300000)
    return () => { on = false; clearInterval(i) }
  }, [])
  // notifications (live) + followed shops, only for real signed-in accounts
  useEffect(() => {
    if (!user?.id || user.id === 'local') { setNotifs([]); setFollowing(new Set()); return }
    let on = true
    safe(() => api.getNotifications(user.id), []).then(n => on && setNotifs(n))
    safe(() => api.getFollowing(user.id), []).then(f => on && setFollowing(new Set(f)))
    const off = api.onNotification(user.id, n => { setNotifs(a => [n, ...a.filter(x => x.id !== n.id)].slice(0, 50)); if (String(n.link || '').startsWith('order:')) setRetTick(t => t + 1) })
    return () => { on = false; off() }
  }, [user?.id])
  const unread = useMemo(() => notifs.reduce((a, n) => a + (n.is_read ? 0 : 1), 0), [notifs])
  const readAll = useCallback(() => { setNotifs(a => a.map(n => ({ ...n, is_read: true }))); safe(() => api.markNotificationsRead(user?.id)) }, [user?.id])
  const toggleFollow = useCallback(async shopId => {
    if (!user?.id || user.id === 'local') return needLogin('follow')
    const on = !following.has(shopId), flip = v => setFollowing(s => { const n = new Set(s); v ? n.add(shopId) : n.delete(shopId); return n })
    flip(on)
    try { await api.setFollow(user.id, shopId, on); say(on ? 'Following. You will hear about new products and deals.' : 'Unfollowed', 2200) } catch { flip(!on); say('Could not update. Please try again.') }
  }, [user?.id, following, say, needLogin])
  const openNote = useCallback(n => {
    if (!n.is_read) { setNotifs(a => a.map(x => x.id === n.id ? { ...x, is_read: true } : x)); safe(() => api.markNotificationsRead(user?.id, [n.id])) }
    const [kind, id] = String(n.link || '').split(':')
    if (kind === 'product') { const p = byIdR.current.get(id); p ? open(p) : say('This product is no longer available') }
    else if (kind === 'shop') { const sh = shops[id]; sh && go('shop', { shop: sh }) }
    else if (kind === 'order') safe(() => api.getOrders(user?.id), null).then(list => { if (!list) return; setOrders(list); const o = list.find(x => String(x.order_no) === id); o ? go('tracking', { order: o }) : tab('orders') })
  }, [user?.id, open, go, tab, say, shops])
  // Google / email-confirm redirects, password-recovery links, sign-out
  useEffect(() => api.onAuthChange((u, ev) => {
    if (ev === 'PASSWORD_RECOVERY') { recov.current = true; setMode('reset'); setStack([{ s: 'auth' }]); return }
    if (!u) { setUser(null); return }
    setUser(p => (p?.id === u.id && p.is_admin === u.is_admin ? p : u))
    if (!recov.current) setStack(st => { const top = st[st.length - 1].s; return top === 'splash' || top === 'ob' || (top === 'auth' && depth.current === 0) ? [{ s: 'home' }] : st })
  }), [])
  // use the name / phone given at registration to pre-fill delivery details
  useEffect(() => { if (user?.id && user.id !== 'local') setAddr(a => ({ ...a, name: a.name || user.name || '', phone: a.phone || user.mobile || '' })) }, [user])
  // new / edited / hidden products and categories show up without a reload
  useEffect(() => {
    const sb = api.supabase; if (!sb) return
    // bursts of changes are merged into one refresh, at most one every 4 seconds
    let t, last = 0, full = false
    const soon = all => { if (all) full = true; clearTimeout(t); t = setTimeout(() => { last = Date.now(); const f = full; full = false; load(f ? undefined : 'p') }, Math.max(500, 4000 - (Date.now() - last))) }
    const vis = () => { if (!document.hidden) soon(true) }
    const back = () => soon(true)
    const ch = sb.channel('store-live').on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => soon(false)).on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => soon(true)).subscribe()
    let bc; try { bc = new BroadcastChannel('pk-products'); bc.onmessage = () => { clearTimeout(t); load('p') } } catch { /* not supported */ }
    document.addEventListener('visibilitychange', vis); window.addEventListener('focus', back); window.addEventListener('online', back); const poll = setInterval(() => { if (!document.hidden) soon(false) }, 30000)
    return () => { clearTimeout(t); clearInterval(poll); try { bc && bc.close() } catch { /* closed */ } document.removeEventListener('visibilitychange', vis); window.removeEventListener('focus', back); window.removeEventListener('online', back); sb.removeChannel(ch) }
  }, [load])
  useEffect(() => { const t = setTimeout(() => writeLS('ms_cart', cart), 250); return () => clearTimeout(t) }, [cart])
  useEffect(() => { const t = setTimeout(() => writeLS('ms_wish', wish), 250); return () => clearTimeout(t) }, [wish])
  prodsR.current = prods
  // one lookup table instead of scanning the whole catalogue (cart stock checks, product screen, notifications)
  const byId = useMemo(() => new Map(prods.map(x => [String(x.id), x])), [prods]), byIdR = useRef(byId); byIdR.current = byId
  // mirror the wishlist to Supabase so the admin panel can see it (silent no-op when offline / table missing)
  useEffect(() => {
    const sb = api.supabase
    if (!sb) return
    const t = setTimeout(async () => {
      const prev = wishPrev.current, uk = user?.id || '', full = !prev || wishUser.current !== uk
      wishPrev.current = wish; wishUser.current = uk
      const add = full ? wish : wish.filter(id => !prev.includes(id)), del = full ? [] : prev.filter(id => !wish.includes(id))
      const dv = devId(), uid = realUid(user), label = user?.phone || user?.name || null
      const nm = id => prodsR.current.find(p => p.id === id)?.name || null
      try {
        if (add.length) await sb.from('wishlists').upsert(add.map(id => ({ device_id: dv, product_id: String(id), product_name: nm(id), user_id: uid, user_label: label })), { onConflict: 'device_id,product_id', ignoreDuplicates: true })
        for (const id of del) await sb.from('wishlists').delete().eq('device_id', dv).eq('product_id', String(id))
      } catch { /* wishlist stays local */ }
    }, 600)
    return () => clearTimeout(t)
  }, [wish, user])
  useEffect(() => {
    if (cur.s !== 'splash') return
    let on = true
    Promise.all([safe(() => api.restoreUser()), new Promise(r => setTimeout(r, user ? 250 : 800))]).then(([u]) => { if (!on) return; if (recov.current || api.LINK_EXPIRED) return tab('auth'); if (u) setUser(u); let r = ''; try { r = sessionStorage.getItem('pk_after') || ''; sessionStorage.removeItem('pk_after') } catch { /* storage unavailable */ } if (r === 'checkout' && (u || user)) { tab('cart'); say('You are logged in. Continue to checkout.', 3000) } else if (!u && !user && !DEEP && !readLS('pk_wel', 0)) { setDir('fade'); setStack([{ s: 'ob' }]) } else tab('home') })
    return () => { on = false }
  }, [])
  useEffect(() => { if (s === 'orders' || s === 'tracking') safe(() => api.getOrders(user?.id), null).then(o => { if (o) setOrders(o) }) }, [s, user])
  // return requests: only fetched where they are shown, and again when a return update arrives in the bell
  const retOn = s === 'orders' || s === 'tracking'
  useEffect(() => {
    const uid = realUid(user); if (!uid) { setRets([]); return }
    if (!retOn) return
    let on = true; safe(() => api.getMyReturns(uid), null).then(r => { if (on && r) setRets(r) })
    return () => { on = false }
  }, [retOn, user?.id, retTick]) // eslint-disable-line react-hooks/exhaustive-deps
  const retBy = useMemo(() => { const m = new Map(); for (const r of rets) if (!m.has(String(r.order_id))) m.set(String(r.order_id), r); return m }, [rets]) // newest first
  // recently viewed (this device only)
  const pid = s === 'product' ? cur.p?.id : null
  useEffect(() => { if (pid != null) setRv(r => (r[0] === pid ? r : [pid, ...r.filter(x => x !== pid)].slice(0, 16))) }, [pid])
  useEffect(() => { const t = setTimeout(() => writeLS('pk_rv', rv), 400); return () => clearTimeout(t) }, [rv])
  const addRecent = useCallback(t => { t = String(t || '').trim().slice(0, 60); if (t.length < 2) return; setRecent(r => { const n = [t, ...r.filter(x => x.toLowerCase() !== t.toLowerCase())].slice(0, 8); writeLS('pk_rs', n); return n }) }, [])
  const clearRecent = useCallback(() => { setRecent([]); writeLS('pk_rs', []) }, [])
  // a shared product link opens that product as soon as the catalogue is known
  const deep = useRef(DEEP)
  useEffect(() => {
    if (!deep.current || s === 'splash' || !prods.length) return
    const p = byId.get(String(deep.current)); deep.current = null
    p ? open(p) : say('This product is no longer available')
  }, [s, prods, byId, open, say])
  // live status for the tracking screen (works for guests too, via the track_order() database function)
  useEffect(() => {
    const o0 = s === 'tracking' ? cur.order : null
    if (!o0?.order_no || !api.supabase) return
    let on = true, warned = false
    const pull = async () => {
      try {
        const { data, error } = await api.supabase.rpc('track_order', { p_order_no: o0.order_no, p_phone: o0.address?.phone || '' })
        if (error) { console.warn('track_order failed:', error.message); if (!warned) { warned = true; say('Live tracking is not set up yet') } }
        const n = Array.isArray(data) ? data[0] : data
        if (on && !error && n != null && !isNaN(+n)) setLiveSt(m => m[o0.order_no] === +n ? m : { ...m, [o0.order_no]: +n })
      } catch { /* keep last known status */ }
    }
    pull(); const t = setInterval(pull, 15000)
    return () => { on = false; clearInterval(t) }
  }, [s, cur, say])

  /* ---------- derived data (memoised) ---------- */
  const wishSet = useMemo(() => new Set(wish), [wish])
  const { subtotal, count } = useMemo(() => ({ subtotal: cart.reduce((a, i) => a + i.price * i.qty, 0), count: cart.reduce((a, i) => a + i.qty, 0) }), [cart])
  // Coupons and free delivery apply to Cash on Delivery orders (bKash / Nagad totals are unchanged)
  const cod = pay === 0
  const disc = coupon && cod ? Math.min(subtotal, +coupon.discount || 0) : 0
  const delivery = useMemo(() => deliveryFor(loc, { subtotal: subtotal - disc, cod, freeCoupon: !!coupon?.free_delivery }), [loc, subtotal, disc, cod, coupon, dcfg]) // eslint-disable-line react-hooks/exhaustive-deps
  const total = Math.max(0, subtotal - disc + (delivery.fee || 0))
  const catCount = useMemo(() => { const m = new Map(); for (const p of prods) m.set(p.category_id, (m.get(p.category_id) || 0) + 1); return m }, [prods])
  const idxOn = useRef(false); if (dq || sgOn || s === 'search') idxOn.current = true
  const idx = useMemo(() => (idxOn.current ? makeIndex(prods, cats, shops) : null), [prods, cats, shops, idxOn.current]) // eslint-disable-line react-hooks/exhaustive-deps
  const hits = useMemo(() => (dq.trim() ? searchIn(idx, dq) : prods), [idx, prods, dq])
  const rvList = useMemo(() => (rv.length ? rv.map(id => byId.get(String(id))).filter(Boolean).slice(0, 12) : []), [rv, byId])
  const pop = useMemo(() => dq ? hits : hits.slice(0, 6), [dq, hits])
  const deals = useMemo(() => prods.filter(api.dealLive).sort((a, b) => new Date(a.deal_ends_at) - new Date(b.deal_ends_at)).slice(0, 12), [prods])
  const bestList = useMemo(() => best.map(id => byId.get(String(id))).filter(Boolean).slice(0, 10), [best, byId])
  const catList = useMemo(() => s === 'category' ? prods.filter(p => p.category_id === cur.c.id) : null, [s, prods, cur])
  const tags = useMemo(() => catList ? ['All', ...new Set(catList.map(p => p.tag).filter(Boolean))] : [], [catList])
  const shown = useMemo(() => {
    if (!catList) return []
    const k = dq.toLowerCase()
    return applyF(catList.filter(p => (chip === 'All' || p.tag === chip) && (!k || norm(p.name + ' ' + (p.brand || '')).includes(norm(k)))), cf).sort(SORTS[sort][1])
  }, [catList, chip, dq, sort, cf])
  const closeCsheet = useCallback(() => setCsheet(false), [])
  const wishList = useMemo(() => (s === 'wishlist' ? prods.filter(p => wishSet.has(p.id)) : NONE), [s, prods, wishSet])
  // My Orders: status and counts in one pass instead of three filters per render
  const ordView = useMemo(() => {
    if (s !== 'orders') return null
    const stOf = o => liveSt[o.order_no] ?? (o.status || 0), rows = orders.map(o => [o, stOf(o)]), act = rows.filter(r => r[1] < 3).length
    return { rows, n: { all: rows.length, active: act, done: rows.length - act } }
  }, [s, orders, liveSt])

  // never put more in the cart than is in stock (the server checks again when the order is placed)
  const room = id => { const live = byIdR.current.get(String(id)), st = stockOf(live); return st == null ? Infinity : st - cartR.current.reduce((a, i) => a + (i.id === id ? i.qty : 0), 0) }
  const addToCart = useCallback((p, v, n = 1) => {
    const left = room(p.id)
    if (left <= 0) return say(stockOf(byIdR.current.get(String(p.id))) === 0 ? 'Sorry, this item is sold out' : 'You already have all the stock in your cart', 2400)
    const k = Math.min(n, left), variant = v || p.variants?.[0], price = p.price * (variant?.mult || 1), key = p.id + (variant?.label || '')
    setCart(c => c.some(i => i.key === key) ? c.map(i => i.key === key ? { ...i, qty: i.qty + k } : i) : [...c, { key, id: p.id, name: p.name, emoji: p.emoji, image_url: p.image_url, variant: variant?.label, price, qty: k }])
    flyToCart(p.image_url); try { navigator.vibrate?.(12) } catch { /* no haptics */ }
    say(k < n ? `Only ${k} more in stock. Added ${k}.` : 'Added to cart', k < n ? 2600 : 1800)
  }, [say]) // eslint-disable-line react-hooks/exhaustive-deps
  const gp = useMemo(() => ({ add: addToCart, open, wish: wishSet, like }), [addToCart, open, wishSet, like])
  const qty = useCallback((key, d) => {
    if (d > 0) { const it = cartR.current.find(i => i.key === key); if (it && room(it.id) < d) return say('No more in stock', 2000) }
    setCart(c => c.map(i => i.key === key ? { ...i, qty: i.qty + d } : i).filter(i => i.qty > 0))
  }, [say]) // eslint-disable-line react-hooks/exhaustive-deps
  const reorder = o => { setCart(c => { const m = [...c]; (o.items || []).forEach(i => { const key = i.key || i.id + (i.variant || ''), k = m.findIndex(x => x.key === key); if (k >= 0) m[k] = { ...m[k], qty: m[k].qty + i.qty }; else m.push({ ...i, key }) }); return m }); say('Items added to your cart'); tab('cart') }
  const cartSugg = useMemo(() => s === 'cart' && cart.length ? suggest(prods, prods.filter(p => cart.some(i => i.id === p.id)), new Set(cart.map(i => i.id)), 8) : [], [s, cart, prods])

  const login = async e => {
    e?.preventDefault?.()
    if (busy) return
    const email = form.id.trim().toLowerCase(), name = form.name.trim(), phone = form.phone.replace(/[\s-]/g, '')
    if (mode === 'signup' && name.length < 2) return bad('Enter your full name')
    if (mode === 'signup' && !/^(?:\+?88)?01[3-9]\d{8}$/.test(phone)) return bad('Enter a valid phone number (01XXXXXXXXX)')
    if (mode !== 'reset' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return bad('Enter a valid email address')
    if (mode !== 'forgot' && form.pw.length < 6) return bad('Password must be at least 6 characters')
    if ((mode === 'signup' || mode === 'reset') && form.pw !== form.pw2) return bad('Passwords do not match')
    setBusy(true)
    try {
      if (mode === 'forgot') { await api.resetPassword(email); say('Reset link sent. Check your email, including spam.', 4500); setMode('login') }
      else if (mode === 'reset') {
        await api.updatePassword(form.pw); recov.current = false
        setForm(f => ({ ...f, pw: '', pw2: '' })); say('Password updated')
        const u = await api.restoreUser(); if (u) setUser(u); setMode('login'); tab(u ? 'home' : 'auth')
      }
      else if (mode === 'signup') {
        const r = await api.signUp({ name, phone, email, password: form.pw })
        if (r?.needsConfirm) { say('Account created. Check your email to confirm it, then log in.', 5000); setMode('login') }
        else { setUser(r); finishAuth() }
      }
      else { const u = await api.signIn(email, form.pw); setUser(u); finishAuth() }
    }
    catch (err) { bad(err?.message || 'Could not continue. Please try again.') }
    finally { setBusy(false) }
  }
  // ---- coupons: checked by the server against this cart, applied to the next Cash on Delivery order ----
  const applyCode = useCallback(async (code, quiet) => {
    const c = String(code || '').trim().toUpperCase()
    if (!c) return say('Enter a coupon code')
    if (!authed || !realUid(user)) { setPromo(c); writeLS('pk_promo', c); return quiet ? null : needLogin('checkout') }
    setCbusy(true)
    try { const r = await api.applyCoupon(c, cartR.current); setCoupon(r); setPromo(r.code); writeLS('pk_promo', r.code); if (!quiet) say(r.free_delivery ? `${r.code} applied · free delivery` : `${r.code} applied · −৳${Math.round(r.discount)}`, 2400) }
    catch (e) { setCoupon(null); if (!quiet) say(e?.message || 'Could not apply the coupon', 3200) }
    finally { setCbusy(false) }
  }, [authed, user, say, needLogin])
  const dropCoupon = useCallback(() => { setCoupon(null); setPromo(''); writeLS('pk_promo', ''); api.clearCoupon() }, [])
  // "use this voucher" from a product / shop page: kept until the cart
  const keepCode = useCallback(c => { setPromo(c); writeLS('pk_promo', c); say(`${c} saved · it is applied in your cart`, 2400) }, [say])
  // the cart changed: re-check the coupon quietly (it may no longer reach the minimum)
  const cartSig = cart.map(i => i.id + 'x' + i.qty + (i.variant || '')).join(',')
  useEffect(() => {
    if (!coupon || !cart.length) { if (coupon && !cart.length) dropCoupon(); return }
    const t = setTimeout(async () => { try { setCoupon(await api.applyCoupon(coupon.code, cartR.current)) } catch (e) { setCoupon(null); say(e?.message || 'Your coupon no longer applies', 3200) } }, 700)
    return () => clearTimeout(t)
  }, [cartSig]) // eslint-disable-line react-hooks/exhaustive-deps
  // entering the cart: try a saved code once, and show the coupons this cart can use
  const shopKey = [...new Set(cart.map(i => byIdR.current.get(String(i.id))?.shop_id).filter(Boolean))].sort().join(',')
  useEffect(() => {
    if (s !== 'cart' || !cart.length) return
    if (promo && !coupon && authed) applyCode(promo, true)
    let on = true; api.getPublicCoupons(shopKey ? shopKey.split(',') : []).then(r => on && setPubC(r || NONE))
    return () => { on = false }
  }, [s, shopKey, authed]) // eslint-disable-line react-hooks/exhaustive-deps
  const place = async () => {
    if (busy) return
    if (!authed) return needLogin('checkout')
    if (delivery.fee == null) return say(OUT_MSG, 3500)
    if (!delivery.pinned) { say(PIN_MSG, 3500); return go('address') }
    if (pay === 1) { // manual bKash: no order yet. It is created only when the customer submits the TrxID, so leaving keeps the cart
      if (!realUid(user) || !api.supabase) return say('Please sign in with your email to pay with bKash')
      return go('bkash')
    }
    if (pay === 2) { // Nagad: order is created + priced on the server, then we hand off to the gateway
      if (!realUid(user) || !api.supabase) return say('Please sign in with your email to pay with ' + PAYS[pay][0])
      setBusy(true)
      try { location.assign(await api.startOnlinePayment({ provider: 'nagad', items: cart, promo: '', address: { ...addr, lat: loc.lat, lng: loc.lng } })) }
      catch (e) { say(e?.message || 'Could not start payment. Please try again.'); setBusy(false) }
      return
    }
    setBusy(true)
    try {
      const o = await api.placeOrder({ user_id: user?.id, items: cart, total, delivery_fee: delivery.fee, address: { ...addr, lat: loc.lat, lng: loc.lng }, payment: PAYS[pay][0] })
      // placeOrder falls back to this device only (guests / signed-out). Also send it to the store so the admin sees every order.
      if (api.supabase && typeof o.id === 'string' && /^o\d{6,}$/.test(o.id)) {
        try { const { id: _local, ...row } = o; await api.supabase.from('orders').insert({ ...row, user_id: realUid(user) }) } catch { /* kept locally */ }
      }
      setCart([]); setCoupon(null); setPromo(''); writeLS('pk_promo', '')
      collapse(() => { depth.current = 1; try { history.pushState({ ms: 1 }, '') } catch { /* history blocked */ } setDir('fwd'); setStack([{ s: 'home' }, { s: 'done', order: o }]) })
    } catch (e) { const m = e?.message || 'Could not place order. Please try again.'; if (/coupon/i.test(m)) setCoupon(null); say(m, 4000) }
    finally { setBusy(false) }
  }
  // Coming back from bKash / Nagad: trust only the database (the order must really be marked paid by the server)
  useEffect(() => {
    const unstick = e => { if (e.persisted) setBusy(false) }
    window.addEventListener('pageshow', unstick)
    const qs = new URLSearchParams(location.search), res = qs.get('pay'), no = qs.get('order')
    if (res) {
      try { history.replaceState(null, '', location.pathname) } catch { /* ignore */ }
      if (no) (async () => {
        const o = await api.getOrderByNo(no)
        if (o?.payment_status === 'paid') {
          setCart([]); depth.current = 1
          try { history.pushState({ ms: 1 }, '') } catch { /* history blocked */ }
          setDir('fwd'); setStack([{ s: 'home' }, { s: 'done', order: o }])
        } else say(res === 'cancel' ? 'Payment cancelled. Your cart is still saved.' : 'Payment was not completed. You have not been charged. Please try again.')
      })()
      else say('Payment was not completed. Please try again.')
    }
    return () => window.removeEventListener('pageshow', unstick)
  }, [say])
  const adminDo = async (fn, ok) => { if (!admin) return; try { await fn(); await load(); say(ok) } catch (e) { say(e?.message || 'Something went wrong. Try again.') } }

  let body
  if (s === 'splash') return <div className="app"><div className="splash"><div className="lgcard"><div className="lk col" aria-label="Pinkish"><img className="bmk" src="/logo-mark.webp?v=2" width="84" height="84" alt="" decoding="async" fetchpriority="high" /><span className="wm"><span className="bp">Pink</span><span className="bi">ish</span></span></div></div><div>Privacy. Confidence. Comfort. Wellness.</div><div className="sbar"><i /></div></div></div>

  if (s === 'ob') body = <Welcome prods={prods} cats={cats} onStart={() => tab('home')} onLogin={() => { tab('home'); goLogin() }} />

  if (s === 'auth') body = <div className="auth">
    <div className="blobs" aria-hidden="true"><i /><i /><i /></div>
    <header className="abar"><span className="am"><img src="/logo-mark.webp?v=2" width="34" height="34" alt="" decoding="async" draggable="false" /></span><div className="an"><h1><span className="bn"><span className="bp">Pink</span><span className="bi">ish</span></span></h1><small>Privacy. Confidence. Comfort. Wellness.</small></div><span className="ap"><Icon n="lock" />Private</span><button type="button" className="a-x" aria-label="Close" onClick={closeAuth}>✕</button></header>
    <div className="auth-in">
      <form className={'auth-card glass' + (shake ? ' shake' : '')} onSubmit={login} noValidate>
        {(mode === 'login' || mode === 'signup') && <div className="ah"><h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2><p>{mode === 'login' ? 'Log in to continue shopping privately.' : 'Join Pinkish for discreet delivery across Bangladesh.'}</p></div>}
        {(mode === 'login' || mode === 'signup') && <div className="tabs" data-i={mode === 'login' ? 0 : 1}>{['login', 'signup'].map(m => <button type="button" key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{m === 'login' ? 'Login' : 'Sign Up'}</button>)}</div>}
        {mode === 'forgot' && <p className="msg"><b>Reset your password</b><br />Enter your account email and we will send you a reset link.</p>}
        {mode === 'reset' && <p className="msg"><b>Set a new password</b><br />Choose a new password for your account.</p>}
        {mode === 'signup' && <label className="fld"><span className="fi"><Icon n="user" /></span><input placeholder="Full name" aria-label="Full name" autoComplete="name" enterKeyHint="next" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></label>}
        {mode === 'signup' && <label className="fld"><span className="fi"><Icon n="phone" /></span><input placeholder="Phone number (01XXXXXXXXX)" aria-label="Phone number" type="tel" inputMode="tel" autoComplete="tel" enterKeyHint="next" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></label>}
        {mode !== 'reset' && <label className="fld"><span className="fi"><Icon n="mail" /></span><input placeholder="Email address" aria-label="Email address" type="email" autoComplete="username" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck="false" enterKeyHint={mode === 'forgot' ? 'go' : 'next'} value={form.id} onChange={e => setForm(f => ({ ...f, id: e.target.value }))} /></label>}
        {mode !== 'forgot' && <label className="fld"><span className="fi"><Icon n="lock" /></span><input placeholder={mode === 'reset' ? 'New password' : 'Password'} aria-label="Password" type={showPw ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} enterKeyHint={mode === 'login' ? 'go' : 'next'} value={form.pw} onChange={e => setForm(f => ({ ...f, pw: e.target.value }))} />
          <button type="button" className="eye" aria-label={showPw ? 'Hide password' : 'Show password'} onClick={() => setShowPw(v => !v)}><Icon n={showPw ? 'eyeoff' : 'eye'} /></button></label>}
        {(mode === 'signup' || mode === 'reset') && <label className="fld"><span className="fi"><Icon n="lock" /></span><input placeholder="Confirm password" aria-label="Confirm password" type={showPw ? 'text' : 'password'} autoComplete="new-password" enterKeyHint="go" value={form.pw2} onChange={e => setForm(f => ({ ...f, pw2: e.target.value }))} /></label>}
        {mode === 'login' && <div className="forgot"><button type="button" onClick={() => setMode('forgot')}>Forgot password?</button></div>}
        <button className="btn" type="submit" disabled={busy}>{busy ? <i className="spin" /> : { login: 'Login', signup: 'Create Account', forgot: 'Send Reset Link', reset: 'Update Password' }[mode]}</button>
        {(mode === 'login' || mode === 'signup') && <>
          <div className="or"><span>or continue with</span></div>
          <div className="socials" style={{ gridTemplateColumns: '1fr' }}><button type="button" className="btn o social" onClick={() => { try { sessionStorage.setItem('pk_after', pending.current || '') } catch { /* storage unavailable */ } api.signInWithGoogle().catch(e => bad(e?.message || 'Google login failed')) }}><GoogleG />Google</button></div>
        </>}
      </form>
      {mode !== 'reset' && <p className="sw">{mode === 'forgot' ? <>Remembered it? <button type="button" onClick={() => setMode('login')}>Back to login</button></> : <>{mode === 'login' ? 'New here?' : 'Already have an account?'} <button type="button" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>{mode === 'login' ? 'Create an account' : 'Login'}</button></>}</p>}
      <p className="trust"><Icon n="lock" />Private by design · Discreet delivery</p>
    </div></div>

  if (s === 'home') body = <div className="scr hm">
    <div className="hstick">
      <div className="topbar"><LocChip loc={loc} onClick={() => go('address')} /><div className="tbr"><NotifBell n={unread} authed={!!user?.id && user.id !== 'local'} onOpen={() => user?.id && user.id !== 'local' ? go('notifications') : needLogin('notifications')} /><button className="ib" aria-label="Open cart" onClick={() => tab('cart')}><Icon n="bag" />{count > 0 && <em className="cb" key={count}>{count}</em>}</button></div></div>
      <form className="search" role="search" onSubmit={e => { e.preventDefault(); const t = q.trim(); if (t) addRecent(t); e.currentTarget.querySelector('input')?.blur(); go('search', { q: t }) }}><Icon n="search" /><input type="search" enterKeyHint="search" placeholder="What are you looking for?" aria-label="Search products" value={q} onChange={e => setQ(e.target.value)} onFocus={() => setSgOn(true)} onBlur={() => setTimeout(() => setSgOn(false), 120)} />{q && <button type="button" className="sx" aria-label="Clear search" onMouseDown={e => e.preventDefault()} onClick={() => setQ('')}>✕</button>}<button type="button" className="sf" aria-label="Search with filters" onMouseDown={e => e.preventDefault()} onClick={() => go('search', { q: q.trim() })}><Icon n="sliders" /></button></form>
      {sgOn && <Suggest q={q} idx={idx} cats={cats} shops={shops} recent={recent} onClearRecent={clearRecent} onPick={({ k, v }) => {
        setSgOn(false); document.activeElement?.blur?.()
        if (k === 'q') { addRecent(v); go('search', { q: v }) }
        else if (k === 'p') { addRecent(q); open(v) }
        else if (k === 'c') go('category', { c: v })
        else if (k === 'b') go('search', { q: '', f: { ...F0, brands: [v] } })
        else if (k === 's') go('shop', { shop: v })
      }} />}
    </div>
    <Banner shop={tab} go={go} open={open} cats={cats} prods={prods} />
    <div className="sec">Categories <a onClick={() => tab('categories')}>See all</a></div>
    <div className="catrow">{cats.map((c, i) => <button key={c.id} style={{ '--i': i }} className="cc rise" onClick={() => go('category', { c })}><span><CatIcon c={c} /></span><b>{c.name}</b></button>)}</div>
    {!dq && deals.length > 0 && <Rail title={<RailT k="bolt">Flash deals <Countdown end={deals[0].deal_ends_at} /></RailT>} list={deals} {...gp} />}
    {!dq && bestList.length > 0 && <Rail title={<RailT k="hot">Best sellers</RailT>} list={bestList} {...gp} />}
    {!dq && rvList.length > 0 && <Rail title="Recently viewed" action={<button type="button" className="rv-x" onClick={() => setRv([])}>Clear</button>} list={rvList} {...gp} />}
    <div className="sec">{dq ? `Results (${hits.length})` : 'Popular Products'} {dq ? <a onClick={() => go('search', { q: dq.trim() })}>Filter &amp; sort</a> : <a onClick={() => tab('categories')}>See All</a>}</div><Grid list={pop} loading={loading} {...gp} /></div>

  if (s === 'categories') body = <><Hdr title="Categories" back={back} /><div className="scr">
    <div className="cats">{cats.map((c, i) => <button key={c.id} style={{ '--i': i }} className="cat rise" onClick={() => go('category', { c })}><span><CatIcon c={c} /></span>{c.name}<small style={{ color: '#8b8197', fontWeight: 400 }}>{catCount.get(c.id) || 0} items</small></button>)}
      {admin && <button className="cat" style={{ background: '#ffffff99', border: '2px dashed #d9c8ea' }} onClick={() => go('manage')}><span>＋</span>Add Category</button>}</div></div></>

  if (s === 'category') body = <><Hdr title={cur.c.name} back={() => { setChip('All'); back() }} /><div className="scr">
    <div className="tools"><div className="search"><Icon n="search" /><input type="search" placeholder={`Search ${cur.c.name}...`} aria-label={`Search ${cur.c.name}`} value={q} onChange={e => setQ(e.target.value)} /></div></div>
    <div className="tools ftools"><FBtn n={fCount(cf)} onClick={() => setCsheet(true)} /><select className="inp sort" aria-label="Sort" value={sort} onChange={e => setSort(e.target.value)}>{Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</select></div>
    {tags.length > 1 && <div className="chips">{tags.map(t => <button key={t} className={chip === t ? 'on' : ''} onClick={() => setChip(t)}>{t}</button>)}</div>}
    <FChips f={cf} set={setCf} shops={shops} />{(fCount(cf) > 0 || dq) && !loading && <p className="rcount"><b>{shown.length}</b> of {catList.length} products</p>}
    {!loading && catList.length > 0 && !shown.length ? <div className="emp"><h3>No matches</h3><p>Try removing a filter.</p><button className="btn" onClick={() => { setCf(F0); setChip('All'); setQ('') }}>Clear filters</button></div> : <Grid list={shown} loading={loading} {...gp} />}
    {csheet && <FilterSheet base={catList} shops={shops} f={cf} onApply={v => { setCf(v); setCsheet(false) }} onClose={closeCsheet} />}</div></>

  if (s === 'search') body = <SearchScreen key={'srch' + stack.length} q0={cur.q || ''} f0={cur.f || F0} {...{ idx, prods, cats, shops, loading, back, gp, go, recent, addRecent, clearRecent }} seen={rvList} />

  if (s === 'notifications') body = <Notifications list={notifs} back={back} onOpen={openNote} onReadAll={readAll} />
  if (s === 'shop') body = <ShopScreen shop={shops[cur.shop?.id] || cur.shop} prods={prods} loading={loading} back={back} gp={gp} follow={{ on: following, toggle: toggleFollow }} keepCode={keepCode} />

  if (s === 'product') body = <ProductScreen key={cur.p.id} {...{ p: byId.get(String(cur.p.id)) || cur.p, back, addToCart, count, go, like, open, user, say, login: needLogin }} shop={cur.p.shop_id ? (shops[cur.p.shop_id] || { missing: true }) : null} prods={prods} wish={wishSet} liked={wishSet.has(cur.p.id)} seen={rvList} keepCode={keepCode} />

  if (s === 'cart') body = <><Hdr title={`My Cart (${count})`} back={back} right={cart.length > 0 && <button className="ib" aria-label="Clear cart" onClick={() => { setCart([]); dropCoupon() }}>🗑️</button>} /><div className="scr narrow">
    {!cart.length ? <div className="emp"><div className="emp-i"><CartArt /></div><h3>Your cart is empty</h3><p>Browse our categories and add something you like.</p><button className="btn" onClick={() => tab('categories')}>Start shopping</button></div> : <><Steps n={0} />
      <div className="frb"><span>🚚</span><div><b>Discreet delivery across Bangladesh</b><small>৳{+dcfg.inner_fee} near {HUB.name} · ৳{+dcfg.city_fee} Chattogram city · ৳{+dcfg.outside_fee} rest of Bangladesh{+dcfg.free_over > 0 ? ` · free over ৳${+dcfg.free_over}` : ''}</small></div></div>
      {delivery.pinned && +dcfg.free_over > 0 && (dcfg.free_zones || []).includes(delivery.zone) && <div className={'fdb' + (delivery.free ? ' on' : '')} role="status"><div><b>{delivery.free ? '🎉 Free delivery unlocked' : `Add ৳${delivery.freeLeft} more for free delivery`}</b><small>Cash on Delivery orders over ৳{+dcfg.free_over}</small></div><i><em style={{ width: Math.min(100, (subtotal - disc) / dcfg.free_over * 100) + '%' }} /></i></div>}
      {cart.map(i => <CartItem key={i.key} i={i} qty={qty} />)}
      {coupon ? <div className="cpn on"><span>🎟️</span><div><b>{coupon.code} applied</b><small>{coupon.free_delivery ? 'Free delivery' : `−৳${Math.round(coupon.discount)}`}{coupon.shop_id ? ' · on ' + shopName(coupon.shop_id, shops) + ' items' : ''} · Cash on Delivery</small></div><button type="button" onClick={dropCoupon}>Remove</button></div>
        : <form className="promo" onSubmit={e => { e.preventDefault(); applyCode(promo) }}><input placeholder="Coupon code" aria-label="Coupon code" autoCapitalize="characters" autoComplete="off" maxLength={20} value={promo} onChange={e => setPromo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} /><button type="submit" disabled={cbusy}>{cbusy ? '…' : 'Apply'}</button></form>}
      {!coupon && pubC.length > 0 && <div className="vch" role="list" aria-label="Coupons you can use">{pubC.slice(0, 6).map(c => <button type="button" role="listitem" key={c.code} className="vc" disabled={cbusy} onClick={() => applyCode(c.code)}><b>{vText(c)}</b><small>{c.shop_id ? shopName(c.shop_id, shops) : 'All of Pinkish'}{c.min_order > 0 ? ` · ৳${+c.min_order}+` : ''}{c.first_order_only ? ' · first order' : ''}</small><em>{c.code}</em></button>)}</div>}
      <div className="sum"><div><span>Subtotal ({count} item{count === 1 ? '' : 's'})</span><span><Money v={subtotal} /></span></div>{disc > 0 && <div><span>Coupon {coupon?.code}</span><span style={{ color: '#3ab36b' }}>−<Money v={disc} /></span></div>}<div><span>Delivery{delivery.pinned && <small className="dl-km"> · {ZONE[delivery.zone]?.name}</small>}</span><span className={delivery.fee == null ? 'dl-bad' : 'dl-ok'}>{delivery.free && delivery.base > 0 && <s className="dl-was">৳{delivery.base}</s>}{feeTxt(delivery)}</span></div><div className="t"><span>Total</span><span><Money v={total} /></span></div></div>
      <Rail title="Add more to your order" list={cartSugg} {...gp} /></>}</div>
    {cart.length > 0 && <div className="buybar"><div><small>Total · {count} item{count === 1 ? '' : 's'}</small><b><Money v={total} /></b></div><button className="btn buy" onClick={() => delivery.fee == null ? say(OUT_MSG, 3500) : !authed ? needLogin('checkout') : !delivery.pinned ? (say(PIN_MSG, 3000), go('address')) : go('checkout')}>Checkout →</button></div>}</>

  if (s === 'checkout') body = <><Hdr title="Delivery Details" back={back} /><div className="scr narrow"><Steps n={1} />
    {[['name', 'Full Name', 'name'], ['phone', 'Phone Number (+8801XXXXXXXXX)', 'tel'], ['address', 'House, Road, Area, City / District', 'street-address'], ['note', 'Delivery Instructions (Optional)', 'off']].map(([k, l, ac]) => <input key={k} className="inp" placeholder={l} autoComplete={ac} inputMode={k === 'phone' ? 'tel' : undefined} value={addr[k]} onChange={e => setAddr(a => ({ ...a, [k]: e.target.value }))} />)}
    <DeliveryCard d={delivery} />
    {!delivery.pinned ? <button type="button" className="btn o" onClick={() => go('address')}>📍 Pin your delivery location</button> : <button type="button" className="lk-chg" onClick={() => go('address')}>Change delivery location</button>}
    <div className="note">🔒 Your order will be delivered in discreet packaging.</div>
    <button className="btn" onClick={() => delivery.fee == null ? say(OUT_MSG, 3500) : !delivery.pinned ? (say(PIN_MSG, 3000), go('address')) : !addr.name.trim() ? say('Enter your full name') : addr.phone.replace(/\D/g, '').length < 10 ? say('Enter a valid phone number (at least 10 digits)') : !addr.address.trim() ? say('Enter your delivery address') : go('payment')}>Continue to Payment</button></div></>

  if (s === 'payment') body = <><Hdr title="Payment Method" back={back} /><div className="scr narrow"><Steps n={2} /><div className="mini"><span>{count} item{count === 1 ? '' : 's'} · {delivery.fee != null ? `Delivery ${delivery.free ? 'free' : '৳' + delivery.fee} · ${ZONE[delivery.zone]?.name || ''}` : 'Outside delivery area'}</span><b><Money v={total} /></b></div>
    {PAYS.map(([n, d], k) => <button key={n} className={'pay' + (pay === k ? ' on' : '')} onClick={() => setPay(k)}><PayLogo k={k} /><div><b>{n}</b><small>{d}</small></div><i /></button>)}
    {delivery.fee == null
      ? <div className="note" style={{ background: '#fff0f3cc', color: '#c62d4a' }}>⚠️ {OUT_MSG} Please choose a closer address.</div>
      : <div className="note" style={{ background: '#eaf8efcc', color: '#2a8a52' }}>{delivery.mode === 'courier' ? '📦' : '🛵'} {delivery.label}</div>}
    {!cod && (coupon || deliveryFor(loc, { subtotal: subtotal - (+coupon?.discount || 0), cod: true, freeCoupon: !!coupon?.free_delivery }).free) && <div className="note" style={{ background: '#fff4e5cc', color: '#9a5a00' }}>🎟️ Coupons and free delivery apply to Cash on Delivery orders. Choose Cash on Delivery to keep them.</div>}
    <div className="note" style={{ background: '#eaf8efcc', color: '#2a8a52' }}>🛡️ SSL Secured Payment — your information is always protected.</div>
    <button className="btn" disabled={busy || delivery.fee == null} onClick={place}>{delivery.fee == null ? '📦 Outside delivery area' : busy ? <i className="spin" /> : <>{pay === 1 ? 'Continue to bKash' : pay === 2 ? 'Pay Now' : 'Place Order'} · <Money v={total} /></>}</button></div></>

  if (s === 'bkash') body = <BkashPay total={total} cart={cart} promo="" addr={{ ...addr, lat: loc.lat, lng: loc.lng }} back={back} say={say} onDone={o => {
    setCart([]); say('Payment submitted. We are verifying it.', 3000)
    collapse(() => { depth.current = 1; try { history.pushState({ ms: 1 }, '') } catch { /* history blocked */ } setDir('fwd'); setStack([{ s: 'home' }, { s: 'done', order: o }]) })
  }} />

  if (s === 'done') body = <div className="scr ok narrow"><div className="tick">✓</div><h2 style={{ margin: '24px 0 4px' }}>Order Placed Successfully!</h2><div className="pill">Order #{cur.order.order_no}</div>
    <p style={{ color: '#8b8197', marginBottom: 30 }}>Thank you for choosing Pinkish.<br />{cur.order.payment_status === 'verifying' ? 'We are verifying your bKash payment. We will confirm your order shortly.' : 'Your order will be delivered soon.'}</p>
    <button className="btn" onClick={() => go('tracking', { order: cur.order })}>Track Order</button><button className="btn o" style={{ marginTop: 12 }} onClick={() => tab('home')}>Continue Shopping</button></div>

  if (s === 'orders') { const { rows, n: on } = ordView, list = oflt === 'all' ? rows : rows.filter(r => (oflt === 'active') === (r[1] < 3))
    body = <div className="scr narrow"><h2 className="ptl">My Orders</h2>
      {orders.length > 0 && <div className="chips ochips">{[['all', 'All', on.all], ['active', 'Active', on.active], ['done', 'Delivered', on.done]].map(([k, l, c]) => <button key={k} className={oflt === k ? 'on' : ''} onClick={() => setOflt(k)}>{l}<span className="cnt">{c}</span></button>)}</div>}
      {!orders.length ? <div className="emp"><div className="emp-i"><OrdersArt /></div><h3>No orders yet</h3><p>Your orders and their live status will show up here.</p><button className="btn" onClick={() => tab('home')}>Start shopping</button></div>
        : !list.length ? <p className="empty">No {oflt === 'active' ? 'active' : 'delivered'} orders.</p> : list.map(([o, st]) => <OrderCard key={o.id} o={o} st={st} ret={retBy.get(String(o.id))} open={openTrack} />)}</div> }

  if (s === 'tracking') { const o = orders.find(x => x.id === cur.order.id) || cur.order, st = liveSt[o.order_no] ?? (o.status || 0), t = new Date(o.created_at), its = o.items || [], ad = o.address || {}, sub = its.reduce((x, i) => x + i.price * i.qty, 0), df = o.delivery_fee == null ? null : +o.delivery_fee, dc = Math.max(0, sub + (df || 0) - o.total), qn = its.reduce((x, i) => x + (i.qty || 1), 0)
    const pst = o.payment === 'bKash' ? (o.payment_status === 'paid' ? ['Paid ✓', 'ok'] : o.payment_status === 'verifying' ? ['Verifying…', 'wait'] : ['Not paid yet', 'no']) : null
    body = <><Hdr title="Order Tracking" back={back} /><div className="scr narrow trkscr">
      <div className="tk-meta"><div><small>Order</small><b>#{o.order_no}</b></div><div><small>Placed</small><b>{t.toLocaleDateString([], { dateStyle: 'medium' })}</b><em>{t.toLocaleTimeString([], { timeStyle: 'short' })}</em></div><div><small>Total</small><b className="g">{taka(o.total)}</b></div></div>
      <div className={'trk' + (st >= 3 ? ' fin' : '')}><div className="trk-top"><span className="trk-art"><StatusArt st={st} /></span><div className="trk-tx"><b>{['Order received!', 'We are preparing your order', 'Your order is on the way!', 'Delivered. Thank you!'][st]}</b><br />{modeOf(o) === 'courier' ? ['We will confirm it shortly.', 'We are packing it for our courier partner.', `${o.courier_name || 'Our courier partner'} is bringing it to you.`, 'Hope you love it.'][st] : ['We will confirm it shortly.', 'A Pinkish rider will pick it up soon.', 'Your Pinkish rider is on the way. Watch them on the map.', 'Hope you love it.'][st]}</div></div><div className="trk-rail"><div className="trk-line"><i className="trk-fill" style={{ width: (Math.min(st, 3) / 3 * 100) + '%' }} /></div>{STEPS.map((l, i) => <span key={l} className={'trk-n' + (i <= st ? ' on' : '') + (i === st && st < 3 ? ' cur' : '')} style={{ left: (i / 3 * 100) + '%' }} />)}</div><div className="trk-lb">{STEPS.map((l, i) => <small key={l} className={i <= st ? 'on' : ''}>{l}</small>)}</div></div>
      <LiveTrack o={o} st={st} />
      {modeOf(o) !== 'courier' && dcfg.require_code && <DeliveryCode o={o} st={st} />}
      {its.length > 0 && <section className="tk-card"><header><h5>Items</h5><span className="tk-pill">{qn} item{qn === 1 ? '' : 's'}</span></header>{its.map((i, k) => <div className="ti" key={i.key || k}><Pic p={i} /><div><b>{i.name}</b><small>{i.variant && i.variant !== 'Standard' ? i.variant + ' · ' : ''}{taka(i.price)} × {i.qty}</small></div><b>{taka(i.price * i.qty)}</b></div>)}</section>}
      {((ad.address || ad.name) || o.payment) && <section className="tk-card"><header><h5>Delivery &amp; payment</h5></header>
        {(ad.address || ad.name) && <div className="tk-row"><span className="tk-ic"><Icon n="pin" /></span><div><small>Delivering to</small><b>{ad.name}{ad.phone && ' · ' + ad.phone}</b>{ad.address && <p>{ad.address}</p>}{ad.note && <em>Note: {ad.note}</em>}</div></div>}
        {o.payment && <div className="tk-row"><span className="tk-ic"><Icon n="card" /></span><div><small>Payment method</small><b>{o.payment}</b></div>{pst && <span className={'tk-chip ' + pst[1]}>{pst[0]}</span>}</div>}</section>}
      <section className="tk-card tk-bill"><header><h5>Bill summary</h5></header>
        <div className="r"><span>Subtotal</span><span>{taka(sub)}</span></div>{dc > 0.5 && <div className="r g"><span>Discount</span><span>−{taka(dc)}</span></div>}{df == null ? <div className="r g"><span>Delivery</span><span>Free</span></div> : <div className="r"><span>Delivery{o.delivery_km != null && ` · ${(+o.delivery_km).toFixed(1)} km`}</span><span>{taka(df)}</span></div>}
        <div className="tot"><span>Total</span><span>{taka(o.total)}</span></div></section>
      <ReturnCard o={o} st={st} ret={retBy.get(String(o.id))} onStart={() => (authed ? go('return', { order: { ...o, status: st } }) : needLogin('login'))} />
      {its.length > 0 && <button className="btn o" style={{ marginTop: 14 }} onClick={() => reorder(o)}>Order again</button>}</div></> }

  if (s === 'return') body = <ReturnScreen o={cur.order} user={user} back={back} say={say} onDone={r => { if (r) setRets(a => [r, ...a]); say('Request sent. We will update you here and in your notifications.', 3200); back() }} />

  if (s === 'profile') body = <Profile {...{ user, admin, count, tab, go, say }} wishCount={wish.length} place={loc.area || loc.city} hasAddr={!!(loc.area || loc.line)} onLogout={logout} authed={authed} onLogin={goLogin} />

  if (s === 'address') body = <AddressScreen key="addr" loc={loc} back={back} onSave={saveLoc} />

  if (s === 'wishlist') body = <><Hdr title="Wishlist" back={back} /><div className="scr">{wishList.length > 0 && <div className="wl-al"><span>🔔</span><p>{realUid(user) ? 'We will notify you when a saved item is back in stock or its price drops.' : 'Log in and we will notify you when a saved item is back in stock or its price drops.'}</p></div>}<Grid list={wishList} loading={loading} {...gp} /></div></>

  if (s === 'manage') body = !admin ? <><Hdr title="Store" back={back} /><div className="scr narrow"><div className="note">🔒 Only store admins can manage categories and products.</div></div></> : <><Hdr title="Manage Store" back={back} /><div className="scr narrow">
    <div className="sec">Add Category</div>
    <div className="row" style={{ gap: 8 }}><input className="inp" style={{ width: 70, textAlign: 'center', marginBottom: 0 }} value={nc.icon} onChange={e => setNc(c => ({ ...c, icon: e.target.value }))} /><input className="inp" style={{ marginBottom: 0 }} placeholder="e.g. Lubricants, Pregnancy Tests" value={nc.name} onChange={e => setNc(c => ({ ...c, name: e.target.value }))} /></div>
    <button className="btn" style={{ margin: '12px 0 20px' }} onClick={() => { if (!nc.name.trim()) return say('Enter category name'); adminDo(async () => { await api.addCategory(nc.name.trim(), nc.icon || '🛍️'); setNc({ name: '', icon: '🛍️' }) }, 'Category added') }}>Add Category</button>
    {cats.map(c => <div key={c.id} className="menu"><span><CatIcon c={c} /></span><span>{c.name}</span><span role="button" aria-label={`Delete ${c.name}`} onClick={() => adminDo(() => api.deleteCategory(c.id), 'Category deleted')}>🗑️</span></div>)}
    <div className="sec" style={{ marginTop: 22 }}>Add Product</div>
    <input className="inp" placeholder="Product name" value={np.name} onChange={e => setNp(p => ({ ...p, name: e.target.value }))} />
    <input className="inp" type="number" inputMode="decimal" placeholder="Price (৳)" value={np.price} onChange={e => setNp(p => ({ ...p, price: e.target.value }))} />
    <input className="inp" placeholder="Image URL (optional)" value={np.image_url} onChange={e => setNp(p => ({ ...p, image_url: e.target.value }))} />
    <select className="inp" value={np.category_id} onChange={e => setNp(p => ({ ...p, category_id: e.target.value }))}><option value="">Select category</option>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
    <button className="btn" onClick={() => { if (!np.name || !np.price || !np.category_id) return say('Fill all fields'); adminDo(async () => { await api.addProduct({ ...np, price: +np.price, image_url: np.image_url || null }); setNp({ name: '', price: '', category_id: '', image_url: '' }) }, 'Product added') }}>Add Product</button></div></>

  return <div className="app">{!['ob', 'auth'].includes(s) && <Nav {...{ s, count, tab }} />}<main className="main"><div key={s + stack.length} className={'pg ' + dir}>{body}</div></main><Toast api={toastR} />{gate && <LoginSheet why={gate} onLogin={() => openAuth('login')} onSignup={() => openAuth('signup')} onGoogle={googleGate} onClose={() => setGate(null)} />}</div>
}

const FEAT_CSS = `
/* ===== stock badges ===== */
.pwrap{position:relative}
.stk{position:absolute;left:8px;bottom:8px;z-index:2;display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:700;line-height:1.2;color:#b45309;background:#fff8ebf2;box-shadow:0 4px 10px #b4530926;pointer-events:none}
.stk::before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor}
.stk.so{color:#fff;background:#2a1a3ad9;box-shadow:none}.stk.so::before{display:none}
.card.so .pic img,.card.so .pic{filter:grayscale(.55);opacity:.72}
.card.so .add{background:#d8cde3;box-shadow:none;animation:none}
.stl{display:flex;align-items:center;gap:8px;padding:9px 14px;border-radius:14px;background:#fff6e6;color:#a15c00;font-size:13px;font-weight:700}
.stl i{width:8px;height:8px;border-radius:50%;background:currentColor;flex:none;animation:ocDot 1.6s ease-in-out infinite}
.stl.so{background:#f3edf7;color:var(--mute)}.stl.so i{animation:none}
.btn.buy:disabled{background:#cfc4da;box-shadow:none;cursor:not-allowed;opacity:1}
/* ===== share + fulfilled by Pinkish ===== */
.pacts{display:flex;gap:8px;flex:none}
.ib.shr{width:46px;height:46px;background:#fff;color:var(--p1);box-shadow:0 6px 18px #4a166822}
.ffb{display:flex;gap:12px;align-items:flex-start;margin:4px 0 14px;padding:12px 14px;border-radius:18px;background:linear-gradient(145deg,#f3ecff,#fdeef5);border:1px solid #ead9f5}
.ffb-i{flex:none;width:38px;height:38px;border-radius:12px;display:grid;place-items:center;color:#fff;background:var(--grad);box-shadow:0 8px 16px -8px #8e2a8ccc,inset 0 1px 0 #ffffff66}
.ffb b{display:block;font-size:13.5px;line-height:1.3;color:var(--p1)}.ffb small{display:block;margin-top:2px;font-size:12px;line-height:1.4;color:var(--mute)}
.shp+.ffb{margin-top:-4px}
/* ===== search suggestions ===== */
.hstick .search,.sbox .search{position:relative}
.sbox{position:relative;z-index:8}
.sg{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:30;max-height:min(62dvh,460px);overflow-y:auto;overscroll-behavior:contain;padding:6px;border-radius:22px;background:#fff;border:1px solid var(--edge);box-shadow:0 22px 44px -12px #4a166855;animation:up .2s var(--ease) both}
.hstick .sg{left:var(--hp-l);right:var(--hp-r);top:calc(100% - 4px)}
.sg button{all:unset;box-sizing:border-box;cursor:pointer;-webkit-tap-highlight-color:transparent}
.sg-p{width:100%;display:flex;align-items:center;gap:12px;padding:8px 10px;border-radius:16px}
.sg-p .pic{width:44px;height:44px;flex:none;border-radius:12px;font-size:22px;margin:0}
.sg-p span{flex:1;min-width:0;display:grid}.sg-p b{font-size:14px;font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sg-p small{font-size:11.5px;color:var(--mute);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sg-p em{font-style:normal;font-weight:800;color:var(--p1);font-size:13.5px;flex:none}
.sg mark{background:none;color:var(--p3);font-weight:800}
.sg-t{display:flex;flex-wrap:wrap;gap:6px;padding:8px 6px;border-top:1px solid var(--line);margin-top:4px}
.sg-t button{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;background:#f6effb;font-size:13px;font-weight:600;color:var(--ink)}
.sg-t i{font-style:normal;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--mute)}
.sg-all{width:100%;display:flex!important;align-items:center;justify-content:center;gap:4px;margin-top:4px;padding:12px;border-radius:16px;background:linear-gradient(135deg,#f6e9fb,#fde7f0);color:var(--p1);font-weight:700;font-size:13.5px}
.sg-all .ico{width:16px;height:16px}
.sg-h{display:flex;justify-content:space-between;align-items:center;padding:8px 10px 4px;font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--mute)}
.sg-h button{color:var(--p2);text-transform:none;letter-spacing:0;font-size:12.5px}
.sg-rc{display:flex;flex-wrap:wrap;gap:6px;padding:6px}
.sg-rc button{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:999px;background:#f6effb;font-size:13px;color:var(--ink)}.sg-rc .ico{width:14px;height:14px;color:var(--mute)}
.sg-no{margin:0;padding:14px;color:var(--mute);font-size:13.5px;text-align:center}
@media(hover:hover){.sg-p:hover,.sg-t button:hover,.sg-rc button:hover{background:#faf3fd}}
.search input[type=search]::-webkit-search-cancel-button{display:none}
.sx{flex:none;width:30px;height:30px;border-radius:50%;background:#f6effb;color:var(--mute);font-size:12px;display:grid;place-items:center}
/* ===== filters ===== */
.ftools{gap:8px;margin:2px 0 10px}.ftools .sort{flex:1;min-width:0;max-width:220px;margin-left:auto}
.fbtn{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;border-radius:999px;background:#fff;border:1.5px solid var(--line);font-weight:700;font-size:14px;color:var(--p1);box-shadow:0 6px 16px #4a166814;flex:none;transition:transform .3s var(--spring)}
.fbtn:active{transform:scale(.95)}.fbtn .ico{width:18px;height:18px}
.fbtn.on{background:var(--grad);color:#fff;border-color:transparent}
.fbtn em{font-style:normal;min-width:20px;height:20px;padding:0 6px;border-radius:99px;background:#fff;color:var(--p3);font-size:11.5px;display:grid;place-items:center}
.fchips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding:2px 0 10px}.fchips::-webkit-scrollbar{display:none}
.fchips button{flex:none;display:inline-flex;align-items:center;gap:6px;padding:7px 10px 7px 13px;border-radius:999px;background:#f3e6fa;color:var(--p1);font-size:12.5px;font-weight:700}
.fchips i{font-style:normal;font-size:10px;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;background:#fff;color:var(--p3)}
.fchips .clr{background:none;color:var(--mute);font-weight:600;text-decoration:underline;text-underline-offset:3px}
.rcount{margin:0 2px 12px;font-size:13px;color:var(--mute)}.rcount b{color:var(--ink)}
.srch .search{margin:4px 0 10px}
.gt.fsh{justify-items:stretch;text-align:left;gap:14px;max-width:560px}
.fsh h3{text-align:center;margin-top:4px}
.fsh section{display:grid;gap:10px}
.fsh h5{margin:0;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}
.fsh .chips.wrap{padding:0}
.fs-pr{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px}
.fs-pr input{min-width:0;min-height:48px;padding:0 14px;border-radius:16px;border:1.5px solid var(--line);background:#fff;font-size:16px;outline:0}
.fs-pr input:focus{border-color:var(--p2);box-shadow:0 0 0 4px #8e2a8c1f}
.fs-pr span{color:var(--mute);font-size:13px}
.fs-tg{gap:8px!important}
.fs-sw{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:12px 14px;border-radius:18px;background:#faf5fd;border:1px solid var(--edge);text-align:left}
.fs-sw span{display:grid;gap:1px}.fs-sw b{font-size:14.5px;color:var(--ink)}.fs-sw small{font-size:12px;color:var(--mute)}
.fs-sw i{position:relative;flex:none;width:48px;height:28px;border-radius:99px;background:#ddd2e8;transition:background .25s}
.fs-sw i::after{content:'';position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 2px 6px #4a166833;transition:transform .3s var(--spring)}
.fs-sw.on i{background:var(--grad)}.fs-sw.on i::after{transform:translateX(20px)}
.fs-ft{position:sticky;bottom:calc(-18px - env(safe-area-inset-bottom));display:grid;grid-template-columns:auto 1fr;gap:10px;margin:4px -20px calc(-18px - env(safe-area-inset-bottom));padding:12px 20px calc(14px + env(safe-area-inset-bottom));background:linear-gradient(#fff0,#fff 22%)}
.fs-ft .btn.o{width:auto;padding:0 22px}
@media(min-width:600px){.fs-ft{bottom:-22px;margin-bottom:-22px;padding-bottom:18px}}
/* ===== recently viewed ===== */
.rv-x{font-size:13px;font-weight:600;color:var(--mute);padding:4px 2px}
/* ===== returns ===== */
.rtag{display:inline-flex;align-items:center;gap:5px;font-weight:700;color:#a15c00}
.rtag.r-completed{color:#1f7a4d}.rtag.r-rejected{color:#c0245a}
.rtn .rtn-st{display:grid;grid-template-columns:repeat(4,1fr);position:relative;margin:6px 0 4px}
.rtn .rtn-st::before{content:'';position:absolute;left:12.5%;right:12.5%;top:13px;height:2px;background:var(--line)}
.rtn .rtn-st>div{position:relative;display:grid;justify-items:center;gap:5px;text-align:center}
.rtn .rtn-st i{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-size:12px;font-weight:700;background:#fff;border:2px solid var(--line);color:var(--mute)}
.rtn .rtn-st small{font-size:11px;color:var(--mute);font-weight:600}
.rtn .rtn-st .on i{background:var(--grad);border-color:transparent;color:#fff}.rtn .rtn-st .on small{color:var(--p1)}
.rtn.fin .rtn-st .on i{background:linear-gradient(135deg,#2fa86a,#1f7a4d)}
.rtn-note{margin:4px 0 8px;padding:10px 12px;border-radius:14px;background:#f6effb;font-size:13.5px;line-height:1.45;color:var(--ink)}
.rtn.rej .rtn-note{background:#fde7ee;color:#8c1d43}
.rtn-hint{margin:0 0 10px;font-size:13px;color:var(--mute)}
.rtn .btn{margin:2px 0 10px}
.rtn.cta{padding:14px 16px;display:grid;gap:12px}
.rtn-cta{display:flex;gap:12px;align-items:center}.rtn-cta div{display:grid;gap:2px}.rtn-cta b{font-size:15px;color:var(--ink)}.rtn-cta small{font-size:12.5px;color:var(--mute)}
.rtn.cta .btn{margin:0}
.rtn-closed{margin:14px 4px 0;font-size:12.5px;color:var(--mute);text-align:center}
.rtf{display:grid;gap:12px;align-content:start}
.rtf-hero{display:flex;gap:12px;align-items:center;padding:14px 16px;border-radius:22px;color:#fff;background:linear-gradient(135deg,#4a1668,#8e2a8c 55%,#e0457b);box-shadow:0 16px 30px -14px #8e2a8ccc}
.rtf-hero>span{width:44px;height:44px;border-radius:14px;background:#ffffff2e;display:grid;place-items:center;flex:none}
.rtf-hero div{display:grid}.rtf-hero b{font-size:16px}.rtf-hero small{font-size:12.5px;opacity:.88}
.rtf-t{margin:8px 2px 0;font-size:14px;font-weight:800;color:var(--ink)}
.rtf .chips.wrap{padding:0}
.rtf .lbl{margin:0}
.rtf-its{display:grid;gap:8px}
.rti{display:flex;align-items:center;gap:8px;padding:8px;border-radius:20px;background:#fff;border:1.5px solid var(--edge);box-shadow:0 6px 16px #4a166810;transition:border-color .2s}
.rti.on{border-color:var(--p2);background:linear-gradient(145deg,#fdf7ff,#fff)}
.rti-m{all:unset;box-sizing:border-box;cursor:pointer;flex:1;min-width:0;display:flex;align-items:center;gap:10px}
.rti-c{flex:none;width:24px;height:24px;border-radius:8px;border:2px solid var(--line);display:grid;place-items:center;font-style:normal;font-size:13px;font-weight:800;color:#fff}
.rti.on .rti-c{background:var(--grad);border-color:transparent}
.rti .pic{width:52px;height:52px;flex:none;border-radius:14px;font-size:24px;margin:0}
.rti-m span{min-width:0;display:grid}.rti-m b{font-size:14px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rti-m small{font-size:12px;color:var(--mute)}
.rti-q{flex:none;background:#f6effb;border-radius:999px;padding:3px;gap:4px}
.rti-q button{width:32px;height:32px;border:0;background:#fff;color:var(--p1)}.rti-q span{min-width:18px;text-align:center;font-weight:700}
.rtf-k{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.rtf-k button{display:grid;justify-items:start;gap:3px;padding:14px;border-radius:20px;background:#fff;border:1.5px solid var(--edge);text-align:left;box-shadow:0 6px 16px #4a166810;transition:border-color .2s,transform .3s var(--spring)}
.rtf-k button:active{transform:scale(.97)}
.rtf-k span{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:#f6effb;color:var(--p2);margin-bottom:4px}
.rtf-k b{font-size:14px;color:var(--ink)}.rtf-k small{font-size:12px;color:var(--mute)}
.rtf-k .on{border-color:var(--p2);background:linear-gradient(145deg,#fdf7ff,#fff)}.rtf-k .on span{background:var(--grad);color:#fff}
.rtf-sum{display:flex;justify-content:space-between;align-items:baseline;padding:14px 16px;border-radius:18px;background:#fff;border:1px solid var(--edge);font-size:14px;color:var(--mute)}
.rtf-sum b{font-size:20px;background:var(--grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
@media(max-width:360px){.rtf-k{grid-template-columns:1fr}}
@media(prefers-reduced-motion:reduce){.stl i,.sg{animation:none}}
`

const GATE_CSS = `
.gt-bg{position:fixed;inset:0;z-index:900;display:flex;align-items:flex-end;justify-content:center;background:#1a063a73;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);animation:gtFade .25s ease both;overscroll-behavior:contain}
.gt{position:relative;width:100%;max-width:480px;max-height:92dvh;overflow-y:auto;overscroll-behavior:contain;display:grid;gap:12px;justify-items:center;text-align:center;padding:10px 20px calc(18px + env(safe-area-inset-bottom));border-radius:30px 30px 0 0;background:linear-gradient(180deg,#fff 0,#fff 60%,#fbf4fb);box-shadow:0 -20px 60px #4a166855;animation:gtUp .4s cubic-bezier(.2,.9,.3,1) both;will-change:transform;touch-action:pan-y}
.gt.drag{transition:none;animation:none}.gt.rel{transition:transform .28s cubic-bezier(.2,.9,.3,1)}
.gt-bar{width:42px;height:5px;border-radius:9px;background:#d9cde6;margin:2px 0 4px}
.gt-x{position:absolute;right:14px;top:14px;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:#f4ecf8;color:var(--mute);font-size:14px;border:0;cursor:pointer}
.gt-ic{position:relative;width:72px;height:72px;border-radius:24px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,#8e2a8c,#e0457b);box-shadow:0 14px 30px #8e2a8c55,inset 0 1.5px 0 #ffffff80;margin-top:6px}
.gt-ic::before{content:'';position:absolute;inset:-8px;border-radius:30px;border:2px solid #e0457b30;animation:gtPulse 2.6s ease-out infinite}
.gt-ic .ico{width:32px;height:32px}
.gt h3{margin:2px 0 0;font-size:21px;line-height:1.2;letter-spacing:-.2px;color:var(--ink)}
.gt p{margin:0;font-size:14px;line-height:1.5;color:var(--mute);max-width:330px}
.gt-pts{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:100%;margin:4px 0 2px}
.gt-pts span{display:grid;justify-items:center;gap:4px;padding:10px 4px;border-radius:16px;background:#f8f1fb;font-size:11.5px;font-weight:600;color:var(--p1);line-height:1.2}
.gt-pts i{width:40px;height:40px;border-radius:14px;display:grid;place-items:center;font-style:normal;color:#fff;background:linear-gradient(135deg,#8e2a8c,#e0457b);box-shadow:0 6px 14px #8e2a8c40,inset 0 1px 0 #ffffff70}.gt-pts i .ico{width:21px;height:21px}
.gt .btn{width:100%;min-height:54px;font-size:16px;display:flex;align-items:center;justify-content:center;gap:10px;touch-action:manipulation}
.gt .gg{background:#fff;color:var(--ink);border:1.5px solid var(--line);box-shadow:0 6px 16px #4a166814}
.gt .gg::before,.gt .gg::after{display:none}
.gt-or{display:flex;align-items:center;gap:12px;width:100%;font-size:12px;color:var(--mute)}
.gt-or::before,.gt-or::after{content:'';flex:1;height:1px;background:var(--line)}
.gt-no{background:none;border:0;padding:10px 16px;font-size:14px;font-weight:600;color:var(--mute);cursor:pointer;touch-action:manipulation}
.gt-fine{font-size:11.5px;color:var(--mute);display:flex;align-items:center;gap:6px;margin:0}
@media(min-width:600px){.gt-bg{align-items:center}.gt{border-radius:30px;padding-bottom:22px}.gt-bar{display:none}}
@media(max-height:640px){.gt{gap:8px}.gt-ic{width:56px;height:56px;border-radius:18px}.gt-pts{display:none}}
@keyframes gtFade{from{opacity:0}}
@keyframes gtUp{from{transform:translateY(60px);opacity:0}}
@keyframes gtPulse{0%{opacity:.9;transform:scale(.94)}100%{opacity:0;transform:scale(1.18)}}
@media(prefers-reduced-motion:reduce){.gt,.gt-bg,.gt-ic::before{animation:none}}
.a-x{flex:none;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;color:#fff;background:#ffffff22;border:1px solid #ffffff3d;font-size:15px;cursor:pointer;touch-action:manipulation}
.auth{overscroll-behavior:contain;-webkit-overflow-scrolling:touch;min-height:100dvh}
.auth .fld input,.auth .fld{font-size:16px}
.auth .btn,.auth .social,.auth .tabs button,.auth .sw button,.auth .forgot button{touch-action:manipulation}
@media(max-width:480px){.auth .auth-card{border-radius:26px}.auth .abar{margin-bottom:4px}}
.pf .pf-in{background:linear-gradient(120deg,#8e2a8c,#e0457b);border-color:transparent;color:#fff;box-shadow:0 10px 24px #8e2a8c44}
.pf .pf-in span:first-child{background:#ffffff33;color:#fff}
`
const GATE_TXT = {
  checkout: ['Log in to place your order', 'Your cart is saved. Log in or sign up to checkout and track your delivery.'],
  ask: ['Log in to ask the seller', 'Log in or sign up to send your question and see the answer here.'],
  follow: ['Log in to follow shops', 'Log in or sign up to hear about new products and deals.'],
  notifications: ['Log in to see updates', 'Log in or sign up to get order updates and seller answers.'],
  login: ['Log in to continue', 'Please log in or sign up to continue.'],
}
function LoginSheet({ why, onLogin, onSignup, onGoogle, onClose }) {
  const [t, d] = GATE_TXT[why] || GATE_TXT.login, [dy, setDy] = useState(0), [mode, setMode] = useState(''), y0 = useRef(null), ref = useRef(null)
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k)
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev }
  }, [onClose])
  // swipe the sheet down to dismiss (only when it is scrolled to the top)
  const ts = e => { y0.current = ref.current && ref.current.scrollTop <= 0 ? e.touches[0].clientY : null }
  const tm = e => { if (y0.current == null) return; const v = e.touches[0].clientY - y0.current; if (v > 0) { setMode('drag'); setDy(v) } }
  const te = () => { if (y0.current == null) return; y0.current = null; setMode('rel'); if (dy > 110) onClose(); else setDy(0) }
  return <div className="gt-bg" onClick={onClose}><div ref={ref} className={'gt ' + mode} style={dy ? { transform: `translateY(${dy}px)` } : undefined} role="dialog" aria-modal="true" aria-label={t} onClick={e => e.stopPropagation()} onTouchStart={ts} onTouchMove={tm} onTouchEnd={te} onTouchCancel={te}>
    <span className="gt-bar" aria-hidden="true" /><button type="button" className="gt-x" aria-label="Close" onClick={onClose}>✕</button>
    <span className="gt-ic"><Icon n="lock" /></span><h3>{t}</h3><p>{d}</p>
    <div className="gt-pts" aria-hidden="true"><span><i><Icon n="shield" /></i>Discreet packaging</span><span><i><Icon n="truck" /></i>Fast delivery</span><span><i><Icon n="box" /></i>Track orders</span></div>
    <button type="button" className="btn gg" onClick={onGoogle}><GoogleG />Continue with Google</button>
    <div className="gt-or"><span>or</span></div>
    <button type="button" className="btn" onClick={onLogin}>Log in with email</button>
    <button type="button" className="btn o" onClick={onSignup}>Create new account</button>
    <button type="button" className="gt-no" onClick={onClose}>Not now, keep browsing</button>
    <p className="gt-fine"><Icon n="lock" />Private by design · Your data stays safe</p></div></div>
}

function safeAdmin(u) { try { return api.isAdmin(u) } catch { return false } }

// Shop-only coupons shown on the product and shop pages. Tapping one keeps it for the cart.
const VCACHE = new Map()
const vText = c => c.kind === 'percent' ? `${+c.value}% off${c.max_discount ? ' (up to ৳' + (+c.max_discount) + ')' : ''}` : c.kind === 'amount' ? `৳${+c.value} off` : 'Free delivery'
function ShopVouchers({ shopId, keepCode }) {
  const [list, setList] = useState(() => VCACHE.get(shopId) || NONE)
  useEffect(() => { if (!shopId) return; let on = true; api.getPublicCoupons([shopId]).then(r => { const v = (r || []).filter(c => c.shop_id === shopId); VCACHE.set(shopId, v); on && setList(v) }); return () => { on = false } }, [shopId])
  if (!list.length) return null
  return <div className="vch" role="list" aria-label="Shop vouchers">{list.map(c => <button type="button" role="listitem" key={c.code} className="vc" onClick={() => keepCode?.(c.code)}><b>{vText(c)}</b><small>{c.min_order > 0 ? `On ৳${+c.min_order}+ from this shop` : 'On this shop'}{c.ends_at ? ' · ends ' + new Date(c.ends_at).toLocaleDateString([], { day: 'numeric', month: 'short' }) : ''}</small><em>{c.code}</em></button>)}</div>
}

function ShopScreen({ shop, prods, loading, back, gp, follow, keepCode = null }) {
  const [q, setQ] = useState(''), [fc, setFc] = useState(null), followed = !!shop.id && !!follow?.on.has(shop.id)
  useEffect(() => { let on = true; if (shop.id) api.getFollowerCount(shop.id).then(n => on && setFc(n)); return () => { on = false } }, [shop.id])
  const list = useMemo(() => prods.filter(x => x.shop_id === shop.id), [prods, shop.id])
  const shown = useMemo(() => { const k = q.trim().toLowerCase(); return k ? list.filter(x => `${x.name} ${x.brand || ''} ${x.tag || ''}`.toLowerCase().includes(k)) : list }, [list, q])
  const name = shop.name || 'Shop'
  return <><Hdr title={name} back={back} /><div className="scr">
    {shop.cover_url && <div className="shp-cv"><img src={shop.cover_url} alt="" decoding="async" fetchpriority="high" draggable="false" /></div>}
    <div className={'shp' + (shop.cover_url ? ' has-cv' : '')}><span className="shp-lg">{shop.logo_url ? <img src={shop.logo_url} alt="" decoding="async" draggable="false" /> : <em>{name.trim().charAt(0).toUpperCase()}</em>}</span>
      <div className="shp-t"><b>{name}<i className="vf">✓</i></b><small>{shop.city ? 'Seller · ' + shop.city : 'Verified seller on Pinkish'}</small><span className="shp-n">{loading ? 'Loading…' : list.length + (list.length === 1 ? ' product' : ' products')}{fc != null && ' · ' + fc + (fc === 1 ? ' follower' : ' followers')}</span></div>
      {shop.id && follow && <button className={'fol' + (followed ? ' on' : '')} aria-pressed={followed} onClick={() => { follow.toggle(shop.id); setFc(c => c == null ? c : Math.max(0, c + (followed ? -1 : 1))) }}>{followed ? 'Following ✓' : '+ Follow'}</button>}</div>
    <ShopVouchers shopId={shop.id} keepCode={keepCode} />
    <Fulfil />
    {list.length > 6 && <div className="tools"><div className="search">🔍<input placeholder={`Search ${name}...`} value={q} onChange={e => setQ(e.target.value)} /></div></div>}
    <Grid list={shown} loading={loading} {...gp} />
  </div></>
}

function ProductScreen({ p, back, addToCart, count, go, liked, like, prods = [], open, wish, shop = null, user = null, say = () => {}, login = null, seen = NONE, keepCode = null }) {
  const [v, setV] = useState(p.variants?.[0]), [added, setAdded] = useState(false), [n, setN] = useState(1)
  const t = useRef(0)
  useEffect(() => () => clearTimeout(t.current), [])
  const price = p.price * (v?.mult || 1), st = stockOf(p), out = st === 0, maxQ = st == null ? 20 : Math.max(1, Math.min(20, st))
  const add = () => { if (out) return; addToCart(p, v, n); setAdded(true); clearTimeout(t.current); t.current = setTimeout(() => setAdded(false), 1200) }
  const more = () => { if (n >= maxQ) { if (st != null) say(`Only ${st} in stock`); return } setN(n + 1) }
  const multi = (p.variants || []).length > 1
  const sugg = useMemo(() => suggest(prods, [p], new Set([p.id]), 8), [prods, p])
  const deal = api.dealLive(p), [alsoIds, setAlsoIds] = useState([])
  useEffect(() => { let on = true; api.getAlsoBought(p.id, 8).then(r => on && setAlsoIds(r)); return () => { on = false } }, [p.id])
  const also = useMemo(() => { const m = new Map(prods.map(x => [String(x.id), x])); return alsoIds.map(id => m.get(id)).filter(Boolean) }, [alsoIds, prods])
  // More from this shop: in stock first, then best rated / most reviewed, never the product itself or "also bought" repeats
  const moreShop = useMemo(() => { if (!p.shop_id) return NONE; const skip = new Set([p.id, ...also.map(x => x.id)]); return prods.filter(x => x.shop_id === p.shop_id && !skip.has(x.id) && x.is_active !== false).sort((a, b) => (stockOf(a) === 0) - (stockOf(b) === 0) || (+b.rating || 0) - (+a.rating || 0) || (+b.reviews || 0) - (+a.reviews || 0)).slice(0, 10) }, [prods, p.id, p.shop_id, also])
  const seenHere = useMemo(() => seen.filter(x => x.id !== p.id).slice(0, 10), [seen, p.id])
  const shopObj = shop?.id ? shop : p.shop_id ? { id: p.shop_id, name: 'this shop' } : null
  return <><Hdr title="Details" back={back} right={<button className="ib" aria-label="Open cart" onClick={() => go('cart')}><Icon n="bag" />{count > 0 && <em className="cb" key={count}>{count}</em>}</button>} />
    <div className="scr pd"><div className="pdp"><Gallery p={p} /><div className="fadeUp pdp-info">
      <small className="pk">{[p.brand, p.tag].filter(Boolean).join(' · ') || 'Pinkish'}</small>
      <div className="row"><h3>{p.name}</h3><div className="pacts"><button className="ib shr" aria-label="Share this product" onClick={() => shareProduct(p, say)}><Icon n="share" /></button><Heart on={liked} toggle={() => like(p.id)} inl /></div></div>
      {deal && <div className="dealbar"><b className="rt"><i className="rt-i bolt sm"><BoltIc /></i>Flash deal -{api.dealPct(p)}%</b><span>Ends in <Countdown end={p.deal_ends_at} /></span></div>}
      {/* only real reviews get stars; a product without reviews says "New" instead of a made-up rating */}
      {(p.reviews || 0) > 0 && p.rating != null
        ? <small style={{ color: '#8b8197' }}>★ {Number(p.rating).toFixed(1)} ({p.reviews > 999 ? (p.reviews / 1000).toFixed(1) + 'k' : p.reviews} review{p.reviews === 1 ? '' : 's'})</small>
        : <small style={{ color: '#8b8197' }}>New on Pinkish · no reviews yet</small>}
      {out ? <div className="stl so" role="status"><i />Sold out · check back soon</div> : st != null && st <= LOW ? <div className="stl" role="status"><i />Only {st} left in stock · order soon</div> : null}
      {shop ? (() => { const sh = shop.id ? shop : { id: p.shop_id, name: 'Marketplace seller' }; const openShop = () => go('shop', { shop: sh }); return <div className="store link" role="button" tabIndex={0} aria-label={'View shop ' + (sh.name || '')} onClick={openShop} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openShop() } }}><span className="sl shop">{sh.logo_url ? <img src={sh.logo_url} alt="" decoding="async" draggable="false" /> : <em>{(sh.name || 'S').trim().charAt(0).toUpperCase()}</em>}</span><div><b>{sh.name || 'Marketplace seller'}<i className="vf">✓</i></b><small>{sh.city ? 'Seller · ' + sh.city : 'Verified seller on Pinkish'}</small></div><span className="fl">View shop</span></div> })()
        : <div className="store"><span className="sl"><Glyph v="🛡️" /></span><div><b><span className="bp">Pink</span><span className="bi">ish</span> Store<i className="vf">✓</i></b><small>Official store</small></div><span className="fl">Verified</span></div>}
      {p.shop_id && <ShopVouchers shopId={p.shop_id} keepCode={keepCode} />}
      {p.shop_id && <Fulfil shop={shop?.id ? shop : null} />}
      <div className="opt"><div className="opt-l">{multi && <><span>Select option</span><div className="var">{p.variants.map(x => <button key={x.label} className={v?.label === x.label ? 'on' : ''} onClick={() => setV(x)}>{x.label}</button>)}</div></>}</div>
        <div className="opt-r"><span>QTY</span><div className="qty"><button aria-label="Decrease" onClick={() => setN(x => Math.max(1, x - 1))}>−</button><span className="qn">{n}</span><button aria-label="Increase" onClick={more}>+</button></div></div></div>
      <div className="dsc"><h5>Description</h5><ul className="ck">{(p.features || []).map(f => <li key={f}>{f}</li>)}</ul></div></div></div>
      {also.length > 0 && <Rail title="Customers also bought" list={also} add={addToCart} open={open} wish={wish} like={like} />}
      {p.shop_id && <QA p={p} user={user} say={say} login={login} />}
      {moreShop.length > 0 && <Rail title={'More from ' + (shopObj?.name || 'this shop')} action={shopObj?.id && <a onClick={() => go('shop', { shop: shopObj })}>View shop</a>} list={moreShop} add={addToCart} open={open} wish={wish} like={like} />}
      {sugg.length > 0 && <Rail title="You may also like" list={sugg} add={addToCart} open={open} wish={wish} like={like} />}
      {seenHere.length > 0 && <Rail title="Recently viewed" list={seenHere} add={addToCart} open={open} wish={wish} like={like} />}</div>
    <div className="buybar"><div><small>Total price</small><b><Money v={price * n} />{deal && <s className="old">{taka(p.old_price * (v?.mult || 1) * n)}</s>}</b></div><button className={'btn buy' + (added ? ' done' : '')} disabled={out} onClick={add}><Icon n="bag" />{out ? 'Sold out' : added ? 'Added ✓' : 'Add to Cart'}</button></div></>
}
/* ===== Motion system: every effect animates transform / opacity only, so the GPU does the work ===== */
const MOTION_CSS = `
:root{--out:cubic-bezier(.16,1,.3,1);--lqs:cubic-bezier(.34,1.32,.5,1)}
/* page transitions: push slides in from the right, back slides in from the left, tabs rise and fade */
.pg.fwd{animation:pgFwd .38s var(--out) both}
.pg.back{animation:pgBack .34s var(--out) both}
.pg.fade{animation:pgFade .32s var(--out) both}
@keyframes pgFwd{from{opacity:0;transform:translate3d(40px,0,0) scale(.985)}to{opacity:1;transform:none}}
@keyframes pgBack{from{opacity:0;transform:translate3d(-32px,0,0) scale(.985)}to{opacity:1;transform:none}}
@keyframes pgFade{from{opacity:0;transform:translate3d(0,12px,0) scale(.985)}to{opacity:1;transform:none}}
.pg.fwd .hdr .ht{animation:up .45s var(--out) .06s both}
/* liquid tab bar: one gradient drop glides between tabs */
.nav.lq{isolation:isolate}
.nv-blob{position:absolute;z-index:0;left:var(--l,0);right:var(--r,100%);top:var(--t,0);bottom:var(--b,100%);border-radius:999px;pointer-events:none;opacity:0;--dl:0s;--dr:0s;
  background:linear-gradient(120deg,#6b1b77,#a42a8a 45%,#ff3358);
  box-shadow:inset 0 1.5px 0 #ffffff80,inset 0 -8px 14px #2d0b4a40,0 10px 22px -6px #ff3358aa;
  transition:left .48s var(--lqs) var(--dl),right .48s var(--lqs) var(--dr),top .48s var(--lqs) var(--dl),bottom .48s var(--lqs) var(--dr),opacity .25s}
.nv-blob[data-d=f]{--dl:.08s}.nv-blob[data-d=b]{--dr:.08s}
.nv-blob.on{opacity:1}.nv-blob.nt{transition:none}
.nv-blob::before{content:'';position:absolute;inset:2px 12% 52%;border-radius:999px;background:linear-gradient(#ffffff73,#fff0)}
.nav.lq button.on::before{opacity:0!important}
.nav.lq button{overflow:hidden}
.nav.lq .nl{display:inline-block;font-weight:inherit;transition:none!important} /* label size must snap, so the drop can measure the final width */
.nav.lq button.on .nl{animation:nlIn .42s var(--out) both}
@keyframes nlIn{from{opacity:0;transform:translate3d(-8px,0,0)}}
@media(hover:hover){.nav.lq button:not(.on):hover::before{opacity:.7;transform:none}}
@media(min-width:900px){.nv-blob{border-radius:18px}.nv-blob::before{border-radius:16px;inset:2px 6px 52%}}
/* add to cart: the product flies to the cart */
.fly{position:fixed;z-index:3000;width:48px;height:48px;border-radius:50%;overflow:hidden;pointer-events:none;background:var(--grad);box-shadow:0 10px 24px #8e2a8c66,0 0 0 3px #fff;will-change:transform}
.fly img{width:100%;height:100%;object-fit:cover;display:block;background:#fff}
/* press feedback that composes with hover lifts (uses the separate scale property) */
.card,.cat,.oc,.nt-i,.store.link{transition:transform .35s var(--spring),box-shadow .3s,scale .25s var(--spring)}
.card:active,.cat:active,.oc:active,.nt-i:active,.store.link:active{scale:.97}
.nt-i{overflow:hidden;isolation:isolate}
/* products further down the page float in as they scroll into view (no JavaScript; Chromium only, others show them plainly) */
@supports (animation-timeline:view()){@media(prefers-reduced-motion:no-preference){
  html:not(.lite) .grid .card:nth-child(n+7){animation:cardIn linear both;animation-timeline:view();animation-range:entry 5% entry 60%}
}}
@keyframes cardIn{from{opacity:0;translate:0 28px;scale:.94}to{opacity:1;translate:0 0;scale:1}}
/* toast lands like a drop */
@keyframes toast{0%{opacity:0;transform:translate(-50%,18px) scale(.86,.72)}55%{opacity:1;transform:translate(-50%,-3px) scale(1.04,.97)}100%{opacity:1;transform:translateX(-50%)}}
/* lite mode used to paint the toast white on white */
html.lite .toast{background:#2a1a3a;color:#fff}
/* splash: the logo card breathes in */
.splash .lgcard{animation:wlArt .7s var(--lqs) both}
@media(prefers-reduced-motion:reduce){.nv-blob{transition:opacity .2s}.fly{display:none}}
`

/* ===== Welcome screen: light, simple, marketplace style ===== */
const WEL_CSS = `
.wl{flex:1;min-height:0;position:relative;overflow:hidden;display:flex;flex-direction:column;color:var(--ink,#2a1a3a);
  padding:calc(12px + env(safe-area-inset-top)) max(18px,env(safe-area-inset-right)) calc(16px + env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left));
  background:radial-gradient(90% 45% at 100% 0,#ffd9e8 0,#ffd9e800 70%),radial-gradient(80% 40% at 0 8%,#eadcff 0,#eadcff00 70%),#fbf7fd}
.wl>*{width:100%;max-width:440px;margin-inline:auto}
.wl-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex:none}
.wl-logo{display:flex;align-items:center;gap:8px;min-width:0}
.wl-logo img{width:30px;height:30px;object-fit:contain;display:block}
.wl-logo .wm{font-size:21px}
.wl-skip{min-height:38px;padding:0 16px;border-radius:999px;font-size:14px;font-weight:600;color:var(--p1);background:#fff;border:1px solid #eee3f5;box-shadow:0 4px 12px -8px #4a166855}
.wl-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;display:flex;flex-direction:column;padding:14px 0 6px}
.wl-body::-webkit-scrollbar{display:none}
.wl-hero{position:relative;border-radius:28px;padding:16px;background:linear-gradient(135deg,#4a1668,#8e2a8c 55%,#e0457b);box-shadow:0 22px 40px -22px #8e2a8ccc;overflow:hidden;flex:none;animation:up .5s var(--out) both}
.wl-hero::after{content:'';position:absolute;right:-60px;top:-60px;width:200px;height:200px;border-radius:50%;background:radial-gradient(circle,#ffffff2e,#fff0 70%);pointer-events:none}
.wl-tag{position:relative;z-index:1;display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border-radius:999px;background:#ffffff26;border:1px solid #ffffff3d;color:#fff;font-size:12px;font-weight:600}
.wl-tag i{width:7px;height:7px;border-radius:50%;background:#7dffb4;box-shadow:0 0 0 3px #7dffb433}
.wl-mos{position:relative;z-index:1;display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:14px;height:clamp(170px,30vh,250px)}
.wl-mos span{position:relative;border-radius:20px;overflow:hidden;background:#fff;box-shadow:0 10px 22px -12px #1a063a99;animation:up .5s var(--out) both}
.wl-mos span:nth-child(2){animation-delay:.06s}.wl-mos span:nth-child(3){animation-delay:.12s}.wl-mos span:nth-child(4){animation-delay:.18s}
.wl-mos.n3 span:first-child{grid-row:span 2}
.wl-mos img{width:100%;height:100%;object-fit:cover;display:block}
.wl-mos em{position:absolute;left:8px;top:8px;padding:3px 8px;border-radius:999px;background:#ff3358;color:#fff;font:700 11px/1.3 system-ui,sans-serif;font-style:normal}
.wl-art{position:relative;z-index:1;height:clamp(160px,28vh,230px);display:grid;place-items:center;margin-top:10px}
.wl-art>*{height:100%;width:auto;max-width:100%;animation:flt 4s ease-in-out infinite}
.wl h1{display:grid;margin:20px 0 0;font-size:clamp(25px,4.2vh,31px);line-height:1.12;font-weight:800;letter-spacing:-.5px;color:var(--p1);animation:up .5s var(--out) .06s both}
.wl h1 em{font-style:normal;background:linear-gradient(90deg,#8e2a8c,#e0457b);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.wl-sub{margin:8px 0 0;font-size:14.5px;line-height:1.5;color:#6f6380;animation:up .5s var(--out) .1s both}
.wl-cats{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;margin:16px -18px 0;padding:2px 18px;flex:none;animation:up .5s var(--out) .14s both}
.wl-cats::-webkit-scrollbar{display:none}
.wl-cats button{flex:none;display:inline-flex;align-items:center;gap:7px;min-height:40px;padding:0 14px 0 6px;border-radius:999px;background:#fff;border:1px solid #eee3f5;font-size:13px;font-weight:600;color:var(--p1);white-space:nowrap;transition:transform .2s}
.wl-cats button:active{transform:scale(.95)}
.wl-cats span{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#f6effb;color:var(--p2);font-size:15px;overflow:hidden}
.wl-cats span img{width:20px;height:20px;object-fit:contain}
.wl-cats .cico{width:16px;height:16px}
.wl-pts{list-style:none;padding:0;margin:14px 0 0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;flex:none;animation:up .5s var(--out) .18s both}
.wl-pts li{display:flex;align-items:center;gap:8px;padding:10px;border-radius:16px;background:#fff;border:1px solid #f0e7f6;min-width:0}
.wl-pts i{flex:none;width:30px;height:30px;border-radius:10px;display:grid;place-items:center;background:#fde7f0;color:var(--p3)}
.wl-pts .ico{width:16px;height:16px}
.wl-pts span{min-width:0;display:grid;line-height:1.2}
.wl-pts b{font-size:12px;color:var(--p1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wl-pts small{font-size:11px;color:#8b8197;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wl-cta{flex:none;display:grid;gap:6px;padding-top:12px;animation:up .5s var(--out) .2s both}
.btn.wl-go{min-height:56px;font-size:16.5px;display:flex;align-items:center;justify-content:center;gap:8px}
.wl-go .ico{width:18px;height:18px}
.wl-in{text-align:center;font-size:13.5px;color:#6f6380;margin:0}
.wl-in button{color:var(--p2);font-weight:800;padding:8px 4px}
.wl.out>*{animation:wlOut .22s ease both}
@keyframes wlOut{to{opacity:0;transform:translateY(-6px)}}
@media(max-height:640px){.wl-pts{display:none}.wl-mos,.wl-art{height:150px}.wl h1{margin-top:14px}}
@media(max-width:360px){.wl-pts li{flex-direction:column;text-align:center;padding:8px 4px}.wl-pts b,.wl-pts small{white-space:normal}}
@media(min-width:900px){.wl{padding-top:28px;padding-bottom:28px}.wl>*{max-width:480px}}
@media(prefers-reduced-motion:reduce){.wl *,.wl.out>*{animation:none!important}}
`