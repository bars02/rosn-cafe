// Cart Sheet & Delivery Handoff Component — Real Live Database Reconciliation
import { t, getCurrentLang } from '../shared/i18n.js';
import { formatPrice } from '../shared/format.js';
import { openModal, closeModal, showToast, escapeHtml } from '../shared/dom.js';
import {
  getCart,
  subscribeToCart,
  updateQuantity,
  updateNote,
  removeFromCart,
  clearCart,
  syncCartLinePrice,
  purgeDeletedProducts,
} from '../services/cart.js';
import { mockProducts, mockSiteSettings } from '../mock/data.js';
import { fetchProductsByIds } from '../services/menu-api.js';
import { openBillView } from './bill-view.js';
import { buildDeliveryMessage, buildWhatsAppLink } from '../services/whatsapp.js';

let cartDialogEl = null;
let currentMode = 'dine-in'; // 'dine-in' | 'delivery'
let capturedMapsUrl = '';
let activeProductList = mockProducts;
let activeSiteSettings = mockSiteSettings;

export function setActiveProducts(products) {
  if (Array.isArray(products)) {
    activeProductList = products;
    purgeDeletedProducts(products);
    renderCart();
  }
}

export function setActiveSettings(settings) {
  if (settings && typeof settings === 'object') {
    activeSiteSettings = settings;
  }
}

export function initCartSheet() {
  cartDialogEl = document.getElementById('cart-dialog');
  if (!cartDialogEl) return;

  // Close actions
  const closeBtn = cartDialogEl.querySelector('[data-action="close"]');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeModal(cartDialogEl));
  }

  cartDialogEl.addEventListener('click', (e) => {
    if (e.target === cartDialogEl) {
      closeModal(cartDialogEl);
    }
  });

  // Segmented mode switcher
  const modeDineInBtn = cartDialogEl.querySelector('[data-mode="dine-in"]');
  const modeDeliveryBtn = cartDialogEl.querySelector('[data-mode="delivery"]');

  if (modeDineInBtn && modeDeliveryBtn) {
    modeDineInBtn.addEventListener('click', () => switchMode('dine-in'));
    modeDeliveryBtn.addEventListener('click', () => switchMode('delivery'));
  }

  // Clear cart button
  const clearBtn = cartDialogEl.querySelector('[data-action="clear-cart"]');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (confirm(t('confirmClearCart'))) {
        clearCart();
        showToast(t('emptyCart'));
      }
    });
  }

  // Waiter bill button (Phase 3 reconciliation)
  const showBillBtn = cartDialogEl.querySelector('[data-action="show-bill"]');
  if (showBillBtn) {
    showBillBtn.addEventListener('click', async () => {
      showBillBtn.disabled = true;
      showBillBtn.textContent = t('loading');

      try {
        const reconciliation = await validateAndReconcileCart();
        if (!reconciliation.valid) {
          showToast(reconciliation.error, 'error', 5000);
          if (reconciliation.reconfirmRequired) {
            renderCart();
          }
          return;
        }

        closeModal(cartDialogEl);
        openBillView(reconciliation.items, reconciliation.subtotal);
      } finally {
        showBillBtn.disabled = false;
        showBillBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          <span>${t('showWaiterBill')}</span>
        `;
      }
    });
  }

  // Geolocation trigger
  const useLocationBtn = cartDialogEl.querySelector('[data-action="use-location"]');
  const locationMsg = cartDialogEl.querySelector('.location-success-msg');
  const mapsInput = cartDialogEl.querySelector('#delivery-maps-input');

  if (useLocationBtn) {
    useLocationBtn.addEventListener('click', () => {
      if (!navigator.geolocation) {
        showToast(t('locationError'), 'error');
        return;
      }
      useLocationBtn.disabled = true;
      useLocationBtn.textContent = t('loading');

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          useLocationBtn.disabled = false;
          useLocationBtn.textContent = t('useMyLocation');
          const lat = pos.coords.latitude.toFixed(6);
          const lng = pos.coords.longitude.toFixed(6);
          capturedMapsUrl = `https://maps.google.com/?q=${lat},${lng}`;
          if (mapsInput) mapsInput.value = capturedMapsUrl;
          if (locationMsg) {
            locationMsg.textContent = t('locationShared');
            locationMsg.style.display = 'block';
          }
          showToast(t('locationShared'), 'success');
        },
        (err) => {
          useLocationBtn.disabled = false;
          useLocationBtn.textContent = t('useMyLocation');
          console.warn('Geolocation denied or error:', err);
          showToast(t('locationError'), 'error');
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  }

  // WhatsApp open handoff (Phase 4 reconciliation)
  const openWhatsAppBtn = cartDialogEl.querySelector('[data-action="open-whatsapp"]');
  const copyMsgBtn = cartDialogEl.querySelector('[data-action="copy-message"]');

  if (openWhatsAppBtn) {
    openWhatsAppBtn.addEventListener('click', async () => {
      // Check if delivery is enabled in site settings
      if (activeSiteSettings && activeSiteSettings.delivery_enabled === false) {
        showToast(
          getCurrentLang() === 'ar'
            ? 'خدمة التوصيل غير مفعلة حالياً من قبل المطعم.'
            : 'Delivery service is currently disabled by the restaurant.',
          'error'
        );
        return;
      }

      const waNumber = activeSiteSettings?.whatsapp_number;
      if (!waNumber || waNumber.replace(/[^0-9]/g, '').length < 8) {
        showToast(
          getCurrentLang() === 'ar'
            ? 'رقم واتساب غير متوفر حالياً لتلقي الطلبات.'
            : 'WhatsApp number is currently not configured.',
          'error'
        );
        return;
      }

      openWhatsAppBtn.disabled = true;
      try {
        const reconciliation = await validateAndReconcileCart();
        if (!reconciliation.valid) {
          showToast(reconciliation.error, 'error', 5000);
          if (reconciliation.reconfirmRequired) {
            renderCart();
          }
          return;
        }

        const nameInput = cartDialogEl.querySelector('#delivery-name-input');
        const phoneInput = cartDialogEl.querySelector('#delivery-phone-input');
        const addrInput = cartDialogEl.querySelector('#delivery-address-input');
        const notesInput = cartDialogEl.querySelector('#delivery-notes-input');

        const name = nameInput ? nameInput.value.trim() : '';
        const phone = phoneInput ? phoneInput.value.trim() : '';
        const addr = addrInput ? addrInput.value.trim() : '';
        const notes = notesInput ? notesInput.value.trim() : '';
        const mapsUrl = mapsInput ? mapsInput.value.trim() : capturedMapsUrl;

        if (!name || name.length < 2 || name.length > 80) {
          showToast(t('deliveryName') + ' مطلوب (2-80 حرف)', 'error');
          if (nameInput) nameInput.focus();
          return;
        }
        if (!phone || phone.replace(/[^0-9]/g, '').length < 7) {
          showToast(t('deliveryPhone') + ' مطلوب (أرقام فقط)', 'error');
          if (phoneInput) phoneInput.focus();
          return;
        }
        if (!addr || addr.length < 5 || addr.length > 300) {
          showToast(t('deliveryAddress') + ' مطلوب (10-300 حرف)', 'error');
          if (addrInput) addrInput.focus();
          return;
        }

        const msg = buildDeliveryMessage({
          items: reconciliation.items,
          subtotal: reconciliation.subtotal,
          customerName: name,
          customerPhone: phone,
          deliveryAddress: addr,
          mapsUrl,
          deliveryNotes: notes.slice(0, 250),
          lang: getCurrentLang(),
        });

        const waLink = buildWhatsAppLink(waNumber, msg);

        // Explicit user action opens link in blank window
        window.open(waLink, '_blank', 'noopener,noreferrer');
        showToast(t('whatsappWarning'), 'info', 5000);
      } finally {
        openWhatsAppBtn.disabled = false;
      }
    });
  }

  if (copyMsgBtn) {
    copyMsgBtn.addEventListener('click', async () => {
      const reconciliation = await validateAndReconcileCart();
      if (!reconciliation.valid) {
        showToast(reconciliation.error, 'error');
        return;
      }

      const nameInput = cartDialogEl.querySelector('#delivery-name-input');
      const phoneInput = cartDialogEl.querySelector('#delivery-phone-input');
      const addrInput = cartDialogEl.querySelector('#delivery-address-input');
      const notesInput = cartDialogEl.querySelector('#delivery-notes-input');

      const msg = buildDeliveryMessage({
        items: reconciliation.items,
        subtotal: reconciliation.subtotal,
        customerName: nameInput ? nameInput.value.trim() : 'Guest',
        customerPhone: phoneInput ? phoneInput.value.trim() : '',
        deliveryAddress: addrInput ? addrInput.value.trim() : '',
        mapsUrl: mapsInput ? mapsInput.value.trim() : capturedMapsUrl,
        deliveryNotes: notesInput ? notesInput.value.trim() : '',
        lang: getCurrentLang(),
      });

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(msg).then(() => {
          showToast(t('copied'), 'success');
        });
      } else {
        showToast(t('copied'), 'info');
      }
    });
  }

  subscribeToCart(() => {
    renderCart();
  });
}

/**
 * Validates and reconciles cart items against authoritative live Supabase data.
 * Checks for:
 * 1. Product existence in database.
 * 2. Availability (is_available = true).
 * 3. Status (status = published).
 * 4. Price changes between addition time and current server price.
 */
export async function validateAndReconcileCart() {
  const cart = getCart();
  const lang = getCurrentLang();
  const isAr = lang === 'ar';

  if (!cart.lines || cart.lines.length === 0) {
    return { valid: false, error: t('emptyCart') };
  }

  const productIds = cart.lines.map((l) => l.productId);
  let liveProds = await fetchProductsByIds(productIds);

  if (!liveProds || liveProds.length === 0) {
    liveProds = activeProductList.filter((p) => productIds.includes(p.id));
    if (!liveProds || liveProds.length === 0) {
      return {
        valid: false,
        error: isAr
          ? 'تعذر التحقق من توفر الأصناف والأسعار الحالية من الخادم. يرجى إعادة المحاولة.'
          : 'Could not verify current product availability and prices. Please retry.',
      };
    }
  }

  for (const line of cart.lines) {
    const liveProd = liveProds.find((p) => p.id === line.productId);
    const prodName = liveProd
      ? isAr
        ? liveProd.name_ar
        : liveProd.name_en || liveProd.name_ar
      : 'الصنف';

    // Availability / existence check
    if (!liveProd || !liveProd.is_available || liveProd.status !== 'published') {
      return {
        valid: false,
        error: isAr
          ? `الصنف «${prodName}» لم يعد متوفراً حالياً. يرجى حذفه من السلة للمتابعة.`
          : `Item "${prodName}" is no longer available. Please remove it from the cart to continue.`,
      };
    }

    // Authoritative Price check
    if (line.priceAtAddIqd && line.priceAtAddIqd !== liveProd.price_iqd) {
      const oldPrice = formatPrice(line.priceAtAddIqd, lang);
      const newPrice = formatPrice(liveProd.price_iqd, lang);
      syncCartLinePrice(line.productId, liveProd.price_iqd);
      return {
        valid: false,
        reconfirmRequired: true,
        error: isAr
          ? `تغير سعر «${prodName}» من ${oldPrice} إلى ${newPrice}. تم تحديث السعر، يرجى إعادة التأكيد قبل المتابعة.`
          : `Price for "${prodName}" changed from ${oldPrice} to ${newPrice}. Price updated, please tap to confirm.`,
      };
    }
  }

  const { items, subtotal } = resolveCartItems(liveProds);
  return { valid: true, items, subtotal };
}

function switchMode(mode) {
  currentMode = mode;
  if (!cartDialogEl) return;

  const modeDineInBtn = cartDialogEl.querySelector('[data-mode="dine-in"]');
  const modeDeliveryBtn = cartDialogEl.querySelector('[data-mode="delivery"]');
  const dineInPanel = cartDialogEl.querySelector('#cart-dinein-section');
  const deliveryPanel = cartDialogEl.querySelector('#cart-delivery-section');

  if (mode === 'dine-in') {
    modeDineInBtn?.classList.add('is-active');
    modeDeliveryBtn?.classList.remove('is-active');
    if (dineInPanel) dineInPanel.style.display = 'block';
    if (deliveryPanel) deliveryPanel.style.display = 'none';
  } else {
    modeDeliveryBtn?.classList.add('is-active');
    modeDineInBtn?.classList.remove('is-active');
    if (dineInPanel) dineInPanel.style.display = 'none';
    if (deliveryPanel) deliveryPanel.style.display = 'block';
  }
}

export function resolveCartItems(productsOverride = null) {
  const products = productsOverride || activeProductList || mockProducts;
  const cart = getCart();
  let subtotal = 0;
  const items = [];

  cart.lines.forEach((line) => {
    const product = products.find((p) => p.id === line.productId);
    if (product) {
      const lineTotal = product.price_iqd * line.quantity;
      subtotal += lineTotal;
      items.push({
        line,
        product,
        quantity: line.quantity,
        note: line.note,
      });
    }
  });

  return { items, subtotal };
}

export function renderCart() {
  if (!cartDialogEl) return;

  const lang = getCurrentLang();
  const isAr = lang === 'ar';
  const { items, subtotal } = resolveCartItems();

  const itemsListEl = cartDialogEl.querySelector('.cart-items-list');
  const emptyStateEl = cartDialogEl.querySelector('.cart-empty-state');
  const contentWrapper = cartDialogEl.querySelector('.cart-has-items-wrapper');
  const subtotalEls = cartDialogEl.querySelectorAll('.cart-subtotal-amount');

  if (items.length === 0) {
    if (itemsListEl) itemsListEl.innerHTML = '';
    if (emptyStateEl) emptyStateEl.style.display = 'block';
    if (contentWrapper) contentWrapper.style.display = 'none';
    subtotalEls.forEach((el) => (el.textContent = formatPrice(0, lang)));
    return;
  }

  if (emptyStateEl) emptyStateEl.style.display = 'none';
  if (contentWrapper) contentWrapper.style.display = 'block';
  subtotalEls.forEach((el) => (el.textContent = formatPrice(subtotal, lang)));

  if (itemsListEl) {
    itemsListEl.innerHTML = '';
    items.forEach((item) => {
      const itemRow = document.createElement('div');
      itemRow.className = 'cart-item-row';
      const name = isAr ? item.product.name_ar : item.product.name_en || item.product.name_ar;
      const unitPrice = formatPrice(item.product.price_iqd, lang);

      itemRow.innerHTML = `
        <div class="cart-item-main">
          <div>
            <div class="cart-item-title">${escapeHtml(name)}</div>
            <div class="cart-item-price tabular-nums">${unitPrice}</div>
          </div>
          <button class="cart-item-remove-btn" data-remove="${item.product.id}" aria-label="${t('delete')}">
            ${t('delete')}
          </button>
        </div>
        <div class="cart-item-controls">
          <div class="qty-stepper">
            <button class="qty-btn" data-minus="${item.product.id}" aria-label="Decrease quantity">-</button>
            <span class="qty-display">${item.quantity}</span>
            <button class="qty-btn" data-plus="${item.product.id}" aria-label="Increase quantity">+</button>
          </div>
          <input
            type="text"
            class="cart-item-note-input"
            placeholder="${t('itemNote')}"
            maxlength="120"
            value="${item.note ? item.note.replace(/"/g, '&quot;') : ''}"
            data-note="${item.product.id}"
          />
        </div>
      `;

      const removeBtn = itemRow.querySelector('[data-remove]');
      const minusBtn = itemRow.querySelector('[data-minus]');
      const plusBtn = itemRow.querySelector('[data-plus]');
      const noteInput = itemRow.querySelector('[data-note]');

      removeBtn?.addEventListener('click', () => removeFromCart(item.product.id));
      minusBtn?.addEventListener('click', () => updateQuantity(item.product.id, item.quantity - 1));
      plusBtn?.addEventListener('click', () => updateQuantity(item.product.id, item.quantity + 1));
      noteInput?.addEventListener('change', (e) => updateNote(item.product.id, e.target.value));

      itemsListEl.appendChild(itemRow);
    });
  }
}

export function openCartSheet(mode = 'dine-in') {
  if (!cartDialogEl) return;
  switchMode(mode);
  renderCart();
  openModal(cartDialogEl);
}
