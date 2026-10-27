// FEATURE 16: a resume sent as a WhatsApp document, read through the same path as a resume file on the web and as a text
// attachment (sms_media.ts: host allowlist, size cap while streaming, type and magic-byte agreement, decompression cap).
//
// WhatsApp Cloud API: the webhook carries only the media's id (messages[].document.id), never its address. Meta's documented
// way to the bytes is two requests: GET graph.facebook.com/<version>/<media id> with the access token, which answers the
// media's temporary address; then GET that address with the same token. So, unlike a text attachment, the token is sent, and
// only to hosts the owner listed: graph.facebook.com for the first, WHATSAPP_MEDIA_HOSTS (exact names; unset: nothing is
// fetched) for the second. The id is checked to be digits; the address Meta returns is checked like any other untrusted
// address (https, no user:password@, no port, a listed host, redirects only within that host); the token is never sent
// anywhere else, never logged and never stored.
// A picture is told to send a PDF instead without being downloaded. Nothing here is verified against Meta's live API (the
// build environment cannot reach it): the response fields (url, mime_type, file_size, sha256) are the documented ones.
import type { InboundMessage } from "./channel_adapters.ts";
import { checkBytes, fetchFailReply, fetchMedia, MEDIA_MAX_BYTES, MMS_REPLIES, type MediaResult, safeName, sha256Of } from "./sms_media.ts";
import { REPLIES } from "./career_resume_replies.ts";

export const WHATSAPP_GRAPH_HOST = "graph.facebook.com";
export interface WaMedia { type: "document" | "image"; id: string; mime: string | null; filename: string | null; sha256: string | null }
export type WhatsAppInboundMessage = InboundMessage & { waMedia?: WaMedia };

// The media of one webhook message (messages[] entry), or null when it carries none this path handles.
// deno-lint-ignore no-explicit-any
export function waMediaOf(m: any): { media: WaMedia; caption: string } | null {
  if (m?.type !== "document" && m?.type !== "image") return null;
  const d = m[m.type];
  if (!d || typeof d !== "object" || typeof d.id !== "string" || !d.id) return null;
  return {
    media: { type: m.type, id: d.id.slice(0, 64), mime: typeof d.mime_type === "string" ? d.mime_type.slice(0, 120) : null,
      filename: typeof d.filename === "string" ? d.filename.slice(0, 200) : null, sha256: typeof d.sha256 === "string" ? d.sha256.slice(0, 100) : null },
    caption: typeof d.caption === "string" ? d.caption : "",
  };
}

export async function readWhatsAppMedia(m: WaMedia, o: { token: string; version?: string; hosts: string[]; fetch?: typeof fetch; timeoutMs?: number }): Promise<MediaResult> {
  if (m.type === "image") return { ok: false, reply: REPLIES.image, why: "image" }; // not downloaded: a picture is not read
  if (!o.hosts.length || !o.token) return { ok: false, reply: MMS_REPLIES.not_wired, why: "not_wired" };
  const version = /^v\d{1,2}\.\d{1,2}$/.test(o.version ?? "") ? o.version! : "v21.0";
  if (!/^\d{5,30}$/.test(m.id)) return { ok: false, reply: MMS_REPLIES.blocked, why: "bad_id" };
  const auth = { authorization: `Bearer ${o.token}` };
  const meta = await fetchMedia(`https://${WHATSAPP_GRAPH_HOST}/${version}/${m.id}`, { hosts: [WHATSAPP_GRAPH_HOST], fetch: o.fetch, maxBytes: 64 * 1024, timeoutMs: o.timeoutMs, headers: auth, maxRedirects: 0 });
  if (!meta.ok) return { ok: false, reply: meta.why === "too_large" ? MMS_REPLIES.download : fetchFailReply(meta.why), why: `meta_${meta.why}` };
  let info: { url?: unknown; file_size?: unknown; sha256?: unknown; mime_type?: unknown } = {};
  try { info = JSON.parse(new TextDecoder().decode(meta.bytes)); } catch { return { ok: false, reply: MMS_REPLIES.download, why: "meta_bad_json" }; }
  if (typeof info.url !== "string") return { ok: false, reply: MMS_REPLIES.download, why: "meta_no_url" };
  if (typeof info.file_size === "number" && info.file_size > MEDIA_MAX_BYTES) return { ok: false, reply: MMS_REPLIES.too_large, why: "too_large" };
  const got = await fetchMedia(info.url, { hosts: o.hosts, fetch: o.fetch, timeoutMs: o.timeoutMs, headers: auth });
  if (!got.ok) return { ok: false, reply: fetchFailReply(got.why), why: got.why };
  // The bytes must be the ones Meta described, when it gave a hex checksum.
  const want = [m.sha256, typeof info.sha256 === "string" ? info.sha256 : null].find((x) => x && /^[0-9a-f]{64}$/i.test(x));
  const sha = await sha256Of(got.bytes);
  if (want && want.toLowerCase() !== sha) return { ok: false, reply: MMS_REPLIES.download, why: "checksum" };
  const v = checkBytes(got.bytes, got.type || m.mime || (typeof info.mime_type === "string" ? info.mime_type : ""));
  if (!v.ok) return { ok: false, reply: v.reply, why: v.refusal };
  return { ok: true, upload: { bytes: got.bytes, name: safeName(m.filename, v.ext), mime: v.mime, ref: `wa-file:${m.id}`, sha256: sha } };
}
