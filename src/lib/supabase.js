import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env ou na Cloudflare Pages.')
}

export const supabase = createClient(supabaseUrl || 'https://example.supabase.co', supabaseAnonKey || 'missing-key', {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})
