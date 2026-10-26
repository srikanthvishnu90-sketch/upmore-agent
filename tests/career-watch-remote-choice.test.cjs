"use strict";
// SERIAL-1530 (F4): the remote choice on a watch is explicit and said. Fail-first on fc14e1e6: filters carried no
// remote_choice, the confirm reply said nothing about remote, and 152 passed any remote posting to any watch whose remote
// preference was not "no" regardless of the posting's stated country or the person's location.
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../scripts/career/gauntlet/pilot-lib.cjs");
const A = require("../packages/domain/152-career-assign.js");

const profile = L.gauntletProfile("p1-early-career-swe"); // Chicago, IL on record
const turn = (ask, p = profile) => {
  const s = L.H.session("RC-" + Math.random().toString(36).slice(2, 9), "grand");
  return L.chatTurn(s, ask, { profile: p });
};
const res = (r) => r.result || r;
const text = (r) => (r.delivered || []).join("\n") || res(r).reply || "";
const interestOf = (r) => ((res(r).watch_profile || res(r).payload || {}).interests || [])[0];

test("(2) a place with nothing said about remote: remote included by default, the reply says so and how to leave it out, the stored choice says default", () => {
  const r = turn("Watch for data analyst roles in New York");
  assert.equal(res(r).intent, "career_watch_create", text(r));
  const i = interestOf(r);
  assert.ok(i, "the watch is on the reply");
  assert.deepEqual([i.filters.remote_ok, i.filters.remote_choice], [true, "default"]);
  assert.match(text(r), /Remote postings for this role are included too, as long as they are open to where you are; say "no remote" to leave them out\./);
  assert.doesNotMatch(text(r), /held until I know where you are/, "their location is on record");
});

test("(3) said either way: 'include remote' and 'no remote' are stored as stated and said back", () => {
  const yes = turn("Watch for data analyst roles in New York, include remote");
  const iy = interestOf(yes);
  assert.deepEqual([iy.filters.remote_ok, iy.filters.remote_choice], [true, "stated"]);
  assert.match(text(yes), /Remote postings are included, as you asked/);
  const no = turn("Watch for data analyst roles in New York, no remote");
  const inn = interestOf(no);
  assert.deepEqual([inn.filters.remote_ok, inn.filters.remote_choice], [false, "stated"]);
  assert.match(text(no), /Remote postings are left out, as you asked\./);
});

test("no location on record: the reply says a country-limited remote posting is held until they say where they are", () => {
  const p = JSON.parse(JSON.stringify(profile));
  p.basics = { ...(p.basics || {}), location: "" }; p.preferences = { ...(p.preferences || {}), locations: [] };
  const r = turn("Watch for data analyst roles in New York", p);
  assert.equal(res(r).intent, "career_watch_create", text(r));
  assert.match(text(r), /A remote posting limited to a country is held until I know where you are — tell me your city and country\./);
  assert.equal((res(r).watch_profile || res(r).payload).scoring_profile.location, "", "nothing invented about where they are");
});

test("(1) 152: a New York watch against Remote - US: Toronto no, Chicago yes, unknown held; a country list; no remote", () => {
  const interest = { interest_id: "int-data-analyst", role: { title: "Data Analyst", terms: ["data analyst"], blockers: [] }, filters: { locations: ["New York"], remote_ok: true, bands: [], firms_include: [], firms_exclude: [] } };
  const posting = (location, jd_text = "") => ({ job_id: "j1", company: "Acme", title: "Data Analyst", location, jd_text, url: "https://boards.greenhouse.io/acme/jobs/1" });
  const reasons = (p, home) => A.matchInterest(p, interest, { skills: [], location: home }).reasons.filter((x) => /^location/.test(x));
  assert.match(reasons(posting("Remote - US"), "Toronto, ON")[0] || "", /remote within the US only; your location is Canada/);
  assert.deepEqual(reasons(posting("Remote - US"), "Chicago, IL"), []);
  assert.match(reasons(posting("Remote - US"), "")[0] || "", /remote within the US only, and your location is not on record: tell me your city and country/);
  assert.deepEqual(reasons(posting("Remote (US, Canada)"), "Toronto, ON"), []);
  assert.match(reasons(posting("Remote (US, Canada)"), "London, UK")[0] || "", /your location is the UK/);
  assert.match(reasons(posting("Remote", "You must be authorized to work in the United Kingdom."), "Chicago, IL")[0] || "", /remote within the UK only; your location is the US/);
  assert.deepEqual(reasons(posting("Remote"), ""), [], "a remote posting with nothing stated is open anywhere");
  const noRemote = { ...interest, filters: { ...interest.filters, remote_ok: false } };
  assert.match((A.matchInterest(posting("Remote - US"), noRemote, { location: "Chicago, IL" }).reasons.find((x) => /^location/.test(x))) || "", /remote postings are left out of this watch/);
  assert.deepEqual(A.matchInterest(posting("New York, NY"), noRemote, { location: "Chicago, IL" }).reasons.filter((x) => /^location/.test(x)), []);
});

test("(5) 152: an employer's own descriptor is not a candidate restriction; an office posting naming its country is where it is", () => {
  const interest = { interest_id: "int-data-analyst", role: { title: "Data Analyst", terms: ["data analyst"], blockers: [] }, filters: { locations: ["New York"], remote_ok: true, bands: [], firms_include: [], firms_exclude: [] } };
  const office = { job_id: "j2", company: "Acme", title: "Data Analyst", location: "Webster, New York, United States", jd_text: "We are a Chicago-based company, based in Chicago, serving residents of Texas.", url: "https://boards.greenhouse.io/acme/jobs/2" };
  assert.deepEqual(A.matchInterest(office, interest, { skills: [], location: "" }).reasons.filter((x) => /^location/.test(x)), [], "no location on record, no restriction read: the watched place decides");
  assert.deepEqual(A.restrictionsOf("We are a Chicago-based company."), []);
  assert.deepEqual(A.restrictionsOf("You must be US-based."), ["us"]);
  assert.deepEqual(A.restrictionsOf("US-based candidates only."), ["us"]);
});
