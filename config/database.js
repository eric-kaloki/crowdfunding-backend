const { createClient } = require('@supabase/supabase-js');

// OPTIMIZATION 23: Configure Supabase with connection pooling
const supabaseConfig = {
  db: {
    schema: 'public',
  },
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  global: {
    headers: {
      'x-connection-pool': 'true'
    }
  }
};

// OPTIMIZATION 24: Create optimized Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  supabaseConfig
);

module.exports = { supabase };
