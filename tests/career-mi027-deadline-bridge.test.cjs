// MI-027 PERMANENT GUARD (PD-1 close-out, Crew B Cycle 2): the deadline bridge
// 151 composeAlert (carries jd_text) -> alert record -> 152 normalizeCandidate
// (preserves jd_text) -> 152 extractDeadline (quotes it) must hold END TO END
// on the ALERT-FED path for EVERY board shape 121 normalizes, not only the
// Greenhouse shape tests/career-alert-text-flow.test.cjs drives. PD-1's
// historical break (840/840 reminders with deadline null) was exactly a
// blanked jd_text at the 152 normalize step; this suite fails if any leg of
// the bridge drops the posting's own text again, for any ATS.
// Adversarial law pinned here too: a posting whose text carries an ID-shaped
// token next to the word "deadline" (a tracking identifier that merely
// CONTAINS a date-shaped segment) must NOT mint a deadline, and a posting
// with no stated deadline yields deadline null — never an invented date.
// Check: node --test tests/career-mi027-deadline-bridge.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const J = require(path.join(__dirname, "..", "packages/domain/121-career-jobs.js"));
const W = require(path.join(__dirname, "..", "packages/domain/151-career-alert-watch.js"));
const A = require(path.join(__dirname, "..", "packages/domain/152-career-assign.js"));

const T0 = Date.parse("2026-10-14T12:00:00.000Z");
const DEADLINE_JD = "Join our platform team building payment services in Python. You will ship features and write tests. Apply by November 2, 2026.";
const ID_JD = "Join our platform team building payment services in Python. Internal deadline ID: 2026-11-02-4417 — that is a tracking identifier, not a closing date. Applications are reviewed on a rolling basis.";
const PLAIN_JD = "Join our platform team building payment services in Python. You will ship features and write tests. We review applications on a rolling basis.";

const PROFILE = {
  skills: [{ name: "Python", proven: true, fact_id: "TF-111" }],
  degree: "B.S. Computer Science, class of 2029",
  level: "student",
  experience_years: 1,
  experience_text: "built Python payment services",
  constraints: { work_authorization: "US citizen", needs_sponsorship: false, graduation_year: 2029, clearance: null, locations: ["Chicago"] },
  preferences: { role_families: ["SWE"], locations: ["Chicago"], starred_companies: [] },
};

function watchProfile(userId) {
  return A.createWatchProfile(userId, {
    interests: [{
      interest_id: "int-1",
      role: A.roleSpecFor({ split: "Software Engineering Intern / New-Grad" }),
      filters: { locations: ["Chicago"], remote_ok: true, bands: [], firms_include: [], firms_exclude: [] },
    }],
    scoring_profile: PROFILE,
  });
}

// One raw board payload per ATS, each carrying the JD in that ATS's own field
// (greenhouse content / lever descriptionPlain / ashby descriptionPlain /
// smartrecruiters jobAd sections) — the shapes 121's normalizers consume.
const BOARDS = {
  greenhouse: {
    feed: () => J.feeds.greenhouse("acme"),
    empty: () => ({ name: "Acme Corp", jobs: [] }),
    one: (jd) => ({ name: "Acme Corp", jobs: [{
      id: 1, title: "Software Engineer Intern", location: { name: "Chicago, IL" },
      absolute_url: "https://boards.greenhouse.io/acme/jobs/1",
      first_published: new Date(T0 - 3600000).toISOString(), requisition_id: "REQ-1",
      departments: [{ name: "Engineering" }], content: jd,
    }] }),
  },
  lever: {
    feed: () => J.feeds.lever("acme"),
    empty: () => [],
    one: (jd) => [{
      id: "lv1", text: "Software Engineer Intern",
      categories: { location: "Chicago, IL", team: "Engineering" },
      hostedUrl: "https://jobs.lever.co/acme/lv1", applyUrl: "https://jobs.lever.co/acme/lv1",
      createdAt: T0 - 3600000, descriptionPlain: jd,
    }],
  },
  ashby: {
    feed: () => J.feeds.ashby("acme"),
    empty: () => ({ name: "Acme Corp", jobs: [] }),
    one: (jd) => ({ name: "Acme Corp", jobs: [{
      id: "ab1", title: "Software Engineer Intern", location: "Chicago, IL",
      jobUrl: "https://jobs.ashbyhq.com/acme/ab1", applyUrl: "https://jobs.ashbyhq.com/acme/ab1",
      publishedAt: new Date(T0 - 3600000).toISOString(), descriptionPlain: jd, departmentName: "Engineering",
    }] }),
  },
  smartrecruiters: {
    feed: () => J.feeds.smartrecruiters("AcmeCorp"),
    empty: () => ({ content: [] }),
    one: (jd) => ({ content: [{
      id: "sr1", ref: "SR-1", name: "Software Engineer Intern", company: { name: "Acme Corp" },
      location: { city: "Chicago", region: "IL", country: "US" },
      releasedDate: new Date(T0 - 3600000).toISOString(),
      jobAd: { sections: { description: { text: jd } } },
    }] }),
  },
};

async function driveAlertFed(board, jd, userId) {
  let payload = board.empty();
  const fetchImpl = async () => ({ status: 200, ok: true, json: async () => payload });
  const store = W.createMemoryStore();
  const sink = [];
  const feeds = [board.feed()];
  await W.runWatchCycle({ feeds, fetch: fetchImpl, profile: PROFILE, store, sink: (r) => sink.push(r), now: T0 });
  payload = board.one(jd);
  const after = await W.runWatchCycle({ feeds, fetch: fetchImpl, profile: PROFILE, store, sink: (r) => sink.push(r), now: T0 + 60000 });
  const alerts = after.alerts || [];
  const store2 = W.createMemoryStore();
  const res = await A.runAssignCycle({ alerts, watchProfile: watchProfile(userId), store: store2, now: T0 + 60000, presentJobIds: new Set(alerts.map((a) => a.job_id)) });
  const drained = await A.createReminderQueue(store2, userId).drain();
  return { alerts, res, drained };
}

for (const [source, board] of Object.entries(BOARDS)) {
  test(`MI-027 (${source}): alert-fed deadline reaches the reminder verbatim and speakLine quotes it`, async () => {
    const { alerts, drained } = await driveAlertFed(board, DEADLINE_JD, `u-mi027-${source}`);
    assert.equal(alerts.length, 1, `${source}: exactly one alert`);
    assert.ok(alerts[0].jd_text.includes("Apply by November 2, 2026"),
      `${source}: the ALERT RECORD itself must carry the posting's own text (bridge midpoint); jd_text=${JSON.stringify(alerts[0].jd_text)}`);
    assert.equal(drained.length, 1, `${source}: exactly one reminder`);
    assert.ok(drained[0].deadline, `${source}: reminder deadline must not be null`);
    assert.equal(drained[0].deadline.text, "Apply by November 2, 2026");
    assert.equal(drained[0].deadline.at, "2026-11-02T00:00:00.000Z");
    assert.ok(A.speakLine(drained[0]).includes('"Apply by November 2, 2026"'), A.speakLine(drained[0]));
  });
}

test("MI-027 (raw path): a normalized posting fed straight to 152 keeps its deadline", async () => {
  const raw = {
    job_id: "greenhouse:acme:RAW1", company: "Acme Corp", title: "Software Engineer Intern",
    location: "Chicago, IL", remote: "onsite", url: "https://example.test/apply/raw1",
    source: "greenhouse", posted_at: new Date(T0 - 3600000).toISOString(),
    seniority_band: "intern", role_family: "SWE", jd_text: DEADLINE_JD,
  };
  const store = W.createMemoryStore();
  const res = await A.runAssignCycle({ postings: [raw], watchProfile: watchProfile("u-mi027-raw"), store, now: T0, presentJobIds: new Set([raw.job_id]) });
  assert.equal(res.reminders.length, 1);
  assert.equal(res.reminders[0].deadline.text, "Apply by November 2, 2026");
});

test("MI-027 (adversarial): an ID-shaped token next to 'deadline' mints NO date, end to end", async () => {
  const { alerts, drained } = await driveAlertFed(BOARDS.greenhouse, ID_JD, "u-mi027-adv");
  assert.equal(alerts.length, 1);
  assert.equal(drained.length, 1);
  assert.equal(drained[0].deadline, null,
    `a tracking ID containing a date-shaped segment is not a deadline; got ${JSON.stringify(drained[0].deadline)}`);
  assert.ok(!/Deadline, in the posting/.test(A.speakLine(drained[0])), A.speakLine(drained[0]));
  // The extractor itself, on the same shapes:
  assert.equal(A.extractDeadline({ jd_text: "Deadline ID: 2026-11-02-4417" }), null);
  assert.equal(A.extractDeadline({ jd_text: "Your deadline code is 2026-11-02." }), null);
  assert.equal(A.extractDeadline({ jd_text: "Requisition deadline-2026-11-02 is internal." }), null);
});

test("MI-027 (absent): a posting with no deadline yields deadline null on the alert-fed path, never invented", async () => {
  const { alerts, drained } = await driveAlertFed(BOARDS.lever, PLAIN_JD, "u-mi027-none");
  assert.equal(alerts.length, 1);
  assert.equal(drained.length, 1);
  assert.equal(drained[0].deadline, null);
});
