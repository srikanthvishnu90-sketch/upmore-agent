#!/usr/bin/env python3
"""Bundle the message router and the flows (buy, cancel, pay, split, standing rent) with the recipient layer for the agent-chat edge function.

One-way: edit packages/domain and packages/capabilities, then rerun. Output is an ES module at
supabase/functions/_shared/router_core.js that the Deno handler imports (Deno cannot load the
domain files directly; they are plain scripts shared with the node tests). The capability registry
is embedded so the flows read the same tiers and statuses the tests do.
    python3 scripts/build-router-core.py          rebuild
    python3 scripts/build-router-core.py --check  fail if the bundle is stale

Career-only variant (owner decision 2026-10-15: the deployed agent-chat artifact contains ZERO
finance code): --career-only emits supabase/functions/_shared/router_core.career.js with only the
Edge-safe career domain modules, only the career data consts they read and only the Career* exports. The finance source files stay in the repo,
shelved behind PRODUCT_MODE in agent-chat/handler.ts; this variant changes only what the bundle
build emits. The career entry (agent-chat/index-career.ts -> handler-career.ts) imports this
bundle, so the deployed function's module graph never resolves the finance pipeline.
    python3 scripts/build-router-core.py --career-only          rebuild the career bundle
    python3 scripts/build-router-core.py --career-only --check  fail if it is stale
"""
import argparse
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
# Dependency order matters: 144 is read eagerly by 142; 151 precedes 152.
# 150-career-portal-browser.js stays Node-only (filesystem + child processes).
# The Edge host reports that missing worker explicitly; never bundle its driver.
names = ["32-merchant-label.js", "33-agent-monitors.js", "35-agent-intents.js", "36-agent-workflows.js", "41-agent-recovery.js", "42-agent-recipients.js", "43-agent-loop.js", "45-advice-guard.js", "46-voice.js", "47-data-guard.js", "48-money-math.js", "49-agent-save.js", "50-agent-invest.js", "53-compliance.js", "54-agent-money.js", "57-agent-ledger.js", "58-agent-control.js", "59-agent-alerts.js", "56-agent-proactive.js", "60-agent-money-plans.js", "64-agent-send.js", "66-agent-trade.js", "67-agent-cards.js", "68-agent-cancel.js", "69-agent-router.js", "70-agent-split.js", "71-alpaca.js", "72-merchant-terms.js", "76-connect-cards.js", "77-brokerage-connectors.js", "73-broker-accounts.js", "74-broker-connect.js", "75-style-corpus.js", "79-dispute.js", "80-money-answers.js", "86-the-numbers.js", "78-manual-connect.js", "81-standing-rent.js", "82-offer-book.js", "87-rewards-math.js", "85-subscription-savings.js", "88-price-drop.js", "84-money-owed.js", "83-airline-refunds.js", "91-unclaimed.js", "90-card-offers.js", "89-win-back.js", "89-free-substitutes.js", "92-whats-new.js", "93-budgets.js", "94-spending-views.js", "95-category-rules.js", "96-year-in-money.js", "97-bnpl.js", "98-refund-check.js", "100-subscription-list.js", "101-money-in.js", "102-charge-check.js", "99-deadlines.js", "103-reminders.js", "104-cancelled-charge.js", "105-iou-log.js", "106-rent-short.js", "107-save-goal.js", "108-spend-recheck.js", "109-scam-check.js", "110-savings-rate.js", "111-not-yet.js", "112-late-fee-watch.js", "113-scheduled-send.js", "114-savings-goals.js", "115-paycheck-send.js", "55-agent-news.js", "116-tip-fees.js", "117-agent-transfer.js", "118-market-intel.js", "118-crypto-tax.js", "118-bank-actions.js", "118-agent-bureaus.js", "118-payroll-benefits.js", "118-agent-government.js", "120-career-access.js", "121-career-jobs.js", "122-career-profile.js", "123-career-tailor.js", "124-career-outreach.js", "125-career-intel.js", "153-career-kb.js", "126-career-track.js", "127-career-prep.js", "128-career-negotiation.js", "129-career-os.js", "132-career-apply.js", "131-career-discover.js", "133-career-packets.js", "134-career-paths.js", "135-career-graph.js", "130-career-onboarding.js", "145-career-w11-ext.js", "132-career-apply3.js", "139-career-safety.js", "136-career-season.js", "140-career-reply.js", "141-career-doorstep.js", "154-career-recommendations.js", "154-career-writing.js", "144-career-guidance.js", "142-career-router.js", "143-career-containment.js", "146-career-intake.js", "147-career-platform-drafts.js", "148-career-render.js", "149-career-portal-apply.js", "151-career-alert-watch.js", "152-career-assign.js", "155-career-batch-apply.js"]
exports = ["AgentRouter", "AgentTrade", "AgentCancel", "AgentSend", "AgentSplit", "AgentRecipients", "AlpacaTrading", "BrokerAccounts", "BrokerConnect", "ConnectCards", "StyleCorpus", "STYLE_CORPUS_JSON", "MerchantTerms", "MERCHANT_TERMS_JSON", "AgentCards", "AgentLoop", "Compliance", "AgentLedger", "AgentControl", "AgentAlerts", "AgentProactive", "AgentMonitors", "AgentVoice", "CapabilityRegistry", "REGISTRY_JSON", "BrokerageConnectors", "PLATFORMS_JSON", "AgentSave", "AgentDispute", "MoneyAnswers", "TheNumbers", "ManualConnect", "MANUAL_PLAYBOOKS_JSON", "StandingRent", "OfferBook", "OFFER_TERMS_JSON", "RewardsMath", "SubscriptionSavings", "PriceDrop", "MoneyOwed", "REFUND_PROGRAMS_JSON", "AirlineRefunds", "Unclaimed", "FAILED_BANKS_JSON", "UNCLAIMED_PROGRAMS_JSON", "CardOffers", "WinBack", "FreeSubstitutes", "WhatsNew", "Budgets", "SpendingViews", "CategoryRules", "YearInMoney", "Bnpl", "BNPL_PROVIDERS_JSON", "MERCHANT_KNOWLEDGE_JSON", "RefundCheck", "SubscriptionList", "MoneyIn", "ChargeCheck", "Deadlines", "DEADLINES_JSON", "MARKET_DATA_JSON", "Reminders", "CancelledCharge", "IouLog", "RentShort", "SaveGoal", "SpendRecheck", "AdviceGuard", "ScamCheck", "SavingsRate", "NotYet", "LateFeeWatch", "ScheduledSend", "SavingsGoals", "PaycheckSend", "AgentNews", "TipFees", "AgentMoneyPlans", "AgentTransfer", "MarketIntel", "CryptoTax", "BankActions", "AgentBureaus", "PayrollBenefits", "PAYROLL_REF_JSON", "Government", "GOVERNMENT_JSON", "CareerAccess", "CareerJobs", "CareerProfile", "CareerTailor", "CareerOutreach", "CareerIntel", "CareerTrack", "CareerPrep", "CareerNegotiation", "CareerOS", "CareerApply", "CareerDiscover", "CareerPackets", "CareerPaths", "CareerGraph", "CareerOnboarding", "CareerW11Ext", "CareerApply3", "CareerSafety", "CareerSeason", "CareerReply", "CareerDoorstep", "CareerRouter", "CareerContainment", "CareerKB", "CareerRecommendations", "CareerGuidance", "CareerAlertWatch", "CareerAssign", "CareerWriting", "CareerBatchApply", "CareerRender"]
registry = json.loads((root / "packages/capabilities/registry.json").read_text())
content = "// Generated by scripts/build-router-core.py; edit packages/domain and packages/capabilities instead.\n"
content += "\n".join((root / "packages/domain" / n).read_text() for n in names)
content += "\n" + (root / "packages/capabilities/registry.js").read_text()
content += "\nconst REGISTRY_JSON = " + json.dumps(registry, separators=(",", ":")) + ";\n"
content += "const STYLE_CORPUS_JSON = " + json.dumps(json.loads((root / "corpus/corpus.json").read_text()), separators=(",", ":")) + ";\n"
content += "const MERCHANT_TERMS_JSON = " + json.dumps(json.loads((root / "packages/connectors/merchant-terms.json").read_text()), separators=(",", ":")) + ";\n"
# Guided manual connect: the playbooks (sign-in page, signed-in and signed-out texts, what to read), template left out.
# The offer book: outside terms with their source and checked date (packages/offers/terms.json).
content += "const OFFER_TERMS_JSON = " + json.dumps(json.loads((root / "packages/offers/terms.json").read_text()), separators=(",", ":")) + ";\n"
# Refund programs a notice is checked against (packages/offers/refund-programs.json; packages/domain/84-money-owed.js).
content += "const REFUND_PROGRAMS_JSON = " + json.dumps(json.loads((root / "packages/offers/refund-programs.json").read_text()), separators=(",", ":")) + ";\n"
# Failed banks and state unclaimed-property programs (packages/offers/failed-banks.json, unclaimed-programs.json; overnight C6).
content += "const FAILED_BANKS_JSON = " + json.dumps(json.loads((root / "packages/offers/failed-banks.json").read_text()), separators=(",", ":")) + ";\n"
content += "const UNCLAIMED_PROGRAMS_JSON = " + json.dumps(json.loads((root / "packages/offers/unclaimed-programs.json").read_text()), separators=(",", ":")) + ";\n"
# Buy now, pay later providers as statement rows show them, dated (packages/offers/bnpl-providers.json; 97-bnpl.js).
# Merchant knowledge for categorization (packages/offers/merchant-knowledge.json; 80-money-answers.js, 57-agent-ledger.js).
content += "const MERCHANT_KNOWLEDGE_JSON = " + json.dumps(json.loads((root / "packages/offers/merchant-knowledge.json").read_text()), separators=(",", ":")) + ";\n"
content += "const BNPL_PROVIDERS_JSON = " + json.dumps(json.loads((root / "packages/offers/bnpl-providers.json").read_text()), separators=(",", ":")) + ";\n"
# Public deadlines with their source and checked date: tax dates, Medicare and HealthCare.gov (packages/offers/deadlines.json; 99-deadlines.js).
content += "const DEADLINES_JSON = " + json.dumps(json.loads((root / "packages/offers/deadlines.json").read_text()), separators=(",", ":")) + ";\n"
# Market and news intelligence: the dated stand-in market dataset (packages/offers/market-data.json; 118-market-intel.js).
content += "const MARKET_DATA_JSON = " + json.dumps(json.loads((root / "packages/offers/market-data.json").read_text()), separators=(",", ":")) + ";\n"
# Payroll reference rules and government reference data (packages/offers/payroll-reference.json, government.json; 118-payroll-benefits.js, 118-agent-government.js). Both names were already in the export list but never defined, which made the bundle fail ESM linking.
content += "const PAYROLL_REF_JSON = " + json.dumps(json.loads((root / "packages/offers/payroll-reference.json").read_text()), separators=(",", ":")) + ";\n"
content += "const GOVERNMENT_JSON = " + json.dumps(json.loads((root / "packages/offers/government.json").read_text()), separators=(",", ":")) + ";\n"
content += "const MANUAL_PLAYBOOKS_JSON = " + json.dumps(json.loads((root / "packages/connectors/manual-playbooks.json").read_text())["playbooks"], separators=(",", ":")) + ";\n"
# Career data the domain modules read from disk in Node (BUG-174): the firm sets
# (124) and the company-file library (142's cirListOf). In the Deno bundle there
# is no packages/career-data directory, so both readers silently degraded to
# empty; the data is embedded here and read lazily at call time by the modules.
CAREER_FIRM_SETS_LINE = "const CAREER_FIRM_SETS_JSON = " + json.dumps(json.loads((root / "packages/career-data/firm-sets.json").read_text()), separators=(",", ":")) + ";\n"
_cir_files = sorted((root / "packages/career-data/cirs").glob("*.json"))
CAREER_CIRS_LINE = "const CAREER_CIRS_JSON = " + json.dumps([json.loads(f.read_text()) for f in _cir_files], separators=(",", ":")) + ";\n"
content += CAREER_FIRM_SETS_LINE
content += CAREER_CIRS_LINE
# Depth wave (BUG-217/220): the interview banks (127) and the knowledge-base
# aggregates (153) ride the same BUG-174 embed pattern — verbatim bank text
# keyed by file stem, and the generated aggregates object as-is. Kept as
# named lines like the two above so the career-only variant below appends
# every career data const its modules read.
_bank_files = sorted((root / "packages/career-data/interview-banks").glob("*.md"))
CAREER_INTERVIEW_BANKS_LINE = "const CAREER_INTERVIEW_BANKS_JSON = " + json.dumps({f.stem: f.read_text() for f in _bank_files}, separators=(",", ":")) + ";\n"
CAREER_KB_LINE = "const CAREER_KB_JSON = " + json.dumps(json.loads((root / "packages/career-data/kb-aggregates.json").read_text()), separators=(",", ":")) + ";\n"
content += CAREER_INTERVIEW_BANKS_LINE
content += CAREER_KB_LINE
# WO-036: the public pay data the offer benchmark reads (128 payData) and the target-firm guide (134 firmGuide).
_ds = root / "packages/career-data/datasets"
_pay = {"maps": "pay-maps.json", "lca_wages": "dol-lca-wages.json", "oews_metro": "bls-oews-metro.json", "bls_national": "bls-labor-data.json", "lca_companies": "dol-lca-fy2025q4-cir-companies.json"}
CAREER_PAY_LINE = "const CAREER_PAY_JSON = " + json.dumps({k: json.loads((_ds / f).read_text()) for k, f in _pay.items()}, separators=(",", ":")) + ";\n"
CAREER_FIRM_GUIDE_LINE = "const CAREER_FIRM_GUIDE_JSON = " + json.dumps(json.loads((root / "packages/career-data/firm-guide.json").read_text()), separators=(",", ":")) + ";\n"
content += CAREER_PAY_LINE
content += CAREER_FIRM_GUIDE_LINE
# The connector matrix without its research text and sources (those stay in packages/connectors/platforms.json).
keep = ["n", "id", "platform", "category", "region", "route", "auth", "trade", "read", "adapter_state", "verification", "needs", "fallback_route", "same_account_as", "blocked_reason", "aliases", "notes"]
platforms = [{k: r[k] for k in keep if k in r} for r in json.loads((root / "packages/connectors/platforms.json").read_text())["platforms"]]
content += "const PLATFORMS_JSON = " + json.dumps(platforms, separators=(",", ":")) + ";\n"
content += "export { " + ", ".join(exports) + " };\n"

# Career-only variant (owner decision 2026-10-15: the deployed agent-chat
# artifact contains ZERO finance code). Same career modules in the same
# relative order, only the career data consts the career modules read
# (appended after the modules, read lazily at call time — same as above),
# career exports only. The finance source files stay in the repo, shelved;
# this variant changes only what the build emits.
career_names = [n for n in names if "-career-" in n]
career_exports = [e for e in exports if e.startswith("Career")]


# The career artifact must stay under the platform ceiling (tests/career-staged-size.test.cjs, 4,200,000 B), and
# about 480 KB of the career modules is comments. They stay in packages/domain, where people read them; the generated
# artifact drops them. A small JS lexer finds them (strings, templates with ${} nesting, regex literals, comments), so
# nothing inside a string or a template is ever touched; a comment on its own line goes with its line, a trailing one
# goes with the spaces before it, and an inline block comment becomes one space (or a newline, if it spanned lines, so
# automatic semicolon insertion reads the code the same). The build then runs node --check on the result.
_REGEX_AFTER_WORDS = {"return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await"}


def strip_js_comments(src):
    out = []
    i, n = 0, len(src)
    stack = []  # brace depths at which an open template's ${ } closes
    depth = 0
    last = ""  # the last significant token: "" (start), "word:<w>", "num", or the punctuator itself

    def line_start(pos):
        j = pos
        while j > 0 and src[j - 1] in " \t":
            j -= 1
        return j if j == 0 or src[j - 1] == "\n" else None

    def drop_trailing_spaces():
        while out and out[-1] in (" ", "\t"):
            out.pop()

    def regex_allowed():
        if last == "" or last.startswith("word:") and last[5:] in _REGEX_AFTER_WORDS:
            return True
        return not (last.startswith("word:") or last in ("num", ")", "]", "}", "str"))

    def read_template(j):
        # j is just past a backtick (or a closing } of ${ }); copy up to the closing backtick or the next ${
        nonlocal depth
        while j < n:
            c = src[j]
            if c == "\\":
                out.append(src[j:j + 2]); j += 2; continue
            if c == "`":
                out.append(c); return j + 1, False
            if c == "$" and j + 1 < n and src[j + 1] == "{":
                out.append("${"); stack.append(depth); depth += 1; return j + 2, True
            out.append(c); j += 1
        raise SystemExit("career bundle: unterminated template literal")

    while i < n:
        c = src[i]
        nxt = src[i + 1] if i + 1 < n else ""
        if c == "/" and nxt == "/":
            end = src.find("\n", i)
            end = n if end == -1 else end
            ls = line_start(i)
            if ls is not None:
                while out and out[-1] in (" ", "\t"):
                    out.pop()
                i = end + 1 if end < n else n  # the whole line, newline included
            else:
                drop_trailing_spaces()
                i = end  # keep the newline
            continue
        if c == "/" and nxt == "*":
            end = src.find("*/", i + 2)
            if end == -1:
                raise SystemExit("career bundle: unterminated block comment")
            body = src[i:end + 2]
            after = end + 2
            ls = line_start(i)
            k = after
            while k < n and src[k] in " \t":
                k += 1
            if ls is not None and (k >= n or src[k] == "\n"):
                while out and out[-1] in (" ", "\t"):
                    out.pop()
                i = k + 1 if k < n else n
            else:
                out.append("\n" if "\n" in body else " ")
                i = after
            continue
        if c in "'\"":
            j = i + 1
            while j < n and src[j] != c:
                if src[j] == "\\":
                    j += 1
                elif src[j] == "\n":
                    raise SystemExit("career bundle: newline inside a string literal")
                j += 1
            out.append(src[i:j + 1]); i = j + 1; last = "str"; continue
        if c == "`":
            out.append(c)
            i, opened = read_template(i + 1)
            last = "(" if opened else "str"
            continue
        if c == "/" and regex_allowed():
            j, in_class = i + 1, False
            while j < n:
                d = src[j]
                if d == "\\":
                    j += 2; continue
                if d == "\n":
                    raise SystemExit("career bundle: newline inside a regex literal at offset %d" % i)
                if in_class:
                    in_class = d != "]"
                elif d == "[":
                    in_class = True
                elif d == "/":
                    break
                j += 1
            j += 1
            while j < n and (src[j].isalnum() or src[j] == "_"):
                j += 1
            out.append(src[i:j]); i = j; last = "str"; continue
        if c == "{":
            depth += 1; out.append(c); i += 1; last = c; continue
        if c == "}":
            if stack and stack[-1] == depth - 1:
                depth -= 1; stack.pop(); out.append(c)
                i, opened = read_template(i + 1)
                last = "(" if opened else "str"
                continue
            depth -= 1; out.append(c); i += 1; last = c; continue
        if c.isalpha() or c in "_$":
            j = i
            while j < n and (src[j].isalnum() or src[j] in "_$"):
                j += 1
            out.append(src[i:j]); last = "word:" + src[i:j]; i = j; continue
        if c.isdigit():
            j = i
            while j < n and (src[j].isalnum() or src[j] in "._"):
                j += 1
            out.append(src[i:j]); last = "num"; i = j; continue
        out.append(c)
        if not c.isspace():
            last = c
        i += 1
    if stack:
        raise SystemExit("career bundle: unclosed template expression")
    return "".join(out)


career_content = "// Generated by scripts/build-router-core.py --career-only; edit packages/domain instead (comments are stripped here).\n"
career_content += strip_js_comments("\n".join((root / "packages/domain" / n).read_text() for n in career_names))
career_content += "\n" + CAREER_FIRM_SETS_LINE + CAREER_CIRS_LINE + CAREER_INTERVIEW_BANKS_LINE + CAREER_KB_LINE + CAREER_PAY_LINE + CAREER_FIRM_GUIDE_LINE
career_content += "export { " + ", ".join(career_exports) + " };\n"

parser = argparse.ArgumentParser()
parser.add_argument("--check", action="store_true")
parser.add_argument("--career-only", action="store_true")
args = parser.parse_args()
if args.career_only:
    target = root / "supabase/functions/_shared/router_core.career.js"
    content = career_content
    module_count = len(career_names)
else:
    target = root / "supabase/functions/_shared/router_core.js"
    module_count = len(names)
if args.check:
    if not target.exists() or target.read_text() != content:
        raise SystemExit("Router bundle is stale: %s (run python3 scripts/build-router-core.py%s)" % (target.relative_to(root), " --career-only" if args.career_only else ""))
    print("Router bundle verified")
else:
    target.write_text(content)
    if args.career_only:
        # The stripped artifact must still parse as a module; a lexer mistake fails the build here, never at deploy.
        import shutil, subprocess, tempfile
        with tempfile.TemporaryDirectory() as tmp:
            probe = Path(tmp) / "router_core.career.mjs"
            shutil.copyfile(target, probe)
            subprocess.run(["node", "--check", str(probe)], check=True)
    print("Router bundle built: %d modules, %d bytes" % (module_count, len(content)))
