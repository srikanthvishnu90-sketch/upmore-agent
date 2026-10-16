'use strict';
const https = require('node:https'), dns = require('node:dns').promises, net = require('node:net');
const {publicResearchURL} = require('../../supabase/functions/_shared/career_research_policy.js');
const {fail} = require('./store.cjs');
function publicAddress(address) {
  if (net.isIP(address) === 4) {
    const [a,b] = address.split('.').map(Number);
    return !(a===0 || a===10 || a===127 || a>=224 || (a===100&&b>=64&&b<=127) || (a===169&&b===254) || (a===172&&b>=16&&b<=31) || (a===192&&(b===0||b===168)) || (a===198&&(b===18||b===19||b===51)) || (a===203&&b===0));
  }
  // Conservatively accept global-unicast IPv6 only; reject mapped/private,
  // documentation, tunnelling and special ranges rather than guessing.
  if (net.isIP(address)!==6) return false;
  const [first,second]=address.split(':').map(part=>parseInt(part,16));
  return first>=0x2000 && first<0x4000 && first!==0x2002 && first!==0x3fff && !(first===0x2001 && (second<0x200 || second===0xdb8));
}
async function publicGet(url, {origin, lookup = dns.lookup, request = https.request, maxBytes = 2000000} = {}) {
  publicResearchURL(url);const u = new URL(url);
  if (u.origin !== origin) throw fail('RESEARCH_ORIGIN_REFUSED');
  const addresses = await lookup(u.hostname, {all:true,verbatim:true});
  if (!addresses.length || addresses.some(a=>!publicAddress(a.address))) throw fail('RESEARCH_DNS_REFUSED');
  const selected=addresses[0];
  return new Promise((resolve,reject)=>{
    // Pin the validated address for this connection. Browser DNS cannot
    // rebind the request; normal TLS certificate verification stays enabled.
    const req=request(u,{method:'GET',agent:false,family:selected.family,lookup:(_host,options,cb)=>options?.all?cb(null,[selected]):cb(null,selected.address,selected.family),headers:{accept:'text/html,application/xhtml+xml', 'accept-encoding':'identity'}},res=>{
      if(res.statusCode>=300&&res.statusCode<400){res.resume();reject(fail('RESEARCH_REDIRECT_REFUSED'));return;}
      const contentType=String(res.headers['content-type']||'');
      if((res.headers['content-encoding'] && res.headers['content-encoding']!=='identity')||res.statusCode!==200||!/^text\/html\b|^application\/xhtml\+xml\b/i.test(contentType)){res.resume();reject(fail('RESEARCH_SOURCE_UNAVAILABLE'));return;}
      const chunks=[];let size=0;
      res.on('data',chunk=>{size+=chunk.length;if(size>maxBytes)req.destroy(fail('RESEARCH_SOURCE_TOO_LARGE'));else chunks.push(chunk);});
      res.on('end',()=>resolve({status:200,body:Buffer.concat(chunks),headers:{'content-type':contentType,'content-security-policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'none'; frame-src 'none'"},address:selected.address}));
      res.on('error',reject);
    });
    req.setTimeout(10000,()=>req.destroy(fail('RESEARCH_NETWORK_TIMEOUT')));req.on('error',reject);req.end();
  });
}
module.exports={publicAddress,publicGet};
