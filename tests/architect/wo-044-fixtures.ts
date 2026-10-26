// WO-044 fixtures: one hand-written body per new provider, the smallest instance of the public shape its feed answers
// (supabase/functions/_shared/career_ingest_feeds.ts names each endpoint's source and whether the provider documents it).
// Not recorded responses: the build sandbox has no route to these hosts. Used by wo-044-discovery-scale.test.ts and
// wo-044-ingest-readers.test.ts.
export const FIX = {
  workable: { name: "Acme", description: "", jobs: [{ title: "Backend Engineer", shortcode: "AB12CD34EF", department: "Engineering", url: "https://apply.workable.com/j/AB12CD34EF", published_on: "2026-10-12", city: "Athens", state: "", country: "Greece", telecommuting: false }] },
  recruitee: { offers: [{ id: 901, title: "Account Manager", careers_url: "https://acme.recruitee.com/o/account-manager", location: "Amsterdam, Netherlands", department: "Sales", published_at: "2026-10-10 09:00:00 UTC", description: "<p>Grow accounts &amp; renew.</p>", requirements: "<p>Dutch</p>", company_name: "Acme BV" }] },
  bamboohr: { meta: { totalCount: 1 }, result: [{ id: "42", jobOpeningName: "Payroll Specialist", departmentLabel: "Finance", employmentStatusLabel: "Full-Time", location: { city: "Lindon", state: "Utah" }, atsLocation: { country: "United States", state: "Utah", city: "Lindon" }, isRemote: null }] },
  teamtailor: `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:tt="https://teamtailor.com/locations"><channel><title>Acme AB</title><link>https://acme.teamtailor.com/jobs</link>
<item><title>Data Engineer &amp; Analyst</title><description><![CDATA[<p>Build pipelines & dashboards.</p>]]></description><pubDate>Tue, 13 Oct 2026 08:00:00 +0200</pubDate>
<link>https://acme.teamtailor.com/jobs/3141592-data-engineer</link><guid>8d0c-guid</guid><remoteStatus>hybrid</remoteStatus>
<tt:locations><tt:location><tt:name>Stockholm HQ</tt:name><tt:city>Stockholm</tt:city><tt:country>Sweden</tt:country></tt:location></tt:locations><tt:department>Data</tt:department></item>
</channel></rss>`,
  breezy: [{ id: "abc123def456", friendly_id: "abc123def456-support-lead", name: "Support Lead", url: "https://acme.breezy.hr/p/abc123def456-support-lead", published_date: "2026-10-11T12:00:00.000Z", type: { id: "fullTime", name: "Full-Time" }, location: { country: { name: "United States", id: "US" }, state: { id: "TX", name: "Texas" }, city: "Austin", name: "Austin, TX", is_remote: false }, department: "Support", company: { name: "Acme Inc", friendly_id: "acme" } }],
  personio: `<?xml version="1.0" encoding="UTF-8"?>
<workzag-jobs><position><id>1234567</id><subcompany>Acme GmbH</subcompany><office>Berlin</office><additionalOffices><office>Munich</office></additionalOffices>
<department>Engineering</department><recruitingCategory>Software</recruitingCategory><name>Senior Backend Engineer (m/w/d)</name>
<jobDescriptions><jobDescription><name>Your mission</name><value><![CDATA[<p>Run our Go services.</p>]]></value></jobDescription></jobDescriptions>
<employmentType>permanent</employmentType><seniority>experienced</seniority><schedule>full-time</schedule><createdAt>2026-10-09T08:00:00+00:00</createdAt></position></workzag-jobs>`,
  workday: { total: 1, jobPostings: [{ title: "Store Associate", externalPath: "/job/Austin-TX/Store-Associate_R12345", locationsText: "Austin, TX", postedOn: "Posted 3 Days Ago", bulletFields: ["R12345"] }], facets: [] },
};
