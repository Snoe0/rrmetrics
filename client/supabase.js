const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://pmvrsprcwolttzdvuuyp.supabase.co';
// Publishable key — safe to expose client-side, respects RLS
// Replace with your sb_publishable_... key from Supabase dashboard → Project Settings → API
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_NL91jvhAxAxFfJv3lRshSw_hp7oRHVJ';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

module.exports = { supabase };
