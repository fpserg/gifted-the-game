// Run: node scripts/check-tournament-checkpoint.cjs  (extended check, about a minute)
// GIFTED-004C (#46). tournament-ai.cjs --checkpoint: an interrupted run resumed from its checkpoint gives
// exactly the results of an uninterrupted run; a checkpoint from another seed, parameter set or code
// version is refused; an incomplete last line (interrupted write) is ignored; a corrupt earlier line fails.
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert'),{spawn,spawnSync}=require('child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gifted-ckpt-')),ck=path.join(dir,'run.ckpt');
const args=(seed,extra=[])=>['scripts/tournament-ai.cjs','tactician','novice','3',String(seed),'2',...extra];
const rows=out=>JSON.stringify(JSON.parse(out).byCombination.map(({t,n,seat,wins,losses,draws,games})=>[t,n,seat,games,wins,losses,draws]));
(async()=>{
 try{
  const full=spawnSync(process.execPath,args(4242),{encoding:'utf8'});assert.equal(full.status,0,full.stderr);
  // Interrupt after at least 5 finished configurations, then resume.
  await new Promise(ok=>{const c=spawn(process.execPath,args(4242,['--checkpoint='+ck]),{stdio:['ignore','ignore','pipe']});
   const iv=setInterval(()=>{if(fs.existsSync(ck)&&fs.readFileSync(ck,'utf8').split('\n').filter(Boolean).length>=6){clearInterval(iv);c.kill('SIGKILL');}},50);
   c.on('exit',()=>{clearInterval(iv);ok();});});
  const before=fs.readFileSync(ck,'utf8').split('\n').filter(Boolean).length-1;
  assert(before>=5&&before<18,`interrupted with ${before} finished configurations`);
  fs.appendFileSync(ck,'{"index":17,"resu');// an interrupted write
  const res=spawnSync(process.execPath,args(4242,['--checkpoint='+ck]),{encoding:'utf8'});
  assert.equal(res.status,0,res.stderr);assert.match(res.stderr,new RegExp(`resumed ${before} configurations`));
  assert.equal(rows(res.stdout),rows(full.stdout),'resumed results must equal the uninterrupted run');
  assert.equal(JSON.parse(res.stdout).checkpoint.resumedConfigs,before);
  // Another seed, other parameters or another game.js are refused.
  for(const a of [args(4243,['--checkpoint='+ck]),['scripts/tournament-ai.cjs','tactician','novice','4','4242','2','--checkpoint='+ck],['scripts/tournament-ai.cjs','novice','tactician','3','4242','2','--checkpoint='+ck]]){
   const r=spawnSync(process.execPath,a,{encoding:'utf8'});assert.notEqual(r.status,0);assert.match(r.stderr,/different code version, seed or parameters/);}
  const alt=path.join(dir,'game.js');fs.writeFileSync(alt,fs.readFileSync('game.js','utf8')+'\n// changed\n');
  const r2=spawnSync(process.execPath,[...args(4242),alt,'--checkpoint='+ck],{encoding:'utf8'});
  assert.notEqual(r2.status,0);assert.match(r2.stderr,/different code version/);
  // A corrupt line before the end is an error, not silently skipped.
  const lines=fs.readFileSync(ck,'utf8').split('\n');lines[2]='{broken';fs.writeFileSync(ck,lines.join('\n'));
  const r3=spawnSync(process.execPath,args(4242,['--checkpoint='+ck]),{encoding:'utf8'});
  assert.notEqual(r3.status,0);assert.match(r3.stderr,/checkpoint line 3 is corrupt/);
  console.log(`PASS: interrupted after ${before}/18 configurations and resumed = uninterrupted run; other seed/parameters/code refused; partial last line ignored; corrupt line rejected`);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
