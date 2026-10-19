// Trainee landing page — waitlist capture (PUBLIC endpoint).
//
// The static page (trainee-six.vercel.app, source ~/workspace/trainee-site)
// POSTs JSON here:
//   { list: 'waitlist', name, phone, consent, consentText, consentAt, source }
// and treats any non-2xx as a failure shown to the visitor.
//
// verify_jwt is OFF on purpose: this is a public capture endpoint and the
// page ships no credentials. Rows land in public.site_waitlist, which has
// RLS enabled and NO public policies — this function writes with the
// service role, and nothing else can read or write the table.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const name = String(body.name ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  if (!name || !phone) {
    return json({ error: "name and phone are required" }, 400);
  }
  if (body.consent !== true) {
    return json({ error: "consent is required" }, 400);
  }

  // consentAt comes from the page as an ISO string; keep it only if it
  // parses, otherwise store null rather than failing the signup.
  let consentAt: string | null = null;
  if (body.consentAt != null) {
    const raw = String(body.consentAt);
    if (!Number.isNaN(Date.parse(raw))) consentAt = raw;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const res = await fetch(`${supabaseUrl}/rest/v1/site_waitlist`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      name,
      phone,
      consent: true,
      consent_text: body.consentText != null ? String(body.consentText) : null,
      consent_at: consentAt,
      source: body.source != null ? String(body.source) : null,
    }),
  });

  if (!res.ok) {
    console.error("site-signup insert failed", res.status, await res.text());
    return json({ error: "could not save signup" }, 500);
  }
  return json({ ok: true });
});
