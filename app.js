'use strict';
const $=id=>document.getElementById(id);const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};const clock=()=>new Date().toTimeString().slice(0,8);const uid=()=>crypto.randomUUID();
const state={trades:[],exits:[],favorites:[24000,25000,26000],entryPrefix:25000,exitPrefix:25000,confluence:[]};let db;
function message(s,bad=false){$('message').textContent=s;$('message').className='status '+(bad?'error':'ok');}
function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open('trading-journal-mobile-v1',1);req.onupgradeneeded=()=>{const d=req.result;d.createObjectStore('trades',{keyPath:'id'});d.createObjectStore('exits',{keyPath:'id'});d.createObjectStore('settings',{keyPath:'key'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function getAll(store){return new Promise((resolve,reject)=>{const req=db.transaction(store).objectStore(store).getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function put(store,obj){return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(obj);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
const money=n=>Number(n).toFixed(2);function parseNum(raw){const n=Number(String(raw).replace(',','.'));if(!String(raw).trim()||!Number.isFinite(n))throw Error('Anna kelvollinen numero.');return n;}
function price(raw,prefix){const n=parseNum(raw);const p=n>=1000?n:prefix+n;if(p<=0||Math.abs(p*4-Math.round(p*4))>1e-7)throw Error('Hinnan tulee olla positiivinen ja 0,25 pisteen tarkkuudella.');return p;}
function selectedQty(t){return state.exits.filter(e=>e.trade_id===t.id).reduce((a,e)=>a+e.contracts,0)}function left(t){return t.contracts-selectedQty(t)}
function renderPrefix(type){const target=$(type+'Prefixes');target.innerHTML='';const current=state[type+'Prefix'];for(const p of state.favorites){const b=document.createElement('button');b.textContent=p.toLocaleString('fi-FI');if(p===current)b.className='active';b.onclick=()=>{state[type+'Prefix']=p;persistPrefs();renderPrefix(type);renderPrice(type)};target.append(b)}for(const delta of [-1000,1000]){const b=document.createElement('button');b.textContent=delta<0?'−1000':'+1000';b.onclick=()=>{const n=state[type+'Prefix']+delta;if(n<22000||n>36000)return message('Prefixin on oltava välillä 22 000–36 000.',true);state[type+'Prefix']=n;persistPrefs();renderPrefix(type);renderPrice(type)};target.append(b)}}
function renderPrice(type){try{$(type+'Full').textContent=price($(type+'Price').value,state[type+'Prefix']).toLocaleString('fi-FI',{minimumFractionDigits:2,maximumFractionDigits:2})}catch{$(type+'Full').textContent='—'}}
async function persistPrefs(){await put('settings',{key:'prefs',favorites:state.favorites,entryPrefix:state.entryPrefix,exitPrefix:state.exitPrefix});}
function renderFavorites(){const root=$('favorites');root.innerHTML='';for(let p=22000;p<=36000;p+=1000){const b=document.createElement('button');b.textContent=p.toLocaleString('fi-FI');b.dataset.p=p;b.className=state.favorites.includes(p)?'active':'';b.onclick=()=>{const selected=[...root.querySelectorAll('button.active')];if(!b.classList.contains('active')&&selected.length>=3)return message('Valitse enintään kolme tasoa. Poista ensin yksi valinta.',true);b.classList.toggle('active')};root.append(b)}}
function renderOpen(){const sel=$('openTrade');const old=sel.value;sel.innerHTML='';for(const t of state.trades.filter(t=>left(t)>0).sort((a,b)=>b.entry_time.localeCompare(a.entry_time))){const o=document.createElement('option');o.value=t.id;o.textContent=`${t.instrument} ${t.direction} · ${left(t)} / ${t.contracts} · ${t.entry_time.slice(5,16).replace('T',' ')}`;sel.append(o)}if([...sel.options].some(o=>o.value===old))sel.value=old;const t=state.trades.find(t=>t.id===sel.value);$('remaining').textContent=t?`${left(t)} / ${t.contracts} sopimusta jäljellä`:'Ei avoimia treidejä';$('saveExit').disabled=!t;}
function renderHistory(){const root=$('historyList');root.replaceChildren();for(const t of [...state.trades].sort((a,b)=>b.entry_time.localeCompare(a.entry_time))){const box=document.createElement('div');box.className='trade';const h=document.createElement('strong');h.textContent=`${t.instrument} ${t.direction} · ${t.contracts} kpl · ${t.entry_price}`;box.append(h);const info=document.createElement('div');info.className='small';info.textContent=`${t.entry_time} · ${t.setup||'Ei setupia'} · ${left(t)?'Avoin '+left(t):'Suljettu'}`;box.append(info);if(t.notes){const n=document.createElement('p');n.textContent=t.notes;box.append(n)}for(const e of state.exits.filter(e=>e.trade_id===t.id)){const line=document.createElement('div');line.className='small';const pts=(Number(e.exit_price)-Number(t.entry_price))*(t.direction==='Long'?1:-1);line.textContent=`Exit ${e.exit_time} · ${e.contracts} @ ${e.exit_price} · ${pts>=0?'+':''}${money(pts)} pts · FX ${e.fx_eur_per_usd||'puuttuu'}`;box.append(line)}root.append(box)}if(!state.trades.length)root.textContent='Ei vielä treidejä.';}
function renderAll(){renderOpen();renderHistory();renderPrefix('entry');renderPrefix('exit');renderFavorites();const active=state.trades.find(t=>left(t)>0);$('saveTrade').disabled=Boolean(active);$('saveTrade').title=active?'Sulje ensin avoin treidi kokonaan.':'';}
function entryTimestamp(){const date=$('tradeDate').value;const time=$('entryTime').value;const normalized=/^\d{2}:\d{2}$/.test(time)?time+':00':time;return [date+'T'+normalized,'exact'];}
let savingTrade=false;
async function saveTrade(){
 if(savingTrade)return;
 savingTrade=true;
 try{
  // Check the persisted data as well as the current view before any new entry.
  const trades=await getAll('trades');
  const exits=await getAll('exits');
  const active=trades.find(t=>t.contracts-exits.filter(e=>e.trade_id===t.id).reduce((sum,e)=>sum+e.contracts,0)>0);
  if(active)throw Error(`Sulje ensin avoin ${active.instrument}-treidi kokonaan (${active.contracts-exits.filter(e=>e.trade_id===active.id).reduce((sum,e)=>sum+e.contracts,0)} sopimusta jäljellä). Uutta treidiä ei tallennettu.`);
  const entry=price($('entryPrice').value,state.entryPrefix);const [entryTime,precision]=entryTimestamp();if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(entryTime))throw Error('Valitse treidin päivämäärä ja aika.');const stop=$('stop').value==='custom'?parseNum($('customStop').value):$('stop').value;if(stop!==''&&Number(stop)<=0)throw Error('Stopin on oltava positiivinen.');const stamp=new Date().toISOString();const t={id:uid(),instrument:$('instrument').value,direction:$('direction').value,contracts:Number($('contracts').value),entry_price:String(entry),entry_time:entryTime,recorded_at:stamp,timeframe:$('timeframe').value,confluence:state.confluence.join(','),setup:$('setup').value,stop_pts:stop===''?null:String(stop),notes:$('notes').value,status:'Open',finalized_at:null,updated_at:stamp,session:'Unspecified',entry_time_precision:precision};await put('trades',t);state.trades.push(t);$('exitDate').value=today();$('exitTime').value=clock();renderAll();message('Treidi tallennettu puhelimeen: '+t.id.slice(0,8));}catch(e){message(e.message,true)}finally{savingTrade=false;renderAll();}}
async function saveExit(mode='selected'){try{const t=state.trades.find(t=>t.id===$('openTrade').value);if(!t)throw Error('Valitse avoin treidi.');const remaining=left(t);const qty=mode==='all'?remaining:mode==='half'?Math.max(1,Math.floor(remaining/2)):mode==='third'?Math.max(1,Math.floor(remaining/3)):Number($('closeQty').value);if(!Number.isInteger(qty)||qty<1||qty>remaining)throw Error('Virheellinen suljettava sopimusmäärä.');const ep=price($('exitPrice').value,state.exitPrefix);const exitClock=$('exitTime').value;const time=$('exitDate').value+'T'+(/^\d{2}:\d{2}$/.test(exitClock)?exitClock+':00':exitClock);if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(time))throw Error('Tarkista sulkemispäivä ja -aika.');if(time<t.entry_time)throw Error('Sulkemisajan tulee olla avausajan jälkeen. Avaus: '+t.entry_time.replace('T',' ')+'; sulku: '+time.replace('T',' ')+'. Paina Exit Now, jos suljet treidin nyt.');const fxRaw=$('fx').value.trim();const fx=fxRaw?parseNum(fxRaw):null;if(fx!==null&&fx<=0)throw Error('Valuuttakurssin on oltava positiivinen.');const source=$('fxSource').value.trim();if(Boolean(fx)!==Boolean(source))throw Error('Anna sekä FX-kurssi että lähde tai jätä molemmat tyhjiksi.');const pts=(ep-Number(t.entry_price))*(t.direction==='Long'?1:-1);const gross=pts*qty*(t.instrument==='MNQ'?2:20);if(!confirm(`Suljetaanko ${qty} ${t.instrument} sopimusta?\nTulos ${money(pts)} pts/sopimus\nBrutto $${money(gross)}\n${fx?'EUR-muunnos tallennetaan':'FX täydennettävä Windowsissa'}`))return;const ex={id:uid(),trade_id:t.id,contracts:qty,exit_price:String(ep),exit_time:time,fx_eur_per_usd:fx===null?null:String(fx),fx_source:source||null,created_at:new Date().toISOString()};await put('exits',ex);state.exits.push(ex);t.status=left(t)?'Partially Closed':'Closed';t.updated_at=new Date().toISOString();await put('trades',t);renderAll();message('Sulkeminen tallennettu: '+qty+' sopimusta.');}catch(e){message(e.message,true)}}
function exportJson(){const payload={format:'trading-journal-mobile',schema_version:1,exported_at:new Date().toISOString(),trades:state.trades,exits:state.exits};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`TradingJournal_Mobile_${today()}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);message(`Viety ${state.trades.length} treidiä ja ${state.exits.length} sulkemista.`)}

// Delete trades and exits in one atomic transaction. Keep user settings and ECB cache.
let resettingTrades=false;
async function resetAllTrades(){
 if(resettingTrades)return;
 const count=(await getAll('trades')).length;
 if(!count){message('Puhelimessa ei ole poistettavia treidejä.');return;}
 if(!$('confirmReset').checked){message('Vahvista ensin poisto rastittamalla valintaruutu.',true);return;}
 if(!confirm(`Poistetaanko KAIKKI ${count} puhelimen treidiä ja niiden sulkemiset pysyvästi?`))return;
 resettingTrades=true;$('resetTrades').disabled=true;
 try{
  await new Promise((resolve,reject)=>{
   const tx=db.transaction(['trades','exits'],'readwrite');
   tx.objectStore('exits').clear();tx.objectStore('trades').clear();
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('Tietokantavirhe'));
   tx.onabort=()=>reject(tx.error||new Error('Poisto keskeytyi'));
  });
  state.trades=[];state.exits=[];$('confirmReset').checked=false;renderAll();
  message(`Poistettu ${count} treidiä ja niiden sulkemiset. Asetukset säilyivät.`);
 }catch(e){state.trades=await getAll('trades');state.exits=await getAll('exits');renderAll();message('Tyhjennys epäonnistui: '+e.message,true)}
 finally{resettingTrades=false;$('resetTrades').disabled=!$('confirmReset').checked;}
}

// ECB publishes USD per EUR. Convert to EUR per USD for the journal.
// Browser cross-origin policy applies; errors never create a guessed rate.
let fxRequest=0,fxAuto=false,fxTouched=false;
function fxInfo(text,error=false){const e=$('fxStatus');e.textContent=text;e.className='hint'+(error?' error':'');}
function parseEcbXml(xml,target){
 const doc=new DOMParser().parseFromString(xml,'application/xml');
 if(doc.querySelector('parsererror'))throw Error('EKP:n XML-vastaus ei ole kelvollinen.');
 let best=null;
 for(const day of doc.getElementsByTagName('Cube')){
  const d=day.getAttribute('time');if(!d||d>target)continue;
  for(const item of day.getElementsByTagName('Cube')){
   if(item.getAttribute('currency')!=='USD')continue;
   const value=Number(item.getAttribute('rate'));
   if(Number.isFinite(value)&&value>0&&(!best||d>best.date))best={date:d,usd:value};
  }
 }
 return best;
}
function parseEcbCsv(raw,target){
 const lines=raw.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
 const header=lines.shift()?.split(',')||[];const di=header.indexOf('TIME_PERIOD'),vi=header.indexOf('OBS_VALUE');
 if(di<0||vi<0)throw Error('EKP:n CSV-vastaus on virheellinen.');
 let best=null;
 for(const line of lines){const cols=line.split(',');const d=cols[di],usd=Number(cols[vi]);if(d&&d<=target&&Number.isFinite(usd)&&usd>0&&(!best||d>best.date))best={date:d,usd};}
 return best;
}
async function fetchText(url,accept){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
 try{const res=await fetch(url,{headers:{Accept:accept},signal:controller.signal,cache:'no-store'});if(!res.ok)throw Error('HTTP '+res.status);return await res.text();}
 finally{clearTimeout(timer)}
}
async function ecbForDay(target){
 const recent=(Date.now()-new Date(target+'T12:00:00').getTime())/86400000<75;
 const xmlUrl=recent?'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml':'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml';
 const failures=[];
 try{const result=parseEcbXml(await fetchText(xmlUrl,'application/xml'),target);if(result)return result;failures.push('XML: kurssia ei löytynyt');}catch(e){failures.push('XML: '+e.message)}
 try{
  const from=new Date(target+'T12:00:00');from.setDate(from.getDate()-14);
  const start=`${from.getFullYear()}-${String(from.getMonth()+1).padStart(2,'0')}-${String(from.getDate()).padStart(2,'0')}`;
  const url=`https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?startPeriod=${start}&endPeriod=${target}&format=csvdata`;
  const result=parseEcbCsv(await fetchText(url,'text/csv'),target);if(result)return result;
  failures.push('API: kurssia ei löytynyt');
 }catch(e){failures.push('API: '+e.message)}
 throw Error('EKP-haku epäonnistui ('+failures.join('; ')+'). Selaimen CORS-rajoitus tai verkkoyhteys voi estää haun.');
}
function applyEcb(day,record,fromCache=false){
 if(day!==$('exitDate').value||fxTouched)return;
 fxAuto=true;
 try{$('fx').value=record.rate;$('fxSource').value=record.source;}finally{fxAuto=false}
 fxInfo((fromCache?'Välimuistista: ':'Haettu: ')+record.source+'. Tarkista kurssi ennen veroilmoitusta.');
}
async function loadFx(){
 const day=$('exitDate').value;if(!day)return;
 const request=++fxRequest;fxTouched=false;
 if(day>today()){fxInfo('Tulevan päivän EKP-kurssia ei ole saatavilla.',true);return;}
 const key='ecb-fx-'+day;
 const cached=(await getAll('settings')).find(x=>x.key===key);
 if(request!==fxRequest)return;
 if(cached?.rate&&cached?.source){applyEcb(day,cached,true);return;}
 if(!navigator.onLine){fxInfo('Ei verkkoyhteyttä eikä tallennettua kurssia. Syötä vahvistettu kurssi ja lähde käsin.',true);return;}
 $('fetchFx').disabled=true;fxInfo('Haetaan EKP:n viitekurssia päivälle '+day+'…');
 try{
  const result=await ecbForDay(day);if(request!==fxRequest)return;
  const rate=(1/result.usd).toFixed(6),source=`ECB reference rate ${result.date} (USD per EUR: ${result.usd})`;
  const record={key,rate,source};await put('settings',record);if(request===fxRequest)applyEcb(day,record);
 }catch(e){if(request===fxRequest)fxInfo(e.message+' Voit syöttää kurssin käsin.',true)}
 finally{if(request===fxRequest)$('fetchFx').disabled=false;}
}
function changeFxDate(){fxRequest++;fxTouched=false;$('fx').value='';$('fxSource').value='';loadFx();}

async function boot(){try{db=await openDb();const prefs=(await getAll('settings')).find(x=>x.key==='prefs');if(prefs){state.favorites=prefs.favorites;state.entryPrefix=prefs.entryPrefix;state.exitPrefix=prefs.exitPrefix}state.trades=await getAll('trades');state.exits=await getAll('exits');for(let i=1;i<=10;i++)$('contracts').add(new Option(String(i),String(i)));for(const tf of ['1m','5m','15m','30m','60m']){const b=document.createElement('button');b.textContent=tf;b.onclick=()=>{b.classList.toggle('active');state.confluence=[...$('confluence').querySelectorAll('.active')].map(x=>x.textContent)};$('confluence').append(b)}$('tradeDate').value=today();$('exitDate').value=today();$('entryTime').value=clock();$('exitTime').value=clock();for(const type of ['entry','exit'])$(type+'Price').addEventListener('input',()=>renderPrice(type));$('entryNow').onclick=()=>{$('tradeDate').value=today();$('entryTime').value=clock();};$('exitNow').onclick=()=>{const changed=$('exitDate').value!==today();$('exitDate').value=today();$('exitTime').value=clock();if(changed)changeFxDate()};$('exitDate').addEventListener('change',changeFxDate);$('fetchFx').onclick=()=>{fxTouched=false;loadFx()};for(const id of ['fx','fxSource'])$(id).addEventListener('input',()=>{if(!fxAuto){fxTouched=true;fxRequest++;$('fetchFx').disabled=false;fxInfo('Manuaalinen kurssi/lähde. Tarkista molemmat ennen tallennusta.')}});$('stop').onchange=()=>$('customStop').disabled=$('stop').value!=='custom';$('saveTrade').onclick=saveTrade;$('saveExit').onclick=()=>saveExit();for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>saveExit(b.dataset.close);$('openTrade').onchange=()=>{renderOpen();$('exitDate').value=today();$('exitTime').value=clock();changeFxDate()};$('exportBtn').onclick=exportJson;$('resetTrades').onclick=resetAllTrades;for(const evt of ['change','input','click'])$('confirmReset').addEventListener(evt,()=>{$('resetTrades').disabled=resettingTrades||!$('confirmReset').checked});$('saveFavorites').onclick=async()=>{const vals=[...$('favorites').querySelectorAll('.active')].map(b=>Number(b.dataset.p)).sort((a,b)=>a-b);if(vals.length!==3)return message('Valitse täsmälleen kolme tasoa.',true);state.favorites=vals;await persistPrefs();renderAll();message('Suosikit tallennettu.')};for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>{if(b.dataset.tab==='close'){$('exitDate').value=today();$('exitTime').value=clock();changeFxDate()}document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));for(const section of ['new','close','history','export'])$(section).classList.toggle('hidden',section!==b.dataset.tab);renderAll()};renderAll();message('Paikallinen tallennus valmis.');loadFx();if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js?v=0.9', {updateViaCache:'none'}).catch(()=>{});}catch(e){message('Tallennusta ei voitu avata: '+e.message,true)}}boot();
