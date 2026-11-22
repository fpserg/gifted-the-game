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
// Read the current application and service-worker declarations instead of
// pinning this regression test to a historical CSS or cache version.
const swContext={self:{addEventListener(){}}};
const shell=vm.runInNewContext(sw+'\nAPP_SHELL',swContext);
const cacheName=vm.runInNewContext(sw+'\nCACHE_NAME',swContext);
assert(Array.isArray(shell) && /^game-of-gifts-v\d+-/.test(cacheName),'Invalid PWA shell/cache name');
const shellHas=path=>assert(shell.includes('./'+path),'Missing exact precache URL: '+path);
const htmlResources=[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m=>m[1]);
for(const base of ['styles.css','tutorial.js','game.js']){
 const refs=htmlResources.filter(url=>url.startsWith(base+'?'));
 assert.equal(refs.length,1,'Expected one versioned HTML reference to '+base);
 assert(/^v=[A-Za-z0-9-]+$/.test(refs[0].split('?')[1]),'Missing/unsafe version token for '+base);
 shellHas(refs[0]);
}
for(const [id,file,label] of [
 ['splashPlay','menu-game-v2.webp','ИГРА'],
 ['firstBattle','menu-tutorial-v2.webp','ОБУЧЕНИЕ']
]){
 const button=game.match(new RegExp('<button class="menu-action" id="'+id+'"[^>]*>([\\s\\S]*?)<\\/button>'));
 assert(button,'Missing illustrated menu button '+id);
 assert(button[1].includes('<span class="menu-action-fallback">'+label+'</span>'),'Fallback label missing: '+id);
 const image=button[1].match(/<img src="([^"]+)"[^>]*>/);
 assert(image,'Missing menu image: '+id);
 const url=image[1];
 assert(url.startsWith('assets/ui/'+file+'?v='),'Unexpected menu art path/version: '+url);
 shellHas(url);
}
assert.match(css,/\.menu-action\.art-loaded \.menu-action-fallback\s*\{\s*visibility:\s*hidden/);
assert.match(css,/\.menu-action\.art-loaded\s*\{[^}]*border:\s*0/);
assert.match(css,/\.menu-action\.art-loaded img\s*\{\s*opacity:\s*1/);
assert.match(css,/\.menu-action#firstBattle\.art-loaded\s*\{\s*background:\s*none/);
assert(game.includes("img.addEventListener('load',check)")&&game.includes("img.addEventListener('error',check)"));
assert(game.includes("$('splashPlay').onclick=heroPick"));
assert(game.includes("$('firstBattle').onclick=()=>Tutorial.intro()"));
assert(game.includes("$('menuBtn').disabled=G.phase!=='plan'"));
const handlers={};
let networkResponse={ok:false,status:503},cachedResponse={ok:true,source:'cache'};
const scope='https://example.test/gifted-the-game/';
const menuUrl=game.match(/<button class="menu-action" id="splashPlay"[^>]*>[\\s\\S]*?<img src="([^"]+)"/)[1];
const swSelf={location:{origin:'https://example.test'},registration:{scope},addEventListener:(type,fn)=>handlers[type]=fn};
const caches={match:async()=>cachedResponse,open:async()=>({put:async()=>{}})};
vm.runInNewContext(sw,{self:swSelf,caches,fetch:async()=>networkResponse,URL});
async function runFetch(){
 let promise;
 handlers.fetch({request:{method:'GET',mode:'same-origin',url:scope+menuUrl},respondWith:p=>{promise=p;}});
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
 console.log('PASS: two WebP binaries, menu CSS/DOM wiring, HTML/SW version alignment, image load/fallback, HTTP fallback, SW network-first');
})().catch(e=>{console.error(e);process.exitCode=1;});
