#!/usr/bin/env node
// GIFTED-004D (#56): compare two attestation summaries (e.g. a future AI or balance version against this one).
// Usage: node scripts/attest-compare.cjs <old attestation-summary.json> <new attestation-summary.json> [--z=3]
// Prints, per pair and mode, the decisive win rate of A in both and the difference with its z-score, then the
// cards whose play rate or "won when played" share moved by more than --z standard errors, and p95 decision
// times. Exit code 0; it reports, it does not judge.
'use strict';
const fs=require('fs');
const [a,b]=process.argv.slice(2).filter(x=>!x.startsWith('--')).map(f=>JSON.parse(fs.readFileSync(f,'utf8')));
const Z=+((process.argv.find(x=>x.startsWith('--z='))||'--z=3').slice(4));
if(!a||!b){console.error('usage: attest-compare.cjs <old summary> <new summary> [--z=3]');process.exit(2);}
const pct=x=>x==null?'—':(x*100).toFixed(2)+'%';
const zp=(p1,n1,p2,n2)=>{const se=Math.sqrt(p1*(1-p1)/n1+p2*(1-p2)/n2);return se?(p2-p1)/se:0;};
console.log(`old: game.js ${a.runs[0].gameSha256.slice(0,12)}  new: game.js ${b.runs[0].gameSha256.slice(0,12)}\n`);
console.log('pair/mode'.padEnd(34)+'old'.padStart(9)+'new'.padStart(9)+'  delta     z');
for(const r of b.runs){const o=a.runs.find(x=>x.pair.join()===r.pair.join()&&x.mode===r.mode);if(!o)continue;
 const z=zp(o.overall.winRateDecisive,o.overall.decisive,r.overall.winRateDecisive,r.overall.decisive);
 console.log(`${(r.pair.join(':')+'/'+r.mode).padEnd(34)}${pct(o.overall.winRateDecisive).padStart(9)}${pct(r.overall.winRateDecisive).padStart(9)}  ${((r.overall.winRateDecisive-o.overall.winRateDecisive)*100).toFixed(2).padStart(6)}  ${z.toFixed(2).padStart(6)}${Math.abs(z)>=Z?'  *':''}`);}
console.log(`\ncards with |z| ≥ ${Z}:`);
for(const [k,cards] of Object.entries(b.cards)){if(!Array.isArray(cards)||!Array.isArray(a.cards[k]))continue;
 for(const c of cards){const o=a.cards[k].find(x=>x.faction===c.faction&&x.id===c.id);if(!o)continue;
  const z1=o.inHand&&c.inHand?zp(o.playRateInHand,o.inHand,c.playRateInHand,c.inHand):0;
  const n1=o.gamesPlayed,n2=c.gamesPlayed,z2=o.winRatePlayed!=null&&c.winRatePlayed!=null&&n1&&n2?zp(o.winRatePlayed,n1,c.winRatePlayed,n2):0;
  if(Math.abs(z1)>=Z||Math.abs(z2)>=Z)console.log(`  ${k} ${c.faction} ${c.id}: play rate ${pct(o.playRateInHand)} → ${pct(c.playRateInHand)} (z ${z1.toFixed(1)}), won when played ${pct(o.winRatePlayed)} → ${pct(c.winRatePlayed)} (z ${z2.toFixed(1)})`);}}
console.log('\np95 decision time (ms), strategy/mode:');
for(const [k,q] of Object.entries(b.performanceBySideTurn||{}))if(k.endsWith('|all|all')){const o=(a.performanceBySideTurn||{})[k];console.log(`  ${k.split('|').slice(0,2).join('/')}: ${o?o.p95:'—'} → ${q.p95}  (max ${o?o.maxMs:'—'} → ${q.maxMs})`);}
