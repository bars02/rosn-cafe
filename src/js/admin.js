// Admin Dashboard Controller — Supabase Auth, Live Categories/Products CRUD, Storage & Settings
import {
  initI18n,
  getCurrentLang,
  setLanguage,
  onLanguageChange,
  t,
} from './shared/i18n.js';
import { formatPrice } from './shared/format.js';
import { showToast, openModal, closeModal, escapeHtml } from './shared/dom.js';
import {
  signInAdmin,
  signOutAdmin,
  getAdminSession,
  verifyAdminMembership,
  fetchAdminCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  fetchAdminProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadMenuImage,
  updateSiteSettings,
} from './services/admin-api.js';
import { fetchSiteSettings } from './services/menu-api.js';

let activeTab = 'overview';
let adminCategories = [];
let adminProducts = [];
let adminSiteSettings = null;
let currentAdminUser = null;

document.addEventListener('DOMContentLoaded', async () => {
  initI18n();
  setupSidebarNavigation();
  setupMobileSidebar();
  setupLanguageSwitcher();
  setupSettingsForm();
  setupCategoryModal();
  setupProductModal();
  setupAuth();

  // Check existing session
  await checkSessionState();

  onLanguageChange(() => {
    renderAdminAll();
  });
});

async function checkSessionState() {
  const loginOverlay = document.getElementById('admin-login-overlay');
  try {
    const session = await getAdminSession();
    if (session && session.user) {
      const allowedAdminEmail = (import.meta.env?.VITE_ADMIN_EMAIL || '').trim().toLowerCase();
      if (allowedAdminEmail && session.user.email?.toLowerCase() !== allowedAdminEmail) {
        await signOutAdmin();
        const errorMsg = document.getElementById('login-error-msg');
        if (errorMsg) {
          errorMsg.textContent = 'البريد الإلكتروني الحالي غير مسموح له بإدارة رسن.';
          errorMsg.style.display = 'block';
        }
        loginOverlay?.classList.add('is-open');
        return;
      }

      const isMember = await verifyAdminMembership(session.user.id);
      if (isMember) {
        currentAdminUser = session.user;
        loginOverlay?.classList.remove('is-open');
        await loadAllAdminData();
        return;
      } else {
        await signOutAdmin();
        const errorMsg = document.getElementById('login-error-msg');
        if (errorMsg) {
          errorMsg.textContent = 'الحساب غير مدرج في جدول مسؤولي المنيو (admin_users).';
          errorMsg.style.display = 'block';
        }
      }
    }
  } catch (err) {
    console.warn('Session check failed:', err);
  }

  // Not authenticated or session expired
  loginOverlay?.classList.add('is-open');
}

let failedAttempts = 0;
let lockoutUntil = 0;

function setupAuth() {
  const loginForm = document.getElementById('admin-login-form');
  const loginOverlay = document.getElementById('admin-login-overlay');
  const errorMsg = document.getElementById('login-error-msg');
  const submitBtn = document.getElementById('login-submit-btn');
  const logoutBtn = document.getElementById('admin-logout-btn');
  const emailInput = document.getElementById('login-email');

  const allowedAdminEmail = (import.meta.env.VITE_ADMIN_EMAIL || '').trim().toLowerCase();
  if (emailInput) {
    emailInput.placeholder = 'أدخل البريد الإلكتروني';
  }

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (Date.now() < lockoutUntil) {
      const remainingSec = Math.ceil((lockoutUntil - Date.now()) / 1000);
      if (errorMsg) {
        errorMsg.textContent = `تم إيقاف المحاولات مؤقتاً بسبب تكرار الخطأ. يرجى الانتظار ${remainingSec} ثانية.`;
        errorMsg.style.display = 'block';
      }
      return;
    }

    const email = emailInput?.value.trim() || '';
    const password = document.getElementById('login-password').value;

    if (!email || !password) return;

    if (allowedAdminEmail && email.toLowerCase() !== allowedAdminEmail) {
      if (errorMsg) {
        errorMsg.textContent = 'هذا البريد غير مصرح له بالدخول إلى لوحة إدارة رسن.';
        errorMsg.style.display = 'block';
      }
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>جارٍ التحقق...</span>';
    if (errorMsg) errorMsg.style.display = 'none';

    try {
      const authData = await signInAdmin(email, password);
      const isMember = await verifyAdminMembership(authData.user.id);

      if (!isMember) {
        await signOutAdmin();
        throw new Error('الحساب غير مصرح له كمسؤول في admin_users.');
      }

      failedAttempts = 0;
      currentAdminUser = authData.user;
      loginOverlay.classList.remove('is-open');
      showToast('تم تسجيل الدخول بنجاح', 'success');
      await loadAllAdminData();
    } catch (err) {
      console.error('Login error:', err);
      failedAttempts += 1;
      if (failedAttempts >= 5) {
        lockoutUntil = Date.now() + 60000; // 1 minute lockout
      }
      if (errorMsg) {
        errorMsg.textContent = err.message || 'بيانات الدخول غير صحيحة.';
        errorMsg.style.display = 'block';
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>تسجيل الدخول</span>';
    }
  });

  logoutBtn?.addEventListener('click', async () => {
    await signOutAdmin();
    currentAdminUser = null;
    loginOverlay?.classList.add('is-open');
    showToast('تم تسجيل الخروج بنجاح', 'info');
  });
}

async function loadAllAdminData() {
  try {
    const [cats, prods, settings] = await Promise.all([
      fetchAdminCategories(),
      fetchAdminProducts(),
      fetchSiteSettings(),
    ]);

    adminCategories = cats || [];
    adminProducts = prods || [];
    adminSiteSettings = settings || null;

    renderAdminAll();
  } catch (err) {
    console.error('Error loading admin data:', err);
    showToast('خطأ في تحميل بيانات الإدارة', 'error');
  }
}

function setupSidebarNavigation() {
  const navBtns = document.querySelectorAll('.nav-item-btn[data-tab]');
  navBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      switchTab(tab);
      closeMobileSidebar();
    });
  });

  document.querySelector('[data-action="go-to-products"]')?.addEventListener('click', () => switchTab('products'));
  document.querySelector('[data-action="go-to-settings"]')?.addEventListener('click', () => switchTab('settings'));
}

function switchTab(tab) {
  activeTab = tab;

  document.querySelectorAll('.nav-item-btn[data-tab]').forEach((btn) => {
    if (btn.getAttribute('data-tab') === tab) {
      btn.classList.add('is-active');
    } else {
      btn.classList.remove('is-active');
    }
  });

  document.querySelectorAll('.admin-tab-panel').forEach((panel) => {
    if (panel.id === `tab-${tab}`) {
      panel.classList.add('is-active');
    } else {
      panel.classList.remove('is-active');
    }
  });

  const topbarTitle = document.getElementById('topbar-title');
  if (topbarTitle) {
    const tabMap = {
      overview: 'adminOverview',
      categories: 'adminCategories',
      products: 'adminProducts',
      'tables-qr': 'adminTablesQR',
      settings: 'adminSettings',
    };
    const titleKey = tabMap[tab] || 'adminOverview';
    topbarTitle.textContent = t(titleKey) || t('adminOverview');
  }
}

function setupMobileSidebar() {
  const toggleBtn = document.getElementById('mobile-toggle-btn');
  const sidebar = document.getElementById('admin-sidebar');
  const backdrop = document.getElementById('admin-sidebar-backdrop');

  if (toggleBtn && sidebar && backdrop) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('is-open');
      backdrop.classList.toggle('is-open');
    });

    backdrop.addEventListener('click', () => {
      sidebar.classList.remove('is-open');
      backdrop.classList.remove('is-open');
    });
  }
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('admin-sidebar');
  const backdrop = document.getElementById('admin-sidebar-backdrop');
  sidebar?.classList.remove('is-open');
  backdrop?.classList.remove('is-open');
}

function setupLanguageSwitcher() {
  const langBtn = document.getElementById('admin-lang-btn');
  if (!langBtn) return;

  langBtn.addEventListener('click', () => {
    const cur = getCurrentLang();
    setLanguage(cur === 'ar' ? 'en' : 'ar');
  });
}

// ----------------- Culinary Translation Engine -----------------
const CULINARY_DICTIONARY = {
  'قهوة': 'Coffee',
  'قهوة مختصة': 'Specialty Coffee',
  'اسبريسو': 'Espresso',
  'كابتشينو': 'Cappuccino',
  'لاتيه': 'Latte',
  'فلات وايت': 'Flat White',
  'كورتادو': 'Cortado',
  'ميكاتو': 'Macchiato',
  'امريكانو': 'Americano',
  'قهوة مقطرة': 'Filter Coffee',
  'كيمكس': 'Chemex',
  'في 60': 'V60',
  'كولد برو': 'Cold Brew',
  'ايس لاتيه': 'Iced Latte',
  'ماتشا': 'Matcha',
  'شاي': 'Tea',
  'شاي اخضر': 'Green Tea',
  'كرك': 'Karak Tea',
  'حلا': 'Dessert',
  'حلويات': 'Desserts',
  'كيك': 'Cake',
  'كيكة العسل': 'Honey Cake',
  'سان سباستيان': 'San Sebastian',
  'تشيز كيك': 'Cheesecake',
  'تيراميسو': 'Tiramisu',
  'وافل': 'Waffle',
  'بان كيك': 'Pancake',
  'كرواسون': 'Croissant',
  'كرواسون جبن': 'Cheese Croissant',
  'افطار': 'Breakfast',
  'فطور': 'Breakfast',
  'ريوق': 'Breakfast',
  'كيمر': 'Kaymak (Clotted Cream)',
  'كيمر وعسل': 'Kaymak & Honey',
  'كيمر عرب': 'Traditional Iraqi Kaymak',
  'بيض': 'Eggs',
  'بيض طماطة': 'Eggs & Tomatoes',
  'شكشوكة': 'Shakshuka',
  'ساندوتش': 'Sandwich',
  'برغر': 'Burger',
  'برجر': 'Burger',
  'برغر لحم': 'Beef Burger',
  'برغر دجاج': 'Chicken Burger',
  'بيتزا': 'Pizza',
  'باستا': 'Pasta',
  'معكرونة': 'Pasta',
  'مشويات': 'Grills',
  'كباب': 'Kebab',
  'كباب عراقي': 'Iraqi Kebab',
  'تكة': 'Tikka',
  'شيش طاووق': 'Shish Tawook',
  'دجاج': 'Chicken',
  'لحم': 'Beef',
  'سمك': 'Fish',
  'سمك مسكوف': 'Iraqi Masgouf Fish',
  'سلطة': 'Salad',
  'سلطة سيزر': 'Caesar Salad',
  'متبل': 'Mutabbal',
  'حمص': 'Hummus',
  'بطاطا': 'French Fries',
  'شوربة': 'Soup',
  'شوربة عدس': 'Lentil Soup',
  'عصير': 'Juice',
  'عصير برتقال': 'Orange Juice',
  'ليموناضة': 'Lemonade',
  'موخيتو': 'Mojito',
  'موهيتو': 'Mojito',
  'سموذي': 'Smoothie',
  'مشروبات باردة': 'Cold Drinks',
  'مشروبات ساخنة': 'Hot Drinks',
  'مقبلات': 'Appetizers',
  'وجبات رئيسية': 'Main Courses',
  'حار': 'Spicy',
  'سبايسي': 'Spicy',
  'عادي': 'Regular',
  'بدون سكر': 'Sugar Free',
};

async function translateArabicToEnglish(text) {
  if (!text || !text.trim()) return '';
  const trimmed = text.trim();
  const normalized = trimmed.toLowerCase();

  // Instant dictionary match
  if (CULINARY_DICTIONARY[normalized]) {
    return CULINARY_DICTIONARY[normalized];
  }

  // Free online translation API
  try {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(trimmed)}&langpair=ar|en`);
    if (res.ok) {
      const json = await res.json();
      if (json.responseData && json.responseData.translatedText) {
        return json.responseData.translatedText;
      }
    }
  } catch (err) {
    console.warn('Online translation failed, using dictionary fallback:', err);
  }

  // Partial dictionary replacement fallback
  let result = trimmed;
  for (const [ar, en] of Object.entries(CULINARY_DICTIONARY)) {
    result = result.replace(new RegExp(ar, 'gi'), en);
  }
  return result;
}

// ----------------- Categories & Products Floor Helpers -----------------
function getCategoryFloor(category) {
  try {
    const map = JSON.parse(localStorage.getItem('rasan_category_floors') || '{}');
    if (category.id && map[category.id]) return map[category.id];
    if (category.slug && map[category.slug]) return map[category.slug];
  } catch (e) {}
  if (category.slug?.startsWith('f2-')) return 'floor_2';
  if (category.slug?.startsWith('all-')) return 'all';
  return 'floor_1';
}

function setCategoryFloor(idOrSlug, floor) {
  try {
    const map = JSON.parse(localStorage.getItem('rasan_category_floors') || '{}');
    map[idOrSlug] = floor;
    localStorage.setItem('rasan_category_floors', JSON.stringify(map));
  } catch (e) {}
}

function getProductMeta(product) {
  try {
    const map = JSON.parse(localStorage.getItem('rasan_product_meta') || '{}');
    if (product.id && map[product.id]) return map[product.id];
  } catch (e) {}
  return { floor: 'auto', options: '' };
}

function setProductMeta(productId, meta) {
  try {
    const map = JSON.parse(localStorage.getItem('rasan_product_meta') || '{}');
    map[productId] = meta;
    localStorage.setItem('rasan_product_meta', JSON.stringify(map));
  } catch (e) {}
}

function setupCategoryModal() {
  const modal = document.getElementById('category-modal');
  const form = document.getElementById('category-modal-form');
  const addCategoryMainBtn = document.getElementById('btn-add-category-main');
  const translateCatBtn = document.getElementById('btn-auto-translate-category');

  const openAddCategory = () => {
    document.getElementById('category-modal-title').textContent = t('addCategory');
    document.getElementById('category-edit-id').value = '';
    document.getElementById('category-input-name-ar').value = '';
    document.getElementById('category-input-name-en').value = '';
    document.getElementById('category-input-slug').value = '';
    document.getElementById('category-input-floor').value = 'floor_1';
    document.getElementById('category-input-order').value = adminCategories.length + 1;
    document.getElementById('category-input-active').checked = true;
    openModal(modal);
  };

  addCategoryMainBtn?.addEventListener('click', openAddCategory);

  translateCatBtn?.addEventListener('click', async () => {
    const arName = document.getElementById('category-input-name-ar').value.trim();
    if (!arName) {
      showToast('يرجى كتابة اسم القسم بالعربي أولاً', 'error');
      return;
    }
    translateCatBtn.disabled = true;
    translateCatBtn.innerHTML = '<span>جارٍ الترجمة... ⏳</span>';

    try {
      const enName = await translateArabicToEnglish(arName);
      document.getElementById('category-input-name-en').value = enName;
      const slugInput = document.getElementById('category-input-slug');
      if (!slugInput.value) {
        slugInput.value = enName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      }
      showToast('تمت ترجمة اسم القسم بنجاح 🪄', 'success');
    } catch (e) {
      console.warn('Category translate error:', e);
    } finally {
      translateCatBtn.disabled = false;
      translateCatBtn.innerHTML = '<span>ترجمة ذكية من العربي 🪄</span>';
    }
  });

  modal?.querySelectorAll('[data-action="close"]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(modal));
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('category-edit-id').value;
    const name_ar = document.getElementById('category-input-name-ar').value.trim();
    const name_en = document.getElementById('category-input-name-en').value.trim();
    const slug = document.getElementById('category-input-slug').value.trim();
    const floor = document.getElementById('category-input-floor').value;
    const sort_order = parseInt(document.getElementById('category-input-order').value, 10) || 0;
    const is_active = document.getElementById('category-input-active').checked;

    try {
      let saved;
      if (id) {
        saved = await updateCategory(id, { name_ar, name_en, slug, sort_order, is_active });
        setCategoryFloor(id, floor);
        setCategoryFloor(slug, floor);
        showToast('تم تحديث القسم بنجاح', 'success');
      } else {
        saved = await createCategory({ name_ar, name_en, slug, sort_order, is_active });
        if (saved?.id) setCategoryFloor(saved.id, floor);
        setCategoryFloor(slug, floor);
        showToast('تمت إضافة القسم بنجاح', 'success');
      }
      closeModal(modal);
      await loadAllAdminData();
    } catch (err) {
      console.error('Error saving category:', err);
      showToast(err.message || 'فشل حفظ القسم', 'error');
    }
  });
}

function openEditCategory(category) {
  const modal = document.getElementById('category-modal');
  document.getElementById('category-modal-title').textContent = 'تعديل القسم';
  document.getElementById('category-edit-id').value = category.id;
  document.getElementById('category-input-name-ar').value = category.name_ar;
  document.getElementById('category-input-name-en').value = category.name_en || '';
  document.getElementById('category-input-slug').value = category.slug;
  document.getElementById('category-input-floor').value = getCategoryFloor(category);
  document.getElementById('category-input-order').value = category.sort_order;
  document.getElementById('category-input-active').checked = category.is_active;
  openModal(modal);
}

// ----------------- Products Management Modal -----------------
function setupProductModal() {
  const modal = document.getElementById('product-modal');
  const form = document.getElementById('product-modal-form');
  const btnProducts = document.getElementById('btn-add-product-products');
  const btnOverview = document.getElementById('btn-add-product-overview');
  const translateProductBtn = document.getElementById('btn-auto-translate-product');
  const fileInput = document.getElementById('product-input-image-file');
  const uploadBtn = document.getElementById('product-image-upload-btn');
  const badgeName = document.getElementById('product-image-name-badge');

  const openProductModalForAdd = () => {
    document.getElementById('product-modal-title').textContent = t('addProduct');
    document.getElementById('product-edit-id').value = '';
    document.getElementById('product-input-name-ar').value = '';
    document.getElementById('product-input-name-en').value = '';
    document.getElementById('product-input-price').value = '';
    document.getElementById('product-input-desc-ar').value = '';
    document.getElementById('product-input-desc-en').value = '';
    document.getElementById('product-input-image-path').value = '';
    if (badgeName) badgeName.textContent = '';
    document.getElementById('product-input-status').value = 'published';
    document.getElementById('product-input-order').value = adminProducts.length + 1;
    document.getElementById('product-input-available').checked = true;
    document.getElementById('product-input-featured').checked = false;
    document.getElementById('product-input-floor').value = 'auto';
    document.getElementById('product-input-options').value = '';

    populateCategorySelect();
    openModal(modal);
  };

  btnProducts?.addEventListener('click', openProductModalForAdd);
  btnOverview?.addEventListener('click', openProductModalForAdd);
  document.querySelectorAll('[data-action="open-add-product"]').forEach((btn) => btn.addEventListener('click', openProductModalForAdd));

  translateProductBtn?.addEventListener('click', async () => {
    const arName = document.getElementById('product-input-name-ar').value.trim();
    const arDesc = document.getElementById('product-input-desc-ar').value.trim();
    if (!arName) {
      showToast('يرجى كتابة اسم المنتج بالعربي أولاً لترجمته', 'error');
      return;
    }
    translateProductBtn.disabled = true;
    translateProductBtn.innerHTML = '<span>جارٍ الترجمة... ⏳</span>';

    try {
      const enName = await translateArabicToEnglish(arName);
      document.getElementById('product-input-name-en').value = enName;
      if (arDesc) {
        const enDesc = await translateArabicToEnglish(arDesc);
        document.getElementById('product-input-desc-en').value = enDesc;
      }
      showToast('تمت الترجمة للإنجليزية بنجاح 🪄', 'success');
    } catch (e) {
      console.warn('Product translate error:', e);
      showToast('تعذرت الترجمة، يرجى كتابة الاسم يدوياً', 'info');
    } finally {
      translateProductBtn.disabled = false;
      translateProductBtn.innerHTML = '<span>ترجمة ذكية 🪄</span>';
    }
  });

  uploadBtn?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    uploadBtn.disabled = true;
    uploadBtn.textContent = 'جارٍ الرفع...';

    try {
      const publicUrl = await uploadMenuImage(file);
      document.getElementById('product-input-image-path').value = publicUrl;
      if (badgeName) badgeName.textContent = `تم الرفع: ${file.name}`;
      showToast('تم رفع الصورة بنجاح', 'success');
    } catch (err) {
      console.error('Image upload failed:', err);
      showToast(err.message || 'فشل رفع الصورة', 'error');
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'اختر صورة جديدة';
    }
  });

  modal?.querySelectorAll('[data-action="close"]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(modal));
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('product-edit-id').value;
    const name_ar = document.getElementById('product-input-name-ar').value.trim();
    const name_en = document.getElementById('product-input-name-en').value.trim();
    const category_id = document.getElementById('product-input-category').value;
    const price_iqd = parseInt(document.getElementById('product-input-price').value, 10);
    const description_ar = document.getElementById('product-input-desc-ar').value.trim();
    const description_en = document.getElementById('product-input-desc-en').value.trim();
    const image_path = document.getElementById('product-input-image-path').value.trim() || '/assets/brand/q-stone-ultra-grey.jpg';
    const status = document.getElementById('product-input-status').value;
    const sort_order = parseInt(document.getElementById('product-input-order').value, 10) || 0;
    const is_available = document.getElementById('product-input-available').checked;
    const is_featured = document.getElementById('product-input-featured').checked;
    const floor = document.getElementById('product-input-floor').value;
    const options = document.getElementById('product-input-options').value.trim();

    const payload = {
      name_ar,
      name_en,
      category_id,
      price_iqd,
      description_ar,
      description_en,
      image_path,
      status,
      sort_order,
      is_available,
      is_featured,
    };

    try {
      let saved;
      if (id) {
        saved = await updateProduct(id, payload);
        setProductMeta(id, { floor, options });
        showToast('تم تحديث المنتج بنجاح', 'success');
      } else {
        saved = await createProduct(payload);
        if (saved?.id) setProductMeta(saved.id, { floor, options });
        showToast('تمت إضافة المنتج بنجاح', 'success');
      }
      closeModal(modal);
      await loadAllAdminData();
    } catch (err) {
      console.error('Error saving product:', err);
      showToast(err.message || 'فشل حفظ المنتج', 'error');
    }
  });
}

function populateCategorySelect(selectedId = null) {
  const select = document.getElementById('product-input-category');
  if (!select) return;

  select.innerHTML = '';
  adminCategories.forEach((cat) => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = `${cat.name_ar} (${cat.name_en || '—'})`;
    if (selectedId && cat.id === selectedId) opt.selected = true;
    select.appendChild(opt);
  });
}

function openEditProduct(product) {
  const modal = document.getElementById('product-modal');
  document.getElementById('product-modal-title').textContent = 'تعديل المنتج';
  document.getElementById('product-edit-id').value = product.id;
  document.getElementById('product-input-name-ar').value = product.name_ar;
  document.getElementById('product-input-name-en').value = product.name_en || '';
  document.getElementById('product-input-price').value = product.price_iqd;
  document.getElementById('product-input-desc-ar').value = product.description_ar || '';
  document.getElementById('product-input-desc-en').value = product.description_en || '';
  document.getElementById('product-input-image-path').value = product.image_path || '';
  document.getElementById('product-input-status').value = product.status;
  document.getElementById('product-input-order').value = product.sort_order;
  document.getElementById('product-input-available').checked = product.is_available;
  document.getElementById('product-input-featured').checked = product.is_featured;

  const meta = getProductMeta(product);
  document.getElementById('product-input-floor').value = meta.floor || 'auto';
  document.getElementById('product-input-options').value = meta.options || '';

  populateCategorySelect(product.category_id);
  openModal(modal);
}

// ----------------- Site Settings Form -----------------
function setupSettingsForm() {
  const form = document.getElementById('site-settings-form');
  const cancelBtn = document.getElementById('settings-cancel-btn');
  const uploadHeroBtn = document.getElementById('btn-upload-hero-image');
  const heroFileInput = document.getElementById('setting-hero-file-input');
  const heroPreview = document.getElementById('setting-hero-preview');
  const heroPathInput = document.getElementById('setting-hero-image-path');
  const heroStatus = document.getElementById('hero-upload-status');

  // Hero Image file picker & Supabase Storage upload
  uploadHeroBtn?.addEventListener('click', () => {
    heroFileInput?.click();
  });

  heroFileInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (heroStatus) heroStatus.textContent = 'جارٍ رفع الصورة... ⏳';
    uploadHeroBtn.disabled = true;

    try {
      const publicUrl = await uploadMenuImage(file);
      if (heroPreview) heroPreview.src = publicUrl;
      if (heroPathInput) heroPathInput.value = publicUrl;
      if (heroStatus) heroStatus.textContent = 'تم رفع الصورة بنجاح ✅ (احفظ التغييرات لاعتمادها)';
      showToast('تم رفع صورة الواجهة بنجاح 🖼️', 'success');
    } catch (err) {
      console.error('Hero image upload failed:', err);
      if (heroStatus) heroStatus.textContent = 'فشل الرفع ❌';
      showToast(err.message || 'فشل رفع الصورة', 'error');
    } finally {
      uploadHeroBtn.disabled = false;
    }
  });

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const isInstagramEnabled = document.getElementById('setting-instagram-enabled')?.checked;
    const rawInstagramUrl = document.getElementById('setting-instagram-url')?.value.trim() || '';
    const instagramHandle = document.getElementById('setting-instagram-handle')?.value.trim() || '';

    const isFacebookEnabled = document.getElementById('setting-facebook-enabled')?.checked;
    const rawFacebookUrl = document.getElementById('setting-facebook-url')?.value.trim() || '';
    const facebookHandle = document.getElementById('setting-facebook-handle')?.value.trim() || '';

    // Persist handles locally
    try {
      localStorage.setItem('rasan_social_handles', JSON.stringify({
        instagramHandle: instagramHandle || '@rasan.cafe',
        facebookHandle: facebookHandle || 'رسن كافيه ومطعم',
        instagramEnabled: Boolean(isInstagramEnabled),
        facebookEnabled: Boolean(isFacebookEnabled),
      }));
    } catch (e) {
      console.warn('Could not store social handles locally:', e);
    }

    const heroImagePath = heroPathInput ? heroPathInput.value.trim() : null;

    const updates = {
      name_ar: document.getElementById('setting-name-ar').value.trim(),
      name_en: document.getElementById('setting-name-en').value.trim(),
      descriptor_ar: document.getElementById('setting-desc-ar').value.trim(),
      descriptor_en: document.getElementById('setting-desc-en').value.trim(),
      tagline_ar: document.getElementById('setting-tagline-ar').value.trim(),
      tagline_en: document.getElementById('setting-tagline-en').value.trim(),
      hero_image_path: heroImagePath || adminSiteSettings?.hero_image_path,
      phone_display: document.getElementById('setting-call-phone').value.trim(),
      whatsapp_number: document.getElementById('setting-whatsapp-num').value.trim(),
      location_url: document.getElementById('setting-map-url').value.trim(),
      location_label_ar: document.getElementById('setting-loc-label-ar').value.trim(),
      location_label_en: document.getElementById('setting-loc-label-en').value.trim(),
      instagram_url: isInstagramEnabled ? (rawInstagramUrl || null) : null,
      facebook_url: isFacebookEnabled ? (rawFacebookUrl || null) : null,
      announcement_ar: document.getElementById('setting-announce-ar').value.trim(),
      announcement_en: document.getElementById('setting-announce-en').value.trim(),
      is_open: document.getElementById('setting-is-open').checked,
      dine_in_enabled: document.getElementById('setting-dine-in-enabled').checked,
      delivery_enabled: document.getElementById('setting-delivery-enabled').checked,
    };

    try {
      await updateSiteSettings(updates);
      adminSiteSettings = { ...adminSiteSettings, ...updates };
      showToast(t('savedSuccessfully'), 'success');
    } catch (err) {
      console.error('Error saving settings:', err);
      showToast(err.message || 'فشل حفظ الإعدادات', 'error');
    }
  });

  cancelBtn?.addEventListener('click', () => {
    renderSettingsForm();
    showToast('تمت استعادة الإعدادات الأصلية', 'info');
  });
}

function renderSettingsForm() {
  if (!adminSiteSettings) return;

  const setValue = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  };
  const setChecked = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.checked = Boolean(val);
  };

  setValue('setting-name-ar', adminSiteSettings.name_ar);
  setValue('setting-name-en', adminSiteSettings.name_en);
  setValue('setting-desc-ar', adminSiteSettings.descriptor_ar);
  setValue('setting-desc-en', adminSiteSettings.descriptor_en);
  setValue('setting-tagline-ar', adminSiteSettings.tagline_ar);
  setValue('setting-tagline-en', adminSiteSettings.tagline_en);
  setValue('setting-call-phone', adminSiteSettings.phone_display);
  setValue('setting-whatsapp-num', adminSiteSettings.whatsapp_number);
  setValue('setting-map-url', adminSiteSettings.location_url);
  setValue('setting-loc-label-ar', adminSiteSettings.location_label_ar);
  setValue('setting-loc-label-en', adminSiteSettings.location_label_en);

  // Hero image preview
  if (adminSiteSettings.hero_image_path) {
    const heroPreview = document.getElementById('setting-hero-preview');
    const heroPathInput = document.getElementById('setting-hero-image-path');
    if (heroPreview) heroPreview.src = adminSiteSettings.hero_image_path;
    if (heroPathInput) heroPathInput.value = adminSiteSettings.hero_image_path;
  }

  // Social handles & toggles
  let savedSocial = {};
  try {
    savedSocial = JSON.parse(localStorage.getItem('rasan_social_handles') || '{}');
  } catch (e) {}

  setChecked('setting-instagram-enabled', adminSiteSettings.instagram_url ? (savedSocial.instagramEnabled !== false) : false);
  setValue('setting-instagram-url', adminSiteSettings.instagram_url || 'https://instagram.com/rasan.cafe');
  setValue('setting-instagram-handle', savedSocial.instagramHandle || '@rasan.cafe');

  setChecked('setting-facebook-enabled', adminSiteSettings.facebook_url ? (savedSocial.facebookEnabled !== false) : false);
  setValue('setting-facebook-url', adminSiteSettings.facebook_url || 'https://facebook.com/rasan.cafe');
  setValue('setting-facebook-handle', savedSocial.facebookHandle || 'رسن كافيه ومطعم');

  setValue('setting-announce-ar', adminSiteSettings.announcement_ar);
  setValue('setting-announce-en', adminSiteSettings.announcement_en);
  setChecked('setting-is-open', adminSiteSettings.is_open);
  setChecked('setting-dine-in-enabled', adminSiteSettings.dine_in_enabled);
  setChecked('setting-delivery-enabled', adminSiteSettings.delivery_enabled);
}

function renderAdminAll() {
  const lang = getCurrentLang();
  const isAr = lang === 'ar';

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });

  const langText = document.querySelector('.admin-lang-text');
  if (langText) langText.textContent = isAr ? 'English' : 'العربية';

  // Overview stats
  const activeCatsCount = adminCategories.filter((c) => c.is_active).length;
  const publishedProdsCount = adminProducts.filter((p) => p.status === 'published').length;
  const unavailableCount = adminProducts.filter((p) => !p.is_available).length;

  const statCats = document.getElementById('stat-categories-count');
  const statProds = document.getElementById('stat-products-count');
  const statUnavail = document.getElementById('stat-unavailable-count');

  if (statCats) statCats.textContent = activeCatsCount;
  if (statProds) statProds.textContent = publishedProdsCount;
  if (statUnavail) statUnavail.textContent = unavailableCount;

  renderCategoriesTable();
  renderProductsTable();
  renderSettingsForm();
}

function renderCategoriesTable() {
  const tbody = document.getElementById('admin-categories-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';
  adminCategories.forEach((cat, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><strong>${escapeHtml(cat.name_ar)}</strong></td>
      <td>${cat.name_en ? escapeHtml(cat.name_en) : '—'}</td>
      <td>
        <span class="badge ${cat.is_active ? 'badge-available' : 'badge-unavailable'}">
          ${cat.is_active ? t('active') : t('inactive')}
        </span>
      </td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="btn-secondary-action btn-edit-cat" style="padding:4px 8px; font-size:0.8125rem; width:auto; display:inline-flex;">
            ${t('edit')}
          </button>
          <button class="btn-secondary-action btn-del-cat" style="padding:4px 8px; font-size:0.8125rem; width:auto; display:inline-flex; color:var(--danger);">
            ${t('delete')}
          </button>
        </div>
      </td>
    `;

    tr.querySelector('.btn-edit-cat')?.addEventListener('click', () => openEditCategory(cat));
    tr.querySelector('.btn-del-cat')?.addEventListener('click', async () => {
      if (confirm(`هل أنت متأكد من حذف قسم «${cat.name_ar}»؟`)) {
        try {
          await deleteCategory(cat.id);
          showToast('تم حذف القسم بنجاح', 'success');
          await loadAllAdminData();
        } catch (err) {
          console.error('Delete category failed:', err);
          showToast(err.message || 'فشل حذف القسم', 'error', 4500);
        }
      }
    });

    tbody.appendChild(tr);
  });
}

function renderProductsTable() {
  const tbody = document.getElementById('admin-products-table-body');
  if (!tbody) return;
  const lang = getCurrentLang();
  const isAr = lang === 'ar';

  tbody.innerHTML = '';
  adminProducts.forEach((prod) => {
    const cat = adminCategories.find((c) => c.id === prod.category_id);
    const catName = cat ? (isAr ? cat.name_ar : cat.name_en || cat.name_ar) : '—';
    const prodName = isAr ? prod.name_ar : prod.name_en || prod.name_ar;
    const tr = document.createElement('tr');

    const availBadge = prod.is_available
      ? `<span class="badge badge-available">${t('available')}</span>`
      : `<span class="badge badge-unavailable">${t('unavailable')}</span>`;

    const statusBadge = prod.status === 'published'
      ? `<span class="badge badge-pill">${t('published')}</span>`
      : `<span class="badge" style="background:var(--sand); color:var(--walnut);">${t('draft')}</span>`;

    tr.innerHTML = `
      <td><img src="${escapeHtml(prod.image_path || '/assets/brand/q-stone-ultra-grey.jpg')}" alt="" class="table-product-thumb" /></td>
      <td><strong>${escapeHtml(prodName)}</strong></td>
      <td>${escapeHtml(catName)}</td>
      <td class="tabular-nums">${formatPrice(prod.price_iqd, lang)}</td>
      <td>${statusBadge}</td>
      <td>${availBadge}</td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="btn-secondary-action btn-edit-prod" style="padding:4px 8px; font-size:0.8125rem; width:auto; display:inline-flex;">
            ${t('edit')}
          </button>
          <button class="btn-secondary-action btn-del-prod" style="padding:4px 8px; font-size:0.8125rem; width:auto; display:inline-flex; color:var(--danger);">
            ${t('delete')}
          </button>
        </div>
      </td>
    `;

    tr.querySelector('.btn-edit-prod')?.addEventListener('click', () => openEditProduct(prod));
    tr.querySelector('.btn-del-prod')?.addEventListener('click', async () => {
      if (confirm(`هل أنت متأكد من حذف منتج «${prod.name_ar}»؟`)) {
        try {
          await deleteProduct(prod.id);
          showToast('تم حذف المنتج بنجاح', 'success');
          await loadAllAdminData();
        } catch (err) {
          console.error('Delete product failed:', err);
          showToast(err.message || 'فشل حذف المنتج', 'error');
        }
      }
    });

    tbody.appendChild(tr);
  });
}
