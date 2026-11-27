import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Security headers for every page and file that `vite preview` serves (your live site).
// Step 1: keep CSP as "Report-Only" and test. Step 2: rename it to "Content-Security-Policy".
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.supabase.co https://*.tile.openstreetmap.org",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-src https://maps.google.com https://www.google.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

const SECURITY_HEADERS = {
  'Content-Security-Policy-Report-Only': CSP,
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(self), camera=(), microphone=(), payment=()',
}

export default defineConfig({
  plugins: [react()],
  preview: {
    headers: SECURITY_HEADERS,
    // Only answer requests for your own domain (was `true` = any domain, which allows DNS-rebinding tricks).
    // If you also open the site through your host's own address (e.g. something.up.railway.app), add it here.
    allowedHosts: ['pinkish.shop', 'www.pinkish.shop'],
  },
  build: { sourcemap: false }, // do not publish your original source code
})
