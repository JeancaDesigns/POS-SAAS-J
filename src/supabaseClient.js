import { createClient } from "@supabase/supabase-js";
const supabaseUrl = 'https://hthubjuykjrpupjmdpih.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0aHVianV5a2pycHVwam1kcGloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMzU5MjIsImV4cCI6MjA5MjYxMTkyMn0.fdO4ds61nF2JGH8rHLgSOWxInTGwGQdcoIMHmfSKjLs'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)