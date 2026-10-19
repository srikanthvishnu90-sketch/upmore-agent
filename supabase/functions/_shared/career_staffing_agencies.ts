// Staffing and recruiting agencies whose postings are for another employer (C-04). A row is added only with the agency's
// own page or filing that says it places workers with client companies: its URL, the sentence quoted from it, and the
// date it was checked. A missing agency is a pass, never a guess. Kept inside supabase/functions so the deployed
// functions carry it.
// BLOCKED 2026-10-19: no primary page could be fetched from the build container (company sites and sec.gov refused or
// unresolvable), so the list is empty; the "our client" wording rule in career_floor.ts works without it.
export interface StaffingAgency {
  name: string;
  source_url: string;
  quote: string;
  checked: string;
}
export const STAFFING_AGENCIES: StaffingAgency[] = [];
