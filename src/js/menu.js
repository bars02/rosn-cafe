// Guest Menu Application Logic — Real Live Database Integration
import {
  initI18n,
  getCurrentLang,
  setLanguage,
  onLanguageChange,
  t,
} from './shared/i18n.js';
import { formatPrice, normalizeSearchText } from './shared/format.js';
import { debounce, showToast, openModal, closeModal, escapeHtml } from './shared/dom.js';
import {
  getCartTotalCount,
  subscribeToCart,
  addToCart,
  purgeDeletedProducts,
} from './services/cart.js';
import {
  fetchSiteSettings,
  fetchCategories,
  fetchProducts,
} from './services/menu-api.js';
import { initProductDialog, openProductDialog } from './components/product-dialog.js';
import { initCartSheet, openCartSheet, resolveCartItems, setActiveProducts, setActiveSettings } from './components/cart-sheet.js';
import { initBillView } from './components/bill-view.js';

let liveSettings = null;
let liveCategories = [];
let liveProducts = [];

let selectedFloor = 'all'; // 'all' | 'floor_1' | 'floor_2'
let selectedCategoryId = 'all';
let searchQuery = '';
let isLoading = true;

document.addEventListener('DOMContentLoaded', async () => {
  initI18n();
  initProductDialog();
  initCartSheet();
  initBillView();

  setupLanguageSwitcher();
  setupFloorSwitcher();
  setupSearch();
  setupCartButtons();
  setupCartSubscriber();
  setupBrowseMenuAndPromo();

  // Load initial data from Supabase
  await loadMenuData();

  // Listen to language changes and re-render
  onLanguageChange(() => {
    renderAll();
  });
});

async function loadMenuData() {
  isLoading = true;
  renderLoadingState();

  try {
    const [settings, categories, products] = await Promise.all([
      fetchSiteSettings(),
      fetchCategories(),
      fetchProducts(),
    ]);

    liveSettings = settings;
    setActiveSettings(liveSettings);
    liveCategories = categories || [];
    liveProducts = products || [];
    purgeDeletedProducts(liveProducts);
    setActiveProducts(liveProducts);
  } catch (err) {
    console.error('Error loading menu data:', err);
    showToast(t('loadingError') || 'خطأ في تحميل القائمة، يرجى المحاولة لاحقاً', 'error');
  } finally {
    isLoading = false;
    renderAll();
  }
}

function renderLoadingState() {
  const grid = document.getElementById('products-grid');
  if (!grid) return;

  grid.innerHTML = Array(4)
    .fill(0)
    .map(
      (_, i) => `
      <div class="product-card" style="--card-idx:${i}; pointer-events:none;">
        <div class="card-media skeleton-shimmer"></div>
        <div class="card-body">
          <div class="skeleton-shimmer" style="height:20px; border-radius:6px; margin-bottom:8px; width:65%"></div>
          <div class="skeleton-shimmer" style="height:14px; border-radius:6px; margin-bottom:16px; width:90%"></div>
          <div class="skeleton-shimmer" style="height:36px; border-radius:var(--radius-pill)"></div>
        </div>
      </div>
    `
    )
    .join('');
}

function setupLanguageSwitcher() {
  const toggleBtns = [
    document.getElementById('lang-toggle-btn'),
    document.getElementById('welcome-lang-btn'),
  ];

  toggleBtns.forEach((btn) => {
    btn?.addEventListener('click', () => {
      const current = getCurrentLang();
      const next = current === 'ar' ? 'en' : 'ar';
      setLanguage(next);
    });
  });
}

function setupSearch() {
  const searchInput = document.getElementById('menu-search-input');
  const clearBtn = document.getElementById('search-clear-btn');
  if (!searchInput) return;

  const onSearch = debounce((val) => {
    searchQuery = val.trim();
    if (clearBtn) {
      clearBtn.style.display = searchQuery ? 'inline-flex' : 'none';
    }
    renderProducts();
  }, 180);

  searchInput.addEventListener('input', (e) => onSearch(e.target.value));

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      clearBtn.style.display = 'none';
      renderProducts();
      searchInput.focus();
    });
  }

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      searchQuery = '';
      if (clearBtn) clearBtn.style.display = 'none';
      renderProducts();
    }
  });
}

function setupCartButtons() {
  const headerCartBtn = document.getElementById('header-cart-btn');
  const stickyCartBtn = document.getElementById('sticky-cart-open-btn');

  headerCartBtn?.addEventListener('click', () => openCartSheet('dine-in'));
  stickyCartBtn?.addEventListener('click', () => openCartSheet('dine-in'));
}

function setupCartSubscriber() {
  const headerBadge = document.getElementById('header-cart-badge');
  const stickyBar = document.getElementById('sticky-cart-bar');
  const stickyCount = document.getElementById('sticky-cart-count');
  const stickyTotal = document.getElementById('sticky-cart-total');

  subscribeToCart(() => {
    const count = getCartTotalCount();
    const { subtotal } = resolveCartItems(liveProducts);
    const lang = getCurrentLang();

    if (headerBadge) {
      if (count > 0) {
        headerBadge.textContent = count;
        headerBadge.style.display = 'inline-flex';
      } else {
        headerBadge.style.display = 'none';
      }
    }

    if (stickyBar) {
      if (count > 0) {
        stickyBar.classList.add('is-visible');
        if (stickyCount) stickyCount.textContent = `${count} ${t('cartItems')}`;
        if (stickyTotal) stickyTotal.textContent = formatPrice(subtotal, lang);
      } else {
        stickyBar.classList.remove('is-visible');
      }
    }
  });
}

function renderAll() {
  if (isLoading) return;

  const lang = getCurrentLang();
  const isAr = lang === 'ar';

  // Update page title
  document.title = isAr
    ? `${liveSettings?.name_ar || 'رسن'} | ${liveSettings?.descriptor_ar || 'كافيه ومطعم'} — ${liveSettings?.tagline_ar || 'على ضفاف الفرات'}`
    : `${liveSettings?.name_en || 'RASAN'} | ${liveSettings?.descriptor_en || 'Café & Restaurant'} — ${liveSettings?.tagline_en || 'By the Euphrates'}`;

  // Update static UI elements with data-i18n
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });

  // Update language toggle text across both Welcome and Menu views
  document.querySelectorAll('.lang-text').forEach((el) => {
    el.textContent = isAr ? 'English' : 'العربية';
  });

  // Update search placeholder
  const searchInput = document.getElementById('menu-search-input');
  if (searchInput) {
    searchInput.placeholder = t('searchPlaceholder');
  }

  // Update floor switcher button & popover labels for current language
  updateFloorIndicatorLabels();

  // Render Hero from liveSettings
  renderHeroSettings();

  // Render Categories & Products
  renderCategories();
  renderProducts();
}

function renderHeroSettings() {
  if (!liveSettings) return;

  const lang = getCurrentLang();
  const isAr = lang === 'ar';

  // Announcement Banner
  const banner = document.getElementById('announcement-bar');
  const bannerText = banner?.querySelector('.announcement-text');
  const announcement = isAr ? liveSettings.announcement_ar : liveSettings.announcement_en;
  if (banner) {
    if (announcement) {
      if (bannerText) bannerText.textContent = announcement;
      banner.style.display = 'block';
    } else {
      banner.style.display = 'none';
    }
  }

  // Background Image for Hero (from site_settings.hero_image_path)
  const heroSection = document.getElementById('hero-section');
  if (heroSection && liveSettings.hero_image_path) {
    heroSection.style.backgroundImage = `url('${liveSettings.hero_image_path}')`;
  }

  // Hero Identity Texts
  const descEl = document.getElementById('hero-descriptor-text');
  const taglineEl = document.getElementById('hero-tagline-text');
  if (descEl) descEl.textContent = isAr ? liveSettings.descriptor_ar : (liveSettings.descriptor_en || liveSettings.descriptor_ar);
  if (taglineEl) taglineEl.textContent = isAr ? liveSettings.tagline_ar : (liveSettings.tagline_en || liveSettings.tagline_ar);

  // Operational Status (Open / Closed)
  const statusBadge = document.getElementById('hero-status-badge');
  const statusText = document.getElementById('hero-status-text');
  if (statusBadge && statusText) {
    if (liveSettings.is_open) {
      statusBadge.className = 'badge badge-available';
      statusText.textContent = t('statusOpen');
    } else {
      statusBadge.className = 'badge badge-unavailable';
      statusText.textContent = t('statusClosed');
    }
  }

  // Contact Row: Call, Location, Instagram, Facebook (with real dynamic text)
  const callLink = document.getElementById('hero-call-link');
  const callText = document.getElementById('hero-call-text');
  const mapLink = document.getElementById('hero-map-link');
  const mapText = document.getElementById('hero-map-text');
  const instaLink = document.getElementById('hero-instagram-link');
  const instaText = document.getElementById('hero-instagram-text');
  const fbLink = document.getElementById('hero-facebook-link');
  const fbText = document.getElementById('hero-facebook-text');

  let savedSocial = {};
  try {
    savedSocial = JSON.parse(localStorage.getItem('rasan_social_handles') || '{}');
  } catch (e) { }

  if (callLink) {
    if (liveSettings.phone_display) {
      callLink.href = `tel:${liveSettings.phone_display.replace(/[^0-9+]/g, '')}`;
      if (callText) callText.textContent = liveSettings.phone_display;
      callLink.style.display = 'inline-flex';
    } else {
      callLink.style.display = 'none';
    }
  }

  if (mapLink) {
    if (liveSettings.location_url) {
      mapLink.href = liveSettings.location_url;
      const locLabel = isAr ? liveSettings.location_label_ar : (liveSettings.location_label_en || liveSettings.location_label_ar);
      if (mapText) mapText.textContent = locLabel || t('location');
      mapLink.style.display = 'inline-flex';
    } else {
      mapLink.style.display = 'none';
    }
  }

  if (instaLink) {
    if (liveSettings.instagram_url && savedSocial.instagramEnabled !== false) {
      instaLink.href = liveSettings.instagram_url;
      const handle = savedSocial.instagramHandle || '@rasan.cafe';
      if (instaText) instaText.textContent = handle;
      instaLink.style.display = 'inline-flex';
    } else {
      instaLink.style.display = 'none';
    }
  }

  if (fbLink) {
    if (liveSettings.facebook_url && savedSocial.facebookEnabled !== false) {
      fbLink.href = liveSettings.facebook_url;
      const handle = savedSocial.facebookHandle || (isAr ? 'فيسبوك' : 'Facebook');
      if (fbText) fbText.textContent = handle;
      fbLink.style.display = 'inline-flex';
    } else {
      fbLink.style.display = 'none';
    }
  }
}

let promoShownThisSession = false;

const FLOOR_LABELS = {
  all: {
    titleAr: 'كافة الطوابق',
    titleEn: 'All Floors',
    subAr: 'عرض المنيو بالكامل',
    subEn: 'View Complete Menu',
  },
  floor_1: {
    titleAr: 'الطابق الأرضي',
    titleEn: 'Ground Floor',
    subAr: 'الكافيه والحلويات',
    subEn: 'Café & Desserts',
  },
  floor_2: {
    titleAr: 'الطابق الثاني',
    titleEn: 'Second Floor',
    subAr: 'المطعم والأركيلة',
    subEn: 'Restaurant & Shisha',
  },
};

function updateFloorIndicatorLabels() {
  const isAr = getCurrentLang() === 'ar';
  const currentLabelEl = document.getElementById('current-floor-label');
  const popoverHeaderEl = document.getElementById('floor-popover-title');
  const currentInfo = FLOOR_LABELS[selectedFloor] || FLOOR_LABELS.all;

  if (currentLabelEl) {
    currentLabelEl.textContent = isAr ? currentInfo.titleAr : currentInfo.titleEn;
  }
  if (popoverHeaderEl) {
    popoverHeaderEl.textContent = isAr ? 'اختر الطابق' : 'Select Floor';
  }

  Object.entries(FLOOR_LABELS).forEach(([floorKey, labels]) => {
    const titleEl = document.querySelector(`[data-floor-title="${floorKey}"]`);
    const subEl = document.querySelector(`[data-floor-sub="${floorKey}"]`);
    if (titleEl) titleEl.textContent = isAr ? labels.titleAr : labels.titleEn;
    if (subEl) subEl.textContent = isAr ? labels.subAr : labels.subEn;
  });
}

function setupFloorSwitcher() {
  const wrapper = document.getElementById('floor-dropdown-wrapper');
  const triggerBtn = document.getElementById('floor-dropdown-btn');
  const container = document.getElementById('floor-switcher-nav');
  if (!container) return;

  const closeDropdown = () => {
    wrapper?.classList.remove('is-open');
    triggerBtn?.setAttribute('aria-expanded', 'false');
  };

  triggerBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = wrapper?.classList.toggle('is-open');
    triggerBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  document.addEventListener('click', (e) => {
    if (wrapper && !wrapper.contains(e.target)) {
      closeDropdown();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDropdown();
    }
  });

  container.querySelectorAll('.floor-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.floor-chip').forEach((c) => c.classList.remove('is-active'));
      btn.classList.add('is-active');
      selectedFloor = btn.getAttribute('data-floor') || 'all';
      selectedCategoryId = 'all';
      updateFloorIndicatorLabels();
      closeDropdown();
      renderCategories();
      renderProducts();
    });
  });

  updateFloorIndicatorLabels();
}

function getCategoryFloor(cat) {
  try {
    const map = JSON.parse(localStorage.getItem('rasan_category_floors') || '{}');
    if (cat.id && map[cat.id]) return map[cat.id];
    if (cat.slug && map[cat.slug]) return map[cat.slug];
  } catch (e) { }
  if (cat.slug?.startsWith('f2-')) return 'floor_2';
  if (cat.slug?.startsWith('all-')) return 'all';
  return 'floor_1';
}

function getProductFloor(prod) {
  try {
    const map = JSON.parse(localStorage.getItem('rasan_product_meta') || '{}');
    if (prod.id && map[prod.id]?.floor && map[prod.id].floor !== 'auto') {
      return map[prod.id].floor;
    }
  } catch (e) { }
  const cat = liveCategories.find((c) => c.id === prod.category_id);
  return cat ? getCategoryFloor(cat) : 'all';
}

function setupBrowseMenuAndPromo() {
  const browseBtn = document.getElementById('btn-browse-menu');
  const promoModal = document.getElementById('promo-dialog');
  const promoAddBtn = document.getElementById('promo-add-cart-btn');

  // Find a featured dish from live products matching current floor
  const getFeaturedProduct = () => {
    return (
      liveProducts.find((p) => {
        if (!p.is_available) return false;
        const pFloor = getProductFloor(p);
        const matchesFloor = selectedFloor === 'all' || pFloor === 'all' || pFloor === selectedFloor;
        return p.is_featured && matchesFloor;
      }) ||
      liveProducts.find((p) => {
        if (!p.is_available) return false;
        const pFloor = getProductFloor(p);
        return selectedFloor === 'all' || pFloor === 'all' || pFloor === selectedFloor;
      })
    );
  };

  const triggerPromoModal = (featured) => {
    if (!promoModal || !featured || promoShownThisSession) return;
    const lang = getCurrentLang();
    const isAr = lang === 'ar';

    const promoTitle = document.getElementById('promo-dish-title');
    const promoDesc = document.getElementById('promo-dish-desc');
    const promoPrice = document.getElementById('promo-dish-price');
    const promoImg = document.getElementById('promo-dish-img');

    if (promoTitle) promoTitle.textContent = isAr ? featured.name_ar : (featured.name_en || featured.name_ar);
    if (promoDesc) promoDesc.textContent = isAr ? featured.description_ar : (featured.description_en || featured.description_ar || '');
    if (promoPrice) promoPrice.textContent = formatPrice(featured.price_iqd, lang);
    if (promoImg) promoImg.src = featured.image_path || '/assets/brand/rasan-horse-original.png';

    openModal(promoModal);
    promoShownThisSession = true;
  };

  const openMenuView = () => {
    document.body.classList.add('is-menu-open');
    window.scrollTo({ top: 0, behavior: 'instant' });
    try {
      window.history.pushState({ view: 'menu' }, '', '#menu');
    } catch (err) { }
    // Re-trigger staggered product animation on view entry
    renderProducts();
  };

  const closeMenuView = () => {
    document.body.classList.remove('is-menu-open');
    window.scrollTo({ top: 0, behavior: 'instant' });
    try {
      if (window.location.hash === '#menu') {
        window.history.pushState({ view: 'welcome' }, '', window.location.pathname + window.location.search);
      }
    } catch (err) { }
  };

  browseBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    openMenuView();
  });

  const backWelcomeBtn = document.getElementById('btn-back-welcome');
  const logoHomeBtn = document.getElementById('btn-logo-home');

  backWelcomeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    closeMenuView();
  });

  logoHomeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    closeMenuView();
  });

  window.addEventListener('popstate', () => {
    if (window.location.hash === '#menu') {
      document.body.classList.add('is-menu-open');
      window.scrollTo({ top: 0, behavior: 'instant' });
    } else {
      document.body.classList.remove('is-menu-open');
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  });

  if (window.location.hash === '#menu') {
    document.body.classList.add('is-menu-open');
  }

  // Scroll Trigger: After scrolling down through the menu (3-4 scrolls), gently present "طبق التميز"
  let scrollCount = 0;
  let lastScrollPos = 0;
  window.addEventListener('scroll', () => {
    if (!document.body.classList.contains('is-menu-open')) return;
    if (promoShownThisSession || !promoModal) return;
    const currentY = window.scrollY;
    if (currentY > 350 && Math.abs(currentY - lastScrollPos) > 100) {
      scrollCount++;
      lastScrollPos = currentY;
      if (scrollCount >= 3) {
        const featured = getFeaturedProduct();
        if (featured) {
          triggerPromoModal(featured);
        }
      }
    }
  }, { passive: true });

  // Promo Add to Cart
  promoAddBtn?.addEventListener('click', () => {
    const featured = getFeaturedProduct();
    if (featured) {
      addToCart(featured.id, featured.price_iqd, 1, 'طبق التميز ⭐');
      showToast('تمت إضافة طبق التميز إلى السلة بنجاح', 'success');
      closeModal(promoModal);
    }
  });

  promoModal?.querySelectorAll('[data-action="close"]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(promoModal));
  });
}

function renderCategories() {
  const container = document.getElementById('category-chips-nav');
  if (!container) return;
  const lang = getCurrentLang();
  const isAr = lang === 'ar';

  container.innerHTML = '';

  // Filter categories by active floor
  const visibleCategories = liveCategories.filter((cat) => {
    if (selectedFloor === 'all') return true;
    const catFloor = getCategoryFloor(cat);
    return catFloor === selectedFloor || catFloor === 'all';
  });

  // "All" chip
  const allChip = document.createElement('button');
  allChip.className = `category-chip ${selectedCategoryId === 'all' ? 'is-active' : ''}`;
  allChip.textContent = t('all');
  allChip.addEventListener('click', () => {
    selectedCategoryId = 'all';
    renderCategories();
    renderProducts();
  });
  container.appendChild(allChip);

  // Active categories from Supabase for this floor
  visibleCategories.forEach((cat) => {
    const chip = document.createElement('button');
    chip.className = `category-chip ${selectedCategoryId === cat.id ? 'is-active' : ''}`;
    chip.textContent = isAr ? cat.name_ar : (cat.name_en || cat.name_ar);
    chip.addEventListener('click', () => {
      selectedCategoryId = cat.id;
      renderCategories();
      renderProducts();
    });
    container.appendChild(chip);
  });

  // Smoothly center the active category chip on mobile scroll
  const activeChip = container.querySelector('.category-chip.is-active');
  if (activeChip && typeof activeChip.scrollIntoView === 'function') {
    activeChip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
}

function triggerCartBump() {
  const headerCartBtn = document.getElementById('header-cart-btn');
  const stickyCount = document.getElementById('sticky-cart-count');
  [headerCartBtn, stickyCount].forEach((el) => {
    if (!el) return;
    el.classList.remove('cart-bump');
    void el.offsetWidth;
    el.classList.add('cart-bump');
  });
}

function renderProducts() {
  const grid = document.getElementById('products-grid');
  const emptyState = document.getElementById('empty-search-state');
  const countLabel = document.getElementById('search-count-label');
  if (!grid) return;

  const lang = getCurrentLang();
  const isAr = lang === 'ar';
  const normalizedQuery = normalizeSearchText(searchQuery);

  // Filter products: floor, category & search
  const filtered = liveProducts.filter((prod) => {
    // Floor check
    if (selectedFloor !== 'all') {
      const prodFloor = getProductFloor(prod);
      if (prodFloor !== 'all' && prodFloor !== selectedFloor) {
        return false;
      }
    }

    // Category check
    if (selectedCategoryId !== 'all' && prod.category_id !== selectedCategoryId) {
      return false;
    }

    // Search query check
    if (normalizedQuery) {
      const nameAr = normalizeSearchText(prod.name_ar);
      const nameEn = normalizeSearchText(prod.name_en);
      const descAr = normalizeSearchText(prod.description_ar);
      const descEn = normalizeSearchText(prod.description_en);

      return (
        nameAr.includes(normalizedQuery) ||
        nameEn.includes(normalizedQuery) ||
        descAr.includes(normalizedQuery) ||
        descEn.includes(normalizedQuery)
      );
    }

    return true;
  });

  if (countLabel) {
    if (searchQuery) {
      countLabel.textContent = `${t('searchResults')}: ${filtered.length}`;
      countLabel.style.display = 'block';
    } else {
      countLabel.style.display = 'none';
    }
  }

  if (filtered.length === 0) {
    grid.innerHTML = '';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  grid.innerHTML = '';

  filtered.forEach((product, idx) => {
    const card = document.createElement('article');
    card.className = 'product-card';
    card.style.setProperty('--card-idx', Math.min(idx, 12));
    card.setAttribute('data-id', product.id);

    const name = isAr ? product.name_ar : (product.name_en || product.name_ar);
    const desc = isAr ? product.description_ar : (product.description_en || product.description_ar);
    const priceFormatted = formatPrice(product.price_iqd, lang);

    const unavailableBadge = !product.is_available
      ? `<div class="card-unavailable-overlay"><span class="badge badge-unavailable">${t('unavailable')}</span></div>`
      : '';

    const featuredBadge = product.is_featured && product.is_available
      ? `<div class="card-featured-badge">${isAr ? '⭐ مميز' : '⭐ Signature'}</div>`
      : '';

    card.innerHTML = `
      <div class="card-media" data-action="view-detail">
        <img class="card-img" src="${escapeHtml(product.image_path || '/assets/brand/q-stone-ultra-grey.jpg')}" alt="${escapeHtml(name)}" loading="lazy" />
        ${unavailableBadge}
        ${featuredBadge}
      </div>
      <div class="card-body">
        <h3 class="card-title" data-action="view-detail">${escapeHtml(name)}</h3>
        <p class="card-desc">${desc ? escapeHtml(desc) : ''}</p>
        <div class="card-footer">
          <span class="card-price tabular-nums">${priceFormatted}</span>
          <button
            class="btn-add"
            data-action="quick-add"
            ${!product.is_available ? 'disabled' : ''}
            aria-label="${t('addToCart')} ${escapeHtml(name)}"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>${product.is_available ? t('addToCart') : t('unavailable')}</span>
          </button>
        </div>
      </div>
    `;

    card.querySelectorAll('[data-action="view-detail"]').forEach((el) => {
      el.addEventListener('click', () => openProductDialog(product));
    });

    const addBtn = card.querySelector('[data-action="quick-add"]');
    addBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!product.is_available) return;
      addToCart(product.id, product.price_iqd, 1);
      triggerCartBump();
      addBtn.classList.add('is-added');
      const labelSpan = addBtn.querySelector('span');
      const originalText = labelSpan ? labelSpan.textContent : '';
      if (labelSpan) labelSpan.textContent = isAr ? 'تمت ✓' : 'Added ✓';
      setTimeout(() => {
        addBtn.classList.remove('is-added');
        if (labelSpan) labelSpan.textContent = originalText;
      }, 750);
      showToast(`${t('addedToCart')}: ${name}`, 'success');
    });

    grid.appendChild(card);
  });
}
