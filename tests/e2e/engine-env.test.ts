// Guard for the cloud engine env allowlist (workers/career-cloud/worker.ts
// engineEnv): the engine child (scripts/apply.ts) is spawned with
// clearEnv:true and ONLY the allowlisted keys, so an operator posture
// knob that is not on the list silently never reaches the browser. The
// measured casualty was UPMORE_CHROMIUM_SANDBOX — the product's own
// documented opt-out for hosts that cannot run any sandboxed Chromium
// for any user (portal-browser-helper.cjs header, v224 combine): set on
// the worker process, dropped by the allowlist, and every cloud drive
// on such a host died as a generic DRIVER_ERROR
// (docs/e2e/H4-DRIVER-ERROR-ROOT-CAUSE.md). The boundary itself is
// pinned too: job-controlled or credential-shaped keys must NOT cross.
import { engineEnv, ENGINE_ENV_KEYS } from "../../workers/career-cloud/worker.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("ASSERT: " + msg);
}

Deno.test("engineEnv forwards the operator sandbox posture to the engine child", () => {
  const parent = (k: string) => ({
    UPMORE_CHROMIUM_SANDBOX: "off",
    UPMORE_CHROMIUM_PATH: "/opt/stage/browsers/chromium/chrome",
    UPMORE_PLAYWRIGHT_PATH: "/opt/stage/node_modules/playwright",
    PLAYWRIGHT_BROWSERS_PATH: "/opt/stage/browsers",
    PATH: "/usr/bin:/bin", HOME: "/opt/stage/home", TMPDIR: "/opt/stage/tmp",
  } as Record<string, string>)[k];
  const env = engineEnv(parent);
  assert(env.UPMORE_CHROMIUM_SANDBOX === "off",
    "UPMORE_CHROMIUM_SANDBOX must cross the allowlist — got " + JSON.stringify(env));
  assert(env.UPMORE_CHROMIUM_PATH === "/opt/stage/browsers/chromium/chrome", "chromium path still forwarded");
  assert(ENGINE_ENV_KEYS.includes("UPMORE_CHROMIUM_SANDBOX"), "allowlist names the key");
});

Deno.test("engineEnv still refuses non-allowlisted keys (the boundary is the point)", () => {
  const parent = (k: string) => ({
    SUPABASE_SERVICE_ROLE_KEY: "must-not-cross",
    CAREER_RPC_SELECTOR: "must-not-cross",
    JOB_PAYLOAD_JSON: "must-not-cross",
    UPMORE_CHROMIUM_SANDBOX: "off",
  } as Record<string, string>)[k];
  const env = engineEnv(parent);
  assert(!("SUPABASE_SERVICE_ROLE_KEY" in env), "service credential must not cross");
  assert(!("CAREER_RPC_SELECTOR" in env), "RPC selector must not cross");
  assert(!("JOB_PAYLOAD_JSON" in env), "job payload must not cross");
  assert(env.UPMORE_MASK_SCREENSHOTS === "1" && env.UPMORE_BROWSER_HEADED === "0", "fixed postures unchanged");
});
