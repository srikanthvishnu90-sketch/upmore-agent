"use strict";
// Shared loader for SC-081..102 (worker w05): real modules + canonical TEST fixtures + CIRs.
const fs = require("fs"); const path = require("path");
const ROOT = path.join(__dirname, "..", "..", "..");
const H = require("../scenario-harness.cjs");
const Access = require(path.join(ROOT, "packages/domain/120-career-access.js"));
const Jobs = require(path.join(ROOT, "packages/domain/121-career-jobs.js"));
const Profile = require(path.join(ROOT, "packages/domain/122-career-profile.js"));
const Tailor = require(path.join(ROOT, "packages/domain/123-career-tailor.js"));
const Packets = require(path.join(ROOT, "packages/domain/133-career-packets.js"));
const loadFixture = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, "packages/career-data/fixtures", n), "utf8"));
const persona = (n) => Profile.profileFromData(loadFixture(n || "test-persona.json"));
const cir = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, "packages/career-data/cirs", n), "utf8"));
const JD = {
  swe: "Software Engineer Intern. Requirements: Python, JavaScript, React, PostgreSQL, SQL. Nice to have: Kubernetes, Docker, Go, AWS.",
  stripe: "Software Engineer, Intern at Stripe. Requirements: Python, JavaScript, Go, strong CS fundamentals, clear written communication, pull requests with test coverage, multi-person projects. Nice to have: PostgreSQL.",
  goldman: "Investment Banking Summer Analyst at Goldman Sachs. Requirements: Excel, Financial Modeling, Valuation, strong academics, GPA, club leadership.",
  mckinsey: "Business Analyst at McKinsey. Consulting role. Requirements: Excel, leadership, problem solving, client engagement, strategy.",
  janestreet: "Quantitative Trader Intern at Jane Street. Quant role. Requirements: Probability, Statistics, Python, competition mathematics, research.",
  palantir: "Forward Deployed Software Engineer at Palantir. Requirements: Python, JavaScript, customer-facing engineering, hardest problem ownership, deployment.",
  datadog: "Backend Software Engineer Intern. Requirements: Python, Go, PostgreSQL, Kubernetes, Docker, scale and distributed systems evidence.",
  ramp: "Full-Stack Software Engineer Intern at Ramp. Requirements: JavaScript, TypeScript, React, PostgreSQL, shipped product with metrics.",
  yc: "Software Engineer at a YC startup. Requirements: JavaScript, React, Python, PostgreSQL, shipped product, builder who ships fast.",
  law: "Summer Associate at a law firm. Legal intern experience, law review, moot court, legal research and writing.",
  med: "Medical school applicant. Clinical experience, patient care, MCAT preparation, shadowing, research.",
};
module.exports = { H, Access, Jobs, Profile, Tailor, Packets, persona, loadFixture, cir, JD, ROOT };
