// Bounded container validation only, never fact extraction or byte rewriting.
// Deno's documented node:zlib compatibility; actual Edge runtime remains gated.
import {inflateRawSync} from 'node:zlib';
import {Buffer} from 'node:buffer';
export const MAX_RESUME_BYTES=1048576;
export const PDF='application/pdf',DOCX='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes){let n=0xffffffff;for(const b of bytes)n=crcTable[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
function pdf(bytes){
 const text=bytes.toString('latin1');
 if(!/^%PDF-[12]\.\d/.test(text)||!/%%EOF\s*$/.test(text))fail('PDF_CONTAINER_INVALID');
 // Decode name escapes for policy inspection only; original bytes and xref
 // offsets stay intact. Compressed object dialects are outside this policy.
 const prohibited=new Set(['Encrypt','JavaScript','JS','Launch','EmbeddedFile','OpenAction','AA','XFA','ObjStm','XRef']);
 for(const [token]of text.matchAll(/\/[^\x00\x09\x0a\x0c\x0d ()<>\[\]{}/%]+/g)){
  if(/#(?![a-f\d]{2})/i.test(token))fail('PDF_DIALECT_UNSUPPORTED');
  const name=token.slice(1).replace(/#([a-f\d]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
  if(prohibited.has(name))fail('PDF_DIALECT_UNSUPPORTED');
 }
 const end=/startxref\s+(\d+)\s+%%EOF\s*$/.exec(text);if(!end)fail('PDF_CONTAINER_INVALID');
 const start=Number(end[1]);if(!Number.isSafeInteger(start)||text.slice(start,start+4)!=='xref')fail('PDF_DIALECT_UNSUPPORTED');
 const trailer=text.slice(start);if(!/trailer\s*<<[\s\S]*?\/Root\s+\d+\s+\d+\s+R/.test(trailer)||!/\/Type\s*\/Catalog\b/.test(text)||!/\/Type\s*\/Pages\b/.test(text)||!/\/Type\s*\/Page\b/.test(text))fail('PDF_CONTAINER_INVALID');
 const table=trailer.split('trailer')[0],lines=table.trim().split(/\r?\n/);let i=1,count=0;
 while(i<lines.length){const section=/^(\d+) (\d+)$/.exec(lines[i++]);if(!section)fail('PDF_CONTAINER_INVALID');const first=Number(section[1]),n=Number(section[2]);if(n>5000||count+n>5000)fail('PDF_DIALECT_UNSUPPORTED');count+=n;
  for(let k=0;k<n;k++){const entry=/^(\d{10}) (\d{5}) ([nf])\s*$/.exec(lines[i++]||'');if(!entry)fail('PDF_CONTAINER_INVALID');if(entry[3]==='n'){const at=Number(entry[1]);if(text.slice(at,at+String(first+k).length+1)!==String(first+k)+' ')fail('PDF_CONTAINER_INVALID');}}
 }
 if(!count)fail('PDF_CONTAINER_INVALID');
}
function docx(bytes){
 let end=-1;for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(bytes.readUInt32LE(p)===0x06054b50&&p+22+bytes.readUInt16LE(p+20)===bytes.length){end=p;break;}
 if(end<0)fail('DOCX_CONTAINER_INVALID');
 const n=bytes.readUInt16LE(end+10),size=bytes.readUInt32LE(end+12),start=bytes.readUInt32LE(end+16);
 if(bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6)||bytes.readUInt16LE(end+8)!==n||n<3||n>80||start+size!==end)fail('DOCX_CONTAINER_INVALID');
 const parts=new Map(),ranges=[];let p=start,total=0;
 for(let k=0;k<n;k++){
  if(p+46>end||bytes.readUInt32LE(p)!==0x02014b50)fail('DOCX_CONTAINER_INVALID');
  const flags=bytes.readUInt16LE(p+8),method=bytes.readUInt16LE(p+10),sum=bytes.readUInt32LE(p+16),compressed=bytes.readUInt32LE(p+20),expanded=bytes.readUInt32LE(p+24),len=bytes.readUInt16LE(p+28),extra=bytes.readUInt16LE(p+30),comment=bytes.readUInt16LE(p+32),local=bytes.readUInt32LE(p+42);
  if(flags&1||![0,8].includes(method)||expanded>2097152||(total+=expanded)>8388608||p+46+len+extra+comment>end||local+30>start)fail('DOCX_CONTAINER_INVALID');
  const name=bytes.toString('utf8',p+46,p+46+len);if(!name||name.includes('\\')||name.startsWith('/')||name.split('/').includes('..')||/[\x00-\x1f]/.test(name)||parts.has(name)||!/^[\x20-\x7e]+$/.test(name))fail('DOCX_CONTAINER_INVALID');
  if(/vbaProject|^word\/embeddings\//i.test(name))fail('DOCX_DIALECT_UNSUPPORTED');
  if(bytes.readUInt32LE(local)!==0x04034b50||bytes.readUInt16LE(local+8)!==method||bytes.readUInt16LE(local+6)!==flags)fail('DOCX_CONTAINER_INVALID');
  const localName=bytes.readUInt16LE(local+26),localExtra=bytes.readUInt16LE(local+28),data=local+30+localName+localExtra;
  if(bytes.toString('utf8',local+30,local+30+localName)!==name||data+compressed>start||ranges.some(([a,b])=>local<b&&data+compressed>a))fail('DOCX_CONTAINER_INVALID');ranges.push([local,data+compressed]);
  let result;try{result=method===8?inflateRawSync(bytes.subarray(data,data+compressed),{maxOutputLength:2097152}):bytes.subarray(data,data+compressed);}catch(_){fail('DOCX_CONTAINER_INVALID');}
  if(result.length!==expanded||crc(result)!==sum)fail('DOCX_CONTAINER_INVALID');
  if(/\.(?:xml|rels)$/i.test(name)){
   // Only UTF-8/ASCII XML is supported. A fatal decode and NUL refusal prevent
   // UTF-16/32 or legacy encodings from hiding active dialect markers.
   let xml;try{xml=new TextDecoder('utf-8',{fatal:true}).decode(result);}catch(_){fail('DOCX_DIALECT_UNSUPPORTED');}
   const encoding=/<\?xml\s[^?]*\bencoding\s*=\s*['"]([^'"]+)['"]/i.exec(xml)?.[1];
   if(xml.includes('\0')||(encoding&&!/^(?:utf-8|us-ascii)$/i.test(encoding))||/<!DOCTYPE|<!ENTITY|macroEnabled|vbaProject|oleObject|attachedTemplate/i.test(xml))fail('DOCX_DIALECT_UNSUPPORTED');
  }
  parts.set(name,result);p+=46+len+extra+comment;
 }
 if(p!==end||!parts.has('[Content_Types].xml')||!parts.has('_rels/.rels')||!parts.has('word/document.xml')||!/wordprocessingml\.document\.main\+xml/.test(parts.get('[Content_Types].xml').toString())||!/<(?:\w+:)?document\b/.test(parts.get('word/document.xml').toString())||!/<\/(?:\w+:)?document>/.test(parts.get('word/document.xml').toString()))fail('DOCX_CONTAINER_INVALID');
}
export async function validateResume(input,filename,contentType){
 const bytes=Buffer.from(input);
 if(!bytes.length||bytes.length>MAX_RESUME_BYTES)fail('RESUME_SIZE_LIMIT');
 if(typeof filename!=='string'||!/^[^\x00-\x1f\x7f/\\]{1,180}$/.test(filename)||['.','..'].includes(filename))fail('RESUME_FILENAME_INVALID');
 if(contentType===PDF&&/\.pdf$/i.test(filename))pdf(bytes);
 else if(contentType===DOCX&&/\.docx$/i.test(filename))docx(bytes);else fail('RESUME_MIME_INVALID');
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return {version:'career_applicant_format/v1',policy:'bounded_plain_pdf_docx/v1',sha256:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join(''),bytes:bytes.length,contentType,filename};
}
