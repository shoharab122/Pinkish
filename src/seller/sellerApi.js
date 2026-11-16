import { supabase } from '../api.js'

const s = (v, m = 200) => String(v ?? '').trim().slice(0, m)
const need = () => { if (!supabase) throw new Error('The store is not configured. Please try again later.') }
const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(3)), b => b.toString(16).padStart(2, '0')).join('')
const ext = f => ((f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5)) || 'jpg'
const slugify = n => (s(n, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'shop') + '-' + rand()
export const validNid = n => /^(\d{10}|\d{13}|\d{17})$/.test(String(n || '').replace(/[\s-]/g, ''))
const nidOf = f => s(f?.nid, 20).replace(/[\s-]/g, '')
export const validPhone = p => /^(\+?88)?01[3-9]\d{8}$/.test(String(p || '').replace(/[\s-]/g, ''))

function checkFile(f, { doc = false } = {}) {
  const ok = ['image/jpeg', 'image/png', 'image/webp', ...(doc ? ['application/pdf'] : [])]
  if (!f || !ok.includes(f.type)) throw new Error(doc ? 'Upload a JPG, PNG, WebP or PDF file.' : 'Upload a JPG, PNG or WebP image.')
  if (f.size > (doc ? 5 : 3) * 1024 * 1024) throw new Error(`File is too large (max ${doc ? 5 : 3} MB).`)
}
const cleanShop = f => ({ name: s(f.name, 60), description: s(f.description, 500), phone: s(f.phone, 20), address: s(f.address, 300), city: s(f.city, 60) })
function checkShop(c) {
  if (c.name.length < 3) throw new Error('Shop name must be at least 3 characters.')
  if (!validPhone(c.phone)) throw new Error('Enter a valid Bangladeshi mobile number.')
  if (c.address.length < 8) throw new Error('Enter your full business address.')
}
async function uploadDoc(uid, file) {
  checkFile(file, { doc: true })
  const path = `${uid}/${Date.now()}-id.${ext(file)}`
  const { error } = await supabase.storage.from('seller-docs').upload(path, file, { contentType: file.type })
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
export async function updateShop(shop, form, logoFile) {
  need(); const c = cleanShop(form); checkShop(c)
  const patch = { ...c }
  if (logoFile) patch.logo_url = await uploadImage(shop.id, logoFile)
  const { data, error } = await supabase.from('shops').update(patch).eq('id', shop.id).select().single()
  if (error) throw error
  return data
}
export async function uploadImage(shopId, file) {
  need(); checkFile(file)
  const path = `shops/${shopId}/${Date.now()}-${rand()}.${ext(file)}`
  const { error } = await supabase.storage.from('media').upload(path, file, { contentType: file.type, cacheControl: '31536000' })
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
export async function saveProduct(shop, form, imageFile, existing) {
  need()
  const price = Number(form.price), stock = parseInt(form.stock, 10)
  if (s(form.name, 120).length < 2) throw new Error('Product name is required.')
  if (!form.category_id) throw new Error('Choose a category.')
  if (!Number.isFinite(price) || price <= 0 || price > 10000000) throw new Error('Enter a valid price.')
  if (!Number.isInteger(stock) || stock < 0 || stock > 100000) throw new Error('Enter a valid stock quantity.')
  const row = { name: s(form.name, 120), brand: s(form.brand, 60) || null, tag: s(form.tag, 30) || null, category_id: form.category_id, price, stock, is_active: form.is_active !== false }
  if (imageFile) row.image_url = await uploadImage(shop.id, imageFile)
  if (existing) {
    const { data, error } = await supabase.from('products').update(row).eq('id', existing.id).eq('shop_id', shop.id).select().single()
    if (error) throw error; return data
  }
  if (!imageFile) throw new Error('Add a product photo.')
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