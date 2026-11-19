// Run with: node scripts/check-ui.cjs. No browser or dependency required.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
class Element{
 constructor(){this.innerHTML='';this.textContent='';this.handlers={};this.style={};this.dataset={};this.classes=new Set();this.classList={add:(...xs)=>xs.forEach(x=>this.classes.add(x)),remove:(...xs)=>xs.forEach(x=>this.classes.delete(x)),contains:x=>this.classes.has(x),toggle:(x,on)=>on?this.classes.add(x):this.classes.delete(x)};}
 addEventListener(type,fn){this.handlers[type]=fn}querySelector(){return new Element()}closest(){return null}cloneNode(){return new Element()}removeAttribute(){}setAttribute(){}remove(){}
}
const els=new Map(),el=id=>{if(!els.has(id))els.set(id,new Element());return els.get(id)};
const timers=[],windowHandlers={};let hit=null;const doc={getElementById:el,querySelectorAll:()=>[],body:{append(){}},elementFromPoint:()=>hit};
const context={console,Date,Math,performance,Promise,document:doc,localStorage:{getItem:()=>null,setItem(){}},setTimeout:fn=>{timers.push(fn)},window:{addEventListener:(type,fn)=>windowHandlers[type]=fn}};
vm.createContext(context);vm.runInContext(fs.readFileSync('game.js','utf8'),context);
const run=s=>vm.runInContext(s,context);
(async()=>{
 assert(el('ovbox').innerHTML.includes('Выбери своего героя'));
 run("pickedHero='eng';startMatch(true);FAST=true;");
 assert(el('coach').innerHTML.includes('ОБУЧЕНИЕ'));run("tutorialEvent('end')");assert(run('tutorialStep')===0);
 run("G.hand.p=[inst(CARDS.find(c=>c.id==='e1'),'p')];G.spent.p=0;render();");
 const uid=run('G.hand.p[0].uid');const hc={dataset:{uid},closest:()=>hc};
 el('hand').handlers.click({target:hc});assert(run('G.sel')===uid);assert(el('coach').innerHTML.includes('Выбери локацию'));
 const lane={dataset:{l:0}},loc={closest:s=>s==='.lane'?lane:null};el('board').handlers.click({target:loc});
 assert(run('G.hand.p.length')===0);assert(run('tutorialStep')===2);assert(run('G.spent.p')===1);
 const mc={dataset:{uid}};el('board').handlers.click({target:{closest:s=>s==='.mc'?mc:s==='.lane'?lane:null}});
 assert(run('G.hand.p.length')===1);assert(run('G.spent.p')===0);assert(run('tutorialStep')===3);
 // Drag and drop uses the same place/unplace rules as tap.
 const source=new Element();source.dataset.uid=uid;const target={closest:()=>source};
 const down=()=>el('app').handlers.pointerdown({isPrimary:true,button:0,pointerId:1,clientX:100,clientY:300,target});
 down();windowHandlers.pointermove({pointerId:1,clientX:150,clientY:301});windowHandlers.pointerup({pointerId:1,clientX:150,clientY:301});assert(run('G.hand.p.length')===1);
 down();windowHandlers.pointermove({pointerId:1,clientX:100,clientY:240});windowHandlers.pointercancel();assert(run('G.hand.p.length')===1);
 hit={closest:()=>null};down();windowHandlers.pointermove({pointerId:1,clientX:100,clientY:240});windowHandlers.pointerup({pointerId:1,clientX:100,clientY:240});assert(run('G.hand.p.length')===1);
 lane.classList={add(){}};hit={closest:s=>s==='.lane'?lane:null};down();windowHandlers.pointermove({pointerId:1,clientX:100,clientY:240});windowHandlers.pointerup({pointerId:1,clientX:100,clientY:240});assert(run('G.hand.p.length')===0);assert(run('G.spent.p')===1);
 hit={closest:s=>s==='#hand'?el('hand'):null};down();windowHandlers.pointermove({pointerId:1,clientX:100,clientY:360});windowHandlers.pointerup({pointerId:1,clientX:100,clientY:360});assert(run('G.hand.p.length')===1);assert(run('G.spent.p')===0);
 run("tutorialEvent('end')");assert(run('tutorialStep')===4);
 await run('(async()=>{aiPlan("p");for(let i=0;i<6;i++){await endTurn();if(G.phase==="plan")aiPlan("p");}})()');
 assert(run('G.phase')==='over');timers.splice(0).forEach(fn=>fn());assert(el('ovbox').innerHTML.includes('Ещё партию'));
 run('finishTutorial()');assert(el('coach').classes.has('hide'));
 run("newGame('ast');G.phase='reveal'");el('hand').handlers.click({target:hc});assert(run('G.sel')===null);
 run("closeOv();newGame('ast');FAST=true;G.turn=3;G.phase='reveal';G.locRev=[true,true,true];G.board=[[],[],[]];G.info=null;G.locs=[LOCS.find(x=>x.id==='forge'),LOCS.find(x=>x.id==='library'),LOCS.find(x=>x.id==='arena')];G.board[0].push(Object.assign(inst(CARDS.find(x=>x.id==='e1'),'p'),{lane:0,revealed:true}));G.board[1].push(Object.assign(inst(CARDS.find(x=>x.id==='a3'),'p'),{lane:1,revealed:true}));");
 const allyUid=run("G.board[0][0].uid"),moving=run("resolveAstroCard(G.board[1][0])");
 assert(el('ov').classes.has('hide'),'Astro card targeting opened a full-screen modal');
 assert(el('info').innerHTML.includes('подсвеченную карту'),'Inline board-card prompt is missing');
 assert(el('board').innerHTML.includes('astro-card-target'),'Selectable board card is not highlighted');
 run('suppressClickUntil=0');
 const allyEl={dataset:{uid:String(allyUid)}},allyLane={dataset:{l:'0'}};
 el('board').handlers.click({target:{closest:s=>s==='.mc'?allyEl:s==='.lane'?allyLane:null}});
 await new Promise(resolve=>setTimeout(resolve,0));
 assert(el('info').innerHTML.includes('новую локацию'),'Second in-context location step did not appear');
 assert(el('board').innerHTML.includes('astro-lane-target'),'Valid destination was not highlighted');
 const destination={dataset:{l:'2'}};
 el('board').handlers.click({target:{closest:s=>s==='.mc'?null:s==='.lane'?destination:null}});
 await moving;
 assert(run("G.board[2].some(c=>c.uid==="+allyUid+")"),'Card did not move after the inline choice');
 assert(el('ov').classes.has('hide'),'Astro effects should keep the full-screen overlay closed');
 const deckUids=run("G.deck.p.slice(0,3).map(c=>c.uid)");
 const deckPick=run("chooseAstroCard('Тест выбора из колоды',G.deck.p.slice(0,3),'p')");
 assert(el('ov').classes.has('hide'),'Deck choice opened a full-screen modal');
 assert(el('info').innerHTML.includes('astro-inline-option'),'Deck choices are not rendered inline');
 assert(el('info').innerHTML.includes('Тест выбора из колоды'),'Inline panel title is missing');
 assert(el('board').innerHTML.includes('class="lane'),'Board disappeared during deck choice');
 assert(el('hand').innerHTML.length>0,'Hand disappeared during deck choice');
 const option={dataset:{i:'1'}};
 el('info').handlers.click({target:{closest:s=>s==='.astro-inline-option'?option:null}});
 const picked=await deckPick;
 assert(picked.uid===deckUids[1],'Inline deck option selected the wrong card');
 console.log('PASS: Astromancer card, lane, and deck choices stay inline; board targets highlight and modal stays closed.');

})().catch(e=>{console.error(e);process.exitCode=1});
