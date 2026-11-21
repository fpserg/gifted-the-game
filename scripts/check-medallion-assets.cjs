// Run: node scripts/check-medallion-assets.cjs
// Verifies actual binary artwork, menu wiring and the PWA upgrade path.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

for(const file of ['menu-game-v2.webp','menu-tutorial-v2.webp']){
 const bytes=fs.readFileSync('assets/ui/'+file);
 assert(bytes.length>100000,file+' is unexpectedly small');
 assert.equal(bytes.toString('ascii',0,4),'RIFF',file+' is not binary RIFF');
 assert.equal(bytes.toString('ascii',8,12),'WEBP',file+' is not binary WebP');
 assert.equal(bytes.toString('ascii',12,16),'VP8X',file+' must be extended WebP');
 const width=1+bytes.readUIntLE(24,3);
 const height=1+bytes.readUIntLE(27,3);
 assert.equal(width,1254,file+' incorrect width');
 assert.equal(height,1254,file+' incorrect height');
}
const game=fs.readFileSync('game.js','utf8');
const css=fs.readFileSync('styles.css','utf8');
const html=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('service-worker.js','utf8');
const suffix='?v=approved-medallions-1';
for(const file of ['menu-game-v2.webp','menu-tutorial-v2.webp']){
 assert(game.includes('assets/ui/'+file+suffix),'menu image reference missing');
 assert(sw.includes('./assets/ui/'+file+suffix),'PWA pre-cache reference missing');
}
for(const file of ['styles.css','game.js','tutorial.js']){
 assert(html.includes(file+'?v=approved-medallions-1'),'HTML cache bust missing: '+file);
 assert(sw.includes('./'+file+'?v=approved-medallions-1'),'SW cache bust missing: '+file);
}
assert(sw.includes('game-of-gifts-v8-approved-medallions'));
assert.match(css,/\.menu-action\.art-loaded \.menu-action-fallback\s*\{\s*visibility:\s*hidden/);
assert.match(css,/\.menu-action\.art-loaded\s*\{[^}]*border:\s*0/);
assert.match(css,/\.menu-action\.art-loaded img\s*\{\s*opacity:\s*1/);
assert(game.includes("img.addEventListener('load',check)")&&game.includes("img.addEventListener('error',check)"));
assert(game.includes("$('splashPlay').onclick=heroPick"));
assert(game.includes("$('firstBattle').onclick=()=>Tutorial.intro()"));
assert(game.includes("$('menuBtn').disabled=G.phase!=='plan'"));
const handlers={};
let networkResponse={ok:false,status:503},cachedResponse={ok:true,source:'cache'};
const scope='https://example.test/gifted-the-game/';
const swSelf={location:{origin:'https://example.test'},registration:{scope},addEventListener:(type,fn)=>handlers[type]=fn};
const caches={match:async()=>cachedResponse,open:async()=>({put:async()=>{}})};
vm.runInNewContext(sw,{self:swSelf,caches,fetch:async()=>networkResponse,URL});
async function runFetch(){
 let promise;
 handlers.fetch({request:{method:'GET',mode:'same-origin',url:scope+'assets/ui/menu-game-v2.webp'+suffix},respondWith:p=>{promise=p;}});
 assert(promise,'service worker did not handle request');
 return promise;
}
(async()=>{
 assert.strictEqual(await runFetch(),cachedResponse,'HTTP error should use cached art');
 cachedResponse=undefined;
 assert.strictEqual(await runFetch(),networkResponse,'HTTP error without cache must fail image load');
 networkResponse={ok:true,status:200,clone(){return this;}};
 cachedResponse={ok:true,source:'stale'};
 assert.strictEqual(await runFetch(),networkResponse,'online valid image should take priority');
 console.log('PASS: two WebP binaries, menu CSS/DOM wiring, cache-busting, HTTP fallback, SW network-first');
})().catch(e=>{console.error(e);process.exitCode=1;});
