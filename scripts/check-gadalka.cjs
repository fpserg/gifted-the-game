// Run: node scripts/check-gadalka.cjs (no browser/dependencies).
// GIFTED-002 (#36): Gadalka's +1 applies only to the first card the opponent plays on the turn
// right after the reveal and expires at the end of that turn. Black Cat's discount is unchanged:
// it persists until used, including skipped turns. Uses the real game.js reveal/turn flow;
// only the opponent AI planner is disabled so each scenario controls every play.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function boot(){
 let n=12345;const math=Object.create(Math);math.random=()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296);
 const ctx=vm.createContext({Math:math,console,performance,setTimeout});
 vm.runInContext(fs.readFileSync('tutorial.js','utf8')+'\n'+fs.readFileSync('game.js','utf8'),ctx);
 const run=s=>vm.runInContext(s,ctx);
 run("FAST=true;aiPlan=function(){};newGame('ast');G.board=[[],[],[]];G.hand={p:[],e:[]};G.deck={p:[],e:[]};");
 return run;
}
const card=(run,id,o)=>run(`(()=>{const c=inst(CARDS.find(x=>x.id==='${id}'),'${o}');G.hand.${o}.push(c);return c.uid;})()`);
const byUid=uid=>`[...G.hand.p,...G.hand.e,...G.board.flat()].find(c=>c.uid===${uid})`;
const play=(run,o,uid,lane=0)=>{assert.equal(run(`place('${o}',${byUid(uid)},${lane})`),true,'place failed');return run(`${byUid(uid)}.paid`);};
const cost=(run,o,uid)=>run(`effCost('${o}',${byUid(uid)})`);
const endTurn=async run=>{await run('endTurn()');};
const advanceTo=async(run,turn)=>{while(run('G.turn')<turn)await endTurn(run);assert.equal(run('G.turn'),turn);assert.equal(run('G.phase'),'plan');};
const other=o=>o==='p'?'e':'p';

(async()=>{
 for(const owner of ['p','e']){
  const foe=other(owner);
  // 1. Reveal on N does not affect N; first card on N+1 costs +1, the second does not; nothing on N+2.
  {const run=boot();await advanceTo(run,2);
   const g=card(run,'a3',owner),x=card(run,'e1',foe);
   assert.equal(play(run,owner,g),2);
   assert.equal(play(run,foe,x),1,'turn N: Gadalka placed this turn must not tax');
   await endTurn(run);assert.equal(run('G.turn'),3);
   assert.equal(run(`surchargeOf('${foe}')`),1,'Gadalka did not tax the opponent on N+1');
   assert.equal(run(`surchargeOf('${owner}')`),0,'Gadalka must not tax its owner');
   const a=card(run,'a6',foe),b=card(run,'e1',foe),own=card(run,'e1',owner);
   assert.equal(cost(run,foe,a),4);assert.equal(cost(run,foe,b),2);
   assert.equal(play(run,foe,a),4,'first card on N+1 must cost +1 (3+1)');
   assert.equal(run(`G.spent.${foe}`),4);
   assert.equal(cost(run,foe,b),1,'only the first card is taxed');assert.equal(play(run,foe,b,1),1);
   assert.equal(play(run,owner,own),1,'owner cards are never taxed');
   await endTurn(run);assert.equal(run('G.turn'),4);
   const c=card(run,'e1',foe);assert.equal(cost(run,foe,c),1,'no surcharge on N+2');assert.equal(play(run,foe,c),1);}
  // 2. Opponent skips N+1: the surcharge expires and is gone on N+2.
  {const run=boot();await advanceTo(run,2);
   play(run,owner,card(run,'a3',owner));await endTurn(run);
   assert.equal(run(`surchargeOf('${foe}')`),1);
   await endTurn(run);assert.equal(run('G.turn'),4);
   assert.equal(run(`G.surcharge.${foe}`),0,'surcharge must be cleared after the skipped turn');
   const c=card(run,'e1',foe);assert.equal(cost(run,foe,c),1);assert.equal(play(run,foe,c),1);}
  // 3. Undo within N+1 restores energy and the surcharge; replaying never doubles it.
  {const run=boot();await advanceTo(run,3);
   play(run,owner,card(run,'a3',owner));await endTurn(run);assert.equal(run('G.turn'),4);
   const a=card(run,'e1',foe),b=card(run,'a6',foe);
   assert.equal(play(run,foe,a),2);assert.equal(run(`G.spent.${foe}`),2);
   run(`unplace(${byUid(a)})`);
   assert.equal(run(`G.spent.${foe}`),0,'undo must refund the taxed energy');
   assert.equal(run(`surchargeOf('${foe}')`),1,'undo must restore the surcharge on N+1');
   assert.equal(play(run,foe,b),4,'replayed first card is taxed once (3+1)');
   assert.equal(cost(run,foe,a),1);assert.equal(play(run,foe,a,1),1,'second card not taxed after replay');
   assert.equal(run(`G.spent.${foe}`),5);
   run(`unplace(${byUid(a)});unplace(${byUid(b)})`);assert.equal(run(`G.spent.${foe}`),0);
   await endTurn(run);assert.equal(run('G.turn'),5);
   const c=card(run,'e1',foe);assert.equal(cost(run,foe,c),1,'undone surcharge must not carry past N+1');}
  // 4. Reveal on the final turn does not carry into a new match.
  {const run=boot();await advanceTo(run,6);
   play(run,owner,card(run,'a3',owner));await endTurn(run);
   assert.equal(run('G.phase'),'over');
   run("newGame('eng');G.board=[[],[],[]];");
   assert.deepEqual(JSON.parse(run('JSON.stringify([G.surcharge,G.surchargeTurn])')),[{p:0,e:0},{p:0,e:0}]);
   for(const o of ['p','e']){const c=card(run,'e1',o);assert.equal(cost(run,o,c),1,'final-turn Gadalka leaked into a new match');}}
  // 5. Black Cat: discount survives a skipped turn and is spent by the next card only.
  {const run=boot();await advanceTo(run,2);
   play(run,owner,card(run,'a2',owner));await endTurn(run);
   assert.equal(run(`G.discount.${owner}`),1);
   await endTurn(run);assert.equal(run('G.turn'),4);
   assert.equal(run(`G.discount.${owner}`),1,'Black Cat discount must persist through a skipped turn');
   const a=card(run,'a6',owner),b=card(run,'a6',owner);
   assert.equal(play(run,owner,a),2,'discounted first card (3-1)');assert.equal(run(`G.discount.${owner}`),0);
   assert.equal(play(run,owner,b,1),3,'discount used only once');
   run(`unplace(${byUid(a)})`);assert.equal(run(`G.discount.${owner}`),1,'undo restores the discount');}
  // 6. Cat discount and Gadalka surcharge on the same first card cancel out, as before; both are consumed.
  {const run=boot();await advanceTo(run,2);
   play(run,foe,card(run,'a2',foe));play(run,owner,card(run,'a3',owner),1);await endTurn(run);
   const a=card(run,'a6',foe),b=card(run,'a6',foe);
   assert.equal(play(run,foe,a),3,'discount -1 and surcharge +1 on the same card');
   assert.equal(run(`G.discount.${foe}`),0);assert.equal(run(`surchargeOf('${foe}')`),0);
   assert.equal(play(run,foe,b,1),3);}
 }
 // Card text shown in game and in the card list.
 const text=vm.runInNewContext("CARDS.find(c=>c.id==='a3').text",(()=>{const c=vm.createContext({Math,console,performance,setTimeout});vm.runInContext(fs.readFileSync('tutorial.js','utf8')+'\n'+fs.readFileSync('game.js','utf8'),c);return c;})());
 assert.equal(text,'Классовая карта. При раскрытии: первая карта, сыгранная соперником на следующем ходу, стоит на 1 энергию больше.');
 assert(fs.readFileSync('docs/gifted-cards.md','utf8').includes('первая карта, сыгранная соперником на следующем ходу, стоит на 1 энергию больше'));
 console.log('PASS: Gadalka next-turn surcharge for both sides (N/N+1/N+2, skip, undo/replay, final turn), Black Cat persistence, discount+surcharge interaction');
})().catch(e=>{console.error(e);process.exitCode=1});
