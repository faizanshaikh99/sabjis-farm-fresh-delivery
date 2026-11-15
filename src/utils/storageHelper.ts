/**
 * Storage Resilience Utility
 * Safely handles localStorage operations, optimizes storage footprint,
 * and prevents QuotaExceededError crashes.
 *
 * SAFETY RULES ENFORCED:
 * 1. Complete database & catalog tables (users, orders, reviews, offers, products, categories)
 *    are NEVER stored in browser localStorage.
 * 2. Sensitive customer data (passwords, hashes, reset tokens, addresses) is NEVER persisted in browser storage.
 * 3. Cart, login sessions (sessionId & safe profile), and UI preferences are prioritized and protected.
 */

import { Product } from '../types';

const BLOCKED_DATABASE_KEYS = new Set([
  'sabjies_users',
  'sabjies_orders',
  'sabjies_reviews',
  'sabjies_offers',
  'sabjies_products',
  'sabjies_categories'
]);

/**
 * Strips sensitive credentials and non-essential PII from a user object before storing in localStorage.
 * Retains only minimal session identity fields needed for UI hydration.
 */
export function sanitizeUserForStorage<T extends Record<string, any>>(user: T | null | undefined): Record<string, any> | null {
  if (!user || typeof user !== 'object') return null;
  return {
    id: user.id,
    name: user.name || '',
    email: user.email || '',
    phone: user.phone || '',
    role: user.role || 'user',
    joinedAt: user.joinedAt || undefined
  };
}

/**
 * Strips bulky base64 QR payloads from payment settings before storing in localStorage.
 */
export function sanitizePaymentSettingsForStorage(settings: Record<string, any> | null | undefined): Record<string, any> | null {
  if (!settings || typeof settings !== 'object') return null;
  const { qrCodeDataUrl, ...rest } = settings;
  if (typeof rest.qrCodeUrl === 'string' && rest.qrCodeUrl.startsWith('data:') && rest.qrCodeUrl.length > 2048) {
    rest.qrCodeUrl = '/api/payment-settings/qr-image';
  }
  return rest;
}

/**
 * Strips bulky inline data: URI images from cart items so cart persistence stays tiny and quota-safe.
 */
export function sanitizeCartForStorage(cart: Record<string, any> | null | undefined): Record<string, any> {
  if (!cart || typeof cart !== 'object' || Array.isArray(cart)) return {};
  const cleaned: Record<string, any> = {};
  for (const [key, item] of Object.entries(cart)) {
    if (!item || typeof item !== 'object') continue;
    const { img, ...rest } = item as Record<string, any>;
    const safeItem: Record<string, any> = { ...rest };
    if (typeof img === 'string' && img && !img.startsWith('data:') && img.length <= 512) {
      safeItem.img = img;
    }
    cleaned[key] = safeItem;
  }
  return cleaned;
}

/**
 * Creates a lightweight snapshot of products (without cost price, descriptions, or images)
 * retained for compatibility with callers needing compact product summaries.
 */
export function prepareProductsForStorage(products: Product[]): string {
  try {
    if (!Array.isArray(products)) return '[]';
    const slice = products.slice(0, 30);
    const lightweight = slice.map((p) => ({
      id: p.id,
      name: p.name || '',
      cat: p.cat || 'all',
      type: p.type || 'organic',
      sp: Number(p.sp || 0),
      unit: p.unit || 'kg',
      weight: p.weight || 'per kg',
      emoji: p.emoji || '🥬',
      discount: p.discount || '',
      stockQty: Number(p.stockQty !== undefined ? p.stockQty : 50)
    }));
    return JSON.stringify(lightweight);
  } catch (err) {
    console.warn('[StorageHelper] Failed to prepare products for storage:', err);
    return '[]';
  }
}

/**
 * Purges bloated legacy database/catalog dumps and sanitizes existing user/payment/preference entries
 * in browser localStorage.
 */
export function cleanLegacyDatabaseStorage(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    // Purge complete database and catalog tables from browser storage
    BLOCKED_DATABASE_KEYS.forEach((key) => {
      window.localStorage.removeItem(key);
    });

    // Sanitize any existing sabjies_current_user that may contain password hashes or addresses
    const rawUser = window.localStorage.getItem('sabjies_current_user');
    if (rawUser) {
      try {
        const parsedUser = JSON.parse(rawUser);
        const sanitized = sanitizeUserForStorage(parsedUser);
        if (sanitized && sanitized.id) {
          const serialized = JSON.stringify(sanitized);
          if (serialized !== rawUser) {
            window.localStorage.setItem('sabjies_current_user', serialized);
          }
        } else {
          window.localStorage.removeItem('sabjies_current_user');
        }
      } catch {
        window.localStorage.removeItem('sabjies_current_user');
      }
    }

    // Strip bulky base64 qrCodeDataUrl from sabjies_payment_settings if present
    const rawPs = window.localStorage.getItem('sabjies_payment_settings');
    if (rawPs) {
      try {
        const parsedPs = JSON.parse(rawPs);
        const sanitizedPs = sanitizePaymentSettingsForStorage(parsedPs);
        if (sanitizedPs) {
          const serialized = JSON.stringify(sanitizedPs);
          if (serialized.length > 20000) {
            window.localStorage.removeItem('sabjies_payment_settings');
          } else if (serialized !== rawPs) {
            window.localStorage.setItem('sabjies_payment_settings', serialized);
          }
        }
      } catch {
        window.localStorage.removeItem('sabjies_payment_settings');
      }
    }

    // Strip any inline data: URLs from cart items if present
    const rawCart = window.localStorage.getItem('sabjies_cart');
    if (rawCart && rawCart.includes('data:image')) {
      try {
        const parsedCart = JSON.parse(rawCart);
        window.localStorage.setItem('sabjies_cart', JSON.stringify(sanitizeCartForStorage(parsedCart)));
      } catch {}
    }

    // Cap preference lists to reasonable bounds
    const rawRv = window.localStorage.getItem('sabjies_rv');
    if (rawRv) {
      try {
        const parsedRv = JSON.parse(rawRv);
        if (Array.isArray(parsedRv) && parsedRv.length > 8) {
          window.localStorage.setItem('sabjies_rv', JSON.stringify(parsedRv.slice(0, 8)));
        }
      } catch {
        window.localStorage.removeItem('sabjies_rv');
      }
    }

    const rawSearches = window.localStorage.getItem('sabjies_recent_searches');
    if (rawSearches) {
      try {
        const parsedSearches = JSON.parse(rawSearches);
        if (Array.isArray(parsedSearches) && parsedSearches.length > 10) {
          window.localStorage.setItem('sabjies_recent_searches', JSON.stringify(parsedSearches.slice(0, 10)));
        }
      } catch {
        window.localStorage.removeItem('sabjies_recent_searches');
      }
    }
  } catch (err) {
    console.warn('[StorageHelper] Error during legacy storage cleanup:', err);
  }
}

function normalizeValueForKey(key: string, value: string): string {
  if (key === 'sabjies_current_user') {
    try {
      const parsed = JSON.parse(value);
      const sanitized = sanitizeUserForStorage(parsed);
      return sanitized ? JSON.stringify(sanitized) : '{}';
    } catch {
      return value;
    }
  }

  if (key === 'sabjies_payment_settings') {
    try {
      const parsed = JSON.parse(value);
      const sanitized = sanitizePaymentSettingsForStorage(parsed);
      return sanitized ? JSON.stringify(sanitized) : '{}';
    } catch {
      return value;
    }
  }

  if (key === 'sabjies_cart') {
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(sanitizeCartForStorage(parsed));
    } catch {
      return value;
    }
  }

  return value;
}

/**
 * Safely stores a key-value pair in localStorage with automatic quota recovery.
 * Never throws an unhandled exception or crashes the React component tree.
 * Protects critical customer session, cart, and preferences while blocking database dumps.
 */
export function safeSetItem(key: string, value: string): boolean {
  if (typeof window === 'undefined' || !window.localStorage) {
    return false;
  }

  // Never store complete database or catalog tables in browser localStorage
  if (BLOCKED_DATABASE_KEYS.has(key)) {
    return false;
  }

  const normalizedValue = normalizeValueForKey(key, value);

  try {
    window.localStorage.setItem(key, normalizedValue);
    return true;
  } catch (err: any) {
    const isQuotaError =
      err?.name === 'QuotaExceededError' ||
      err?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err?.code === 22 ||
      err?.code === 1014 ||
      (err?.message && err.message.toLowerCase().includes('quota'));

    if (isQuotaError) {
      console.warn(`[StorageHelper] Quota exceeded while storing "${key}". Shedding disposable caches...`);
      try {
        // Clear any legacy database dumps and disposable caches first;
        // protect sabjies_cart, sabjies_session_id, sabjies_current_user, sabjies_wishlist, theme
        BLOCKED_DATABASE_KEYS.forEach((blockedKey) => window.localStorage.removeItem(blockedKey));
        window.localStorage.removeItem('sabjies_payment_settings');
        window.localStorage.removeItem('sabjies_rv');
        window.localStorage.removeItem('sabjies_recent_searches');
        window.localStorage.removeItem('sabjies_saved_for_later');

        // Retry setting the key once after cleanup
        window.localStorage.setItem(key, normalizedValue);
        return true;
      } catch (recoveryErr) {
        console.warn(`[StorageHelper] Failed to store "${key}" even after quota cleanup. Skipping gracefully.`, recoveryErr);
      }
    } else {
      console.warn(`[StorageHelper] Error setting "${key}" in localStorage:`, err);
    }
    return false;
  }
}

/**
 * Safely retrieves an item from localStorage.
 */
export function safeGetItem(key: string, fallback: string | null = null): string | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback;
  }

  try {
    const item = window.localStorage.getItem(key);
    return item !== null ? item : fallback;
  } catch (err) {
    console.warn(`[StorageHelper] Error getting "${key}" from localStorage:`, err);
    return fallback;
  }
}

/**
 * Safely removes an item from localStorage.
 */
export function safeRemoveItem(key: string): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch (err) {
    console.warn(`[StorageHelper] Error removing "${key}" from localStorage:`, err);
  }
}

