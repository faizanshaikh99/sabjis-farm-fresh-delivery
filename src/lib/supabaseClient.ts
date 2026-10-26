import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Product } from '../types';
import { isKgProduct } from '../utils/weightParser';

export function normalizeProductFromDb(p: any): Product {
  if (!p) return p;
  const isKg = isKgProduct(p);
  const unit = p.unit !== undefined && p.unit !== null && String(p.unit).trim() !== ''
    ? String(p.unit).toLowerCase().trim()
    : (isKg ? 'kg' : 'piece');

  const sp = Number(p.sp !== undefined ? p.sp : (p.base_price_per_kg !== undefined ? p.base_price_per_kg : 0));
  const basePricePerKg = Number(
    p.base_price_per_kg !== null && p.base_price_per_kg !== undefined
      ? p.base_price_per_kg
      : (p.basePricePerKg !== undefined ? p.basePricePerKg : sp)
  );

  const rawSlabs = isKg
    ? (Array.isArray(p.weight_slabs) ? p.weight_slabs : (Array.isArray(p.weightSlabs) ? p.weightSlabs : []))
    : [];

  let rawImages: any[] = [];
  if (Array.isArray(p.images)) {
    rawImages = p.images;
  } else if (typeof p.images === 'string' && p.images.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(p.images);
      if (Array.isArray(parsed)) rawImages = parsed;
    } catch {}
  } else if (Array.isArray(p.image)) {
    rawImages = p.image;
  }

  // Resolve primary image from all column aliases
  let img = String(p.img || p.image || p.image_url || '').trim();
  if (!img && rawImages.length > 0) {
    const first = rawImages[0];
    img = String(typeof first === 'string' ? first : (first?.url || '')).trim();
  }

  // If img is present but rawImages is empty, synthesize a single Cover image item
  if (img && rawImages.length === 0) {
    rawImages = [{ id: `img_${p.id}_0`, url: img, tag: 'Cover', isConfirmed: true, isMatch: true }];
  }

  return {
    id: Number(p.id),
    name: p.name || '',
    cat: p.cat || 'all',
    type: p.type || 'organic',
    cp: Number(p.cp || 0),
    sp,
    basePricePerKg,
    base_price_per_kg: basePricePerKg,
    unit,
    weight: p.weight || (isKg ? 'per kg' : `per ${unit}`),
    discount: p.discount || '',
    img,
    image: img,
    image_url: img,
    images: rawImages,
    emoji: p.emoji || '🥬',
    rating: Number(p.rating || 5.0),
    reviews: Number(p.reviews || 0),
    stockQty: Number(p.stock_qty !== undefined ? p.stock_qty : (p.stockQty !== undefined ? p.stockQty : 50)),
    reservedQty: Number(p.reserved_qty !== undefined ? p.reserved_qty : (p.reservedQty !== undefined ? p.reservedQty : 0)),
    lowAt: Number(p.low_at !== undefined ? p.low_at : (p.lowAt !== undefined ? p.lowAt : 10)),
    weightSlabs: rawSlabs,
    weight_slabs: rawSlabs,
    pricingMode: isKg ? (p.pricing_mode || p.pricingMode || (rawSlabs.length > 0 ? 'slabs' : 'auto')) : 'auto',
    description: p.description || ''
  };
}

const supabaseUrl = (import.meta.env && import.meta.env.VITE_SUPABASE_URL) || '';
const supabaseAnonKey = (import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) || '';

export const isSupabaseClientConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes('YOUR_SUPABASE') &&
  supabaseUrl.startsWith('http')
);

type PostgresChangesFilter = {
  event: string;
  schema?: string;
  table: string;
};

type PostgresChangesPayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  new?: any;
  old?: any;
  table?: string;
  schema?: string;
  timestamp?: string;
};

type PostgresChangesHandler = (payload: PostgresChangesPayload) => void;

interface ChannelListener {
  filter: PostgresChangesFilter;
  callback: PostgresChangesHandler;
}

class RealtimeChannelWrapper {
  name: string;
  private listeners: ChannelListener[] = [];
  private remoteChannel: any = null;
  private statusCallbacks: ((status: string) => void)[] = [];
  private isSubscribed = false;

  constructor(name: string, remoteChannel?: any) {
    this.name = name;
    this.remoteChannel = remoteChannel || null;
  }

  on(type: string, filter: PostgresChangesFilter, callback: PostgresChangesHandler) {
    if (type === 'postgres_changes') {
      this.listeners.push({ filter, callback });
      if (this.remoteChannel) {
        try {
          this.remoteChannel.on(type, filter, callback);
        } catch (e) {}
      }
    }
    return this;
  }

  subscribe(callback?: (status: string) => void) {
    this.isSubscribed = true;
    if (callback) {
      this.statusCallbacks.push(callback);
    }

    if (this.remoteChannel) {
      try {
        this.remoteChannel.subscribe((status: string) => {
          this.notifyStatus(status);
        });
      } catch (e) {
        setTimeout(() => this.notifyStatus('SUBSCRIBED'), 50);
      }
    } else {
      setTimeout(() => this.notifyStatus('SUBSCRIBED'), 50);
    }
    return this;
  }

  unsubscribe() {
    this.isSubscribed = false;
    try {
      this.remoteChannel?.unsubscribe?.();
    } catch (e) {}
    this.listeners = [];
  }

  dispatch(eventData: PostgresChangesPayload) {
    if (!this.isSubscribed) return;
    for (const listener of this.listeners) {
      const matchTable =
        !listener.filter.table ||
        listener.filter.table === '*' ||
        listener.filter.table === eventData.table;

      const matchEvent =
        !listener.filter.event ||
        listener.filter.event === '*' ||
        listener.filter.event === eventData.eventType;

      if (matchTable && matchEvent) {
        try {
          listener.callback(eventData);
        } catch (err) {
          console.error('[RealtimeChannel] Listener error:', err);
        }
      }
    }
  }

  notifyStatus(status: string) {
    for (const cb of this.statusCallbacks) {
      try {
        cb(status);
      } catch (e) {}
    }
  }
}

// Global Event Hub connecting SSE (/api/realtime/events) and cross-tab BroadcastChannel
export class AppRealtimeHub {
  private static instance: AppRealtimeHub;
  private channels = new Map<string, RealtimeChannelWrapper>();
  private eventSource: EventSource | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private reconnectTimer: any = null;

  private constructor() {
    if (typeof window !== 'undefined') {
      this.initBroadcastChannel();
      this.initEventSource();
    }
  }

  static getInstance(): AppRealtimeHub {
    if (!AppRealtimeHub.instance) {
      AppRealtimeHub.instance = new AppRealtimeHub();
    }
    return AppRealtimeHub.instance;
  }

  private initBroadcastChannel() {
    try {
      if ('BroadcastChannel' in window) {
        this.broadcastChannel = new BroadcastChannel('sabjies_orders_realtime');
        this.broadcastChannel.onmessage = (ev) => {
          if (ev.data && ev.data.table) {
            this.broadcastToChannels(ev.data);
          }
        };
      }
    } catch (e) {}
  }

  private initEventSource() {
    if (typeof window === 'undefined' || !('EventSource' in window)) return;

    try {
      if (this.eventSource) {
        this.eventSource.close();
      }

      this.eventSource = new EventSource('/api/realtime/events');

      this.eventSource.addEventListener('postgres_changes', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          this.broadcastToChannels(data);
          try {
            this.broadcastChannel?.postMessage(data);
          } catch (err) {}
        } catch (err) {
          console.error('[Realtime SSE] Error parsing payload:', err);
        }
      });

      this.eventSource.onopen = () => {
        console.log('⚡ [Realtime SSE] Connected to server order synchronization channel');
        this.channels.forEach((ch) => ch.notifyStatus('SUBSCRIBED'));
      };

      this.eventSource.onerror = () => {
        this.channels.forEach((ch) => ch.notifyStatus('CLOSED'));
        try {
          this.eventSource?.close();
        } catch (e) {}
        this.eventSource = null;

        // Auto-reconnect after 3 seconds
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
          this.initEventSource();
        }, 3000);
      };
    } catch (err) {
      console.warn('[Realtime Hub] EventSource init warning:', err);
    }
  }

  registerChannel(channel: RealtimeChannelWrapper) {
    this.channels.set(channel.name, channel);
    if (this.eventSource && this.eventSource.readyState === EventSource.OPEN) {
      channel.notifyStatus('SUBSCRIBED');
    }
  }

  removeChannel(name: string) {
    const ch = this.channels.get(name);
    if (ch) {
      ch.unsubscribe();
      this.channels.delete(name);
    }
  }

  broadcastToChannels(data: PostgresChangesPayload) {
    this.channels.forEach((ch) => {
      ch.dispatch(data);
    });
  }

  publish(data: PostgresChangesPayload) {
    this.broadcastToChannels(data);
    try {
      this.broadcastChannel?.postMessage(data);
    } catch (e) {}
  }
}

const remoteSupabase = isSupabaseClientConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const supabaseClient: SupabaseClient | any = {
  channel(name: string) {
    const remoteChan = remoteSupabase?.channel(name);
    const wrapper = new RealtimeChannelWrapper(name, remoteChan);
    AppRealtimeHub.getInstance().registerChannel(wrapper);
    return wrapper;
  },
  removeChannel(channel: any) {
    if (channel && channel.name) {
      AppRealtimeHub.getInstance().removeChannel(channel.name);
    }
    if (remoteSupabase && channel?.remoteChannel) {
      try {
        remoteSupabase.removeChannel(channel.remoteChannel);
      } catch (e) {}
    }
  },
  from: (table: string) => {
    if (remoteSupabase) return remoteSupabase.from(table);
    // Chainable fallback builder
    const mockBuilder: any = {
      select: () => mockBuilder,
      insert: () => mockBuilder,
      update: () => mockBuilder,
      delete: () => mockBuilder,
      upsert: () => mockBuilder,
      eq: () => mockBuilder,
      neq: () => mockBuilder,
      order: () => mockBuilder,
      limit: () => mockBuilder,
      single: async () => ({ data: null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve)
    };
    return mockBuilder;
  }
};
