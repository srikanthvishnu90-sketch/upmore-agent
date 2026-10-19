"use strict";
const http = require('node:http');
const crypto = require('node:crypto');

// The caller supplies the exact paused Playwright page. No URL, browser, or
// session id from a request can select a different tab. Put the loopback
// listener behind an operator-managed HTTPS reverse proxy for remote access.
async function createLiveView({host='127.0.0.1',port=0,publicOrigin,ttl=15*60*1000,now=Date.now}={}) {
  if (host!=='127.0.0.1' || !Number.isFinite(ttl) || ttl<=0 || ttl>15*60*1000) throw Error('INVALID_LIVE_VIEW_CONFIG');
  if (publicOrigin && (new URL(publicOrigin).protocol!=='https:' || new URL(publicOrigin).origin!==publicOrigin)) throw Error('HTTPS_ORIGIN_REQUIRED');
  const sessions=new Map();let origin;
  const secret=()=>crypto.randomBytes(32).toString('hex');
  const same=(a,b)=>typeof a==='string' && a.length===b.length && crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
  async function end(s,reason='closed') {
    if (s.closed) return;s.closed=true;clearTimeout(s.timer);sessions.delete(s.id);
    if(s.stream)s.stream.end();s.cdp.removeAllListeners('Page.screencastFrame');
    await s.cdp.send('Page.stopScreencast').catch(()=>{});await s.cdp.detach().catch(()=>{});
    s.done({reason});
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'none'; img-src data:; connect-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    try {
      const url=new URL(req.url,'http://localhost');const parts=url.pathname.split('/');const s=sessions.get(parts[2]);
      if (!s || s.closed || now()>=s.expires) {res.writeHead(410).end('Handoff expired');return;}
      if (req.method==='GET' && parts[1]==='claim') {
        if(s.claimed || !same(url.searchParams.get('token'),s.token)){res.writeHead(403).end();return;}
        s.claimed=true;s.token=null;
        res.setHeader('Set-Cookie',`upmore_handoff=${s.cookie}; HttpOnly; SameSite=Strict; Path=/view/${s.id}; Max-Age=${Math.floor((s.expires-now())/1000)}${publicOrigin?'; Secure':''}`);
        res.writeHead(303,{Location:`/view/${s.id}`}).end();return;
      }
      const cookie=req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('upmore_handoff='))?.slice('upmore_handoff='.length);
      if(parts[1]!=='view' || !s.claimed || !same(cookie,s.cookie)){res.writeHead(403).end();return;}
      if(req.method==='GET' && parts.length===3){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(html(s.id));return;}
      if(req.method==='GET' && parts[3]==='frames'){
        if(s.stream){res.writeHead(409).end();return;}
        res.writeHead(200,{'Content-Type':'text/event-stream','X-Accel-Buffering':'no'});s.stream=res;
        req.on('close',()=>{if(s.stream===res)s.stream=null;});
        await s.cdp.send('Page.startScreencast',{format:'jpeg',quality:70,maxWidth:1440,maxHeight:1000,everyNthFrame:1});return;
      }
      if(req.method!=='POST' || parts[3]!=='input' || req.headers.origin!==origin || req.headers['content-type']!=='application/json'){res.writeHead(403).end();return;}
      let bytes=0;const chunks=[];for await (const chunk of req){bytes+=chunk.length;if(bytes>2048){res.writeHead(413).end();return;}chunks.push(chunk);}
      const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(input.type==='resume'){await end(s,'user_resume');res.writeHead(204).end();return;}
      if(input.type==='click' && Number.isFinite(input.x) && Number.isFinite(input.y) && input.x>=0 && input.y>=0 && input.x<=s.width && input.y<=s.height){
        await s.cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:input.x,y:input.y,button:'left',clickCount:1});
        await s.cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:input.x,y:input.y,button:'left',clickCount:1});
      } else if(input.type==='text' && typeof input.text==='string' && input.text.length>0 && input.text.length<=256){
        await s.cdp.send('Input.insertText',{text:input.text});
      } else if(input.type==='key' && ['Tab','Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter','Escape'].includes(input.key)){
        await s.cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:input.key});await s.cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:input.key});
      } else {res.writeHead(400).end();return;}
      res.writeHead(204).end();
    } catch (_) {if(!res.headersSent)res.writeHead(400);res.end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  origin=publicOrigin||`http://${host}:${server.address().port}`;
  return {
    origin,
    async pause(page) {
      const cdp=await page.context().newCDPSession(page);const viewport=await cdp.send('Page.getLayoutMetrics');
      const size=viewport.cssLayoutViewport||viewport.layoutViewport;
      const s={id:secret(),token:secret(),cookie:secret(),cdp,expires:now()+ttl,width:size.clientWidth,height:size.clientHeight,closed:false,claimed:false};
      const completed=new Promise(resolve=>{s.done=resolve;});
      cdp.on('Page.screencastFrame',frame=>{
        if(s.stream && !s.stream.writableNeedDrain)s.stream.write(`data: ${JSON.stringify({data:frame.data,width:s.width,height:s.height})}\n\n`);
        cdp.send('Page.screencastFrameAck',{sessionId:frame.sessionId}).catch(()=>{});
      });
      s.timer=setTimeout(()=>{end(s,'expired').catch(()=>{});},ttl);s.timer.unref?.();sessions.set(s.id,s);
      return {url:`${origin}/claim/${s.id}?token=${s.token}`,completed,close:()=>end(s)};
    },
    async close(){await Promise.all([...sessions.values()].map(s=>end(s)));await new Promise(resolve=>server.close(resolve));},
  };
}

function html(id){return `<!doctype html><html><meta name="viewport" content="width=device-width"><title>Complete your application step</title>
<style>body{font:16px system-ui;margin:20px;background:#f4f5f7;color:#17212e}img{display:block;max-width:100%;border:1px solid #bbc2cc}button{padding:10px;margin:12px 0}</style>
<h1>Complete this step yourself</h1><p>This is your paused employer page. Click the image and type to complete its captcha or code. This link expires after 15 minutes.</p>
<img id="screen" tabindex="0" alt="Live employer page"><button id="resume">Return to application review</button><p id="status" role="status"></p>
<script>const screen=document.getElementById('screen'),status=document.getElementById('status');let width=1,height=1;
const send=async data=>{const r=await fetch('/view/${id}/input',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(!r.ok)status.textContent='Session unavailable; return to your application.';};
const events=new EventSource('/view/${id}/frames');events.onmessage=e=>{const f=JSON.parse(e.data);screen.src='data:image/jpeg;base64,'+f.data;width=f.width;height=f.height;};events.onerror=()=>{status.textContent='Live connection interrupted or expired.';};
screen.onclick=e=>{screen.focus();const r=screen.getBoundingClientRect();send({type:'click',x:(e.clientX-r.left)*width/r.width,y:(e.clientY-r.top)*height/r.height});};
screen.onkeydown=e=>{if(e.ctrlKey||e.metaKey||e.altKey)return;e.preventDefault();if(e.key.length===1)send({type:'text',text:e.key});else send({type:'key',key:e.key});};
document.getElementById('resume').onclick=async()=>{await send({type:'resume'});events.close();screen.remove();status.textContent='Return to your application to continue.';};</script></html>`;}
module.exports={createLiveView};
