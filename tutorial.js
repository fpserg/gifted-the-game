/* Scenario only. Card effects, power and victory belong to game.js. */
let gameMode = 'normal';
const tutorialScenario = {
 id:'first-battle-v1', playerFaction:'eng', opponentFaction:'kee', locations:['forge','library','tower'],
 // Draw order (the engine draws from the end of the reversed arrays).
 decks:{p:['e1','e3','e5','e8','e10','e11','e2','e4','e6','e7','e9','e12'],e:['k2','k4','k5','k7','k9','k11','k1','k3','k6','k8','k10','k12']},
 rounds:[['e1',0,'k2',0],['e3',1,'k4',0],['e5',1,'k5',1],['e8',0,'k7',0],['e10',1,'k9',1],['e11',2,'k11',2]],
 titles:['Первый подарок','Сила меняется','Комбинации карт','Основа для возвращения','Сила героя','Последний сюрприз'],
 lessons:[
 'Внизу твои карты. Синее число — стоимость, светлое — сила. Выбери Подарочный ящик.',
 'Песочные часы получают +1 силы в конце каждого хода. Сыграй их в Библиотеке: при раскрытии она даст ещё одну карту.',
 'Золотая утка усиливает другие твои артефакты на 1, даже в других локациях. Сыграй её рядом с часами; Башня вмещает только две карты на сторону.',
 'Иногда лучше сыграть одну мощную карту. Отправь Хрустальный купол в Кузню.',
 'Инженер на поле усиливает все твои артефакты на 2. Сыграй героя в Библиотеке и после раскрытия посмотри на Купол в Кузне.',
 'Последний ход! Попробуем захватить Башню? Сыграй Дерево-остров.'
 ],
 reviews:[
 'Первая победа в локации! Кузня дала подарку +1 силы. Впереди ещё пять ходов.',
 'Ворон ослабил подарок на 2, и Хранитель перехватил Кузню. Но часы растут каждый ход: иногда стоит думать о будущем.',
 'Утка помогает нашим артефактам, а Маска ослабляет наши карты в Библиотеке. Мы всё ещё контролируем Библиотеку.',
 'Палач уничтожил наш первый подарок! Купол цел: благодаря Утке в Кузне сейчас ничья. Мы подготовили основу для победы здесь.',
 'Мы контролируем Кузню и Библиотеку! Тюремщик снял накопленные бонусы часов, но постоянные эффекты Инженера и Утки продолжают работать.',
 'О нет! Чёрный рынок уничтожил Дерево-остров! Посмотри на контроль остальных локаций и нажми «Продолжить».'
 ]
};
let tutorialState = null;
const Tutorial = {
 completed(){try{return localStorage.getItem('tutorialCompleted')==='true';}catch{return false;}},
 intro(){
  openOv(`<div class="lesson-intro"><img src="assets/cards/e10.webp" alt="Инженер"><h2>Первая битва</h2><p>Привет! Добро пожаловать в Game of Gifts! Я покажу тебе, как управлять картами, использовать волшебные артефакты и побеждать соперников. Готов?</p><button class="btn" id="lessonStart">Начать обучение</button><button class="btn sec" id="lessonMenu">Выйти в меню</button></div>`);
  $('lessonStart').onclick=()=>this.start();$('lessonMenu').onclick=()=>this.menu();
 },
 start(){gameMode='tutorial';tutorialState={step:'card',undone:false,error:'',history:[]};tutorialActive=false;logLines=[];if(HAS_DOM){closeOv();document.body.classList.add('first-battle');}newGame('eng',tutorialScenario);},
 round(){return tutorialScenario.rounds[G.turn-1];},
 beforePlace(o,c,l){
  if(o!=='p')return true;
  const [id,lane]=this.round();
  if(G.phase!=='plan'||tutorialState.step==='review'||c.def.id!==id||l!==lane||!G.locRev[l]||!canPlay(o,l)||effCost(o,c)>G.turn-G.spent[o]||!G.hand[o].includes(c)){
   tutorialState.error=`Сейчас разыграй «${CARDS.find(d=>d.id===id).name}» в локации «${G.locs[lane].name}». Другие карты можно осмотреть.`;return false;
  }
  tutorialState.error='';return true;
 },
 placed(){tutorialState.step=G.turn===1&&!tutorialState.undone?'undo':'ready';},
 undone(){tutorialState.undone=true;tutorialState.step='card';tutorialState.error='';},
 canEnd(){return tutorialState.step==='ready'&&G.board[this.round()[1]].some(c=>c.owner==='p'&&c.pending&&c.def.id===this.round()[0]);},
 opponent(){const r=this.round(),c=G.hand.e.find(c=>c.def.id===r[2]);if(!c)throw Error('Missing scripted opponent card');place('e',c,r[3]);},
 turn(){tutorialState.step='card';tutorialState.error='';},
 afterReveal(){tutorialState.history.push([0,1,2].map(l=>[laneTotal(l,'p'),laneTotal(l,'e')]));tutorialState.step='review';G.phase='lesson';render();},
 next(){if(tutorialState.step!=='review')return; if(G.turn===6)finish();else startTurn();},
 menu(){G=null;gameMode='normal';tutorialState=null;tutorialActive=false;if(HAS_DOM){document.body.classList.remove('first-battle');$('coach').classList.add('hide');splashScreen();}},
 exit(){openOv('<h2>Выйти из обучения?</h2><p>При следующем запуске начнём с первого хода.</p><button class="btn" id="lessonLeave">Выйти в меню</button><button class="btn sec" id="lessonStay">Продолжить обучение</button>');$('lessonLeave').onclick=()=>this.menu();$('lessonStay').onclick=closeOv;},
 finish(w,lanes){
  const won=G.result==='p';if(won)try{localStorage.setItem('tutorialCompleted','true');}catch{}
  if(!HAS_DOM)return;
  openOv(`<h2>${won?'Первая победа!':'Учебная партия завершена'}</h2><p>Кузня и Библиотека всё ещё наши. Важно выиграть больше локаций, а не обязательно победить везде.</p><div class="res">${lanes.map(x=>`<div>${x.L.name}<b>${x.p} : ${x.e}</b><span>${x.w==='p'?'Ты':x.w==='e'?'Хранитель':'Ничья'}</span></div>`).join('')}</div><p>Счёт по локациям: ${w.p}:${w.e}</p><p>Теперь ты умеешь разыгрывать карты, использовать их способности и бороться за контроль локаций. В настоящей битве соперник не будет следовать сценарию, а карты и локации выпадут случайным образом. Удачи!</p><button class="btn" id="lessonBattle">В настоящую битву</button><button class="btn sec" id="lessonRepeat">Повторить обучение</button><button class="btn sec" id="lessonHome">Главное меню</button>`);
  $('lessonBattle').onclick=()=>{this.menu();heroPick();};$('lessonRepeat').onclick=()=>this.start();$('lessonHome').onclick=()=>this.menu();
 },
 render(){
  const el=$('coach'),s=tutorialState,r=this.round();el.classList.remove('hide');
  document.querySelectorAll('.lesson-target').forEach(e=>e.classList.remove('lesson-target'));
  let body=tutorialScenario.lessons[G.turn-1],target=`#hand [data-uid="${G.hand.p.find(c=>c.def.id===r[0])?.uid}"]`;
  if(G.sel&&s.step==='card'){body=G.sel===G.hand.p.find(c=>c.def.id===r[0])?.uid?`Помести карту в «${G.locs[r[1]].name}». ${G.turn===1?'Кузня увеличит её силу на 1 при раскрытии.':''}`:'Ты можешь прочитать описание этой карты. Для сценария выбери подсвеченную карту.';if(G.sel===G.hand.p.find(c=>c.def.id===r[0])?.uid)target=`.lane[data-l="${r[1]}"]`;}
  if(s.step==='undo'){body='Передумал? До завершения хода карту можно вернуть в руку. Нажми на выложенный подарок, затем разыграй его снова.';target=`.lane[data-l="0"] .mc[data-uid="${G.board[0].find(c=>c.owner==='p'&&c.pending)?.uid}"]`;}
  if(s.step==='ready'){body='Карта подготовлена. Можно отменить её размещение или нажать «Завершить ход»: тогда сработают способности.';target='#end';}
  if(G.phase==='reveal'){body='Карты раскрываются. Следи за изменениями силы и действиями Хранителя.';target='#board';}
  if(s.step==='review'){body=tutorialScenario.reviews[G.turn-1];target='.loc .sc';}
  document.querySelectorAll(target).forEach(e=>e.classList.add('lesson-target'));
  el.innerHTML=`<img class="lesson-avatar" src="assets/cards/e10.webp" alt="Инженер"><div><small>Ход ${G.turn} из 6 · ${tutorialScenario.titles[G.turn-1]}</small><p>${body}</p>${s.error?`<p class="lesson-error">${s.error}</p>`:''}${s.step==='review'?`<p>${G.board.flat().filter(c=>c.revealed&&c.def.id==='e3').map(c=>`Песочные часы: ${power(c)} силы.`).join('')} ${G.turn===2?`Библиотека дала карту «${G.hand.p[G.hand.p.length-1].def.name}».`:''}</p><button class="btn" id="lessonNext">Продолжить</button>`:''}<button class="coach-close" id="lessonExit">Выйти из обучения</button></div>`;
  $('lessonExit').onclick=()=>this.exit();if(s.step==='review')$('lessonNext').onclick=()=>this.next();
 }
};
