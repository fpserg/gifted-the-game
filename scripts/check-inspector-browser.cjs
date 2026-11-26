#!/usr/bin/env node
// GIFTED-INSPECTOR-CI (#51): positive and negative scenarios of scripts/inspector-browser-measure.cjs.
// Usage: node scripts/check-inspector-browser.cjs [chrome=/usr/bin/google-chrome]
// Uses this checkout's own game.js and tutorial.js in temporary git repositories (no network).
// Every failure path must exit non-zero with the expected error; the positive run must report complete data.
'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),http=require('http'),assert=require('assert'),{spawn,execFileSync}=require('child_process');
const ROOT=path.join(__dirname,'..'),TOOL=path.join(__dirname,'inspector-browser-measure.cjs');
const CHROME=process.argv[2]||'/usr/bin/google-chrome';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'inspector-check-'));
const gitEnv={...process.env,GIT_AUTHOR_NAME:'check',GIT_AUTHOR_EMAIL:'check@example.invalid',GIT_COMMITTER_NAME:'check',GIT_COMMITTER_EMAIL:'check@example.invalid'};
function repo(name,patch=null){
 const d=path.join(tmp,name);fs.mkdirSync(d);
 fs.copyFileSync(path.join(ROOT,'tutorial.js'),path.join(d,'tutorial.js'));
 const g=fs.readFileSync(path.join(ROOT,'game.js'),'utf8'),pg=patch?patch(g):g;
 if(patch&&pg===g)throw new Error(`patch for ${name} did not apply`);
 fs.writeFileSync(path.join(d,'game.js'),pg);
 const git=(...a)=>execFileSync('git',['-C',d,...a],{env:gitEnv,encoding:'utf8'}).trim();
 git('init','-q');git('add','.');git('commit','-q','-m',name);
 return {dir:d,sha:git('rev-parse','HEAD')};
}
// Asynchronous, so that the local HTTP server of the isolation scenario keeps answering meanwhile.
function run(target,sha,extra=[]){
 const out=path.join(tmp,'out-'+Math.random().toString(36).slice(2));
 return new Promise(res=>{
  const c=spawn(process.execPath,[TOOL,`--target=${target}`,`--expect-sha=${sha}`,`--chrome=${CHROME}`,'--strategy=tactician','--games=2','--rates=1,4',`--out=${out}`,'--timeout-min=5',...extra]);
  let stderr='';c.stderr.on('data',d=>stderr+=d);c.stdout.resume();
  const t=setTimeout(()=>c.kill('SIGKILL'),600000);
  c.on('close',status=>{clearTimeout(t);const read=f=>fs.existsSync(path.join(out,f))?JSON.parse(fs.readFileSync(path.join(out,f),'utf8')):null;
   res({status,stderr,ok:read('measurement.json'),err:read('error.json'),raw:read('raw-timings.json')});});
 });
}
const done=[];
function expectFail(name,r,re){
 assert.notEqual(r.status,0,`${name}: must exit non-zero`);
 assert(r.err&&re.test(r.err.error),`${name}: expected error ${re}, got ${r.err&&r.err.error} / ${r.stderr.slice(-300)}`);
 assert(!r.ok,`${name}: no measurement.json on failure`);done.push(name);
}
(async()=>{try{
 const good=repo('good');
 // Positive: complete data for every rate and both sides, raw timings, verified SHA and versions.
 {const r=await run(good.dir,good.sha);
  assert.equal(r.status,0,`positive run failed: ${r.stderr.slice(-500)}`);
  assert.equal(r.ok.target.sha,good.sha);assert(r.ok.browser.product&&r.ok.tool.scriptSha256&&r.ok.environment.cpus>0);
  for(const rate of ['1','4']){const x=r.ok.results[rate];
   assert.equal(x.all.n,12);assert.equal(x.p.n,6);assert.equal(x.e.n,6);
   for(const k of ['p50','p95','p99','max','over1s'])assert(Number.isFinite(x.all[k]),`${k} reported`);
   assert.equal(r.raw.byRate[rate].length,12,'raw timings kept');}
  done.push('positive');}
 const bad=good.sha.replace(/^./,c=>c==='a'?'b':'a');
 expectFail('wrong SHA',await run(good.dir,bad),/SHA mismatch/);
 expectFail('abbreviated SHA',await run(good.dir,good.sha.slice(0,12)),/full 40-character/);
 expectFail('missing browser',await run(good.dir,good.sha,['--chrome=/nonexistent/chrome']),/browser not found/);
 expectFail('browser that does not start',await run(good.dir,good.sha,['--chrome=/bin/false']),/browser exited early|did not expose DevTools/);
 expectFail('strategy missing in target',await run(good.dir,good.sha,['--strategy=nosuchstrategy']),/strategy not registered/);
 const skip=repo('skip-turn6',s=>s.replace(/function aiPlan\((\w+)\)\{/,(m,o)=>`${m}if(G.turn===6&&${o}==='e')return;`));
 expectFail('missing measurement',await run(skip.dir,skip.sha),/missing measurements/);
 const boom=repo('page-error',s=>s.replace(/async function endTurn\(\)\{/,m=>`${m}if(G.turn===3)throw new Error('injected');`));
 expectFail('page error',await run(boom.dir,boom.sha),/page error|uncaught page exceptions/);
 const slow=repo('slow',s=>s.replace(/async function endTurn\(\)\{/,m=>`${m}if(G.turn===2){const t=Date.now();while(Date.now()-t<60000);}`));
 expectFail('measurement timeout',await run(slow.dir,slow.sha,['--timeout-min=0.1']),/exceeded/);
 // Isolation: the page is offline (navigator.onLine false) and target code reaching for a local server gets no connection.
 {let hits=0;const srv=http.createServer((q,r)=>{hits++;r.end('ok');});await new Promise(r=>srv.listen(0,'127.0.0.1',r));
  const port=srv.address().port;
  const net=repo('network',s=>`if(navigator.onLine)throw new Error('page is online');fetch('http://127.0.0.1:${port}/leak').then(()=>{throw new Error('network reachable')},()=>{});\n`+s);
  const r=await run(net.dir,net.sha);srv.close();
  assert.equal(r.status,0,`isolation run failed: ${r.err&&r.err.error}`);assert.equal(hits,0,'target code reached the network');
  done.push('network blocked');}
 fs.appendFileSync(path.join(good.dir,'game.js'),'\n// local change\n');
 expectFail('modified target',await run(good.dir,good.sha),/local modifications/);
 console.log(`PASS: inspector browser measurer (${done.join(', ')})`);
}finally{fs.rmSync(tmp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exit(1);});
