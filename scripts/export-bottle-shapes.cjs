// Optional build helper: PLAYWRIGHT_PACKAGE may point at a local Playwright installation.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_PACKAGE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),browser=await chromium.launch();
 const page=await browser.newPage();await page.setContent('<!doctype html><html><body></body></html>');
 await page.addScriptTag({path:path.join(root,'bottle-art.js')});
 const shapes=await page.evaluate(()=>BOTTLE_ARTS.map(style=>{
  const vb=style.viewBox.split(/\s+/).map(Number),ref=BOTTLE_ARTS[0],refW=ref.viewBox.split(/\s+/).map(Number)[2];
  const scale=(ref.bottom-ref.top)/(style.bottom-style.top)/refW;
  return style.outline.map(d=>{
   const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',d);
   const length=p.getTotalLength(),n=Math.ceil(length/1.2);
   return Array.from({length:n},(_,i)=>{const point=p.getPointAtLength(i*length/n);return [+(scale*(point.x-vb[2]/2)).toFixed(5),+(scale*(point.y-vb[3]/2)).toFixed(5)];});
  });
 }));
 fs.writeFileSync(path.join(root,'heap-shapes.js'),'// SVG silhouettes normalised to one reference vessel width.\nwindow.HeapShapes='+JSON.stringify(shapes)+';\n');
 await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
