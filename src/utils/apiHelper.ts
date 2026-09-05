/**
 * Safe API and JSON response parsing utility
 * Handles VITE_API_URL backend routing and prevents
 * "Unexpected token '<', '<!DOCTYPE '... is not valid JSON" crashes.
 */

export function getApiBaseUrl(): string {
  const envUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) || '';
  if (!envUrl || typeof envUrl !== 'string') return '';
  const trimmed = envUrl.trim().replace(/\/+$/, '');

  if (typeof window !== 'undefined' && window.location) {
    const isPageLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isEnvLocalhost = trimmed.includes('localhost') || trimmed.includes('127.0.0.1');
    // Prevent HTTPS/remote pages from attempting to fetch local loopback addresses (causes Failed to fetch)
    if (isEnvLocalhost && !isPageLocalhost) {
      return '';
    }

    // If base URL matches the current page origin, use relative paths directly
    if (trimmed === window.location.origin) {
      return '';
    }
  }

  return trimmed;
}

export function apiUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${cleanPath}` : cleanPath;
}

export async function safeJson<T = any>(res: Response | null | undefined, fallback: any = null): Promise<T> {
  if (!res) return fallback;

  try {
    const text = await res.text();
    if (!text || typeof text !== 'string') {
      return fallback;
    }

    const trimmed = text.trim();
    // Detect HTML responses (e.g. <!DOCTYPE html> or <html> from 404/500/SPA fallback)
    if (trimmed.startsWith('<') || trimmed.toLowerCase().startsWith('<!doctype') || trimmed.toLowerCase().startsWith('<html')) {
      console.warn(`[SafeJSON] Received HTML instead of JSON for ${res.url || 'request'} (Status: ${res.status})`);
      return fallback;
    }

    return JSON.parse(trimmed) as T;
  } catch (err) {
    console.warn('[SafeJSON] Failed to parse response as JSON:', err);
    return fallback;
  }
}

export async function safeFetch<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit,
  fallback: T = null as unknown as T
): Promise<{ ok: boolean; status: number; data: T; error?: string }> {
  try {
    let targetUrl: RequestInfo | URL = input;
    if (typeof input === 'string' && input.startsWith('/api')) {
      targetUrl = apiUrl(input);
    }

    const headers = new Headers(init?.headers || {});
    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json, text/plain, */*');
    }

    const res = await fetch(targetUrl, {
      ...init,
      headers
    });

    const data = await safeJson<T>(res, fallback);
    const isSuccess = res.ok && data !== null;

    let errorMessage: string | undefined;
    if (!res.ok) {
      errorMessage = (data as any)?.error || (data as any)?.message || `HTTP ${res.status}: ${res.statusText}`;
    }

    return {
      ok: res.ok,
      status: res.status,
      data: data !== null ? data : fallback,
      error: errorMessage
    };
  } catch (netErr: any) {
    console.warn(`[SafeFetch] Network/Fetch error for ${String(input)}:`, netErr);
    return {
      ok: false,
      status: 0,
      data: fallback,
      error: netErr?.message || 'Network request failed. Please check your connection or backend status.'
    };
  }
}

/**
 * Installs global client-side fetch router and safe JSON guard
 */
export function initApiInterceptor(): void {
  if (typeof window === 'undefined') return;

  const targetGlobal: any = typeof window !== 'undefined' ? window : globalThis;
  const originalFetch = targetGlobal.fetch ? targetGlobal.fetch.bind(targetGlobal) : null;
  if (!originalFetch) return;

  const customFetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    const baseUrl = getApiBaseUrl();
    let resolvedInput = input;
    const isApiRequest = typeof input === 'string' && input.startsWith('/api');

    if (isApiRequest && baseUrl) {
      resolvedInput = `${baseUrl}${input}`;
    }

    let response: Response;
    try {
      response = await originalFetch(resolvedInput, init);
    } catch (networkErr) {
      if (isApiRequest && baseUrl) {
        console.warn(`[initApiInterceptor] Failed reaching ${resolvedInput}, trying relative path:`, networkErr);
        response = await originalFetch(input, init);
      } else {
        throw networkErr;
      }
    }

    // Protect callers against "Unexpected token '<', <!DOCTYPE... is not valid JSON"
    if (isApiRequest || (response && response.headers.get('content-type')?.includes('text/html'))) {
      const originalJsonMethod = response.json.bind(response);
      response.json = async function () {
        try {
          const text = await response.text();
          const trimmed = text.trim();
          if (trimmed.startsWith('<') || trimmed.toLowerCase().startsWith('<!doctype') || trimmed.toLowerCase().startsWith('<html')) {
            console.warn(`[SafeJSON Interceptor] Endpoint ${response.url || String(input)} returned HTML (Status: ${response.status}) instead of JSON. Backend might be spinning up or VITE_API_URL may need configuration.`);
            return null;
          }
          return JSON.parse(text);
        } catch (parseErr) {
          console.warn(`[SafeJSON Interceptor] Failed parsing JSON for ${response.url || String(input)}:`, parseErr);
          return null;
        }
      };
    }

    return response;
  };

  try {
    Object.defineProperty(window, 'fetch', {
      value: customFetch,
      writable: true,
      configurable: true,
      enumerable: true
    });
  } catch (e) {
    try {
      targetGlobal.fetch = customFetch;
    } catch (err) {
      console.warn('[initApiInterceptor] Could not patch global fetch:', err);
    }
  }
}

