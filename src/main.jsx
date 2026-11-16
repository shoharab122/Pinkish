import React from 'react'
import { createRoot } from 'react-dom/client'
const root = createRoot(document.getElementById('root'))
const path = location.pathname
// A seller who signed in with Google can be sent back to the site root by the auth provider.
// We remember where they started and bring them (and the login tokens in the URL) back to /merchant.
let fromSeller = false
try { fromSeller = sessionStorage.getItem('pk_seller') === '1' } catch { /* storage unavailable */ }
if (fromSeller && !path.startsWith('/merchant') && !path.startsWith('/admin') && /access_token=|[?&]code=|error_description=/.test(location.hash + location.search)) {
  location.replace('/merchant' + location.search + location.hash)
} else
if (path.startsWith('/admin')) import('./admin/Admin.jsx').then(m => root.render(<m.default />))
else if (path.startsWith('/merchant')) import('./seller/Seller.jsx').then(m => root.render(<m.default />))
else Promise.all([import('./App.jsx'), import('./styles.css')]).then(([m]) => root.render(<m.default />))