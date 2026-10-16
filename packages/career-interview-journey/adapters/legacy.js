'use strict';
// A may supply eligible legacy stories. Never call legacy scoreAnswer/answerMock.
const InterviewJourneyLegacy = (()=>{
  const H=typeof InterviewJourneyHash!=='undefined'?InterviewJourneyHash:require('../../domain/interview-journey/hash.js');
  const C=typeof InterviewJourneyContext!=='undefined'?InterviewJourneyContext:require('./context.js');
  function readStories(snapshot,stories){
    C.validate(snapshot);C.assert(Array.isArray(stories),'legacy story list required');
    return stories.map(s=>{C.assert(typeof s.id==='string'&&Array.isArray(s.fact_refs),'legacy story requires canonical refs');const facts=s.fact_refs.map(r=>C.resolve(snapshot,r));C.assert(facts.every(f=>snapshot.facts.includes(f)),'legacy story cannot promote source into personal fact');return {id:s.id,fact_refs:H.clone(s.fact_refs),evidence:facts.map(f=>({id:f.id,version:f.version,value:H.clone(f.value)})),status:'unassessed',legacy_score_ignored:true};});
  }
  return {readStories};
})();
if(typeof module!=='undefined')module.exports=InterviewJourneyLegacy;
