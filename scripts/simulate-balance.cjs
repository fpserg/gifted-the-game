// Usage: node scripts/simulate-balance.cjs game.js 10000 20261118 > results.json
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const [sourcePath='game.js',countArg='10000',seedArg='20261118']=process.argv.slice(2);
const count=Number(countArg),initialSeed=Number(seedArg)>>>0;
assert(Number.isSafeInteger(count)&&count>0&&count%2===0,'Match count must be positive and even');
assert(/^\d+$/.test(seedArg),'Seed must be an unsigned integer');
const original=fs.readFileSync(sourcePath,'utf8');
// Keep the normal newGame(pf,scenario=null) signature and tutorial behavior unchanged.
// Adapt only its opponent choice in this in-memory simulator. Each forced match
// still initializes the real normal mode, cards, locations, turns and AI.
const signature='function newGame(pf,scenario=null){';
const opponentChoice='const ef=scenario?scenario.opponentFaction:rndOf(Object.keys(FACTIONS).filter(f=>f!==pf));';
assert.equal(original.split(signature).length-1,1,'Unexpected newGame signature');
assert.equal(original.split(opponentChoice).length-1,1,'Unexpected opponent selection');
const patchedOpponent='const ef=__balanceOpponent===null?(scenario?scenario.opponentFaction:rndOf(Object.keys(FACTIONS).filter(f=>f!==pf)):__balanceOpponent;';
const source=original.replace(opponentChoice,patchedOpponent);
assert(source.includes(signature)&&source.includes(patchedOpponent),'Simulation patch not applied');
assert.equal(source.length-original.length,patchedOpponent.length-opponentChoice.length,'Unexpected source patch size');
let state=initialSeed;const seededMath=Object.create(Math);
seededMath.random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
const execute=new Function('Math','let __balanceOpponent=null;\n'+source+`
return async function(count){
 FAST=true;
 const rows=[];let completed=0;
 for(const [a,b] of [['eng','ast'],['eng','kee'],['ast','kee']]){
  const row={a,b,games:count,winsA:0,winsB:0,draws:0,sides:[],arena:{present:{games:0,winsA:0,winsB:0,draws:0},absent:{games:0,winsA:0,winsB:0,draws:0}}};
  for(const flipped of [false,true]){
   const side={player:flipped?b:a,opponent:flipped?a:b,games:count/2,winsA:0,winsB:0,draws:0};
   for(let n=0;n<count/2;n++){
    UID=1;logLines=[];
    __balanceOpponent=side.opponent;
    try { newGame(side.player); } finally { __balanceOpponent=null; }
    if(gameMode!=='normal'||G.fac.p!==side.player||G.fac.e!==side.opponent)
      throw Error('Normal-mode opponent pairing failed');
    for(let turn=1;turn<=6;turn++){
     if(G.turn!==turn||G.phase!=='plan')throw Error('Invalid turn transition');
     aiPlan('p');
     for(const o of ['p','e'])if(G.spent[o]>turn||G.spent[o]<0||G.hand[o].length>7)throw Error('Invalid energy or hand');
     await endTurn();
    }
    if(G.phase!=='over'||G.turn!==6||G.board.flat().some(c=>c.pending||!c.revealed||!Number.isFinite(power(c))))throw Error('Invalid final state');
    const winner=G.result?G.fac[G.result]:null,key=winner===a?'winsA':winner===b?'winsB':'draws';
    row[key]++;side[key]++;
    const arena=row.arena[G.locs.some(l=>l.id==='arena')?'present':'absent'];arena.games++;arena[key]++;
    completed++;
   }
   if(side.winsA+side.winsB+side.draws!==side.games)throw Error('Side totals inconsistent');
   row.sides.push(side);
  }
  const totals=row.winsA+row.winsB+row.draws;
  const arenas=row.arena.present,rowNo=row.arena.absent;
  if(totals!==count||row.sides.length!==2||row.sides.some(s=>s.games!==count/2)||
     arenas.games+rowNo.games!==count||
     arenas.winsA+arenas.winsB+arenas.draws!==arenas.games||
     rowNo.winsA+rowNo.winsB+rowNo.draws!==rowNo.games)
    throw Error('Pair / side / arena totals inconsistent');
  rows.push(row);console.error(a+' vs '+b+': '+row.winsA+'/'+row.winsB+'/'+row.draws);
 }
 if(completed!==count*3)throw Error('Completed match count inconsistent');
 return {completed,rows};
};`)(seededMath);
(async()=>{
 const start=Date.now(),result=await execute(count);
 console.log(JSON.stringify({sourcePath,sourceSha256:crypto.createHash('sha256').update(original).digest('hex'),seed:initialSeed,rng:'LCG32: 1664525*x+1013904223',gamesPerPair:count,elapsedSeconds:(Date.now()-start)/1000,...result},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
