// The owner's invite waves (GB-01), run by hand: nothing here is scheduled, and nothing is sent without his approval of
// the exact text and count. Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
//
//   deno run -A scripts/launch/invite-wave.ts gates
//       the live gates and the recommended next wave size (double / hold / close)
//   deno run -A scripts/launch/invite-wave.ts open --size 100 --key wave-1 [--override "why"]
//       picks the next 100 waitlist people in signup order as invites; sends nothing. The same key again is a no-op.
//   deno run -A scripts/launch/invite-wave.ts list --wave 1 --out wave-1.csv
//       the invite list (phone, state, signup time) to a local file, for the owner's review
//   deno run -A scripts/launch/invite-wave.ts approve --wave 1 --text-file invite.txt --count 100 --sha256 <hash>
//       approves exactly that template (it must name Trainee, say STOP, and hold {link} and/or {telegram}) for exactly
//       that many invites. Run once without --sha256 to print the hash of the file.
//   deno run -A scripts/launch/invite-wave.ts send --wave 1 [--max 50]
//       sends the approved wave through LoopMessage (LOOPMESSAGE_API_KEY), with TRAINEE_APP_URL and/or
//       TELEGRAM_BOT_USERNAME for the links; stops on a failing gate, outside quiet hours, or at --max.
import { loopSend } from "../../supabase/functions/_shared/loopmessage.ts";
import { type Rpc, sendWave, sha256Hex } from "../../supabase/functions/_shared/career_invites.ts";

export function restRpc(url: string, key: string, f: typeof fetch = fetch): Rpc {
  return {
    async rpc(name, args = {}) {
      const r = await f(`${url.replace(/\/+$/, "")}/rest/v1/rpc/${name}`, {
        method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(args),
      });
      const text = await r.text();
      if (!r.ok) return { data: null, error: { message: `${r.status} ${text.slice(0, 300)}` } };
      return { data: text ? JSON.parse(text) : null, error: null };
    },
  };
}

function flag(args: string[], name: string): string | null {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}
async function must(p: PromiseLike<{ data: any; error: { message: string } | null }>) {
  const r = await p;
  if (r.error) { console.error(r.error.message); Deno.exit(1); }
  return r.data;
}

if (import.meta.main) {
  const [cmd, ...args] = Deno.args;
  const url = Deno.env.get("SUPABASE_URL") || "", key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) { console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"); Deno.exit(2); }
  const db = restRpc(url, key), now = () => new Date().toISOString();
  if (cmd === "gates") {
    console.log(JSON.stringify(await must(db.rpc("career_wave_recommendation", { p_now: now() })), null, 2));
  } else if (cmd === "open") {
    console.log(JSON.stringify(await must(db.rpc("career_wave_open", { p_size: Number(flag(args, "size")), p_key: flag(args, "key"), p_override_reason: flag(args, "override"), p_now: now() })), null, 2));
  } else if (cmd === "list") {
    const rows = await must(db.rpc("career_wave_invite_list", { p_wave: Number(flag(args, "wave")) })) as any[];
    const out = flag(args, "out");
    if (!out) { console.error("--out <file> is required (the list holds phone numbers; it is not printed)"); Deno.exit(2); }
    await Deno.writeTextFile(out, ["invite_id,phone,state,signed_up_at", ...rows.map((r) => `${r.invite_id},${r.phone},${r.state},${r.signed_up_at}`)].join("\n") + "\n");
    console.log(`${rows.length} invites written to ${out}`);
  } else if (cmd === "approve") {
    const text = (await Deno.readTextFile(String(flag(args, "text-file")))).replace(/\n+$/, "");
    const sha = await sha256Hex(text);
    if (flag(args, "sha256") !== sha) { console.log(`The text to approve is:\n---\n${text}\n---\nsha256 ${sha}\nRun again with --sha256 ${sha} --count <n> to approve exactly it.`); Deno.exit(0); }
    console.log(JSON.stringify(await must(db.rpc("career_wave_approve_send", { p_wave: Number(flag(args, "wave")), p_text: text, p_text_sha256: sha, p_count: Number(flag(args, "count")), p_now: now() }))));
  } else if (cmd === "send") {
    const apiKey = Deno.env.get("LOOPMESSAGE_API_KEY") || "";
    if (!apiKey) { console.error("NOT_WIRED: LOOPMESSAGE_API_KEY is not set; nothing was sent"); Deno.exit(2); }
    const max = flag(args, "max");
    const r = await sendWave({ db, wave: Number(flag(args, "wave")), send: loopSend({ apiKey }), env: Deno.env, now: Date.now, ...(max ? { max: Number(max) } : {}) });
    console.log(JSON.stringify({ sent: r.sent, failed: r.failed, stopped_by: r.stoppedBy }, null, 2));
  } else {
    console.error("usage: invite-wave.ts gates | open | list | approve | send (see the header)");
    Deno.exit(2);
  }
}
