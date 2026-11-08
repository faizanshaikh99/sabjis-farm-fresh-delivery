/**
 * Storage Resilience Utility
 * Safely handles localStorage operations and prevents QuotaExceededError crashes
 * when storing large payloads (e.g. products with high-res base64 images).
 */

import { Product } from '../types';

/**
 * Creates a lightweight snapshot of products suitable for localStorage cache (~15KB vs 10MB)
 * by stripping bulky base64 data URLs while preserving all functional fields (prices, stock, names, emoji).
 */
export function prepareProductsForStorage(products: Product[]): string {
  try {
    if (!Array.isArray(products)) return '[]';
    const lightweight = products.map((p) => {
      const copy: any = { ...p };
      if (typeof copy.img === 'string' && copy.img.startsWith('data:')) {
        copy.img = '';
      }
      if (typeof copy.image === 'string' && copy.image.startsWith('data:')) {
        copy.image = '';
      }
      if (typeof copy.image_url === 'string' && copy.image_url.startsWith('data:')) {
        copy.image_url = '';
      }
      if (Array.isArray(copy.images)) {
        copy.images = copy.images.map((img: any) => ({
          ...img,
          url: typeof img?.url === 'string' && img.url.startsWith('data:') ? '' : img.url
        }));
      }
      return copy;
    });
    return JSON.stringify(lightweight);
  } catch (err) {
    console.warn('[StorageHelper] Failed to prepare products for storage:', err);
    return '[]';
  }
}

/**
 * Safely stores a key-value pair in localStorage with automatic quota recovery.
 * Never throws an unhandled exception or crashes the React component tree.
 */
export function safeSetItem(key: string, value: string): boolean {
  if (typeof window === 'undefined' || !window.localStorage) {
    return false;
  }

  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (err: any) {
    const isQuotaError =
      err?.name === 'QuotaExceededError' ||
      err?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err?.code === 22 ||
      err?.code === 1014 ||
      (err?.message && err.message.toLowerCase().includes('quota'));

    if (isQuotaError) {
      console.warn(`[StorageHelper] Quota exceeded while storing "${key}". Attempting cleanup...`);
      try {
        // Clear non-essential large caches first
        window.localStorage.removeItem('sabjies_rv');
        window.localStorage.removeItem('sabjies_reviews');
        
        // If the problematic key is products, try storing the lightweight version
        if (key === 'sabjies_products') {
          try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
              const strippedJson = prepareProductsForStorage(parsed);
              window.localStorage.setItem(key, strippedJson);
              return true;
            }
          } catch {
            // Remove corrupted key to restore quota
            window.localStorage.removeItem('sabjies_products');
          }
        } else {
          // Retry the setItem once after clearing non-essential caches
          window.localStorage.setItem(key, value);
          return true;
        }
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
