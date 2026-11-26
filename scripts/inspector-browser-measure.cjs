#!/usr/bin/env node
// GIFTED-INSPECTOR-CI (#51): independent browser measurement of AI decision time for the Inspector.
//
// Methodology of #46 (as scripts/measure-tactician-browser.py): the strategy plays against the Novice in
// headless Chrome with CDP CPU throttling (default 1x, 4x, 6x); games alternate the seat (p, e), heroes cycle
// eng/ast/kee, game g uses the LCG seed g+11, 6 decisions per game. An emulation, NOT a smartphone measurement.
//
// Separation of the code under inspection ("target") and this trusted measurer:
//  - The target is only read as text in Node and executed in one offline page, never in Node.
//  - A trusted bootstrap script runs in the page BEFORE the target. It captures the clock and the builtins it
//    uses and keeps the timing log, counters and schedule in its closure, unreachable from the target; the
//    target's own globals (e.g. a fake log) are ignored.
//  - The bootstrap wraps the strategy's plan function in the registry. Every decision is timed by the trusted
//    wrapper; its side and turn come from the trusted schedule, not from the target.
//  - Each call of the original plan function is confirmed outside the page: a CDP breakpoint on that function
//    pauses it and the measurer checks that the caller frame is the trusted wrapper. Per segment of each game
//    (setup, turns 1..6) the wrapper count must equal the confirmed calls and the schedule (6 per game, side and
//    turn exact). Calls from anywhere else, extra or missing calls, object return values, unexpected pauses,
//    tampered builtins, additional frames, pages or workers, navigation and page exceptions fail the run.
//  - The breakpoint adds a pause to each timed decision; it is calibrated per rate and reported (the reported
//    times include it, so they never understate).
//  - --isolation=strict (default; used by the workflow) additionally requires a system barrier: no network
//    interface except loopback and no reachable address, a non-root user with the Chrome sandbox (seccomp)
//    active in every renderer, a clean environment, and read-only measurer and target files.
//
// Usage:
//   node scripts/inspector-browser-measure.cjs --target=DIR --expect-sha=SHA [--chrome=/usr/bin/google-chrome]
//     [--strategy=strategist] [--games=60] [--rates=1,4,6] [--out=DIR] [--timeout-min=60]
//     [--isolation=strict|local] [--allow-no-sandbox]   (the last two for local development only)
// Exit 0 only when every requested measurement is complete and verified; otherwise exit 1 with error.json.
// The tool reports and never judges the result: the Inspector evaluates it.
'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),net=require('net'),crypto=require('crypto'),{spawn,execFileSync}=require('child_process');

const TOOL_VERSION='inspector-browser-2';
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const m=/^--([a-z-]+)(?:=(.*))?$/s.exec(a);if(!m)throw new Error(`bad argument: ${a}`);return [m[1],m[2]===undefined?true:m[2]];}));
const P={
 target:args.target,expectSha:args['expect-sha'],chrome:args.chrome||'/usr/bin/google-chrome',strategy:args.strategy||'strategist',
 games:Number(args.games||60),rates:String(args.rates||'1,4,6').split(',').map(Number),out:args.out||'inspector-browser-out',
 timeoutMin:Number(args['timeout-min']||60),isolation:args.isolation||'strict',allowNoSandbox:args['allow-no-sandbox']===true,
};
const OPPONENT='novice',TURNS=6,HEROES=['eng','ast','kee'],CALIBRATION=30;
const ENV_ALLOWED=new Set(['PATH','HOME','TMPDIR','LANG','LC_ALL','TZ','INSPECTOR_IMAGE_OS','INSPECTOR_IMAGE_VERSION']);
const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
const started=new Date().toISOString();
let chromeProc=null,userDir=null,failing=false;

function fail(msg,extra={}){
 if(failing)return;failing=true;
 try{fs.mkdirSync(P.out,{recursive:true});fs.writeFileSync(path.join(P.out,'error.json'),JSON.stringify({ok:false,error:msg,...extra,params:P,started,failed:new Date().toISOString()},null,1));}catch{}
 console.error(`FAIL: ${msg}`);cleanup();process.exit(1);
}
function cleanup(){try{chromeProc&&chromeProc.kill('SIGKILL');}catch{}try{userDir&&fs.rmSync(userDir,{recursive:true,force:true});}catch{}}

// ---- parameters, isolation, target ----
function checkParams(){
 if(!P.target)fail('--target is required');
 if(!/^[0-9a-f]{40}$/.test(P.expectSha||''))fail('--expect-sha must be a full 40-character lowercase commit SHA');
 if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(P.strategy))fail('--strategy must be an identifier');
 if(!Number.isInteger(P.games)||P.games<2||P.games%2||P.games>600)fail('--games must be an even integer from 2 to 600 (both seats equally)');
 if(!P.rates.length||P.rates.some(r=>!Number.isFinite(r)||r<1||r>20))fail('--rates must be numbers from 1 to 20');
 if(!(P.timeoutMin>0))fail('--timeout-min must be positive');
 if(!['strict','local'].includes(P.isolation))fail('--isolation must be strict or local');
 if(P.allowNoSandbox&&P.isolation==='strict')fail('--allow-no-sandbox is not allowed with --isolation=strict');
}
const writable=p=>{try{fs.accessSync(p,fs.constants.W_OK);return true;}catch{return false;}};
async function checkIsolation(){
 const report={mode:P.isolation,uid:process.getuid(),envKeys:Object.keys(process.env).sort(),interfaces:fs.readFileSync('/proc/self/net/dev','utf8').split('\n').slice(2).map(l=>l.split(':')[0].trim()).filter(Boolean).sort()}; // per network namespace
 if(P.isolation!=='strict')return report;
 if(report.interfaces.some(i=>i!=='lo'))fail(`isolation: network not isolated (interfaces: ${report.interfaces.join(', ')})`,{isolation:report});
 for(const [host,port] of [['1.1.1.1',443],['140.82.112.3',443],['127.0.0.1',9]]){
  const reached=await new Promise(res=>{const s=net.connect({host,port,timeout:2000});s.on('connect',()=>{s.destroy();res(true);});s.on('error',()=>res(false));s.on('timeout',()=>{s.destroy();res('timeout');});});
  if(reached===true)fail(`isolation: network not isolated (${host}:${port} reachable)`,{isolation:report});
 }
 if(report.uid===0)fail('isolation: running as root (the Chrome sandbox needs a non-root user)',{isolation:report});
 const extraEnv=report.envKeys.filter(k=>!ENV_ALLOWED.has(k));
 if(extraEnv.length)fail(`isolation: environment not clean (${extraEnv.join(', ')})`,{isolation:report});
 const toolDir=path.dirname(__filename);
 for(const p of [toolDir,__filename,path.resolve(P.target),path.join(P.target,'game.js'),path.join(P.target,'tutorial.js')])
  if(writable(p))fail(`isolation: ${p} is writable by the measuring user`,{isolation:report});
 return report;
}
// Read-only queries; the checkouts are root-owned in the workflow, so git's ownership check is waived here.
function git(dir,...a){return execFileSync('git',['-c','safe.directory=*','-C',dir,...a],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function verifyTarget(){
 let head,dirty;
 try{head=git(P.target,'rev-parse','HEAD');dirty=git(P.target,'status','--porcelain','--untracked-files=no');}catch(e){fail(`target is not a git checkout: ${e.message}`);}
 if(head!==P.expectSha)fail(`SHA mismatch: target HEAD ${head}, expected ${P.expectSha}`,{targetHead:head});
 if(dirty)fail('target checkout has local modifications',{dirty});
 const read=f=>{const p=path.join(P.target,f);if(!fs.existsSync(p))fail(`target file missing: ${f}`);return fs.readFileSync(p);};
 const tut=read('tutorial.js'),game=read('game.js');
 return {sha:head,files:{'tutorial.js':sha256(tut),'game.js':sha256(game)},src:tut.toString('utf8')+'\n'+game.toString('utf8')};
}
function toolInfo(){
 const self=fs.readFileSync(__filename),dir=path.dirname(__filename),base=path.basename(__filename);let commit=null,modified=null;
 try{commit=git(dir,'rev-parse','HEAD');modified=git(dir,'status','--porcelain','--',base)?(git(dir,'ls-files','--',base)?'modified':'untracked'):false;}catch{}
 return {version:TOOL_VERSION,commit,scriptModified:modified,scriptSha256:sha256(self),node:process.version};
}

// ---- Chrome over a pipe (no TCP port) ----
function launchChrome(){
 if(!fs.existsSync(P.chrome))fail(`browser not found: ${P.chrome}`);
 userDir=fs.mkdtempSync(path.join(os.tmpdir(),'inspector-chrome-'));
 const flags=['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions',
  '--disable-background-networking','--disable-component-update','--disable-sync','--disable-default-apps','--disable-component-extensions-with-background-pages','--host-resolver-rules=MAP * ~NOTFOUND',
  `--user-data-dir=${userDir}`,'--remote-debugging-pipe','about:blank'];
 if(P.allowNoSandbox)flags.unshift('--no-sandbox');
 return new Promise((res,rej)=>{
  try{chromeProc=spawn(P.chrome,flags,{stdio:['ignore','ignore','pipe','pipe','pipe']});}catch(e){return rej(new Error(`browser failed to start: ${e.message}`));}
  let err='';chromeProc.stderr.on('data',d=>{err=(err+d).slice(-2000);});
  chromeProc.on('error',e=>rej(new Error(`browser failed to start: ${e.message}`)));
  chromeProc.on('exit',c=>{if(!failing)fail(`browser exited with code ${c}: ${err.slice(-500)}`);});
  const cdp=cdpPipe(chromeProc.stdio[3],chromeProc.stdio[4]);
  const t=setTimeout(()=>rej(new Error('browser did not answer on the DevTools pipe within 30 s')),30000);
  cdp.send('Browser.getVersion').then(v=>{clearTimeout(t);res({cdp,version:v});},e=>{clearTimeout(t);rej(e);});
 });
}
function cdpPipe(wr,rd){
 let id=0,buf='';const pending=new Map(),listeners=[],created=new Set();
 rd.on('data',d=>{buf+=d;let i;while((i=buf.indexOf('\0'))>=0){const m=JSON.parse(buf.slice(0,i));buf=buf.slice(i+1);
  if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.rej(new Error(`CDP ${p.method}: ${m.error.message}`));else{if(p.method==='Target.createTarget')created.add(m.result.targetId);p.res(m.result);}}
  else if(m.method)for(const l of listeners)l(m);}});
 rd.on('error',()=>{});wr.on('error',()=>{});
 const creating=new Set();
 return {created,creating,send(method,params={},sessionId){const p=new Promise((r,j)=>{const i=++id;pending.set(i,{res:r,rej:j,method});wr.write(JSON.stringify({id:i,method,params,...(sessionId?{sessionId}:{})})+'\0');});
  if(method==='Target.createTarget'){creating.add(p);p.catch(()=>{}).finally(()=>creating.delete(p));}return p;},on(f){listeners.push(f);}};
}
// Chrome's own report of the renderer sandbox (chrome://sandbox, a separate trusted page of the measurer).
async function sandboxStatus(cdp){
 const {targetId}=await cdp.send('Target.createTarget',{url:'chrome://sandbox'});
 const {sessionId}=await cdp.send('Target.attachToTarget',{targetId,flatten:true});
 let text='';
 for(let k=0;k<50&&!/adequately sandboxed/.test(text);k++){
  const r=await cdp.send('Runtime.evaluate',{expression:'document.body?document.body.innerText:""',returnByValue:true},sessionId);
  text=(r.result&&r.result.value)||'';if(!/adequately sandboxed/.test(text))await new Promise(res=>setTimeout(res,200));
 }
 await cdp.send('Target.closeTarget',{targetId});
 const yes=k=>new RegExp(k+'\\s+Yes').test(text);
 return {adequate:/You are adequately sandboxed/.test(text),pidNamespaces:yes('PID namespaces'),networkNamespaces:yes('Network namespaces'),seccompBpf:yes('Seccomp-BPF sandbox'),text:text.replace(/\s+/g,' ').trim()};
}

// ---- trusted bootstrap (runs in the page before the target; nothing of it is reachable from globals) ----
const BOOTSTRAP=`(function(){
 'use strict';
 const R=Reflect,apply=R.apply,gopd=Object.getOwnPropertyDescriptor,F64=Float64Array,I32=Int32Array,freeze=Object.freeze,assign=Object.assign,imul=Math.imul,M=Math;
 const perf=globalThis.performance,perfNow=Performance.prototype.now,now=()=>apply(perfNow,perf,[]);
 const watched=[[globalThis,'performance'],[Performance.prototype,'now'],[Date,'now'],[R,'apply'],[Function.prototype,'call'],[Function.prototype,'apply'],
  [Function.prototype,'bind'],[Object,'freeze'],[Object,'assign'],[Object,'getOwnPropertyDescriptor'],[globalThis,'Float64Array'],[globalThis,'Int32Array'],
  [globalThis,'setTimeout'],[globalThis,'setInterval'],[globalThis,'queueMicrotask'],[globalThis,'Promise'],[Promise.prototype,'then'],[globalThis,'Reflect'],[globalThis,'Math'],[Math,'imul']];
 const original=watched.map(([o,k])=>{const d=gopd(o,k);return d&&('value' in d?d.value:d.get);});
 let ev=null,orig=null,wrapper=null,cap=0,calls=0,seg=0,curSide=0,curTurn=0,curGame=-1,objectReturn=0;
 let dur=null,side=null,turn=null,game=null;
 function calibrationTarget(){return undefined;}
 let x=1;const rnd=()=>((x=(imul(x,1664525)+1013904223)>>>0)/4294967296);
 const controller={
  attach(fn){ev=fn(undefined);if(typeof ev!=='function')throw new Error('target did not provide its evaluator');return true;},
  install(strategy,n){
   const reg=ev('AI_STRATEGIES');const entry=reg&&reg[strategy];
   if(!entry||typeof entry.plan!=='function')throw new Error('strategy not registered in target: '+strategy);
   orig=entry.plan;cap=n;dur=new F64(n);side=new I32(n);turn=new I32(n);game=new I32(n);
   wrapper=function(ctx){
    const k=calls;calls=k+1;seg=seg+1;
    const t0=now();const r=apply(orig,this,[ctx]);const t1=now();
    if(k<cap){dur[k]=t1-t0;side[k]=curSide;turn[k]=curTurn;game[k]=curGame;}
    if(r!==null&&(typeof r==='object'||typeof r==='function'))objectReturn=objectReturn+1;
    return r;
   };
   reg[strategy]=freeze(assign({},entry,{plan:wrapper}));
   ev('FAST=true');return {id:String(entry.id),version:String(entry.version)};
  },
  original(){return orig;},wrapperFn(){return wrapper;},calibrationFn(){return calibrationTarget;},
  calibrate(n){const out=[];for(let i=0;i<n;i++){const t0=now();apply(calibrationTarget,undefined,[]);out[i]=now()-t0;}return out;},
  // One segment of game g: step -1 = setup (strategies, seed, newGame); step i = turn i+1 (aiPlan('p'), endTurn()).
  async segment(g,step,seat,strategy,opponent,hero,expectSide,expectTurn){
   seg=0;curGame=g;curSide=expectSide;curTurn=expectTurn;
   const t0=now();
   if(step<0){x=g+11;M.random=rnd;
    ev("setAiStrategy('p','"+opponent+"');setAiStrategy('e','"+opponent+"');setAiStrategy('"+seat+"','"+strategy+"');newGame('"+hero+"')");}
   else await ev("(async()=>{aiPlan('p');await endTurn()})()");
   return {calls:seg,ms:now()-t0};
  },
  state(){
   const tampered=[];for(let i=0;i<watched.length;i++){const [o,k]=watched[i];const d=gopd(o,k);const v=d&&('value' in d?d.value:d.get);if(v!==original[i])tampered[tampered.length]=k;}
   return {calls,cap,objectReturn,tampered};
  },
  dump(){const n=calls<cap?calls:cap,o=[];for(let i=0;i<n;i++)o[i]=[game[i],side[i],turn[i],dur[i]];return o;},
 };
 return freeze(controller);
})()`;

function stats(ms){
 const t=[...ms].sort((a,b)=>a-b),n=t.length,r=v=>Math.round(v*10)/10;
 const q=p=>r(t[Math.min(n-1,Math.floor(n*p))]); // nearest rank (floor), as in measure-tactician-browser.py
 return {n,mean:r(t.reduce((a,b)=>a+b,0)/n),p50:q(.5),p95:q(.95),p99:q(.99),max:r(t[n-1]),over1s:t.filter(v=>v>1000).length};
}
const sameLoc=(a,b)=>a&&b&&a.scriptId===b.scriptId&&a.lineNumber===b.lineNumber&&a.columnNumber===b.columnNumber;

async function measureRate(cdp,rate,target,violations){
 const {targetId}=await cdp.send('Target.createTarget',{url:'about:blank'});
 const {sessionId}=await cdp.send('Target.attachToTarget',{targetId,flatten:true});
 const s=(m,p)=>cdp.send(m,p,sessionId);
 const violate=v=>violations.push({rate,...v});
 let bp=null,calibBp=null,wrapperLoc=null,pausesSeg=0,calibPauses=0,ready=false;
 cdp.on(m=>{
  if(m.sessionId!==sessionId)return;
  if(m.method==='Debugger.paused'){
   const hit=m.params.hitBreakpoints||[],caller=m.params.callFrames[1];
   if(bp&&hit.includes(bp)){if(caller&&sameLoc(caller.functionLocation,wrapperLoc))pausesSeg++;else violate({kind:'strategy called outside the trusted wrapper',caller:caller&&caller.functionName});}
   else if(calibBp&&hit.includes(calibBp))calibPauses++;
   else violate({kind:'unexpected pause',reason:m.params.reason});
   s('Debugger.resume').catch(()=>{});
  }
  else if(m.method==='Page.frameAttached')violate({kind:'additional frame created'});
  else if(m.method==='Page.frameNavigated'&&!m.params.frame.parentId&&ready)violate({kind:'page navigated',url:m.params.frame.url});
  else if(m.method==='Target.attachedToTarget')violate({kind:`additional ${m.params.targetInfo.type} created`});
  else if(m.method==='Runtime.exceptionThrown')violate({kind:'uncaught page exception',text:(m.params.exceptionDetails.exception||{}).description||m.params.exceptionDetails.text});
 });
 await s('Page.enable');await s('Runtime.enable');await s('Network.enable');
 await s('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
 await s('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true});
 await s('Emulation.setCPUThrottlingRate',{rate});
 await s('Debugger.enable');
 ready=true;
 const call=async(objectId,fn,a=[],byValue=true)=>{const r=await s('Runtime.callFunctionOn',{objectId,functionDeclaration:fn,arguments:a.map(v=>v&&v.objectId?{objectId:v.objectId}:{value:v}),awaitPromise:true,returnByValue:byValue});
  if(r.exceptionDetails)throw new Error(`page error at ${rate}x: ${(r.exceptionDetails.exception||{}).description||r.exceptionDetails.text}`);return r.result;};
 // 1) trusted bootstrap, 2) target (compiled as one script), 3) wrap the strategy and set the breakpoints.
 const boot=await s('Runtime.compileScript',{expression:BOOTSTRAP,sourceURL:'inspector-bootstrap.js',persistScript:true});
 const ctl=(await s('Runtime.runScript',{scriptId:boot.scriptId})).result;
 const text='(function(document){'+target.src+'\n;return (code)=>eval(code);})';
 const tgt=await s('Runtime.compileScript',{expression:text,sourceURL:'target.js',persistScript:true});
 if(tgt.exceptionDetails)throw new Error(`target does not compile: ${tgt.exceptionDetails.text}`);
 const fn=(await s('Runtime.runScript',{scriptId:tgt.scriptId})).result;
 await call(ctl.objectId,'function(f){return this.attach(f)}',[fn]);
 const strat=(await call(ctl.objectId,'function(s,n){return this.install(s,n)}',[P.strategy,P.games*TURNS])).value;
 const loc=async getter=>{const o=await call(ctl.objectId,getter,[],false);const pr=await s('Runtime.getProperties',{objectId:o.objectId,ownProperties:true});
  const l=(pr.internalProperties||[]).find(p=>p.name==='[[FunctionLocation]]');if(!l)throw new Error('function location unavailable');return l.value.value;};
 const origLoc=await loc('function(){return this.original()}').catch(()=>{throw new Error('the strategy plan function is not defined by the target code');});
 wrapperLoc=await loc('function(){return this.wrapperFn()}');
 if(origLoc.scriptId!==tgt.scriptId)throw new Error('the strategy plan function is not defined by the target code');
 if(wrapperLoc.scriptId!==boot.scriptId)throw new Error('wrapper location mismatch');
 bp=(await s('Debugger.setBreakpoint',{location:origLoc})).breakpointId;
 calibBp=(await s('Debugger.setBreakpoint',{location:await loc('function(){return this.calibrationFn()}')})).breakpointId;
 // Calibration: the same pause on a trusted empty function, timed the same way.
 const calib=(await call(ctl.objectId,'function(n){return this.calibrate(n)}',[CALIBRATION])).value;
 if(calibPauses!==CALIBRATION)throw new Error(`calibration pauses ${calibPauses}/${CALIBRATION}`);
 const t0=Date.now(),segments=[];
 for(let g=0;g<P.games;g++){
  const seat=g%2?'e':'p',hero=HEROES[g%3];
  for(let step=-1;step<TURNS;step++){
   // Schedule: seat p plans in aiPlan('p') of turns 1..6; seat e plans at newGame (turn 1) and after turns 1..5.
   const expect=seat==='p'?(step>=0?{n:1,turn:step+1}:{n:0,turn:0}):(step<TURNS-1?{n:1,turn:step+2}:{n:0,turn:0});
   pausesSeg=0;const h0=process.hrtime.bigint();
   const r=(await call(ctl.objectId,'function(g,st,se,s,o,h,es,et){return this.segment(g,st,se,s,o,h,es,et)}',[g,step,seat,P.strategy,OPPONENT,hero,seat==='p'?0:1,expect.turn])).value;
   const wall=Number(process.hrtime.bigint()-h0)/1e6;
   if(r.calls!==expect.n||pausesSeg!==r.calls)violate({kind:'decision count mismatch',game:g,step,expected:expect.n,wrapperCalls:r.calls,confirmedCalls:pausesSeg});
   if(r.ms>wall+1)violate({kind:'timing inconsistent with the external clock',game:g,step,pageMs:r.ms,wallMs:wall});
   segments.push([g,step,r.calls,pausesSeg,Math.round(r.ms*1000)/1000,Math.round(wall*1000)/1000]);
   if(violations.length)return null;
  }
 }
 const st=(await call(ctl.objectId,'function(){return this.state()}')).value;
 if(st.tampered.length)violate({kind:'builtins tampered by the target',names:st.tampered});
 if(st.objectReturn)violate({kind:'plan returned an object (asynchronous or deferred work)',count:st.objectReturn});
 if(st.calls!==P.games*TURNS)violate({kind:'decision count mismatch (total)',calls:st.calls,expected:P.games*TURNS});
 const calls=(await call(ctl.objectId,'function(){return this.dump()}')).value;
 await cdp.send('Target.closeTarget',{targetId});
 return {calls,calib,segments,strat,wallSeconds:Math.round((Date.now()-t0)/100)/10};
}

async function main(){
 checkParams();
 for(const f of ['measurement.json','raw-timings.json','summary.md','error.json'])try{fs.rmSync(path.join(P.out,f),{force:true});}catch{}
 const isolation=await checkIsolation();
 const target=verifyTarget(),tool=toolInfo();
 let cdp,version;try{({cdp,version}=await launchChrome());}catch(e){fail(e.message);}
 const violations=[];
 const initial=new Set((await cdp.send('Target.getTargets')).targetInfos.map(t=>t.targetId));
 // Any page, popup, frame or worker other than the measurer's own pages is a violation. Chrome's own
 // component extensions (chrome-extension:// workers) are not created by the page and are ignored.
 const own=t=>t.type==='browser'||(/^chrome-extension:\/\//.test(t.url)&&!t.openerId);
 cdp.on(m=>{if(m.method==='Target.targetCreated'){const t=m.params.targetInfo;
  if(!initial.has(t.targetId)&&!own(t))Promise.allSettled([...cdp.creating]).then(()=>{if(!cdp.created.has(t.targetId))violations.push({kind:`additional ${t.type} target created`,url:t.url});});}});
 const sandbox=await sandboxStatus(cdp).catch(e=>fail(`sandbox status unavailable: ${e.message}`));
 if(P.isolation==='strict'&&!(sandbox.adequate&&sandbox.seccompBpf&&sandbox.networkNamespaces&&sandbox.pidNamespaces))fail('isolation: Chrome renderer sandbox not active',{sandbox});
 await cdp.send('Target.setDiscoverTargets',{discover:true});
 const results={},raw={},calibration={},segments={};let strat=null;
 for(const rate of P.rates){
  let tid;const timer=new Promise((_,j)=>{tid=setTimeout(()=>j(new Error(`measurement at ${rate}x exceeded ${P.timeoutMin} min`)),P.timeoutMin*60000);});
  let m;try{m=await Promise.race([measureRate(cdp,rate,target,violations),timer]);}catch(e){fail(e.message,{rate,violations});}finally{clearTimeout(tid);}
  await new Promise(res=>setTimeout(res,100));
  if(!m||violations.length)fail(`verification failed at ${rate}x: ${violations.map(v=>v.kind).filter((k,i,a)=>a.indexOf(k)===i).join('; ')}`,{rate,violations:violations.slice(0,50)});
  const expected=P.games*TURNS,perSide=expected/2,ms=m.calls.map(c=>c[3]),byS=k=>m.calls.filter(c=>c[1]===k).map(c=>c[3]);
  if(m.calls.length!==expected||byS(0).length!==perSide||byS(1).length!==perSide)fail(`missing measurements at ${rate}x: ${m.calls.length} decisions, expected ${expected}`,{rate});
  for(let g=0;g<P.games;g++){const turns=m.calls.filter(c=>c[0]===g).map(c=>c[2]).join(',');if(turns!=='1,2,3,4,5,6')fail(`game ${g} at ${rate}x: decisions for turns ${turns}, expected 1..6`,{rate});}
  if(ms.some(v=>!Number.isFinite(v)||v<0))fail(`invalid timing at ${rate}x`,{rate});
  calibration[rate]=stats(m.calib);
  // Estimate without the counting pause: each decision minus the calibrated median pause (never below 0).
  const adj=a=>a.map(v=>Math.max(0,v-m.calib.slice().sort((x,y)=>x-y)[Math.floor(m.calib.length/2)]));
  // Whole segments that contain a decision (engine + decision): an upper bound that also covers any work a
  // target might move out of plan into the engine.
  const segMs=m.segments.filter(x=>x[2]===1).map(x=>x[4]);
  results[rate]={all:stats(ms),p:stats(byS(0)),e:stats(byS(1)),decisionSegments:stats(segMs),withoutBreakpointEstimate:{all:stats(adj(ms)),p:stats(adj(byS(0))),e:stats(adj(byS(1)))},wallSeconds:m.wallSeconds};
  raw[rate]=m.calls.map(c=>[c[0],c[1]?'e':'p',c[2],Math.round(c[3]*1000)/1000]);
  segments[rate]=m.segments;strat=m.strat;
 }
 await new Promise(res=>setTimeout(res,100));
 if(violations.length)fail(`verification failed: ${violations.map(v=>v.kind).join('; ')}`,{violations});
 const env=k=>process.env[k]||null;
 const meta={
  ok:true,tool,target:{sha:target.sha,files:target.files,strategy:strat},
  browser:{path:P.chrome,product:version.product,revision:version.revision,jsVersion:version.jsVersion,protocol:version.protocolVersion,userAgent:version.userAgent},
  isolation:{...isolation,rendererSandbox:sandbox,noSandboxFlag:P.allowNoSandbox},
  environment:{os:`${os.type()} ${os.release()}`,arch:os.arch(),cpus:os.cpus().length,cpuModel:os.cpus()[0]?.model||null,memGiB:Math.round(os.totalmem()/2**30*10)/10,
   runner:{imageOS:env('INSPECTOR_IMAGE_OS'),imageVersion:env('INSPECTOR_IMAGE_VERSION')}},
  params:{strategy:P.strategy,opponent:OPPONENT,games:P.games,turns:TURNS,rates:P.rates,seeds:'game g: LCG seed g+11',seats:'alternating p,e',heroes:HEROES,percentile:'nearest rank (floor)'},
  verification:{method:'trusted bootstrap closure clock and log; CDP breakpoint on the original plan function with the trusted wrapper as caller; per-segment schedule; builtin integrity; no extra frames, pages or workers',
   decisions:P.games*TURNS,segmentsPerRate:P.games*(TURNS+1),breakpointOverheadMs:calibration},
  results,started,finished:new Date().toISOString(),
 };
 fs.mkdirSync(P.out,{recursive:true});
 fs.writeFileSync(path.join(P.out,'measurement.json'),JSON.stringify(meta,null,1));
 fs.writeFileSync(path.join(P.out,'raw-timings.json'),JSON.stringify({columns:['game','side','turn','ms'],byRate:raw,segments:{columns:['game','step','wrapperCalls','confirmedCalls','pageMs','wallMs'],byRate:segments}}));
 const row=(rate,k,x)=>`| ${rate}× | ${k} | ${x.n} | ${x.p50} | ${x.p95} | ${x.p99} | ${x.max} | ${x.over1s} |`;
 const md=[`## Inspector browser measurement — ${P.strategy} vs ${OPPONENT}`,'',
  `- Target SHA: \`${target.sha}\` (verified); game.js SHA-256 \`${target.files['game.js']}\`; strategy ${strat.id} ${strat.version}`,
  `- Tool: ${TOOL_VERSION}, commit \`${tool.commit}\`, script SHA-256 \`${tool.scriptSha256}\`, Node ${process.version}`,
  `- Browser: ${version.product}; isolation ${P.isolation}${P.isolation==='strict'?' (no network, non-root, sandboxed renderers, clean environment, read-only files)':''}`,
  `- Environment: ${meta.environment.os}, ${meta.environment.cpus}× ${meta.environment.cpuModel}, image ${env('INSPECTOR_IMAGE_OS')||'-'} ${env('INSPECTOR_IMAGE_VERSION')||''}`,
  `- Games: ${P.games} (seats alternate), ${TURNS} decisions per game, CPU throttling ${P.rates.join('×, ')}×; every decision confirmed by an external breakpoint`,'',
  '| CPU | Side | Decisions | p50 ms | p95 ms | p99 ms | Max ms | >1 s |','|---|---|---|---|---|---|---|---|',
  ...P.rates.flatMap(rate=>['all','p','e'].map(k=>row(rate,k,results[rate][k]))),'',
  `Each decision includes the external counting pause (calibration p50 / max ms: ${P.rates.map(r=>`${r}× ${calibration[r].p50} / ${calibration[r].max}`).join(', ')}).`,
  `Estimate without it (minus the calibrated median), p95 all: ${P.rates.map(r=>`${r}× ${results[r].withoutBreakpointEstimate.all.p95} ms`).join(', ')}.`,
  `Whole turn segments with a decision (engine + decision, upper bound), p95 / max: ${P.rates.map(r=>`${r}× ${results[r].decisionSegments.p95} / ${results[r].decisionSegments.max} ms`).join(', ')}.`,'',
  'Emulation in headless Chrome, not a smartphone measurement. The tool reports; the Inspector evaluates.'].join('\n');
 fs.writeFileSync(path.join(P.out,'summary.md'),md+'\n');
 console.log(md);
 cleanup();process.exit(0);
}
main().catch(e=>fail(e.stack||String(e)));
