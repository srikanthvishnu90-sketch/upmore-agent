'use strict';
// MODELED loopback HTTP counterparty. Persists only SYNTHETIC test records.
// Uses platform Request.formData independently of the adapter multipart parser.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {hash}=require('../../../workers/career-browser/store.cjs');
const root=process.argv[2];let submissions=0;
const server=http.createServer(async(req,res)=>{
 if(req.method==='GET'&&req.url==='/form'){res.setHeader('content-type','text/html');return res.end(fs.readFileSync(path.join(__dirname,'form.html')));}
 if(req.method==='GET'&&req.url==='/favicon.ico'){res.statusCode=204;return res.end();}
 if(req.method==='GET'&&req.url==='/counts'){res.setHeader('content-type','application/json');return res.end(JSON.stringify({submissions}));}
 if(req.method!=='POST'||req.url!=='/native-submit'){res.statusCode=404;return res.end('Unregistered modeled route');}
 submissions++;try{
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>11*1024*1024)throw Error('body too large');chunks.push(chunk);}const body=Buffer.concat(chunks);
  const form=await new Request('http://127.0.0.1/native-submit',{method:'POST',headers:{'content-type':req.headers['content-type']},body}).formData();
  const file=form.get('job_application[resume]'),bytes=Buffer.from(await file.arrayBuffer());
  const confirmationId='MODELED-'+submissions+'-12345',record={confirmationId,outcome:'accepted',source:'modeled_loopback_server',requestSha256:hash(body),receivedResumeSha256:hash(bytes),receivedFileBytes:bytes.length,filename:file.name,contentType:file.type,fields:Object.fromEntries([...form.entries()].filter(([,v])=>typeof v==='string')),internalHeaders:Object.keys(req.headers).filter(k=>k.startsWith('x-upmore-'))};
  fs.writeFileSync(path.join(root,confirmationId+'.json'),JSON.stringify(record),{mode:0o600});
  res.setHeader('content-type','text/html');res.end('<!doctype html><title>MODELED receipt</title><p id="receipt">Your modeled application has been received.</p><p id="application_id">'+confirmationId+'</p>');
 }catch(_){res.statusCode=422;res.end('Invalid modeled multipart');}
});
server.listen(0,'127.0.0.1',()=>process.send?.({port:server.address().port}));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
