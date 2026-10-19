# Drift found 2026-10-19 (architect)

1. `docs/competitors/tsenta.md` cited Huntr's Q2 2026 tailoring result as "n 101,501 vs 1,893,054". That figure is in
   no extract of the Q2 page. The page's own figure is 13,037 tailored resumes linked to applications (VERIFIED-S,
   huntr.co/research/job-search-trends-q2-2026). The citation is corrected; the found evidence is in
   `docs/competitors/huntr.md` section 2.
2. `docs/product/cost-model-applying.md` lever 4 said "a 3-4x higher interview rate is a 3-4x lower cost per
   interview". Huntr's per-application rates are an association, and Huntr says the ratio "does not show the effect of
   sending fewer applications". Per person, the high-volume group still had more interviews (ASSUMED from bucket
   midpoints). The lever now says to measure interviews per person and per verified submission on our own users, and
   claims nothing before that.
3. The owner's build standard (section 3.3) says the captcha detector counts an empty invisible-hCaptcha container as a
   challenge. True of the engine on trunk and on PR #23 before its captcha commit. The 17 captured forms confirm the
   exposure (VERIFIED, `tests/fixtures/forms-ci/manifest.json`): every Greenhouse and Ashby form loads reCAPTCHA
   Enterprise, and every Lever form loads hCaptcha with an empty `.h-captcha` div. Fixed in PR #23
   (`tests/career-apply-engine.test.cjs`, last three tests).
