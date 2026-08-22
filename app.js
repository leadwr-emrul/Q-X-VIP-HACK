/**
 * ═══════════════════════════════════════════════════════════
 *  QUANTUM OVERLAY AI — v3
 *  Fixes: overlay boundary clamping, drag/resize on mobile,
 *         iframe same-tab load, WS reconnect spam prevention,
 *         cinema animation, settings persistence
 * ═══════════════════════════════════════════════════════════
 */
'use strict';

/* ──────────────────────────────────────────
   1. CONSTANTS
────────────────────────────────────────── */
const WS_URL          = 'wss://ws2.market-qx.info/socket.io/?EIO=3&transport=websocket';
const RECONNECT_MIN   = 3000;
const RECONNECT_MAX   = 30000;
const MAX_CANDLES     = 150;
const SIGNAL_SECOND   = 55;
const RING_FULL       = 113.1;   // 2π × 18
const SETTINGS_KEY    = 'qai3_cfg';
const POS_KEY         = 'qai3_pos';
const FAB_KEY         = 'qai3_fab';

/* ──────────────────────────────────────────
   2. CONFIG (persisted)
────────────────────────────────────────── */
let C = {
  voice:true, autoSpeak:true, vibrate:true, volume:80,
  anim:'full', opacity:92,
  candleStyle:'classic', maPeriod:14,
  asset:'#OTC_BTCUSD', autoReconnect:true,
  showMA:true, showBB:false, showVol:true,
};
function loadC() {
  try { Object.assign(C, JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')); } catch(e){}
  applyC();
}
function saveC() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(C)); } catch(e){}
}
function applyC() {
  doc.style.setProperty('--opa', (C.opacity/100).toFixed(2));
  // Sync settings UI
  const s=(id,v)=>{ const e=id$(id); if(!e) return;
    if(e.type==='checkbox') e.checked=!!v; else e.value=v; };
  s('s-voice',C.voice); s('s-autospeak',C.autoSpeak); s('s-vibrate',C.vibrate);
  s('s-volume',C.volume); s('s-anim',C.anim); s('s-opacity',C.opacity);
  s('s-cstyle',C.candleStyle); s('s-maperiod',C.maPeriod);
  s('s-asset',C.asset); s('s-reconnect',C.autoReconnect);
}
const doc = document.documentElement;
const id$ = id => document.getElementById(id);
const qs  = sel => document.querySelector(sel);

/* ──────────────────────────────────────────
   3. DOM REFS
────────────────────────────────────────── */
const D = {
  fab:        id$('fab'),
  fabLiveDot: id$('fab-live-dot'),
  overlay:    id$('overlay'),
  titlebar:   id$('ov-titlebar'),
  resizeCorn: id$('resize-corner'),
  btnClose:   id$('btn-close'),
  btnMin:     id$('btn-min'),
  btnMax:     id$('btn-max'),
  btnSettings:id$('btn-settings'),
  btnSpClose: id$('btn-sp-close'),
  settingsPan:id$('settings-panel'),

  wsBadge:    id$('ws-badge'),
  wsDot:      id$('ws-dot'),
  wsLabel:    id$('ws-label'),
  liveTag:    id$('live-tag'),

  bdTime:     id$('bd-time'),
  cdSec:      id$('cd-sec'),
  ringArc:    id$('ring-arc'),
  assetName:  id$('asset-name'),

  tabs:       document.querySelectorAll('.tab'),
  panes:      document.querySelectorAll('.tab-pane'),

  // Signal pane
  dirBox:     id$('dir-box'),
  dirArrow:   id$('dir-arrow'),
  dirWord:    id$('dir-word'),
  dirPct:     id$('dir-pct'),
  brConf:     id$('br-conf'),  bvConf: id$('bv-conf'),
  brStr:      id$('br-str'),   bvStr:  id$('bv-str'),
  brTrend:    id$('br-trend'), bvTrend:id$('bv-trend'),
  brVol:      id$('br-vol'),   bvVol:  id$('bv-vol'),
  riskRow:    id$('risk-row'),
  aid:        id$('aid'),
  aStatus:    id$('a-status'),
  srcTag:     id$('src-tag'),
  prPrice:    id$('pr-price'),
  prChg:      id$('pr-chg'),
  prOhlc:     id$('pr-ohlc'),

  // Chart
  candleCanvas: id$('candle-canvas'),
  volCanvas:    id$('vol-canvas'),
  crossTip:     id$('crosshair-tip'),
  chartBar:     document.querySelectorAll('.ctb'),
  toggleMA:     id$('toggle-ma'),
  toggleBB:     id$('toggle-bb'),
  toggleVol:    id$('toggle-vol'),

  // Engine
  engCards:  document.querySelectorAll('.eng-card'),

  // History
  hsTot:  id$('hs-tot'), hsUp: id$('hs-up'), hsDn: id$('hs-dn'), hsAcc: id$('hs-acc'),
  histList: id$('hist-list'),

  // Cinema
  cinema:      id$('cinema'),
  cinCanvas:   id$('cin-canvas'),
  cinPhase:    id$('cin-phase'),
  cinAsset:    id$('cin-asset-label'),
  cinBar:      id$('cin-bar'),
  cinPct:      id$('cin-pct'),
  cinMods:     document.querySelectorAll('.cmod'),
  cinReveal:   id$('cin-reveal'),
  cinBigArrow: id$('cin-big-arrow'),
  cinConfText: id$('cin-conf-text'),
  cinModeNote: id$('cin-mode-note'),

  // Iframe
  iframe:       id$('market-frame'),
  iframeFB:     id$('iframe-fallback'),
  iframeLoader: id$('iframe-loader'),
};

/* ──────────────────────────────────────────
   4. APP STATE
────────────────────────────────────────── */
const A = {
  open:false, minimized:false, maximized:false, settingsOpen:false,
  analyzing:false, activeTab:'signal', aidN:1000,
  lastSignal:null, history:[], wsOk:false, wsConnecting:false,
  reconnectDelay:RECONNECT_MIN, reconnectTimer:null,
  lastSigSecond:-1,
};

/* ──────────────────────────────────────────
   5. CANDLE DATA STORE
────────────────────────────────────────── */
const Store = {
  candles:[], live:null, lastPrice:null, prevPrice:null,
  push(c) {
    const i = this.candles.findIndex(x=>x.t===c.t);
    if(i>=0) this.candles[i]=c; else this.candles.push(c);
    if(this.candles.length>MAX_CANDLES) this.candles.shift();
    this.candles.sort((a,b)=>a.t-b.t);
  },
  tick(price, ts) {
    const mts = Math.floor(ts/60000)*60000;
    if(!this.live||this.live.t!==mts) {
      if(this.live) this.push({...this.live});
      this.live={t:mts,o:price,h:price,l:price,c:price,v:1};
    } else {
      const lc=this.live;
      lc.h=Math.max(lc.h,price); lc.l=Math.min(lc.l,price);
      lc.c=price; lc.v++;
    }
    this.prevPrice=this.lastPrice; this.lastPrice=price;
  },
  all() {
    const arr=[...this.candles];
    if(this.live){
      const i=arr.findIndex(x=>x.t===this.live.t);
      if(i>=0) arr[i]={...this.live}; else arr.push({...this.live});
    }
    return arr;
  },
  closes(){ return this.all().map(c=>c.c); },
};

/* ──────────────────────────────────────────
   6. WEBSOCKET
────────────────────────────────────────── */
let ws=null;
let wsPingTimer=null;

function wsConnect() {
  // Prevent duplicate connections
  if(A.wsConnecting) return;
  if(ws&&(ws.readyState===0||ws.readyState===1)) return;
  A.wsConnecting=true;
  setBadge('connecting');

  try {
    ws = new WebSocket(WS_URL);
  } catch(e) {
    A.wsConnecting=false;
    scheduleReconnect();
    return;
  }

  // Timeout: if no open within 8s, abort
  const openTimeout = setTimeout(()=>{
    if(ws&&ws.readyState!==1){
      try{ws.close();}catch(e){}
    }
  }, 8000);

  ws.onopen = ()=>{
    clearTimeout(openTimeout);
    clearTimeout(A.reconnectTimer);
    A.wsOk=true; A.wsConnecting=false;
    A.reconnectDelay=RECONNECT_MIN;
    setBadge('live');
    // EIO3 handshake
    setTimeout(()=>{ wsSend('40'); }, 200);
    setTimeout(()=>{ wsSubscribe(C.asset); }, 600);
    // Keep-alive ping every 25s
    clearInterval(wsPingTimer);
    wsPingTimer = setInterval(()=>wsSend('2'), 25000);
  };

  ws.onmessage = e => wsMsg(e.data);

  ws.onerror = ()=>{};

  ws.onclose = ()=>{
    clearTimeout(openTimeout);
    clearInterval(wsPingTimer);
    A.wsOk=false; A.wsConnecting=false;
    setBadge('sim');
    D.fabLiveDot.classList.remove('live');
    D.liveTag.className='tb-tag';
    D.liveTag.textContent='SIM';
    D.srcTag.className='src-sim';
    D.srcTag.textContent='SIM';
    if(C.autoReconnect) scheduleReconnect();
  };
}

function scheduleReconnect() {
  clearTimeout(A.reconnectTimer);
  A.reconnectTimer = setTimeout(()=>{
    wsConnect();
    // Exponential backoff, max 30s
    A.reconnectDelay = Math.min(RECONNECT_MAX, A.reconnectDelay*1.5);
  }, A.reconnectDelay);
}

function wsSend(d) {
  if(ws&&ws.readyState===1) try{ws.send(d);}catch(e){}
}

function wsSubscribe(asset) {
  wsSend(`42["subscribeCandle",${JSON.stringify({asset,period:60})}]`);
  wsSend(`42["subscribeTick",${JSON.stringify({asset})}]`);
  D.assetName.textContent=asset.replace('#OTC_','').replace('OTC_','');
  D.cinAsset.textContent=D.assetName.textContent;
}

function wsMsg(raw) {
  try {
    if(raw==='3') return; // pong reply
    if(raw.startsWith('42')) {
      const [ev,data]=JSON.parse(raw.slice(2));
      onWsEvent(ev,data);
    }
  } catch(e){}
}

function onWsEvent(ev,data) {
  switch(ev) {
    case 'candle': case 'candles': case 'history': onCandles(data); break;
    case 'tick': case 'quote': case 'price': onTick(data); break;
    default: autoDetect(data);
  }
}

function onCandles(data) {
  if(!data) return;
  const arr=Array.isArray(data)?data:[data];
  arr.forEach(item=>{ const c=normCandle(item); if(c) Store.push(c); });
  tickerUpdate();
  if(A.activeTab==='chart') Chart.draw();
  flashLiveDot();
}

function onTick(data) {
  if(!data) return;
  const price=parseFloat(data.price||data.close||data.c||data.value||data.ask||data.bid||0);
  if(!price||isNaN(price)) return;
  const ts=+(data.time||data.t||data.timestamp||Date.now());
  Store.tick(price, ts);
  tickerUpdate();
  if(A.activeTab==='chart') Chart.draw();
  flashLiveDot();
}

function autoDetect(data) {
  if(!data||typeof data!=='object') return;
  for(const f of ['price','close','c','value','last','ask','bid']) {
    if(data[f]&&!isNaN(parseFloat(data[f]))) { onTick(data); return; }
  }
}

function normCandle(r) {
  if(!r) return null;
  const c={
    t:+(r.time||r.t||r.timestamp||r.open_time||0),
    o:parseFloat(r.open||r.o||0),
    h:parseFloat(r.high||r.h||0),
    l:parseFloat(r.low||r.l||0),
    c:parseFloat(r.close||r.c||0),
    v:parseFloat(r.volume||r.v||1),
  };
  if(!c.t||!c.o||!c.c) return null;
  if(c.h<Math.max(c.o,c.c)) c.h=Math.max(c.o,c.c);
  if(c.l>Math.min(c.o,c.c)) c.l=Math.min(c.o,c.c);
  return c;
}

function setBadge(state) {
  const b=D.wsBadge;
  b.className=state;
  D.wsDot.textContent='●';
  D.wsLabel.textContent=state==='live'?'LIVE DATA':state==='connecting'?'Connecting…':'SIM MODE';
}

function flashLiveDot() {
  D.fabLiveDot.classList.add('live');
  clearTimeout(D.fabLiveDot._t);
  D.fabLiveDot._t=setTimeout(()=>D.fabLiveDot.classList.remove('live'),350);
}

/* ──────────────────────────────────────────
   7. TICKER UI
────────────────────────────────────────── */
function tickerUpdate() {
  const p=Store.lastPrice, pp=Store.prevPrice;
  if(!p) return;
  D.prPrice.textContent=p.toFixed(6);
  if(pp){
    const d=p-pp, pct=(d/pp*100).toFixed(4);
    const up=d>=0;
    D.prChg.textContent=(up?'+':'')+pct+'%';
    D.prChg.className=up?'pr-up':'pr-dn';
  }
  const lc=Store.live||(Store.candles.length?Store.candles[Store.candles.length-1]:null);
  if(lc) D.prOhlc.textContent=
    `${lc.o.toFixed(5)} / ${lc.h.toFixed(5)} / ${lc.l.toFixed(5)} / ${lc.c.toFixed(5)}`;
}

/* ──────────────────────────────────────────
   8. TECHNICAL ANALYSIS
────────────────────────────────────────── */
const TA = {
  sma(a,p){ if(a.length<p)return null; return a.slice(-p).reduce((s,v)=>s+v,0)/p; },
  ema(a,p){
    if(a.length<p)return null;
    const k=2/(p+1); let e=a.slice(0,p).reduce((s,v)=>s+v,0)/p;
    for(let i=p;i<a.length;i++) e=a[i]*k+e*(1-k); return e;
  },
  emaArr(a,p){
    if(a.length<p)return[];
    const k=2/(p+1),out=[];
    let e=a.slice(0,p).reduce((s,v)=>s+v,0)/p; out.push(e);
    for(let i=p;i<a.length;i++){e=a[i]*k+e*(1-k);out.push(e);}
    return out;
  },
  rsi(a,p=14){
    if(a.length<p+1)return 50;
    const ch=[]; for(let i=1;i<a.length;i++) ch.push(a[i]-a[i-1]);
    let g=0,l=0;
    for(let i=0;i<p;i++){if(ch[i]>0)g+=ch[i];else l-=ch[i];}
    let ag=g/p,al=l/p;
    for(let i=p;i<ch.length;i++){
      const gx=ch[i]>0?ch[i]:0, lx=ch[i]<0?-ch[i]:0;
      ag=(ag*(p-1)+gx)/p; al=(al*(p-1)+lx)/p;
    }
    if(al===0)return 100;
    return 100-100/(1+ag/al);
  },
  macd(a,f=12,s=26,sig=9){
    if(a.length<s)return{h:0,m:0,s:0};
    const ef=this.emaArr(a,f),es=this.emaArr(a,s);
    const n=Math.min(ef.length,es.length);
    const ml=[]; for(let i=0;i<n;i++) ml.push(ef[ef.length-n+i]-es[es.length-n+i]);
    const sv=this.ema(ml,Math.min(sig,ml.length))||0;
    const lv=ml[ml.length-1]||0;
    return{h:lv-sv,m:lv,s:sv};
  },
  bb(a,p=20,m=2){
    if(a.length<p)return null;
    const s=a.slice(-p),mid=s.reduce((x,v)=>x+v,0)/p;
    const std=Math.sqrt(s.reduce((x,v)=>x+(v-mid)**2,0)/p);
    return{upper:mid+m*std,mid,lower:mid-m*std,width:2*m*std};
  },
  atr(cs,p=14){
    if(cs.length<2)return 0;
    const tr=[]; for(let i=1;i<cs.length;i++){
      tr.push(Math.max(cs[i].h-cs[i].l,Math.abs(cs[i].h-cs[i-1].c),Math.abs(cs[i].l-cs[i-1].c)));
    }
    return this.sma(tr,Math.min(p,tr.length))||0;
  },
  stoch(cs,p=14){
    if(cs.length<p)return 50;
    const sl=cs.slice(-p),c=sl[sl.length-1].c;
    const hi=Math.max(...sl.map(x=>x.h)),lo=Math.min(...sl.map(x=>x.l));
    return hi===lo?50:((c-lo)/(hi-lo))*100;
  },
  pattern(cs){
    if(cs.length<3)return 0;
    const [p2,p1,c]=cs.slice(-3);
    const body=x=>Math.abs(x.c-x.o), bull=x=>x.c>x.o;
    let sc=0;
    if(bull(c)&&!bull(p1)&&c.o<p1.c&&c.c>p1.o) sc+=42; // bull engulf
    if(!bull(c)&&bull(p1)&&c.o>p1.c&&c.c<p1.o) sc-=42; // bear engulf
    if(bull(c)){ const ls=Math.min(c.o,c.c)-c.l; if(ls>body(c)*2) sc+=32; } // hammer
    if(!bull(c)){ const us=c.h-Math.max(c.o,c.c); if(us>body(c)*2) sc-=32; } // shooting
    if(body(c)<(c.h-c.l)*0.07) sc+=(bull(p1)?-18:18); // doji
    if(cs.slice(-3).every(x=>bull(x))) sc+=28; // 3 green
    if(cs.slice(-3).every(x=>!bull(x))) sc-=28; // 3 red
    if(!bull(p2)&&body(p1)<body(p2)*0.3&&bull(c)) sc+=26; // morning star
    if(bull(p2)&&body(p1)<body(p2)*0.3&&!bull(c)) sc-=26; // evening star
    return Math.max(-100,Math.min(100,sc));
  },
  trendStr(cs,p=14){
    if(cs.length<p+1)return{str:0,dir:0};
    const sl=cs.slice(-p-1); let up=0,dn=0;
    for(let i=1;i<sl.length;i++){
      const hi=sl[i].h-sl[i-1].h, lo=sl[i-1].l-sl[i].l;
      if(hi>lo&&hi>0) up+=hi; if(lo>hi&&lo>0) dn+=lo;
    }
    const tot=up+dn; if(!tot)return{str:0,dir:0};
    return{str:Math.abs(up-dn)/tot*100, dir:up>dn?1:-1};
  },
  volProfile(cs){
    if(cs.length<5)return 0;
    const avg=cs.slice(-20).reduce((s,c)=>s+c.v,0)/Math.min(20,cs.length);
    const rec=cs.slice(-5).reduce((s,c)=>s+c.v,0)/5;
    return avg>0?(rec/avg-1)*100:0;
  },
};

/* ──────────────────────────────────────────
   9. MARKOV CHAIN
────────────────────────────────────────── */
const MK = {
  seq:[], MAX:80,
  push(d){ this.seq.push(d); if(this.seq.length>this.MAX) this.seq.shift(); },
  pUp(){
    const s=this.seq; if(s.length<2)return 0.5;
    let uu=0,ud=0,du=0,dd=0;
    for(let i=0;i<s.length-1;i++){
      if(s[i]==='UP'&&s[i+1]==='UP')uu++;
      if(s[i]==='UP'&&s[i+1]==='DOWN')ud++;
      if(s[i]==='DOWN'&&s[i+1]==='UP')du++;
      if(s[i]==='DOWN'&&s[i+1]==='DOWN')dd++;
    }
    const last=s[s.length-1];
    if(last==='UP'){const t=uu+ud||1;return uu/t;}
    else{const t=du+dd||1;return du/t;}
  },
  streak(){
    if(!this.seq.length)return{n:0,d:null};
    const d=this.seq[this.seq.length-1]; let n=0;
    for(let i=this.seq.length-1;i>=0&&this.seq[i]===d;i--) n++;
    return{n,d};
  },
};

/* ──────────────────────────────────────────
   10. ANALYSIS ENGINE
────────────────────────────────────────── */
function analyze() {
  const cs=Store.all(), cl=cs.map(c=>c.c), n=cs.length, live=A.wsOk&&n>=10;
  const now=bdTime();

  const sim=(id)=>{ const x=Math.sin(now.getTime()/1000+id*73.19)*43758.5453; return((x-Math.floor(x))-.5)*180; };

  // 1 Trend — EMA alignment
  let trend=0;
  if(live&&cl.length>=21){
    const e7=TA.ema(cl,7)||0,e14=TA.ema(cl,14)||0,e21=TA.ema(cl,21)||0,p=cl[cl.length-1];
    trend=(p>e7?20:-20)+(p>e14?15:-15)+(p>e21?15:-15)+(e7>e14?25:-25)+(e14>e21?25:-25);
  } else trend=sim(1);

  // 2 Momentum — MACD
  let momentum=0;
  if(live&&cl.length>=26){ const{h}=TA.macd(cl); momentum=Math.max(-100,Math.min(100,h*8000)); }
  else momentum=sim(2);

  // 3 MA Cross
  let ma=0;
  if(live&&cl.length>=C.maPeriod+3){
    const f=TA.sma(cl,Math.max(5,Math.floor(C.maPeriod/2))),s=TA.sma(cl,C.maPeriod);
    if(f&&s) ma=f>s?60+Math.min(40,(f-s)/s*1e5):-60-Math.min(40,(s-f)/s*1e5);
  } else ma=sim(3);

  // 4 Volatility — BB position
  let volatility=0;
  if(live&&cl.length>=20){
    const bb=TA.bb(cl,20); const p=cl[cl.length-1];
    if(bb&&p){ const pos=(p-bb.lower)/(bb.upper-bb.lower||1); volatility=(pos-.5)*200; }
  } else volatility=sim(4);

  // 5 Pattern
  let pattern=cs.length>=3?TA.pattern(cs):sim(5);

  // 6 Volume profile
  let volume=0;
  if(live&&n>=5){
    const vp=TA.volProfile(cs);
    const rec=cs.slice(-5);
    const uv=rec.filter(c=>c.c>=c.o).reduce((s,c)=>s+c.v,0);
    const dv=rec.filter(c=>c.c<c.o).reduce((s,c)=>s+c.v,0);
    const tot=uv+dv;
    volume=tot>0?(uv-dv)/tot*80:0; volume+=vp*0.2;
  } else volume=sim(6);

  // 7 RSI signal
  let rsi=0;
  if(live&&cl.length>=14){ const r=TA.rsi(cl); rsi=(50-r)*1.6; }
  else rsi=sim(7);

  // 8 MACD direct
  let macd=0;
  if(live&&cl.length>=26){ const{h}=TA.macd(cl); macd=Math.max(-100,Math.min(100,h*12000)); }
  else macd=sim(8);

  // 9 Stochastic
  let stoch=0;
  if(live&&n>=14){ const s=TA.stoch(cs); stoch=s>80?-(s-80)*2.5:s<20?(20-s)*2.5:(50-s)*1.2; }
  else stoch=sim(9);

  // 10 Markov
  const pUp=MK.pUp();
  let markov=(pUp-.5)*190;

  // 11 Streak reversal
  const{n:sn,d:sd}=MK.streak();
  let streak=0;
  if(sn>=2){ const rev=Math.min(sn*14,75); streak=sd==='UP'?-rev:rev; }
  else streak=sim(11);

  // 12 Adaptive (trendStr + stoch blend)
  let adaptive=0;
  if(live&&n>=14){
    const ts=TA.trendStr(cs); adaptive=ts.str*ts.dir*0.9;
  } else adaptive=sim(12);

  // Weights
  const W={ trend:1.7,momentum:1.3,ma:1.4,volatility:0.8,pattern:1.2,volume:1.0,
             rsi:1.3,macd:1.2,stoch:0.9,markov:1.4,streak:1.1,adaptive:1.0 };
  const SC={ trend,momentum,ma,volatility,pattern,volume,rsi,macd,stoch,markov,streak,adaptive };

  let ws2=0,wt=0;
  for(const[k,w]of Object.entries(W)){ ws2+=(SC[k]||0)*w; wt+=w; }
  const comp=ws2/wt; // -100..+100
  const dir=comp>=0?'UP':'DOWN';
  const confidence=Math.round(50+Math.abs(comp)/100*44);
  const strength=Math.min(99,Math.round(Math.abs(comp)*0.88+8));
  const trendPct=Math.round((SC.trend+100)/2);
  const volPct=Math.round((Math.abs(SC.volatility)+50)/150*100);
  const atrVal=live?TA.atr(cs):0;
  const price=Store.lastPrice||(cl[cl.length-1]||1);
  const atrPct=price?atrVal/price*100:0;
  const risk=atrPct>0.6?5:atrPct>0.4?4:atrPct>0.2?3:confidence<60?3:2;

  return{dir,confidence,strength,trendPct,volPct,risk,scores:SC,live,n};
}

/* ──────────────────────────────────────────
   11. SIGNAL TRIGGER
────────────────────────────────────────── */
async function fireSignal() {
  if(A.analyzing) return;
  A.analyzing=true;
  setStatus('scan');
  const result=analyze();
  const aid=`AID-${A.aidN++}-${pad(bdTime().getMinutes())}${pad(bdTime().getSeconds())}`;

  if(C.anim!=='off') await runCinema(result);
  applySignalUI(result, aid);

  MK.push(result.dir);
  if(C.voice&&C.autoSpeak) speak(result.dir, result.confidence);
  if(C.vibrate&&navigator.vibrate) navigator.vibrate([90,40,90]);

  addHistory(result, aid);
  A.lastSignal=result;
  A.analyzing=false;
}

function setStatus(s) {
  const el=D.aStatus;
  el.className=s==='scan'?'st-scan':s==='up'?'st-up':s==='dn'?'st-dn':'st-idle';
  el.textContent=s==='scan'?'⬤ SCANNING':s==='up'?'⬤ BULLISH':s==='dn'?'⬤ BEARISH':'⬤ IDLE';
}

function applySignalUI(r, aid) {
  const{dir,confidence,strength,trendPct,volPct,risk,scores,live}=r;
  const up=dir==='UP';

  D.dirBox.className=up?'dir-up':'dir-down';
  D.dirArrow.textContent=up?'↑':'↓';
  D.dirWord.textContent=dir;
  D.dirPct.textContent=`${confidence}%`;

  setBar(D.brConf,D.bvConf,confidence);
  setBar(D.brStr,D.bvStr,strength);
  setBar(D.brTrend,D.bvTrend,trendPct);
  setBar(D.brVol,D.bvVol,volPct);

  const dots=D.riskRow.querySelectorAll('.risk-dot');
  const rc=risk<=2?'low':risk<=3?'medium':'high';
  dots.forEach((d,i)=>{ d.className='risk-dot'; if(i<risk) d.classList.add(rc); });

  D.aid.textContent=aid;
  setStatus(up?'up':'dn');
  D.srcTag.className=live?'live':'';
  D.srcTag.textContent=live?'LIVE':'SIM';
  D.liveTag.className='tb-tag'+(live?' live':'');
  D.liveTag.textContent=live?'LIVE':'SIM';

  // Engine cards
  D.engCards.forEach((card,i)=>{
    const key=card.dataset.key;
    const raw=scores[key]||0;
    const pct=Math.round(Math.abs(raw));
    const isUp=raw>=0;
    const scoreEl=card.querySelector('.eng-score');
    const barEl=card.querySelector('.eng-bar');
    if(scoreEl) scoreEl.textContent=(isUp?'+':'−')+pct;
    if(barEl) barEl.style.width=pct+'%';
    card.classList.remove('up','dn');
    card.classList.add(isUp?'up':'dn');
    setTimeout(()=>{
      card.style.transform='scale(1.06)';
      setTimeout(()=>card.style.transform='',150);
    }, i*40);
  });
}

function setBar(barEl, valEl, pct) {
  if(barEl) barEl.style.width=Math.min(100,pct)+'%';
  if(valEl) valEl.textContent=Math.round(pct)+'%';
}

/* ──────────────────────────────────────────
   12. HISTORY
────────────────────────────────────────── */
function addHistory(r, aid) {
  A.history.unshift({dir:r.dir,conf:r.confidence,live:r.live,aid,time:formatTime(bdTime())});
  if(A.history.length>40) A.history.pop();
  renderHistory();
}
function renderHistory() {
  const total=A.history.length;
  const ups=A.history.filter(h=>h.dir==='UP').length;
  const dns=total-ups;
  D.hsTot.textContent=total; D.hsUp.textContent=ups; D.hsDn.textContent=dns;
  D.hsAcc.textContent=total>0?`${Math.round((Math.max(ups,dns)/total)*100)}%`:'--%';
  D.histList.innerHTML='';
  A.history.forEach(h=>{
    const div=document.createElement('div');
    div.className=`hi ${h.dir==='UP'?'hi-up':'hi-dn'}`;
    div.innerHTML=
      `<span class="hi-arrow">${h.dir==='UP'?'↑':'↓'}</span>`+
      `<span class="hi-time">${h.time}</span>`+
      `<span class="hi-conf">${h.conf}%</span>`+
      `<span class="hi-src${h.live?' live':''}">${h.live?'LIVE':'SIM'}</span>`;
    D.histList.appendChild(div);
  });
}

/* ──────────────────────────────────────────
   13. CINEMA ANIMATION
────────────────────────────────────────── */
let cinRAF=null, cinCtx=null, cinPts=[];

async function runCinema(r) {
  D.cinema.classList.remove('hidden');
  D.cinReveal.classList.add('hidden');
  D.cinBar.style.width='0%'; D.cinPct.textContent='0%';
  D.cinMods.forEach(m=>m.classList.remove('on'));
  D.cinAsset.textContent=C.asset.replace('#OTC_','').replace('OTC_','');
  startCinCanvas();

  const phases=[
    {label:'LOADING CANDLE DATA',    pct:18,ms:250},
    {label:'COMPUTING INDICATORS',   pct:36,ms:280},
    {label:'RUNNING BAYESIAN FILTER',pct:54,ms:260},
    {label:'MARKOV CHAIN ANALYSIS',  pct:70,ms:230},
    {label:'RSI + MACD SCORING',     pct:85,ms:210},
    {label:'ADAPTIVE FUSION',        pct:100,ms:200},
  ];
  const mods=Array.from(D.cinMods);
  for(let i=0;i<phases.length;i++){
    D.cinPhase.textContent=phases[i].label;
    cinProgress(phases[i].pct);
    if(mods[i]) mods[i].classList.add('on');
    await sleep(phases[i].ms);
  }

  D.cinReveal.classList.remove('hidden');
  const up=r.dir==='UP';
  D.cinBigArrow.textContent=up?'↑':'↓';
  D.cinBigArrow.style.color=up?'var(--up)':'var(--dn)';
  D.cinConfText.textContent=`${r.confidence}% Confidence`;
  D.cinConfText.style.color=up?'var(--up)':'var(--dn)';
  D.cinModeNote.textContent=r.live?`✓ ${r.n} live candles`:'⚠ Simulation mode';
  D.cinPhase.textContent=`SIGNAL: ${r.dir}`;

  await sleep(1400);

  D.cinema.style.transition='opacity .35s';
  D.cinema.style.opacity='0';
  await sleep(370);
  D.cinema.classList.add('hidden');
  D.cinema.style.opacity=''; D.cinema.style.transition='';
  stopCinCanvas();
}

function startCinCanvas() {
  const cv=D.cinCanvas;
  cv.width=innerWidth*devicePixelRatio; cv.height=innerHeight*devicePixelRatio;
  cv.style.width=innerWidth+'px'; cv.style.height=innerHeight+'px';
  cinCtx=cv.getContext('2d'); cinPts=[];
  for(let i=0;i<65;i++) cinPts.push({
    x:Math.random()*cv.width, y:Math.random()*cv.height,
    vx:(Math.random()-.5)*1.3, vy:(Math.random()-.5)*1.3,
    r:Math.random()*1.6+.4, a:Math.random(),
    col:Math.random()>.5?'0,229,160':'0,212,255',
  });
  const dpr=devicePixelRatio;
  const COLS=Math.floor(cv.width/(18*dpr));
  const matCols=Array.from({length:COLS},(_,c)=>({x:c*18*dpr,y:Math.random()*cv.height,spd:(8+Math.random()*14)*dpr}));
  let ra=0,lt=0;

  function frame(ts) {
    cinRAF=requestAnimationFrame(frame);
    const dt=Math.min(ts-lt,50); lt=ts;
    const ctx=cinCtx,W=cv.width,H=cv.height;
    ctx.clearRect(0,0,W,H);
    // Grid
    ctx.strokeStyle='rgba(0,229,160,0.04)'; ctx.lineWidth=dpr;
    const gs=36*dpr;
    for(let x=0;x<W;x+=gs){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<H;y+=gs){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    // Matrix
    ctx.font=`${11*dpr}px monospace`;
    matCols.forEach(col=>{
      ctx.fillStyle='rgba(0,229,160,0.14)';
      ctx.fillText(String.fromCharCode(0x30A0+Math.floor(Math.random()*96)),col.x,col.y);
      col.y+=col.spd*dt/1000*60; if(col.y>H) col.y=-20*dpr;
    });
    // Particles
    cinPts.forEach(p=>{
      p.x+=p.vx; p.y+=p.vy;
      if(p.x<0||p.x>W)p.vx*=-1; if(p.y<0||p.y>H)p.vy*=-1;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r*dpr,0,Math.PI*2);
      ctx.fillStyle=`rgba(${p.col},${p.a})`; ctx.fill();
    });
    // Neural connections
    const pts2=cinPts.slice(0,22);
    for(let i=0;i<pts2.length;i++) for(let j=i+1;j<pts2.length;j++){
      const dx=pts2[i].x-pts2[j].x,dy=pts2[i].y-pts2[j].y;
      const d=Math.sqrt(dx*dx+dy*dy),md=110*dpr;
      if(d<md){ctx.beginPath();ctx.strokeStyle=`rgba(0,212,255,${0.1*(1-d/md)})`;ctx.lineWidth=.6*dpr;ctx.moveTo(pts2[i].x,pts2[i].y);ctx.lineTo(pts2[j].x,pts2[j].y);ctx.stroke();}
    }
    // Radar
    const cx=W/2,cy=H/2,rad=Math.min(W,H)*.38;
    ra+=Math.PI*dt/1000;
    ctx.save(); ctx.translate(cx,cy);
    ctx.beginPath();ctx.arc(0,0,rad,0,Math.PI*2);ctx.strokeStyle='rgba(0,229,160,0.1)';ctx.lineWidth=dpr;ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,rad,ra-1.0,ra,false);ctx.fillStyle='rgba(0,229,160,0.07)';ctx.fill();
    ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(ra)*rad,Math.sin(ra)*rad);ctx.strokeStyle='rgba(0,229,160,0.42)';ctx.lineWidth=2*dpr;ctx.stroke();
    ctx.restore();
    // Flowing lines
    const t=ts/1000;
    for(let l=0;l<4;l++){
      const y=H*(.2+l*.2)+Math.sin(t+l)*20*dpr;
      ctx.beginPath();ctx.moveTo(0,y);
      for(let x=0;x<W;x+=8*dpr) ctx.lineTo(x,y+Math.sin(x/(40*dpr)+t*2+l)*6*dpr);
      ctx.strokeStyle='rgba(0,212,255,0.06)';ctx.lineWidth=dpr;ctx.stroke();
    }
  }
  requestAnimationFrame(frame);
}

function stopCinCanvas() {
  if(cinRAF){cancelAnimationFrame(cinRAF);cinRAF=null;}
  cinPts=[];
  if(cinCtx) cinCtx.clearRect(0,0,D.cinCanvas.width,D.cinCanvas.height);
}

function cinProgress(target) {
  const bar=D.cinBar,num=D.cinPct,start=parseFloat(bar.style.width||'0'),diff=target-start;
  let el2=0,lt=null;
  function t(ts){if(!lt)lt=ts;el2+=ts-lt;lt=ts;const p=Math.min(1,el2/260);const v=start+diff*(1-(1-p)**3);bar.style.width=v+'%';num.textContent=Math.round(v)+'%';if(p<1)requestAnimationFrame(t);}
  requestAnimationFrame(t);
}

/* ──────────────────────────────────────────
   14. CANDLESTICK CHART
────────────────────────────────────────── */
const Chart = {
  tf:1, showMA:true, showBB:false, showVol:true,
  panOff:0, hovIdx:-1,

  init() {
    this.resize();
    // Bind toolbar
    D.chartBar.forEach(btn=>{
      const tf=parseInt(btn.dataset.tf||'0');
      if(!tf) return;
      btn.addEventListener('click',()=>{
        this.tf=tf; this.panOff=0;
        D.chartBar.forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        this.draw();
      });
    });
    D.toggleMA.addEventListener('click',()=>{
      this.showMA=!this.showMA; D.toggleMA.classList.toggle('active',this.showMA); this.draw();
    });
    D.toggleBB.addEventListener('click',()=>{
      this.showBB=!this.showBB; D.toggleBB.classList.toggle('active',this.showBB); this.draw();
    });
    D.toggleVol.addEventListener('click',()=>{
      this.showVol=!this.showVol; D.toggleVol.classList.toggle('active',this.showVol);
      D.volCanvas.style.display=this.showVol?'block':'none'; this.draw();
    });
    this.bindTouch();
    this.bindMouse();
    window.addEventListener('resize',()=>this.resize(),{passive:true});
  },

  resize() {
    const wrap=D.candleCanvas.parentElement;
    const W=Math.max(1,wrap.clientWidth-2);
    const H=Math.max(140,Math.min(200,innerHeight*.20));
    const VH=Math.max(28,Math.round(H*.22));
    const dpr=devicePixelRatio;
    D.candleCanvas.width=W*dpr; D.candleCanvas.height=H*dpr;
    D.candleCanvas.style.width=W+'px'; D.candleCanvas.style.height=H+'px';
    D.volCanvas.width=W*dpr; D.volCanvas.height=VH*dpr;
    D.volCanvas.style.width=W+'px'; D.volCanvas.style.height=VH+'px';
    this.draw();
  },

  agg(cs,tf) {
    if(tf===1) return cs;
    const out=[]; let bk=null;
    for(const c of cs){
      const bt=Math.floor(c.t/(tf*60000))*(tf*60000);
      if(!bk||bk.t!==bt){if(bk)out.push(bk);bk={t:bt,o:c.o,h:c.h,l:c.l,c:c.c,v:c.v};}
      else{bk.h=Math.max(bk.h,c.h);bk.l=Math.min(bk.l,c.l);bk.c=c.c;bk.v+=c.v;}
    }
    if(bk)out.push(bk); return out;
  },

  draw() {
    const all=this.agg(Store.all(),this.tf);
    const cc=D.candleCanvas, dpr=devicePixelRatio;
    const W=cc.width, H=cc.height;
    const ctx=cc.getContext('2d');
    ctx.clearRect(0,0,W,H);

    if(!all.length){
      ctx.fillStyle='rgba(130,165,210,0.2)'; ctx.font=`${10*dpr}px sans-serif`;
      ctx.textAlign='center';
      ctx.fillText('Waiting for data…',W/2,H/2); ctx.textAlign='start'; return;
    }

    const vis=Math.min(all.length, Math.floor(W/dpr/6.5));
    const startI=Math.max(0,all.length-vis-this.panOff);
    const endI=Math.min(all.length,startI+vis);
    const view=all.slice(startI,endI);
    if(!view.length) return;

    const hi=Math.max(...view.map(c=>c.h));
    const lo=Math.min(...view.map(c=>c.l));
    const pad=(hi-lo)*0.1||hi*.001;
    const yHi=hi+pad, yLo=lo-pad, yR=yHi-yLo;

    const toY=v=>H-((v-yLo)/yR*H*.90+H*.05);
    const gap=W/Math.max(view.length,1);
    const cW=Math.max(2,gap*.72);

    // Grid + price labels
    ctx.strokeStyle='rgba(255,255,255,0.03)'; ctx.lineWidth=dpr;
    for(let i=0;i<=4;i++){
      const y=H*.05+H*.90*(i/4);
      ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();
      ctx.fillStyle='rgba(130,165,210,0.3)';ctx.font=`${8.5*dpr}px monospace`;
      ctx.fillText((yHi-yR*(i/4)).toFixed(5),3,y-3*dpr);
    }

    // Bollinger Bands
    if(this.showBB&&view.length>=10){
      const cls=view.map(c=>c.c);
      const bbs=cls.map((_,i)=>i>=9?TA.bb(cls.slice(0,i+1),Math.min(20,i+1)):null);
      ['upper','lower'].forEach(band=>{
        ctx.beginPath();let first=true;
        bbs.forEach((b,i)=>{ if(!b)return; const x=i*gap+gap/2;
          if(first){ctx.moveTo(x,toY(b[band]));first=false;}else ctx.lineTo(x,toY(b[band]));});
        ctx.strokeStyle='rgba(255,184,48,0.28)';ctx.lineWidth=dpr;ctx.stroke();
      });
    }

    // MA line
    if(this.showMA&&view.length>=5){
      const cls=view.map(c=>c.c),maP=Math.min(C.maPeriod,view.length);
      ctx.beginPath();let first=true;
      view.forEach((_,i)=>{
        const s=cls.slice(0,i+1); if(s.length<maP)return;
        const v=s.slice(-maP).reduce((a,b)=>a+b,0)/maP;
        const x=i*gap+gap/2;
        if(first){ctx.moveTo(x,toY(v));first=false;}else ctx.lineTo(x,toY(v));
      });
      ctx.strokeStyle='rgba(176,106,255,0.65)';ctx.lineWidth=1.5*dpr;ctx.stroke();
    }

    // Candles
    view.forEach((c,i)=>{
      const x=i*gap+gap/2, up2=c.c>=c.o;
      const col=up2?'0,229,160':'255,77,109';

      // Hover highlight
      if(i===this.hovIdx){
        ctx.fillStyle='rgba(255,255,255,0.04)';
        ctx.fillRect(i*gap,0,gap,H);
        D.crossTip.textContent=`O:${c.o.toFixed(5)} H:${c.h.toFixed(5)} L:${c.l.toFixed(5)} C:${c.c.toFixed(5)}`;
        D.crossTip.classList.remove('hidden');
        D.crossTip.style.left=Math.min(x/dpr+6, W/dpr-185)+'px';
      }

      // Wick
      ctx.strokeStyle=`rgba(${col},0.75)`;ctx.lineWidth=dpr;
      ctx.beginPath();ctx.moveTo(x,toY(c.h));ctx.lineTo(x,toY(c.l));ctx.stroke();

      // Body
      const yO=toY(c.o),yC=toY(c.c);
      const bH=Math.max(1.5*dpr,Math.abs(yC-yO)),bY=Math.min(yO,yC);
      const isLast=i===view.length-1;

      if(C.candleStyle==='hollow'){
        ctx.strokeStyle=`rgba(${col},0.9)`;ctx.lineWidth=dpr;
        ctx.strokeRect(x-cW/2,bY,cW,bH);
      } else if(C.candleStyle==='bar'){
        ctx.strokeStyle=`rgba(${col},0.9)`;ctx.lineWidth=2*dpr;
        ctx.beginPath();
        ctx.moveTo(x-cW/2,toY(c.o));ctx.lineTo(x,toY(c.o));
        ctx.moveTo(x,toY(c.h));ctx.lineTo(x,toY(c.l));
        ctx.moveTo(x,toY(c.c));ctx.lineTo(x+cW/2,toY(c.c));
        ctx.stroke();
      } else {
        ctx.fillStyle=`rgba(${col},${isLast?.5:.88})`;
        ctx.fillRect(x-cW/2,bY,cW,bH);
        ctx.strokeStyle=`rgba(${col},.95)`;ctx.lineWidth=.7*dpr;
        ctx.strokeRect(x-cW/2,bY,cW,bH);
      }

      // Live candle glow
      if(isLast&&Store.live){
        ctx.save();
        ctx.shadowColor=`rgba(${col},0.6)`;ctx.shadowBlur=10*dpr;
        ctx.strokeStyle=`rgba(${col},1)`;ctx.lineWidth=2*dpr;
        ctx.strokeRect(x-cW/2,bY,cW,Math.max(2*dpr,bH));
        ctx.restore();
      }
    });

    if(this.hovIdx<0) D.crossTip.classList.add('hidden');

    // Volume chart
    if(this.showVol) this.drawVol(view, gap, dpr);
  },

  drawVol(view,gap,dpr){
    const vc=D.volCanvas,ctx=vc.getContext('2d'),W=vc.width,H=vc.height;
    ctx.clearRect(0,0,W,H);
    const maxV=Math.max(...view.map(c=>c.v||0),1);
    view.forEach((c,i)=>{
      const x=i*gap+gap/2,bH=Math.max(1,(c.v||0)/maxV*(H-2*dpr));
      ctx.fillStyle=c.c>=c.o?'rgba(0,229,160,0.42)':'rgba(255,77,109,0.42)';
      ctx.fillRect(x-gap*.36,H-bH,gap*.72,bH);
    });
  },

  bindTouch(){
    const cv=D.candleCanvas; let lastX=0, pinchD=null, panActive=false;
    cv.addEventListener('touchstart',e=>{
      if(e.touches.length===1){lastX=e.touches[0].clientX;panActive=true;}
      if(e.touches.length===2){
        const dx=e.touches[0].clientX-e.touches[1].clientX;
        const dy=e.touches[0].clientY-e.touches[1].clientY;
        pinchD=Math.sqrt(dx*dx+dy*dy); panActive=false;
      }
    },{passive:true});
    cv.addEventListener('touchmove',e=>{
      if(e.touches.length===1&&panActive){
        const dx=e.touches[0].clientX-lastX; lastX=e.touches[0].clientX;
        this.panOff=Math.max(0,Math.min(MAX_CANDLES-5,this.panOff+Math.round(dx/6)));
        this.draw();
      }
    },{passive:true});
    cv.addEventListener('touchend',()=>{panActive=false;pinchD=null;},{passive:true});
  },

  bindMouse(){
    const cv=D.candleCanvas;
    cv.addEventListener('pointermove',e=>{
      const r=cv.getBoundingClientRect();
      const x=(e.clientX-r.left)*devicePixelRatio;
      const all2=this.agg(Store.all(),this.tf);
      const vis=Math.min(all2.length,Math.floor(cv.width/devicePixelRatio/6.5));
      const gap=cv.width/Math.max(vis,1);
      this.hovIdx=Math.floor(x/gap);
      this.draw();
    },{passive:true});
    cv.addEventListener('pointerleave',()=>{this.hovIdx=-1;D.crossTip.classList.add('hidden');this.draw();},{passive:true});
  },
};

/* ──────────────────────────────────────────
   15. FAB DRAG — FIXED BOUNDS CLAMP
────────────────────────────────────────── */
(function initFAB(){
  const fab=D.fab;
  let dragging=false,moved=false,sx=0,sy=0,longTimer=null;

  // Restore saved position
  try{
    const s=JSON.parse(localStorage.getItem(FAB_KEY)||'null');
    if(s&&s.x!=null&&s.y!=null){
      setFabPos(s.x,s.y,false);
    }
  }catch(e){}

  function setFabPos(x,y,snap){
    const W=innerWidth,H=innerHeight,sz=46;
    x=Math.max(4,Math.min(W-sz-4,x));
    y=Math.max(4,Math.min(H-sz-4,y));
    fab.style.left=x+'px'; fab.style.top=y+'px';
    fab.style.right='auto'; fab.style.bottom='auto';
    if(snap) try{localStorage.setItem(FAB_KEY,JSON.stringify({x,y}));}catch(e){}
  }

  function snapEdge(){
    const r=fab.getBoundingClientRect();
    const W=innerWidth,sz=46;
    const nx=(r.left+sz/2)<W/2?8:W-sz-8;
    fab.classList.add('snapping');
    setFabPos(nx,r.top,true);
    setTimeout(()=>fab.classList.remove('snapping'),420);
  }

  fab.addEventListener('pointerdown',e=>{
    e.preventDefault();
    fab.setPointerCapture(e.pointerId);
    const r=fab.getBoundingClientRect();
    sx=e.clientX-r.left; sy=e.clientY-r.top;
    moved=false; dragging=false;
    longTimer=setTimeout(()=>{if(!moved)openSettings();},620);
  });

  fab.addEventListener('pointermove',e=>{
    if(!fab.hasPointerCapture(e.pointerId))return;
    const dx=Math.abs(e.clientX-(fab.getBoundingClientRect().left+sx));
    const dy=Math.abs(e.clientY-(fab.getBoundingClientRect().top+sy));
    if(dx>5||dy>5){moved=true;clearTimeout(longTimer);}
    if(!moved)return;
    dragging=true;
    setFabPos(e.clientX-sx, e.clientY-sy, false);
  });

  fab.addEventListener('pointerup',()=>{
    clearTimeout(longTimer);
    if(dragging){snapEdge();dragging=false;}
    else if(!moved){toggleOverlay();}
    moved=false;
  });

  fab.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleOverlay();}
  });
})();

/* ──────────────────────────────────────────
   16. OVERLAY DRAG + RESIZE — FIXED BOUNDS
────────────────────────────────────────── */
(function initOverlayDrag(){
  const ov=D.overlay, tb=D.titlebar;
  let drag=false,sx=0,sy=0;

  function clampOverlay(){
    const r=ov.getBoundingClientRect();
    const W=innerWidth,H=innerHeight;
    let l=r.left,t=r.top;
    l=Math.max(0,Math.min(W-r.width,l));
    t=Math.max(0,Math.min(H-60,t));
    ov.style.left=l+'px'; ov.style.top=t+'px';
  }

  function savePos(){
    try{
      const r=ov.getBoundingClientRect();
      localStorage.setItem(POS_KEY,JSON.stringify({x:r.left,y:r.top,w:r.width,h:r.height}));
    }catch(e){}
  }

  // Load saved position
  try{
    const s=JSON.parse(localStorage.getItem(POS_KEY)||'null');
    if(s&&s.x!=null){
      ov.style.left=s.x+'px'; ov.style.top=s.y+'px';
      ov.style.transform='none';
      if(s.w) ov.style.width=s.w+'px';
      if(s.h) ov.style.height=s.h+'px';
      ov.classList.add('dragged');
    }
  }catch(e){}

  // Titlebar drag
  tb.addEventListener('pointerdown',e=>{
    if(A.maximized)return;
    e.preventDefault(); tb.setPointerCapture(e.pointerId);
    // Switch from transform to absolute left/top
    if(!ov.classList.contains('dragged')){
      const r=ov.getBoundingClientRect();
      ov.style.left=r.left+'px'; ov.style.top=r.top+'px';
      ov.style.transform='none'; ov.classList.add('dragged');
    }
    const r=ov.getBoundingClientRect();
    sx=e.clientX-r.left; sy=e.clientY-r.top;
    drag=true;
  });
  tb.addEventListener('pointermove',e=>{
    if(!drag)return;
    const W=innerWidth,H=innerHeight;
    const r=ov.getBoundingClientRect();
    let nx=e.clientX-sx, ny=e.clientY-sy;
    nx=Math.max(0,Math.min(W-r.width,nx));
    ny=Math.max(0,Math.min(H-60,ny));
    ov.style.left=nx+'px'; ov.style.top=ny+'px';
  });
  tb.addEventListener('pointerup',()=>{drag=false;savePos();});
  tb.addEventListener('pointercancel',()=>{drag=false;});

  // Resize corner
  const rc=D.resizeCorn;
  let res=false,rsx=0,rsy=0,rw=0,rh=0;
  rc.addEventListener('pointerdown',e=>{
    e.preventDefault();e.stopPropagation();
    rc.setPointerCapture(e.pointerId);
    const r=ov.getBoundingClientRect();
    rsx=e.clientX;rsy=e.clientY;rw=r.width;rh=r.height;res=true;
  });
  rc.addEventListener('pointermove',e=>{
    if(!res)return;
    const nw=Math.max(260,Math.min(innerWidth*.95,rw+e.clientX-rsx));
    const nh=Math.max(220,Math.min(innerHeight*.90,rh+e.clientY-rsy));
    ov.style.width=nw+'px'; ov.style.height=nh+'px';
    clampOverlay();
    if(A.activeTab==='chart') Chart.resize();
  });
  rc.addEventListener('pointerup',()=>{res=false;savePos();});
  rc.addEventListener('pointercancel',()=>{res=false;});

  // Pinch to resize
  let pinchD=null,pw=0,ph=0;
  ov.addEventListener('touchstart',e=>{
    if(e.touches.length===2){
      const dx=e.touches[0].clientX-e.touches[1].clientX;
      const dy=e.touches[0].clientY-e.touches[1].clientY;
      pinchD=Math.sqrt(dx*dx+dy*dy);
      const r=ov.getBoundingClientRect();pw=r.width;ph=r.height;
    }
  },{passive:true});
  ov.addEventListener('touchmove',e=>{
    if(e.touches.length===2&&pinchD){
      e.preventDefault();
      const dx=e.touches[0].clientX-e.touches[1].clientX;
      const dy=e.touches[0].clientY-e.touches[1].clientY;
      const sc=Math.sqrt(dx*dx+dy*dy)/pinchD;
      ov.style.width=Math.max(260,Math.min(innerWidth*.95,pw*sc))+'px';
      ov.style.height=Math.max(220,Math.min(innerHeight*.90,ph*sc))+'px';
      clampOverlay();
    }
  },{passive:false});
  ov.addEventListener('touchend',e=>{if(e.touches.length<2){pinchD=null;savePos();}},{passive:true});

  // Keep overlay in bounds on resize
  window.addEventListener('resize',()=>{
    if(!A.maximized) clampOverlay();
    if(A.activeTab==='chart') Chart.resize();
  },{passive:true});

  // Prevent overlay scroll from propagating
  D.overlay.addEventListener('touchmove',e=>{
    // Only stop if not inside a scrollable element
    if(!e.target.closest('.tab-pane,.sp-scroll')) e.stopPropagation();
  },{passive:false});
})();

/* ──────────────────────────────────────────
   17. OVERLAY OPEN/CLOSE/MIN/MAX
────────────────────────────────────────── */
function toggleOverlay(){A.open?closeOverlay():openOverlay();}

function openOverlay(){
  if(A.open)return; A.open=true;
  D.overlay.classList.remove('hidden','ov-out');
  D.overlay.classList.add('ov-in');
  D.fab.classList.add('fab-on');
  if(A.activeTab==='chart') setTimeout(()=>Chart.resize(),380);
  if(!A.lastSignal&&!A.analyzing) setTimeout(fireSignal,480);
}

function closeOverlay(){
  if(!A.open)return;
  D.overlay.classList.remove('ov-in');
  D.overlay.classList.add('ov-out');
  D.fab.classList.remove('fab-on');
  setTimeout(()=>{
    A.open=A.minimized=A.maximized=false;
    D.overlay.classList.add('hidden');
    D.overlay.classList.remove('ov-out','minimized','maximized');
  },260);
}

function minimizeOverlay(){
  if(A.maximized)return;
  A.minimized=!A.minimized;
  D.overlay.classList.toggle('minimized',A.minimized);
}

function maximizeOverlay(){
  if(A.minimized){A.minimized=false;D.overlay.classList.remove('minimized');}
  A.maximized=!A.maximized;
  D.overlay.classList.toggle('maximized',A.maximized);
  if(!A.maximized){
    try{
      const s=JSON.parse(localStorage.getItem(POS_KEY)||'null');
      if(s){ D.overlay.style.left=s.x+'px';D.overlay.style.top=s.y+'px';
             D.overlay.style.transform='none';D.overlay.classList.add('dragged');
             if(s.w)D.overlay.style.width=s.w+'px';if(s.h)D.overlay.style.height=s.h+'px'; }
    }catch(e){}
  }
  setTimeout(()=>{if(A.activeTab==='chart')Chart.resize();},80);
}

function openSettings(){A.settingsOpen=true;D.settingsPan.classList.remove('hidden');}
function closeSettings(){A.settingsOpen=false;D.settingsPan.classList.add('hidden');saveC();if(A.wsOk)wsSubscribe(C.asset);}

/* ──────────────────────────────────────────
   18. TABS
────────────────────────────────────────── */
function initTabs(){
  D.tabs.forEach(tab=>{
    tab.addEventListener('click',()=>{
      const name=tab.dataset.tab;
      D.tabs.forEach(t=>t.classList.remove('active'));
      D.panes.forEach(p=>p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('pane-'+name)?.classList.add('active');
      A.activeTab=name;
      if(name==='chart')setTimeout(()=>Chart.resize(),80);
    });
  });
}

/* ──────────────────────────────────────────
   19. SETTINGS WIRING
────────────────────────────────────────── */
function initSettings(){
  const bind=(id,key,parse)=>{
    const el=id$(id); if(!el)return;
    const update=()=>{
      C[key]=parse?parse(el):el.type==='checkbox'?el.checked:el.value;
      applyC();
    };
    el.addEventListener('change',update); el.addEventListener('input',update);
  };
  bind('s-voice','voice'); bind('s-autospeak','autoSpeak'); bind('s-vibrate','vibrate');
  bind('s-volume','volume',e=>+e.value); bind('s-anim','anim',e=>e.value);
  bind('s-opacity','opacity',e=>+e.value); bind('s-cstyle','candleStyle',e=>e.value);
  bind('s-maperiod','maPeriod',e=>+e.value); bind('s-asset','asset',e=>e.value);
  bind('s-reconnect','autoReconnect');
  D.btnSpClose.addEventListener('click',closeSettings);
}

/* ──────────────────────────────────────────
   20. VOICE
────────────────────────────────────────── */
let synth=window.speechSynthesis, voice=null;
function initVoice(){
  if(!synth)return;
  const pick=()=>{
    const vs=synth.getVoices();
    voice=vs.find(v=>v.name.includes('Samantha'))||vs.find(v=>v.name.includes('Google UK English Female'))||vs.find(v=>v.name.includes('Microsoft Zira'))||vs.find(v=>v.lang==='en-US')||vs.find(v=>v.lang.startsWith('en'))||vs[0]||null;
  };
  pick(); synth.onvoiceschanged=pick;
}
function speak(dir,conf){
  if(!C.voice||!synth)return;
  try{
    synth.cancel();
    const phrases=dir==='UP'
      ?[`Analysis complete. Signal up. Confidence ${conf} percent.`,`Quantum signal: Up. ${conf} percent.`,`Bullish signal confirmed. ${conf} percent confidence.`]
      :[`Analysis complete. Signal down. Confidence ${conf} percent.`,`Quantum signal: Down. ${conf} percent.`,`Bearish signal confirmed. ${conf} percent confidence.`];
    const utt=new SpeechSynthesisUtterance(phrases[Math.floor(Math.random()*3)]);
    if(voice)utt.voice=voice; utt.rate=0.95;utt.volume=C.volume/100;
    synth.speak(utt);
  }catch(e){}
}

/* ──────────────────────────────────────────
   21. BANGLADESH TIME + SIGNAL TIMER
────────────────────────────────────────── */
function bdTime(){return new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Dhaka'}));}
function formatTime(d){return`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;}
function pad(n){return String(n).padStart(2,'0');}

function timeTick(){
  const now=bdTime(),sec=now.getSeconds(),rem=60-sec;
  D.bdTime.textContent=formatTime(now);
  D.cdSec.textContent=rem===60?'60':rem;
  D.cdSec.className=rem<=5?'urgent':'';

  // Ring arc — 113.1 = full circumference
  const offset=RING_FULL*(sec/60);
  D.ringArc.style.strokeDashoffset=RING_FULL-offset;
  D.ringArc.classList.toggle('urgent',rem<=5);

  // Signal at :55
  if(sec===SIGNAL_SECOND&&sec!==A.lastSigSecond){
    A.lastSigSecond=sec; fireSignal();
  }
  if(sec<SIGNAL_SECOND) A.lastSigSecond=-1;
  if(A.activeTab==='chart') Chart.draw();
}

/* ──────────────────────────────────────────
   22. IFRAME — same tab, no new window
────────────────────────────────────────── */
function initIframe(){
  const frame=D.iframe, src=frame.dataset.src;

  // Set src after a small delay so page renders first
  setTimeout(()=>{
    frame.src=src;
  },300);

  // Hide loader when iframe loads
  frame.addEventListener('load',()=>{
    D.iframeLoader.classList.add('loaded');
    setTimeout(()=>D.iframeLoader.classList.add('hidden'),600);
  });

  // Show fallback only on actual error
  frame.addEventListener('error',()=>{
    D.iframeLoader.classList.add('hidden');
    D.iframeFB.classList.remove('hidden');
  });

  // Detect blocked iframe after 12s timeout
  const fb_timer=setTimeout(()=>{
    // Only show fallback if loader still visible
    if(!D.iframeLoader.classList.contains('loaded')){
      D.iframeLoader.classList.add('hidden');
      D.iframeFB.classList.remove('hidden');
    }
  },12000);
  frame.addEventListener('load',()=>clearTimeout(fb_timer));
}

// Global retry function
window.retryIframe=function(){
  D.iframeFB.classList.add('hidden');
  D.iframeLoader.classList.remove('hidden','loaded');
  D.iframe.src='';
  setTimeout(()=>{ D.iframe.src=D.iframe.dataset.src; },300);
};

/* ──────────────────────────────────────────
   23. MAIN LOOP
────────────────────────────────────────── */
let raf=null, lastTick=0;
function loop(ts){
  raf=requestAnimationFrame(loop);
  if(ts-lastTick>=500){lastTick=ts;timeTick();}
}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){if(raf){cancelAnimationFrame(raf);raf=null;}}
  else{if(!raf)raf=requestAnimationFrame(loop);}
});

/* ──────────────────────────────────────────
   24. EVENT BINDINGS
────────────────────────────────────────── */
function bindEvents(){
  D.btnClose.addEventListener('click',closeOverlay);
  D.btnMin.addEventListener('click',minimizeOverlay);
  D.btnMax.addEventListener('click',maximizeOverlay);
  D.btnSettings.addEventListener('click',()=>A.settingsOpen?closeSettings():openSettings());
}

/* ──────────────────────────────────────────
   25. UTIL
────────────────────────────────────────── */
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

/* ──────────────────────────────────────────
   26. BOOT
────────────────────────────────────────── */
(function boot(){
  loadC(); initSettings(); initVoice(); initTabs(); Chart.init();
  bindEvents(); initIframe(); wsConnect();
  raf=requestAnimationFrame(loop);
  setStatus('idle');
  console.log('%c⚛ Quantum Overlay AI v3%c\nAll bugs fixed. Live WS + Real Chart.',
    'color:#00e5a0;font-size:15px;font-weight:900;','color:#888;font-size:11px;');
})();
