import { supabase } from '../api.js'

const s = (v, m = 200) => String(v ?? '').trim().slice(0, m)
const need = () => { if (!supabase) throw new Error('The store is not configured. Please try again later.') }
const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(3)), b => b.toString(16).padStart(2, '0')).join('')
const ext = f => ((f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5)) || 'jpg'
const slugify = n => (s(n, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'shop') + '-' + rand()
export const validNid = n => /^(\d{10}|\d{13}|\d{17})$/.test(String(n || '').replace(/[\s-]/g, ''))
const nidOf = f => s(f?.nid, 20).replace(/[\s-]/g, '')
export const validPhone = p => /^(\+?88)?01[3-9]\d{8}$/.test(String(p || '').replace(/[\s-]/g, ''))

const isImg = f => !!f && (/^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(f.name || ''))
function checkFile(f, { doc = false } = {}) {
  if (doc) {
    if (!f || !(isImg(f) || f.type === 'application/pdf')) throw new Error('Upload a photo or PDF file.')
    if (f.size > 10 * 1024 * 1024) throw new Error('File is too large (max 10 MB).')
    return
  }
  if (!isImg(f)) throw new Error('Choose a picture (any photo or image).')
  if (f.size > 30 * 1024 * 1024) throw new Error('Picture is too large (max 30 MB).')
}
// Any picture in, a small optimised WebP out: resized to maxDim, EXIF-rotated, white behind transparency.
// If the browser cannot decode the file (e.g. HEIC on some devices) the original is uploaded as-is when small enough.
async function prepareImage(file, maxDim = 1600, quality = 0.84) {
  try {
    let bmp
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { bmp = await createImageBitmap(file) }
    const r = Math.min(1, maxDim / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(bmp.width * r)); c.height = Math.max(1, Math.round(bmp.height * r))
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height)
    if (bmp.close) bmp.close()
    const blob = await new Promise(res => c.toBlob(res, 'image/webp', quality))
    if (blob && blob.size) return { blob, type: 'image/webp', ext: 'webp' }
  } catch { /* fall through */ }
  if (file.size > 5 * 1024 * 1024 || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('This picture format is not supported on your device. Try a JPG or PNG.')
  return { blob: file, type: file.type, ext: ext(file) }
}
const cleanShop = f => ({ name: s(f.name, 60), description: s(f.description, 500), phone: s(f.phone, 20), address: s(f.address, 300), city: s(f.city, 60) })
function checkShop(c) {
  if (c.name.length < 3) throw new Error('Shop name must be at least 3 characters.')
  if (!validPhone(c.phone)) throw new Error('Enter a valid Bangladeshi mobile number.')
  if (c.address.length < 8) throw new Error('Enter your full business address.')
}
async function uploadDoc(uid, file) {
  checkFile(file, { doc: true })
  const o = file.type === 'application/pdf' ? { blob: file, type: file.type, ext: 'pdf' } : await prepareImage(file, 2000, 0.9)
  const path = `${uid}/${Date.now()}-id.${o.ext}`
  const { error } = await supabase.storage.from('seller-docs').upload(path, o.blob, { contentType: o.type })
  if (error) throw error
  return path
}

export async function getMyShop(uid) {
  need()
  const { data, error } = await supabase.from('shops').select('*').eq('owner_id', uid).maybeSingle()
  if (error) throw error
  return data
}
export async function createShop(uid, form, docFile) {
  need(); const c = cleanShop(form); checkShop(c)
  const nid = nidOf(form); if (!validNid(nid)) throw new Error('Enter your NID number (10, 13 or 17 digits).')
  const id_doc_path = await uploadDoc(uid, docFile)
  const { data, error } = await supabase.from('shops').insert({ ...c, nid_number: nid, owner_id: uid, slug: slugify(c.name), id_doc_path, status: 'pending' }).select().single()
  if (error) throw new Error(/duplicate|unique/i.test(error.message) ? 'You already have a shop.' : error.message)
  return data
}
// Rejected sellers fix their details and send the shop for review again.
export async function resubmitShop(uid, shop, form, docFile) {
  need(); const c = cleanShop(form); checkShop(c)
  const patch = { ...c, status: 'pending' }
  const nid = nidOf(form); if (nid) { if (!validNid(nid)) throw new Error('NID number must be 10, 13 or 17 digits.'); patch.nid_number = nid }
  if (docFile) patch.id_doc_path = await uploadDoc(uid, docFile)
  const { data, error } = await supabase.from('shops').update(patch).eq('id', shop.id).select().single()
  if (error) throw error
  return data
}
// logoFile / coverFile: a File to replace the picture, or null to leave it. removeCover() clears the cover.
export async function updateShop(shop, form, logoFile, coverFile) {
  need(); const c = cleanShop(form); checkShop(c)
  const patch = { ...c }
  if (logoFile) patch.logo_url = await uploadImage(shop.id, logoFile, 600)
  if (coverFile) patch.cover_url = await uploadImage(shop.id, coverFile, 1800)
  const { data, error } = await supabase.from('shops').update(patch).eq('id', shop.id).select().single()
  if (error) throw error
  return data
}
export async function removeCover(shop) {
  need()
  const { data, error } = await supabase.from('shops').update({ cover_url: null }).eq('id', shop.id).select().single()
  if (error) throw error
  return data
}
export async function uploadImage(shopId, file, maxDim = 1600) {
  need(); checkFile(file)
  const o = await prepareImage(file, maxDim)
  const path = `shops/${shopId}/${Date.now()}-${rand()}.${o.ext}`
  const { error } = await supabase.storage.from('media').upload(path, o.blob, { contentType: o.type, cacheControl: '31536000' })
  if (error) throw error
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl
}
export async function getCategoriesList() {
  need(); const { data } = await supabase.from('categories').select('id,name,icon').order('created_at'); return data || []
}
export async function myProducts(shopId) {
  need()
  const { data, error } = await supabase.from('products').select('*').eq('shop_id', shopId).order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}
export const PHOTOS = 4
// Photos already saved on a product (older products only have the single cover image_url).
export const existingImages = p => (Array.isArray(p?.images) && p.images.filter(Boolean).length ? p.images.filter(Boolean) : p?.image_url ? [p.image_url] : [])
// photos: array of 4 slots (File or null). Pass null to leave a product's photos untouched (e.g. hide/show toggle).
export async function saveProduct(shop, form, photos, existing) {
  need()
  const price = Number(form.price), stock = parseInt(form.stock, 10)
  if (s(form.name, 120).length < 2) throw new Error('Product name is required.')
  if (!form.category_id) throw new Error('Choose a category.')
  if (!Number.isFinite(price) || price <= 0 || price > 10000000) throw new Error('Enter a valid price.')
  if (!Number.isInteger(stock) || stock < 0 || stock > 100000) throw new Error('Enter a valid stock quantity.')
  const row = { name: s(form.name, 120), brand: s(form.brand, 60) || null, tag: s(form.tag, 30) || null, category_id: form.category_id, price, stock, is_active: form.is_active !== false }
  if (photos) {
    const old = existingImages(existing)
    const slots = Array.from({ length: PHOTOS }, (_, i) => photos[i] || null)
    if (slots.some((f, i) => !f && !old[i])) throw new Error(`Add all ${PHOTOS} product photos.`)
    slots.forEach(f => f && checkFile(f))
    const urls = await Promise.all(slots.map((f, i) => (f ? uploadImage(shop.id, f) : old[i])))
    row.images = urls
    row.image_url = urls[0]
  }
  // Flash deal: only touched when the form sends dealPrice (so the hide/show toggle never resets a running deal).
  // price = live price, old_price = regular price shown crossed out, deal_ends_at = when the price goes back.
  if ('dealPrice' in form) {
    const dp = form.dealPrice === '' || form.dealPrice == null ? null : Number(form.dealPrice)
    if (dp == null) { row.old_price = null; row.deal_ends_at = null }
    else {
      const end = new Date(form.dealEnds)
      if (!Number.isFinite(dp) || dp <= 0 || dp >= price) throw new Error('Deal price must be lower than the regular price.')
      if (!form.dealEnds || isNaN(end) || end.getTime() <= Date.now() + 60000) throw new Error('Choose a deal end time in the future.')
      if (end.getTime() > Date.now() + 30 * 864e5) throw new Error('A deal can run for up to 30 days.')
      row.old_price = price; row.price = dp; row.deal_ends_at = end.toISOString()
    }
  }
  if (existing) {
    const { data, error } = await supabase.from('products').update(row).eq('id', existing.id).eq('shop_id', shop.id).select().single()
    if (error) throw error; return data
  }
  if (!photos) throw new Error(`Add ${PHOTOS} product photos.`)
  const { data, error } = await supabase.from('products').insert({ ...row, shop_id: shop.id, variants: [{ label: 'Standard', mult: 1 }], features: [] }).select().single()
  if (error) throw error
  return data
}
export async function deleteProduct(shop, id) {
  need(); const { error } = await supabase.from('products').delete().eq('id', id).eq('shop_id', shop.id); if (error) throw error
}
export async function sellerOrders() {
  need(); const { data, error } = await supabase.rpc('seller_orders'); if (error) throw error; return data || []
}
export async function sellerQuestions() {
  need(); const { data, error } = await supabase.rpc('seller_questions'); if (error) throw error; return data || []
}
export async function answerQuestion(id, answer) {
  need(); const { error } = await supabase.rpc('answer_question', { p_id: id, p_answer: s(answer, 600) })
  if (error) throw new Error(/answer must|own products|not found|sign in/i.test(error.message) ? error.message : 'Could not save your answer. Please try again.')
}
