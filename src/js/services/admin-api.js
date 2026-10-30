// Admin API Service — Supabase Auth, Category/Product CRUD & Image Storage
import { supabase, isSupabaseConfigured } from '../config/supabase.js';
import { mockCategories, mockProducts, mockSiteSettings } from '../mock/data.js';

/**
 * Signs in an admin user via Supabase Auth.
 * @param {string} email
 * @param {string} password
 */
export async function signInAdmin(email, password) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase client is not configured.');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
}

/**
 * Signs out current admin.
 */
export async function signOutAdmin() {
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) console.error('Error during sign out:', error);
}

/**
 * Gets current session.
 */
export async function getAdminSession() {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}

/**
 * Verifies if the authenticated user has explicit membership in public.admin_users.
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function verifyAdminMembership(userId) {
  if (!userId || !isSupabaseConfigured || !supabase) return false;

  try {
    const { data, error } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) {
      return false;
    }
    return true;
  } catch (err) {
    console.error('Error verifying admin membership:', err);
    return false;
  }
}

// ----------------- Categories CRUD -----------------

export async function fetchAdminCategories() {
  if (!isSupabaseConfigured || !supabase) {
    return mockCategories;
  }

  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data;
}

export async function createCategory({ slug, name_ar, name_en, sort_order = 0, is_active = false }) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Database is offline');
  }

  if (is_active && (!name_en || name_en.trim().length < 2)) {
    throw new Error('تفعيل القسم يتطلب إدخال الاسم باللغة الإنجليزية');
  }

  const { data, error } = await supabase
    .from('categories')
    .insert({
      slug: slug.trim(),
      name_ar: name_ar.trim(),
      name_en: name_en ? name_en.trim() : null,
      sort_order: parseInt(sort_order, 10) || 0,
      is_active: Boolean(is_active),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateCategory(id, updates) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Database is offline');

  if (updates.is_active && (!updates.name_en || updates.name_en.trim().length < 2)) {
    throw new Error('تفعيل القسم يتطلب وجود الاسم باللغة الإنجليزية');
  }

  const { data, error } = await supabase
    .from('categories')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteCategory(id) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Database is offline');

  // Check if any product references this category
  const { count, error: countErr } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id);

  if (countErr) throw countErr;
  if (count > 0) {
    throw new Error(`لا يمكن حذف هذا القسم لأنه يحتوي على ${count} منتج(منتجات) مرتبطة به. يرجى نقل أو حذف المنتجات أولاً.`);
  }

  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return true;
}

// ----------------- Products CRUD -----------------

export async function fetchAdminProducts() {
  if (!isSupabaseConfigured || !supabase) {
    return mockProducts;
  }

  const { data, error } = await supabase
    .from('products')
    .select('*, categories(id, name_ar, name_en)')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data;
}

export async function createProduct(productData) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Database is offline');

  if (productData.status === 'published' && (!productData.name_en || productData.name_en.trim().length < 2)) {
    throw new Error('نشر المنتج يتطلب إدخال الاسم باللغة الإنجليزية');
  }

  const { data, error } = await supabase
    .from('products')
    .insert(productData)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateProduct(id, updates) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Database is offline');

  if (updates.status === 'published' && (!updates.name_en || updates.name_en.trim().length < 2)) {
    throw new Error('نشر المنتج يتطلب وجود الاسم باللغة الإنجليزية');
  }

  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteProduct(id) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Database is offline');

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return true;
}

// ----------------- Storage Image Upload -----------------

export async function uploadMenuImage(file) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Database is offline');

  // Validate file type & size (max 5MB)
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    throw new Error('نوع الصورة غير مدعوم. الأنواع المسموحة: JPG, PNG, WebP فقط.');
  }

  if (file.size > 5242880) {
    throw new Error('حجم الصورة يتجاوز الحد المسموح (5 ميجابايت).');
  }

  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from('menu-images')
    .upload(fileName, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage
    .from('menu-images')
    .getPublicUrl(fileName);

  return data.publicUrl;
}

// ----------------- Site Settings CRUD -----------------

export async function updateSiteSettings(settings) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Database is offline');

  const { data, error } = await supabase
    .from('site_settings')
    .update(settings)
    .eq('id', true)
    .select()
    .single();

  if (error) throw error;
  return data;
}
