const HAS_DOM=typeof document!=='undefined';
/* ================= ДАННЫЕ ================= */
const FACTIONS={
 eng:{name:'Инженер',icon:'👩‍🔧',color:'#f59e0b',desc:'Артефакты и усиления: строй лавину бонусов в одной локации.'},
 ast:{name:'Астромантка',icon:'🧙‍♀️',color:'#8b5cf6',desc:'Адаптация и манипуляция: меняй расположение карт и правила локаций.'},
 kee:{name:'Хранитель',icon:'🗝️',color:'#14b8a6',desc:'Контроль: ослабляй, кради и уничтожай карты врага.'}
};
const IMG={"e1": "assets/cards/e1.webp", "e2": "assets/cards/e2.webp", "e3": "assets/cards/e3.webp", "e4": "assets/cards/e4.webp", "e5": "assets/cards/e5.webp", "e6": "assets/cards/e6.webp", "e7": "assets/cards/e7.webp", "e8": "assets/cards/e8.webp", "e9": "assets/cards/e9.webp", "e10": "assets/cards/e10.webp", "e11": "assets/cards/e11.webp", "e12": "assets/cards/e12.webp", "a1": "assets/cards/a1.webp", "a2": "assets/cards/a2.webp", "a3": "assets/cards/a3.webp", "a4": "assets/cards/a4.webp", "a5": "assets/cards/a5.webp", "a6": "assets/cards/a6.webp", "a7": "assets/cards/a7.webp", "a8": "assets/cards/a8.webp", "a9": "assets/cards/a9.webp", "a10": "assets/cards/a10.webp", "a11": "assets/cards/a11.webp", "a12": "assets/cards/a12.webp", "k1": "assets/cards/k1.webp", "k2": "assets/cards/k2.webp", "k3": "assets/cards/k3.webp", "k4": "assets/cards/k4.webp", "k5": "assets/cards/k5.webp", "k6": "assets/cards/k6.webp", "k7": "assets/cards/k7.webp", "k8": "assets/cards/k8.webp", "k9": "assets/cards/k9.webp", "k10": "assets/cards/k10.webp", "k11": "assets/cards/k11.webp", "k12": "assets/cards/k12.webp", "loc_forge": "assets/locations/loc_forge.webp", "loc_waste": "assets/locations/loc_waste.webp", "loc_library": "assets/locations/loc_library.webp", "loc_tower": "assets/locations/loc_tower.webp", "loc_well": "assets/locations/loc_well.webp", "loc_fog": "assets/locations/loc_fog.webp", "loc_treasury": "assets/locations/loc_treasury.webp", "loc_arena": "assets/locations/loc_arena.webp", "loc_observatory": "assets/locations/loc_observatory.webp"};
const ART={e1:"e1",e2:"e2",e3:"e3",e4:"e4",e5:"e5",e6:"e6",e7:"e7",e8:"e8",e9:"e9",e10:"e10",e11:"e11",e12:"e12",a1:"a1",a2:"a2",a3:"a3",a4:"a4",a5:"a5",a6:"a6",a7:"a7",a8:"a8",a9:"a9",a10:"a10",a11:"a11",a12:"a12",k1:"k1",k2:"k2",k3:"k3",k4:"k4",k5:"k5",k6:"k6",k7:"k7",k8:"k8",k9:"k9",k10:"k10",k11:"k11",k12:"k12"};
const FBG={eng:'bg_eng',ast:'bg_ast',kee:'bg_kee'},AV={eng:'e10',ast:'a10',kee:'k10'};
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
// ---- Астромантка: адаптация, манипуляция + темп ----
{id:'a1',f:'ast',name:'Звёздная пыль',cost:1,power:2,icon:'✨',text:'Классовая карта. При раскрытии: возьми карту.',onReveal:c=>draw(c.owner)},
{id:'a2',f:'ast',name:'Чёрный кот',cost:1,power:2,icon:'🐈‍⬛',text:'Темповая карта. При раскрытии: следующая сыгранная тобой карта стоит на 1 меньше.',onReveal:c=>{G.discount[c.owner]=1;}},
{id:'a3',f:'ast',name:'Гадалка',cost:2,power:2,icon:'🔮',text:'Классовая карта. При раскрытии: следующая карта соперника стоит на 1 энергию больше.',onReveal:c=>{G.surcharge[other(c.owner)]=1;say('⛓ Следующая карта соперника стоит на +1 энергию');}},
{id:'a4',f:'ast',name:'Комета',cost:2,power:3,icon:'☄️',text:'Темповая карта. При раскрытии: +2 силы, если у тебя есть карта в другой локации.',onReveal:c=>{if(allRev(c.owner).some(t=>t!==c&&t.lane!==c.lane))buff(c,2);}},
{id:'a5',f:'ast',name:'Лунная сова',cost:3,power:2,icon:'🦉',text:'Классовая карта. Если это не финальный ход, выбери открытую локацию: соперник не сможет выкладывать туда карты на следующем ходу.'},
{id:'a6',f:'ast',name:'Астролябия',cost:3,power:3,icon:'🧭',text:'Темповая карта. В конце каждого хода: +1 силы себе.',endTurn:c=>buff(c,1)},
{id:'a7',f:'ast',name:'Галактика',cost:4,power:5,icon:'🌌',text:'Классовая карта. Если это не финальный ход, выбери локацию: её правило не действует на следующем ходу.'},
{id:'a8',f:'ast',name:'Звездопад',cost:4,power:6,icon:'🌠',text:'Темповая карта. При раскрытии: +2 силы, если ты проигрываешь эту локацию.',onReveal:c=>{if(laneTotal(c.lane,c.owner)<laneTotal(c.lane,other(c.owner)))buff(c,2);}},
{id:'a9',f:'ast',name:'Колесо судьбы',cost:5,power:5,icon:'🎡',text:'Классовая карта. При раскрытии: +2 силы одной своей раскрытой карте в каждой другой локации.'},
{id:'a10',f:'ast',name:'Астромантка',cost:5,power:4,icon:'🧙‍♀️',hero:1,text:'Классовая карта. При раскрытии: выбери одну из трёх верхних карт своей колоды. Затем посмотри руку соперника, сбрось выбранную карту; соперник добирает случайную.',},
{id:'a11',f:'ast',name:'Туманность',cost:6,power:10,icon:'🌫️',text:'Темповая карта. Без эффекта.'},
{id:'a12',f:'ast',name:'Сверхновая',cost:6,power:4,icon:'💥',text:'Классовая карта. При раскрытии: можешь переместить одну свою другую раскрытую карту в другую открытую локацию.'},
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
 {id:'fog',name:'Туманный рынок',icon:'🌁',text:'После 4-го хода сюда нельзя играть.',canPlay:turn=>turn<=4},
 {id:'treasury',name:'Сокровищница',icon:'💰',text:'В конце хода: +1 силы случайной карте каждой стороны здесь.',
  endTurn:l=>['p','e'].forEach(o=>{const t=rndOf(cardsIn(l,o));if(t)buff(t,1);})},
 {id:'arena',name:'Кривая арена',icon:'🙃',text:'Здесь побеждает тот, у кого меньше силы.',low:1},
 {id:'observatory',name:'Обсерватория',icon:'🔭',text:'Карты стоимостью 1–2 здесь +2 силы.',mod:c=>c.def.cost<=2?2:0}
];

/* ================= СОСТОЯНИЕ ================= */
let G=null,UID=1,FAST=false;
function inst(def,owner){return{uid:UID++,def,owner,lane:-1,buff:0,revealed:false,pending:false,paid:0,usedDisc:false,usedSurcharge:false,flash:null,revAt:0};}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

function newGame(pf,scenario=null){
 gameMode=scenario?'tutorial':'normal';
 const ef=scenario?scenario.opponentFaction:rndOf(Object.keys(FACTIONS).filter(f=>f!==pf));
 const locs=scenario?scenario.locations.map(id=>LOCS.find(l=>l.id===id)):shuffle([...LOCS]).slice(0,3);
 G={turn:0,fac:{p:pf,e:ef},deck:{p:[],e:[]},discard:{p:[],e:[]},hand:{p:[],e:[]},board:[[],[],[]],locs,locRev:[false,false,false],
  spent:{p:0,e:0},discount:{p:0,e:0},surcharge:{p:0,e:0},blockedUntil:{p:[0,0,0],e:[0,0,0]},locDisabledUntil:[0,0,0],trap:[{p:false,e:false},{p:false,e:false},{p:false,e:false}],phase:'plan',sel:null,info:null,busy:false};
 for(const o of ['p','e']){G.deck[o]=scenario?scenario.decks[o].map(id=>inst(CARDS.find(d=>d.id===id),o)).reverse():shuffle(CARDS.filter(c=>c.f===G.fac[o]).map(d=>inst(d,o)));for(let i=0;i<3;i++)draw(o);}
 startTurn();
}
function draw(o){if(!G.deck[o].length||G.hand[o].length>=7)return;G.hand[o].push(G.deck[o].pop());}
function cardsIn(l,o){return G.board[l].filter(c=>c.owner===o&&c.revealed);}
function allRev(o){const r=[];G.board.forEach(l=>l.forEach(c=>{if(c.revealed&&(!o||c.owner===o))r.push(c);}));return r;}
function hasLuckHero(o){return allRev(o).some(c=>c.def.id==='a10');}
function luck(o){return hasLuckHero(o)||Math.random()<.5;}
function loc(l){return G.locRev[l]?G.locs[l]:null;}
function locationRuleDisabled(l,turn=G.turn){return G.locDisabledUntil[l]===turn;}
function power(c){
 if(!c.revealed)return c.def.power+c.buff;
 let p=c.def.power+c.buff;
 for(const s of allRev())if(s.def.ongoing)p+=s.def.ongoing(s,c);
 const L=loc(c.lane);if(L&&!locationRuleDisabled(c.lane)&&L.mod)p+=L.mod(c);
 return p;
}
function laneTotal(l,o){return cardsIn(l,o).reduce((s,c)=>s+power(c),0);}
function laneWinner(l){const p=laneTotal(l,'p'),e=laneTotal(l,'e');if(p===e)return null;const low=loc(l)&&!locationRuleDisabled(l)&&loc(l).low;return (p>e)!==!!low?'p':'e';}
function buff(c,n){if(!n||!c)return;c.buff+=n;c.flash={t:(n>0?'+':'')+n,up:n>0,at:now()};}
function destroy(c){const a=G.board[c.lane];const i=a.indexOf(c);if(i>=0)a.splice(i,1);c.lane=-1;say(`💥 «${c.def.name}» уничтожена`);}
const now=()=>typeof performance!=='undefined'?performance.now():Date.now();
let logLines=[];
function say(t){logLines.push(t);if(logLines.length>2)logLines.shift();}

function effCost(o,c){return Math.max(0,c.def.cost-(G.discount[o]?1:0)+(G.surcharge[o]||0));}
function capOf(l,turn=G.turn){const L=loc(l);return L&&!locationRuleDisabled(l,turn)&&L.cap?L.cap:4;}
function canPlay(o,l,turn=G.turn){if(G.blockedUntil[o][l]===turn)return false;const L=loc(l);if(L&&!locationRuleDisabled(l,turn)&&L.canPlay&&!L.canPlay(turn))return false;
 return G.board[l].filter(c=>c.owner===o).length<capOf(l,turn);}
function moveCard(c,l){if(!c||c.lane<0||c.lane===l||!canPlay(c.owner,l))return false;const from=G.board[c.lane],i=from.indexOf(c);if(i<0)return false;from.splice(i,1);G.board[l].push(c);c.lane=l;say(`↔️ «${c.def.name}» перемещена в ${loc(l).name}`);return true;}
function place(o,c,l){
 if(gameMode==='tutorial'&&!Tutorial.beforePlace(o,c,l))return false;
 const cost=effCost(o,c);c.paid=cost;c.usedDisc=!!G.discount[o]&&c.def.cost>0;c.usedSurcharge=(G.surcharge[o]||0)>0;if(c.usedDisc)G.discount[o]=0;if(c.usedSurcharge)G.surcharge[o]=0;
 G.spent[o]+=cost;G.hand[o].splice(G.hand[o].indexOf(c),1);c.lane=l;c.pending=true;G.board[l].push(c);
 if(gameMode==='tutorial'&&o==='p')Tutorial.placed();
 return true;
}
function unplace(c){if(gameMode==='tutorial'&&(!c.pending||G.phase!=='plan'))return false;const o=c.owner;G.board[c.lane].splice(G.board[c.lane].indexOf(c),1);c.lane=-1;c.pending=false;
 G.spent[o]-=c.paid;if(c.usedDisc){G.discount[o]=1;c.usedDisc=false;}if(c.usedSurcharge){G.surcharge[o]=1;c.usedSurcharge=false;}G.hand[o].push(c);if(gameMode==='tutorial'&&o==='p')Tutorial.undone();}

function startTurn(){
 G.turn++;G.spent={p:0,e:0};
 if(G.turn<=3){G.locRev[G.turn-1]=true;}
 draw('p');draw('e');
 if(gameMode==='tutorial'){Tutorial.turn();Tutorial.opponent();}else aiPlan('e');
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
    if(L&&!locationRuleDisabled(l)&&L.low)s-=6;
    if(diff<-12)s-=3;else if(diff<=3)s+=3;else if(diff>9)s-=3;
    const n=G.board[l].filter(x=>x.owner===o).length;
    if(c.def.tag==='ally')s+=n*1.6-1;
    if(c.def.tag==='foe')s+=cardsIn(l,foe).length?3:-4;
    if(c.def.art&&G.board[l].some(x=>x.owner===o&&(x.def.id==='e6'||x.def.id==='e5')))s+=1.5;
    if(L&&!locationRuleDisabled(l)&&L.mod)s+=L.mod(c);
    if(L&&!locationRuleDisabled(l)&&L.id==='forge')s+=1;
    opts.push({c,l,s});}}
  if(!opts.length)break;
  opts.sort((a,b)=>b.s-a.s);place(o,opts[0].c,opts[0].l);
 }
}

/* ================= ПРОКРУТКА КОЛОДЫ АСТРОМАНТКИ ================= */
let astroChoice=null;
function finishAstroChoice(value){
 if(!astroChoice)return;
 const resolve=astroChoice.resolve;astroChoice=null;G.info=null;render();resolve(value);
}
function astroChoiceHtml(){
 if(!astroChoice)return '';
 const c=astroChoice,title=escapeHtml(c.title);
 let options='';
 if(c.kind==='list-card')options=`<div class="astro-inline-options">${c.cards.map((card,i)=>`<button class="astro-inline-option" data-i="${i}" type="button"><b>${card.def.icon||'✦'} ${escapeHtml(card.def.name)}</b><span>⚡ ${card.def.cost} · ⚔ ${card.def.power}</span><small>${escapeHtml(card.def.text||'Без эффекта.')}</small></button>`).join('')}</div>`;
 const prompt=c.kind==='board-card'?'Нажми на подсвеченную карту на столе.':c.kind==='lane'?'Нажми на одну из подсвеченных локаций.':'Выбери карту из списка.';
 return `<section class="astro-inline"><header><b>${title}</b><span>${prompt}</span></header>${options}${c.optional?'<button class="astro-skip" type="button">Оставить как есть</button>':''}</section>`;
}
function chooseAstroCard(title,cards,owner,scoreFn,optional=false){
 if(!cards.length)return Promise.resolve(null);
 const score=scoreFn||((c)=>c.def.power+c.def.cost*.75);
 if(owner!=='p'||!HAS_DOM)return Promise.resolve(cards.reduce((best,c)=>!best||score(c)>score(best)?c:best,null));
 const boardCards=cards.every(c=>c.revealed&&c.lane>=0);
 return new Promise(resolve=>{
  astroChoice={kind:boardCards?'board-card':'list-card',title,cards,resolve,optional};
  G.info=null;render();
 });
}
function takeTopOptions(owner,count,chosen,restToBottom=true){
 const deck=G.deck[owner],opts=deck.splice(Math.max(0,deck.length-count));
 if(!opts.length)return null;
 const c=chosen?chosen(opts,owner):opts.reduce((best,x)=>!best||x.def.power+x.def.cost*.75>best.def.power+best.def.cost*.75?x:best,null);
 if(c){if(G.hand[owner].length<7)G.hand[owner].push(c);else deck.push(c);}
 const rest=opts.filter(x=>x!==c);
 if(restToBottom)deck.unshift(...rest);else deck.push(...rest);
 return c;
}
function chooseAstroLane(title,lanes,owner,scoreFn,optional=false){
 if(!lanes.length)return Promise.resolve(null);
 const score=scoreFn||(()=>0);
 if(owner!=='p'||!HAS_DOM)return Promise.resolve(lanes.reduce((best,l)=>best===null||score(l)>score(best)?l:best,null));
 return new Promise(resolve=>{
  astroChoice={kind:'lane',title,lanes,resolve,optional};
  G.info=null;render();
 });
}
function escapeHtml(value){return String(value).replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));}
function astroLaneScore(l,owner,mode){
 const foe=other(owner),diff=laneTotal(l,owner)-laneTotal(l,foe),L=loc(l);
 if(mode==='block')return cardsIn(l,foe).length*2+(Math.abs(diff)<=6?4:0)+laneTotal(l,foe)*.05;
 if(mode==='suppress'){const w={arena:8,tower:7,fog:6,well:5,forge:4,observatory:4,treasury:3,library:2,waste:2};return (w[L.id]||0)+(Math.abs(diff)<=8?2:0);}
 return -Math.abs(diff)+(laneWinner(l)===owner?1:0);
}
function openMoveLanes(owner,from){return [0,1,2].filter(l=>G.locRev[l]&&l!==from&&canPlay(owner,l));}
async function resolveAstroCard(c){
 const o=c.owner,foe=other(o),id=c.def.id;
 if(id==='a5'&&G.turn<6){
  const lanes=[0,1,2].filter(l=>G.locRev[l]&&canPlay(foe,l,G.turn+1));
  const target=await chooseAstroLane('Лунная сова: выбери локацию для блока',lanes,o,l=>astroLaneScore(l,o,'block'));
  if(target!==null){G.blockedUntil[foe][target]=G.turn+1;say(`⛔ Соперник не сможет играть в ${loc(target).name} на следующем ходу`);}
 }
 if(id==='a7'&&G.turn<6){
  const lanes=[0,1,2].filter(l=>G.locRev[l]);
  const target=await chooseAstroLane('Галактика: выбери правило для отключения',lanes,o,l=>astroLaneScore(l,o,'suppress'));
  if(target!==null){G.locDisabledUntil[target]=G.turn+1;say(`⏸ Правило локации «${loc(target).name}» отключено на следующем ходу`);}
 }
 if(id==='a9'){
  for(const lane of [0,1,2].filter(l=>l!==c.lane)){
   const targets=cardsIn(lane,o);
   if(!targets.length)continue;
   const target=await chooseAstroCard(`Колесо судьбы: выбери карту в локации «${loc(lane).name}»`,targets,o,t=>{
    const diff=laneTotal(lane,o)-laneTotal(lane,foe);
    return -Math.abs(diff)+(diff<0?1:0)+(laneWinner(lane)===o?0.25:0);
   });
   if(target){buff(target,2);say(`🎡 «${target.def.name}» получила +2 силы`);}
  }
 }
 if(id==='a10'){
  const n=3,opts=G.deck[o].slice(-n);
  if(opts.length){const choice=await chooseAstroCard('Астромантка: выбери карту',opts,o);takeTopOptions(o,n,()=>choice);}
  if(G.hand[foe].length){
   const target=await chooseAstroCard('Астромантка: выбери карту соперника для сброса',G.hand[foe],o,x=>x.def.cost+power(x)*.5);
   if(target){G.hand[foe].splice(G.hand[foe].indexOf(target),1);G.discard[foe].push(target);draw(foe);}
  }
 }
 if(id==='a12'){
  const sources=allRev(o).filter(t=>t!==c&&openMoveLanes(o,t.lane).length);
  if(sources.length){
   const source=await chooseAstroCard('Сверхновая: выбери свою карту для перемещения',sources,o,t=>{
    const lanes=openMoveLanes(o,t.lane);
    const best=lanes.reduce((score,l)=>Math.max(score,astroLaneScore(l,o,'move')),0);
    return power(t)+best*.15;
   },true);
   if(source){
    const lanes=openMoveLanes(o,source.lane);
    const target=await chooseAstroLane('Сверхновая: выбери новую локацию',lanes,o,l=>astroLaneScore(l,o,'move'),true);
    if(target!==null)moveCard(source,target);
   }
  }
 }
}
/* ================= РАСКРЫТИЕ ================= */
const sleep=ms=>FAST?Promise.resolve():new Promise(r=>setTimeout(r,ms));
async function endTurn(){
 if(G.phase!=='plan')return;
 if(gameMode==='tutorial'&&!Tutorial.canEnd()){tutorialState.error='Сначала выполни подсвеченное действие.';render();return;}
 const session=G;
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
  const L=loc(c.lane);if(L&&!locationRuleDisabled(c.lane)&&L.onPlay)L.onPlay(c);
  if(c.def.onReveal&&c.lane>=0)c.def.onReveal(c);
  if(c.def.f==='ast'&&['a3','a5','a7','a9','a10','a12'].includes(c.def.id))await resolveAstroCard(c);
  render();await sleep(650);if(G!==session)return;
 }
 let any=false;
 for(const c of allRev())if(c.def.endTurn){c.def.endTurn(c);any=true;}
 for(let l=0;l<3;l++){const L=loc(l);if(L&&!locationRuleDisabled(l)&&L.endTurn){L.endTurn(l);any=true;}}
 if(any){render();await sleep(500);if(G!==session)return;}
 if(gameMode==='tutorial'){Tutorial.afterReveal();return;}
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
 if(gameMode==='tutorial'){Tutorial.finish(w,lanes);return;}
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
 const astroTarget=astroChoice&&astroChoice.kind==='board-card'&&astroChoice.cards.some(x=>x.uid===c.uid);
 return `<div class="mc f-${c.def.f}${c.pending?' pending':''}${pop}${astroTarget?' astro-card-target':''}" data-uid="${c.uid}">${face(c.def)}<span class="cost">${c.def.cost}</span><span class="pw ${d>0?'up':d<0?'dn':''}">${p}</span>${fl}</div>`;
}
function slots(l,o){const cs=G.board[l].filter(c=>c.owner===o);const cap=capOf(l);let h='';
 for(let i=0;i<4;i++){if(cs[i])h+=miniCard(cs[i]);else h+=i<cap?'<div class="slot"></div>':'<div class="slot" style="border:none"></div>';}
 return `<div class="slots">${h}</div>`;}
function tableDeck(owner){
 const n=G.deck[owner].length;
 return '<div class="table-deck'+(n?'':' empty')+'" role="img" aria-label="Колода: '+n+' карт"><span>'+n+'</span></div>';
}
function tableReserves(){
 return '<div class="opponent-fan" role="img" aria-label="Рука соперника: '+G.hand.e.length+' карт">'+G.hand.e.map((_,i)=>'<i class="card-back" style="--i:'+i+';--n:'+G.hand.e.length+'"></i>').join('')+'</div>'+tableDeck('e');
}
function render(){
 if(!HAS_DOM||!G)return;
 const PF=FACTIONS[G.fac.p],EF=FACTIONS[G.fac.e];
 $('opponentReserve').innerHTML=tableReserves();
 $('playerDeck').innerHTML=tableDeck('p');
 $('eWho').innerHTML=`${avImg(G.fac.e)}<b>${EF.name}</b><span class="muted">рука ${G.hand.e.length} · колода ${G.deck.e.length}</span>`;
 $('pWho').innerHTML=`${avImg(G.fac.p)}<b>${PF.name}</b><span class="muted">колода ${G.deck.p.length}</span>`;
 $('turn').textContent=`Ход ${G.turn}/6`;
 const sel=G.sel&&G.hand.p.find(c=>c.uid===G.sel);
 let b='';
 for(let l=0;l<3;l++){
  const L=loc(l),wp=laneWinner(l),blocked=G.blockedUntil.p[l]===G.turn,foeBlocked=G.blockedUntil.e[l]===G.turn,suppressed=L&&locationRuleDisabled(l);
  const astroLaneTarget=astroChoice&&astroChoice.kind==='lane'&&astroChoice.lanes.includes(l);
  const can=sel&&G.phase==='plan'&&canPlay('p',l)&&effCost('p',sel)<=G.turn-G.spent.p;
  const status=blocked?'⛔ Ты не можешь играть здесь в этом ходу.':foeBlocked?'⛔ Соперник не может играть здесь в этом ходу.':suppressed?'⏸ Правило отключено на этот ход.':'';
  b+=`<div class="lane${can?' can':''}${blocked?' locked':''}${astroLaneTarget?' astro-lane-target':''}" data-l="${l}">${slots(l,'e')}
   <div class="loc${L?'':' hidden'}${blocked?' blocked':''}${suppressed?' suppressed':''}" data-l="${l}" style="${L?`background:linear-gradient(#160f0950,#160f09bb),url(${IMG[LOCIMG[L.id]]}) center/cover`:''}"><div class="sc${wp==='e'?' win':''}">${laneTotal(l,'e')}</div>
   <div class="ln">${L?L.name:'Неизведанная земля'}</div><div class="lt">${L?L.text+(status?'<br>'+status:''):'Откроется на ходу '+(l+1)}</div>
   <div class="sc${wp==='p'?' win':''}">${laneTotal(l,'p')}</div></div>${slots(l,'p')}</div>`;}
 $('board').innerHTML=b;
 $('log').textContent=logLines.join(' · ');
 const left=G.turn-G.spent.p;
 $('energy').textContent=`Энергия ${left}/${G.turn}${G.surcharge.p?' · +1 к следующей карте':''}`;
 $('end').disabled=G.phase!=='plan';
 $('end').textContent=G.phase==='plan'?(G.turn===6?'Финальный ход':'Завершить ход'):'Раскрытие…';
 $('hand').innerHTML=G.hand.p.map(c=>{const ec=effCost('p',c);
  return `<div role="button" tabindex="0" aria-label="${c.def.name}, энергия ${ec}, сила ${c.def.power}" class="hc f-${c.def.f}${G.sel===c.uid?' sel':''}${ec>left?' dim':''}" data-uid="${c.uid}">${face(c.def)}<span class="cost${ec<c.def.cost?' cheap':ec>c.def.cost?' taxed':''}">${ec}</span><div class="nm">${c.def.name}</div><span class="pw">${c.def.power}</span></div>`;}).join('')||'<div style="color:var(--mut);font-size:12px;padding:30px 6px">Рука пуста</div>';
 const ic=G.info;
 $('info').innerHTML=astroChoice?astroChoiceHtml():ic?ic:(G.phase==='plan'?'Выбери карту в руке, затем нажми на локацию. Нажми на свою выложенную карту, чтобы вернуть её в руку. Карты раскрываются в конце хода.':'Карты раскрываются…');
 renderCoach();
}
function findCard(uid){for(const l of G.board)for(const c of l)if(c.uid===uid)return c;return G.hand.p.find(c=>c.uid===uid);}

if(HAS_DOM){
 $('hand').addEventListener('click',e=>{const el=e.target.closest('.hc');if(!el||!G||G.phase!=='plan'||Date.now()<suppressClickUntil)return;const uid=+el.dataset.uid;
  const c=G.hand.p.find(x=>x.uid===uid);G.sel=G.sel===uid?null:uid;G.info=cardInfo(c);render();});
 $('board').addEventListener('click',e=>{if(!G||Date.now()<suppressClickUntil)return;
  const mc=e.target.closest('.mc');const lane=e.target.closest('.lane');const l=lane?+lane.dataset.l:-1;
  if(astroChoice){
   if(astroChoice.kind==='board-card'&&mc){const card=findCard(+mc.dataset.uid);if(astroChoice.cards.includes(card)){finishAstroChoice(card);return;}}
   if(astroChoice.kind==='lane'&&lane&&astroChoice.lanes.includes(l)){finishAstroChoice(l);return;}
   return;
  }
  const sel=G.sel&&G.hand.p.find(c=>c.uid===G.sel);
  if(sel&&l>=0&&G.phase==='plan'){
   if(!canPlay('p',l)){G.info='Сюда сейчас нельзя сыграть карту.';render();return;}
   if(effCost('p',sel)>G.turn-G.spent.p){G.info='Не хватает энергии ⚡';render();return;}
   place('p',sel,l);tutorialEvent('place');G.sel=null;G.info=cardInfo(sel);render();return;}
  if(mc){const c=findCard(+mc.dataset.uid);if(!c)return;
   if(c.owner==='p'&&c.pending&&G.phase==='plan'){unplace(c);tutorialEvent('undo');G.info=`«${c.def.name}» возвращена в руку.`;render();return;}
   G.info=(c.owner==='e'&&!c.revealed)?'Карта врага ещё не раскрыта.':cardInfo(c);render();return;}
  const lc=e.target.closest('.loc');if(lc){const L=loc(+lc.dataset.l);G.info=L?`<b>${L.icon} ${L.name}</b><br>${L.text}`:'Локация откроется позже.';render();}
 });
 $('info').addEventListener('click',e=>{if(!astroChoice)return;const skip=e.target.closest('.astro-skip');if(skip&&astroChoice.optional){finishAstroChoice(null);return;}const option=e.target.closest('.astro-inline-option');if(option&&astroChoice.kind==='list-card'){const card=astroChoice.cards[+option.dataset.i];if(card)finishAstroChoice(card);}});
 $('end').onclick=()=>{tutorialEvent('end');G.info=null;endTurn();};
 $('helpBtn').onclick=()=>{tutorialActive=true;tutorialStep=G&&G.board.some(l=>l.some(c=>c.owner==='p'&&c.pending))?2:0;render();};
 $('hand').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.closest('.hc')){e.preventDefault();e.target.closest('.hc').click();}});
 $('libBtn').onclick=()=>library(G?G.fac.p:'eng','game');
}
function openOv(h){$('ov').classList.remove('splash-overlay');$('ovbox').classList.remove('hero-box','splash-box');$('ovbox').innerHTML=h;$('ov').classList.remove('hide');}
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
// Presentation and guidance state never participates in card effects or scoring.
let pickedHero='eng',tutorialActive=false,tutorialStep=0,suppressClickUntil=0;
const tutorialSeen=()=>{try{return localStorage.getItem('gifted-tutorial-v1')==='done';}catch{return false;}};
function finishTutorial(){tutorialActive=false;try{localStorage.setItem('gifted-tutorial-v1','done');}catch{}renderCoach();}
function tutorialEvent(event){
 if(!tutorialActive)return;
 if(event==='place'&&tutorialStep<2)tutorialStep=2;
 else if(event==='undo'&&tutorialStep===2)tutorialStep=3;
 else if(event==='end'&&tutorialStep>=2)tutorialStep=4;
}
function renderCoach(){
 if(gameMode==='tutorial'&&HAS_DOM&&G){Tutorial.render();return;}
 if(!HAS_DOM)return;const el=$('coach');if(!el)return;
 el.classList.toggle('hide',!tutorialActive||!G);
 document.querySelectorAll('.teach').forEach(e=>e.classList.remove('teach'));
 if(!tutorialActive||!G)return;
 let title,body,target;
 if(G.phase==='over'){title='Матч завершён';body='Сравни силу в трёх локациях. При равенстве числа выигранных локаций решает общая сила.';}
 else if(G.phase==='reveal'){title='Карты раскрываются';body='Теперь срабатывают эффекты карт и локаций. Следи за изменением силы.';}
 else if(tutorialStep>=4){title=`Ход ${G.turn} из 6`;body='Энергия обновилась. Локации открываются на ходах 1–3. Забери большинство; на Кривой арене выигрывает меньшая сила.';target='board';}
 else if(!G.hand.p.some(c=>effCost('p',c)<=G.turn-G.spent.p)&&!G.board.some(l=>l.some(c=>c.owner==='p'&&c.pending))){title='Сейчас не хватает энергии';body='Можно пропустить ход. На следующем ходу энергии станет больше, и ты возьмёшь ещё карту.';target='end';}
 else if(tutorialStep===2){title='Попробуй вернуть карту';body='До раскрытия нажми на свою выложенную карту или потяни её вниз в руку. Энергия вернётся.';target='board';}
 else if(tutorialStep===3){title='Заверши подготовку';body='Сыграй карту снова. Когда всё готово, нажми «Завершить ход». Враг тоже готовит карты скрытно.';target='end';}
 else if(G.sel){title='Выбери локацию';body='Нажми на подсвеченную локацию. Можно также потянуть карту из руки вверх и отпустить над нужной локацией.';target='board';}
 else{title='Выбери карту';body='Синее число — стоимость, светлое — сила. Нажми на доступную карту в руке. Цель — выиграть больше локаций, чем соперник.';target='hand';}
 if(target)$(target).classList.add('teach');
 el.innerHTML=`<div><small>ОБУЧЕНИЕ</small><b>${title}</b><p>${body}</p></div><button class="coach-close" aria-label="Завершить обучение">${G.phase==='over'?'Понятно':'Пропустить'}</button>`;
 el.querySelector('button').onclick=finishTutorial;
}
function startMatch(training){gameMode='normal';if(HAS_DOM)document.body.classList.remove('first-battle');closeOv();logLines=[];tutorialActive=training;tutorialStep=0;newGame(pickedHero);}
function splashScreen(){
 openOv(`<section class="splash splash-poster" aria-label="Постер Game of Gifts">
 <img class="splash-poster-art" src="assets/ui/splash-poster-v2.webp" alt="Инженер заносит карту, Астромантка сидит за столом с колодой, Хранитель закрывает лицо веером карт">
 <nav class="splash-actions" aria-label="Главное меню">
 <button class="menu-action" id="splashPlay">Игра</button>
 <button class="menu-action" id="firstBattle">Обучение</button>
 ${Tutorial.completed()?'':'<small class="menu-recommendation">Впервые здесь? Начни с обучения «Первая битва»</small>'}
 </nav>
 </section>`);
 $('ovbox').classList.add('splash-box');
 $('ov').classList.add('splash-overlay');
 $('splashPlay').onclick=heroPick;
 $('firstBattle').onclick=()=>Tutorial.intro();
}
function heroPick(){
 openOv(`<div class="pick-heading"><small>GAME OF GIFTS</small><h2>Выбери своего героя</h2><p>Три стиля игры. Шесть ходов. Одна победа.</p></div>
 <div class="heroes">${Object.entries(FACTIONS).map(([k,F])=>`<button class="hero hero-card" data-f="${k}" aria-pressed="${k===pickedHero}" style="--hero-color:${F.color}"><img src="${IMG[AV[k]]}" alt=""><div class="hero-copy"><small>${k==='eng'?'СОЗИДАНИЕ':k==='ast'?'ЗВЁЗДНАЯ МАГИЯ':'ТЕНЕВОЙ КОНТРОЛЬ'}</small><b>${F.name}</b><span>${F.desc}</span><em>${k===pickedHero?'Выбран':'Выбрать'}</em></div></button>`).join('')}</div>
 <div class="pick-actions"><button class="btn" id="startMatch">В бой · ${FACTIONS[pickedHero].name}</button><button class="btn sec" id="pickLib">Все карты</button></div><p class="pick-rule">Выиграй большинство локаций. При равенстве решает общая сила.</p>`);
 $('ovbox').classList.add('hero-box');
 document.querySelectorAll('.hero').forEach(b=>b.onclick=()=>{pickedHero=b.dataset.f;heroPick();});
 $('startMatch').onclick=()=>startMatch(false);
 $('pickLib').onclick=()=>library(pickedHero,'pick');
}
// An upward drag plays a hand card; horizontal swipes remain native hand scrolling.
function installGestures(){
 let drag=null;
 function clear(){if(drag&&drag.ghost)drag.ghost.remove();drag=null;document.querySelectorAll('.drop-target').forEach(e=>e.classList.remove('drop-target'));}
 $('app').addEventListener('pointerdown',e=>{
  if(!G||G.phase!=='plan'||!e.isPrimary||e.button!==0||!$('ov').classList.contains('hide'))return;
  const card=e.target.closest('#hand .hc, #board .mc');if(!card)return;
  const c=findCard(+card.dataset.uid);if(!c||c.owner!=='p'||(c.lane>=0&&!c.pending))return;
  drag={id:e.pointerId,x:e.clientX,y:e.clientY,c,source:card,ghost:null};
 });
 window.addEventListener('pointermove',e=>{
  if(!drag||drag.id!==e.pointerId)return;
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(!drag.ghost){
   if(Math.abs(dx)>18&&Math.abs(dx)>Math.abs(dy)){clear();return;}
   if(Math.abs(dy)<14)return;
   if(drag.c.lane<0&&dy>0){clear();return;}
   drag.ghost=drag.source.cloneNode(true);drag.ghost.classList.add('drag-ghost');drag.ghost.removeAttribute('tabindex');drag.ghost.setAttribute('aria-hidden','true');document.body.append(drag.ghost);
   suppressClickUntil=Date.now()+500;
  }
  drag.ghost.style.left=(e.clientX-32)+'px';drag.ghost.style.top=(e.clientY-45)+'px';
  document.querySelectorAll('.drop-target').forEach(el=>el.classList.remove('drop-target'));
  const target=document.elementFromPoint(e.clientX,e.clientY);
  const lane=target&&target.closest('.lane');
  if(drag.c.lane<0&&lane&&canPlay('p',+lane.dataset.l)&&effCost('p',drag.c)<=G.turn-G.spent.p)lane.classList.add('drop-target');
  if(drag.c.pending&&target&&target.closest('#hand'))$('hand').classList.add('drop-target');
 },{passive:true});
 window.addEventListener('pointerup',e=>{
  if(!drag||drag.id!==e.pointerId)return;
  if(drag.ghost){
   suppressClickUntil=Date.now()+500;
   const c=drag.c,target=document.elementFromPoint(e.clientX,e.clientY),lane=target&&target.closest('.lane');
   if(G.phase==='plan'&&c.lane<0&&lane){const l=+lane.dataset.l;if(canPlay('p',l)&&effCost('p',c)<=G.turn-G.spent.p){place('p',c,l);tutorialEvent('place');G.sel=null;G.info=cardInfo(c);}else G.info='Сюда нельзя сыграть карту: проверь энергию и свободные места.';}
   else if(G.phase==='plan'&&c.pending&&target&&target.closest('#hand')){unplace(c);tutorialEvent('undo');G.info='Карта возвращена в руку.';}
   clear();render();
  }else clear();
 });
 window.addEventListener('pointercancel',clear);window.addEventListener('blur',clear);
}
if(HAS_DOM){installGestures();splashScreen();}
