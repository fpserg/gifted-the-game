#!/usr/bin/env node
// GIFTED-004E (#48), stage B0: negative controls of the behaviour gate. Each control is one small change of
// game.js / tutorial.js in a temporary copy (exactly one match of its anchor); the gate
// (behaviour-baseline.cjs --check --fail-fast against the committed baseline) must report a difference.
// The table shows which component detected each change first. A positive control (unchanged copy, fast
// components) must report no difference, so the copy itself creates no false difference.
// Usage: node scripts/check-behaviour-controls.cjs [--baseline=docs/refactor-baseline/behaviour-baseline.json] [--only=<id,…>]
'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),{spawnSync}=require('child_process');
const REPO=path.join(__dirname,'..');
const arg=(k,d)=>{const a=process.argv.find(x=>x.startsWith(`--${k}=`));return a?a.slice(k.length+3):d;};
const BASELINE=path.resolve(arg('baseline',path.join(REPO,'docs','refactor-baseline','behaviour-baseline.json')));
// [id, area, file, find, replace, components expected to see it (any of them)]
const CONTROLS=[
 ['novice-constant','Новичок','game.js',"let s=c.def.power+cost*1.3+Math.random()*2.5;","let s=c.def.power+cost*1.31+Math.random()*2.5;",['novice']],
 ['novice-dispatch-comment','Новичок (диспетчеризация, обход комментарием)','game.js',"function aiPlan(o){const s=aiStrategy(o);if(s.legacy)return s.plan(o);return s.plan(aiContext(o));}","function aiPlan(o){const s=aiStrategy(o);if(s.legacy)return;return s.plan(aiContext(o));}\n/*\nfunction aiPlan(o){const s=aiStrategy(o);if(s.legacy)return s.plan(o);return s.plan(aiContext(o));}\n*/",['novice']],
 ['novice-threshold','Новичок','game.js',"if(diff<-12)s-=3;","if(diff<-13)s-=3;",['novice']],
 ['tactician-constant','Тактик','game.js',"reduce((s,c)=>s+Math.min(c.def.power,8),0)/8","reduce((s,c)=>s+Math.min(c.def.power,7),0)/8",['ai']],
 ['tactician-uncertainty','Тактик (модель линии)','game.js',"const u=left?1.5+2.4*left+2.5*hidden","const u=left?1.5+2.5*left+2.5*hidden",['ai']],
 ['strategist-seed','Стратег','game.js',"obs.turn*977","obs.turn*978",['ai']],
 ['sandbox-rng','RNG песочницы ИИ','game.js',"Math.imul(n,1664525)+1013904223","Math.imul(n,1664525)+1013904225",['ai']],
 ['match-rng-draw','RNG матча (лишний вызов)','game.js',"const rndOf=a=>a.length?a[Math.floor(Math.random()*a.length)]:null;","const rndOf=a=>a.length?a[Math.floor((Math.random(),Math.random())*a.length)]:null;",['rules','ui','ai','balance']],
 ['initiative-tie','Правило инициативы','game.js',"(Math.random()<.5?'p':'e')","(Math.random()<.5?'e':'p')",['rules','tutorial','ui','ai','balance']],
 ['card-cost','Правило карты (стоимость k1)','game.js',"{id:'k1',f:'kee',name:'Карманник',cost:1,","{id:'k1',f:'kee',name:'Карманник',cost:2,",['rules','ui','ai','balance']],
 ['location-effect','Правило локации (Кузня)','game.js',"onPlay:c=>buff(c,1)","onPlay:c=>buff(c,2)",['rules','ui','ai','balance']],
 ['astro-target','Выбор цели (Астромантка)','game.js',"laneTotal(l,foe)*.05","laneTotal(l,foe)*.06",['rules','ui','ai','balance']],
 ['tutorial-text','Обучение (текст урока)','tutorial.js',"Выбери Подарочный ящик.","Выбери Подарочный ящик!",['tutorial']],
 ['ui-render','UI стола (разметка)',"game.js","class=\"sc${wp==='e'?' win':''}\"","class=\"sc${wp==='e'?' won':''}\"",['tutorial','ui']],
 ['ui-library','UI библиотеки (текст)','game.js',"Они открываются на ходах 1–3.","Они открываются на ходах 1-3.",['ui']],
];
const only=arg('only',null),list=only?CONTROLS.filter(c=>only.split(',').includes(c[0])):CONTROLS;
const rows=[];let failed=0;
const gate=(root,extra=[])=>spawnSync(process.execPath,[path.join(__dirname,'behaviour-baseline.cjs'),`--check=${BASELINE}`,`--root=${root}`,'--fail-fast',...extra],{encoding:'utf8',maxBuffer:1<<28,timeout:3600000});
const copy=()=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'behaviour-control-'));for(const f of ['game.js','tutorial.js'])fs.copyFileSync(path.join(REPO,f),path.join(d,f));return d;};
// positive control on the fast components
// (a partial run reports DIAGNOSTIC ONLY, exit 3: identical, but by design never a gate pass)
{const d=copy(),t=Date.now(),r=gate(d,['--only=novice,rules,tutorial,ui']);const ok=r.status===3&&/DIAGNOSTIC ONLY \(partial: novice, rules, tutorial, ui identical/.test(r.stdout);
 rows.push(['positive (unchanged copy, fast components)','—','identical (diagnostic)',ok?'identical, DIAGNOSTIC ONLY':'DIFFERENT/ERROR: '+(r.stdout+r.stderr).trim().split('\n').pop(),Math.round((Date.now()-t)/1000),ok]);if(!ok)failed++;fs.rmSync(d,{recursive:true,force:true});}
for(const [id,area,file,find,repl,expect] of list){
 const d=copy(),f=path.join(d,file),src=fs.readFileSync(f,'utf8'),n=src.split(find).length-1;
 if(n!==1){rows.push([id,area,expect.join('/'),`anchor found ${n} times`,0,false]);failed++;continue;}
 fs.writeFileSync(f,src.replace(find,repl));
 const t=Date.now(),r=gate(d),out=(r.stdout||'').trim();
 const m=/^DIFFERENT: (.*)$/m.exec(out),first=m?m[1].split(' | ')[0].split(/[ :]/)[0]:null;
 const ok=r.status===1&&!!m&&expect.includes(first);
 rows.push([id,area,expect.join('/'),m?m[1].slice(0,160):`exit ${r.status}: ${(out+(r.stderr||'')).trim().split('\n').pop().slice(0,160)}`,Math.round((Date.now()-t)/1000),ok]);
 if(!ok)failed++;process.stderr.write(`${ok?'DETECTED':'MISSED  '} ${id} (${Math.round((Date.now()-t)/1000)} s)\n`);
 fs.rmSync(d,{recursive:true,force:true});
}
console.log('| Контроль | Область | Ожидаемый компонент | Результат шлюза | с | Итог |\n|---|---|---|---|---|---|');
for(const r of rows)console.log(`| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3].replace(/\|/g,'¦')} | ${r[4]} | ${r[5]?'PASS':'FAIL'} |`);
console.log(failed?`FAIL: ${failed} control(s) not as expected`:`PASS: positive control identical (diagnostic), ${list.length}/${list.length} changes detected`);
process.exit(failed?1:0);
