// WhatsApp URL Preparation & Plain-Text Generator
// Strictly user-initiated click; never automatic send; never transmits order to server.

import { formatPrice } from '../shared/format.js';

/**
 * Builds the plain-text delivery order message.
 * @param {Object} options
 * @param {Array} options.items List of resolved product items with name, qty, price
 * @param {number} options.subtotal
 * @param {string} options.customerName
 * @param {string} options.customerPhone
 * @param {string} options.deliveryAddress
 * @param {string} [options.mapsUrl]
 * @param {string} [options.deliveryNotes]
 * @param {string} [options.lang='ar']
 * @returns {string}
 */
export function buildDeliveryMessage({
  items,
  subtotal,
  customerName,
  customerPhone,
  deliveryAddress,
  mapsUrl = '',
  deliveryNotes = '',
  lang = 'ar',
}) {
  const isAr = lang === 'ar';
  const title = isAr
    ? 'طلب دليفري جديد — رسن | كافيه ومطعم'
    : 'New Delivery Order — RASAN Café & Restaurant';

  const itemLines = items
    .map((item, idx) => {
      const name = isAr ? item.product.name_ar : item.product.name_en;
      const lineTotal = formatPrice(item.product.price_iqd * item.quantity, lang);
      const noteStr = item.note ? (isAr ? ` (ملاحظة: ${item.note})` : ` (Note: ${item.note})`) : '';
      return `${idx + 1}) ${name} × ${item.quantity}${noteStr} — ${lineTotal}`;
    })
    .join('\n');

  const totalLine = isAr
    ? `الإجمالي قبل أجور التوصيل: ${formatPrice(subtotal, 'ar')}`
    : `Total before delivery fee: ${formatPrice(subtotal, 'en')}`;

  const feeNote = isAr
    ? 'أجور التوصيل والسعر النهائي يتم تأكيدهما من قبل المطعم.'
    : 'Delivery fee and final total are confirmed by the restaurant.';

  const details = [
    isAr ? `الاسم: ${customerName}` : `Name: ${customerName}`,
    isAr ? `الهاتف: ${customerPhone}` : `Phone: ${customerPhone}`,
    isAr ? `العنوان: ${deliveryAddress}` : `Address: ${deliveryAddress}`,
    mapsUrl ? (isAr ? `الموقع على الخريطة: ${mapsUrl}` : `Map Location: ${mapsUrl}`) : '',
    deliveryNotes ? (isAr ? `ملاحظات: ${deliveryNotes}` : `Notes: ${deliveryNotes}`) : '',
  ]
    .filter(Boolean)
    .join('\n');

  return `${title}\n\n${itemLines}\n\n${totalLine}\n${feeNote}\n\n${details}`;
}

/**
 * Creates the safe wa.me link with encoded text.
 * @param {string} waNumber Clean digits without +
 * @param {string} message Plain text message
 * @returns {string}
 */
export function buildWhatsAppLink(waNumber, message) {
  const cleanNumber = (waNumber || '').replace(/[^0-9]/g, '');
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${cleanNumber}?text=${encoded}`;
}
