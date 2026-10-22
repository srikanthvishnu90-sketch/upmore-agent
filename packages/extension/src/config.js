/* Trainee assisted-apply extension — sync configuration.
 *
 * The Supabase project URL and the ANON key are the product's public
 * client coordinates (the web app ships the same anon key in its
 * bundle; it identifies the project, it is not a credential — every
 * extension-sync call is authorized by the signed-in user's own JWT,
 * verified server-side). The service_role key is NEVER here.
 */
const TRAINEE_SYNC_CONFIG = {
  supabaseUrl: "https://mrwngntwmnaqrqhupvlt.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yd25nbnR3bW5hcXJxaHVwdmx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMzk1MDksImV4cCI6MjEwNTYxNTUwOX0.BZKqFIUdjLU_eLuTQecxsHdhIQu1GprTbZmkAPO6p88",
  functionName: "extension-sync",
};
if (typeof self !== "undefined") self.TRAINEE_SYNC_CONFIG = TRAINEE_SYNC_CONFIG;
