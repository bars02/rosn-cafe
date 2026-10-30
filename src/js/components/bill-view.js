// Waiter Bill Preview Component (Dine-in)
// Read-only bill for the captain. Never submits to database.

import { t, getCurrentLang } from '../shared/i18n.js';
import { formatPrice } from '../shared/format.js';
import { openModal, closeModal, escapeHtml } from '../shared/dom.js';

let billModalEl = null;

export function initBillView() {
  billModalEl = document.getElementById('bill-dialog');
  if (!billModalEl) return;

  const closeBtn = billModalEl.querySelector('[data-action="close"]');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeModal(billModalEl));
  }

  const printBtn = billModalEl.querySelector('[data-action="print"]');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.print();
    });
  }

  const backBtn = billModalEl.querySelector('[data-action="back-to-cart"]');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      closeModal(billModalEl);
      const cartModal = document.getElementById('cart-dialog');
      if (cartModal) openModal(cartModal);
    });
  }

  billModalEl.addEventListener('click', (e) => {
    if (e.target === billModalEl) {
      closeModal(billModalEl);
    }
  });
}

/**
 * Opens the Waiter Bill modal with resolved items
 * @param {Array} items
 * @param {number} subtotal
 * @param {string} tableNumber
 */
export function openBillView(items, subtotal, tableNumber = '') {
  if (!billModalEl) return;

  const lang = getCurrentLang();
  const isAr = lang === 'ar';

  const tableBadge = billModalEl.querySelector('.bill-table-number-text');
  if (tableBadge) {
    if (tableNumber) {
      tableBadge.textContent = `${t('billTableLabel')} ${tableNumber}`;
      tableBadge.style.display = 'inline-block';
    } else {
      tableBadge.style.display = 'none';
    }
  }

  const tbody = billModalEl.querySelector('.bill-table-body');
  if (tbody) {
    tbody.innerHTML = '';
    items.forEach((item) => {
      const tr = document.createElement('tr');
      const name = isAr ? item.product.name_ar : item.product.name_en;
      const linePrice = formatPrice(item.product.price_iqd * item.quantity, lang);
      const noteHtml = item.note ? `<div style="font-size:0.75rem; color:var(--muted)">(${escapeHtml(item.note)})</div>` : '';

      tr.innerHTML = `
        <td><strong>${escapeHtml(name)}</strong>${noteHtml}</td>
        <td class="col-num">${item.quantity}</td>
        <td class="col-num tabular-nums">${linePrice}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  const totalEl = billModalEl.querySelector('.bill-total-amount');
  if (totalEl) {
    totalEl.textContent = formatPrice(subtotal, lang);
  }

  openModal(billModalEl);
}
