
// =====================================================================
// Bangladeshi NID helpers, shared by the Seller Centre and the Rider app.
// A Bangladeshi NID number has 10 digits (smart card), 13 digits (old card)
// or 17 digits (old card with the birth year in front).
// =====================================================================
const BN = '০১২৩৪৫৬৭৮৯'

// Bangla digits become English digits; spaces, dashes and anything else are removed.
export const cleanNid = v => String(v ?? '')
  .replace(/[০-৯]/g, d => String(BN.indexOf(d)))
  .replace(/\D/g, '')
  .slice(0, 17)

// Accepts the raw input (with spaces or dashes) as well as an already cleaned number.
export const validNid = v => {
  const raw = String(v ?? '').replace(/[০-৯]/g, d => String(BN.indexOf(d))).replace(/[\s-]/g, '')
  return /^(\d{10}|\d{13}|\d{17})$/.test(raw)
}
