// Run with: node scripts/check-first-battle-ui.cjs. No browser or dependency required.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
class Element{
 constructor(){this.innerHTML='';this.textContent='';this.handlers={};this.style={};this.dataset={};this.classes=new Set();this.classList={add:(...xs)=>xs.forEach(x=>this.classes.add(x)),remove:(...xs)=>xs.forEach(x=>this.classes.delete(x)),contains:x=>this.classes.has(x),toggle:(x,on)=>on?this.classes.add(x):this.classes.delete(x)};}
 addEventListener(type,fn){this.handlers[type]=fn}querySelector(){return new Element()}closest(){return null}cloneNode(){return new Element()}removeAttribute(){}setAttribute(){}remove(){}
}
const els=new Map(),el=id=>{if(!els.has(id))els.set(id,new Element());return els.get(id)};
// The splash uses painted WebP buttons; model their actual load/error events too.
const menuImages=['splashPlay','firstBattle'].map(id=>({
 complete:false,naturalWidth:0,handlers:{},
 closest:selector=>selector==='.menu-action'?el(id):null,
 addEventListener(type,fn){this.handlers[type]=fn;}
}));
const timers=[],windowHandlers={};let hit=null;
const doc={getElementById:el,querySelectorAll:selector=>selector==='.menu-action img'?menuImages:[],
 body:{append(){},classList:new Element().classList},elementFromPoint:()=>hit};
const context={console,Date,Math,performance,Promise,document:doc,localStorage:{getItem:()=>null,setItem(){}},setTimeout:fn=>{timers.push(fn)},window:{addEventListener:(type,fn)=>windowHandlers[type]=fn}};
vm.createContext(context);vm.runInContext(fs.readFileSync('tutorial.js','utf8')+'\n'+fs.readFileSync('game.js','utf8'),context);
const run=s=>vm.runInContext(s,context);
(async()=>{
 const splash=el('ovbox').innerHTML;
 for(const [id,file,label] of [
  ['splashPlay','menu-game-v2.webp','ИГРА'],
  ['firstBattle','menu-tutorial-v2.webp','ОБУЧЕНИЕ']
 ]){
  const button=splash.match(new RegExp('<button[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)<\\/button>'));
  assert(button,'Missing menu control '+id);
  assert(button[1].includes('<span class="menu-action-fallback">'+label+'</span>'));
  assert(button[1].includes('<img src="assets/ui/'+file+'?v='));
  assert.equal(typeof el(id).onclick,'function','Menu control must remain actionable');
 }
 assert(menuImages.every(img=>typeof img.handlers.load==='function'&&typeof img.handlers.error==='function'));
 assert(menuImages.every((img,i)=>!el(['splashPlay','firstBattle'][i]).classes.has('art-loaded')));
 for(const img of menuImages){img.complete=true;img.naturalWidth=1254;img.handlers.load();}
 assert(menuImages.every((img,i)=>el(['splashPlay','firstBattle'][i]).classes.has('art-loaded')));
 menuImages[1].naturalWidth=0;menuImages[1].handlers.error();
 assert(!el('firstBattle').classes.has('art-loaded'),'Tutorial fallback must return after image error');
 assert(el('splashPlay').classes.has('art-loaded'),'Game artwork must remain visible independently');
 el('splashPlay').onclick();assert(!el('ovbox').innerHTML.includes('id="training"'));assert(!el('ovbox').innerHTML.includes('Обучение'));
 run('splashScreen()');
 el('firstBattle').onclick();assert(el('ovbox').innerHTML.includes('Начать обучение'));
 el('lessonStart').onclick();run('FAST=true');assert.equal(run('gameMode'),'tutorial');
 for(let turn=1;turn<=6;turn++){
  const uid=run('G.hand.p.find(c=>c.def.id===Tutorial.round()[0]).uid'),lane=run('Tutorial.round()[1]');
  const clickCard=()=>el('hand').handlers.click({target:{closest:()=>({dataset:{uid}})}});
  const clickLane=()=>el('board').handlers.click({target:{closest:s=>s==='.lane'?{dataset:{l:lane}}:null}});
  clickCard();clickLane();
  if(turn===1){el('board').handlers.click({target:{closest:s=>s==='.mc'?{dataset:{uid}}:s==='.lane'?{dataset:{l:0}}:null}});assert.equal(run('G.spent.p'),0);clickCard();clickLane();}
  await run('endTurn()');assert(el('coach').innerHTML.includes('Продолжить'));el('lessonNext').onclick();
 }
 assert(el('ovbox').innerHTML.includes('Первая победа!'));assert(el('ovbox').innerHTML.includes('2:1'));
 el('lessonRepeat').onclick();assert.equal(run('G.turn'),1);el('lessonExit').onclick();el('lessonStay').onclick();assert.equal(run('gameMode'),'tutorial');el('lessonExit').onclick();el('lessonLeave').onclick();assert.equal(run('gameMode'),'normal');el('splashPlay').onclick();el('startMatch').onclick();assert.equal(run('gameMode'),'normal');assert(!run('tutorialActive'));el('helpBtn').onclick();assert(run('tutorialActive'));assert.equal(run('gameMode'),'normal');
 run('Tutorial.start();FAST=false');
 run("place('p',G.hand.p.find(c=>c.def.id==='e1'),0);unplace(G.board[0].find(c=>c.owner==='p'));place('p',G.hand.p.find(c=>c.def.id==='e1'),0)");
 const pending=run('endTurn()');
 run('Tutorial.menu()');
 assert.equal(run('G'),null,'Leaving the tutorial during reveal must clear the session');
 el('splashPlay').onclick();el('startMatch').onclick();
 const newSession=run('G');
 timers.splice(0).forEach(fn=>fn());
 await pending;
 assert.strictEqual(run('G'),newSession,'Old tutorial reveal modified a newly started match');
 assert.equal(run('gameMode'),'normal');
 assert.equal(run('G.phase'),'plan');
 console.log('PASS: tutorial menu, tap/undo flow, six confirmations, final, repeat, exit confirmation and normal match');
})().catch(e=>{console.error(e);process.exitCode=1});
