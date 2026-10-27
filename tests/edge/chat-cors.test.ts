import { chatOriginAllowed, corsFor, financeCorsFor } from "../../supabase/functions/agent-chat/_shared/chat_cors.ts";
function assert(condition: boolean, label = "CORS assertion failed") { if (!condition) throw new Error(label); }
const allowOf = (fn: (r: Request) => Record<string, string>, origin: string) =>
  fn(new Request("https://example.invalid", { headers: { Origin: origin } }))["Access-Control-Allow-Origin"];

// Launch readiness B7 (2026-10-26): the career chat answers Trainee's pages. The origins are the Vercel project
// "trainee"'s domains and deployment URLs as read on 2026-10-26 (production alias trainee-six.vercel.app).
Deno.test("Trainee's production alias can read authenticated chat responses", () => {
  const result = corsFor(new Request("https://example.invalid", { headers: { Origin: "https://trainee-six.vercel.app" } }));
  assert(result["Access-Control-Allow-Origin"] === "https://trainee-six.vercel.app");
  assert(result.Vary === "Origin");
  assert(result["Access-Control-Allow-Methods"] === "POST, OPTIONS");
});
Deno.test("Trainee's project, branch and preview deployment URLs are allowed, each exactly", () => {
  for (const origin of [
    "https://trainee-srikanthvishnu90-sketchs-projects.vercel.app",
    "https://trainee-git-main-srikanthvishnu90-sketchs-projects.vercel.app",
    "https://trainee-git-trunk-srikanthvishnu90-sketchs-projects.vercel.app",
    // preview URLs read from the project's deployments on 2026-10-26
    "https://trainee-r2iquiusr-srikanthvishnu90-sketchs-projects.vercel.app",
    "https://trainee-8ytdnd6kb-srikanthvishnu90-sketchs-projects.vercel.app",
  ]) assert(allowOf(corsFor, origin) === origin, origin);
});
Deno.test("untrusted and lookalike origins receive no CORS grant", () => {
  for (const origin of [
    "https://evil.invalid", "https://trainee-six.vercel.app.evil.invalid", "https://other.vercel.app", "null", "",
    "http://trainee-six.vercel.app", "https://trainee-six.vercel.app:8443", "https://xtrainee-six.vercel.app",
    // another team's scope that ends in this team's name, or a longer middle part: not this team's deployments
    "https://trainee-r2iquiusr-evil-srikanthvishnu90-sketchs-projects.vercel.app",
    "https://trainee-git-feature-evil-srikanthvishnu90-sketchs-projects.vercel.app",
    "https://trainee-r2iquiusrx-srikanthvishnu90-sketchs-projects.vercel.app",
    "https://trainee-R2IQUIUSR-srikanthvishnu90-sketchs-projects.vercel.app",
    "https://trainee-r2iquiusr-srikanthvishnu90-sketchs-projects.vercel.app.evil.invalid",
  ]) {
    assert(!("Access-Control-Allow-Origin" in corsFor(new Request("https://example.invalid", { headers: { Origin: origin } }))), origin);
    assert(!chatOriginAllowed(origin), origin);
  }
});
Deno.test("the Upmore finance app's origins reach only the finance functions, never the career chat", () => {
  for (const origin of ["https://upmore-topaz.vercel.app", "https://upmore-srikanthvishnu90-sketchs-projects.vercel.app"]) {
    assert(allowOf(corsFor, origin) === undefined, `career chat refuses ${origin}`);
    assert(allowOf(financeCorsFor, origin) === origin, `finance functions allow ${origin}`);
  }
  assert(allowOf(financeCorsFor, "https://trainee-six.vercel.app") === undefined, "the finance functions do not answer Trainee's pages");
});
Deno.test("the finance functions and the career functions import the CORS they are meant to", async () => {
  const read = (p: string) => Deno.readTextFile(new URL(`../../supabase/functions/${p}`, import.meta.url));
  for (const f of ["broker-oauth-start/index.ts", "manual-connect/index.ts", "agent-chat/handler.ts"]) {
    assert(/import \{ financeCorsFor as corsFor \} from/.test(await read(f)), `${f} uses the finance origins`);
  }
  for (const f of ["agent-chat/handler-career.ts", "career-email-code/index.ts", "career-essay-draft/index.ts", "career-voice/index.ts"]) {
    assert(/import \{ corsFor \} from/.test(await read(f)) && !/financeCorsFor/.test(await read(f)), `${f} uses Trainee's origins`);
  }
});
