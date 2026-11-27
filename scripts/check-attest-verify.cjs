#!/usr/bin/env node
// GIFTED-004D (#56): negative and positive tests of result validation (attest-verify.cjs, attest-all.cjs, attest-report.cjs).
// Builds a small complete fixture once (12 runs x 18 configurations x 1 game, real engine and runner), then checks
// that every forged, stale or inconsistent variant is rejected with its reason, that a valid set passes, that a
// consistent forgery of result and checkpoint is caught by replay and by the manifest, and that inputs stay unchanged.
// Usage: node scripts/check-attest-verify.cjs [--keep]
'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),zlib=require('zlib'),{spawnSync}=require('child_process');
const V=require('./attest-verify.cjs'),L=require('./attest-lib.cjs');
const S=__dirname,node=process.execPath;
let pass=0,failed=0;
const ok=(c,m)=>{if(c){pass++;console.log('  PASS '+m);}else{failed++;console.log('  FAIL '+m);}};
const run=(script,args)=>spawnSync(node,[path.join(S,script),...args],{encoding:'utf8',maxBuffer:1<<30});
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'check-attest-verify-')),FIX=path.join(tmp,'fixture');
const copy=n=>{const d=path.join(tmp,n);fs.cpSync(FIX,d,{recursive:true});return d;};
const files=d=>V.SCHEDULE.map(s=>path.join(d,s.name+'.json'));
const readJ=f=>JSON.parse(fs.readFileSync(f,'utf8')),writeJ=(f,x)=>fs.writeFileSync(f,JSON.stringify(x)+'\n');
const ckLines=f=>fs.readFileSync(f,'utf8').split('\n').filter(Boolean),writeLines=(f,l)=>fs.writeFileSync(f,l.join('\n')+'\n');
const hashDir=d=>fs.readdirSync(d).sort().map(f=>f+':'+L.sha256(fs.readFileSync(path.join(d,f)))).join('|');
// Expect verifySet on dir d to fail with a message containing want.
function rejects(name,d,want,opts){const before=hashDir(d);let msg=null;try{V.verifySet(opts&&opts.files||files(d),opts);}catch(e){msg=e.message;}
 ok(msg!==null&&msg.includes(want)&&hashDir(d)===before,`${name} → rejected: ${msg===null?'ACCEPTED':msg.slice(0,140)}`);}
// Change the identity consistently in the result and the checkpoint line 1.
function setIdentity(d,name,f){const j=path.join(d,name+'.json'),c=path.join(d,name+'.ckpt');const r=readJ(j);f(r.identity,r);writeJ(j,r);
 const l=ckLines(c);const id=JSON.parse(l[0]);f(id,{});l[0]=JSON.stringify(id);writeLines(c,l);}
const N='strategist-tactician-symmetric',NP='strategist-tactician-pve';

console.log('fixture: attest-all.cjs --games=1 (12 runs x 18 games)');
let p=run('attest-all.cjs',[`--out=${FIX}`,'--games=1','--workers=2']);
ok(p.status===0&&fs.existsSync(path.join(FIX,'attestation-summary.json')),'complete fixture built and reported (exit '+p.status+')');
if(p.status!==0){console.log(p.stderr);process.exit(1);}
for(const f of ['attestation-summary.json','attestation-report.md'])fs.renameSync(path.join(FIX,f),path.join(tmp,f));

console.log('valid set');
const before=hashDir(FIX);
let res;try{res=V.verifySet(files(FIX));}catch(e){res=e;}
ok(Array.isArray(res)&&res.length===12&&res.every(r=>r.games===18),'verifySet accepts the 12 runs');
p=run('attest-all.cjs',[`--out=${copy('rerun')}`,'--games=1','--workers=2']);
ok(p.status===0&&(p.stderr.match(/done earlier, verified/g)||[]).length===12,'attest-all rerun: all 12 verified and kept, nothing recomputed');
p=run('attest-verify.cjs',[`--dir=${FIX}`,`--summary=${path.join(tmp,'attestation-summary.json')}`,'--replay=1']);
ok(p.status===0&&/summary: .* equals/.test(p.stdout)&&(p.stdout.match(/^replay .* identical/gm)||[]).length===12,'CLI: summary regenerated equal, one replayed unit per run identical');
const D2=copy('manifest');p=run('attest-verify.cjs',[`--dir=${D2}`,`--write-manifest=${path.join(D2,'MANIFEST.json')}`]);
p=run('attest-verify.cjs',[`--dir=${D2}`,`--manifest=${path.join(D2,'MANIFEST.json')}`]);
ok(p.status===0&&/checksums OK/.test(p.stdout),'manifest written and verified');
// gzip variant (as stored in docs/attestation/data)
const DZ=copy('gz');for(const f of fs.readdirSync(DZ)){const x=path.join(DZ,f);fs.writeFileSync(x+'.gz',zlib.gzipSync(fs.readFileSync(x)));fs.rmSync(x);}
try{V.verifySet(V.SCHEDULE.map(s=>path.join(DZ,s.name+'.json.gz')));ok(true,'gzip result and checkpoint accepted');}catch(e){ok(false,'gzip: '+e.message);}
// whole-configuration units (chunk 0, the format of the first runs)
const D0=path.join(tmp,'chunk0');fs.mkdirSync(D0);
p=spawnSync(node,[path.join(S,'attest-ai.cjs'),'--pair=novice:novice','--mode=pve','--games=2','--seed=2026112700','--workers=2',`--checkpoint=${path.join(D0,'novice-novice-pve.ckpt')}`],{encoding:'utf8',cwd:path.join(S,'..')});
fs.writeFileSync(path.join(D0,'novice-novice-pve.json'),p.stdout);
try{V.verifySet([path.join(D0,'novice-novice-pve.json')],{partial:true});ok(true,'whole-configuration checkpoint (chunk 0) accepted');}catch(e){ok(false,'chunk 0: '+e.message);}

console.log('Inspector reproduction and missing files');
let d=copy('forged');writeJ(path.join(d,'novice-novice-pve.json'),{forged:true});
rejects('forged result {"forged":true}',d,'no attestation structure');
p=run('attest-all.cjs',[`--out=${d}`,'--games=1','--workers=1','--only=novice:novice/pve']);
ok(p.status===1&&/existing result rejected/.test(p.stderr),'attest-all with the forged result: exit 1, rejected (Inspector case)');
d=path.join(tmp,'forged-alone');fs.mkdirSync(d);writeJ(path.join(d,'novice-novice-pve.json'),{forged:true});
p=run('attest-all.cjs',[`--out=${d}`,'--games=2','--workers=1','--only=novice:novice/pve']);
ok(p.status===1&&/checkpoint is missing/.test(p.stderr),'attest-all, forged result without checkpoint (exact Inspector command): exit 1');
d=copy('no-ckpt');fs.rmSync(path.join(d,N+'.ckpt'));rejects('checkpoint deleted',d,'checkpoint is missing');
d=copy('bad-json');fs.writeFileSync(path.join(d,N+'.json'),'{"kind":');rejects('result not JSON',d,'not valid JSON');
p=run('attest-report.cjs',[`--out=${path.join(tmp,'rep-forged')}`,...files(copy('forged2')).map((f,i)=>i?f:(writeJ(f,{forged:true}),f))]);
ok(p.status===1&&/refusing to aggregate/.test(p.stderr),'attest-report refuses a set with a forged result');

console.log('stale code and parameters');
d=copy('old-game');setIdentity(d,N,id=>{id.gameSha256='0'.repeat(64);});rejects('old game.js SHA',d,'game.js SHA-256');
d=copy('old-tut');setIdentity(d,N,id=>{id.tutorialSha256='1'.repeat(64);});rejects('old tutorial.js SHA',d,'tutorial.js SHA-256');
d=copy('old-lib');setIdentity(d,N,id=>{id.libSha256='2'.repeat(64);});rejects('old attest-lib SHA',d,'attest-lib.cjs SHA-256');
d=copy('old-runner');setIdentity(d,N,id=>{id.scriptSha256='3'.repeat(64);});rejects('unknown runner SHA',d,'runner SHA-256');
d=copy('patches');setIdentity(d,N,id=>{id.patches=id.patches.slice(1);});rejects('other in-memory patches',d,'patches differ');
d=copy('configs');setIdentity(d,N,id=>{id.configs=id.configs.slice().reverse();});rejects('other configurations',d,'configurations differ');
d=copy('seed');setIdentity(d,N,(id,r)=>{id.seed=1;if(r.identity)r.seed=1;});rejects('other seed (result and checkpoint consistent)',d,'seed');
d=copy('seed-res');{const j=path.join(d,N+'.json'),r=readJ(j);r.seed=2026112741;writeJ(j,r);}rejects('result seed differs from identity',d,'seed');
d=copy('games');setIdentity(d,N,(id,r)=>{id.gamesPerConfig=2;if(r.identity)r.gamesPerConfig=2;});rejects('other games per configuration',d,'games');
d=copy('mode');{for(const e of ['json','ckpt'])fs.copyFileSync(path.join(d,NP+'.'+e),path.join(d,N+'.'+e));}rejects('pve run stored as symmetric',d,'mode');
d=copy('mode-ckpt');fs.copyFileSync(path.join(d,NP+'.ckpt'),path.join(d,N+'.ckpt'));rejects('symmetric result with pve checkpoint',d,'checkpoint identity differs');
d=copy('pair');{for(const e of ['json','ckpt'])fs.copyFileSync(path.join(d,'tactician-tactician-symmetric.'+e),path.join(d,N+'.'+e));}rejects('other pair under this name',d,'pair');

console.log('distorted results');
const tweak=(n,f)=>{const d=copy(n),j=path.join(d,N+'.json'),r=readJ(j);f(r);writeJ(j,r);return d;};
rejects('overall wins +1',tweak('w',r=>{r.overall.wins++;r.overall.losses--;}),'result differs from its checkpoint');
rejects('one combination changed',tweak('c',r=>{r.byCombination[3].aWins++;r.byCombination[3].draws--;}),'result differs from its checkpoint');
rejects('card statistics changed',tweak('a',r=>{const c=r.aggregate.cards;const lv=Object.keys(c)[0],f=Object.keys(c[lv])[0],k=Object.keys(c[lv][f])[0];c[lv][f][k].plays++;}),'result differs from its checkpoint');
rejects('fallback count changed',tweak('fb',r=>{r.strategistCounters.fallbacks++;}),'result differs from its checkpoint');
rejects('timings changed',tweak('perf',r=>{const s=Object.values(r.aggregate.perf)[0],x=Object.values(Object.values(Object.values(s)[0])[0])[0];x.maxMs+=1000;}),'result differs from its checkpoint');
const ck=(n,f)=>{const d=copy(n),c=path.join(d,N+'.ckpt'),l=ckLines(c);f(l);writeLines(c,l);return d;};
const unit=(l,i,f)=>{const x=JSON.parse(l[i]);f(x);l[i]=JSON.stringify(x);};
rejects('checkpoint unit counts inconsistent',ck('u1',l=>unit(l,5,x=>{x.result.aWins+=1;})),'inconsistent counts');
rejects('checkpoint unit shifted consistently',ck('u2',l=>unit(l,5,x=>{const r=x.result;if(r.aWins){r.aWins--;r.aLosses++;}else if(r.aLosses){r.aLosses--;r.aWins++;}else{r.draws--;r.aWins++;}})),'result differs from its checkpoint');
rejects('checkpoint unit of another configuration',ck('u3',l=>unit(l,5,x=>{x.result.fa=x.result.fa==='eng'?'ast':'eng';})),'another configuration');
rejects('duplicate unit',ck('dup',l=>l.push(l[3])),'duplicates');
rejects('missing unit',ck('miss',l=>l.splice(4,1)),'units');
rejects('extra unit (out of range)',ck('extra',l=>{const x=JSON.parse(l[2]);x.from=1;x.to=2;l.push(JSON.stringify(x));}),'unexpected unit');
rejects('unit with a wrong range',ck('range',l=>unit(l,2,x=>{x.to=7;})),'unexpected unit');
rejects('corrupt middle line',ck('corrupt',l=>{l[6]=l[6].slice(0,40);}),'not valid JSON');
d=copy('partial');{const c=path.join(d,N+'.ckpt');fs.writeFileSync(c,fs.readFileSync(c,'utf8').slice(0,-30));}rejects('partial last line',d,'complete line');
d=copy('noid');{const c=path.join(d,N+'.ckpt'),l=ckLines(c);writeLines(c,l.slice(1));}rejects('checkpoint without identity line',d,'checkpoint identity differs');

console.log('set composition');
rejects('same file given twice',FIX,'more than once',{files:[...files(FIX),files(FIX)[0]]});
d=copy('dup-dir');rejects('same run from two directories',FIX,'more than once',{files:[...files(FIX),path.join(d,'novice-novice-pve.json')]});
rejects('run missing from the set',FIX,'incomplete set',{files:files(FIX).slice(1)});
d=copy('extra-name');fs.copyFileSync(path.join(d,N+'.json'),path.join(d,'strategist-strategist-blitz.json'));
rejects('unscheduled run name',d,'not one of the scheduled',{files:[...files(d),path.join(d,'strategist-strategist-blitz.json')]});
d=copy('mixed-games');{const sd=path.join(tmp,'g2');p=spawnSync(node,[path.join(S,'attest-all.cjs'),`--out=${sd}`,'--games=2','--workers=2','--only=novice:novice/pve'],{encoding:'utf8'});
 for(const e of ['json','ckpt'])fs.copyFileSync(path.join(sd,'novice-novice-pve.'+e),path.join(d,'novice-novice-pve.'+e));}
rejects('runs with different games per configuration',d,'games per configuration');
p=run('attest-all.cjs',[`--out=${d}`,'--games=1','--workers=1']);
ok(p.status===1&&/existing result rejected/.test(p.stderr),'attest-all rejects an existing run made with other --games');

console.log('consistent forgery of result and checkpoint');
d=copy('consistent');{const c=path.join(d,N+'.ckpt'),l=ckLines(c);let k=0;
 for(let i=1;i<l.length&&!k;i++){const x=JSON.parse(l[i]),r=x.result;if(r.aWins===1){r.aWins=0;r.aLosses=1;l[i]=JSON.stringify(x);k=i;}else if(r.aLosses===1){r.aLosses=0;r.aWins=1;l[i]=JSON.stringify(x);k=i;}}
 writeLines(c,l);const t=path.join(tmp,'recombine.ckpt');fs.copyFileSync(c,t);
 const q=spawnSync(node,[path.join(S,'attest-ai.cjs'),'--pair=strategist:tactician','--mode=symmetric','--games=1','--seed=2026112740','--workers=1','--chunk=50','--deadline=0',`--checkpoint=${t}`],{encoding:'utf8',cwd:path.join(S,'..')});
 fs.writeFileSync(path.join(d,N+'.json'),q.stdout);
 let run1;try{run1=V.verifySet([path.join(d,N+'.json')],{partial:true})[0];ok(true,'consistent forgery passes the structural checks (expected: only replay and manifest can see it)');}catch(e){ok(false,'consistent forgery setup: '+e.message);}
 (async()=>{
  if(run1){let msg=null;try{await V.replayUnits(run1,[run1.parsed[k]]);}catch(e){msg=e.message;}ok(msg&&msg.includes('replay'),'replay of the forged unit → rejected: '+(msg||'ACCEPTED').slice(0,120));}
  const M=path.join(tmp,'manifest','MANIFEST.json');fs.copyFileSync(M,path.join(d,'MANIFEST.json'));
  let q2=run('attest-verify.cjs',[`--dir=${d}`,`--manifest=${path.join(d,'MANIFEST.json')}`]);
  ok(q2.status===1&&/checksum or size differs/.test(q2.stderr),'manifest of the original data → rejected: '+q2.stderr.trim().slice(0,100));
  const d3=copy('manifest-extra');fs.copyFileSync(M,path.join(d3,'MANIFEST.json'));fs.writeFileSync(path.join(d3,'note.txt'),'x');
  q2=run('attest-verify.cjs',[`--dir=${d3}`,`--manifest=${path.join(d3,'MANIFEST.json')}`]);ok(q2.status===1&&/not listed/.test(q2.stderr),'unlisted file in the data directory → rejected');
  const sm=path.join(tmp,'summary-tampered.json'),S0=readJ(path.join(tmp,'attestation-summary.json'));S0.runs[4].overall.wins++;writeJ(sm,S0);
  q2=run('attest-verify.cjs',[`--dir=${FIX}`,`--summary=${sm}`]);ok(q2.status===1&&/is not the report/.test(q2.stderr),'tampered summary → rejected');
  ok(hashDir(FIX)===before,'fixture unchanged by all checks');
  console.log(`\n${pass} PASS, ${failed} FAIL`);
  if(!process.argv.includes('--keep'))fs.rmSync(tmp,{recursive:true,force:true});else console.log('kept '+tmp);
  process.exit(failed?1:0);
 })().catch(e=>{console.error(e);process.exit(1);});
}
