// Vault & documents answered from code (real-world C142 breach lockdown, C153 secure document vault, C155 tax
// document folder, C157 mileage log, C158 charitable receipt roundup, C203 organize financial documents): thin
// wrapper over packages/domain/118-vault-docs.js (VaultDocs, through the router bundle). The person's facts live
// where the deadlines facts live — their settings row's watches, one kind per fact, no migration:
//   breach_record { service, disclosed_on, source, exposed[] }        credential_account { service, vault_ref,
//     reuses_breached_password, payment_card_on_file, card_issuer }   agent_session { device, location, current }
//   vault_doc { doc_kind, subkind, title, issuer, location, sha256, year, expires_on }   vault_gate { answer_hash }
//   tax_expectation { form, issuer } (with tax_year on the settings read)             trip { on, from, to, miles,
//     purpose, trip_kind, confirmed, commute }                        charity { name }   donation_receipt { org,
//     amount_cents, on }                                              organize_file { name, sha256, doc_kind, ... }
// (doc_kind / trip_kind because a watch's own "kind" is its fact kind, never the document's or the trip's.)
// With no facts on file every answer is the honest NOT_WIRED / no-facts line from the domain module — nothing is
// invented. Secrets discipline: a watch carrying a secret value makes the domain guard refuse the whole answer
// rather than store or show it. Donations read the person's own transaction rows (the shared readTx shape).
import { VaultDocs } from "../../_shared/router_core.js";

const ofKind = (watches: any[], kind: string) => (Array.isArray(watches) ? watches : []).filter((w) => w && w.kind === kind && w.status !== "inactive");

export function vaultDocsKind(message: string, previous: any[] = []): string | null {
  const prev = [...(previous || [])].reverse().find((m) => m.role === "assistant");
  const p = String((prev && prev.content) || "");
  if (/verification question/.test(p)) return "vault_gate_answer";
  if (/breach lockdown/i.test(p) && /^(yes|do it|go ahead)\b/i.test(String(message || "").trim())) return "breach_execute";
  if (/send (it|the folder|the summary) to my cpa/i.test(String(message || "")) && /(tax folder|donation receipts)/i.test(p)) return "cpa_packet";
  if (/airport trip was business/i.test(String(message || "")) && /mileage log/i.test(p)) return "mileage_confirm";
  if (/^(doorstep|take me to|open the)/i.test(String(message || "").trim()) && /(lockdown run|tax folder|^Organized)/i.test(p)) return "doorstep";
  return (VaultDocs as any).ask(message);
}

export async function vaultDocsReply(message: string, now: Date, reads: {
  watches?: () => Promise<any[]> | any[];
  transactions?: () => Promise<any[]> | any[];
  previous?: () => Promise<any[]> | any[];
  taxYear?: number;
} = {}, _opts: { tz?: string } = {}): Promise<string | null> {
  const previous = reads.previous ? await reads.previous() : [];
  if (!vaultDocsKind(message, previous)) return null;
  const watches = reads.watches ? await reads.watches() : [];
  const tx = reads.transactions ? await reads.transactions() : [];
  const year = now.getUTCFullYear();
  const breachW = ofKind(watches, "breach_record")[0] || null;
  const taxYear = reads.taxYear || year - 1;
  const opts = {
    previous: [...(previous || [])].reverse(), // readPrevious is newest-first; the domain reads the last assistant turn
    log: [] as any[],
    breachCtx: {
      breach: breachW,
      accounts: ofKind(watches, "credential_account"),
      sessions: ofKind(watches, "agent_session"),
    },
    docs: ofKind(watches, "vault_doc").map((w: any) => ({ ...w, kind: w.doc_kind })),
    gate: ofKind(watches, "vault_gate")[0] || null,
    tax: { year: taxYear, expected: ofKind(watches, "tax_expectation"), docs: ofKind(watches, "vault_doc").map((w: any) => ({ ...w, kind: w.doc_kind })) },
    charity: {
      year,
      charities: ofKind(watches, "charity").map((w: any) => w.name),
      transactions: (tx || []).map((t: any) => ({ ...t, posted_at: t.posted_at || t.posted_on })),
      receipts: ofKind(watches, "donation_receipt"),
    },
    trips: ofKind(watches, "trip").map((w: any) => ({ ...w, kind: w.trip_kind })),
    files: ofKind(watches, "organize_file").map((w: any) => ({ ...w, kind: w.doc_kind })),
    year,
    stand_in: false,
  };
  try {
    return (VaultDocs as any).answer(message, now.getTime(), opts);
  } catch {
    // The domain guard refused (a secret value in the person's stored facts): say so, show nothing.
    return "I can't run that: a stored fact for it carries a secret value (a password, code or identity number), and those are never stored or shown here. Remove it from your vault facts on your device and ask again.";
  }
}
