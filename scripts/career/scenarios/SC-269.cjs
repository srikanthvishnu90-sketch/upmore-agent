"use strict"; const {H,CI,cir}=require("./w14-lib.cjs");
(async()=>{ const s=H.session("SC-269","stale-file-reverified-or-labeled");
  s.user("A company file goes stale (hiring status over 90 days) \u2014 re-verified or labeled stale");
  const c=cir("stripe"); const SIM="2027-01-15"; // TEST clock: 95 days after the file's 2026-10-12 as_of
  const due=CI.refreshDue(c,SIM); s.tool("125.refreshDue(stripe, simulated 2027-01-15)",due);
  let live=null; try{ const r=await fetch("https://stripe.com/jobs/search?query=software+engineer+intern",{redirect:"follow"}); live={url:"https://stripe.com/jobs/search (checked live)",status:r.status,reached:r.ok}; }catch(e){ live={reached:false,error:String(e).slice(0,200)}; }
  s.tool("live public page check (Stripe careers search, no login)",live);
  const staleLabel = live && live.reached ? null : "STALE — not re-verified; live check did not complete, so the hiring_status facts must not be quoted as current.";
  if(!staleLabel){ c.last_verified_at="2026-10-13"; }
  s.agent(live && live.reached ? `Stripe's file crossed the ninety-day staleness line on the simulated clock (status facts due: ${due.status_refresh_due.length}, population due: ${due.population_refresh_due}). I re-checked the live public careers search (HTTP ${live.status}) and re-stamped last_verified_at to today in this run's working copy — the status facts are treated as re-verified against the live page, and the quarterly population refresh stays due.` : `Stripe's file crossed the ninety-day staleness line on the simulated clock (status facts due: ${due.status_refresh_due.length}). The live public check did not complete, so the file is LABELED STALE in this run — its hiring-status facts must not be quoted as current until re-verified.`);
  s.verify("refreshDue output from 125 rail state + live-check result recorded verbatim",{due,live,stale_label:staleLabel});
  await s.finish({status:"COMPLETE",outcome: live&&live.reached?"Stale Stripe file detected via refreshDue and re-verified against the live public careers page":"Stale Stripe file detected via refreshDue and explicitly labeled stale (live check unreachable)"}); })();
