#!/usr/bin/env python3
"""Capture the owner-provided doc through its rendered iframe, without leases."""
import argparse, hashlib, pathlib, re, subprocess
ROOT = pathlib.Path(__file__).resolve().parents[1]
TARGET = ROOT / 'docs/instinct-spec-series/16-messaging-native.md'
URL = 'https://files.instinct.com/qqkvf3yl67go-upmore-messaging-native-spec'
JS = r'''
const {chromium}=require(process.argv[1]);
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();
  await page.goto(process.argv[2],{waitUntil:'domcontentloaded'});
  let content='';
  for(let i=0;i<60;i++) {
   for(const frame of page.frames()) {
    if(frame===page.mainFrame())continue;
    const value=await frame.locator('body').innerText().catch(()=> '');
    if(value.length>5000 && /messag/i.test(value)) {content=value;break;}
   }
   if(content)break;
   await page.waitForTimeout(500);
  }
  if(!content)throw Error('Rendered specification was not available; no placeholder captured.');
  process.stdout.write(content);
 } finally {await browser.close();}
})().catch(e=>{console.error(e.message);process.exit(1);});
'''
def check():
    text = TARGET.read_text()
    prefix, content = text.split('\n\n---\n\n', 1)
    expected = re.search(r'Text SHA256: `([a-f0-9]{64})`', prefix).group(1)
    assert URL in prefix and len(content)>5000
    assert hashlib.sha256(content.encode()).hexdigest()==expected, 'Captured source text changed'
    assert not re.search(r'lease=|eyJ[A-Za-z0-9_-]{30}',text), 'Do not retain access leases'
    print('PASS: rendered messaging specification, source URL and text hash verified.')
    print('Specification SHA256: '+expected)
    gap=ROOT/'docs/implementation/messaging-native-gap-map.md'
    if gap.exists():
        print('Gap-map artifact SHA256: '+hashlib.sha256(gap.read_bytes()).hexdigest()+' (artifact integrity, not behavior proof)')
def main():
    args=argparse.ArgumentParser();args.add_argument('--check',action='store_true');args.add_argument('--playwright-module');parsed=args.parse_args()
    if not parsed.check:
        module_root=parsed.playwright_module or subprocess.check_output(['npm','root','-g'],text=True).strip()+'/playwright'
        content=subprocess.check_output(['node','-e',JS,module_root,URL],text=True)
        content=content.rstrip()+'\n'
        digest=hashlib.sha256(content.encode()).hexdigest()
        TARGET.write_text(f'# Upmore Spec 16: Messaging native\n\nSource: {URL}\nCaptured: 2026-10-10 via headless Chromium; rendered iframe text extraction, as in the preceding series.\nText SHA256: `{digest}`\n\n---\n\n'+content)
    check()
if __name__=='__main__':main()
