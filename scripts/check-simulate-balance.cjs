// Run: node scripts/check-simulate-balance.cjs
// Verifies the balance simulator against the real game.js: at least 3000 normal matches per run
// across all three faction pairs (both seats), consistent counters, identical output for the
// same seed and different output for another seed. It does not judge or change balance.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const {simulate}=require('./simulate-balance.cjs');
const strip=({elapsedSeconds,...rest})=>JSON.stringify(rest);
(async()=>{
 const perPair=1000,seed=20261118;
 const a=await simulate('game.js',perPair,seed),b=await simulate('game.js',perPair,seed),c=await simulate('game.js',perPair,seed+1);
 assert.equal(a.totalGames,3*perPair);assert(a.totalGames>=3000);assert.equal(a.completed,a.totalGames);
 assert.equal(a.seed,seed);assert.equal(a.gamesPerPair,perPair);
 assert.equal(a.sourceSha256,crypto.createHash('sha256').update(fs.readFileSync('game.js')).digest('hex'),'SHA must describe the unmodified game.js');
 assert.deepEqual(a.rows.map(r=>r.a+'-'+r.b),['eng-ast','eng-kee','ast-kee']);
 assert.deepEqual(Object.keys(a.factions).sort(),['ast','eng','kee']);
 for(const r of a.rows){
  assert.equal(r.winsA+r.winsB+r.draws,perPair);
  assert.deepEqual(r.sides.map(s=>[s.player,s.opponent,s.games]),[[r.a,r.b,perPair/2],[r.b,r.a,perPair/2]]);
  assert.equal(r.arena.present.games+r.arena.absent.games,perPair);
  assert(Math.abs(r.rates.winsA+r.rates.winsB+r.rates.draws-100)<0.02);
 }
 for(const t of Object.values(a.factions))assert.equal(t.wins+t.losses+t.draws,t.games);
 const f=a.factions;assert.equal(f.eng.wins+f.ast.wins+f.kee.wins+a.rows.reduce((n,r)=>n+r.draws,0),a.totalGames);
 assert.equal(strip(a),strip(b),'same seed must reproduce identical results');
 assert.notEqual(JSON.stringify(c.rows),JSON.stringify(a.rows),'a different seed must change the sample');
 console.log(`PASS: simulator ${a.totalGames} games/run (seed ${seed}), 3 pairs x 2 seats, counters consistent, same seed identical, seed ${seed+1} differs`);
})().catch(e=>{console.error(e);process.exitCode=1});
