'use strict';
const {test}=require('node:test');const {contracts}=require('./helpers/conversation-mechanism-contracts.cjs');
const C=require('../packages/domain/155-career-conversation.js'),N=require('../packages/domain/128-career-negotiation.js'),Host=require('../supabase/functions/_shared/career_host.js').CareerHost;
const D=n=>require('../packages/domain/'+n),deps={CareerAccess:D('120-career-access.js'),CareerOnboarding:D('130-career-onboarding.js'),CareerRouter:D('142-career-router.js'),CareerDoorstep:D('141-career-doorstep.js'),CareerReply:D('140-career-reply.js'),CareerContainment:D('143-career-containment.js')};
for(const [id,check]of Object.entries(contracts))test(id+': conversation mechanism',()=>check(C,N,Host,deps));
