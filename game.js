const HAS_DOM=typeof document!=='undefined';
/* ================= ДАННЫЕ ================= */
const FACTIONS={
 eng:{name:'Инженер',icon:'👩‍🔧',color:'#f59e0b',desc:'Артефакты и усиления: строй лавину бонусов в одной локации.'},
 ast:{name:'Астромантка',icon:'🧙‍♀️',color:'#8b5cf6',desc:'Удача, добор карт и взрывной рост силы.'},
 kee:{name:'Хранитель',icon:'🗝️',color:'#14b8a6',desc:'Контроль: ослабляй, кради и уничтожай карты врага.'}
};
const IMG={"e1": "assets/cards/e1.webp", "e2": "assets/cards/e2.webp", "e3": "assets/cards/e3.webp", "e4": "assets/cards/e4.webp", "e5": "assets/cards/e5.webp", "e6": "assets/cards/e6.webp", "e7": "assets/cards/e7.webp", "e8": "assets/cards/e8.webp", "e9": "assets/cards/e9.webp", "e10": "assets/cards/e10.webp", "e11": "assets/cards/e11.webp", "e12": "assets/cards/e12.webp", "a1": "assets/cards/a1.webp", "a2": "assets/cards/a2.webp", "a3": "assets/cards/a3.webp", "a4": "assets/cards/a4.webp", "a5": "assets/cards/a5.webp", "a6": "assets/cards/a6.webp", "a7": "assets/cards/a7.webp", "a8": "assets/cards/a8.webp", "a9": "assets/cards/a9.webp", "a10": "assets/cards/a10.webp", "a11": "assets/cards/a11.webp", "a12": "assets/cards/a12.webp", "k1": "assets/cards/k1.webp", "k2": "assets/cards/k2.webp", "k3": "assets/cards/k3.webp", "k4": "assets/cards/k4.webp", "k5": "assets/cards/k5.webp", "k6": "assets/cards/k6.webp", "k7": "assets/cards/k7.webp", "k8": "assets/cards/k8.webp", "k9": "assets/cards/k9.webp", "k10": "assets/cards/k10.webp", "k11": "assets/cards/k11.webp", "k12": "assets/cards/k12.webp", "loc_forge": "assets/locations/loc_forge.webp", "loc_waste": "assets/locations/loc_waste.webp", "loc_library": "assets/locations/loc_library.webp", "loc_tower": "assets/locations/loc_tower.webp", "loc_well": "assets/locations/loc_well.webp", "loc_fog": "assets/locations/loc_fog.webp", "loc_treasury": "assets/locations/loc_treasury.webp", "loc_arena": "assets/locations/loc_arena.webp", "loc_observatory": "assets/locations/loc_observatory.webp"};
const ART={e1:"e1",e2:"e2",e3:"e3",e4:"e4",e5:"e5",e6:"e6",e7:"e7",e8:"e8",e9:"e9",e10:"e10",e11:"e11",e12:"e12",a1:"a1",a2:"a2",a3:"a3",a4:"a4",a5:"a5",a6:"a6",a7:"a7",a8:"a8",a9:"a9",a10:"a10",a11:"a11",a12:"a12",k1:"k1",k2:"k2",k3:"k3",k4:"k4",k5:"k5",k6:"k6",k7:"k7",k8:"k8",k9:"k9",k10:"k10",k11:"k11",k12:"k12"};
const FBG={eng:'bg_eng',ast:'bg_ast',kee:'bg_kee'},AV={eng:'av_eng',ast:'av_ast',kee:'av_kee'};
const LOCIMG={forge:"loc_forge",waste:"loc_waste",library:"loc_library",tower:"loc_tower",well:"loc_well",fog:"loc_fog",treasury:"loc_treasury",arena:"loc_arena",observatory:"loc_observatory"};
function face(d){return ART[d.id]?`<div class="art" style="background-image:url(${IMG[ART[d.id]]})"></div>`:`<div class="art bg" style="background-image:url(${IMG[FBG[d.f]]})"></div><span class="ic">${d.icon}</span>`;}
const avImg=f=>`<img class="av" style="--fc:${FACTIONS[f].color}" src="${IMG[AV[f]]}" alt="">`;
const other=o=>o==='p'?'e':'p';
const rndOf=a=>a.length?a[Math.floor(Math.random()*a.length)]:null;
const maxBy=a=>a.reduce((m,c)=>!m||power(c)>power(m)?c:m,null);
const minBy=a=>a.reduce((m,c)=>!m||power(c)<power(m)?c:m,null);
const others=c=>cardsIn(c.lane,c.owner).filter(x=>x!==c);
const foes=c=>cardsIn(c.lane,other(c.owner));

const CARDS=[
// ---- Инженер ----
{id:'e1',f:'eng',name:'Подарочный ящик',cost:1,power:3,icon:'🎁',text:'Без эффекта.'},
{id:'e2',f:'eng',name:'Заводной жук',cost:1,power:1,icon:'🐞',tag:'ally',text:'При раскрытии: +1 силы случайной другой твоей карте здесь.',onReveal:c=>{const t=rndOf(others(c));if(t)buff(t,1);}},
{id:'e3',f:'eng',name:'Песочные часы',cost:2,power:1,icon:'⏳',art:1,text:'Артефакт. В конце каждого хода: +1 силы себе.',endTurn:c=>buff(c,1)},
{id:'e4',f:'eng',name:'Механик',cost:2,power:2,icon:'🔧',tag:'ally',text:'При раскрытии: +1 силы всем твоим другим картам здесь.',onReveal:c=>others(c).forEach(t=>buff(t,1))},
{id:'e5',f:'eng',name:'Золотая утка',cost:3,power:3,icon:'🦆',art:1,text:'Артефакт. Постоянно: твои другие артефакты +1.',ongoing:(s,t)=>t!==s&&t.owner===s.owner&&t.def.art?1:0},
{id:'e6',f:'eng',name:'Кузнец',cost:3,power:3,icon:'🔨',tag:'ally',text:'При раскрытии: +3 силы, если здесь есть твой артефакт.',onReveal:c=>{if(others(c).some(t=>t.def.art))buff(c,3);}},
{id:'e7',f:'eng',name:'Дирижабль',cost:4,power:4,icon:'🎈',art:1,text:'Артефакт. При раскрытии: +1 силы всем твоим картам в других локациях.',onReveal:c=>allRev(c.owner).filter(t=>t.lane!==c.lane).forEach(t=>buff(t,1))},
{id:'e8',f:'eng',name:'Хрустальный купол',cost:4,power:7,icon:'💎',art:1,text:'Артефакт.'},
{id:'e9',f:'eng',name:'Огненная роза',cost:5,power:8,icon:'🌹',art:1,text:'Артефакт.'},
{id:'e10',f:'eng',name:'Инженер',cost:5,power:4,icon:'👩‍🔧',hero:1,text:'Герой. Постоянно: все твои артефакты +2.',ongoing:(s,t)=>t.owner===s.owner&&t.def.art?2:0},
{id:'e11',f:'eng',name:'Дерево-остров',cost:6,power:9,icon:'🌳',art:1,text:'Артефакт.'},
{id:'e12',f:'eng',name:'Великая машина',cost:6,power:5,icon:'🏭',tag:'ally',text:'При раскрытии: +2 силы за каждую твою другую карту здесь.',onReveal:c=>buff(c,2*others(c).length)},
// ---- Астромантка ----
{id:'a1',f:'ast',name:'Звёздная пыль',cost:1,power:1,icon:'✨',text:'При раскрытии: удача (50%) — +3 силы.',onReveal:c=>{if(luck(c.owner))buff(c,3);else say('…неудача');}},
{id:'a2',f:'ast',name:'Чёрный кот',cost:1,power:2,icon:'🐈‍⬛',text:'При раскрытии: следующая сыгранная тобой карта стоит на 1 меньше.',onReveal:c=>{G.discount[c.owner]=1;}},
{id:'a3',f:'ast',name:'Гадалка',cost:2,power:2,icon:'🔮',text:'При раскрытии: возьми карту.',onReveal:c=>draw(c.owner)},
{id:'a4',f:'ast',name:'Комета',cost:2,power:2,icon:'☄️',text:'При раскрытии: +3 силы случайной твоей карте в другой локации.',onReveal:c=>{const t=rndOf(allRev(c.owner).filter(x=>x.lane!==c.lane));if(t)buff(t,3);}},
{id:'a5',f:'ast',name:'Лунная сова',cost:3,power:2,icon:'🦉',text:'При раскрытии: бросок удачи — от +1 до +4 силы.',onReveal:c=>buff(c,hasLuckHero(c.owner)?4:1+Math.floor(Math.random()*4))},
{id:'a6',f:'ast',name:'Астролябия',cost:3,power:3,icon:'🧭',art:1,text:'Артефакт. В конце каждого хода: +1 силы случайной твоей карте.',endTurn:c=>{const t=rndOf(allRev(c.owner));if(t)buff(t,1);}},
{id:'a7',f:'ast',name:'Галактика',cost:4,power:3,icon:'🌌',tag:'ally',text:'При раскрытии: удвой силу случайной другой твоей карты здесь.',onReveal:c=>{const t=rndOf(others(c));if(t){const p=power(t);if(p>0)buff(t,p);}}},
{id:'a8',f:'ast',name:'Звездопад',cost:4,power:3,icon:'🌠',text:'При раскрытии: +1 силы всем другим твоим картам.',onReveal:c=>allRev(c.owner).filter(t=>t!==c).forEach(t=>buff(t,1))},
{id:'a9',f:'ast',name:'Колесо судьбы',cost:5,power:5,icon:'🎡',text:'При раскрытии: удача (50%) — +5 силы, иначе +1 всем твоим другим картам здесь.',onReveal:c=>{if(luck(c.owner))buff(c,5);else others(c).forEach(t=>buff(t,1));}},
{id:'a10',f:'ast',name:'Астромантка',cost:5,power:5,icon:'🧙‍♀️',hero:1,text:'Герой. Постоянно: твои броски удачи всегда успешны.'},
{id:'a11',f:'ast',name:'Туманность',cost:6,power:10,icon:'🌫️',text:'Без эффекта.'},
{id:'a12',f:'ast',name:'Сверхновая',cost:6,power:4,icon:'💥',text:'При раскрытии: +2 силы за каждую карту в твоей руке.',onReveal:c=>buff(c,2*G.hand[c.owner].length)},
// ---- Хранитель ----
{id:'k1',f:'kee',name:'Карманник',cost:1,power:2,icon:'🤏',tag:'foe',text:'При раскрытии: −1 силы случайной вражеской карте здесь.',onReveal:c=>{const t=rndOf(foes(c));if(t)buff(t,-1);}},
{id:'k2',f:'kee',name:'Тень',cost:1,power:1,icon:'👤',tag:'foe',text:'В конце хода: +1 силы, если здесь у врага больше карт, чем у тебя.',endTurn:c=>{if(foes(c).length>cardsIn(c.lane,c.owner).length)buff(c,1);}},
{id:'k3',f:'kee',name:'Шпион',cost:2,power:2,icon:'🕵️',text:'При раскрытии: добавь в руку копию случайной карты из руки врага.',onReveal:c=>{const h=G.hand[other(c.owner)];if(h.length&&G.hand[c.owner].length<7){const s=rndOf(h);G.hand[c.owner].push(inst(s.def,c.owner));say(`Шпион скопировал «${c.owner==='p'?s.def.name:'?'}»`);}}},
{id:'k4',f:'kee',name:'Ворон',cost:2,power:2,icon:'🪶',tag:'foe',text:'При раскрытии: −2 силы самой сильной вражеской карте здесь.',onReveal:c=>{const t=maxBy(foes(c));if(t)buff(t,-2);}},
{id:'k5',f:'kee',name:'Маска',cost:3,power:3,icon:'🎭',text:'Постоянно: вражеские карты здесь −1.',ongoing:(s,t)=>t.owner!==s.owner&&t.lane===s.lane?-1:0},
{id:'k6',f:'kee',name:'Капкан',cost:3,power:2,icon:'🪤',text:'При раскрытии: следующая вражеская карта, сыгранная здесь, получит −3.',onReveal:c=>{G.trap[c.lane][c.owner]=true;}},
{id:'k7',f:'kee',name:'Палач',cost:4,power:3,icon:'🪓',tag:'foe',text:'При раскрытии: уничтожь самую слабую вражескую карту здесь.',onReveal:c=>{const t=minBy(foes(c));if(t)destroy(t);}},
{id:'k8',f:'kee',name:'Похититель',cost:4,power:3,icon:'🦹',tag:'foe',text:'При раскрытии: забери 3 силы у самой сильной вражеской карты здесь.',onReveal:c=>{const t=maxBy(foes(c));if(t){buff(t,-3);buff(c,3);}}},
{id:'k9',f:'kee',name:'Тюремщик',cost:5,power:5,icon:'⛓️',tag:'foe',text:'При раскрытии: вражеские карты здесь теряют все бонусы.',onReveal:c=>foes(c).forEach(t=>{if(t.buff>0)buff(t,-t.buff);})},
{id:'k10',f:'kee',name:'Хранитель',cost:5,power:3,icon:'🗝️',hero:1,text:'Герой. Постоянно: все вражеские карты −1.',ongoing:(s,t)=>t.owner!==s.owner?-1:0},
{id:'k11',f:'kee',name:'Чёрный рынок',cost:6,power:5,icon:'⚖️',tag:'foe',text:'При раскрытии: уничтожь самую сильную вражескую карту здесь.',onReveal:c=>{const t=maxBy(foes(c));if(t)destroy(t);}},
{id:'k12',f:'kee',name:'Страж бездны',cost:6,power:9,icon:'👁️',text:'Без эффекта.'}
];

const LOCS=[
 {id:'forge',name:'Кузня',icon:'🔥',text:'Сыгранная здесь карта получает +1 силы.',onPlay:c=>buff(c,1)},
 {id:'waste',name:'Пустошь',icon:'🏜️',text:'Карты здесь −1 силы.',mod:c=>-1},
 {id:'library',name:'Библиотека',icon:'📚',text:'Сыграв карту здесь, возьми карту.',onPlay:c=>draw(c.owner)},
 {id:'tower',name:'Башня',icon:'🗼',text:'Не больше 2 карт на сторону.',cap:2},
 {id:'well',name:'Колодец удачи',icon:'⛲',text:'Сыгранная здесь карта: удача (50%) — +3 силы.',onPlay:c=>{if(luck(c.owner))buff(c,3);}},
 {id:'fog',name:'Туманный рынок',icon:'🌁',text:'После 4-го хода сюда нельзя играть.',canPlay:()=>G.turn<=4},
 {id:'treasury',name:'Сокровищница',icon:'💰',text:'В конце хода: +1 силы случайной карте каждой стороны здесь.',
  endTurn:l=>['p','e'].forEach(o=>{const t=rndOf(cardsIn(l,o));if(t)buff(t,1);})},
 {id:'arena',name:'Кривая арена',icon:'🙃',text:'Здесь побеждает тот, у кого меньше силы.',low:1},
 {id:'observatory',name:'Обсерватория',icon:'🔭',text:'Карты стоимостью 1–2 здесь +2 силы.',mod:c=>c.def.cost<=2?2:0}
];

/* ================= СОСТОЯНИЕ ================= */
let G=null,UID=1,FAST=false;
function inst(def,owner){return{uid:UID++,def,owner,lane:-1,buff:0,revealed:false,pending:false,paid:0,usedDisc:false,flash:null,revAt:0};}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

function newGame(pf){
 const ef=rndOf(Object.keys(FACTIONS).filter(f=>f!==pf));
 const locs=shuffle([...LOCS]).slice(0,3);
 G={turn:0,fac:{p:pf,e:ef},deck:{p:[],e:[]},hand:{p:[],e:[]},board:[[],[],[]],locs,locRev:[false,false,false],
  spent:{p:0,e:0},discount:{p:0,e:0},trap:[{p:false,e:false},{p:false,e:false},{p:false,e:false}],phase:'plan',sel:null,info:null,busy:false};
 for(const o of ['p','e']){G.deck[o]=shuffle(CARDS.filter(c=>c.f===G.fac[o]).map(d=>inst(d,o)));for(let i=0;i<3;i++)draw(o);}
 startTurn();
}
function draw(o){if(!G.deck[o].length||G.hand[o].length>=7)return;G.hand[o].push(G.deck[o].pop());}
function cardsIn(l,o){return G.board[l].filter(c=>c.owner===o&&c.revealed);}
function allRev(o){const r=[];G.board.forEach(l=>l.forEach(c=>{if(c.revealed&&(!o||c.owner===o))r.push(c);}));return r;}
function hasLuckHero(o){return allRev(o).some(c=>c.def.id==='a10');}
function luck(o){return hasLuckHero(o)||Math.random()<.5;}
function loc(l){return G.locRev[l]?G.locs[l]:null;}
function power(c){
 if(!c.revealed)return c.def.power+c.buff;
 let p=c.def.power+c.buff;
 for(const s of allRev())if(s.def.ongoing)p+=s.def.ongoing(s,c);
 const L=loc(c.lane);if(L&&L.mod)p+=L.mod(c);
 return p;
}
function laneTotal(l,o){return cardsIn(l,o).reduce((s,c)=>s+power(c),0);}
function laneWinner(l){const p=laneTotal(l,'p'),e=laneTotal(l,'e');if(p===e)return null;const low=loc(l)&&loc(l).low;return (p>e)!==!!low?'p':'e';}
function buff(c,n){if(!n||!c)return;c.buff+=n;c.flash={t:(n>0?'+':'')+n,up:n>0,at:now()};}
function destroy(c){const a=G.board[c.lane];const i=a.indexOf(c);if(i>=0)a.splice(i,1);c.lane=-1;say(`💥 «${c.def.name}» уничтожена`);}
const now=()=>typeof performance!=='undefined'?performance.now():Date.now();
let logLines=[];
function say(t){logLines.push(t);if(logLines.length>2)logLines.shift();}

function effCost(o,c){return Math.max(0,c.def.cost-(G.discount[o]?1:0));}
function capOf(l){const L=loc(l);return L&&L.cap?L.cap:4;}
function canPlay(o,l){const L=loc(l);if(L&&L.canPlay&&!L.canPlay())return false;
 return G.board[l].filter(c=>c.owner===o).length<capOf(l);}
function place(o,c,l){
 const cost=effCost(o,c);c.paid=cost;c.usedDisc=!!G.discount[o]&&c.def.cost>0;if(c.usedDisc)G.discount[o]=0;
 G.spent[o]+=cost;G.hand[o].splice(G.hand[o].indexOf(c),1);c.lane=l;c.pending=true;G.board[l].push(c);
}
function unplace(c){const o=c.owner;G.board[c.lane].splice(G.board[c.lane].indexOf(c),1);c.lane=-1;c.pending=false;
 G.spent[o]-=c.paid;if(c.usedDisc){G.discount[o]=1;c.usedDisc=false;}G.hand[o].push(c);}

function startTurn(){
 G.turn++;G.spent={p:0,e:0};
 if(G.turn<=3){G.locRev[G.turn-1]=true;}
 draw('p');draw('e');
 aiPlan('e');
 G.phase='plan';G.sel=null;
 render();
}

/* ================= ИИ ================= */
function aiPlan(o){
 const foe=other(o);
 for(let guard=0;guard<10;guard++){
  const energy=G.turn-G.spent[o];const opts=[];
  for(const c of G.hand[o]){const cost=effCost(o,c);if(cost>energy)continue;
   for(let l=0;l<3;l++){if(!canPlay(o,l))continue;
    const mine=laneTotal(l,o)+G.board[l].filter(x=>x.owner===o&&x.pending).reduce((s,x)=>s+x.def.power,0);
    const diff=mine-laneTotal(l,foe);
    let s=c.def.power+cost*1.3+Math.random()*2.5;
    const L=loc(l);
    if(L&&L.low)s-=6;
    if(diff<-12)s-=3;else if(diff<=3)s+=3;else if(diff>9)s-=3;
    const n=G.board[l].filter(x=>x.owner===o).length;
    if(c.def.tag==='ally')s+=n*1.6-1;
    if(c.def.tag==='foe')s+=cardsIn(l,foe).length?3:-4;
    if(c.def.art&&G.board[l].some(x=>x.owner===o&&(x.def.id==='e6'||x.def.id==='e5')))s+=1.5;
    if(L&&L.mod)s+=L.mod(c);
    if(L&&L.id==='forge')s+=1;
    opts.push({c,l,s});}}
  if(!opts.length)break;
  opts.sort((a,b)=>b.s-a.s);place(o,opts[0].c,opts[0].l);
 }
}

/* ================= РАСКРЫТИЕ ================= */
const sleep=ms=>FAST?Promise.resolve():new Promise(r=>setTimeout(r,ms));
async function endTurn(){
 if(G.phase!=='plan')return;
 G.phase='reveal';G.sel=null;render();
 let lead=0;for(let l=0;l<3;l++){const w=laneWinner(l);if(w==='p')lead++;else if(w==='e')lead--;}
 const first=lead<0?'e':'p';
 say(first==='p'?'Твои карты раскрываются первыми':'Карты врага раскрываются первыми');
 const order=[];
 const pend=o=>{const r=[];G.board.forEach(l=>l.forEach(c=>{if(c.pending&&c.owner===o)r.push(c);}));return r.sort((a,b)=>a.uid-b.uid);};
 for(const o of [first,other(first)])order.push(...pend(o));
 for(const c of order){
  if(c.lane<0)continue;
  c.revealed=true;c.pending=false;c.revAt=now();
  say(`${c.owner==='p'?'Ты':'Враг'}: «${c.def.name}»`);
  const tr=G.trap[c.lane];if(tr[other(c.owner)]){tr[other(c.owner)]=false;buff(c,-3);say(`🪤 Капкан! «${c.def.name}» −3`);}
  const L=loc(c.lane);if(L&&L.onPlay)L.onPlay(c);
  if(c.def.onReveal&&c.lane>=0)c.def.onReveal(c);
  render();await sleep(650);
 }
 let any=false;
 for(const c of allRev())if(c.def.endTurn){c.def.endTurn(c);any=true;}
 for(let l=0;l<3;l++){const L=loc(l);if(L&&L.endTurn){L.endTurn(l);any=true;}}
 if(any){render();await sleep(500);}
 if(G.turn>=6)finish();else startTurn();
}

function finish(){
 G.phase='over';render();
 let w={p:0,e:0};const lanes=[];
 for(let l=0;l<3;l++){const x=laneWinner(l);if(x)w[x]++;lanes.push({p:laneTotal(l,'p'),e:laneTotal(l,'e'),w:x,L:G.locs[l]});}
 let res;
 if(w.p!==w.e)res=w.p>w.e?'p':'e';
 else{const tp=lanes.reduce((s,x)=>s+x.p,0),te=lanes.reduce((s,x)=>s+x.e,0);res=tp===te?null:(tp>te?'p':'e');}
 G.result=res;
 if(!HAS_DOM)return;
 setTimeout(()=>{
  const t=res==='p'?'Победа! 🏆':res==='e'?'Поражение':'Ничья';
  openOv(`<h2>${t}</h2><p>Локации: ты ${w.p} — враг ${w.e}${w.p===w.e?' (решила общая сила)':''}</p>
  <div class="res">${lanes.map(x=>`<div>${x.L.icon} ${x.L.name}<b style="color:${x.w==='p'?'var(--good)':x.w==='e'?'var(--bad)':'var(--mut)'}">${x.p} : ${x.e}</b></div>`).join('')}</div>
  <div class="row"><button class="btn" id="again">Ещё партию</button><button class="btn sec" id="pick">Сменить героя</button></div>`);
  document.getElementById('again').onclick=()=>{closeOv();newGame(G.fac.p);};
  document.getElementById('pick').onclick=()=>heroPick();
 },700);
}

/* ================= ОТРИСОВКА ================= */
const $=id=>HAS_DOM?document.getElementById(id):null;
function cardInfo(c){const F=FACTIONS[c.def.f];
 return `<b>${c.def.icon} ${c.def.name}</b><span class="tag" style="background:${F.color}33;color:${F.color}">${F.name}</span>
 <span class="tag" style="background:#2563eb33;color:#93b4ff">⚡${c.def.cost}</span><span class="tag" style="background:#ffffff1a">⚔ ${c.revealed?power(c):c.def.power}</span><br>${c.def.text}`;}
function miniCard(c){
 if(c.owner==='e'&&!c.revealed)return `<div class="mc back" data-uid="${c.uid}" aria-label="Закрытая карта"></div>`;
 const p=power(c),d=p-c.def.power;
 const fl=c.flash&&now()-c.flash.at<800?`<span class="fl ${c.flash.up?'up':'dn'}">${c.flash.t}</span>`:'';
 const pop=c.revAt&&now()-c.revAt<500?' pop':'';
 return `<div class="mc f-${c.def.f}${c.pending?' pending':''}${pop}" data-uid="${c.uid}">${face(c.def)}<span class="cost">${c.def.cost}</span><span class="pw ${d>0?'up':d<0?'dn':''}">${p}</span>${fl}</div>`;
}
function slots(l,o){const cs=G.board[l].filter(c=>c.owner===o);const cap=capOf(l);let h='';
 for(let i=0;i<4;i++){if(cs[i])h+=miniCard(cs[i]);else h+=i<cap?'<div class="slot"></div>':'<div class="slot" style="border:none"></div>';}
 return `<div class="slots">${h}</div>`;}
function render(){
 if(!HAS_DOM||!G)return;
 const PF=FACTIONS[G.fac.p],EF=FACTIONS[G.fac.e];
 $('eWho').innerHTML=`${avImg(G.fac.e)}<b>${EF.name}</b><span class="muted">рука ${G.hand.e.length} · колода ${G.deck.e.length}</span>`;
 $('pWho').innerHTML=`${avImg(G.fac.p)}<b>${PF.name}</b><span class="muted">колода ${G.deck.p.length}</span>`;
 $('turn').textContent=`Ход ${G.turn}/6`;
 const sel=G.sel&&G.hand.p.find(c=>c.uid===G.sel);
 let b='';
 for(let l=0;l<3;l++){
  const L=loc(l),wp=laneWinner(l);
  const can=sel&&G.phase==='plan'&&canPlay('p',l)&&effCost('p',sel)<=G.turn-G.spent.p;
  b+=`<div class="lane${can?' can':''}" data-l="${l}">${slots(l,'e')}
   <div class="loc${L?'':' hidden'}" data-l="${l}" style="${L?`background:linear-gradient(#2a2448b8,#1b1730f0),url(${IMG[LOCIMG[L.id]]}) center/cover`:''}"><div class="sc${wp==='e'?' win':''}">${laneTotal(l,'e')}</div>
   <div class="ln">${L?L.icon+' '+L.name:'❔ Скрыта'}</div><div class="lt">${L?L.text:'Откроется на ходу '+(l+1)}</div>
   <div class="sc${wp==='p'?' win':''}">${laneTotal(l,'p')}</div></div>${slots(l,'p')}</div>`;}
 $('board').innerHTML=b;
 $('log').textContent=logLines.join(' · ');
 const left=G.turn-G.spent.p;
 $('energy').textContent=`⚡ ${left}/${G.turn}`;
 $('end').disabled=G.phase!=='plan';
 $('end').textContent=G.phase==='plan'?(G.turn===6?'Финальный ход':'Завершить ход'):'Раскрытие…';
 $('hand').innerHTML=G.hand.p.map(c=>{const ec=effCost('p',c);
  return `<div class="hc f-${c.def.f}${G.sel===c.uid?' sel':''}${ec>left?' dim':''}" data-uid="${c.uid}">${face(c.def)}<span class="cost${ec<c.def.cost?' cheap':''}">${ec}</span><div class="nm">${c.def.name}</div><span class="pw">${c.def.power}</span></div>`;}).join('')||'<div style="color:var(--mut);font-size:12px;padding:30px 6px">Рука пуста</div>';
 const ic=G.info;
 $('info').innerHTML=ic?ic:(G.phase==='plan'?'Выбери карту в руке, затем нажми на локацию. Нажми на свою выложенную карту, чтобы вернуть её в руку. Карты раскрываются в конце хода.':'Карты раскрываются…');
}
function findCard(uid){for(const l of G.board)for(const c of l)if(c.uid===uid)return c;return G.hand.p.find(c=>c.uid===uid);}

if(HAS_DOM){
 $('hand').addEventListener('click',e=>{const el=e.target.closest('.hc');if(!el||!G)return;const uid=+el.dataset.uid;
  const c=G.hand.p.find(x=>x.uid===uid);G.sel=G.sel===uid?null:uid;G.info=cardInfo(c);render();});
 $('board').addEventListener('click',e=>{if(!G)return;
  const mc=e.target.closest('.mc');const lane=e.target.closest('.lane');const l=lane?+lane.dataset.l:-1;
  const sel=G.sel&&G.hand.p.find(c=>c.uid===G.sel);
  if(sel&&l>=0&&G.phase==='plan'){
   if(!canPlay('p',l)){G.info='Сюда сейчас нельзя сыграть карту.';render();return;}
   if(effCost('p',sel)>G.turn-G.spent.p){G.info='Не хватает энергии ⚡';render();return;}
   place('p',sel,l);G.sel=null;G.info=cardInfo(sel);render();return;}
  if(mc){const c=findCard(+mc.dataset.uid);if(!c)return;
   if(c.owner==='p'&&c.pending&&G.phase==='plan'){unplace(c);G.info=`«${c.def.name}» возвращена в руку.`;render();return;}
   G.info=(c.owner==='e'&&!c.revealed)?'Карта врага ещё не раскрыта.':cardInfo(c);render();return;}
  const lc=e.target.closest('.loc');if(lc){const L=loc(+lc.dataset.l);G.info=L?`<b>${L.icon} ${L.name}</b><br>${L.text}`:'Локация откроется позже.';render();}
 });
 $('end').onclick=()=>{G.info=null;endTurn();};
 $('libBtn').onclick=()=>library(G?G.fac.p:'eng','game');
}
function openOv(h){$('ovbox').innerHTML=h;$('ov').classList.remove('hide');}
function closeOv(){$('ov').classList.add('hide');}
let libFrom='game';
function library(tab,from){if(from)libFrom=from;
 const tabs=[...Object.entries(FACTIONS).map(([k,F])=>[k,F.icon+' '+F.name]),['loc','🗺️ Локации']];
 let body;
 if(tab==='loc')body=LOCS.map(L=>`<div class="lc"><div class="li" style="background-image:url(${IMG[LOCIMG[L.id]]})"></div><div class="tx"><b>${L.name}</b><br>${L.text}</div></div>`).join('');
 else body=CARDS.filter(c=>c.f===tab).map(d=>`<div class="lc"><div class="hc f-${d.f}">${face(d)}<span class="cost">${d.cost}</span><span class="pw">${d.power}</span></div>
  <div class="tx"><b>${d.icon} ${d.name}</b>${d.hero?'<span class="tg">герой</span>':''}${d.art?'<span class="tg">артефакт</span>':''}<br><span class="mu">⚡ ${d.cost} энергии · ⚔ ${d.power} силы</span><br>${d.text.replace(/^(Артефакт|Герой)\.\s*/,'')||'Без эффекта.'}</div></div>`).join('');
 openOv(`<div class="lhead"><h2>📖 Библиотека карт</h2><button class="x" id="libx">✕</button></div>
 <div class="tabs">${tabs.map(([k,n])=>`<button class="tab${k===tab?' on':''}" data-t="${k}">${n}</button>`).join('')}</div>
 <p>${tab==='loc'?'В каждой партии выпадают три случайные локации из девяти. Они открываются на ходах 1–3.':FACTIONS[tab].desc}</p>
 <div class="lib">${body}</div>`);
 $('ov').scrollTop=0;
 document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>library(b.dataset.t));
 $('libx').onclick=()=>{if(libFrom==='pick')heroPick();else closeOv();};
}
function heroPick(){
 openOv(`<h2>GIFTED: Битва куполов</h2>
 <p>Прототип карточного боя. Шесть ходов, три локации. На ходу N у тебя N энергии ⚡. Обе стороны выкладывают карты втёмную, в конце хода карты раскрываются и срабатывают их эффекты.</p>
 <ul><li>Локацию выигрывает тот, у кого там больше силы.</li><li>Побеждает тот, кто взял 2 локации из 3.</li><li>Локации открываются по одной на ходах 1–3, у каждой своё правило.</li></ul>
 <p><b style="color:var(--acc)">Выбери героя:</b></p>
 <div class="heroes">${Object.entries(FACTIONS).map(([k,F])=>`<button class="hero" data-f="${k}" style="background:linear-gradient(120deg,${F.color}44,${F.color}11)"><span class="hi"><img src="${IMG[AV[k]]}" alt=""></span><div><b>${F.name}</b><span>${F.desc}</span></div></button>`).join('')}</div>
 <div style="margin-top:10px"><button class="btn sec" id="pickLib" style="width:100%">📖 Библиотека карт</button></div>`);
 $('pickLib').onclick=()=>library('eng','pick');
 document.querySelectorAll('.hero').forEach(b=>b.onclick=()=>{closeOv();logLines=[];newGame(b.dataset.f);});
}
if(HAS_DOM)heroPick();
