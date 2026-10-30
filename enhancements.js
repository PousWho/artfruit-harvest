'use strict';
const storageKey='berry-studio-v1';
const favorites=new Set();
let favoritesOnly=false,undoDrafts=null,undoAfter=null,entryCache={},lastEntryPlant=null,storageAvailable=true;
const textValue=(v,max=200)=>typeof v==='string'?v.slice(0,max):typeof v==='number'&&Number.isFinite(v)?v:'';
try{
 const saved=JSON.parse(localStorage.getItem(storageKey)||'null');
 if(saved&&saved.version===1){
  for(const p of (Array.isArray(saved.plants)?saved.plants:[])){
   if(!p||!Number.isInteger(p.season)||!['joy','delight'].includes(p.cultivar)||typeof p.displayName!=='string'||!/^[\p{L}\p{N} ._\-]{1,30}$/u.test(p.displayName))continue;
   const id=p.season+'-'+p.cultivar+'-new-'+p.displayName,base=DATA.plants.find(b=>b.season===p.season);
   if(base&&!DATA.plants.some(b=>b.id===id))DATA.plants.push({id,season:p.season,cultivar:p.cultivar,displayName:p.displayName,label:textValue(p.label),calendar:base.calendar,history:[],versions:[],demoNew:true});
  }
  state.drafts=(Array.isArray(saved.drafts)?saved.drafts:[]).filter(d=>d&&DATA.plants.some(p=>p.id===d.plant)).map(d=>Object.fromEntries(['plant','week','date','ripe','green','flowers','leaves','stems','weight','source','note','editNote'].map(k=>[k,textValue(d[k])]).concat([['edit',d.edit===true]])));
  state.events=(Array.isArray(saved.events)?saved.events:[]).slice(0,100).filter(e=>e&&typeof e.text==='string').map(e=>({text:textValue(e.text),time:textValue(e.time,20)}));
  for(const id of Array.isArray(saved.favorites)?saved.favorites:[])if(DATA.plants.some(p=>p.id===id))favorites.add(id);
  if(saved.entries&&typeof saved.entries==='object')for(const [id,row] of Object.entries(saved.entries)){if(DATA.plants.some(p=>p.id===id)&&row&&typeof row==='object')entryCache[id]=Object.fromEntries(['week','date','ripe','green','flowers','leaves','stems','weight'].map(k=>[k,textValue(row[k],40)]));}
 }
}catch{storageAvailable=false;$('saveStatus').textContent='Локальное сохранение недоступно';}
function persist(){
 try{localStorage.setItem(storageKey,JSON.stringify({version:1,drafts:state.drafts,plants:DATA.plants.filter(p=>p.demoNew),events:state.events.slice(0,100),favorites:[...favorites],entries:entryCache}));storageAvailable=true;$('saveStatus').textContent='✓ Сохранено в этом браузере';}
 catch{storageAvailable=false;$('saveStatus').textContent='Не удалось сохранить: скачайте черновик';}
}
function rememberEntry(){const p=selected();if(!p)return;entryCache[p.id]={week:$('entryWeek').value,date:$('entryDate').value,...Object.fromEntries(metricsFields.map(([k])=>[k,$('entry-'+k).value])),weight:$('entryWeight').value};}
function restoreEntry(){const p=selected();if(lastEntryPlant===p?.id)return;lastEntryPlant=p?.id;const values=entryCache[p?.id];if(!values)return;if(Number(values.week)>=1&&Number(values.week)<=18){$('entryWeek').value=values.week;$('entryDate').value=dateFor(p,values.week);}for(const [k] of metricsFields)$('entry-'+k).value=values[k];$('entryWeight').value=values.weight;}
const baseRenderForecast=renderForecast;
renderForecast=function(){baseRenderForecast();restoreEntry();const p=selected(),v=current(),points=v.forecast,peak=points.reduce((best,r)=>!best||r.point>best.point?r:best,null);$('nextHarvest').innerHTML=peak?`${icon('leaf')}<span><b>${v.synthetic||v.illustrative?'Демоплан':'Пик впереди'} · ${dateLabel(dateFor(p,peak.week))}</b> — ${fmt(peak.point)} ягод на ${peak.week}-й неделе. ${state.drafts.some(d=>d.plant===p.id)?'Есть новые наблюдения в черновике.':'Следующий замер уточнит план сбора.'}</span><button class="btn text small" id="harvestPlanButton">План на 3 недели ↗</button>`:`${icon('leaf')}<span><b>${v.cutoff===18?'Сезон завершён':'У каждого урожая есть начало.'}</b> ${v.cutoff===18?'Вернитесь к любой неделе и посмотрите путь растения.':'Добавьте первое наблюдение, чтобы начать историю растения.'}</span>`;};
const baseSetView=setView;
setView=function(name){baseSetView(name);document.body.dataset.currentView=name;const labels={forecast:['ОТ ЦВЕТКА ДО СПЕЛОЙ ЯГОДЫ','Прогноз урожая','Всё, что растёт сегодня. Всё, что созреет завтра.'],board:['ЗАБОТА, КОТОРАЯ ПРИНОСИТ ПЛОДЫ','Сезон в ваших руках','Вся коллекция, ближайшие сборы и важные наблюдения.'],plants:['У КАЖДОГО КУСТА — СВОЯ ИСТОРИЯ','Растёт с заботой','Знакомьтесь с растениями. Наблюдайте. Замечайте главное.'],measurements:['МАЛЕНЬКИЕ НАБЛЮДЕНИЯ. БОЛЬШАЯ КАРТИНА.','Замечать каждый рост','Сохраняйте наблюдения — неделя за неделей, ягода за ягодой.'],import:['БОЛЬШЕ ДАННЫХ. ЯСНЕЕ ПЛАН.','От данных — к урожаю','Загрузите таблицу. Проверьте значения. Продолжайте наблюдать.']};if(labels[name]){const [e,t,s]=labels[name];$('eyebrow').textContent=e;$('pageTitle').textContent=t;$('pageSub').textContent=s;}document.querySelectorAll('.navbtn[data-view]').forEach(b=>b.setAttribute('aria-current',b.dataset.view===name?'page':'false'));};
const basePhotoCard=plantPhotoCard;
plantPhotoCard=function(p){return basePhotoCard(p).replace('<span class="tag gray">'+p.history.length+' замеров</span>',`<button class="favorite-btn" data-favorite="${esc(p.id)}" aria-label="${favorites.has(p.id)?'Убрать из избранного':'Закрепить'} ${esc(plantLabel(p))}" aria-pressed="${favorites.has(p.id)}">${favorites.has(p.id)?'★':'☆'}</button>`);};
const baseRegistry=renderRegistry;
renderRegistry=function(){baseRegistry();if(!$('favoriteFilter'))document.querySelector('.registry-tools').insertAdjacentHTML('afterbegin','<button class="favorite-filter" id="favoriteFilter" aria-pressed="false">☆ Избранное</button>');$('favoriteFilter').setAttribute('aria-pressed',String(favoritesOnly));$('favoriteFilter').textContent=(favoritesOnly?'★':'☆')+' Избранное';if(favoritesOnly){const items=[...$('registry').querySelectorAll('.plant-tile,tbody tr')];let count=0;for(const item of items){const id=item.querySelector('[data-open-plant]')?.dataset.openPlant;const show=favorites.has(id);item.hidden=!show;if(show)count++;}$('registryCount').textContent=count+' избранных';if(!count)$('registry').insertAdjacentHTML('beforeend','<div class="empty"><h3>Пока ничего не закреплено</h3><p>Нажмите звезду на карточке растения — оно останется под рукой.</p><button class="btn soft section-gap" id="showAllFavorites">Показать растения</button></div>');}};
$('plantSearch').oninput=renderRegistry;$('cameraFilter').onchange=renderRegistry;$('registryCultivar').onchange=renderRegistry;
const baseRenderBoard=renderBoard;
renderBoard=function(){baseRenderBoard();const plants=seasonPlants(),counts=Array.from({length:DATA.snapshotWeek},(_,i)=>plants.filter(p=>p.history.some(r=>r.week===i+1)).length),min=Math.min(...counts);const note=$('boardChart').nextElementSibling;note.textContent=`Зелёная линия — зарегистрированные сборы. Охват наблюдений: ${min}–${plants.length} из ${plants.length} растений по неделям. Сумма неполных недель может быть ниже фактического сбора.`;};
const baseModal=openModal,baseClose=closeModal;
openModal=function(...args){baseModal(...args);document.querySelector('.app').inert=true;document.querySelector('.sidebar').inert=true;document.body.style.overflow='hidden';};
closeModal=function(){document.querySelector('.app').inert=false;document.querySelector('.sidebar').inert=false;document.body.style.overflow='';baseClose();};
$('closeModal').onclick=closeModal;
function showGuide(){openModal('Растите. Наблюдайте. Планируйте.','Знакомство с Berry',`<div class="guide-grid">${[['01 / КОЛЛЕКЦИЯ','Каждый куст на виду','Фотокарточки, сорта и состояние камер. Звезда закрепляет любимые растения.','plants'],['02 / НАБЛЮДЕНИЕ','Ничего не упустить','Замеры вручную, вставка из Excel или импорт CSV. Черновики сохраняются в этом браузере.','measurements'],['03 / ПРОГНОЗ','Увидеть, что впереди','Ближайший сбор, пик урожая и история расчётов. Перемещайтесь по неделям сезона.','forecast'],['04 / ОБЩАЯ КАРТИНА','Весь сезон под рукой','Объём сбора всей коллекции и растения, которым нужно внимание.','board']].map(([n,t,d,v])=>`<article class="guide-step"><span class="step-number">${n}</span><strong>${t}</strong><p>${d}</p><button class="btn text small" data-guide-view="${v}">Открыть раздел ↗</button></article>`).join('')}</div><div class="notice">Прогнозы и фотографии — из исходного макета. Камеры, распознавание и новый расчёт модели демонстрируют будущие сценарии.</div>`,'<button class="btn primary" data-close>Начать работу</button>',true);}
function showHarvestPlan(){const p=selected(),v=current();openModal('Ближайшие сборы',`${plantLabel(p)} · ${cultivarLabel(p)} · ${v.synthetic||v.illustrative?'демосценарий':'сохранённый прогноз'}`,`<div class="harvest-calendar">${v.forecast.slice(0,3).map(r=>`<article class="harvest-day"><span>${dateLabel(dateFor(p,r.week))}<br><small>${r.week}-я неделя</small></span><strong>${fmt(r.point)}</strong><small>ягод · прогноз</small></article>`).join('')||'<p>На выбранном этапе нет будущих сборов.</p>'}</div><div class="notice">План основан на текущей версии расчёта. Новые измерения остаются в черновике до подключения модели.</div>`,'<button class="btn" data-close>Закрыть</button><button class="btn primary" data-action="exportcsv">Скачать план CSV</button>',true);}
const quickItems=[['board','Сезон в ваших руках','Обзор всей коллекции','grid'],['forecast','Прогноз урожая','Динамика и план сбора','chart'],['plants','Коллекция растений','Фото, камеры и избранное','leaf'],['measurements','Добавить наблюдение','История и новые измерения','table'],['import','Загрузить CSV','Импорт с проверкой строк','upload']];
function drawCommands(q=''){const needle=q.trim().toLowerCase(),actions=quickItems.filter(r=>r.join(' ').toLowerCase().includes(needle)).map(([v,t,s,i])=>`<button class="command-item" data-command-view="${v}">${icon(i)}<span>${t}<small>${s}</small></span><span>↗</span></button>`);const plants=seasonPlants().filter(p=>(plantLabel(p)+' '+cultivarLabel(p)+' '+p.id).toLowerCase().includes(needle)).slice(0,7).map(p=>`<button class="command-item" data-command-plant="${esc(p.id)}">${icon('leaf')}<span>${esc(plantLabel(p))}<small>${cultivarLabel(p)} · ${p.season}</small></span><span>${favorites.has(p.id)?'★':'↗'}</span></button>`);$('commandResults').innerHTML=[...actions,...plants].join('')||'<div class="empty">Ничего не найдено. Попробуйте название сорта или куста.</div>';}
function showCommands(){openModal('Что найдём?','Разделы, растения и быстрые переходы','<label class="field"><span class="muted">Поиск в коллекции</span><input id="commandSearch" class="command-search" autocomplete="off" placeholder="Например: куст 01 или измерения"></label><div class="command-list" id="commandResults"></div>','<span class="muted">Esc — закрыть · ↓ — выбрать результат</span><button class="btn" data-close>Закрыть</button>');drawCommands();$('commandSearch').oninput=e=>drawCommands(e.target.value);$('commandSearch').focus();}
function showUndo(){toast('Черновик изменён.');$('toast').insertAdjacentHTML('beforeend',' <button id="undoDraftButton" style="margin-left:12px;border:0;background:transparent;color:#eaf0b9;text-decoration:underline;padding:3px">Отменить</button>');$('toast').style.pointerEvents='auto';}
const baseAction=action;
action=function(name){
 if(name==='exportpdf'){window.print();return;}
 if(name==='cleardrafts'&&state.drafts.length)undoDrafts=structuredClone(state.drafts);
 const oldCount=state.drafts.length;baseAction(name);
 if(name==='saveentry'&&state.drafts.length>oldCount)delete entryCache[selected().id];
 if(name==='cleardrafts'&&oldCount){undoAfter=JSON.stringify(state.drafts);showUndo();}
 if(name==='activity')$('modalSubtitle').textContent='Последние действия, сохранённые в этом браузере';
 persist();
};
document.addEventListener('click',e=>{if(e.target.closest('[data-remove-draft]'))undoDrafts=structuredClone(state.drafts);},true);
document.addEventListener('click',e=>{
 const favorite=e.target.closest('[data-favorite]');
 if(favorite){const id=favorite.dataset.favorite;favorites.has(id)?favorites.delete(id):favorites.add(id);renderRegistry();toast(favorites.has(id)?'Растение добавлено в избранное.':'Растение убрано из избранного.');}
 if(e.target.closest('#favoriteFilter')){favoritesOnly=!favoritesOnly;renderRegistry();}
 if(e.target.closest('#showAllFavorites')){favoritesOnly=false;renderRegistry();}
 if(e.target.closest('#commandButton'))showCommands();
 if(e.target.closest('#guideButton'))showGuide();
 if(e.target.closest('#harvestPlanButton'))showHarvestPlan();
 const guide=e.target.closest('[data-guide-view]'),command=e.target.closest('[data-command-view]'),plant=e.target.closest('[data-command-plant]');
 if(guide||command){closeModal();setView((guide||command).dataset[guide?'guideView':'commandView']);}
 if(plant){const p=DATA.plants.find(p=>p.id===plant.dataset.commandPlant);closeModal();$('cultivar').value=p.cultivar;populatePlants();$('plant').value=p.id;state.selectedVersion=null;state.demoWeek=null;setView('forecast');}
 if(e.target.closest('#undoDraftButton')&&undoDrafts){if(JSON.stringify(state.drafts)===undoAfter){state.drafts=undoDrafts;render();toast('Черновик восстановлен.');}else toast('Черновик уже изменился. Отмена недоступна.');undoDrafts=null;}
 if(e.target.closest('[data-remove-draft]')){undoAfter=JSON.stringify(state.drafts);showUndo();}
 queueMicrotask(persist);
});
document.addEventListener('input',e=>{if(e.target.closest('.entry-card'))rememberEntry();queueMicrotask(persist);});
document.addEventListener('change',e=>{if(e.target.closest('.entry-card'))rememberEntry();queueMicrotask(persist);});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();showCommands();}if(e.key==='ArrowDown'&&e.target.id==='commandSearch'){e.preventDefault();$('commandResults')?.querySelector('button')?.focus();}if(['ArrowDown','ArrowUp'].includes(e.key)&&e.target.matches('.command-item')){e.preventDefault();const buttons=[...$('commandResults').querySelectorAll('button')],index=buttons.indexOf(e.target);buttons[(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}});
const baseSwitchTab=switchMeasurementTab;switchMeasurementTab=function(tab){baseSwitchTab(tab);if(tab==='drafts')$('measureNote').textContent='Черновики сохраняются в этом браузере. Новый расчёт модели пока не подключён.';};
populatePlants();setView('forecast');


