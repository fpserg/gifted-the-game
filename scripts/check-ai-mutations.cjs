// Run: node scripts/check-ai-mutations.cjs
// GIFTED-004A (#40). Reproducible mutation run for check-ai-architecture.cjs: each known defect is
// applied to a temporary copy of game.js and the check must FAIL with the expected message.
// The unmodified copy must PASS first (control). The working tree is never modified.
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert'),{spawnSync}=require('child_process');
const repo=process.cwd(),gitDir=spawnSync('git',['rev-parse','--absolute-git-dir'],{encoding:'utf8'}).stdout.trim();
assert(gitDir,'run inside the git repository');
const game=fs.readFileSync('game.js','utf8');
const mutants=[
 ['original 004A bug: phase set after opponent planning',
  " G.phase='plan';\n if(gameMode==='tutorial'){Tutorial.turn();Tutorial.opponent();}else aiPlan('e');\n G.sel=null;",
  " if(gameMode==='tutorial'){Tutorial.turn();Tutorial.opponent();}else aiPlan('e');\n G.phase='plan';G.sel=null;",
  /side e turn 2 observed phase reveal/],
 ['observe() leaks the opponent hand',
  "foe:{handCount:G.hand[foe].length,","foe:{hand:G.hand[foe].map(c=>c.def.id),handCount:G.hand[foe].length,",
  /observe\(p\) changed with hidden state/],
 ['observe() leaks face-down card ids',
  "foePendingCount:G.board[l].filter(c=>c.owner===foe&&c.pending).length",
  "foePendingCount:G.board[l].filter(c=>c.owner===foe&&c.pending).map(c=>c.def.id).join()",
  /observe\(p\) changed with hidden state/],
 ['Novice uses face-down enemy power (baseline check)',
  "const diff=mine-laneTotal(l,foe);","const diff=mine-laneTotal(l,foe)-G.board[l].filter(x=>x.owner===foe&&x.pending).reduce((s,x)=>s+x.def.power,0);",
  /RNG order or engine state differs/],
 ['Novice uses face-down enemy power (honesty check alone)',
  "const diff=mine-laneTotal(l,foe);","const diff=mine-laneTotal(l,foe)-G.board[l].filter(x=>x.owner===foe&&x.pending).reduce((s,x)=>s+x.def.power,0);",
  /legacy plan changed with hidden state/,{AI_CHECK_SKIP_BASELINE:'1'}],
 ['extra Math.random call in the dispatcher',
  "function aiPlan(o){const s=aiStrategy(o);","function aiPlan(o){Math.random();const s=aiStrategy(o);",
  /RNG order or engine state differs/],
 ['legacy lane choice takes the last best option',
  "options.reduce((best,l)=>best===null||score(l)>score(best)?l:best,null)","options.reduce((best,l)=>best===null||score(l)>=score(best)?l:best,null)",
  /RNG order or engine state differs|legacy first-best lane/],
 ['play() skips the energy check',
  "if(!c||!canPlay(o,lane)||effCost(o,c)>G.turn-G.spent[o])return false;","if(!c||!canPlay(o,lane))return false;",
  /unaffordable card must be refused/],
 ['play() skips the phase check',
  "if(G.phase!=='plan'||gameMode!=='normal'||![0,1,2].includes(lane))return false;","if(gameMode!=='normal'||![0,1,2].includes(lane))return false;",
  /play outside planning must be refused/],
];
function check(source,env={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gifted-ai-mut-'));
 try{
  fs.mkdirSync(path.join(dir,'scripts'));
  fs.writeFileSync(path.join(dir,'game.js'),source);fs.copyFileSync('tutorial.js',path.join(dir,'tutorial.js'));
  fs.copyFileSync('scripts/check-ai-architecture.cjs',path.join(dir,'scripts/check-ai-architecture.cjs'));
  const r=spawnSync(process.execPath,['scripts/check-ai-architecture.cjs'],{cwd:dir,encoding:'utf8',env:{...process.env,GIT_DIR:gitDir,...env},timeout:600000});
  return {status:r.status,out:(r.stdout||'')+(r.stderr||'')};
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
const control=check(game);
assert.equal(control.status,0,'control (unmodified copy) must pass:\n'+control.out.slice(-800));
let failed=0;
for(const [name,from,to,expect,env] of mutants){
 assert.equal(game.split(from).length,2,`mutant "${name}": target text must occur exactly once`);
 const r=check(game.replace(from,to),env);
 const ok=r.status!==0&&expect.test(r.out);
 console.log(`${ok?'DETECTED':'MISSED  '} ${name}${ok?'':' — exit '+r.status+': '+r.out.split('\n').find(l=>/Error|PASS/.test(l))}`);
 if(!ok)failed++;
}
assert.equal(fs.readFileSync(path.join(repo,'game.js'),'utf8'),game,'working tree must be unchanged');
assert.equal(failed,0,`${failed} mutant(s) not detected`);
console.log(`PASS: control passes; all ${mutants.length} mutants detected by check-ai-architecture.cjs with the expected message`);
