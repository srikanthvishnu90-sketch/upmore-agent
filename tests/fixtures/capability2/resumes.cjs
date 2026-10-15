"use strict";
// Frozen independent expectations, authored before the scale run. Every record
// is synthetic. Variants test section/order/text extraction, not real people.
const cases = [
  ["warehouse", "Operations coordinator", "Scheduled warehouse shifts and maintained inventory logs", "Mapped dispatch handoffs and corrected stock-count records", "High school diploma", "scheduling, inventory", "operations"],
  ["retail", "Customer service associate", "Handled customer service at a retail counter", "Resolved order issues and documented escalation notes", "High school diploma", "customer service, written communication", "customer-support"],
  ["support", "Customer support specialist", "Resolved customer support tickets by chat and email", "Maintained a troubleshooting guide for recurring tickets", "Certificate in communication", "ticket triage, written communication", "customer-support"],
  ["admin", "Administrative coordinator", "Managed office calendars and scheduling", "Maintained meeting records and prepared internal checklists", "Associate degree in administration", "scheduling, record keeping", "administration"],
  ["sales", "Account management coordinator", "Maintained sales CRM records and customer handoffs", "Prepared account follow-up notes for an account manager", "BA Sociology", "CRM, written communication", "sales"],
  ["writer", "Content editor", "Edited public announcements and researched reader questions", "Wrote communications briefs with an audience checklist", "BA English", "editing, audience research", "communications"],
  ["journalist", "Journalism assistant", "Checked source documents and drafted local news summaries", "Edited content for a student publication", "BA Journalism", "writing, editing", "communications"],
  ["legal", "Legal assistant", "Performed legal research and document review under supervision", "Prepared a public-case summary and organized litigation records", "BA History", "legal research, document review", "legal-support"],
  ["jd", "Law clinic student", "Reviewed contracts and performed legal research in a clinic", "Organized case documents under a supervising attorney", "Juris Doctor in progress", "legal research, document review", "legal-support"],
  ["compliance", "Compliance operations assistant", "Performed policy review and documented risk exceptions", "Maintained an audit trail for an internal compliance checklist", "BA Political Science", "policy review, risk documentation", "compliance"],
  ["bookkeeper", "Accounting assistant", "Performed reconciliation and maintained bookkeeping records", "Used Excel to compare invoices against a fictional budget", "Associate degree in accounting", "Excel, reconciliation", "finance"],
  ["finance", "Finance intern", "Prepared valuation comparison notes under a finance manager", "Used Excel to reconcile financial expense records", "BS Finance in progress", "Excel, reconciliation", "finance"],
  ["budget", "Business operations assistant", "Documented business operations and budget assumptions", "Used Excel to maintain process documentation for a team", "BA Business", "Excel, process documentation", "business-operations"],
  ["python", "Software project contributor", "Built a Python tool with version control and testing", "Added runnable tests and documented software design choices", "BS Computer Science in progress", "Python, testing, version control", "software-engineering"],
  ["frontend", "Frontend software intern", "Built JavaScript and TypeScript software components", "Added testing checks and maintained version control", "Associate degree in web development", "JavaScript, TypeScript, testing", "software-engineering"],
  ["data", "Data analysis assistant", "Used SQL for data analysis and data validation", "Wrote analytics summaries with limitations alongside each result", "BS Statistics", "SQL, data validation", "data-analytics"],
  ["stats", "Statistics project contributor", "Tested a statistics hypothesis with Python", "Checked data validation rules and documented uncertainty", "BS Statistics in progress", "Python, data validation", "data-analytics"],
  ["nurse", "Nursing coordinator", "Coordinated patient scheduling in a healthcare office", "Maintained a fictional medical workflow checklist for training", "Nursing diploma", "scheduling, record keeping", "health-operations"],
  ["medical-admin", "Healthcare administration assistant", "Documented healthcare appointment workflows", "Organized patient scheduling records under office supervision", "BA Health Administration", "scheduling, record keeping", "health-operations"],
  ["switch-ops", "Retail shift lead", "Scheduled shift handoffs and tracked inventory", "Maintained operations checklists and trained a new team member", "BA Art History", "scheduling, inventory", "operations"],
  ["switch-law", "Contracts administrator", "Reviewed contracts and kept legal document-review records", "Prepared policy review notes for compliance staff", "BA Literature", "document review, policy review", "legal-support"],
  ["nondegree-cs", "Software volunteer", "Built Python software with version control", "Used testing to check a small community scheduling tool", "High school diploma", "Python, testing", "software-engineering"],
  ["nondegree-finance", "Bookkeeping volunteer", "Used Excel for bookkeeping and reconciliation", "Recorded accounting corrections with an audit trail", "High school equivalency", "Excel, reconciliation", "finance"],
  ["nondegree-content", "Community content volunteer", "Edited content for a public information board", "Wrote communications notes and researched audience questions", "High school diploma", "editing, audience research", "communications"],
];
module.exports = Object.freeze(cases.flatMap(([id, title, one, two, education, skills, expected]) => Array.from({ length: 5 }, (_, variant) => {
  const exp = `${variant % 2 ? "WORK EXPERIENCE" : "EXPERIENCE"}\n${title}, SYNTHETIC Organization ${variant}, 2023 - 2026\n- ${one}\n- ${two}\n- Kept a written review log and discussed limitations with a supervisor`;
  const edu = `EDUCATION\n${education}, SYNTHETIC Institute, 2026`;
  const skill = `SKILLS\n${skills}`;
  return Object.freeze({ id: `${id}-${variant}`, expected, resume: `SYNTHETIC RESUME — no real applicant\nCandidate ${id} ${variant}\nChicago, IL\n\n${variant % 2 ? edu + "\n\n" + exp : exp + "\n\n" + edu}\n\n${skill}\n`, locations: variant % 2 ? ["Chicago, IL"] : ["Austin, TX"], remoteOnly: variant === 4 });
})));
