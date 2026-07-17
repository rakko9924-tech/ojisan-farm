/* おじさん畑 — ニョキニョキ収穫コレクション
   キャラ画像: assets/oji/{id}.png (ChatGPT生成・透過PNG)。未配置時は絵文字プレースホルダ。*/
'use strict';

/* ============ データ定義 ============ */
const RARITY = {
  common:    {jp:'ふつう',   w:'common',    cls:'r-common-bg'},
  uncommon:  {jp:'レア',     w:'uncommon',  cls:'r-uncommon-bg'},
  rare:      {jp:'激レア',   w:'rare',      cls:'r-rare-bg'},
  epic:      {jp:'超激レア', w:'epic',      cls:'r-epic-bg'},
  legendary: {jp:'伝説',     w:'legendary', cls:'r-legendary-bg'},
};

// id はファイル名 assets/oji/{id}.png に対応
const TYPES = [
  // ── 公園 ──
  {id:'futsuu', name:'ふつうおじ',     env:'park',   rarity:'common',    value:1,    emo:'🧑'},
  {id:'hage',   name:'ツルツルおじ',   env:'park',   rarity:'common',    value:2,    emo:'👨‍🦲'},
  {id:'megane', name:'メガネおじ',     env:'park',   rarity:'common',    value:3,    emo:'🧑‍🏫'},
  {id:'hige',   name:'ヒゲおじ',       env:'park',   rarity:'uncommon',  value:6,    emo:'🧔'},
  // ── オフィス街 ──
  {id:'salary', name:'サラリーマンおじ',env:'office', rarity:'common',    value:5,    emo:'👔'},
  {id:'konjo',  name:'こんじょうおじ', env:'office', rarity:'common',    value:7,    emo:'🥷'},
  {id:'bucho',  name:'ぶちょうおじ',   env:'office', rarity:'uncommon',  value:12,   emo:'🧑‍💼'},
  {id:'shacho', name:'しゃちょうおじ', env:'office', rarity:'rare',      value:28,   emo:'🤵'},
  // ── リゾート ──
  {id:'aloha',  name:'アロハおじ',     env:'resort', rarity:'common',    value:16,   emo:'🌺'},
  {id:'onsen',  name:'おんせんおじ',   env:'resort', rarity:'common',    value:20,   emo:'♨️'},
  {id:'surfer', name:'サーファーおじ', env:'resort', rarity:'uncommon',  value:40,   emo:'🏄'},
  {id:'dandy',  name:'ダンディおじ',   env:'resort', rarity:'rare',      value:90,   emo:'🎩'},
  // ── 宇宙 ──
  {id:'uchu',   name:'うちゅうおじ',   env:'space',  rarity:'common',    value:60,   emo:'👨‍🚀'},
  {id:'alien',  name:'エイリアンおじ', env:'space',  rarity:'uncommon',  value:130,  emo:'👽'},
  {id:'sennin', name:'せんにんおじ',   env:'space',  rarity:'epic',      value:400,  emo:'🧙'},
  {id:'kami',   name:'かみさまおじ',   env:'space',  rarity:'legendary', value:1500, emo:'😇'},
];
const BY_ID = Object.fromEntries(TYPES.map(t=>[t.id,t]));

const ENVS = [
  {id:'park',   name:'公園',       emo:'🌳', cost:0,      grow:10000, pool:{futsuu:50,hage:30,megane:15,hige:5}},
  {id:'office', name:'オフィス街', emo:'🏢', cost:800,    grow:16000, pool:{salary:48,konjo:30,bucho:18,shacho:4}},
  {id:'resort', name:'リゾート',   emo:'🏝️', cost:12000,  grow:26000, pool:{aloha:46,onsen:30,surfer:20,dandy:4}},
  {id:'space',  name:'宇宙',       emo:'🚀', cost:250000, grow:45000, pool:{uchu:55,alien:30,sennin:13,kami:2}},
];
const ENV_BY_ID = Object.fromEntries(ENVS.map(e=>[e.id,e]));
const RARITY_ORDER = ['common','uncommon','rare','epic','legendary'];

const CFG = {
  startSlots:6, maxSlots:12,
  fertMax:20, fertStep:0.08,          // 1Lvごと成長-8%(下限30%)
  rareFertMs:60000,                    // レア肥料の効果時間
  interstitialEvery:15,                // 収穫n回ごと疑似インタースティシャル
  dailyCooldown:20*3600*1000,
};

/* ============ セーブ ============ */
const SAVE_KEY='ojibatake_v1';
let S;
function fresh(){
  const fields={};
  ENVS.forEach(e=>{ fields[e.id]=Array.from({length:CFG.startSlots},()=>null); });
  return {
    coins:0, env:'park',
    unlocked:{park:true,office:false,resort:false,space:false},
    fertLv:0, slots:CFG.startSlots,
    fields, discovered:{}, harvestCount:0,
    adFree:false, muted:false, lastDaily:0, rareUntil:0, seenIntro:false,
  };
}
function load(){
  try{
    const raw=localStorage.getItem(SAVE_KEY);
    if(!raw){ S=fresh(); return; }
    S=Object.assign(fresh(), JSON.parse(raw));
    // スロット数と各fieldの長さを整合
    ENVS.forEach(e=>{
      if(!S.fields[e.id]) S.fields[e.id]=[];
      while(S.fields[e.id].length<S.slots) S.fields[e.id].push(null);
      S.fields[e.id].length=S.slots;
    });
  }catch(_){ S=fresh(); }
}
let saveT=0;
function save(){
  clearTimeout(saveT);
  saveT=setTimeout(()=>{ try{localStorage.setItem(SAVE_KEY,JSON.stringify(S));}catch(_){}} ,150);
}

/* ============ ユーティリティ ============ */
const $=s=>document.querySelector(s);
const now=()=>Date.now();
function fmt(n){ n=Math.floor(n);
  if(n>=1e8) return (n/1e8).toFixed(2)+'億';
  if(n>=1e4) return (n/1e4).toFixed(n>=1e5?0:1)+'万';
  return n.toLocaleString('ja-JP');
}
function growMs(env){
  const base=ENV_BY_ID[env].grow;
  return Math.max(base*0.3, base*Math.pow(1-CFG.fertStep,S.fertLv));
}
function weightedPick(pool){
  let tot=0; for(const k in pool) tot+=pool[k];
  let r=Math.random()*tot;
  for(const k in pool){ r-=pool[k]; if(r<=0) return k; }
  return Object.keys(pool)[0];
}
function rollType(env){
  const pool=ENV_BY_ID[env].pool;
  const rareActive = now()<S.rareUntil;
  if(rareActive){
    // レア肥料中: uncommon以上のみから抽選
    const hi={};
    for(const k in pool){ if(RARITY_ORDER.indexOf(BY_ID[k].rarity)>=1) hi[k]=pool[k]; }
    if(Object.keys(hi).length) return weightedPick(hi);
  }
  return weightedPick(pool);
}
function plantEmpty(field){
  for(let i=0;i<field.length;i++) if(!field[i]) field[i]={t:rollType(S.env),at:now()};
}

/* ============ おじさん描画 ============ */
function ojiImg(typeId, cls){
  const t=BY_ID[typeId];
  const img=document.createElement('img');
  img.className=cls||'oji';
  img.src='assets/oji/'+typeId+'.png';
  img.alt=t.name; img.draggable=false;
  img.onerror=()=>{ // アート未配置 → 絵文字プレースホルダ
    const span=document.createElement('span');
    span.className=img.className+' oji-ph';
    span.textContent=t.emo;
    span.style.fontSize='42px';
    img.replaceWith(span);
  };
  return img;
}

/* ============ 畑レンダリング ============ */
const fieldEl=$('#field');
function buildField(){
  fieldEl.innerHTML='';
  const field=S.fields[S.env];
  field.forEach((cell,i)=>{
    const plot=document.createElement('div');
    plot.className='plot'; plot.dataset.i=i;
    plot.innerHTML='<div class="spark"></div><div class="rarity-glow"></div>'+
                   '<div class="ready-tag">収穫！</div><div class="timer"></div>';
    if(cell){ plot.appendChild(ojiImg(cell.t)); }
    plot.addEventListener('click',()=>onPlotTap(i));
    fieldEl.appendChild(plot);
  });
  refreshField();
}
function stageOf(cell,gm){
  const p=(now()-cell.at)/gm;
  if(p>=1) return 'ripe';
  if(p>=0.45) return 'mid';
  return 'growing';
}
function refreshField(){
  const field=S.fields[S.env]; const gm=growMs(S.env);
  const plots=fieldEl.children;
  for(let i=0;i<plots.length;i++){
    const plot=plots[i], cell=field[i];
    plot.classList.remove('empty','growing','mid','ripe','r-rare','r-epic','r-legendary');
    if(!cell){ plot.classList.add('empty'); plot.querySelector('.timer').textContent=''; continue; }
    if(!plot.querySelector('.oji')) plot.appendChild(ojiImg(cell.t));
    const st=stageOf(cell,gm);
    plot.classList.add(st);
    const rar=BY_ID[cell.t].rarity;
    if(rar==='rare') plot.classList.add('r-rare');
    else if(rar==='epic') plot.classList.add('r-epic');
    else if(rar==='legendary') plot.classList.add('r-legendary');
    const timer=plot.querySelector('.timer');
    if(st!=='ripe'){
      const left=Math.ceil((gm-(now()-cell.at))/1000);
      timer.textContent=left+'秒';
    }
  }
  // レア肥料インジケータ
  document.body.classList.toggle('rare-mode', now()<S.rareUntil);
}

/* ============ 収穫 ============ */
function harvestPlot(i, silent){
  const field=S.fields[S.env]; const cell=field[i];
  if(!cell) return null;
  const gm=growMs(S.env);
  if((now()-cell.at)<gm) return null; // まだ未成熟
  const t=BY_ID[cell.t];
  S.coins+=t.value;
  S.harvestCount++;
  // 図鑑
  const first=!S.discovered[cell.t];
  S.discovered[cell.t]=(S.discovered[cell.t]||0)+1;
  if(first){ S.coins+=t.value*10; } // 初発見ボーナス
  // 収穫ポップ
  if(!silent){
    const plot=fieldEl.children[i];
    if(plot){
      const pop=document.createElement('div');
      pop.className='pop-coin'; pop.textContent='+'+fmt(t.value);
      pop.style.left='50%'; pop.style.top='40%'; pop.style.transform='translateX(-50%)';
      plot.appendChild(pop); setTimeout(()=>pop.remove(),800);
    }
    beep(t.rarity);
  }
  // 植え直し
  field[i]={t:rollType(S.env),at:now()};
  const plot=fieldEl.children[i];
  if(plot){ const old=plot.querySelector('.oji'); if(old) old.remove(); plot.appendChild(ojiImg(field[i].t)); }
  return {type:t, first};
}
function onPlotTap(i){
  const res=harvestPlot(i);
  if(res){
    updateHUD(); refreshField(); save();
    if(res.first || RARITY_ORDER.indexOf(res.type.rarity)>=2){ showReward(res.type,res.first); }
    maybeInterstitial();
  }
}
function harvestAll(){
  const field=S.fields[S.env]; let got=0, best=null, firstAny=null;
  for(let i=0;i<field.length;i++){
    const cell=field[i]; if(!cell) continue;
    if((now()-cell.at)>=growMs(S.env)){
      const r=harvestPlot(i,true);
      if(r){ got+=r.type.value; if(!best||r.type.value>best.value) best=r.type; if(r.first&&!firstAny) firstAny=r.type; }
    }
  }
  if(got>0){
    updateHUD(); refreshField(); save(); beep('common');
    toast('収穫 +'+fmt(got)+' 🪙');
    if(firstAny) showReward(firstAny,true);
    else if(best && RARITY_ORDER.indexOf(best.rarity)>=2) showReward(best,false);
    maybeInterstitial();
  }else{
    toast('まだ育ってないよ🌱');
  }
}

/* ============ HUD ============ */
function updateHUD(){ $('#coinNum').textContent=fmt(S.coins); }

/* ============ 図鑑 ============ */
function buildZukan(){
  const grid=$('#zukanGrid'); grid.innerHTML='';
  let found=0;
  TYPES.forEach(t=>{
    const disc=S.discovered[t.id]||0;
    if(disc) found++;
    const c=document.createElement('div');
    c.className='zcard'+(disc?'':' locked');
    const rar=RARITY[t.rarity];
    c.innerHTML=`<div class="z-rarity ${rar.cls}">${rar.jp}</div>`;
    c.appendChild(ojiImg(t.id,'z-oji'));
    const nm=document.createElement('div'); nm.className='z-name';
    nm.textContent=disc?t.name:'？？？'; c.appendChild(nm);
    const meta=document.createElement('div');
    if(disc){ meta.className='z-val'; meta.textContent='🪙'+fmt(t.value); }
    else{ meta.className='z-count'; meta.textContent=ENV_BY_ID[t.env].emo+ENV_BY_ID[t.env].name; }
    c.appendChild(meta);
    if(disc){ const cnt=document.createElement('div'); cnt.className='z-count'; cnt.textContent='×'+disc; c.appendChild(cnt); }
    grid.appendChild(c);
  });
  $('#zukanFound').textContent=found;
  $('#zukanTotal').textContent=TYPES.length;
}

/* ============ ショップ ============ */
function fertCost(){ return Math.floor(50*Math.pow(1.7,S.fertLv)); }
function slotCost(){ return Math.floor(120*Math.pow(1.9,S.slots-CFG.startSlots)); }
function buildShop(){
  const list=$('#shopList'); list.innerHTML='';
  // 肥料
  list.appendChild(shopItem({
    emo:'🌿', title:'肥料をまく', lv:'Lv.'+S.fertLv+' ／ 成長時間 -'+Math.round((1-Math.pow(1-CFG.fertStep,S.fertLv))*100)+'%',
    desc:'おじさんの成長が速くなる',
    cost:S.fertLv>=CFG.fertMax?null:fertCost(),
    max:S.fertLv>=CFG.fertMax,
    buy:()=>{ if(spend(fertCost())){ S.fertLv++; toast('肥料 Lv.'+S.fertLv+'！'); refreshShop(); refreshField(); } },
  }));
  // 畑拡張
  list.appendChild(shopItem({
    emo:'🪴', title:'畑を広げる', lv:'いま '+S.slots+' 区画（最大'+CFG.maxSlots+'）',
    desc:'植えられるおじさんが1体増える',
    cost:S.slots>=CFG.maxSlots?null:slotCost(),
    max:S.slots>=CFG.maxSlots,
    buy:()=>{ if(spend(slotCost())){ S.slots++; ENVS.forEach(e=>S.fields[e.id].push(null)); plantEmpty(S.fields[S.env]); toast('畑が広がった！'); buildField(); refreshShop(); } },
  }));
  // 環境アンロック
  const sep=document.createElement('div'); sep.className='shop-sep'; sep.textContent='あたらしい畑'; list.appendChild(sep);
  ENVS.filter(e=>e.cost>0).forEach(e=>{
    const un=S.unlocked[e.id];
    list.appendChild(shopItem({
      emo:e.emo, title:e.name+'を ひらく', lv:un?'解放ずみ ✅':'新種のおじさんが登場',
      desc:'ここでしか採れないおじさんがいる',
      cost:un?null:e.cost, max:un,
      buy:()=>{ if(!un && spend(e.cost)){ unlockEnv(e.id); } },
    }));
  });
  // 課金
  const sep2=document.createElement('div'); sep2.className='shop-sep'; sep2.textContent='サポート'; list.appendChild(sep2);
  const iap=document.createElement('div'); iap.className='shop-item';
  iap.innerHTML=`<div class="si-emo">💛</div><div class="si-main"><div class="si-title">課金メニュー</div>
    <div class="si-desc">広告削除・コイン袋（プロトタイプ）</div></div>`;
  const b=document.createElement('button'); b.className='buy-btn iap'; b.textContent='ひらく';
  b.onclick=openStore; iap.appendChild(b); list.appendChild(iap);
}
function shopItem({emo,title,lv,desc,cost,max,buy}){
  const el=document.createElement('div'); el.className='shop-item';
  el.innerHTML=`<div class="si-emo">${emo}</div><div class="si-main">
    <div class="si-title">${title}</div><div class="si-desc">${desc}</div>
    <div class="si-lv">${lv}</div></div>`;
  const b=document.createElement('button');
  if(max){ b.className='buy-btn max'; b.textContent='MAX'; b.disabled=true; }
  else{ b.className='buy-btn'; b.innerHTML='🪙'+fmt(cost); b.disabled=S.coins<cost; b.onclick=buy; }
  el.appendChild(b); return el;
}
function refreshShop(){ if($('#shopPage').classList.contains('active')) buildShop(); updateHUD(); save(); }
function spend(c){ if(S.coins<c){ toast('コインが足りないよ'); return false; } S.coins-=c; updateHUD(); save(); return true; }
function unlockEnv(id){
  S.unlocked[id]=true; plantEmpty(S.fields[id]);
  toast(ENV_BY_ID[id].name+' が ひらいた！'); buildEnvTabs(); refreshShop();
  interstitialAd(()=>switchEnv(id));
}

/* ============ 環境タブ ============ */
function buildEnvTabs(){
  const nav=$('#envTabs'); nav.innerHTML='';
  ENVS.forEach(e=>{
    const chip=document.createElement('button');
    const un=S.unlocked[e.id];
    chip.className='env-chip'+(e.id===S.env?' active':'')+(un?'':' locked');
    chip.innerHTML=`<span class="env-emo">${e.emo}</span>${e.name}`+
      (un?'':`<span class="env-cost">🪙${fmt(e.cost)}</span>`);
    chip.onclick=()=>{
      if(un){ switchEnv(e.id); }
      else if(S.coins>=e.cost){ if(spend(e.cost)) unlockEnv(e.id); }
      else{ toast('🪙'+fmt(e.cost)+' でひらけるよ'); go('shopPage'); }
    };
    nav.appendChild(chip);
  });
}
function switchEnv(id){
  if(!S.unlocked[id]) return;
  S.env=id; plantEmpty(S.fields[id]);
  buildEnvTabs(); buildField(); save();
}

/* ============ リワード演出 ============ */
function showReward(type,first){
  const card=$('#rewardCard'); card.innerHTML='';
  if(first){ const b=document.createElement('div'); b.className='rc-new'; b.textContent='はじめて発見！'; card.appendChild(b); }
  card.appendChild(ojiImg(type.id,'rc-oji'));
  const nm=document.createElement('div'); nm.className='rc-name'; nm.textContent=type.name; card.appendChild(nm);
  const rr=document.createElement('div'); rr.className='rc-val';
  rr.textContent=RARITY[type.rarity].jp+' ／ 🪙'+fmt(type.value)+(first?'（発見ボーナス+'+fmt(type.value*10)+'）':''); card.appendChild(rr);
  const btn=document.createElement('button'); btn.className='rc-btn'; btn.textContent='やったー';
  btn.onclick=()=>$('#rewardModal').classList.add('hidden'); card.appendChild(btn);
  $('#rewardModal').classList.remove('hidden');
}

/* ============ 広告 ============ */
// Web用の疑似広告（3-2-1）。ネイティブでは Native.rewarded を使う。
function mockAd(cb){
  const m=$('#adModal'), c=$('#adCount'); let n=3; c.textContent=n;
  m.classList.remove('hidden');
  const iv=setInterval(()=>{ n--; if(n<=0){ clearInterval(iv); m.classList.add('hidden'); cb&&cb(); } else c.textContent=n; },1000);
}
// リワード広告: 視聴完了で報酬(cb)。ネイティブ=実広告 / Web=疑似。
function rewardedAd(cb){
  if(window.Native && Native.isNative){
    Native.rewarded(ok=>{ if(ok) cb&&cb(); else toast('報酬を受け取れませんでした'); });
  }else{ mockAd(()=>{ cb&&cb(); }); }
}
// インタースティシャル: ネイティブのみ実表示、Webは即通過。
function interstitialAd(cb){
  if(S.adFree){ cb&&cb(); return; }
  if(window.Native && Native.isNative){ Native.interstitial(()=>{ cb&&cb(); }); }
  else{ cb&&cb(); }
}
function maybeInterstitial(){ if(!S.adFree && S.harvestCount>0 && S.harvestCount%CFG.interstitialEvery===0){ interstitialAd(); } }

// リワード: 水やりブースト（全区画を即成熟）
function waterBoost(){
  rewardedAd(()=>{
    const field=S.fields[S.env];
    for(let i=0;i<field.length;i++){ if(field[i]){ field[i].at=now()-growMs(S.env)-10; } }
    refreshField(); toast('全部そだった！収穫しよう💧');
  });
}
// リワード: レア肥料（一定時間レア以上が育つ）
function rareFert(){
  rewardedAd(()=>{
    S.rareUntil=now()+CFG.rareFertMs;
    const field=S.fields[S.env];
    for(let i=0;i<field.length;i++){ if(field[i]) field[i]={t:rollType(S.env),at:field[i].at}; }
    buildField(); save();
    toast('レア肥料！60秒 レアが出やすい✨');
    let left=60; const iv=setInterval(()=>{ left--; if(left<=0||now()>=S.rareUntil){ clearInterval(iv); refreshField(); } },1000);
  });
}

/* ============ デイリー ============ */
let curPage='fieldPage';
function checkDaily(){
  const ready = now()-S.lastDaily>=CFG.dailyCooldown;
  $('#dailyFab').classList.toggle('hidden', !(ready && curPage==='fieldPage'));
}
function claimDaily(){
  if(now()-S.lastDaily<CFG.dailyCooldown) return;
  rewardedAd(()=>{
    const base=Math.max(30, Math.floor(bestValueUnlocked()*8));
    S.lastDaily=now(); S.coins+=base; S.rareUntil=now()+CFG.rareFertMs;
    updateHUD(); save(); checkDaily(); refreshField();
    toast('デイリーボーナス 🪙'+fmt(base)+' ＋レア肥料！');
  });
}
function bestValueUnlocked(){
  let m=1; TYPES.forEach(t=>{ if(S.unlocked[t.env]&&t.value>m&&t.rarity!=='legendary') m=t.value; }); return m;
}

/* ============ IAP ストア ============ */
function grantAdFree(){ S.adFree=true; save(); refreshShop(); if($('#storeModal')) buildStoreBody(); }
function buildStoreBody(){
  const body=$('#storeBody'); if(!body) return; body.innerHTML='';
  const native=!!(window.Native && Native.isNative);
  const price=native ? (Native.purchases.price||'¥500') : '¥500';
  // 広告削除
  const row=document.createElement('div'); row.className='store-row';
  row.innerHTML=`<div class="sr-emo">🚫</div><div class="sr-main"><div class="sr-t">広告を削除</div><div class="sr-d">すべての広告が出なくなる（買い切り）</div></div>`;
  const b=document.createElement('button'); b.className='buy-btn iap';
  if(S.adFree){ b.className='buy-btn max'; b.textContent='購入ずみ'; b.disabled=true; }
  else{
    b.textContent=price;
    b.onclick=()=>{
      if(native){
        b.disabled=true; b.textContent='…';
        Native.purchases.buy().then(r=>{ if(r!=='web'){ grantAdFree(); toast('ありがとうございます！広告を削除しました'); } })
          .catch(()=>{ toast('購入をキャンセルしました'); }).then(()=>{ buildStoreBody(); });
      }else{ grantAdFree(); toast('購入しました（Webプロト）'); }
    };
  }
  row.appendChild(b); body.appendChild(row);
  // 復元
  const rr=document.createElement('div'); rr.className='store-row';
  rr.innerHTML=`<div class="sr-emo">↩️</div><div class="sr-main"><div class="sr-t">購入を復元</div><div class="sr-d">機種変更などで購入を元に戻す</div></div>`;
  const rb=document.createElement('button'); rb.className='buy-btn'; rb.textContent='復元';
  rb.onclick=()=>{ if(native){ Native.purchases.restore().then(()=>toast('復元を確認しました')); } else toast('Web版では不要です'); };
  rr.appendChild(rb); body.appendChild(rr);
}
function openStore(){ buildStoreBody(); $('#storeModal').classList.remove('hidden'); }

/* ============ トースト & 音 ============ */
let toastT;
function toast(msg){
  const t=$('#toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),1800);
}
let AC;
function beep(rarity){
  if(S.muted) return;
  try{
    AC=AC||new (window.AudioContext||window.webkitAudioContext)();
    const map={common:660,uncommon:780,rare:920,epic:1040,legendary:1240};
    const f=map[rarity]||660;
    const o=AC.createOscillator(), g=AC.createGain();
    o.type='triangle'; o.frequency.value=f;
    o.connect(g); g.connect(AC.destination);
    g.gain.setValueAtTime(0.0001,AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.14,AC.currentTime+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001,AC.currentTime+0.22);
    o.start(); o.stop(AC.currentTime+0.24);
  }catch(_){}
}

/* ============ ナビ ============ */
function go(pageId){
  curPage=pageId;
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===pageId));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.page===pageId));
  if(pageId==='zukanPage') buildZukan();
  if(pageId==='shopPage') buildShop();
  checkDaily();
}

/* ============ 初期化 ============ */
function init(){
  load();
  plantEmpty(S.fields[S.env]);
  ENVS.forEach(e=>{ if(S.unlocked[e.id]) plantEmpty(S.fields[e.id]); });
  updateHUD(); buildEnvTabs(); buildField(); checkDaily();
  $('#muteBtn').textContent=S.muted?'🔇':'🔊';

  $('#harvestAll').onclick=harvestAll;
  $('#waterAd').onclick=waterBoost;
  $('#rareAd').onclick=rareFert;
  $('#dailyFab').onclick=claimDaily;
  $('#muteBtn').onclick=()=>{ S.muted=!S.muted; $('#muteBtn').textContent=S.muted?'🔇':'🔊'; save(); };
  $('#storeClose').onclick=()=>$('#storeModal').classList.add('hidden');
  document.querySelectorAll('.nav-btn').forEach(b=>b.onclick=()=>go(b.dataset.page));

  // メインループ
  setInterval(()=>{ if(!document.hidden) refreshField(); },1000);
  setInterval(checkDaily,60000);
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden){ refreshField(); updateHUD(); checkDaily(); } });

  // ネイティブ連携（広告/課金）
  if(window.Native){
    Native.onAdsRemoved=()=>{ S.adFree=true; save(); if($('#shopPage').classList.contains('active')) buildShop(); };
    if(Native.ads && Native.ads.removed) S.adFree=true;
    if(Native.isNative){
      Native.initAds();
      const att=()=>{ Native.requestATT(); document.removeEventListener('pointerdown',att); };
      document.addEventListener('pointerdown',att,{once:true});
    }
  }

  // 初回だけウェルカム
  if(!S.seenIntro){ S.seenIntro=true; save(); setTimeout(()=>toast('畑をタップしておじさんを収穫しよう！🌱'),500); }
}
document.addEventListener('DOMContentLoaded',init);
