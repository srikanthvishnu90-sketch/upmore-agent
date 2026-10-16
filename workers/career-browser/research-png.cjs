'use strict';
const {inflateSync}=require('node:zlib');
// Chromium screenshots are bounded, non-interlaced 8-bit RGB/RGBA PNGs.
// Validate chunks, CRCs and scanline framing; a signature alone is no image.
function validResearchPNG(b) {
  try {
    if(b.length<57||b.length>500000||b.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')return false;
    let at=8,width,height,channels,ended=false,idatEnded=false;const data=[];
    const crc=bytes=>{let c=0xffffffff;for(const v of bytes){c^=v;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
    while(at<b.length){
      if(at+12>b.length)return false;
      const n=b.readUInt32BE(at),end=at+12+n,type=b.toString('ascii',at+4,at+8);
      if(end>b.length||!/^[A-Za-z]{4}$/.test(type)||crc(b.subarray(at+4,end-4))!==b.readUInt32BE(end-4))return false;
      if(at===8){
        if(type!=='IHDR'||n!==13)return false;
        width=b.readUInt32BE(at+8);height=b.readUInt32BE(at+12);channels=b[at+17]===2?3:b[at+17]===6?4:0;
        if(!width||!height||width>4096||height>4096||!channels||b[at+16]!==8||b[at+18]||b[at+19]||b[at+20])return false;
      }else if(type==='IHDR')return false;
      if(type==='IDAT'){if(idatEnded)return false;data.push(b.subarray(at+8,end-4));}
      else if(data.length)idatEnded=true;
      if(type==='IEND'){if(n||!data.length||end!==b.length)return false;ended=true;}
      else if(!['IHDR','IDAT','PLTE'].includes(type)&&type[0]===type[0].toUpperCase())return false;
      at=end;
    }
    if(!ended)return false;
    const stride=1+width*channels,expected=stride*height;
    if(expected>32*1024*1024)return false;
    const decoded=inflateSync(Buffer.concat(data),{maxOutputLength:expected});
    if(decoded.length!==expected)return false;
    for(let row=0;row<height;row++)if(decoded[row*stride]>4)return false;
    return true;
  }catch(_){return false;}
}
module.exports={validResearchPNG};
