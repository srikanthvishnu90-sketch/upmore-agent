// Where the extension signs in and records applications. The Supabase URL and anon key are the app's own public values
// (src/upmore-app-template.html: UPMORE_BACKEND_URL, UPMORE_ANON_KEY); the anon key is public by design and every read
// and write goes through the person's own session and row-level security. A person may point the extension elsewhere
// in the panel's settings (kept in chrome.storage.local); no secret is ever configured here.
globalThis.TRAINEE_DEFAULTS = {
  supabaseUrl: "https://mrwngntwmnaqrqhupvlt.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yd25nbnR3bW5hcXJxaHVwdmx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMzk1MDksImV4cCI6MjEwNTYxNTUwOX0.BZKqFIUdjLU_eLuTQecxsHdhIQu1GprTbZmkAPO6p88",
  appUrl: "https://upmore-topaz.vercel.app",
};
