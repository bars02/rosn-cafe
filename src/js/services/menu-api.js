// Public Menu API Service — Fetches real live data from Supabase
import { supabase, isSupabaseConfigured } from '../config/supabase.js';
import { mockSiteSettings, mockCategories, mockProducts } from '../mock/data.js';

let cachedSettings = null;
let cachedCategories = null;
let cachedProducts = null;

/**
 * Fetches the singleton site settings record.
 */
export async function fetchSiteSettings() {
  if (!isSupabaseConfigured || !supabase) {
    console.warn('Supabase not configured, using fallback settings');
    return mockSiteSettings;
  }

  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('*')
      .eq('id', true)
      .single();

    if (error || !data) {
      console.warn('Could not fetch site_settings from Supabase, using cache or fallback:', error);
      return cachedSettings || mockSiteSettings;
    }

    cachedSettings = data;
    return data;
  } catch (err) {
    console.error('Error fetching site_settings:', err);
    return cachedSettings || mockSiteSettings;
  }
}

/**
 * Fetches all active categories ordered by sort_order.
 */
export async function fetchCategories() {
  if (!isSupabaseConfigured || !supabase) {
    return mockCategories.filter((c) => c.is_active);
  }

  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error || !data) {
      console.warn('Could not fetch categories from Supabase:', error);
      return cachedCategories || mockCategories.filter((c) => c.is_active);
    }

    cachedCategories = data;
    return data;
  } catch (err) {
    console.error('Error fetching categories:', err);
    return cachedCategories || mockCategories.filter((c) => c.is_active);
  }
}

/**
 * Fetches all published products in active categories ordered by sort_order.
 */
export async function fetchProducts() {
  if (!isSupabaseConfigured || !supabase) {
    return mockProducts.filter((p) => p.status === 'published');
  }

  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('status', 'published')
      .order('sort_order', { ascending: true });

    if (error || !data) {
      console.warn('Could not fetch products from Supabase:', error);
      return cachedProducts || mockProducts.filter((p) => p.status === 'published');
    }

    cachedProducts = data;
    return data;
  } catch (err) {
    console.error('Error fetching products:', err);
    return cachedProducts || mockProducts.filter((p) => p.status === 'published');
  }
}

/**
 * Re-fetches specific products by their IDs to validate current prices & availability.
 * Essential for reconciling the local cart before bill/delivery handoff.
 * @param {Array<string>} productIds
 */
export async function fetchProductsByIds(productIds) {
  if (!productIds || productIds.length === 0) return [];
  if (!isSupabaseConfigured || !supabase) {
    return mockProducts.filter((p) => productIds.includes(p.id));
  }

  try {
    const { data, error } = await supabase
      .from('products')
      .select('id, name_ar, name_en, price_iqd, is_available, status, category_id')
      .in('id', productIds);

    if (error || !data) {
      console.warn('Error validating cart products:', error);
      return [];
    }

    return data;
  } catch (err) {
    console.error('Network error during product validation:', err);
    return [];
  }
}
