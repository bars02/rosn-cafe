// Price & String Formatting Helpers
const priceFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

/**
 * Formats an integer IQD price with localized currency tag.
 * @param {number} amount
 * @param {string} lang 'ar' or 'en'
 * @returns {string}
 */
export function formatPrice(amount, lang = 'ar') {
  const numeric = priceFormatter.format(Math.round(amount || 0));
  if (lang === 'ar') {
    return `${numeric} د.ع`;
  }
  return `IQD ${numeric}`;
}

/**
 * Safely normalizes Arabic text for insensitive search:
 * removes tashkeel (diacritics), normalizes alef, taa marbuta, etc.
 * @param {string} text
 * @returns {string}
 */
export function normalizeSearchText(text) {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    // remove Arabic diacritics
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // normalize Alefs
    .replace(/[أإآ]/g, 'ا')
    // normalize Taa Marbuta / Haa
    .replace(/ة/g, 'ه')
    // normalize Yaa / Alef Maksura
    .replace(/ى/g, 'ي')
    .trim();
}

/**
 * Sanitizes phone number string to international digits only.
 * @param {string} phone
 * @returns {string}
 */
export function sanitizePhoneDigits(phone) {
  if (!phone) return '';
  return phone.replace(/[^0-9]/g, '');
}

/**
 * Validates external URL allowlist (Google Maps, Instagram, Facebook, TikTok)
 * @param {string} url
 * @returns {boolean}
 */
export function isValidHttpsUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
