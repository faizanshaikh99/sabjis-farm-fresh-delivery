import { createClient, SupabaseClient } from '@supabase/supabase-js';

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
    return {
      select: async () => ({ data: [], error: null }),
      insert: async () => ({ data: null, error: null }),
      update: async () => ({ data: null, error: null }),
      delete: async () => ({ data: null, error: null }),
    };
  }
};
