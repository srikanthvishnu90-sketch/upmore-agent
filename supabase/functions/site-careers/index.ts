// Trainee landing page — careers talent-pool capture (PUBLIC endpoint).
//
// The static page (trainee-six.vercel.app, source ~/workspace/trainee-site)
// POSTs multipart form data here: name, email, resume (a File; the page
// restricts it to PDF/Word, max 10 MB) and treats any non-2xx as a failure
// shown to the visitor.
//
// The resume file goes to the PRIVATE storage bucket `careers-resumes`; a
// metadata row lands in public.site_careers_applications (RLS enabled, NO
// public policies — this function uses the service role for both writes).
//
// verify_jwt is OFF on purpose: public capture endpoint, the page ships no
// credentials.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BYTES = 10 * 1024 * 1024;
const BUCKET = "careers-resumes";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "expected multipart form data" }, 400);
  }

  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const file = form.get("resume");
  if (!name || !email) {
    return json({ error: "name and email are required" }, 400);
  }
  if (!(file instanceof File)) {
    return json({ error: "resume file is required" }, 400);
  }
  if (file.size > MAX_BYTES) {
    return json({ error: "file is over 10 MB" }, 413);
  }

  const rawExt = (file.name.split(".").pop() ?? "").toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const path = `${crypto.randomUUID()}.${rawExt || "bin"}`;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  };

  const upload = await fetch(
    `${supabaseUrl}/storage/v1/object/${BUCKET}/${path}`,
    {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "false",
      },
      body: await file.arrayBuffer(),
    },
  );
  if (!upload.ok) {
    console.error(
      "site-careers upload failed",
      upload.status,
      await upload.text(),
    );
    return json({ error: "could not store resume" }, 500);
  }

  const insert = await fetch(
    `${supabaseUrl}/rest/v1/site_careers_applications`,
    {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ name, email, resume_path: path }),
    },
  );
  if (!insert.ok) {
    console.error(
      "site-careers insert failed",
      insert.status,
      await insert.text(),
    );
    // Best effort: don't leave an orphaned resume with no metadata row.
    await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${path}`, {
      method: "DELETE",
      headers: authHeaders,
    }).catch(() => {});
    return json({ error: "could not save application" }, 500);
  }

  return json({ ok: true });
});
