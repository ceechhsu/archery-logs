// Supabase configuration
const SUPABASE_URL = 'https://mcuewzdjudvbrfnkastz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jdWV3emRqdWR2YnJmbmthc3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NjI4OTEsImV4cCI6MjA4NzEzODg5MX0.dFSE9yaYHuNcy0K-xaKTd_OT0tDDf7KFjAL-HXZMbco';

// The CDN exposes `supabase` as the library namespace.
// We create the client and assign it to `window.sb` to avoid name collision.
window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
