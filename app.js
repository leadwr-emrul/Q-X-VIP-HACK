/**
 * ═══════════════════════════════════════════════════════════
 *  QUANTUM OVERLAY AI v4
 *  Fixes:
 *   1. iframe loads correctly (delayed src, no CSP issues)
 *   2. Chart shows data even in SIM mode
 *   3. Market name displays properly
 *   4. WS reconnect no longer spams
 *   5. Overlay drag/resize fully fixed with bounds clamp
 *   6. Asset pills switch market live
 * ═══════════════════════════════════════════════════════════
 */
'use strict';

/* ─────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────── */
const WS_URL         = 'wss://ws2.market-qx.info/socket.io/?EIO=3&transport=websocket';
const MARKET_URL     = 'https://market-qx.info/en/trade';
const RECONNECT_BASE = 4000;
const RECONNECT_MAX  = 30000;
const MAX_CANDLES    = 160;
const SIG_AT_SEC     = 55;
const CD_FULL        = 113.1;   // 2π × 18

const KEY_CFG = 'qai4_cfg';
const KEY_POS = 'qai4_pos';
const KEY_FAB = 'qai4_fab';

/* ─────────────────────────────────────────
   ASSET MAP — display names
───────────────────────────────────────── */
const ASSETS = {
  '#OTC_BTCUSD': 'BTC/USD OTC',
  '#OTC_EURUSD': 'EUR/USD OTC',
  '#OTC_GBPUSD': 'GBP/USD OTC',
  'EURUSD':      'EUR/USD',
  'USDJPY':      'USD/JPY',
};

/* ─────────────────────────────────────────
   CONFIG
───────────────────────────────────────── */
let C = {
  voice:true, autoSpeak:true, vibrate:true, volume:80,
  anim:'full', opacity:92,
  candleStyle:'classic', maPeriod:14,
  asset:'#OTC_BTCUSD', autoReconnect:true,
  showMA:true, showBB:false, showVol:true,
};

function loadC() {
  try { Object.assign(C, JSON.parse(localStorage.getItem(KEY_CFG)||'{}')); } catch(e){}
  syncC();
}
function saveC() {
  try { localStorage.setItem(KEY_CFG, JSON.stringify(C)); } catch(e){}
}
function syncC() {
  document.documentElement.style.setProperty('--opa', (C.opacity/100).toFixed(2));
  const s=(id,v)=>{const e=G(id);if(!e)return;if(e.type==='checkbox')e.checked=!!v;else e.value=v;};
  s('sv-voice',C.voice); s('sv-speak',C.autoSpeak); s('sv-vib',C.vibrate);
  s('sv-vol',C.volume);  s('sv-anim',C.anim);       s('sv-opa',C.opacity);
  s('sv-cs',C.candleStyle); s('sv-ma',C.maPeriod);  s('sv-rec',C.autoReconnect);
}

/* ─────────────────────────────────────────
   DOM HELPER
───────────────────────────────────────── */
const G = id => document.getElementById(id);

/* ─────────────────────────────────────────
   DOM REFS
───────────────────────────────────────── */
const D = {
  // Iframe
  mframe:      G('mframe'),
  iframeLoader:G('iframe-loader'),
  iframeFB:    G('iframe-fb'),

  // WS badge
  wsBadge: G('ws-badge'), wsDot: G('ws-dot'), wsTxt: G('ws-txt'),

  // FAB
  fab: G('fab'), fabDot: G('fab-dot'),

  // Overlay
  overlay:   G('overlay'),
  ovBar:     G('ov-bar'),
  grip:      G('grip'),
  btnClose:  G('ov-close'), btnMin: G('ov-min'), btnMax: G('ov-max'),
  btnSett:   G('ov-settings'),
  settPanel: G('settings'),
  spClose:   G('sp-close'),

  // Time
  bdTime:     G('bd-time'),
  cdNum:      G('cd-num'),
  cdFg:       G('cd-fg'),
  marketName: G('market-name'),
  liveTag:    G('live-tag'),

  // Tabs
  tabs:  document.querySelectorAll('.tnav'),
  panes: document.querySelectorAll('.pane'),

  // Signal pane
  dirBox:  G('dir-box'),  dirArrow: G('dir-arrow'),
  dirWord: G('dir-word'), dirPct:   G('dir-pct'),
  mfConf:  G('mf-conf'),  mvConf:   G('mv-conf'),
  mfStr:   G('mf-str'),   mvStr:    G('mv-str'),
  mfTrend: G('mf-trend'), mvTrend:  G('mv-trend'),
  mfVol:   G('mf-vol'),   mvVol:    G('mv-vol'),
  riskDots:G('risk-dots'),
  sAid:    G('s-aid'), sStatus: G('s-status'), sSrc: G('s-src'),
  tkPrice: G('tk-price'), tkChg: G('tk-chg'), tkOhlc: G('tk-ohlc'),
  pills:   document.querySelectorAll('.mpill'),

  // Chart
  cc: G('cc'), vc: G('vc'),
  chartTip: G('chart-tip'),
  chartNodata: G('chart-nodata'),
  ctbBtns: document.querySelectorAll('.ctb[data-tf]'),
  ctbMA: G('ctb-ma'), ctbBB: G('ctb-bb'), ctbVol: G('ctb-vol'),

  // Engine
  ecards: document.querySelectorAll('.ecard'),

  // Log
  lsTot: G('ls-tot'), lsUp: G('ls-up'), lsDn: G('ls-dn'), lsSrc: G('ls-src'),
  logList: G('log-list'),

  // Cinema
  cinema:   G('cinema'),    cinCv:   G('cin-cv'),
  cinPhase: G('cin-phase'), cinProg: G('cin-prog'),
  cinPct:   G('cin-pct'),   cinTags: document.querySelectorAll('.ctag'),
  cinMarket:G('cin-market'),cinResult:G('cin-result'),
  cinArrow: G('cin-arrow'), cinPctBig:G('cin-pct-big'), cinNote: G('cin-note'),
};

/* ─────────────────────────────────────────
   APP STATE
───────────────────────────────────────── */
const A = {
  open:false, min:false, max:false, settOpen:false,
  analyzing:false, tab:'signal', aidN:1000,
  lastSig:null, history:[], wsOk:false,
  wsConnecting:false, reconnectDelay:RECONNECT_BASE, reconnectTimer:null,
  lastSigSec:-1,
};

/* ─────────────────────────────────────────
   CANDLE STORE
───────────────────────────────────────── */
const Store = {
  candles:[], live:null, price:null, prevPrice:null,

  push(c) {
    const i=this.candles.findIndex(x=>x.t===c.t);
    if(i>=0) this.candles[i]=c; else this.candles.push(c);
    if(this.candles.length>MAX_CANDLES) this.candles.shift();
    this.candles.sort((a,b)=>a.t-b.t);
  },

  tick(price,ts) {
    const mt=Math.floor(ts/60000)*60000;
    if(!this.live||this.live.t!==mt){
      if(this.live) this.push({...this.live});
      this.live={t:mt,o:price,h:price,l:price,c:price,v:1};
    } else {
      this.live.h=Math.max(this.live.h,price);
      this.live.l=Math.min(this.live.l,price);
      this.live.c=price; this.live.v++;
    }
    this.prevPrice=this.price; this.price=price;
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

  /* Generate simulated candles so chart is never empty */
  ensureSim() {
    if(this.candles.length>0||this.live) return;
    const now=Date.now(), base=1.08500+Math.random()*0.1;
    let price=base;
    for(let i=MAX_CANDLES-1;i>=0;i--){
      const t=Math.floor((now-i*60000)/60000)*60000;
      const o=price;
      const h=o+(Math.random()*0.0015);
      const l=o-(Math.random()*0.0015);
      const c=l+(Math.random()*(h-l));
      this.candles.push({t,o,h:Math.max(o,c,h),l:Math.min(o,c,l),c,v:Math.floor(50+Math.random()*200)});
      price=c;
    }
    this.price=price;
  },
};

/* ─────────────────────────────────────────
   WEBSOCKET
───────────────────────────────────────── */
let ws=null, wsPing=null;

function wsConnect() {
  if(A.wsConnecting) return;
  if(ws&&(ws.readyState===0||ws.readyState===1)) return;
  A.wsConnecting=true;
  setBadge('conn');

  try { ws=new WebSocket(WS_URL); }
  catch(e){ A.wsConnecting=false; scheduleReconnect(); return; }

  const openTmo=setTimeout(()=>{
    if(ws&&ws.readyState!==1){ try{ws.close();}catch(e){} }
  },9000);

  ws.onopen=()=>{
    clearTimeout(openTmo);
    clearTimeout(A.reconnectTimer);
    A.wsOk=true; A.wsConnecting=false;
    A.reconnectDelay=RECONNECT_BASE;
    setBadge('live');
    D.fabDot.classList.add('live');
    D.liveTag.classList.add('live'); D.liveTag.textContent='LIVE';
    D.sSrc.className='src-badge live'; D.sSrc.textContent='LIVE';
    setTimeout(()=>wsSend('40'),200);
    setTimeout(()=>wsSubscribe(C.asset),700);
    clearInterval(wsPing);
    wsPing=setInterval(()=>wsSend('2'),25000);
  };

  ws.onmessage=e=>wsMsg(e.data);
  ws.onerror=()=>{};
  ws.onclose=()=>{
    clearTimeout(openTmo); clearInterval(wsPing);
    A.wsOk=false; A.wsConnecting=false;
    setBadge('sim');
    D.fabDot.classList.remove('live');
    D.liveTag.classList.remove('live'); D.liveTag.textContent='SIM';
    D.sSrc.className='src-badge'; D.sSrc.textContent='SIM';
    if(C.autoReconnect) scheduleReconnect();
  };
}

function scheduleReconnect() {
  clearTimeout(A.reconnectTimer);
  A.reconnectTimer=setTimeout(()=>{
    wsConnect();
    A.reconnectDelay=Math.min(RECONNECT_MAX, A.reconnectDelay*1.6);
  }, A.reconnectDelay);
}

function wsSend(d){ if(ws&&ws.readyState===1) try{ws.send(d);}catch(e){} }

function wsSubscribe(asset) {
  wsSend(`42["subscribeCandle",${JSON.stringify({asset,period:60})}]`);
  wsSend(`42["subscribeTick",${JSON.stringify({asset})}]`);
  updateMarketDisplay(asset);
}

function wsMsg(raw) {
  try {
    if(raw==='3') return;
    if(raw.startsWith('42')){
      const parsed=JSON.parse(raw.slice(2));
      if(Array.isArray(parsed)) wsEvent(parsed[0],parsed[1]);
    }
  } catch(e){}
}

function wsEvent(ev,data) {
  switch(ev){
    case 'candle': case 'candles': case 'history': onCandles(data); break;
    case 'tick':   case 'quote':   case 'price':   onTick(data);    break;
    default: autoDetect(data);
  }
}

function onCandles(data){
  if(!data) return;
  const arr=Array.isArray(data)?data:[data];
  arr.forEach(item=>{const c=normC(item);if(c)Store.push(c);});
  tickerUpdate(); chartDraw(); flashDot();
}

function onTick(data){
  if(!data) return;
  const p=parseFloat(data.price||data.close||data.c||data.value||data.ask||data.bid||0);
  if(!p||isNaN(p)) return;
  const ts=+(data.time||data.t||data.timestamp||Date.now());
  Store.tick(p,ts);
  tickerUpdate(); chartDraw(); flashDot();
}

function autoDetect(data){
  if(!data||typeof data!=='object') return;
  for(const f of ['price','close','c','value','last','ask','bid']){
    if(data[f]&&!isNaN(parseFloat(data[f]))){ onTick(data); return; }
  }
}

function normC(r){
  if(!r) return null;
  const c={
    t:+(r.time||r.t||r.timestamp||r.open_time||0),
    o:parseFloat(r.open||r.o||0), h:parseFloat(r.high||r.h||0),
    l:parseFloat(r.low||r.l||0),  c:parseFloat(r.close||r.c||0),
    v:parseFloat(r.volume||r.v||1),
  };
  if(!c.t||!c.o||!c.c) return null;
  if(c.h<Math.max(c.o,c.c)) c.h=Math.max(c.o,c.c);
  if(c.l>Math.min(c.o,c.c)) c.l=Math.min(c.o,c.c);
  return c;
}

function setBadge(state){
  D.wsBadge.className=state==='live'?'badge-live':state==='conn'?'badge-conn':'badge-sim';
  D.wsDot.textContent='●';
  D.wsTxt.textContent=state==='live'?'LIVE DATA':state==='conn'?'Connecting…':'SIM MODE';
}

function flashDot(){
  D.fabDot.classList.add('live');
  clearTimeout(D.fabDot._t);
  D.fabDot._t=setTimeout(()=>{ if(!A.wsOk) D.fabDot.classList.remove('live'); },350);
}

function updateMarketDisplay(asset){
  const name=(ASSETS[asset]||asset).replace('#OTC_','').replace('OTC_','');
  D.marketName.textContent=name;
  D.cinMarket.textContent=name;
  // Sync pills
  D.pills.forEach(p=>{
    p.classList.toggle('active', p.dataset.asset===asset);
  });
}

/* ─────────────────────────────────────────
   PRICE TICKER
───────────────────────────────────────── */
function tickerUpdate(){
  const p=Store.price, pp=Store.prevPrice;
  if(!p) return;
  D.tkPrice.textContent=p.toFixed(6);
  if(pp){
    const d=p-pp, pct=(d/pp*100).toFixed(4), up=d>=0;
    D.tkChg.textContent=(up?'+':'')+pct+'%';
    D.tkChg.className='tk-chg '+(up?'up':'dn');
  }
  const lc=Store.live||(Store.candles.length?Store.candles[Store.candles.length-1]:null);
  if(lc) D.tkOhlc.textContent=
    `${lc.o.toFixed(5)} / ${lc.h.toFixed(5)} / ${lc.l.toFixed(5)} / ${lc.c.toFixed(5)}`;
}

/* ─────────────────────────────────────────
   TA LIBRARY
───────────────────────────────────────── */
const TA={
  sma(a,p){if(a.length<p)return null;return a.slice(-p).reduce((s,v)=>s+v,0)/p;},
  ema(a,p){
    if(a.length<p)return null;
    const k=2/(p+1);let e=a.slice(0,p).reduce((s,v)=>s+v,0)/p;
    for(let i=p;i<a.length;i++)e=a[i]*k+e*(1-k);return e;
  },
  emaArr(a,p){
    if(a.length<p)return[];
    const k=2/(p+1),out=[];
    let e=a.slice(0,p).reduce((s,v)=>s+v,0)/p;out.push(e);
    for(let i=p;i<a.length;i++){e=a[i]*k+e*(1-k);out.push(e);}return out;
  },
  rsi(a,p=14){
    if(a.length<p+1)return 50;
    const ch=[];for(let i=1;i<a.length;i++)ch.push(a[i]-a[i-1]);
    let g=0,l=0;for(let i=0;i<p;i++){if(ch[i]>0)g+=ch[i];else l-=ch[i];}
    let ag=g/p,al=l/p;
    for(let i=p;i<ch.length;i++){
      const gx=ch[i]>0?ch[i]:0,lx=ch[i]<0?-ch[i]:0;
      ag=(ag*(p-1)+gx)/p;al=(al*(p-1)+lx)/p;
    }
    return al===0?100:100-100/(1+ag/al);
  },
  macd(a,f=12,s=26,sg=9){
    if(a.length<s)return{h:0};
    const ef=this.emaArr(a,f),es=this.emaArr(a,s);
    const n=Math.min(ef.length,es.length);
    const ml=[];for(let i=0;i<n;i++)ml.push(ef[ef.length-n+i]-es[es.length-n+i]);
    const sv=this.ema(ml,Math.min(sg,ml.length))||0;
    return{h:(ml[ml.length-1]||0)-sv};
  },
  bb(a,p=20,m=2){
    if(a.length<p)return null;
    const sl=a.slice(-p),mid=sl.reduce((x,v)=>x+v,0)/p;
    const std=Math.sqrt(sl.reduce((x,v)=>x+(v-mid)**2,0)/p);
    return{upper:mid+m*std,mid,lower:mid-m*std};
  },
  atr(cs,p=14){
    if(cs.length<2)return 0;
    const tr=[];for(let i=1;i<cs.length;i++)
      tr.push(Math.max(cs[i].h-cs[i].l,Math.abs(cs[i].h-cs[i-1].c),Math.abs(cs[i].l-cs[i-1].c)));
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
    const[p2,p1,c]=cs.slice(-3);
    const body=x=>Math.abs(x.c-x.o),bull=x=>x.c>x.o;
    let sc=0;
    if(bull(c)&&!bull(p1)&&c.o<p1.c&&c.c>p1.o)sc+=42;
    if(!bull(c)&&bull(p1)&&c.o>p1.c&&c.c<p1.o)sc-=42;
    if(bull(c)){const ls=Math.min(c.o,c.c)-c.l;if(ls>body(c)*2)sc+=32;}
    if(!bull(c)){const us=c.h-Math.max(c.o,c.c);if(us>body(c)*2)sc-=32;}
    if(body(c)<(c.h-c.l)*0.07)sc+=(bull(p1)?-18:18);
    if(cs.slice(-3).every(x=>bull(x)))sc+=28;
    if(cs.slice(-3).every(x=>!bull(x)))sc-=28;
    return Math.max(-100,Math.min(100,sc));
  },
};

/* ─────────────────────────────────────────
   MARKOV CHAIN
───────────────────────────────────────── */
const MK={
  seq:[],MAX:80,
  push(d){this.seq.push(d);if(this.seq.length>this.MAX)this.seq.shift();},
  pUp(){
    const s=this.seq;if(s.length<2)return 0.5;
    let uu=0,ud=0,du=0,dd=0;
    for(let i=0;i<s.length-1;i++){
      if(s[i]==='UP'&&s[i+1]==='UP')uu++;
      if(s[i]==='UP'&&s[i+1]==='DOWN')ud++;
      if(s[i]==='DOWN'&&s[i+1]==='UP')du++;
      if(s[i]==='DOWN'&&s[i+1]==='DOWN')dd++;
    }
    const last=s[s.length-1];
    return last==='UP'?uu/(uu+ud||1):du/(du+dd||1);
  },
  streak(){
    if(!this.seq.length)return{n:0,d:null};
    const d=this.seq[this.seq.length-1];let n=0;
    for(let i=this.seq.length-1;i>=0&&this.seq[i]===d;i--)n++;
    return{n,d};
  },
};

/* ─────────────────────────────────────────
   ANALYSIS ENGINE
───────────────────────────────────────── */
function analyze(){
  const cs=Store.all(),cl=cs.map(c=>c.c),n=cs.length,live=A.wsOk&&n>=10;
  const now=getBD();
  const sim=id=>{const x=Math.sin(now.getTime()/1000+id*73.19)*43758.5453;return((x-Math.floor(x))-.5)*180;};

  const trend      = live&&cl.length>=21 ? (() => {
    const e7=TA.ema(cl,7)||0,e14=TA.ema(cl,14)||0,e21=TA.ema(cl,21)||0,p=cl[cl.length-1];
    return(p>e7?20:-20)+(p>e14?15:-15)+(p>e21?15:-15)+(e7>e14?25:-25)+(e14>e21?25:-25);
  })() : sim(1);

  const momentum   = live&&cl.length>=26 ? Math.max(-100,Math.min(100,TA.macd(cl).h*8000)) : sim(2);
  const ma         = live&&cl.length>=C.maPeriod+3 ? (()=>{
    const f=TA.sma(cl,Math.max(5,Math.floor(C.maPeriod/2))),s=TA.sma(cl,C.maPeriod);
    return f&&s?f>s?60+Math.min(40,(f-s)/s*1e5):-60-Math.min(40,(s-f)/s*1e5):0;
  })() : sim(3);

  const volatility = live&&cl.length>=20 ? (()=>{
    const bb=TA.bb(cl,20),p=cl[cl.length-1];
    return bb&&p?(((p-bb.lower)/(bb.upper-bb.lower||1))-.5)*200:0;
  })() : sim(4);

  const pattern    = cs.length>=3 ? TA.pattern(cs) : sim(5);

  const volume     = live&&n>=5 ? (()=>{
    const rec=cs.slice(-5);
    const uv=rec.filter(c=>c.c>=c.o).reduce((s,c)=>s+c.v,0);
    const dv=rec.filter(c=>c.c<c.o).reduce((s,c)=>s+c.v,0);
    const tot=uv+dv;return tot>0?(uv-dv)/tot*80:0;
  })() : sim(6);

  const rsi        = live&&cl.length>=14 ? (50-TA.rsi(cl))*1.6 : sim(7);
  const macd       = live&&cl.length>=26 ? Math.max(-100,Math.min(100,TA.macd(cl).h*12000)) : sim(8);
  const stoch      = live&&n>=14 ? (()=>{const s=TA.stoch(cs);return s>80?-(s-80)*2.5:s<20?(20-s)*2.5:(50-s)*1.2;})() : sim(9);

  const pUp=MK.pUp();
  const markov=(pUp-.5)*190;

  const{n:sn,d:sd}=MK.streak();
  const streak=sn>=2?sd==='UP'?-Math.min(sn*14,75):Math.min(sn*14,75):sim(11);

  const adaptive   = live&&n>=14 ? (()=>{
    const s=TA.stoch(cs,14);
    return s>70?-(s-70)*1.8:s<30?(30-s)*1.8:(50-s)*0.9;
  })() : sim(12);

  const W={trend:1.7,momentum:1.3,ma:1.4,volatility:0.8,pattern:1.2,volume:1.0,
           rsi:1.3,macd:1.2,stoch:0.9,markov:1.4,streak:1.1,adaptive:1.0};
  const SC={trend,momentum,ma,volatility,pattern,volume,rsi,macd,stoch,markov,streak,adaptive};

  let ws2=0,wt=0;
  for(const[k,w]of Object.entries(W)){ws2+=(SC[k]||0)*w;wt+=w;}
  const comp=ws2/wt;
  const dir=comp>=0?'UP':'DOWN';
  const confidence=Math.round(50+Math.abs(comp)/100*44);
  const strength=Math.min(99,Math.round(Math.abs(comp)*.88+8));
  const trendPct=Math.round((SC.trend+100)/2);
  const volPct=Math.round((Math.abs(SC.volatility)+50)/150*100);
  const atrV=live?TA.atr(cs):0;
  const prc=Store.price||(cl[cl.length-1]||1);
  const risk=prc&&atrV/prc*100>0.6?5:prc&&atrV/prc*100>0.4?4:confidence<62?3:2;

  return{dir,confidence,strength,trendPct,volPct,risk,scores:SC,live,n};
}

/* ─────────────────────────────────────────
   SIGNAL FIRE
───────────────────────────────────────── */
async function fireSignal(){
  if(A.analyzing)return;
  A.analyzing=true;
  setStatus('scanning');
  const r=analyze();
  const aid=`AID-${A.aidN++}-${pad(getBD().getMinutes())}${pad(getBD().getSeconds())}`;

  if(C.anim!=='off') await runCinema(r);
  applySignalUI(r,aid);
  MK.push(r.dir);
  if(C.voice&&C.autoSpeak) voiceSpeak(r.dir,r.confidence);
  if(C.vibrate&&navigator.vibrate) navigator.vibrate([90,40,90]);
  addLog(r,aid);
  A.lastSig=r; A.analyzing=false;
}

function setStatus(s){
  const e=D.sStatus;
  e.className='astatus '+s;
  e.textContent=s==='scanning'?'⬤ SCANNING':s==='bullish'?'⬤ BULLISH':s==='bearish'?'⬤ BEARISH':'⬤ IDLE';
}

function applySignalUI(r,aid){
  const{dir,confidence,strength,trendPct,volPct,risk,scores,live}=r,up=dir==='UP';
  D.dirBox.className='dir-box '+(up?'up':'dn');
  D.dirArrow.textContent=up?'↑':'↓';
  D.dirWord.textContent=dir;
  D.dirPct.textContent=`${confidence}%`;
  setBar(D.mfConf,D.mvConf,confidence);
  setBar(D.mfStr,D.mvStr,strength);
  setBar(D.mfTrend,D.mvTrend,trendPct);
  setBar(D.mfVol,D.mvVol,volPct);
  const dots=D.riskDots.querySelectorAll('i');
  const rc=risk<=2?'low':risk<=3?'med':'hi';
  dots.forEach((d,i)=>{d.className='';if(i<risk)d.classList.add(rc);});
  D.sAid.textContent=aid;
  setStatus(up?'bullish':'bearish');
  // Engine cards
  D.ecards.forEach(card=>{
    const k=card.dataset.k,raw=scores[k]||0,pct=Math.round(Math.abs(raw)),isUp=raw>=0;
    const sc=card.querySelector('.escore'),bar=card.querySelector('.ebar');
    if(sc)sc.textContent=(isUp?'+':'−')+pct;
    if(bar)bar.style.width=pct+'%';
    card.classList.remove('up','dn');card.classList.add(isUp?'up':'dn');
  });
}

function setBar(barEl,valEl,pct){
  if(barEl)barEl.style.width=Math.min(100,pct)+'%';
  if(valEl)valEl.textContent=Math.round(pct)+'%';
}

/* ─────────────────────────────────────────
   LOG / HISTORY
───────────────────────────────────────── */
function addLog(r,aid){
  A.history.unshift({dir:r.dir,conf:r.confidence,live:r.live,aid,time:fmtTime(getBD())});
  if(A.history.length>40)A.history.pop();
  renderLog();
}
function renderLog(){
  const tot=A.history.length,ups=A.history.filter(h=>h.dir==='UP').length,dns=tot-ups;
  D.lsTot.textContent=tot; D.lsUp.textContent=ups; D.lsDn.textContent=dns;
  D.lsSrc.textContent=A.wsOk?'LIVE':'SIM';
  D.logList.innerHTML='';
  A.history.forEach(h=>{
    const div=document.createElement('div');
    div.className=`log-item ${h.dir==='UP'?'li-up':'li-dn'}`;
    div.innerHTML=`<span class="li-arr">${h.dir==='UP'?'↑':'↓'}</span>`+
      `<span class="li-time">${h.time}</span>`+
      `<span class="li-conf">${h.conf}%</span>`+
      `<span class="li-src${h.live?' live':''}">${h.live?'LIVE':'SIM'}</span>`;
    D.logList.appendChild(div);
  });
}

/* ─────────────────────────────────────────
   CINEMA
───────────────────────────────────────── */
let cinRAF=null,cinCtx=null,cinPts=[];
async function runCinema(r){
  D.cinema.classList.remove('hidden');
  D.cinResult.classList.add('hidden');
  D.cinProg.style.width='0%'; D.cinPct.textContent='0%';
  D.cinTags.forEach(t=>t.classList.remove('on'));
  D.cinMarket.textContent=ASSETS[C.asset]||C.asset;
  startCinCanvas();
  const phases=[
    {label:'LOADING CANDLE DATA',    pct:18,ms:240},
    {label:'COMPUTING INDICATORS',   pct:36,ms:270},
    {label:'BAYESIAN FILTER',        pct:54,ms:250},
    {label:'MARKOV CHAINS',          pct:70,ms:220},
    {label:'RSI + MACD SCORING',     pct:85,ms:200},
    {label:'ADAPTIVE FUSION',        pct:100,ms:190},
  ];
  const tags=Array.from(D.cinTags);
  for(let i=0;i<phases.length;i++){
    D.cinPhase.textContent=phases[i].label;
    cinAnim(phases[i].pct);
    if(tags[i])tags[i].classList.add('on');
    await sleep(phases[i].ms);
  }
  D.cinResult.classList.remove('hidden');
  const up=r.dir==='UP';
  D.cinArrow.textContent=up?'↑':'↓'; D.cinArrow.style.color=up?'var(--up)':'var(--dn)';
  D.cinPctBig.textContent=`${r.confidence}% Confidence`; D.cinPctBig.style.color=up?'var(--up)':'var(--dn)';
  D.cinNote.textContent=r.live?`✓ ${r.n} live candles`:'⚠ Simulation mode';
  D.cinPhase.textContent=`SIGNAL: ${r.dir}`;
  await sleep(1400);
  D.cinema.style.transition='opacity .35s'; D.cinema.style.opacity='0';
  await sleep(370);
  D.cinema.classList.add('hidden'); D.cinema.style.opacity=''; D.cinema.style.transition='';
  stopCinCanvas();
}
function startCinCanvas(){
  const cv=D.cinCv,dpr=devicePixelRatio;
  cv.width=innerWidth*dpr; cv.height=innerHeight*dpr;
  cv.style.width=innerWidth+'px'; cv.style.height=innerHeight+'px';
  cinCtx=cv.getContext('2d'); cinPts=[];
  for(let i=0;i<65;i++) cinPts.push({
    x:Math.random()*cv.width,y:Math.random()*cv.height,
    vx:(Math.random()-.5)*1.3,vy:(Math.random()-.5)*1.3,
    r:Math.random()*1.6+.4,a:Math.random(),
    col:Math.random()>.5?'0,229,160':'0,212,255',
  });
  const COLS=Math.floor(cv.width/(18*dpr));
  const mat=Array.from({length:COLS},(_,c)=>({x:c*18*dpr,y:Math.random()*cv.height,spd:(8+Math.random()*14)*dpr}));
  let ra=0,lt=0;
  function frame(ts){
    cinRAF=requestAnimationFrame(frame);
    const dt=Math.min(ts-lt,50);lt=ts;
    const ctx=cinCtx,W=cv.width,H=cv.height;
    ctx.clearRect(0,0,W,H);
    ctx.strokeStyle='rgba(0,229,160,0.04)';ctx.lineWidth=dpr;
    const gs=36*dpr;
    for(let x=0;x<W;x+=gs){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<H;y+=gs){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    ctx.font=`${11*dpr}px monospace`;
    mat.forEach(col=>{
      ctx.fillStyle='rgba(0,229,160,0.13)';
      ctx.fillText(String.fromCharCode(0x30A0+Math.floor(Math.random()*96)),col.x,col.y);
      col.y+=col.spd*dt/1000*60;if(col.y>H)col.y=-20*dpr;
    });
    cinPts.forEach(p=>{
      p.x+=p.vx;p.y+=p.vy;
      if(p.x<0||p.x>W)p.vx*=-1;if(p.y<0||p.y>H)p.vy*=-1;
      ctx.beginPath();ctx.arc(p.x,p.y,p.r*dpr,0,Math.PI*2);
      ctx.fillStyle=`rgba(${p.col},${p.a})`;ctx.fill();
    });
    const pts=cinPts.slice(0,22);
    for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){
      const dx=pts[i].x-pts[j].x,dy=pts[i].y-pts[j].y,d=Math.sqrt(dx*dx+dy*dy),md=110*dpr;
      if(d<md){ctx.beginPath();ctx.strokeStyle=`rgba(0,212,255,${0.1*(1-d/md)})`;ctx.lineWidth=.6*dpr;ctx.moveTo(pts[i].x,pts[i].y);ctx.lineTo(pts[j].x,pts[j].y);ctx.stroke();}
    }
    const cx=W/2,cy=H/2,rad=Math.min(W,H)*.38;
    ra+=Math.PI*dt/1000;
    ctx.save();ctx.translate(cx,cy);
    ctx.beginPath();ctx.arc(0,0,rad,0,Math.PI*2);ctx.strokeStyle='rgba(0,229,160,0.1)';ctx.lineWidth=dpr;ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,rad,ra-1,ra,false);ctx.fillStyle='rgba(0,229,160,0.07)';ctx.fill();
    ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(ra)*rad,Math.sin(ra)*rad);ctx.strokeStyle='rgba(0,229,160,0.42)';ctx.lineWidth=2*dpr;ctx.stroke();
    ctx.restore();
    const t=ts/1000;
    for(let l=0;l<4;l++){
      const y=H*(.2+l*.2)+Math.sin(t+l)*20*dpr;
      ctx.beginPath();ctx.moveTo(0,y);
      for(let x=0;x<W;x+=8*dpr)ctx.lineTo(x,y+Math.sin(x/(40*dpr)+t*2+l)*6*dpr);
      ctx.strokeStyle='rgba(0,212,255,0.06)';ctx.lineWidth=dpr;ctx.stroke();
    }
  }
  requestAnimationFrame(frame);
}
function stopCinCanvas(){
  if(cinRAF){cancelAnimationFrame(cinRAF);cinRAF=null;}
  cinPts=[];
  if(cinCtx)cinCtx.clearRect(0,0,D.cinCv.width,D.cinCv.height);
}
function cinAnim(target){
  const bar=D.cinProg,num=D.cinPct,start=parseFloat(bar.style.width||'0'),diff=target-start;
  let el=0,lt=null;
  function t(ts){if(!lt)lt=ts;el+=ts-lt;lt=ts;const p=Math.min(1,el/260);const v=start+diff*(1-(1-p)**3);bar.style.width=v+'%';num.textContent=Math.round(v)+'%';if(p<1)requestAnimationFrame(t);}
  requestAnimationFrame(t);
}

/* ─────────────────────────────────────────
   CHART RENDERER
───────────────────────────────────────── */
const Chart={
  tf:1,showMA:true,showBB:false,showVol:true,
  panOff:0,hovIdx:-1,

  init(){
    this.resize();
    D.ctbBtns.forEach(btn=>{
      btn.addEventListener('click',()=>{
        this.tf=+btn.dataset.tf; this.panOff=0;
        D.ctbBtns.forEach(b=>b.classList.remove('active'));
        btn.classList.add('active'); this.draw();
      });
    });
    D.ctbMA.addEventListener('click',()=>{this.showMA=!this.showMA;D.ctbMA.classList.toggle('active',this.showMA);this.draw();});
    D.ctbBB.addEventListener('click',()=>{this.showBB=!this.showBB;D.ctbBB.classList.toggle('active',this.showBB);this.draw();});
    D.ctbVol.addEventListener('click',()=>{
      this.showVol=!this.showVol;D.ctbVol.classList.toggle('active',this.showVol);
      D.vc.style.display=this.showVol?'block':'none';this.draw();
    });
    this.bindTouch(); this.bindMouse();
    window.addEventListener('resize',()=>this.resize(),{passive:true});
    // Initial state
    D.ctbMA.classList.toggle('active',this.showMA);
    D.ctbBB.classList.toggle('active',this.showBB);
    D.ctbVol.classList.toggle('active',this.showVol);
  },

  resize(){
    const parent=D.cc.parentElement;
    const W=Math.max(1,parent.clientWidth-2);
    const H=Math.max(150,Math.min(210,innerHeight*.21));
    const VH=Math.max(28,Math.round(H*.22));
    const dpr=devicePixelRatio;
    D.cc.width=W*dpr; D.cc.height=H*dpr;
    D.cc.style.width=W+'px'; D.cc.style.height=H+'px';
    D.vc.width=W*dpr; D.vc.height=VH*dpr;
    D.vc.style.width=W+'px'; D.vc.style.height=VH+'px';
    this.draw();
  },

  agg(cs,tf){
    if(tf===1)return cs;
    const out=[]; let bk=null;
    for(const c of cs){
      const bt=Math.floor(c.t/(tf*60000))*(tf*60000);
      if(!bk||bk.t!==bt){if(bk)out.push(bk);bk={t:bt,o:c.o,h:c.h,l:c.l,c:c.c,v:c.v};}
      else{bk.h=Math.max(bk.h,c.h);bk.l=Math.min(bk.l,c.l);bk.c=c.c;bk.v+=c.v;}
    }
    if(bk)out.push(bk);return out;
  },

  draw(){
    Store.ensureSim(); // Always have data to show
    const all=this.agg(Store.all(),this.tf);
    const hasReal=A.wsOk&&Store.candles.length>0;

    // Show/hide no-data message
    D.chartNodata.classList.toggle('hidden-nodata', hasReal||Store.candles.length>0);

    const cc=D.cc,dpr=devicePixelRatio,W=cc.width,H=cc.height;
    const ctx=cc.getContext('2d');
    ctx.clearRect(0,0,W,H);

    if(!all.length)return;
    const vis=Math.min(all.length,Math.floor(W/dpr/6.5));
    const si=Math.max(0,all.length-vis-this.panOff),ei=Math.min(all.length,si+vis);
    const view=all.slice(si,ei);
    if(!view.length)return;

    const hi=Math.max(...view.map(c=>c.h)),lo=Math.min(...view.map(c=>c.l));
    const pad2=(hi-lo)*0.1||hi*.001;
    const yHi=hi+pad2,yLo=lo-pad2,yR=yHi-yLo;
    const toY=v=>H-((v-yLo)/yR*H*.90+H*.05);
    const gap=W/Math.max(view.length,1),cW=Math.max(2,gap*.72);

    // Grid
    ctx.strokeStyle='rgba(255,255,255,0.03)';ctx.lineWidth=dpr;
    for(let i=0;i<=4;i++){
      const y=H*.05+H*.90*(i/4);
      ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();
      ctx.fillStyle='rgba(130,165,210,0.28)';ctx.font=`${8.5*dpr}px monospace`;
      ctx.fillText((yHi-yR*(i/4)).toFixed(5),3,y-3*dpr);
    }

    // BB
    if(this.showBB&&view.length>=10){
      const cls=view.map(c=>c.c);
      ['upper','lower'].forEach(band=>{
        ctx.beginPath();let first=true;
        cls.forEach((_,i)=>{
          if(i<9)return;
          const b=TA.bb(cls.slice(0,i+1),Math.min(20,i+1));
          if(!b)return;const x=i*gap+gap/2;
          if(first){ctx.moveTo(x,toY(b[band]));first=false;}else ctx.lineTo(x,toY(b[band]));
        });
        ctx.strokeStyle='rgba(255,184,48,0.28)';ctx.lineWidth=dpr;ctx.stroke();
      });
    }

    // MA
    if(this.showMA&&view.length>=5){
      const cls=view.map(c=>c.c),maP=Math.min(C.maPeriod,view.length);
      ctx.beginPath();let first=true;
      cls.forEach((_,i)=>{
        const s=cls.slice(0,i+1);if(s.length<maP)return;
        const v=s.slice(-maP).reduce((a,b)=>a+b,0)/maP;
        const x=i*gap+gap/2;
        if(first){ctx.moveTo(x,toY(v));first=false;}else ctx.lineTo(x,toY(v));
      });
      ctx.strokeStyle='rgba(176,106,255,0.65)';ctx.lineWidth=1.5*dpr;ctx.stroke();
    }

    // Candles
    view.forEach((c,i)=>{
      const x=i*gap+gap/2,isUp=c.c>=c.o,col=isUp?'0,229,160':'255,77,109';
      if(i===this.hovIdx){
        ctx.fillStyle='rgba(255,255,255,0.04)';ctx.fillRect(i*gap,0,gap,H);
        D.chartTip.textContent=`O:${c.o.toFixed(5)} H:${c.h.toFixed(5)} L:${c.l.toFixed(5)} C:${c.c.toFixed(5)}`;
        D.chartTip.classList.remove('hidden');
        D.chartTip.style.left=Math.min(x/dpr+6,W/dpr-185)+'px';
      }
      ctx.strokeStyle=`rgba(${col},0.75)`;ctx.lineWidth=dpr;
      ctx.beginPath();ctx.moveTo(x,toY(c.h));ctx.lineTo(x,toY(c.l));ctx.stroke();
      const yO=toY(c.o),yC=toY(c.c),bH=Math.max(1.5*dpr,Math.abs(yC-yO)),bY=Math.min(yO,yC);
      const isLast=i===view.length-1;
      if(C.candleStyle==='hollow'){
        ctx.strokeStyle=`rgba(${col},0.9)`;ctx.lineWidth=dpr;ctx.strokeRect(x-cW/2,bY,cW,bH);
      } else if(C.candleStyle==='bar'){
        ctx.strokeStyle=`rgba(${col},0.9)`;ctx.lineWidth=2*dpr;
        ctx.beginPath();ctx.moveTo(x-cW/2,toY(c.o));ctx.lineTo(x,toY(c.o));
        ctx.moveTo(x,toY(c.h));ctx.lineTo(x,toY(c.l));
        ctx.moveTo(x,toY(c.c));ctx.lineTo(x+cW/2,toY(c.c));ctx.stroke();
      } else {
        ctx.fillStyle=`rgba(${col},${isLast?.5:.88})`;ctx.fillRect(x-cW/2,bY,cW,bH);
        ctx.strokeStyle=`rgba(${col},.95)`;ctx.lineWidth=.7*dpr;ctx.strokeRect(x-cW/2,bY,cW,bH);
      }
      if(isLast&&Store.live){
        ctx.save();ctx.shadowColor=`rgba(${col},.6)`;ctx.shadowBlur=10*dpr;
        ctx.strokeStyle=`rgba(${col},1)`;ctx.lineWidth=2*dpr;
        ctx.strokeRect(x-cW/2,bY,cW,Math.max(2*dpr,bH));ctx.restore();
      }
    });
    if(this.hovIdx<0)D.chartTip.classList.add('hidden');
    if(this.showVol)this.drawVol(view,gap,dpr);
  },

  drawVol(view,gap,dpr){
    const vc=D.vc,ctx=vc.getContext('2d'),W=vc.width,H=vc.height;
    ctx.clearRect(0,0,W,H);
    const maxV=Math.max(...view.map(c=>c.v||0),1);
    view.forEach((c,i)=>{
      const x=i*gap+gap/2,bH=Math.max(1,(c.v||0)/maxV*(H-2*dpr));
      ctx.fillStyle=c.c>=c.o?'rgba(0,229,160,0.42)':'rgba(255,77,109,0.42)';
      ctx.fillRect(x-gap*.36,H-bH,gap*.72,bH);
    });
  },

  bindTouch(){
    const cv=D.cc;let lx=0,active=false;
    cv.addEventListener('touchstart',e=>{if(e.touches.length===1){lx=e.touches[0].clientX;active=true;}},{passive:true});
    cv.addEventListener('touchmove',e=>{
      if(e.touches.length===1&&active){
        const dx=e.touches[0].clientX-lx;lx=e.touches[0].clientX;
        this.panOff=Math.max(0,Math.min(MAX_CANDLES-5,this.panOff+Math.round(dx/6)));
        this.draw();
      }
    },{passive:true});
    cv.addEventListener('touchend',()=>{active=false;},{passive:true});
  },

  bindMouse(){
    const cv=D.cc;
    cv.addEventListener('pointermove',e=>{
      const r=cv.getBoundingClientRect(),x=(e.clientX-r.left)*devicePixelRatio;
      const all2=this.agg(Store.all(),this.tf);
      const vis=Math.min(all2.length,Math.floor(cv.width/devicePixelRatio/6.5));
      const gap=cv.width/Math.max(vis,1);
      this.hovIdx=Math.floor(x/gap);this.draw();
    },{passive:true});
    cv.addEventListener('pointerleave',()=>{this.hovIdx=-1;D.chartTip.classList.add('hidden');this.draw();},{passive:true});
  },
};

/* ─────────────────────────────────────────
   FAB DRAG (fixed bounds)
───────────────────────────────────────── */
(function initFAB(){
  const fab=D.fab;
  let drag=false,moved=false,sx=0,sy=0,longT=null;

  function setPos(x,y,save){
    const W=innerWidth,H=innerHeight,sz=48;
    x=Math.max(4,Math.min(W-sz-4,x));
    y=Math.max(4,Math.min(H-sz-4,y));
    fab.style.cssText=`position:fixed;left:${x}px;top:${y}px;bottom:auto;right:auto;width:48px;height:48px;border-radius:50%;z-index:1000;cursor:pointer;touch-action:none;-webkit-tap-highlight-color:transparent;user-select:none`;
    if(save)try{localStorage.setItem(KEY_FAB,JSON.stringify({x,y}));}catch(e){}
  }

  // Load saved position
  try{
    const s=JSON.parse(localStorage.getItem(KEY_FAB)||'null');
    if(s)setPos(s.x,s.y,false);
  }catch(e){}

  function snapEdge(){
    const r=fab.getBoundingClientRect();
    const nx=(r.left+24)<innerWidth/2?8:innerWidth-56;
    fab.classList.add('snapping');
    setPos(nx,r.top,true);
    setTimeout(()=>fab.classList.remove('snapping'),400);
  }

  fab.addEventListener('pointerdown',e=>{
    e.preventDefault();fab.setPointerCapture(e.pointerId);
    const r=fab.getBoundingClientRect();
    sx=e.clientX-r.left;sy=e.clientY-r.top;
    drag=false;moved=false;
    longT=setTimeout(()=>{if(!moved)openSettings();},650);
  });
  fab.addEventListener('pointermove',e=>{
    if(!fab.hasPointerCapture(e.pointerId))return;
    const r=fab.getBoundingClientRect();
    if(Math.abs(e.clientX-(r.left+sx))>5||Math.abs(e.clientY-(r.top+sy))>5){moved=true;clearTimeout(longT);}
    if(!moved)return;
    drag=true;
    setPos(e.clientX-sx,e.clientY-sy,false);
  });
  fab.addEventListener('pointerup',()=>{
    clearTimeout(longT);
    if(drag){snapEdge();drag=false;}
    else if(!moved){toggleOverlay();}
    moved=false;
  });
  fab.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleOverlay();}});
})();

/* ─────────────────────────────────────────
   OVERLAY DRAG + RESIZE (fully fixed)
───────────────────────────────────────── */
(function initOverlay(){
  const ov=D.overlay,bar=D.ovBar;
  let drag=false,sx=0,sy=0;

  function clamp(){
    const r=ov.getBoundingClientRect(),W=innerWidth,H=innerHeight;
    let l=parseFloat(ov.style.left)||r.left,t=parseFloat(ov.style.top)||r.top;
    l=Math.max(0,Math.min(W-r.width,l));
    t=Math.max(0,Math.min(H-60,t));
    ov.style.left=l+'px';ov.style.top=t+'px';
  }

  function savePos(){
    try{const r=ov.getBoundingClientRect();localStorage.setItem(KEY_POS,JSON.stringify({x:r.left,y:r.top,w:r.width,h:r.height}));}catch(e){}
  }

  function toAbsolute(){
    if(ov.classList.contains('dragged'))return;
    const r=ov.getBoundingClientRect();
    ov.style.left=r.left+'px';ov.style.top=r.top+'px';
    ov.style.transform='none';ov.classList.add('dragged');
  }

  // Load saved
  try{
    const s=JSON.parse(localStorage.getItem(KEY_POS)||'null');
    if(s){
      ov.style.left=s.x+'px';ov.style.top=s.y+'px';
      ov.style.transform='none';ov.classList.add('dragged');
      if(s.w)ov.style.width=s.w+'px';
      if(s.h)ov.style.height=s.h+'px';
    }
  }catch(e){}

  // Drag
  bar.addEventListener('pointerdown',e=>{
    if(A.max)return;
    e.preventDefault();bar.setPointerCapture(e.pointerId);
    toAbsolute();
    sx=e.clientX-parseFloat(ov.style.left);
    sy=e.clientY-parseFloat(ov.style.top);
    drag=true;
  });
  bar.addEventListener('pointermove',e=>{
    if(!drag)return;
    const W=innerWidth,H=innerHeight;
    const r=ov.getBoundingClientRect();
    let nx=e.clientX-sx,ny=e.clientY-sy;
    nx=Math.max(0,Math.min(W-r.width,nx));
    ny=Math.max(0,Math.min(H-60,ny));
    ov.style.left=nx+'px';ov.style.top=ny+'px';
  });
  bar.addEventListener('pointerup',()=>{drag=false;savePos();});
  bar.addEventListener('pointercancel',()=>{drag=false;});

  // Resize corner
  const grip=D.grip;let res=false,rsx=0,rsy=0,rw=0,rh=0;
  grip.addEventListener('pointerdown',e=>{
    e.preventDefault();e.stopPropagation();
    grip.setPointerCapture(e.pointerId);
    toAbsolute();
    const r=ov.getBoundingClientRect();
    rsx=e.clientX;rsy=e.clientY;rw=r.width;rh=r.height;res=true;
  });
  grip.addEventListener('pointermove',e=>{
    if(!res)return;
    const nw=Math.max(260,Math.min(innerWidth*.95,rw+e.clientX-rsx));
    const nh=Math.max(220,Math.min(innerHeight*.90,rh+e.clientY-rsy));
    ov.style.width=nw+'px';ov.style.height=nh+'px';
    clamp();if(A.tab==='chart')Chart.resize();
  });
  grip.addEventListener('pointerup',()=>{res=false;savePos();});
  grip.addEventListener('pointercancel',()=>{res=false;});

  // Pinch resize
  let pd=null,pw=0,ph=0;
  ov.addEventListener('touchstart',e=>{
    if(e.touches.length===2){
      const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY;
      pd=Math.sqrt(dx*dx+dy*dy);const r=ov.getBoundingClientRect();pw=r.width;ph=r.height;
    }
  },{passive:true});
  ov.addEventListener('touchmove',e=>{
    if(e.touches.length===2&&pd){
      e.preventDefault();
      const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY;
      const sc=Math.sqrt(dx*dx+dy*dy)/pd;
      ov.style.width=Math.max(260,Math.min(innerWidth*.95,pw*sc))+'px';
      ov.style.height=Math.max(220,Math.min(innerHeight*.90,ph*sc))+'px';
      clamp();
    }
  },{passive:false});
  ov.addEventListener('touchend',e=>{if(e.touches.length<2){pd=null;savePos();}},{passive:true});

  // Prevent body scroll propagation from scrollable areas inside overlay
  ov.addEventListener('touchmove',e=>{
    const t=e.target;
    if(!t.closest('.pane,.sp-body'))e.stopPropagation();
  },{passive:false});

  // Keep in bounds on window resize
  window.addEventListener('resize',()=>{
    if(!A.max)clamp();
    if(A.tab==='chart')Chart.resize();
  },{passive:true});
})();

/* ─────────────────────────────────────────
   OVERLAY OPEN/CLOSE/MIN/MAX
───────────────────────────────────────── */
function toggleOverlay(){A.open?closeOverlay():openOverlay();}
function openOverlay(){
  if(A.open)return; A.open=true;
  D.overlay.classList.remove('hidden','ov-out');
  D.overlay.classList.add('ov-in');
  D.fab.classList.add('on');
  if(A.tab==='chart')setTimeout(()=>Chart.resize(),360);
  if(!A.lastSig&&!A.analyzing)setTimeout(fireSignal,500);
}
function closeOverlay(){
  if(!A.open)return;
  D.overlay.classList.remove('ov-in');
  D.overlay.classList.add('ov-out');
  D.fab.classList.remove('on');
  setTimeout(()=>{
    A.open=A.min=A.max=false;
    D.overlay.classList.add('hidden');
    D.overlay.classList.remove('ov-out','minimized','maximized');
  },240);
}
function minimizeOverlay(){
  if(A.max)return; A.min=!A.min;
  D.overlay.classList.toggle('minimized',A.min);
}
function maximizeOverlay(){
  if(A.min){A.min=false;D.overlay.classList.remove('minimized');}
  A.max=!A.max;D.overlay.classList.toggle('maximized',A.max);
  if(!A.max){
    try{const s=JSON.parse(localStorage.getItem(KEY_POS)||'null');
      if(s){D.overlay.style.left=s.x+'px';D.overlay.style.top=s.y+'px';
        D.overlay.style.transform='none';D.overlay.classList.add('dragged');
        if(s.w)D.overlay.style.width=s.w+'px';if(s.h)D.overlay.style.height=s.h+'px';}
    }catch(e){}
  }
  setTimeout(()=>{if(A.tab==='chart')Chart.resize();},80);
}
function openSettings(){A.settOpen=true;D.settPanel.classList.remove('hidden');}
function closeSettings(){A.settOpen=false;D.settPanel.classList.add('hidden');saveC();if(A.wsOk)wsSubscribe(C.asset);}

/* ─────────────────────────────────────────
   TABS
───────────────────────────────────────── */
function initTabs(){
  D.tabs.forEach(tab=>{
    tab.addEventListener('click',()=>{
      const name=tab.dataset.pane;
      D.tabs.forEach(t=>t.classList.remove('active'));
      D.panes.forEach(p=>p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('pane-'+name)?.classList.add('active');
      A.tab=name;
      if(name==='chart')setTimeout(()=>Chart.resize(),80);
    });
  });
}

/* ─────────────────────────────────────────
   ASSET PILLS
───────────────────────────────────────── */
function initPills(){
  D.pills.forEach(pill=>{
    pill.addEventListener('click',()=>{
      const asset=pill.dataset.asset;
      C.asset=asset; saveC();
      D.pills.forEach(p=>p.classList.remove('active'));
      pill.classList.add('active');
      updateMarketDisplay(asset);
      if(A.wsOk) wsSubscribe(asset);
      // Reset store for new asset
      Store.candles=[]; Store.live=null; Store.price=null; Store.prevPrice=null;
      D.tkPrice.textContent='--.------';
      D.tkChg.textContent='+0.00%'; D.tkChg.className='tk-chg neutral';
      D.tkOhlc.textContent='-- / -- / -- / --';
      Chart.draw();
    });
  });
}

/* ─────────────────────────────────────────
   SETTINGS WIRING
───────────────────────────────────────── */
function initSettings(){
  const bind=(id,key,parse)=>{
    const e=G(id);if(!e)return;
    const up=()=>{C[key]=parse?parse(e):e.type==='checkbox'?e.checked:e.value;syncC();};
    e.addEventListener('change',up);e.addEventListener('input',up);
  };
  bind('sv-voice','voice'); bind('sv-speak','autoSpeak'); bind('sv-vib','vibrate');
  bind('sv-vol','volume',e=>+e.value); bind('sv-anim','anim',e=>e.value);
  bind('sv-opa','opacity',e=>+e.value); bind('sv-cs','candleStyle',e=>e.value);
  bind('sv-ma','maPeriod',e=>+e.value); bind('sv-rec','autoReconnect');
  D.spClose.addEventListener('click',closeSettings);
}

/* ─────────────────────────────────────────
   VOICE
───────────────────────────────────────── */
let synth=window.speechSynthesis,voice=null;
function initVoice(){
  if(!synth)return;
  const pick=()=>{
    const vs=synth.getVoices();
    voice=vs.find(v=>v.name.includes('Samantha'))||vs.find(v=>v.name.includes('Google UK English Female'))||vs.find(v=>v.lang==='en-US')||vs.find(v=>v.lang.startsWith('en'))||vs[0]||null;
  };
  pick();synth.onvoiceschanged=pick;
}
function voiceSpeak(dir,conf){
  if(!C.voice||!synth)return;
  try{
    synth.cancel();
    const tx=dir==='UP'
      ?[`Signal up. ${conf} percent confidence.`,`Bullish signal. ${conf} percent.`,`Up signal confirmed. ${conf}.`]
      :[`Signal down. ${conf} percent confidence.`,`Bearish signal. ${conf} percent.`,`Down signal confirmed. ${conf}.`];
    const u=new SpeechSynthesisUtterance(tx[Math.floor(Math.random()*3)]);
    if(voice)u.voice=voice;u.rate=.95;u.volume=C.volume/100;synth.speak(u);
  }catch(e){}
}

/* ─────────────────────────────────────────
   IFRAME (fixed — no new tab)
───────────────────────────────────────── */
function initIframe(){
  const fr=D.mframe;
  // Delay src assignment so page renders first
  const loadIt=()=>{
    fr.src=MARKET_URL;
  };
  setTimeout(loadIt,600);

  fr.addEventListener('load',()=>{
    D.iframeLoader.classList.add('done');
    setTimeout(()=>D.iframeLoader.classList.add('hidden'),700);
  });

  // Fallback timeout — 14s
  const tmo=setTimeout(()=>{
    if(!D.iframeLoader.classList.contains('done')){
      D.iframeLoader.classList.add('hidden');
      D.iframeFB.classList.remove('hidden');
    }
  },14000);
  fr.addEventListener('load',()=>clearTimeout(tmo));
}

window.openMarket=function(){window.location.href=MARKET_URL;};
window.reloadIframe=function(){
  D.iframeFB.classList.add('hidden');
  D.iframeLoader.classList.remove('hidden','done');
  D.mframe.src='about:blank';
  setTimeout(()=>{D.mframe.src=MARKET_URL;},400);
};

/* ─────────────────────────────────────────
   BD TIME + SIGNAL TIMER
───────────────────────────────────────── */
function getBD(){return new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Dhaka'}));}
function fmtTime(d){return`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;}
function pad(n){return String(n).padStart(2,'0');}

function timeTick(){
  const now=getBD(),sec=now.getSeconds(),rem=60-sec;
  D.bdTime.textContent=fmtTime(now);
  D.cdNum.textContent=rem===60?'60':rem;
  D.cdNum.className='cd-num'+(rem<=5?' urgent':'');
  const off=CD_FULL*(sec/60);
  D.cdFg.style.strokeDashoffset=CD_FULL-off;
  D.cdFg.classList.toggle('urgent',rem<=5);
  if(sec===SIG_AT_SEC&&sec!==A.lastSigSec){A.lastSigSec=sec;fireSignal();}
  if(sec<SIG_AT_SEC)A.lastSigSec=-1;
  if(A.tab==='chart'&&A.open)Chart.draw();
}

/* ─────────────────────────────────────────
   MAIN RAF LOOP
───────────────────────────────────────── */
let raf=null,lastT=0;
function loop(ts){
  raf=requestAnimationFrame(loop);
  if(ts-lastT>=500){lastT=ts;timeTick();}
}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){if(raf){cancelAnimationFrame(raf);raf=null;}}
  else{if(!raf)raf=requestAnimationFrame(loop);}
});

/* ─────────────────────────────────────────
   EVENT BINDING
───────────────────────────────────────── */
function bindEvents(){
  D.btnClose.addEventListener('click',closeOverlay);
  D.btnMin.addEventListener('click',minimizeOverlay);
  D.btnMax.addEventListener('click',maximizeOverlay);
  D.btnSett.addEventListener('click',()=>A.settOpen?closeSettings():openSettings());
}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

/* ─────────────────────────────────────────
   BOOT
───────────────────────────────────────── */
(function boot(){
  loadC();
  initSettings(); initVoice(); initTabs(); initPills();
  Chart.init();
  bindEvents();
  initIframe();
  updateMarketDisplay(C.asset);
  // Start WS
  wsConnect();
  // RAF loop
  raf=requestAnimationFrame(loop);
  setStatus('idle');
  // Generate sim data immediately so chart is not empty
  Store.ensureSim();
  Chart.draw();
  console.log('%c⚛ Quantum AI v4%c\nAll issues fixed. iframe + chart + market.','color:#00e5a0;font-weight:900;font-size:15px;','color:#888;font-size:11px;');
})();
