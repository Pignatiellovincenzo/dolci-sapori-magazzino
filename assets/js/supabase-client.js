// Valori pubblici: protetti dalle policy RLS lato database, non da qui.
const SUPABASE_URL = 'https://mzvnqtdyxpjciqmqmeby.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16dm5xdGR5eHBqY2lxbXFtZWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0ODMzMzgsImV4cCI6MjEwNTA1OTMzOH0.mIB7vHd6-M9jP4uzHBMw5j1fxtg7DeONzWyxWGIBbtg';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
