"use strict";
// W14 shared loader: real 125 + vendored 129 (from origin/career/sc-f10, unchanged) + CIR JSON + TEST fixtures.
const fs=require("fs"); const path=require("path");
const ROOT=path.join(__dirname,"..","..","..");
const H=require(path.join(ROOT,"scripts/career/scenario-harness.cjs"));
const I=require(path.join(ROOT,"packages/domain/125-career-intel.js")); const CI=I.CareerIntel||I;
const OS=require(path.join(ROOT,"packages/domain/129-career-os.js"));
const {execFileSync}=require("child_process");
const cir=(id)=>JSON.parse(fs.readFileSync(path.join(ROOT,`packages/career-data/cirs/${id}.json`),"utf8"));
const fixture=(n)=>JSON.parse(fs.readFileSync(path.join(ROOT,`packages/career-data/fixtures/${n}`),"utf8"));
function validateFile(id){ try{ execFileSync("node",[path.join(ROOT,"scripts/validate-cir.cjs"),path.join(ROOT,`packages/career-data/cirs/${id}.json`)],{stdio:"pipe"}); return {file:id,exit:0,ok:true}; }catch(e){ return {file:id,exit:e.status,ok:false,out:String(e.stdout||"").slice(0,300)}; } }
const NOW="2026-10-13T12:00:00Z";
module.exports={H,CI,OS,cir,fixture,validateFile,NOW,ROOT};
