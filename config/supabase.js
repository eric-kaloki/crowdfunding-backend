const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing Supabase credentials');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

const initializeSupabase = async () => {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
    } else {
      console.log('Supabase initialized successfully');
    }
  } catch (error) {
    console.error('Failed to initialize Supabase:', error);
  }
};

module.exports = {
  supabase,
  initializeSupabase
};
