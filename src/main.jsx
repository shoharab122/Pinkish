import React from 'react'
import { createRoot } from 'react-dom/client'
const root = createRoot(document.getElementById('root'))
const path = location.pathname
// open the connection to the database early, so the first request does not wait for the handshake
try { const u = import.meta.env.VITE_SUPABASE_URL; if (u) { const l = document.createElement('link'); l.rel = 'preconnect'; l.href = new URL(u).origin; l.crossOrigin = ''; document.head.appendChild(l) } } catch { /* ignore */ }
// Seller Centre and admin use the Zilla Slab heading font. It loads without blocking the page,
// and if it cannot load (slow or blocked network) the page still works with the fallback font.
if (path.startsWith('/merchant') || path.startsWith('/adminmainpath')) try {
  const f = document.createElement('link'); f.rel = 'stylesheet'; f.href = 'https://fonts.googleapis.com/css2?family=Zilla+Slab:wght@500;600;700&display=swap'; f.media = 'print'; f.onload = () => { f.media = 'all' }; document.head.appendChild(f)
} catch { /* ignore */ }
// A seller who signed in with Google can be sent back to the site root by the auth provider.
// We remember where they started and bring them (and the login tokens in the URL) back to /merchant.
let fromSeller = false
try { fromSeller = sessionStorage.getItem('pk_seller') === '1' } catch { /* storage unavailable */ }
if (fromSeller && !path.startsWith('/merchant') && !path.startsWith('/admin') && /access_token=|[?&]code=|error_description=/.test(location.hash + location.search)) {
  location.replace('/merchant' + location.search + location.hash)
} else
if (path.startsWith('/adminmainpath')) import('./admin/Admin.jsx').then(m => root.render(<m.default />))
else if (path.startsWith('/merchant')) import('./seller/Seller.jsx').then(m => root.render(<m.default />))
else Promise.all([import('./App.jsx'), import('./styles.css')]).then(([m]) => root.render(<m.default />))