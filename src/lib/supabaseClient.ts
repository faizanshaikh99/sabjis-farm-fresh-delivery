import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env && import.meta.env.VITE_SUPABASE_URL) || '';
const supabaseAnonKey = (import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) || '';

export const isSupabaseClientConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes('YOUR_SUPABASE') &&
  supabaseUrl.startsWith('http')
);

const dummyChannel = {
  on: () => dummyChannel,
  subscribe: () => dummyChannel,
  unsubscribe: () => {},
};

export const supabaseClient: SupabaseClient | any = isSupabaseClientConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : {
      channel: () => dummyChannel,
      removeChannel: () => {},
      from: () => ({
        select: async () => ({ data: [], error: null }),
        insert: async () => ({ data: null, error: null }),
        update: async () => ({ data: null, error: null }),
        delete: async () => ({ data: null, error: null }),
      }),
    };

