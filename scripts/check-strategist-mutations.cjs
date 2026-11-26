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
  [" st.hand[f]=s.hand.map(x=>Object.assign(card(x.def,f),{copy:!!x.copy}));"," st.hand[f]=globalThis.__realFoeHand.map(d=>card(d,f));"]],
  /plan changed with hidden state/,'3'],
 ['sampled worlds use the real face-down cards',[
  [" try{\n  const info=strategistRemember(obs);"," try{\n  globalThis.__realHidden=G.board.flatMap(l=>l.filter(c=>c.owner===other(obs.side)&&c.pending).map(c=>c.def));\n  const info=strategistRemember(obs);"],
  ["hidden.forEach((l,i)=>{const c=card(s.hidden[i].def,f);","hidden.forEach((l,i)=>{const c=card(globalThis.__realHidden[i]||s.hidden[i].def,f);"]],
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
  ["s={hidden:hidden.map(()=>({def:AI_UNKNOWN_CARD}))","s={hidden:u.originals.slice().sort((a,b)=>a.cost-b.cost).slice(0,hidden.length).map(def=>({def}))"]],
  /no legal set: only unknown cards/,'5'],
 ['surcharge from our Fortune Teller ignored',[
  ["s0=ids('me',newMe).includes('a3')?1:0;","s0=0;"]],
  /impossible face-down cards in sampled worlds/,'5'],
 ['destroyed revealed cards not recorded',[
  ["function destroy(c){if(c.revealed&&c.lane>=0)publicHistory().destroyed[c.owner].push({uid:c.uid,id:c.def.id});","function destroy(c){"]],
  /destroyed e1 must not return to the unknown cards/,'6'],
 ['model ignores the destroyed history',[
  ["...obs.lanes.flatMap(l=>l.revealed.filter(c=>c.owner==='foe')),...obs.foe.destroyed].map(c=>({id:c.id,uid:c.uid,turn:foeTurn.get(c.uid)||0}))","...obs.lanes.flatMap(l=>l.revealed.filter(c=>c.owner==='foe'))].map(c=>({id:c.id,uid:c.uid,turn:foeTurn.get(c.uid)||0}))"]],
  /destroyed e1 must not return to the unknown cards/,'6'],
 // PR #47 inspection at 0ad641c: Spy copies (section 7), retargeted to the history-based model.
 ['Spy copies ignored (12 originals assumed)',[
  ["C=H+D+hiddenCount+seen.length-F.length;","C=0;"]],
  /7a: exactly one copy/,'7'],
 ['an original with a copied id is always excluded (Keeper mirror)',[
  ["copyOk=events.some(e=>e.ids.includes(x.id)&&e.uid!==x.uid);","copyOk=false;"]],
  /7b: the original with the copied id must stay possible/,'7'],
 ['unknown copies placed in the deck',[
  ["const deck=origRest.slice(0,D),hand=sShuffle([...origRest.slice(D),...rest.filter(x=>x.copy)]);","const mix=sShuffle([...rest]),deck=mix.slice(0,D),hand=mix.slice(D);"]],
  /7a: (decks contain no copies|exactly one copy)/,'7'],
 ['public hand size not kept',[
  ["const deck=origRest.slice(0,D),hand=sShuffle([...origRest.slice(D),...rest.filter(x=>x.copy)]);","const deck=origRest.slice(0,D),hand=sShuffle([...origRest.slice(D)]);"],
  ["  if(hand.length!==H||deck.length!==D)continue;\n",""]],
  /opponent hand size|exactly one copy/,'7'],
 ['copy identities read from the real opponent hand',[
  [" try{\n  const info=strategistRemember(obs);"," try{\n  globalThis.__realCopies=G.hand[other(obs.side)].filter(c=>c.def.f!==obs.foe.faction).map(c=>c.def.id);\n  const info=strategistRemember(obs);"],
  ["map(e=>{const r=Math.random();return {def:CARDS.find(d=>d.id===e.ids[Math.floor(r*e.ids.length)]),copy:true};});","map((e,i)=>{const r=Math.random(),id=(globalThis.__realCopies||[])[i]||e.ids[Math.floor(r*e.ids.length)];return {def:CARDS.find(d=>d.id===id),copy:true};});"]],
  /7e: worlds changed with the hidden copy identity/,'7'],
 // PR #47 inspection at 117370a: the unknown-card lifecycle (section 8).
 ['face-down candidates exclude copies (inspection finding)',[
  ["const sets=strategistHiddenSets(pool,hiddenCount,info.budget.budget,U.length-D);","const sets=strategistHiddenSets(pool.filter(x=>!x.copy),hiddenCount,info.budget.budget,U.length-D);"]],
  /8a: the face-down copy e1 must be a possible face-down card/,'8'],
 ['copied card drawn from the whole hand history',[
  ["const ids=[...new Set([...a.hand.filter(h=>!b.meRev.has(h.uid)).map(h=>h.id),...arrivals.filter(x=>revealDraw||x.kind!=='orig').map(x=>x.id)])];","const ids=[...new Set(turns.filter(x=>x<=t+1).flatMap(x=>m.byTurn[x].hand.map(h=>h.id)))];"]],
  /8a: impossible copied card/,'8'],
 ['start draw of the next turn treated as copyable',[
  ["const revealDraw=d>=2||(d===1&&(b.handCount>=7||b.deck===0));","const revealDraw=true;"]],
  /8a: impossible copied card/,'8'],
 ['own deck from counts only (no history)',[
  [" if(hist&&hist.complete){\n  const list=[]"," if(false){\n  const list=[]"]],
  /own deck model fell back|own deck must equal/,'8'],
 ['own arrival with the id of a known original not resolved as a copy',[
  ["if(!own(x.id)||origIds.has(x.id)||firstOwn.has(x.id))forced.push(x)","if(!own(x.id))forced.push(x)"]],
  /8d': an arrival with the id of a known original|own deck/,'8'],
 ['ambiguous own arrivals treated as originals',[
  ["else{const g={inst:mine,c:k};groups.push(g);for(const x of mine)x.kind=g;}","else for(const x of mine)x.kind='orig';"]],
  /own deck/,'8'],
 ['copy matched to itself or to a later Spy',[
  ["return e.ids.includes(c.id)&&(c.uid==null||c.uid!==e.uid)&&(!c.turn||!e.turn||e.turn<c.turn);","return e.ids.includes(c.id);"]],
  /8c: (the only unknown copy comes from the turn-3 Spy|exactly one unknown copy)/,'8'],
 ['face-down copies cost nothing',[
  ["if(sum+(x.def||x).cost>budget||o>maxOriginals)continue;cur.push(x);rec(j+1,sum+(x.def||x).cost,o);","const cost=x.copy?0:(x.def||x).cost;if(sum+cost>budget||o>maxOriginals)continue;cur.push(x);rec(j+1,sum+cost,o);"]],
  /exceed the real energy|impossible face-down/,'5,8'],
];
function check(source,sections='1,2,3,4,5,6,7,8'){
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
