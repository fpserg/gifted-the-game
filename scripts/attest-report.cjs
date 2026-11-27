#!/usr/bin/env node
// GIFTED-004D (#56): attestation report from attest-ai.cjs results.
// Usage: node scripts/attest-report.cjs --out=<dir> <result.json> ...   (all 12 runs; .json or .json.gz, each with its
// checkpoint <name>.ckpt[.gz] next to it; the set is validated by attest-verify.cjs before anything is aggregated)
// Writes <dir>/attestation-summary.json (machine-readable, input of attest-compare.cjs) and
// <dir>/attestation-report.md (tables). Methodology notes are in docs/ai-attestation.md.
'use strict';
const fs=require('fs'),path=require('path'),L=require('./attest-lib.cjs');
const args=process.argv.slice(2),out=(args.find(a=>a.startsWith('--out='))||'--out=.').slice(6),files=args.filter(a=>!a.startsWith('--'));
// Independent validation of the whole sample before aggregation (attest-verify.cjs): complete schedule, each
// pair/mode once, one code identity, strict checkpoints, results equal to their checkpoints. Any failure stops here.
const V=require('./attest-verify.cjs');
let verified;try{verified=V.verifySet(files);}catch(e){console.error('attest-report: refusing to aggregate: '+e.message);process.exit(1);}
// Canonical order (the schedule), whatever the order of the arguments.
const ordered=verified.map(v=>files.find(f=>path.basename(f).replace(/\.gz$/,'')===v.name+'.json'));
const runs=ordered.map(f=>JSON.parse(V.readMaybeGz(f).toString('utf8')));
const LEVELS=['novice','tactician','strategist'],FACS=L.FACS,NAMES={novice:'Новичок',tactician:'Тактик',strategist:'Стратег'};
const FN={eng:'Инженер',ast:'Астромантка',kee:'Хранитель'};
const z=1.959963984540054;
// Wilson 95% interval for a proportion.
function wilson(k,n){if(!n)return [null,null];const p=k/n,d=1+z*z/n,c=p+z*z/(2*n),h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n));return [(c-h)/d,(c+h)/d];}
const pct=x=>x==null?'—':(Math.round(x*10000)/100).toFixed(2).replace('.',',')+'%';
const num=x=>String(x).replace(/\B(?=(\d{3})+(?!\d))/g,' ');
const dec=r=>{const n=r.wins+r.losses,p=n?r.wins/n:null,[lo,hi]=wilson(r.wins,n);return {...r,decisive:n,winRateDecisive:p,ci95:[lo,hi],winRate:r.games?r.wins/r.games:null};};
// Difference of two independent proportions (normal approximation).
const diff=(a,b)=>{const pa=a.winRateDecisive,pb=b.winRateDecisive,se=Math.sqrt(pa*(1-pa)/a.decisive+pb*(1-pb)/b.decisive),d=pa-pb;return {delta:d,ci95:[d-z*se,d+z*se],z:se?d/se:0};};
const key=r=>r.pair.join(':')+'/'+r.mode;
const byKey=Object.fromEntries(runs.map(r=>[key(r),r]));
const S={issue:'#56',generated:new Date().toISOString(),validation:verified.map(({parsed,identity,...v})=>v),runs:[],performance:{},fallbacks:{},legality:{},cards:{},combos:{},locations:{},momentum:{},energy:{},saved:{},targets:[],modeDifference:[]};
for(const r of runs){
 const id=r.identity;
 S.runs.push({pair:r.pair,mode:r.mode,seed:r.seed,gamesPerConfig:r.gamesPerConfig,games:r.overall.games,gameSha256:id.gameSha256,tutorialSha256:id.tutorialSha256,libSha256:id.libSha256,scriptSha256:id.scriptSha256,
  overall:dec(r.overall),bySideA:{p:dec(r.bySideA.p),e:dec(r.bySideA.e)},byFactionA:Object.fromEntries(FACS.map(f=>[f,dec(r.byFactionA[f])])),byFactionB:Object.fromEntries(FACS.map(f=>[f,dec(r.byFactionB[f])])),
  mirror:dec(r.mirror),byCombination:r.byCombination.map(x=>({...x,...dec({games:x.games,wins:x.aWins,losses:x.aLosses,draws:x.draws})})),
  environment:r.environment,elapsedSeconds:r.elapsedSeconds,checkpoint:r.checkpoint});
 // Performance per strategy, side, faction, turn (log histograms; quantiles within ~0.5%).
 const perf=r.aggregate.perf||{};
 for(const [st,sides] of Object.entries(perf))for(const [side,facs] of Object.entries(sides))for(const [fac,turns] of Object.entries(facs))for(const [t,x] of Object.entries(turns)){
  const k=[r.mode,st,side,fac,t].join('|'),cur=S.performance[k]||(S.performance[k]={mode:r.mode,strategy:st,side,faction:fac,turn:t,n:0,h:{},maxMs:0,over1s:0});
  cur.n+=x.n;cur.maxMs=Math.max(cur.maxMs,x.maxMs);cur.over1s+=x.over1s||0;for(const [b,c] of Object.entries(x.h))cur.h[b]=(cur.h[b]||0)+c;
 }
 S.fallbacks[key(r)]=r.strategistCounters;S.legality[key(r)]={violations:r.violations,kinds:r.violationKinds,refused:r.legalRefused};
}
// Aggregated views for the card/location analytics: one per mode and same-strategy pair (main S/S, controls T/T, N/N).
for(const mode of ['pve','symmetric'])for(const lv of LEVELS){
 const r=byKey[lv+':'+lv+'/'+mode];if(!r)continue;const A=r.aggregate,k=lv+'/'+mode;
 const cards=[];for(const [fac,ids] of Object.entries(A.cards[lv]||{}))for(const [id,c] of Object.entries(ids)){
  const pw=c.played_win||0,pl=c.played_loss||0,hw=c.heldUnplayed_win||0,hl=c.heldUnplayed_loss||0;
  const wp=pw+pl?pw/(pw+pl):null,wh=hw+hl?hw/(hw+hl):null;
  cards.push({faction:fac,id,inHand:c.inHand||0,affordable:c.affordable||0,plays:c.plays||0,playRateInHand:c.inHand?(c.plays||0)/c.inHand:null,playRateAffordable:c.affordable?(c.plays||0)/c.affordable:null,
   avgPlayTurn:c.plays?c.playTurn/c.plays:null,avgPaid:c.plays?c.paid/c.plays:null,gamesPlayed:c.gamesPlayed||0,winRatePlayed:wp,winRatePlayedCi95:wilson(pw,pw+pl),
   gamesHeldUnplayed:c.gamesHeldUnplayed||0,winRateHeldUnplayed:wh,winDelta:wp!=null&&wh!=null?wp-wh:null,
   finalOnBoard:c.finalOnBoard||0,avgFinalPower:c.finalOnBoard?c.finalPower/c.finalOnBoard:null,powerPerEnergy:c.finalOnBoard&&c.paid?(c.finalPower/c.finalOnBoard)/(c.paid/c.plays||1):null,
   finalLaneWonRate:c.finalOnBoard?(c.finalLaneWon||0)/c.finalOnBoard:null});
 }
 S.cards[k]=cards.sort((a,b)=>a.faction.localeCompare(b.faction)||a.id.localeCompare(b.id,undefined,{numeric:true}));
 const combos=[];for(const [fac,ps] of Object.entries(A.combos[lv]||{}))for(const [pair,c] of Object.entries(ps)){const w=c.win||0,l=c.loss||0;if(w+l>=200)combos.push({faction:fac,pair,n:c.n,decisive:w+l,winRate:w/(w+l),ci95:wilson(w,w+l)});}
 S.combos[k]=combos.sort((a,b)=>b.winRate-a.winRate);
 S.locations[k]=Object.entries(A.locations).map(([id,x])=>({id,lanes:x.lanes,tieRate:(x.tie||0)/x.lanes,avgTotalPower:x.power/x.lanes,
  winnerTookLane:(x.winnerTookLane||0)/((x.winnerTookLane||0)+(x.loserTookLane||0)),cardsPlayed:(x[lv]||{}).played||0,
  byFaction:Object.fromEntries(FACS.map(f=>[f,{present:(x.present||{})[lv+':'+f]||0,won:(x.won||{})[lv+':'+f]||0}]))})).sort((a,b)=>a.id.localeCompare(b.id));
 const m=A.momentum,dcd=m.decided;S.momentum[k]={decided:dcd,comebackAfter4:(m.comebackAfter4||0)/dcd,comebackAfter5:(m.comebackAfter5||0)/dcd,turningPoint:Object.fromEntries(Object.entries(m.turningPoint||{}).map(([t,n])=>[t,n/dcd]))};
 S.energy[k]=Object.entries(A.energy[lv]||{}).map(([t,x])=>({turn:t,n:x.n,available:x.available/x.n,spent:x.spent/x.n,unused:(x.available-x.spent)/x.n,passRate:(x.pass||0)/x.n})).sort((a,b)=>a.turn.localeCompare(b.turn));
 S.saved[k]={avgCardsLeftInHand:A.saved[lv].cards/A.saved[lv].n,avgDestroyed:(A.destroyed||{})[lv]/A.saved[lv].n};
 S.cards[k+'/factions']=Object.fromEntries(FACS.map(f=>[f,A.byFaction[lv][f]]));
}
for(const v of Object.values(S.performance)){Object.assign(v,L.histQuantiles(v.h));delete v.h;v.maxMs=Math.round(v.maxMs*100)/100;}
// Targets of 004B/004C (pve, as originally measured) and the accepted deviation.
const run=(a,b,m)=>S.runs.find(r=>r.pair.join(':')===a+':'+b&&r.mode===m);
const T=[['tactician','novice',.65,.60,'004B: ≥65% решающих в целом, ≥60% каждой фракцией'],['strategist','novice',.85,null,'004C: ≥85% решающих (PO принял 83,95%)'],['strategist','tactician',.65,.55,'004C: ≥65% решающих в целом, ≥55% каждой фракцией']];
for(const mode of ['pve','symmetric'])for(const [a,b,all,fac,label] of T){const r=run(a,b,mode);if(!r)continue;
 S.targets.push({pair:[a,b],mode,label,overall:r.overall.winRateDecisive,ci95:r.overall.ci95,overallMet:r.overall.winRateDecisive>=all,
  factions:Object.fromEntries(FACS.map(f=>[f,r.byFactionA[f].winRateDecisive])),factionsMet:fac==null?null:FACS.every(f=>r.byFactionA[f].winRateDecisive>=fac)});}
for(const r of S.runs.filter(x=>x.mode==='pve')){const s=run(r.pair[0],r.pair[1],'symmetric');if(s)S.modeDifference.push({pair:r.pair,pve:r.overall.winRateDecisive,symmetric:s.overall.winRateDecisive,...diff(s.overall,r.overall)});}
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'attestation-summary.json'),JSON.stringify(S,null,1));

// ---- markdown ----
const md=[];const P=(...l)=>md.push(...l);
const R0=S.runs[0];
P('# GIFTED-004D — комплексная аттестация ИИ: данные','',`Сформировано ${S.generated}. game.js SHA-256 \`${R0.gameSha256}\`; tutorial.js \`${R0.tutorialSha256}\`; attest-lib \`${R0.libSha256}\`; attest-ai (раннер) — ${[...new Set(S.validation.map(v=>v.runnerSha256))].map(x=>'\`'+x+'\`').join(', ')}.`,
 `Проверка выборки (attest-verify.cjs): ${S.validation.length} прогонов, ${num(S.validation.reduce((a,v)=>a+v.games,0))} партий — расписание, идентичность кода, строгий checkpoint (без пропусков и дубликатов) и совпадение результата с checkpoint; SHA-256 checkpoint — в attestation-summary.json, поле validation.`,
 `Среда: Node ${R0.environment.node}, ${R0.environment.cpus}× ${R0.environment.cpu}. Методика и ограничения — docs/ai-attestation.md.`,'');
P('## 1. Результаты пар (стратегия A против B)','','Доля побед A среди решающих партий с 95% интервалом Уилсона. Партии: 9 сочетаний фракций × 2 назначения сторон × '+R0.gamesPerConfig+'.','',
 '| Пара A–B | Режим | Seed | Партий | Победы A | Поражения A | Ничьи | A, решающие | 95% ДИ | A за p | A за e | Зеркала |','|---|---|---|---|---|---|---|---|---|---|---|---|');
for(const r of S.runs)P(`| ${NAMES[r.pair[0]]}–${NAMES[r.pair[1]]} | ${r.mode} | ${r.seed} | ${num(r.overall.games)} | ${num(r.overall.wins)} | ${num(r.overall.losses)} | ${num(r.overall.draws)} | ${pct(r.overall.winRateDecisive)} | ${pct(r.overall.ci95[0])}–${pct(r.overall.ci95[1])} | ${pct(r.bySideA.p.winRateDecisive)} | ${pct(r.bySideA.e.winRateDecisive)} | ${pct(r.mirror.winRateDecisive)} |`);
P('','В зеркальных парах (A = B) «A» — стратегия на назначенной стороне; разница между p и e показывает влияние места.','');
P('### По фракции A','','| Пара | Режим | '+FACS.map(f=>FN[f]).join(' | ')+' |','|---|---|'+FACS.map(()=>'---').join('|')+'|');
for(const r of S.runs)P(`| ${NAMES[r.pair[0]]}–${NAMES[r.pair[1]]} | ${r.mode} | `+FACS.map(f=>`${pct(r.byFactionA[f].winRateDecisive)} (${pct(r.byFactionA[f].ci95[0])}–${pct(r.byFactionA[f].ci95[1])})`).join(' | ')+' |');
P('','### Разница режимов (symmetric − pve)','','| Пара | pve | symmetric | Разница | 95% ДИ | z |','|---|---|---|---|---|---|');
for(const d of S.modeDifference)P(`| ${NAMES[d.pair[0]]}–${NAMES[d.pair[1]]} | ${pct(d.pve)} | ${pct(d.symmetric)} | ${(d.delta*100).toFixed(2).replace('.',',')} п.п. | ${(d.ci95[0]*100).toFixed(2).replace('.',',')}…${(d.ci95[1]*100).toFixed(2).replace('.',',')} | ${d.z.toFixed(2).replace('.',',')} |`);
P('','## 2. Цели 004B/004C','','| Цель | Режим | Итог | 95% ДИ | Выполнено в целом | Фракции | Выполнено по фракциям |','|---|---|---|---|---|---|---|');
for(const t of S.targets)P(`| ${t.label} | ${t.mode} | ${pct(t.overall)} | ${pct(t.ci95[0])}–${pct(t.ci95[1])} | ${t.overallMet?'да':'нет'} | ${FACS.map(f=>pct(t.factions[f])).join(' / ')} | ${t.factionsMet==null?'—':t.factionsMet?'да':'нет'} |`);
P('','Цели установлены для режима pve (как измерялись в 004B/004C). Результаты symmetric — новый режим, к принятым решениям не приравниваются.','');
P('## 3. Время решения (Node, по ходам)','','По стратегии, стороне и ходу (все фракции), режим; квантили по логарифмической гистограмме (точность около 0,5%), максимум и число решений дольше 1 с — точные.','',
 '| Режим | Стратегия | Сторона | Ход | Решений | p50 мс | p95 мс | p99 мс | Макс мс | >1 с |','|---|---|---|---|---|---|---|---|---|---|');
const perfAgg={};for(const v of Object.values(S.performance)){const k=[v.mode,v.strategy,v.side,v.turn].join('|');const c=perfAgg[k]||(perfAgg[k]={...v,parts:[]});c.parts.push(v);}
// Combine faction rows from the raw histograms again (quantiles need the histogram, recomputed below).
const rawPerf={};for(const r of runs)for(const [st,sides] of Object.entries(r.aggregate.perf||{}))for(const [side,facs] of Object.entries(sides))for(const [fac,turns] of Object.entries(facs))for(const [t,x] of Object.entries(turns)){
 for(const k of [[r.mode,st,side,t].join('|'),[r.mode,st,side,'all'].join('|'),[r.mode,st,'all','all'].join('|')]){const c=rawPerf[k]||(rawPerf[k]={n:0,h:{},maxMs:0,over1s:0});c.n+=x.n;c.maxMs=Math.max(c.maxMs,x.maxMs);c.over1s+=x.over1s||0;for(const [b,n] of Object.entries(x.h))c.h[b]=(c.h[b]||0)+n;}}
S.performanceBySideTurn=Object.fromEntries(Object.entries(rawPerf).map(([k,v])=>[k,{...L.histQuantiles(v.h),maxMs:Math.round(v.maxMs*100)/100,over1s:v.over1s}]));
for(const k of Object.keys(rawPerf).sort()){const [m,st,side,t]=k.split('|');const q=S.performanceBySideTurn[k];if(t==='all')continue;P(`| ${m} | ${NAMES[st]} | ${side} | ${t.slice(1)} | ${num(q.n)} | ${q.p50} | ${q.p95} | ${q.p99} | ${q.maxMs} | ${q.over1s} |`);}
P('','Итого по стратегии и режиму:','','| Режим | Стратегия | Решений | p50 мс | p95 мс | p99 мс | Макс мс | >1 с |','|---|---|---|---|---|---|---|---|');
for(const k of Object.keys(rawPerf).filter(k=>k.endsWith('|all|all')).sort()){const [m,st]=k.split('|');const q=S.performanceBySideTurn[k];P(`| ${m} | ${NAMES[st]} | ${num(q.n)} | ${q.p50} | ${q.p95} | ${q.p99} | ${q.maxMs} | ${q.over1s} |`);}
fs.writeFileSync(path.join(out,'attestation-summary.json'),JSON.stringify(S,null,1));
P('','По фракциям и сторонам — attestation-summary.json, поле performance.','','## 4. Честность и надёжность','','| Пара / режим | Нарушения правил | Отклонённые действия | Вызовы Стратега | Fallback | Без плана | Fallback мира (соперник/свой) | Причины |','|---|---|---|---|---|---|---|---|');
for(const r of S.runs){const k=r.pair.join(':')+'/'+r.mode,f=S.fallbacks[k],g=S.legality[k];P(`| ${NAMES[r.pair[0]]}–${NAMES[r.pair[1]]} / ${r.mode} | ${g.violations} | ${g.refused} | ${num(f.calls)} | ${f.fallbacks} | ${f.fallbacksWithoutPlan} | ${f.worldOpponent} / ${f.worldOwn} | ${Object.entries(f.causes).map(([c,n])=>c+': '+n).join('; ')||'—'} |`);}
for(const mode of ['symmetric','pve'])for(const lv of ['strategist','tactician','novice']){
 const k=lv+'/'+mode;if(!S.cards[k])continue;const main=lv==='strategist'&&mode==='symmetric';
 P('',`## 5${main?'':'*'}. Карты: ${NAMES[lv]}/${NAMES[lv]}, ${mode}${main?' (основной баланс)':' (контроль)'}`,'',
  'Частота розыгрыша — доля планирований, в которых карта была в руке (и по карману), когда её сыграли. Сила за энергию — средняя итоговая сила карты на поле в конце партии, делённая на среднюю уплаченную цену. «Победа, если сыграна» и «если была в руке, но не сыграна» — доли побед стороны среди решающих партий; разница — корреляция, не причинность.','',
  '| Фракция | Карта | В руке | Сыграна | Частота в руке | Частота по карману | Ср. ход | Ср. цена | Сила/энергия | Линия выиграна | Победа, если сыграна | Победа, если не сыграна | Разница |','|---|---|---|---|---|---|---|---|---|---|---|---|---|');
 for(const c of S.cards[k])P(`| ${FN[c.faction]} | ${c.id} | ${num(c.inHand)} | ${num(c.plays)} | ${pct(c.playRateInHand)} | ${pct(c.playRateAffordable)} | ${c.avgPlayTurn==null?'—':c.avgPlayTurn.toFixed(2).replace('.',',')} | ${c.avgPaid==null?'—':c.avgPaid.toFixed(2).replace('.',',')} | ${c.powerPerEnergy==null?'—':c.powerPerEnergy.toFixed(2).replace('.',',')} | ${pct(c.finalLaneWonRate)} | ${pct(c.winRatePlayed)} | ${pct(c.winRateHeldUnplayed)} | ${c.winDelta==null?'—':(c.winDelta*100).toFixed(1).replace('.',',')+' п.п.'} |`);
 if(!main&&lv!=='strategist')continue;
 P('','Комбинации (обе карты сыграны одной стороной в партии, не менее 200 решающих партий): 8 лучших и 8 худших по доле побед.','','| Фракция | Пара карт | Партий | Победы | 95% ДИ |','|---|---|---|---|---|');
 const cb=S.combos[k];for(const c of [...cb.slice(0,8),...cb.slice(-8)])P(`| ${FN[c.faction]} | ${c.pair} | ${num(c.decisive)} | ${pct(c.winRate)} | ${pct(c.ci95[0])}–${pct(c.ci95[1])} |`);
 P('','Локации: доля ничьих на линии, средняя суммарная сила, доля линий, взятых победителем партии (насколько линия решает исход), сыгранные карты.','','| Локация | Линий | Ничьи | Ср. сила | Линию взял победитель | Сыграно карт | '+FACS.map(f=>FN[f]+': взята/присутствие').join(' | ')+' |','|---|---|---|---|---|---|'+FACS.map(()=>'---').join('|')+'|');
 for(const l of S.locations[k])P(`| ${l.id} | ${num(l.lanes)} | ${pct(l.tieRate)} | ${l.avgTotalPower.toFixed(1).replace('.',',')} | ${pct(l.winnerTookLane)} | ${num(l.cardsPlayed)} | `+FACS.map(f=>pct(l.byFaction[f].present?l.byFaction[f].won/l.byFaction[f].present:null)).join(' | ')+' |');
 const m=S.momentum[k];P('',`Камбэки: победитель отставал по числу линий после 4-го хода — ${pct(m.comebackAfter4)}, после 5-го — ${pct(m.comebackAfter5)}. Переломный ход (с которого победитель лидировал до конца): `+Object.entries(m.turningPoint).sort().map(([t,v])=>`${t.slice(1)} — ${pct(v)}`).join(', ')+'.');
 P('','Энергия по ходам: доступно (с учётом скидки), потрачено, не использовано, доля ходов без розыгрыша.','','| Ход | Доступно | Потрачено | Не использовано | Пропуск |','|---|---|---|---|---|');
 for(const e of S.energy[k])P(`| ${e.turn.slice(1)} | ${e.available.toFixed(2).replace('.',',')} | ${e.spent.toFixed(2).replace('.',',')} | ${e.unused.toFixed(2).replace('.',',')} | ${pct(e.passRate)} |`);
 P('',`Сохранение карт: в конце партии в руке в среднем ${S.saved[k].avgCardsLeftInHand.toFixed(2).replace('.',',')} карты; уничтожено ${S.saved[k].avgDestroyed.toFixed(2).replace('.',',')} карты стороны.`);
}
fs.writeFileSync(path.join(out,'attestation-report.md'),md.join('\n')+'\n');
console.log(`wrote ${path.join(out,'attestation-summary.json')} and attestation-report.md (${S.runs.length} runs)`);
