// D-036 (2026-11-01): the texting voice (_shared/channel_voice.ts) is on by default, from the committed release config
// (agent-chat/release_config.ts PRODUCTION_TEXTING_NATIVE, the D-035 module), not from a hand-set secret. The environment
// can only roll it back: CAREER_TEXTING_NATIVE=off renders exactly as before; unset, "on" or any other value serves the
// release value; a release value of "off" is never turned on from the environment.
import { imessageNativeRender, textingNativeOn } from "../../supabase/functions/_shared/channel_voice.ts";
import { adaptersFromEnv } from "../../supabase/functions/_shared/channel_registry.ts";
import { toBubbles } from "../../supabase/functions/_shared/conversation.ts";

// Read whole (not by name) so the fail-first run on a tree without the D-036 exports fails each test, not the import.
const RC: any = await import("../../supabase/functions/agent-chat/release_config.ts");
const { PRODUCTION_TEXTING_NATIVE } = RC;
const servedTextingVoice = (e: { get(k: string): string | undefined }, r?: string) => RC.servedTextingVoice(e, r);
const eq = (a: unknown, b: unknown, m = "") => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}\n got ${JSON.stringify(a)}\nwant ${JSON.stringify(b)}`); };
const env = (o: Record<string, string>) => ({ get: (k: string) => o[k] });

Deno.test("the committed release value is on, and it is read as one quoted line", () => {
  eq(PRODUCTION_TEXTING_NATIVE, "on", "PRODUCTION_TEXTING_NATIVE");
  const src = Deno.readTextFileSync(new URL("../../supabase/functions/agent-chat/release_config.ts", import.meta.url));
  eq(/^export const PRODUCTION_TEXTING_NATIVE(?:\s*:\s*TextingVoice)?\s*=\s*"(on|off)"\s*;/m.exec(src)?.[1], "on", "one quoted line");
});

Deno.test("unset serves the voice; only CAREER_TEXTING_NATIVE=off rolls it back; the environment never turns on a voice the release did not ship", () => {
  eq(servedTextingVoice(env({})), "on", "unset");
  eq(textingNativeOn(env({})), true, "textingNativeOn unset");
  eq(servedTextingVoice(env({ CAREER_TEXTING_NATIVE: "on" })), "on", "on");
  eq(servedTextingVoice(env({ CAREER_TEXTING_NATIVE: "yes" })), "on", "a typo keeps the release value");
  eq(servedTextingVoice(env({ CAREER_TEXTING_NATIVE: " OFF " })), "off", "off, any case and spacing");
  eq(textingNativeOn(env({ CAREER_TEXTING_NATIVE: "off" })), false, "textingNativeOn off");
  eq(servedTextingVoice(env({ CAREER_TEXTING_NATIVE: "on" }), "off"), "off", "a release of off is never turned on");
});

Deno.test("every adapter built from the secrets renders in the texting voice with the flag unset, and as before with it off", () => {
  const reply = "Here are 2 roles.\nData Analyst at Brex (https://job-boards.greenhouse.io/brex/jobs/7005005) — Chicago. Data Analyst at Notion (https://job-boards.greenhouse.io/notion/jobs/7007007) — Chicago.\nWant me to rank them?";
  const refuse = (async () => { throw new TypeError("no network"); }) as unknown as typeof fetch;
  const base = { LOOPMESSAGE_API_KEY: "k", TELEGRAM_BOT_TOKEN: "t", WHATSAPP_TOKEN: "w", WHATSAPP_PHONE_NUMBER_ID: "1" };
  const deps = { fetch: refuse, clock: () => 0, sleep: async () => {} };
  const unset = adaptersFromEnv(env(base), deps), off = adaptersFromEnv(env({ ...base, CAREER_TEXTING_NATIVE: "off" }), deps);
  eq(unset.imessage!.render(reply), imessageNativeRender(reply), "iMessage, unset: the texting voice");
  eq(off.imessage!.render(reply), toBubbles(reply), "iMessage, off: exactly as before");
  for (const ch of ["telegram", "whatsapp"] as const) {
    const a = unset[ch]!.render(reply), b = off[ch]!.render(reply);
    if (JSON.stringify(a) === JSON.stringify(b)) throw new Error(`${ch}: unset renders the same as off`);
    if (!a.some((m) => m.split("\n").some((l) => l.trim() === "https://job-boards.greenhouse.io/brex/jobs/7005005"))) throw new Error(`${ch}: the link is not alone on its own line: ${JSON.stringify(a)}`);
  }
});
