// WO-053 (architect): where a posting is, read from the employer's own location text ("Costa Mesa, California, United
// States; Fort Collins, Colorado, United States", "San Francisco, CA - US", "GB-London", "Spain (Remote)", "New Jersey -
// Lyndhurst"). Two questions depend on it and nothing else settles them: an office question that names no place ("Are you
// able to work from our office three days per week?") and work rights "in the country where this job is located". A
// place is read only from what the text says: a US state by code or name, a country by name, a city by its own words.
// Nothing is looked up and nothing is guessed: a place the text does not settle stays unsettled, and the question is asked.

export const STATE_NAMES: Record<string, string> = { al: "alabama", ak: "alaska", az: "arizona", ar: "arkansas", ca: "california", co: "colorado",
  ct: "connecticut", de: "delaware", dc: "district of columbia", fl: "florida", ga: "georgia", hi: "hawaii", id: "idaho", il: "illinois",
  in: "indiana", ia: "iowa", ks: "kansas", ky: "kentucky", la: "louisiana", me: "maine", md: "maryland", ma: "massachusetts", mi: "michigan",
  mn: "minnesota", ms: "mississippi", mo: "missouri", mt: "montana", ne: "nebraska", nv: "nevada", nh: "new hampshire", nj: "new jersey",
  nm: "new mexico", ny: "new york", nc: "north carolina", nd: "north dakota", oh: "ohio", ok: "oklahoma", or: "oregon", pa: "pennsylvania",
  ri: "rhode island", sc: "south carolina", sd: "south dakota", tn: "tennessee", tx: "texas", ut: "utah", vt: "vermont", va: "virginia",
  wa: "washington", wv: "west virginia", wi: "wisconsin", wy: "wyoming" };
const STATE_BY_NAME = Object.fromEntries(Object.entries(STATE_NAMES).map(([c, n]) => [n, c]));

// Cities that name one US place in a job posting, so "San Francisco" alone is in the US. A name shared with a city
// abroad (London, Cambridge, Dublin, Vancouver, San Jose, Richmond, Birmingham, Paris, Melbourne...) is not here: such a
// place is in the US only when the text says so ("Cambridge, MA").
const US_CITIES = new Set(["new york", "new york city", "nyc", "manhattan", "brooklyn", "san francisco", "sf", "los angeles", "seattle",
  "austin", "boston", "chicago", "denver", "atlanta", "miami", "dallas", "houston", "philadelphia", "phoenix", "san diego", "palo alto",
  "mountain view", "menlo park", "sunnyvale", "redwood city", "santa clara", "san mateo", "south san francisco", "oakland", "berkeley",
  "pittsburgh", "detroit", "minneapolis", "salt lake city", "nashville", "raleigh", "durham nc", "charlotte", "baltimore", "st. louis",
  "st louis", "kansas city", "indianapolis", "cincinnati", "cleveland", "las vegas", "orlando", "tampa", "sacramento", "irvine",
  "boulder", "ann arbor", "jersey city", "hoboken", "redmond", "bellevue", "kirkland", "arlington va", "reston", "mclean", "herndon",
  "bethesda", "washington dc", "washington d.c.", "silicon valley", "bay area", "san francisco bay area", "lehi", "provo", "scottsdale",
  "tempe", "plano", "irving", "fort worth", "san antonio", "columbus", "milwaukee", "madison", "omaha", "boise", "portland or",
  "honolulu", "anchorage", "new orleans", "louisville", "memphis", "jacksonville", "fort lauderdale", "hawthorne", "el segundo",
  "santa monica", "culver city", "costa mesa", "fort collins", "cupertino", "san bruno", "foster city", "burlingame", "emeryville"]);
// Countries and places outside the US, by name or by the codes postings use ("GB-London", "HK - Hong Kong SAR").
const ABROAD = /\b(canada|united kingdom|uk|great britain|england|scotland|wales|ireland|germany|deutschland|france|spain|españa|portugal|italy|netherlands|belgium|switzerland|austria|sweden|norway|denmark|finland|poland|czechia|czech republic|hungary|romania|greece|israel|india|china|hong kong( sar)?|taiwan|japan|south korea|korea|singapore|australia|new zealand|mexico|méxico|brazil|brasil|argentina|colombia|chile|peru|philippines|indonesia|malaysia|vietnam|thailand|uae|united arab emirates|saudi arabia|ksa|qatar|south africa|nigeria|kenya|egypt|turkey|türkiye|emea|apac|latam|europe|asia|africa|london|toronto|berlin|munich|amsterdam|paris|madrid|barcelona|lisbon|dublin|tel aviv|bangalore|bengaluru|hyderabad|pune|mumbai|delhi|noida|gurgaon|gurugram|chennai|tokyo|seoul|sydney|melbourne|riyadh|dubai|abu dhabi|são paulo|sao paulo|mexico city|bogotá|bogota|buenos aires|warsaw|krakow|kraków|zurich|zürich|stockholm|copenhagen|oslo|helsinki|prague|vienna|manila|jakarta|shanghai|beijing|shenzhen|taipei)\b/i;
const COUNTRY_ONLY = /^(canada|united kingdom|uk|great britain|england|scotland|wales|ireland|germany|deutschland|france|spain|españa|portugal|italy|netherlands|belgium|switzerland|austria|sweden|norway|denmark|finland|poland|czechia|czech republic|hungary|romania|greece|israel|india|china|taiwan|japan|south korea|korea|australia|new zealand|mexico|méxico|brazil|brasil|argentina|colombia|chile|peru|philippines|indonesia|malaysia|vietnam|thailand|uae|united arab emirates|saudi arabia|ksa|qatar|south africa|nigeria|kenya|egypt|turkey|türkiye|emea|apac|latam|europe|asia|africa)$/i;
const NAMES_US =/^(us|u\.s\.?|usa|u\.s\.a\.?|united states( of america)?|america)$/i;
const WAY_OF_WORK = /^(remote|hybrid|on-?site|in-?office|in office|office|anywhere|flexible|distributed|virtual|wfh|work from home|field|travel|multiple locations|various( locations)?)$/i;

export interface PlacePart { city: string; state: string; country: "us" | "abroad" | ""; remote: boolean }

// The employer's location text as parts, one per place it names.
export function postingPlaces(text: string): PlacePart[] {
  const out: PlacePart[] = [];
  for (const chunk of String(text ?? "").split(/\s*(?:;|\||•|·|\n)\s*/)) {
    // "Mesa, AZ: Power Rd / Elliot Rd": what follows a colon is the street, not another place.
    const head = chunk.replace(/:.*$/, "");
    for (const seg of head.split(/\s+\/\s*|\s*\/\s+|\s+or\s+|\s+&\s+/i)) {
      const tokens = seg.split(/\s*(?:,|\(|\)|\s-\s|^([A-Z]{2})-)\s*/).filter((t) => t && t.trim()).map((t) => t.trim());
      if (!tokens.length) continue;
      const p: PlacePart = { city: "", state: "", country: "", remote: false };
      const isState = (t: string) => (/^[A-Z]{2}$/.test(t) && !!STATE_NAMES[t.toLowerCase()]) || !!STATE_BY_NAME[t.toLowerCase()];
      tokens.forEach((raw, i) => {
        const t = raw.replace(/\s+/g, " ").trim(), low = t.toLowerCase();
        if (/^(remote|anywhere)\b/i.test(t)) {
          p.remote = true;
          const rest = t.replace(/^(remote|anywhere)\b[\s:-]*(in\s+(the\s+)?)?/i, "");
          if (rest && NAMES_US.test(rest)) p.country = "us";
          return;
        }
        if (WAY_OF_WORK.test(t)) return;
        if (NAMES_US.test(t)) { p.country ||= "us"; return; }
        if (t === "SF") { p.city ||= "san francisco"; p.country ||= "us"; return; }
        if (/^[A-Z]{2}$/.test(t)) {
          if (STATE_NAMES[low]) { p.state ||= low; p.country ||= "us"; } else p.country = "abroad";
          return;
        }
        // A state's name is the state, except first in line before another state ("New York, NY", "Washington, DC":
        // the city) or alone as "New York" (the city, in New York state).
        if (STATE_BY_NAME[low]) {
          const city = i === 0 && (tokens.slice(1).some(isState) || (low === "new york" && tokens.length === 1));
          if (city) { p.city ||= low; if (low === "new york") p.state ||= "ny"; p.country ||= "us"; return; }
          if (!p.state) { p.state = STATE_BY_NAME[low]; p.country ||= "us"; return; }
        }
        if (ABROAD.test(t)) {
          p.country = "abroad";
          if (!p.city && !COUNTRY_ONLY.test(t)) p.city = low;
          return;
        }
        if (!p.city && /^[A-Za-zÀ-ÿ .'’-]{2,40}$/.test(t)) p.city = low.replace(/\s+(metro(politan)?\s+)?area$/, "").trim();
      });
      if (p.city && !p.country && US_CITIES.has(p.city)) p.country = "us";
      if (p.city === "nyc") p.city = "new york";
      if (p.city === "sf") p.city = "san francisco";
      if (p.city || p.state || p.country || p.remote) out.push(p);
    }
  }
  return out;
}

// Whether the posting is the person's own city: a part whose city is theirs (and whose state, if named, is theirs too).
export function postingAtHome(parts: PlacePart[], home: { city: string; state: string }): boolean {
  const city = home.city.trim().toLowerCase(), st = home.state.trim().toLowerCase();
  if (!city) return false;
  const same = (x: string) => x === city || x.startsWith(city + " ") || city.startsWith(x + " ");
  return parts.some((p) => p.country !== "abroad" && !!p.city && same(p.city) && (!p.state || !st || p.state === st || STATE_NAMES[p.state] === st));
}

// The posting's country, only when every place it names is in the US ("us") or one is abroad ("abroad"); else "".
export function postingCountry(parts: PlacePart[]): "us" | "abroad" | "" {
  if (!parts.length) return "";
  if (parts.some((p) => p.country === "abroad")) return "abroad";
  return parts.every((p) => p.country === "us") ? "us" : "";
}
