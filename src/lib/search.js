// =====================================================================
// Pinkish search: typo tolerant, runs in the browser on the loaded catalogue.
//   • every word of the query must match (name, brand, tag, category, shop)
//   • a word matches exactly, as a prefix ("lip" → lipstick) or with 1–2 typos ("lipstik", "parfume")
//   • "t-shirt", "t shirt" and "tshirt" are the same word
//   • nothing found? it retries with "most words" and says so
//   • "Did you mean …" when a typo was corrected
// Speed: the index is built once per catalogue; a query only compares against the vocabulary
// (a few thousand distinct words), using a bounded edit distance that stops early.
// =====================================================================
const BN = '০১২৩৪৫৬৭৮৯'
export const norm = s => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[০-৯]/g, d => String(BN.indexOf(d)))
const SPLIT = /[^\p{L}\p{N}]+/u
export const words = s => norm(s).split(SPLIT).filter(Boolean)

// small synonym list for how people in Bangladesh search (extend freely)
const SYN = {
  perfume: ['attar', 'fragrance', 'scent', 'parfum'], attar: ['perfume'], tshirt: ['tee'], tee: ['tshirt'],
  mobile: ['phone'], phone: ['mobile'], cream: ['lotion'], lotion: ['cream'], facewash: ['cleanser'], cleanser: ['facewash'],
  sunscreen: ['sunblock', 'spf'], sunblock: ['sunscreen'], panjabi: ['punjabi'], punjabi: ['panjabi'], saree: ['sari'], sari: ['saree'],
}

// Optimal-string-alignment distance, gives up as soon as it is sure to exceed max.
export const dist = (a, b, max) => {
  const la = a.length, lb = b.length
  if (Math.abs(la - lb) > max) return max + 1
  if (!la || !lb) return Math.max(la, lb)
  let p2 = null, p1 = new Array(lb + 1), cur = new Array(lb + 1)
  for (let j = 0; j <= lb; j++) p1[j] = j
  for (let i = 1; i <= la; i++) {
    cur[0] = i; let best = i
    const ca = a.charCodeAt(i - 1)
    for (let j = 1; j <= lb; j++) {
      const cb = b.charCodeAt(j - 1)
      let v = Math.min(p1[j] + 1, cur[j - 1] + 1, p1[j - 1] + (ca === cb ? 0 : 1))
      if (p2 && i > 1 && j > 1 && ca === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === cb) v = Math.min(v, p2[j - 2] + 1)
      cur[j] = v; if (v < best) best = v
    }
    if (best > max) return max + 1
    const t = p2 || new Array(lb + 1); p2 = p1; p1 = cur; cur = t
  }
  return p1[lb]
}
const allow = n => (n <= 3 ? 0 : n <= 6 ? 1 : 2)

/**
 * Build once per catalogue.
 * entries[i] = { p, name: Set(words of the name), all: Set(all words), n: normalised name }
 * vocab: word → { name: [entry indexes], other: [entry indexes], f: how many products use it }
 */
export function makeIndex(prods, cats = [], shops = {}) {
  const cn = new Map(cats.map(c => [c.id, c.name])), vocab = new Map(), entries = new Array(prods.length), brands = new Set()
  const add = (w, i, inName) => {
    let v = vocab.get(w); if (!v) { v = { name: [], other: [], f: 0 }; vocab.set(w, v) }
    const l = inName ? v.name : v.other
    if (l[l.length - 1] !== i) { l.push(i); v.f++ }
  }
  prods.forEach((p, i) => {
    const nw = words(p.name), ow = words([p.brand, p.tag, cn.get(p.category_id), p.shop_id ? shops[p.shop_id]?.name : 'pinkish'].filter(Boolean).join(' '))
    // joined neighbours: "t shirt" is also indexed as "tshirt"
    const join = ws => ws.slice(1).map((w, k) => ws[k] + w).filter(w => w.length <= 14)
    const name = new Set([...nw, ...join(nw)]), all = new Set([...name, ...ow, ...join(ow)])
    name.forEach(w => add(w, i, true)); all.forEach(w => { if (!name.has(w)) add(w, i, false) })
    entries[i] = { p, name, all, n: norm(p.name) }
    if (p.brand) brands.add(p.brand)
  })
  return { entries, vocab, words: [...vocab.keys()], brands: [...brands], size: prods.length }
}

// For one query word: every vocabulary word it can mean, with a weight (higher = better)
const MEMO = new WeakMap()
function expand(idx, q) {
  let m = MEMO.get(idx); if (!m) { m = new Map(); MEMO.set(idx, m) }
  if (m.has(q)) return m.get(q)
  const out = new Map(), put = (w, s, fix) => { const o = out.get(w); if (!o || o.s < s) out.set(w, { s, fix }) }
  const k = allow(q.length)
  for (const w of idx.words) {
    if (w === q) put(w, 10)
    else if (q.length >= 2 && w.startsWith(q)) put(w, 8 - Math.min(3, (w.length - q.length) / 4))
    else if (k) {
      const d = dist(q, w.length > q.length + k ? w.slice(0, q.length + k) : w, k)
      // a typo in the first letter is rare on phones: count it as one more edit
      if (d <= k && (d < k || w[0] === q[0])) put(w, (w.length >= q.length ? 6 : 5) - d * 1.5, true)
    }
  }
  for (const s of SYN[q] || []) if (idx.vocab.has(s)) put(s, 7)
  if (m.size > 400) m.clear()
  m.set(q, out)
  return out
}

/**
 * search(idx, query) → array of products, best first. The array also carries:
 *   .hl    words to highlight (including corrected spellings)
 *   .fixed corrected query ("Did you mean …") or ''
 *   .loose true when not every word matched
 */
export function searchIn(idx, query) {
  let qs = words(query); const res = []
  res.hl = []; res.fixed = ''; res.loose = false
  if (!qs.length || !idx?.size) return res
  qs = qs.slice(0, 6)
  // "t shirt" typed with a space: also try the joined word
  const groups = qs.map(q => expand(idx, q))
  for (let i = 0; i + 1 < qs.length; i++) { const j = qs[i] + qs[i + 1]; if (idx.vocab.has(j)) { const g = expand(idx, j); groups[i] = new Map([...groups[i], ...g]); groups[i + 1] = new Map([...groups[i + 1], ...g]) } }

  const run = need => {
    const score = new Map(), hits = new Map()
    groups.forEach((g, gi) => {
      const best = new Map()
      for (const [w, { s }] of g) {
        const v = idx.vocab.get(w)
        for (const i of v.name) { const x = s + 2; if ((best.get(i) || 0) < x) best.set(i, x) }
        for (const i of v.other) if ((best.get(i) || 0) < s) best.set(i, s)
      }
      for (const [i, s] of best) { score.set(i, (score.get(i) || 0) + s); hits.set(i, (hits.get(i) || 0) | (1 << gi)) }
    })
    const full = (1 << groups.length) - 1, out = []
    for (const [i, s] of score) {
      const h = hits.get(i), n = popcount(h)
      if (n < need) continue
      const e = idx.entries[i], p = e.p
      let v = s + (h === full ? 20 : 0) + (e.n.startsWith(qs[0]) ? 4 : 0)
      if (p.stock === 0) v -= 3
      v += Math.min(2, (+p.reviews || 0) / 50) + (+p.rating || 0) / 5
      out.push([v, i])
    }
    out.sort((a, b) => b[0] - a[0] || a[1] - b[1])
    return out
  }
  let out = run(groups.length)
  if (!out.length && groups.length > 1) { out = run(Math.ceil(groups.length / 2)); res.loose = out.length > 0 }
  for (const [, i] of out) res.push(idx.entries[i].p)

  // highlight + "did you mean": the most used exact/fuzzy match for each word
  const fixed = qs.map((q, gi) => {
    let bw = q, bs = -1, fix = false
    for (const [w, o] of groups[gi]) { const f = idx.vocab.get(w)?.f || 0, sc = o.s * 100 + f; if (sc > bs) { bs = sc; bw = w; fix = !!o.fix } }
    if (groups[gi].has(q)) return q
    return fix ? bw : q
  })
  res.hl = [...new Set([...qs, ...fixed])].filter(w => w.length > 1)
  const f = fixed.join(' ')
  if (res.length && f !== qs.join(' ')) res.fixed = f
  return res
}
const popcount = n => { let c = 0; while (n) { n &= n - 1; c++ } return c }
