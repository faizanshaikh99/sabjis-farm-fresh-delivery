/**
 * Safe API and JSON response parsing utility
 * Prevents "Unexpected token '<', '<!DOCTYPE '... is not valid JSON" crashes
 * by safely inspecting Content-Type and response payload before parsing.
 */

export async function safeJson<T = any>(res: Response | null | undefined, fallback: any = null): Promise<T> {
  if (!res) return fallback;

  try {
    const text = await res.text();
    if (!text || typeof text !== 'string') {
      return fallback;
    }

    const trimmed = text.trim();
    // Detect HTML responses (e.g. <!DOCTYPE html> or <html> from 404/500/SPA fallback)
    if (trimmed.startsWith('<') || trimmed.toLowerCase().startsWith('<!doctype')) {
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
    const headers = new Headers(init?.headers || {});
    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json, text/plain, */*');
    }

    const res = await fetch(input, {
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
      error: netErr?.message || 'Network request failed'
    };
  }
}
