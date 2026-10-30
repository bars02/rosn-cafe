// Product Detail Bottom Sheet / Dialog with Modifiers & Special Notes
import { t, getCurrentLang } from '../shared/i18n.js';
import { formatPrice } from '../shared/format.js';
import { openModal, closeModal, showToast } from '../shared/dom.js';
import { addToCart } from '../services/cart.js';

let dialogEl = null;
let currentProduct = null;
let qty = 1;

export function initProductDialog() {
  dialogEl = document.getElementById('product-dialog');
  if (!dialogEl) return;

  dialogEl.querySelectorAll('[data-action="close"]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(dialogEl));
  });

  // Click outside overlay to close
  dialogEl.addEventListener('click', (e) => {
    if (e.target === dialogEl) {
      closeModal(dialogEl);
    }
  });

  const minusBtn = dialogEl.querySelector('[data-action="minus"]');
  const plusBtn = dialogEl.querySelector('[data-action="plus"]');
  const qtyDisplay = dialogEl.querySelector('.modal-qty-display');
  const addBtn = dialogEl.querySelector('[data-action="add-to-cart"]');

  if (minusBtn) {
    minusBtn.addEventListener('click', () => {
      if (qty > 1) {
        qty--;
        if (qtyDisplay) qtyDisplay.textContent = qty;
      }
    });
  }

  if (plusBtn) {
    plusBtn.addEventListener('click', () => {
      if (qty < 20) {
        qty++;
        if (qtyDisplay) qtyDisplay.textContent = qty;
      }
    });
  }

  // Setup Option Pills (تحديد الخيارات والتفضيلات)
  const optionPills = dialogEl.querySelectorAll('.option-pill');
  optionPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      // Toggle selection or switch
      pill.classList.toggle('is-active');
    });
  });

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      if (!currentProduct || !currentProduct.is_available) return;

      // Collect chosen option pills
      const selectedPills = Array.from(dialogEl.querySelectorAll('.option-pill.is-active'))
        .map((p) => p.getAttribute('data-option') || p.textContent.trim())
        .filter(Boolean);

      // Collect custom written note
      const noteInput = dialogEl.querySelector('#product-note-input');
      const customNote = noteInput ? noteInput.value.trim() : '';

      const combinedNote = [...selectedPills, customNote].filter(Boolean).join(' | ');

      addToCart(currentProduct.id, currentProduct.price_iqd, qty, combinedNote);
      showToast(t('addedToCart'), 'success');
      closeModal(dialogEl);
    });
  }
}

function getOptionsForProduct(product) {
  if (Array.isArray(product.options) && product.options.length > 0) {
    return product.options;
  }

  const text = `${product.name_ar || ''} ${product.description_ar || ''} ${product.name_en || ''}`.toLowerCase();

  if (text.includes('شاي') || text.includes('قهوة') || text.includes('كوفي') || text.includes('لاتيه') || text.includes('coffee') || text.includes('tea')) {
    return ['ساخن / هوت ☕', 'مثلج / آيس 🧊', 'بدون سكر', 'إكسترا شوت'];
  }
  if (text.includes('عصير') || text.includes('مشروب') || text.includes('كوكتيل') || text.includes('سموذي') || text.includes('drink') || text.includes('juice') || text.includes('فريز')) {
    return ['بارد / مثلج 🧊', 'بدون ثلج', 'بالفريز / فراولة 🍓', 'بدون سكر'];
  }
  if (text.includes('برغر') || text.includes('مشاوي') || text.includes('لحم') || text.includes('دجاج') || text.includes('وجبة') || text.includes('شاورما') || text.includes('بيتزا') || text.includes('burger') || text.includes('grill') || text.includes('food')) {
    return ['عادي / Regular', 'حار / سبايسي 🌶️', 'إكسترا جبن 🧀', 'بدون بصل'];
  }
  if (text.includes('كيك') || text.includes('حلى') || text.includes('سويت') || text.includes('تشيز') || text.includes('dessert') || text.includes('cake')) {
    return ['عادي', 'مع آيسكريم 🍨', 'بالفريز 🍓', 'شوكولاتة إضافية 🍫'];
  }

  return ['عادي / Regular', 'حار / سبايسي 🌶️', 'بارد / آيس 🧊', 'ساخن / هوت ☕'];
}

export function openProductDialog(product) {
  if (!dialogEl || !product) return;
  currentProduct = product;
  qty = 1;

  const lang = getCurrentLang();
  const isAr = lang === 'ar';

  const titleEl = dialogEl.querySelector('.modal-product-title');
  const descEl = dialogEl.querySelector('.modal-product-desc');
  const priceEl = dialogEl.querySelector('.modal-product-price');
  const imgEl = dialogEl.querySelector('.modal-product-img');
  const badgeEl = dialogEl.querySelector('.modal-product-badge');
  const qtyDisplay = dialogEl.querySelector('.modal-qty-display');
  const addBtn = dialogEl.querySelector('[data-action="add-to-cart"]');
  const noteInput = dialogEl.querySelector('#product-note-input');

  if (titleEl) titleEl.textContent = isAr ? product.name_ar : product.name_en || product.name_ar;
  if (descEl) descEl.textContent = isAr ? product.description_ar : product.description_en || product.description_ar || '';
  if (priceEl) priceEl.textContent = formatPrice(product.price_iqd, lang);
  if (imgEl) {
    imgEl.src = product.image_path || '/assets/brand/q-stone-ultra-grey.jpg';
    imgEl.alt = isAr ? product.name_ar : product.name_en;
  }
  if (qtyDisplay) qtyDisplay.textContent = qty;
  if (noteInput) noteInput.value = '';

  // Render context-aware dynamic option pills (سبايسي، آيس، هوت، بالفريز، إلخ)
  const pillsContainer = dialogEl.querySelector('#product-option-pills');
  if (pillsContainer) {
    pillsContainer.innerHTML = '';
    const options = getOptionsForProduct(product);
    options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `option-pill ${idx === 0 ? 'is-active' : ''}`;
      btn.setAttribute('data-option', opt);
      btn.textContent = opt;
      btn.addEventListener('click', () => {
        btn.classList.toggle('is-active');
      });
      pillsContainer.appendChild(btn);
    });
  }

  if (badgeEl) {
    if (product.is_available) {
      badgeEl.className = 'badge badge-available';
      badgeEl.textContent = t('available');
    } else {
      badgeEl.className = 'badge badge-unavailable';
      badgeEl.textContent = t('unavailable');
    }
  }

  if (addBtn) {
    addBtn.disabled = !product.is_available;
    addBtn.textContent = product.is_available ? t('addToCart') : t('unavailable');
  }

  openModal(dialogEl);
}
