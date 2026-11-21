// Run with: node scripts/check-ui.cjs. No browser or dependency required.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
class Element{
 constructor(){this.innerHTML='';this.textContent='';this.handlers={};this.style={};this.dataset={};this.classes=new Set();this.classList={add:(...xs)=>xs.forEach(x=>this.classes.add(x)),remove:(...xs)=>xs.forEach(x=>this.classes.delete(x)),contains:x=>this.classes.has(x),toggle:(x,on)=>on?this.classes.add(x):this.classes.delete(x)};}
 addEventListener(type,fn){this.handlers[type]=fn}querySelector(){return new Element()}closest(){return null}cloneNode(){return new Element()}removeAttribute(){}setAttribute(){}remove(){}
}
const els=new Map(),el=id=>{if(!els.has(id))els.set(id,new Element());return els.get(id)};
const timers=[],windowHandlers={};let hit=null;const doc={getElementById:el,querySelectorAll:()=>[],body:{append(){},classList:new Element().classList},elementFromPoint:()=>hit};
const context={console,Date,Math,performance,Promise,document:doc,localStorage:{getItem:()=>null,setItem(){}},setTimeout:fn=>{timers.push(fn)},window:{addEventListener:(type,fn)=>windowHandlers[type]=fn}};
vm.createContext(context);vm.runInContext(fs.readFileSync('tutorial.js','utf8')+'\n'+fs.readFileSync('game.js','utf8'),context);
const run=s=>vm.runInContext(s,context);
(async()=>{
 assert(el('ovbox').innerHTML.includes('id="splashPlay">Игра</button>'));
 assert(el('ovbox').innerHTML.includes('id="firstBattle">Обучение</button>'));
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
 run('Tutorial.start();FAST=false');run("place('p',G.hand.p.find(c=>c.def.id==='e1'),0);unplace(G.board[0].find(c=>c.owner==='p'));place('p',G.hand.p.find(c=>c.def.id==='e1'),0)");const pending=run('endTurn()');run('Tutorial.menu()');timers.splice(0).forEach(fn=>fn());await pending;assert.equal(run('G'),null);
 console.log('PASS: tutorial menu, tap/undo flow, six confirmations, final, repeat, exit confirmation and normal match');
})().catch(e=>{console.error(e);process.exitCode=1});
