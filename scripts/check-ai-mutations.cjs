// Run: node scripts/check-ai-mutations.cjs
// GIFTED-004A (#40) and GIFTED-004B (#42). Reproducible mutation run: each known defect is applied to a
// temporary copy of game.js and the named check (check-ai-architecture.cjs by default, or
// check-tactician.cjs) must FAIL with the expected message. The unmodified copy must PASS every check
// first (control). The working tree is never modified.
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
 // GIFTED-004B: Tactician and its sandbox (checked by check-tactician.cjs).
 ['sandbox does not restore Math.random',
  "try{return fn();}finally{G=saved.G;UID=saved.UID;logLines=saved.logLines;Math.random=saved.random;}","try{return fn();}finally{G=saved.G;UID=saved.UID;logLines=saved.logLines;}",
  /planning changed the match beyond its own plays/,{},'check-tactician.cjs'],
 ['sandbox does not restore the uid counter',
  "try{return fn();}finally{G=saved.G;UID=saved.UID;logLines=saved.logLines;Math.random=saved.random;}","try{return fn();}finally{G=saved.G;logLines=saved.logLines;Math.random=saved.random;}",
  /planning changed the match beyond its own plays/,{},'check-tactician.cjs'],
 ['Tactician copies the opponent face-down cards into its sandbox',
  " return st;\n}\nfunction tacticianClone(st){"," for(const c of G.board.flat())if(c.owner===f&&c.pending)st.board[c.lane].push({...c});\n return st;\n}\nfunction tacticianClone(st){",
  /plan changed with hidden state/,{},'check-tactician.cjs'],
 ['Tactician evaluates only one branch on an initiative tie',
  "const orders=tp!==te?[tp>te?'p':'e']:['p','e'];","const orders=[tp>=te?'p':'e'];",
  /initiative branches: expected 2/,{},'check-tactician.cjs'],
 ['Tactician treats lanes as decided before the opponent acts',
  " if(obs.lanes.some(x=>x.foePendingCount)||!obs.foe.handCount||!obs.lanes[l].foeCanPlay)return 0;"," return 0;",
  /narrow leads must be reinforced/,{},'check-tactician.cjs'],
 ['Tactician Owl blocks the safest lane instead of the contested one',
  "case 'a5':return pick(argmax(x=>-Math.abs(margin(x.lane))));","case 'a5':return pick(argmax(x=>Math.abs(margin(x.lane))));",
  /Owl must block the contested lane/,{},'check-tactician.cjs'],
 ['Tactician search ignores location availability',
  "    for(let l=0;l<3;l++){\n     if(!canPlay(o,l))continue;","    for(let l=0;l<3;l++){\n     if(G.blockedUntil[o][l]===G.turn)continue;",
  /illegal play/,{},'check-tactician.cjs'],
];
function check(source,env={},script='check-ai-architecture.cjs'){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gifted-ai-mut-'));
 try{
  fs.mkdirSync(path.join(dir,'scripts'));
  fs.writeFileSync(path.join(dir,'game.js'),source);fs.copyFileSync('tutorial.js',path.join(dir,'tutorial.js'));
  for(const f of ['check-ai-architecture.cjs','check-tactician.cjs'])fs.copyFileSync('scripts/'+f,path.join(dir,'scripts',f));
  const r=spawnSync(process.execPath,['scripts/'+script],{cwd:dir,encoding:'utf8',env:{...process.env,GIT_DIR:gitDir,...env},timeout:600000});
  return {status:r.status,out:(r.stdout||'')+(r.stderr||'')};
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
for(const script of ['check-ai-architecture.cjs','check-tactician.cjs']){const control=check(game,{},script);
 assert.equal(control.status,0,`control (unmodified copy) must pass ${script}:\n`+control.out.slice(-800));}
let failed=0;
for(const [name,from,to,expect,env,script] of mutants){
 assert.equal(game.split(from).length,2,`mutant "${name}": target text must occur exactly once`);
 const r=check(game.replace(from,to),env,script);
 const ok=r.status!==0&&expect.test(r.out);
 console.log(`${ok?'DETECTED':'MISSED  '} ${name}${ok?'':' — exit '+r.status+': '+r.out.split('\n').find(l=>/Error|PASS/.test(l))}`);
 if(!ok)failed++;
}
assert.equal(fs.readFileSync(path.join(repo,'game.js'),'utf8'),game,'working tree must be unchanged');
assert.equal(failed,0,`${failed} mutant(s) not detected`);
console.log(`PASS: controls pass; all ${mutants.length} mutants detected by check-ai-architecture.cjs / check-tactician.cjs with the expected message`);
