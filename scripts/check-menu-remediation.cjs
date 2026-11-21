// Run: node scripts/check-menu-remediation.cjs (no browser/dependencies).
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
class Element {
 constructor(){
  this.innerHTML='';this.textContent='';this.hidden=false;this.disabled=false;this.style={};
  this.classes=new Set();this.handlers={};
  this.classList={add:(...a)=>a.forEach(x=>this.classes.add(x)),remove:(...a)=>a.forEach(x=>this.classes.delete(x)),contains:x=>this.classes.has(x),toggle:(x,v)=>v?this.classes.add(x):this.classes.delete(x)};
 }
 addEventListener(k,fn){this.handlers[k]=fn;}
 querySelector(){return new Element();}
 closest(){return null;}
 cloneNode(){return new Element();}
 removeAttribute(){}
 setAttribute(){}
 remove(){}
}
const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
const medallions=[new Element(),new Element()];
const images=medallions.map(button=>({
 complete:false,naturalWidth:0,handlers:{},closest:()=>button,
 addEventListener(type,fn){this.handlers[type]=fn;}
}));
const timers=[],windowHandlers={};
const doc={
 getElementById:el,
 querySelectorAll:selector=>selector==='.menu-action img'?images:[],
 body:{append(){},classList:new Element().classList},
 elementFromPoint:()=>null
};
const context={console,Date,Math,performance,Promise,document:doc,URL,
 localStorage:{getItem:()=>null,setItem(){}},
 setTimeout:(fn,ms)=>{timers.push({fn,ms});},
 window:{addEventListener:(type,fn)=>{windowHandlers[type]=fn;}}
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('tutorial.js','utf8')+'\n'+fs.readFileSync('game.js','utf8'),context);
const run=code=>vm.runInContext(code,context);
(async()=>{
 const css=fs.readFileSync('styles.css','utf8');
 assert.match(css,/\.menu-action\.art-loaded \.menu-action-fallback\s*\{\s*visibility:\s*hidden\s*;/);
 assert.match(css,/\.menu-action\.art-loaded img\s*\{\s*opacity:\s*1\s*;/);
 assert.equal(images.length,2);
 assert(images.every((img,i)=>!medallions[i].classes.has('art-loaded')));
 for(const img of images){img.complete=true;img.naturalWidth=1254;img.handlers.load();}
 assert(medallions.every(b=>b.classes.has('art-loaded')),'art must replace text after load');
 for(const img of images){img.naturalWidth=0;img.handlers.error();}
 assert(medallions.every(b=>!b.classes.has('art-loaded')),'text fallback must return on error');
 assert.equal(typeof el('splashPlay').onclick,'function');
 assert.equal(typeof el('firstBattle').onclick,'function');

 // Both buttons are independently actionable; tutorial never becomes a normal game.
 el('firstBattle').onclick();
 assert(el('ovbox').innerHTML.includes('Первая битва'),'tutorial intro must open');
 run('splashScreen()');
 el('splashPlay').onclick();
 assert(el('ovbox').innerHTML.includes('Выбери своего героя'),'normal mode opens hero picker');

 run("newGame('eng');FAST=true");
 const saved=run('G');
 assert.equal(el('menuBtn').disabled,false,'menu available in plan');
 el('menuBtn').onclick();
 assert(el('ovbox').innerHTML.includes('Текущая партия будет прервана'));
 el('cancelGameHome').onclick();
 assert.strictEqual(run('G'),saved,'cancel retains game object');
 assert(el('ov').classes.has('hide'));
 run("G.phase='reveal';render()");
 assert.equal(el('menuBtn').disabled,true);
 el('menuBtn').onclick();
 assert(el('ov').classes.has('hide'),'exit blocked in reveal');
 run("G.phase='over';render()");
 assert.equal(el('menuBtn').disabled,true);
 el('menuBtn').onclick();
 assert(el('ov').classes.has('hide'),'exit blocked after game');
 run("G.phase='plan';render()");
 el('menuBtn').onclick();el('confirmGameHome').onclick();
 assert.equal(run('G'),null,'confirmed exit clears active game');
 assert(el('ov').classes.has('splash-overlay'));

 run("newGame('eng');FAST=true;finish()");
 const delayed=timers.at(-1);assert.equal(delayed.ms,700);
 run("newGame('ast')");const afterNew=el('ovbox').innerHTML;
 delayed.fn();assert.equal(el('ovbox').innerHTML,afterNew,'stale game result must not appear');
 run('finish()');const delayedHome=timers.at(-1);
 run('splashScreen()');const home=el('ovbox').innerHTML;
 delayedHome.fn();assert.equal(el('ovbox').innerHTML,home,'old result cannot replace home menu');
 run("newGame('kee');finish()");
 timers.at(-1).fn();
 assert(el('ovbox').innerHTML.includes('Ещё партию'),'normal result still appears');

 // Existing normal game completes in six turns without changing game rules.
 for(const faction of ['eng','ast','kee']){
  run("newGame('"+faction+"');FAST=true");
  await run("(async()=>{aiPlan('p');for(let n=0;n<6;n++){await endTurn();if(G.phase==='plan')aiPlan('p')}})()");
  assert.equal(run('G.phase'),'over');
  assert.equal(run('G.turn'),6);
 }
 // HTTP errors must use a valid cached UI image where available.
 const sw=fs.readFileSync('service-worker.js','utf8');
 assert.match(sw,/return caches\.match\(request\)\.then\(cached=>cached\|\|response\)/);
 assert.match(sw,/if\(response\.ok\)/);
 // Exercise service worker fetch behavior, not just inspect its source.
 const handlers={};let cachedResponse={ok:true,source:'cache'},outcome={ok:false,status:503};
 const swSelf={location:{origin:'https://example.test'},registration:{scope:'https://example.test/gifted-the-game/'},addEventListener:(name,fn)=>{handlers[name]=fn;}};
 const swContext={self:swSelf,URL,Array,Promise,
  caches:{match:async()=>cachedResponse,open:async()=>({put:async()=>{}})},
  fetch:async()=>outcome};
 vm.createContext(swContext);vm.runInContext(sw,swContext);
 const request={method:'GET',mode:'no-cors',url:'https://example.test/gifted-the-game/assets/ui/menu-game-v2.webp'};
 const fetchAsset=async()=>{let response;handlers.fetch({request,respondWith:p=>{response=p;}});return response;};
 assert.strictEqual(await fetchAsset(),cachedResponse,'503 must use cached medallion');
 cachedResponse=undefined;
 assert.strictEqual(await fetchAsset(),outcome,'503 without cache remains image error for text fallback');
 cachedResponse={ok:true,source:'cache'};outcome={ok:true,source:'network',clone(){return this;}};
 assert.strictEqual(await fetchAsset(),outcome,'successful HTTP response takes precedence');
 console.log('PASS: medallions, fallback, navigation, stale results, tutorial, 3 complete games, SW HTTP fallback');
})().catch(error=>{console.error(error);process.exitCode=1;});
