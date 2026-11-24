const fs=require('fs'),vm=require('vm'),assert=require('assert');
// GIFTED-003 (#38): initiative by total revealed power. The empty board on turn 1 is an exact tie,
// so the tutorial draws exactly one 50/50 lot per run; both branches must give the same lesson.
// Every other random call is still forbidden, and turns 2-6 have a fixed, power-based order.
const expectedFirst=[null,'p','e','e','p','p'];
const expected=[[[4,2],[0,0],[0,0]],[[2,5],[2,0],[0,0]],[[2,5],[5,3],[0,0]],[[9,9],[6,3],[0,0]],[[11,9],[11,8],[0,0]],[[11,9],[12,8],[0,5]]];
(async()=>{
for(let iteration=0;iteration<100;iteration++){
 const storage={};const math=Object.create(Math),lot=iteration%2?.9:.1;let lots=0;
 math.random=()=>{if(lots++)throw Error('Tutorial used random beyond the turn-1 initiative tie');return lot;};
 const ctx=vm.createContext({console,Math:math,performance,localStorage:{getItem:k=>storage[k],setItem:(k,v)=>storage[k]=v},setTimeout});
 vm.runInContext(fs.readFileSync('tutorial.js','utf8')+'\n'+fs.readFileSync('game.js','utf8'),ctx);const run=s=>vm.runInContext(s,ctx);
 run("var __first=[];const __say=say;say=function(t){if(/раскрываются первыми/.test(t))__first.push(t.startsWith('Твои')?'p':'e');return __say(t);}");
 run('FAST=true;Tutorial.start()');assert.equal(run('G.fac.p'),'eng');assert.equal(run('G.fac.e'),'kee');
 for(let turn=1;turn<=6;turn++){
  assert.equal(run('G.turn'),turn);assert.deepEqual(Array.from(run('G.locRev')), [true,turn>=2,turn>=3]);
  assert.equal(run("G.board.flat().find(c=>c.owner==='e'&&c.pending).def.id"),['k2','k4','k5','k7','k9','k11'][turn-1]);
  assert.equal(run("G.board.flat().find(c=>c.owner==='e'&&c.pending).lane"),[0,0,1,0,1,2][turn-1]);
  await run('endTurn()');assert.equal(run('G.phase'),'plan');assert.equal(run('G.spent.p'),0);
  const before=run('JSON.stringify(G)');run("place('p',G.hand.p.find(c=>c.def.id!==Tutorial.round()[0]),Tutorial.round()[1])");assert.equal(run('JSON.stringify(G)'),before);
  run('globalThis.target=G.hand.p.find(c=>c.def.id===Tutorial.round()[0])');assert(run('target'));
  run("place('p',target,(Tutorial.round()[1]+1)%3)");assert.equal(run('JSON.stringify(G)'),before);
  run('G.spent.p=G.turn');const costly=run('JSON.stringify(G)');run("place('p',target,Tutorial.round()[1])");assert.equal(run('JSON.stringify(G)'),costly);run('G.spent.p=0');
  if(turn===6){run("G.board[2].push(inst(CARDS[0],'p'),inst(CARDS[0],'p'))");assert.equal(run("canPlay('p',2)"),false);run('G.board[2].splice(-2)');}
  run("place('p',target,Tutorial.round()[1])");assert.equal(run('G.spent.p'),turn);
  if(turn===1){await run('endTurn()');assert.equal(run('G.phase'),'plan');}
  run('unplace(target)');assert.equal(run('G.spent.p'),0);assert(run('G.hand.p.includes(target)'));
  run("place('p',target,Tutorial.round()[1])");await run('endTurn()');assert.equal(run('G.phase'),'lesson');
  const totals=JSON.parse(run("JSON.stringify([0,1,2].map(l=>[laneTotal(l,'p'),laneTotal(l,'e')]))"));assert.deepEqual(totals,expected[turn-1]);
  if(turn===4){assert(!run("G.board.flat().some(c=>c.def.id==='e1')"));assert(run("G.board[0].some(c=>c.def.id==='e8')"));assert.equal(run('laneWinner(0)'),null);}
  if(turn===5){assert.equal(run("G.board[1].find(c=>c.def.id==='e3').buff"),1);assert.equal(run("power(G.board[0].find(c=>c.def.id==='e8'))"),11);}
  if(turn===6)assert(!run("G.board.flat().some(c=>c.def.id==='e11')"));
  assert.equal(run('__first[__first.length-1]'),expectedFirst[turn-1]||(lot<.5?'p':'e'),`turn ${turn}: wrong initiative`);
  assert.equal(lots,1,'turn-1 tie must draw exactly one lot');
  run('Tutorial.next()');
 }
 assert.equal(run('G.result'),'p');assert.equal(lots,1);assert.deepEqual(Array.from(run('[0,1,2].map(laneWinner)')),['p','p','e']);assert.equal(storage.tutorialCompleted,'true');
 run('Tutorial.start()');assert.equal(run('G.turn'),1);
 run('Tutorial.menu()');assert.equal(run('gameMode'),'normal');
 math.random=()=>.42;run("newGame('ast')");assert.equal(run('gameMode'),'normal');assert.equal(run('G.fac.p'),'ast');
}
console.log('PASS: 100 six-turn runs (both turn-1 initiative lots), fixed initiative on turns 2-6, actions/refunds, effects, computed 2:1, restart and normal-mode exit.');console.log(JSON.stringify(expected));
})().catch(e=>{console.error(e);process.exitCode=1});
