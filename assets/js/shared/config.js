/**
 * Public settings. The publishable key is designed to live in the browser:
 * the database access rules (see supabase/schema.sql) protect the data.
 * Never put the secret key (sb_secret_...) in any file of this project.
 */
export const CFG = Object.freeze({
  url: "https://mfmvoulqbzbptpvbiiok.supabase.co",
  key: "sb_publishable_PDUvnwzN5_sNMYCqLGt7BA_CaBkSS1r",
  bucket: "flower-photos",
  /** Public address of the site, used in the order links sent on WhatsApp. Empty = current address. */
  siteUrl: "https://yehiaflowers.vercel.app",
  /** Fallback WhatsApp number. The owner normally sets it in Admin > Settings. */
  whatsapp: "",
});
