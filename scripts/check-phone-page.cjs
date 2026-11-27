#!/usr/bin/env node
// GIFTED-004D (#56): functional check of perf/phone.html in headless Chrome (not a phone measurement).
// Usage: node scripts/check-phone-page.cjs [chrome=/usr/bin/google-chrome]
// Serves the page from a local HTTP server; requests to cdn.jsdelivr.net are answered over CDP with this
// checkout's tutorial.js/game.js (only for the SHA in the link). Checks: complete result for every level,
// shown SHA-256 equal to the files, missing SHA and a wrong file are reported as errors.
'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),http=require('http'),crypto=require('crypto'),assert=require('assert'),{spawn}=require('child_process');
const ROOT=path.join(__dirname,'..'),CHROME=process.argv[2]||'/usr/bin/google-chrome',SHA='0123456789abcdef0123456789abcdef01234567';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 const srv=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(new URL(q.url,'http://x').pathname));if(!f.startsWith(ROOT)||!fs.existsSync(f)){r.statusCode=404;return r.end();}r.setHeader('content-type','text/html; charset=utf-8');r.end(fs.readFileSync(f));});
 await new Promise(r=>srv.listen(0,'127.0.0.1',r));const port=srv.address().port;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'phone-'));
 const c=spawn(CHROME,[...(process.getuid()===0?['--no-sandbox']:[]),'--headless=new','--disable-gpu',`--user-data-dir=${dir}`,'--remote-debugging-pipe','about:blank'],{stdio:['ignore','ignore','ignore','pipe','pipe']});
 let id=0,buf='';const pend=new Map(),ls=[];c.stdio[4].on('data',d=>{buf+=d;let i;while((i=buf.indexOf('\0'))>=0){const m=JSON.parse(buf.slice(0,i));buf=buf.slice(i+1);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}else for(const l of ls)l(m);}});
 const send=(method,params={},sessionId)=>new Promise(r=>{const i=++id;pend.set(i,r);c.stdio[3].write(JSON.stringify({id:i,method,params,...(sessionId?{sessionId}:{})})+'\0');}).then(m=>{if(m.error)throw Error(method+': '+m.error.message);return m.result;});
 const files={'tutorial.js':fs.readFileSync(path.join(ROOT,'tutorial.js')),'game.js':fs.readFileSync(path.join(ROOT,'game.js'))};
 async function page(query,override={}){
  const {targetId}=await send('Target.createTarget',{url:'about:blank'});const {sessionId:S}=await send('Target.attachToTarget',{targetId,flatten:true});
  await send('Fetch.enable',{patterns:[{urlPattern:'https://cdn.jsdelivr.net/*'}]},S);
  ls.push(m=>{if(m.method!=='Fetch.requestPaused'||m.sessionId!==S)return;const u=m.params.request.url,f=Object.keys(files).find(k=>u===`https://cdn.jsdelivr.net/gh/fpserg/gifted-the-game@${SHA}/${k}`);
   const body=f?(override[f]||files[f]):null;
   send(body?'Fetch.fulfillRequest':'Fetch.failRequest',body?{requestId:m.params.requestId,responseCode:200,responseHeaders:[{name:'content-type',value:'application/javascript'},{name:'access-control-allow-origin',value:'*'}],body:Buffer.from(body).toString('base64')}:{requestId:m.params.requestId,errorReason:'Failed'},S).catch(()=>{});});
  await send('Page.enable',{},S);await send('Page.navigate',{url:`http://127.0.0.1:${port}/perf/phone.html${query}`},S);
  const ev=async e=>(await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true},S)).result.value;
  for(let k=0;k<50&&!(await ev("document.readyState==='complete'&&!!document.getElementById('start')"));k++)await new Promise(r=>setTimeout(r,100));
  await ev("document.getElementById('start').click()");
  let st='';for(let k=0;k<3000;k++){st=await ev("document.getElementById('status').textContent");if(/Готово|Ошибка/.test(st))break;await new Promise(r=>setTimeout(r,200));}
  const res={status:st,text:await ev('resultText'),summary:await ev("document.getElementById('summary').textContent")};
  await send('Target.closeTarget',{targetId});return res;
 }
 try{
  const ok=await page(`?sha=${SHA}&games=2`);
  assert(/Готово/.test(ok.status),'positive run: '+ok.status);
  assert(ok.text.includes(`game.js ${sha(files['game.js'])}`)&&ok.text.includes(`tutorial.js ${sha(files['tutorial.js'])}`),'shown SHA-256 equal to the files');
  for(const lv of ['novice','tactician','strategist'])for(const k of ['all','p','e'])assert(new RegExp(`^${lv} ${k} n=${k==='all'?12:6} p50=[\\d.]+ p95=[\\d.]+ p99=[\\d.]+ max=[\\d.]+ over1s=\\d+$`,'m').test(ok.text),`result line ${lv} ${k}`);
  assert(/p95 [\d.]+ мс \(цель ≤ 1000 мс\)/.test(ok.summary),'summary shows the slowest p95 against the target');
  const nosha=await page('?games=2');assert(/Ошибка: В ссылке нет полного SHA/.test(nosha.status),'missing SHA reported');
  const other=await page(`?sha=${SHA}&games=2`,{'game.js':'/* not the game */'});assert(/Ошибка/.test(other.status),'a wrong game.js is reported: '+other.status);
  console.log('PASS: phone page (12 decisions per level, SHA-256 shown, missing SHA and wrong code reported)');
 }finally{c.kill();srv.close();setTimeout(()=>{try{fs.rmSync(dir,{recursive:true,force:true});}catch{}},300);}
})().catch(e=>{console.error(e);process.exit(1);});
