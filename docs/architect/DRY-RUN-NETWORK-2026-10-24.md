# What a dry run sends (claim check, 2026-10-24)

The claim checked: "a dry run sends nothing". A dry run is the queue stack's preparation: `approve-first.ts prepare()`,
which runs `scripts/apply.ts` without `--submit` and without `--approved`. G4's server prepare (`prepareAhead`) uses this
same dry run, **before the person has asked for anything**. So whatever a dry run lets through can now reach an employer
for a posting the person never chose.

Test: `tests/architect/dry-run-network.test.ts`. It runs the real engine against a local employer page. The page's own
scripts do what application pages do while a person types:

- autosave by POST, PUT and `sendBeacon`;
- autosave by GET, with the value in the query string;
- upload the resume by XHR the moment it is chosen (Lever's parseResume);
- load an image from another origin before the form is filled, and fetch another origin after.

Each write reports its own outcome back to the page's server, so the log shows whether it was tried and stopped or simply
never made. The test passed in all three runs.

## What the test shows

The employer received, in order:

```
GET /apply                               the page, loaded once
GET /autosave-get?first_name=Dryrun      the page's own GET autosave, with the typed first name
GET /stopped?what=post-autosave          (the test's own marks: the write was tried, and stopped)
GET /stopped?what=put-autosave
GET /went?what=get-autosave
GET /stopped?what=other-origin
GET /stopped?what=upload
```

The other origin received `GET /before-fill.png` only.

- **Stopped:** every write. No POST, PUT or beacon, and no request with a body, reached the employer: not the final
  submit, not an autosave, not the resume upload. The engine did attach the file (the upload was tried, and stopped).
  After the form was filled, nothing reached another origin, including the typed email.
- **Went out:** GETs only. The page load, a cross-origin resource the page loads before anything is filled, and **every
  same-origin GET the page's scripts make, including one that carries a typed value.**

## The real gap

A same-origin GET is never stopped (`scripts/apply.ts`: only non-GET/HEAD requests are judged). A page that autosaves,
validates or tracks by GET receives what the engine typed during a dry run. Here that was the person's first name; on a
real form it can be any planned answer. With G4 this happens before the person asked, for every alerted posting.

What the employer can learn this way is bounded by what the engine types. That is only the trusted facts (WO-102). It is
still sent before the person's approval, which is the line D-014 draws.

**Proposed change, not made here** (`scripts/apply.ts` is the shared engine; this is a design decision, not a claim check):

- After `populated`, stop a same-origin, non-navigation GET whose URL carries any planned value (each value of 3 or more
  characters, compared after URL decoding). Record it in the evidence as `dry_run_value_get`.
- Exempt the engine's own typeahead requests: the location and school search fields, whose suggestions are fetched by GET
  with the typed text. Either allow them only for the field being typed at that moment, or have the person approve a
  posting whose form needs one.
- This needs a test pair: the GET autosave stopped, and a Greenhouse location typeahead still filling (`forms-ci`
  fixtures).

## What a dry run touches, from reading the code (not tested here)

- **Captcha providers:** requests to Google reCAPTCHA, hCaptcha and Cloudflare challenges go out from the browser
  unjudged (`CAPTCHA_PROVIDER`). A page with a widget talks to that provider during a dry run.
- **Ashby GraphQL:** same-origin POST queries pass when `readOnly()` judges them reads. That is a POST to the employer, of
  queries, never mutations; the operation names are kept in the evidence. A query's variables can carry typed text,
  so this is the same class as the GET gap (`scripts/career/render-form.cjs` `readOnly`: paths matching `/graphql`).
- **Cross-origin GETs before the form is filled** go out: scripts, fonts, analytics, images. After the first field is
  filled, every cross-origin request is stopped.
- **Uploads:** the parse-on-choose upload is allowed only with `--approved` (an application the person already approved),
  only to the employer's own origin, only a body carrying the approved resume and nothing else, and at most twice. A dry
  run never has `--approved`.
- **Navigation:** a main-frame navigation to another origin, another tenant or another posting is stopped and ends the
  run (`HOST_REDIRECT_REFUSED`). So is an off-posting redirect.

Nothing beyond this page and these requests is claimed. A real employer's page may make requests this fixture does not.
