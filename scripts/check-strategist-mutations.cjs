// Run: node scripts/check-strategist-mutations.cjs  (extended check, several minutes)
// GIFTED-004C (#46). Reproducible mutation run for check-strategist.cjs: each known defect is applied to a
// temporary copy of game.js and the check must FAIL with the expected message. The unmodified copy
// must PASS first (positive control). The working tree is never modified.
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert'),{spawnSync}=require('child_process');
const game=fs.readFileSync('game.js','utf8');
// [name, [[from,to],...], expected message, sections of check-strategist.cjs to run]
const mutants=[
 ['sampled worlds use the real opponent hand',[
  [" try{\n  const info=strategistRemember(obs);"," try{\n  globalThis.__realFoeHand=G.hand[other(obs.side)].map(c=>c.def);\n  const info=strategistRemember(obs);"],
  [" st.hand[f]=rest.splice(0,obs.foe.handCount).map(d=>card(d,f));"," st.hand[f]=globalThis.__realFoeHand.map(d=>card(d,f));"]],
  /plan changed with hidden state/,'3'],
 ['sampled worlds use the real face-down cards',[
  [" try{\n  const info=strategistRemember(obs);"," try{\n  globalThis.__realHidden=G.board.flatMap(l=>l.filter(c=>c.owner===other(obs.side)&&c.pending).map(c=>c.def));\n  const info=strategistRemember(obs);"],
  [" const pick=hidden.length?(sets.length?sets[Math.floor(Math.random()*sets.length)]:hidden.map(()=>AI_UNKNOWN_CARD)):[];"," const pick=globalThis.__realHidden;"]],
  /plan changed with hidden state/,'3'],
 ['world seed drawn from the real Math.random',[
  ["   const seed=(0x51ed27*(w+1)+obs.turn*977+(o==='p'?13:29))>>>0;","   const seed=(Math.random()*4294967296)>>>0;"]],
  /planning used the real Math.random/,'2'],
 ['no legal fallback after a search failure',[
  ["  strategistStats.fallbacks++;\n  for(const [uid,l] of fallback||[])if(!ctx.play(uid,l))break;","  strategistStats.fallbacks++;"]],
  /fallback plays the Tactician plan/,'4'],
 ['search budget ignored',[
  ["for(let w=STRATEGIST.worlds;w<STRATEGIST.worlds+STRATEGIST.finalWorlds;w++)evalWorld(w,finalists);","for(let w=STRATEGIST.worlds;w<STRATEGIST.worlds+STRATEGIST.finalWorlds*3;w++)evalWorld(w,finalists);"]],
  /exceed the budget/,'4'],
 ['memory kept across matches',[
  [" if(obs.turn<m.turn||obs.turn===1)m.byTurn={}; // a new match"," // no reset"]],
  /memory must reset for a new match/,'4'],
 ['opponent answer not modelled',[
  ["    if(foeToAct&&STRATEGIST.modelAnswer){","    if(false){"]],
  /forecast: /,'1'],
 // PR #47 inspection findings (sections 5 and 6).
 ['face-down sets use the old turn+1 cost rule (ignores energy, discount, surcharge)',[
  [" const budget=strategistFoeBudget(obs,m.byTurn[obs.turn-1]);"," const budget={budget:obs.turn+1,exact:false};"]],
  /impossible face-down cards in sampled worlds/,'5'],
 ['no legal set falls back to the cheapest real cards',[
  ["hidden.map(()=>AI_UNKNOWN_CARD)","foePool.slice().sort((a,b)=>a.cost-b.cost).slice(0,hidden.length)"]],
  /no legal set: only unknown cards/,'5'],
 ['surcharge from our Fortune Teller ignored',[
  ["s0=ids('me',newMe).includes('a3')?1:0;","s0=0;"]],
  /impossible face-down cards in sampled worlds/,'5'],
 ['destroyed revealed cards not recorded',[
  ["function destroy(c){if(c.revealed&&c.lane>=0)publicHistory().destroyed[c.owner].push({uid:c.uid,id:c.def.id});","function destroy(c){"]],
  /destroyed e1 must not return to the unknown cards/,'6'],
 ['model ignores the destroyed history',[
  [" for(const x of obs.me.destroyed)me.add(x.id);for(const x of obs.foe.destroyed)foe.add(x.id);\n",""]],
  /destroyed e1 must not return to the unknown cards/,'6'],
];
function check(source,sections='1,2,3,4,5,6'){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gifted-strat-mut-'));
 try{
  fs.mkdirSync(path.join(dir,'scripts'));
  fs.writeFileSync(path.join(dir,'game.js'),source);fs.copyFileSync('tutorial.js',path.join(dir,'tutorial.js'));
  fs.copyFileSync('scripts/check-strategist.cjs',path.join(dir,'scripts/check-strategist.cjs'));
  const r=spawnSync(process.execPath,['scripts/check-strategist.cjs'],{cwd:dir,encoding:'utf8',timeout:900000,env:{...process.env,STRATEGIST_CHECK_SECTIONS:sections}});
  return {status:r.status,out:(r.stdout||'')+(r.stderr||'')};
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
const control=check(game);
assert.equal(control.status,0,'control (unmodified copy) must pass:\n'+control.out.slice(-800));
console.log('CONTROL  unmodified copy passes');
let failed=0;
for(const [name,edits,expect,sections] of mutants){
 let src=game;for(const [from,to] of edits){assert.equal(src.split(from).length,2,`mutant "${name}": target text must occur exactly once`);src=src.replace(from,to);}
 const r=check(src,sections),ok=r.status!==0&&expect.test(r.out);
 console.log(`${ok?'DETECTED':'MISSED  '} ${name} (section ${sections})${ok?'':' — exit '+r.status+': '+r.out.split('\n').find(l=>/Error|PASS/.test(l))}`);
 if(!ok)failed++;
}
assert.equal(fs.readFileSync('game.js','utf8'),game,'working tree must be unchanged');
assert.equal(failed,0,`${failed} mutant(s) not detected`);
console.log(`PASS: control passes; all ${mutants.length} Strategist mutants detected by check-strategist.cjs with the expected message`);
