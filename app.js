/**
 * ═══════════════════════════════════════════════════════════
 * QUANTUM OVERLAY AI v2 — app.js
 * Live WebSocket Edition
 * WS: wss://ws2.market-qx.info/socket.io/?EIO=3&transport=websocket
 * ═══════════════════════════════════════════════════════════
 */
'use strict';

/* ════════════════════════════════════════════
   SECTION 1 — CONFIG & CONSTANTS
════════════════════════════════════════════ */
const WS_URL     = 'wss://ws2.market-qx.info/socket.io/?EIO=3&transport=websocket';
const RECONNECT_DELAY   = 3000;
const MAX_CANDLES       = 120;   // keep last 120 candles in memory
const SIGNAL_AT_SECOND  = 55;    // fire signal at :55 of each minute
const RING_CIRC         = 106.81; // 2π × 17

const SETTINGS_KEY = 'qai2_settings';
const POS_KEY      = 'qai2_ov_pos';
const FAB_KEY      = 'qai2_fab_pos';

/* ════════════════════════════════════════════
   SECTION 2 — SETTINGS
════════════════════════════════════════════ */
let CFG = {
  voice: true, autoSpeak: true, vibration: true,
  animations: 'full', opacity: 92, volume: 80,
  darkMode: true, countdown: 'ring',
  candleStyle: 'classic', maPeriod: 14,
  asset: '#OTC_BTCUSD', autoReconnect: true,
  showMA: true, showBB: false, showVol: true,
};

function loadCFG() {
  try { Object.assign(CFG, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch(e) {}
  applyCFG();
}
function saveCFG() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(CFG)); } catch(e) {}
}
function applyCFG() {
  document.documentElement.style.setProperty('--opa', (CFG.opacity/100).toFixed(2));
  syncSettingsUI();
}
function syncSettingsUI() {
  const set = (id, val) => {
    const e = document.getElementById(id); if (!e) return;
    if (e.type === 'checkbox') e.checked = !!val; else e.value = val;
  };
  set('s-voice', CFG.voice); set('s-auto-speak', CFG.autoSpeak);
  set('s-vibration', CFG.vibration); set('s-animations', CFG.animations);
  set('s-opacity', CFG.opacity); set('s-volume', CFG.volume);
  set('s-dark', CFG.darkMode); set('s-countdown', CFG.countdown);
  set('s-candle-style', CFG.candleStyle); set('s-ma-period', CFG.maPeriod);
  set('s-asset', CFG.asset); set('s-auto-reconnect', CFG.autoReconnect);
}

/* ════════════════════════════════════════════
   SECTION 3 — DOM CACHE
════════════════════════════════════════════ */
const $ = id => document.getElementById(id);
const DOM = {
  fab: $('fab'), fabTick: $('fab-tick'),
  overlay: $('overlay'), titlebar: $('overlay-titlebar'),
  resizeHandle: $('resize-handle'),
  btnClose: $('btn-ov-close'), btnMin: $('btn-ov-min'), btnMax: $('btn-ov-max'),
  btnSettingsOpen: $('btn-settings-open'), btnSettingsClose: $('btn-settings-close'),
  settingsPanel: $('settings-panel'),

  wsToast: $('ws-toast'), wsDot: $('ws-dot'), wsLabel: $('ws-label'),
  tbLive: $('tb-live-badge'),

  bdTime: $('bd-time'), cdNum: $('cd-num'), cdArc: $('cd-arc'),
  assetLabel: $('asset-label'),

  tabs: document.querySelectorAll('.tab'),
  tabPanes: document.querySelectorAll('.tab-pane'),

  // Signal tab
  dirCard: $('dir-card'), dirArrow: $('dir-arrow'),
  dirLabel: $('dir-label'), dirConf: $('dir-conf'),
  mbConf: $('mb-conf'), mbStr: $('mb-str'), mbTrend: $('mb-trend'), mbVol: $('mb-vol'),
  mvConf: $('mv-conf'), mvStr: $('mv-str'), mvTrend: $('mv-trend'), mvVol: $('mv-vol'),
  riskDots: $('risk-dots'), aid: $('aid'), astatus: $('astatus'),
  dataSource: $('data-source'),
  tickPrice: $('tick-price'), tickChange: $('tick-change'), tickOhlc: $('tick-ohlc'),

  // Chart tab
  candleCanvas: $('candle-canvas'), volumeCanvas: $('volume-canvas'),
  chartCrosshair: $('chart-crosshair'), chInfo: $('ch-info'),
  ctbBtns: document.querySelectorAll('.ctb-btn'),
  btnMA: $('btn-chart-ma'), btnBB: $('btn-chart-bb'), btnVol: $('btn-chart-vol'),

  // Engine tab
  ecards: document.querySelectorAll('.ec'),
  escores: {
    trend:$('es-trend'),momentum:$('es-momentum'),ma:$('es-ma'),
    volatility:$('es-volatility'),candle:$('es-candle'),freq:$('es-freq'),
    bayes:$('es-bayes'),markov:$('es-markov'),streak:$('es-streak'),
    reversal:$('es-reversal'),rsi:$('es-rsi'),adaptive:$('es-adaptive'),
  },
  ebars: {
    trend:$('eb-trend'),momentum:$('eb-momentum'),ma:$('eb-ma'),
    volatility:$('eb-volatility'),candle:$('eb-candle'),freq:$('eb-freq'),
    bayes:$('eb-bayes'),markov:$('eb-markov'),streak:$('eb-streak'),
    reversal:$('eb-reversal'),rsi:$('eb-rsi'),adaptive:$('eb-adaptive'),
  },

  // History tab
  hsTotal:$('hs-total'), hsUp:$('hs-up'), hsDn:$('hs-dn'), hsSrc:$('hs-src'),
  historyList:$('history-list'),

  // Cinema
  cinemaLayer:$('cinema-layer'), cinemaCanvas:$('cinema-canvas'),
  cinStatus:$('cin-status'), cinAsset:$('cin-asset'),
  cinProgBar:$('cin-prog-bar'), cinProgNum:$('cin-prog-num'),
  cinModules:document.querySelectorAll('.cm'),
  cinResult:$('cin-result'), cinDir:$('cin-dir'),
  cinConf:$('cin-conf'), cinDataNote:$('cin-data-note'),

  iframeFallback:$('iframe-fallback'), marketFrame:$('market-frame'),
};

/* ════════════════════════════════════════════
   SECTION 4 — APPLICATION STATE
════════════════════════════════════════════ */
const APP = {
  overlayOpen: false, overlayMin: false, overlayMax: false,
  settingsOpen: false, analyzing: false,
  activeTab: 'signal',
  aidCounter: 1000,
  lastSignal: null,
  signalHistory: [],       // [{dir,confidence,time,aid,live}]
  wsConnected: false,
  wsReconnectTimer: null,
};

/* ════════════════════════════════════════════
   SECTION 5 — CANDLE DATA STORE
════════════════════════════════════════════ */
const CandleStore = {
  candles: [],    // [{t,o,h,l,c,v}] sorted ascending
  liveCandle: null,  // current incomplete candle being built from ticks
  lastPrice: null,
  lastPrevPrice: null,

  push(candle) {
    // Replace if same timestamp
    const idx = this.candles.findIndex(c => c.t === candle.t);
    if (idx >= 0) this.candles[idx] = candle;
    else this.candles.push(candle);
    if (this.candles.length > MAX_CANDLES) this.candles.shift();
    this.candles.sort((a,b) => a.t - b.t);
  },

  // Feed a real-time tick into the live candle
  tick(price, ts) {
    const minuteTs = Math.floor(ts / 60000) * 60000;
    if (!this.liveCandle || this.liveCandle.t !== minuteTs) {
      // Close old live candle
      if (this.liveCandle) this.push({ ...this.liveCandle });
      this.liveCandle = { t: minuteTs, o: price, h: price, l: price, c: price, v: 1 };
    } else {
      const lc = this.liveCandle;
      lc.h = Math.max(lc.h, price);
      lc.l = Math.min(lc.l, price);
      lc.c = price;
      lc.v++;
    }
    this.lastPrevPrice = this.lastPrice;
    this.lastPrice = price;
  },

  // All candles for analysis (include live)
  getAll() {
    const arr = [...this.candles];
    if (this.liveCandle) {
      const idx = arr.findIndex(c => c.t === this.liveCandle.t);
      if (idx >= 0) arr[idx] = { ...this.liveCandle };
      else arr.push({ ...this.liveCandle });
    }
    return arr;
  },

  // Returns close array for indicator math
  closes() { return this.getAll().map(c => c.c); },
  highs()  { return this.getAll().map(c => c.h); },
  lows()   { return this.getAll().map(c => c.l); },
  volumes(){ return this.getAll().map(c => c.v || 0); },
};

/* ════════════════════════════════════════════
   SECTION 6 — WEBSOCKET CLIENT
   Protocol: Socket.IO v3 (EIO=3) over raw WebSocket
════════════════════════════════════════════ */
let ws = null;
let pingInterval = null;
let wsHeartbeat  = null;

function wsConnect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  updateWsUI('connecting');
  try {
    ws = new WebSocket(WS_URL);
  } catch(e) {
    scheduleReconnect(); return;
  }

  ws.onopen = () => {
    clearTimeout(APP.wsReconnectTimer);
    updateWsUI('connected');
    wsHandshake();
  };

  ws.onmessage = e => wsOnMessage(e.data);

  ws.onerror = () => {};

  ws.onclose = () => {
    updateWsUI('disconnected');
    clearInterval(pingInterval);
    clearInterval(wsHeartbeat);
    if (CFG.autoReconnect) scheduleReconnect();
  };
}

function scheduleReconnect() {
  clearTimeout(APP.wsReconnectTimer);
  APP.wsReconnectTimer = setTimeout(wsConnect, RECONNECT_DELAY);
}

/* Socket.IO EIO=3 framing */
function wsSend(data) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(data);
}

function wsHandshake() {
  // EIO3: after receiving "0{...}" handshake, send ping "2" to confirm
  // Then subscribe to asset quotes
  setTimeout(() => {
    wsSend('40');   // Socket.IO connect namespace
    setTimeout(() => subscribeAsset(CFG.asset), 800);
  }, 300);

  // Keep-alive ping every 20s
  pingInterval = setInterval(() => wsSend('2'), 20000);
}

function subscribeAsset(asset) {
  // Market QX socket.io events — subscribe to candle/tick feed
  const subscribeMsg = JSON.stringify({
    asset: asset,
    period: 60,  // 1-minute candles
  });
  // Emit 'subscribe' event — EIO3 format: 42["eventName", data]
  wsSend(`42["subscribeCandle",${subscribeMsg}]`);
  wsSend(`42["subscribeTick",{"asset":"${asset}"}]`);
  DOM.assetLabel.textContent = asset.replace('#OTC_','').replace('OTC_','');
}

function wsOnMessage(raw) {
  try {
    // EIO3 packet types
    if (raw === '3') return; // pong
    if (raw.startsWith('0')) {
      // Handshake packet — contains pingInterval
      return;
    }
    if (raw.startsWith('42')) {
      // Event packet
      const json = raw.slice(2);
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) return;
      const [event, data] = parsed;
      handleSocketEvent(event, data);
    }
    if (raw.startsWith('45')) {
      // Binary ack — ignore
    }
  } catch(e) {}
}

function handleSocketEvent(event, data) {
  switch(event) {
    case 'candle':
    case 'candles':
    case 'history':
      handleCandleData(data);
      break;
    case 'tick':
    case 'quote':
    case 'price':
      handleTickData(data);
      break;
    case 'asset':
      handleAssetData(data);
      break;
    default:
      // Try to parse any numeric price data
      tryParseGenericData(data);
  }
}

function handleCandleData(data) {
  if (!data) return;
  // Data may be array of candles or single candle
  const items = Array.isArray(data) ? data : [data];
  items.forEach(item => {
    const candle = normalizeCandle(item);
    if (candle) {
      CandleStore.push(candle);
      flashFabTick();
    }
  });
  renderChart();
  updatePriceTicker();
}

function handleTickData(data) {
  if (!data) return;
  // Extract price from various field names
  const price =
    parseFloat(data.price || data.close || data.c ||
               data.value || data.ask || data.bid || 0);
  const ts = data.time || data.t || data.timestamp || Date.now();
  if (!price || isNaN(price)) return;

  CandleStore.tick(price, typeof ts === 'number' ? ts : Date.now());
  updatePriceTicker();
  flashFabTick();

  // Render chart live on every tick
  renderChart();
}

function handleAssetData(data) {
  if (data && data.name) DOM.assetLabel.textContent = data.name;
}

function tryParseGenericData(data) {
  if (!data || typeof data !== 'object') return;
  // Walk object looking for price fields
  const priceFields = ['price','close','c','value','last','lp','ask','bid'];
  for (const f of priceFields) {
    if (data[f] && !isNaN(parseFloat(data[f]))) {
      handleTickData(data);
      return;
    }
  }
}

function normalizeCandle(raw) {
  if (!raw) return null;
  const c = {
    t: raw.time || raw.t || raw.timestamp || raw.open_time || 0,
    o: parseFloat(raw.open  || raw.o || 0),
    h: parseFloat(raw.high  || raw.h || 0),
    l: parseFloat(raw.low   || raw.l || 0),
    c: parseFloat(raw.close || raw.c || 0),
    v: parseFloat(raw.volume|| raw.v || 1),
  };
  // Validate
  if (!c.t || !c.o || !c.c) return null;
  if (c.h < c.o && c.h < c.c) c.h = Math.max(c.o, c.c);
  if (c.l > c.o && c.l > c.c) c.l = Math.min(c.o, c.c);
  return c;
}

function updateWsUI(status) {
  APP.wsConnected = status === 'connected';
  const t = DOM.wsToast, d = DOM.wsDot, l = DOM.wsLabel;
  t.className = `ws-${status === 'connected' ? 'connected' : status === 'connecting' ? 'connecting' : 'disconnected'}`;
  d.textContent = '●';
  l.textContent = status === 'connected' ? 'LIVE DATA' :
                  status === 'connecting' ? 'Connecting…' : 'Reconnecting…';
  DOM.tbLive.className = 'tb-live' + (APP.wsConnected ? '' : ' offline');
  DOM.tbLive.textContent = APP.wsConnected ? '● LIVE' : '● SIM';
  DOM.dataSource.className = 'ds-label' + (APP.wsConnected ? ' ds-live' : '');
  DOM.dataSource.textContent = APP.wsConnected ? 'LIVE' : 'SIM';
}

function flashFabTick() {
  DOM.fabTick.classList.remove('hidden');
  clearTimeout(DOM.fabTick._t);
  DOM.fabTick._t = setTimeout(() => DOM.fabTick.classList.add('hidden'), 280);
}

/* ════════════════════════════════════════════
   SECTION 7 — PRICE TICKER UI
════════════════════════════════════════════ */
function updatePriceTicker() {
  const price = CandleStore.lastPrice;
  const prev  = CandleStore.lastPrevPrice;
  if (!price) return;

  DOM.tickPrice.textContent = price.toFixed(6);

  if (prev) {
    const diff = price - prev;
    const pct  = (diff / prev * 100).toFixed(4);
    const up   = diff >= 0;
    DOM.tickChange.textContent = `${up ? '+' : ''}${pct}%`;
    DOM.tickChange.className   = `ptick-change ${up ? 'up' : 'dn'}`;
  }

  const lc = CandleStore.liveCandle || (CandleStore.candles.length ?
             CandleStore.candles[CandleStore.candles.length - 1] : null);
  if (lc) {
    DOM.tickOhlc.textContent =
      `${lc.o.toFixed(5)} / ${lc.h.toFixed(5)} / ${lc.l.toFixed(5)} / ${lc.c.toFixed(5)}`;
  }
}

/* ════════════════════════════════════════════
   SECTION 8 — TECHNICAL INDICATORS
════════════════════════════════════════════ */
const TA = {
  // Simple Moving Average
  sma(arr, period) {
    if (arr.length < period) return null;
    const slice = arr.slice(-period);
    return slice.reduce((a,b) => a+b, 0) / period;
  },

  // Exponential Moving Average
  ema(arr, period) {
    if (arr.length < period) return null;
    const k = 2 / (period + 1);
    let ema = arr.slice(0, period).reduce((a,b) => a+b, 0) / period;
    for (let i = period; i < arr.length; i++) {
      ema = arr[i] * k + ema * (1 - k);
    }
    return ema;
  },

  // EMA array (full)
  emaArr(arr, period) {
    if (arr.length < period) return [];
    const k = 2 / (period + 1);
    const out = [];
    let ema = arr.slice(0, period).reduce((a,b) => a+b,0) / period;
    out.push(ema);
    for (let i = period; i < arr.length; i++) {
      ema = arr[i] * k + ema * (1 - k);
      out.push(ema);
    }
    return out;
  },

  // RSI
  rsi(arr, period = 14) {
    if (arr.length < period + 1) return 50;
    const changes = [];
    for (let i = 1; i < arr.length; i++) changes.push(arr[i] - arr[i-1]);
    let gains = 0, losses = 0;
    for (let i = 0; i < period; i++) {
      if (changes[i] > 0) gains += changes[i];
      else losses -= changes[i];
    }
    let avgGain = gains / period, avgLoss = losses / period;
    for (let i = period; i < changes.length; i++) {
      const g = changes[i] > 0 ? changes[i] : 0;
      const l = changes[i] < 0 ? -changes[i] : 0;
      avgGain = (avgGain * (period-1) + g) / period;
      avgLoss = (avgLoss * (period-1) + l) / period;
    }
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  },

  // Bollinger Bands
  bbands(arr, period = 20, mult = 2) {
    if (arr.length < period) return null;
    const slice = arr.slice(-period);
    const mid   = slice.reduce((a,b) => a+b,0) / period;
    const variance = slice.reduce((s,v) => s + (v-mid)**2, 0) / period;
    const std = Math.sqrt(variance);
    return { upper: mid + mult*std, mid, lower: mid - mult*std, width: 2*mult*std };
  },

  // ATR (Average True Range)
  atr(candles, period = 14) {
    if (candles.length < 2) return 0;
    const trs = [];
    for (let i = 1; i < candles.length; i++) {
      const c = candles[i], p = candles[i-1];
      trs.push(Math.max(
        c.h - c.l,
        Math.abs(c.h - p.c),
        Math.abs(c.l - p.c)
      ));
    }
    return this.sma(trs, Math.min(period, trs.length)) || 0;
  },

  // MACD
  macd(arr, fast=12, slow=26, signal=9) {
    if (arr.length < slow) return { macd:0, signal:0, hist:0 };
    const emaFast = this.emaArr(arr, fast);
    const emaSlow = this.emaArr(arr, slow);
    const len = Math.min(emaFast.length, emaSlow.length);
    const macdLine = [];
    for (let i = 0; i < len; i++) {
      macdLine.push(emaFast[emaFast.length - len + i] - emaSlow[emaSlow.length - len + i]);
    }
    const sig = this.ema(macdLine, Math.min(signal, macdLine.length)) || 0;
    const last = macdLine[macdLine.length-1] || 0;
    return { macd: last, signal: sig, hist: last - sig };
  },

  // Stochastic
  stoch(candles, period=14) {
    if (candles.length < period) return 50;
    const slice = candles.slice(-period);
    const close = slice[slice.length-1].c;
    const high  = Math.max(...slice.map(c => c.h));
    const low   = Math.min(...slice.map(c => c.l));
    if (high === low) return 50;
    return ((close - low) / (high - low)) * 100;
  },

  // Candle pattern score (–100 bullish…+100 bearish inverted: positive = UP)
  candlePattern(candles) {
    if (candles.length < 3) return 0;
    const [prev2, prev, cur] = candles.slice(-3);
    const body   = c => Math.abs(c.c - c.o);
    const range  = c => c.h - c.l;
    const isBull = c => c.c > c.o;

    let score = 0;

    // Hammer (bullish reversal)
    if (!isBull(prev) && isBull(cur)) {
      const lowerShadow = Math.min(cur.o,cur.c) - cur.l;
      if (lowerShadow > body(cur)*2) score += 35;
    }
    // Engulfing
    if (isBull(cur) && !isBull(prev) && cur.o < prev.c && cur.c > prev.o) score += 40;
    if (!isBull(cur) && isBull(prev) && cur.o > prev.c && cur.c < prev.o) score -= 40;
    // Doji
    if (body(cur) < range(cur)*0.08) score += (isBull(prev) ? -15 : 15);
    // Three consecutive
    const last3 = candles.slice(-3);
    if (last3.every(c => isBull(c))) score += 25;
    if (last3.every(c => !isBull(c))) score -= 25;
    // Star
    if (!isBull(prev2) && body(prev) < body(prev2)*0.3 && isBull(cur)) score += 30;

    return Math.max(-100, Math.min(100, score));
  },

  // Trend strength (ADX-like simplified)
  trendStrength(candles, period=14) {
    if (candles.length < period+1) return { strength:0, dir:0 };
    const slice = candles.slice(-period-1);
    let upMove=0, dnMove=0;
    for (let i=1; i<slice.length; i++) {
      const hi = slice[i].h - slice[i-1].h;
      const lo = slice[i-1].l - slice[i].l;
      if (hi > lo && hi > 0) upMove += hi;
      if (lo > hi && lo > 0) dnMove += lo;
    }
    const total = upMove + dnMove;
    if (!total) return { strength:0, dir:0 };
    const dir = upMove > dnMove ? 1 : -1;
    const str = Math.abs(upMove - dnMove) / total * 100;
    return { strength: str, dir };
  },

  // Volume profile
  volumeProfile(candles) {
    if (candles.length < 5) return 0;
    const recent = candles.slice(-5);
    const avg = candles.slice(-20).reduce((s,c) => s+c.v, 0) / 20;
    const rAvg = recent.reduce((s,c) => s+c.v, 0) / 5;
    return avg > 0 ? (rAvg / avg - 1) * 100 : 0; // % above/below average
  },
};

/* ════════════════════════════════════════════
   SECTION 9 — MARKOV CHAIN STATE
════════════════════════════════════════════ */
const Markov = {
  seq: [],
  push(dir) { this.seq.push(dir); if (this.seq.length > 80) this.seq.shift(); },
  pUp() {
    const s = this.seq; if (s.length < 2) return 0.5;
    let uu=0, ud=0, du=0, dd=0;
    for (let i=0; i<s.length-1; i++) {
      if (s[i]==='UP'   && s[i+1]==='UP')   uu++;
      if (s[i]==='UP'   && s[i+1]==='DOWN') ud++;
      if (s[i]==='DOWN' && s[i+1]==='UP')   du++;
      if (s[i]==='DOWN' && s[i+1]==='DOWN') dd++;
    }
    const last = s[s.length-1];
    if (last==='UP')   { const t=uu+ud||1; return uu/t; }
    else               { const t=du+dd||1; return du/t; }
  },
  streakLen() {
    if (!this.seq.length) return 0;
    const last = this.seq[this.seq.length-1];
    let n = 0;
    for (let i = this.seq.length-1; i >= 0; i--) {
      if (this.seq[i] === last) n++; else break;
    }
    return n;
  },
};

/* ════════════════════════════════════════════
   SECTION 10 — ANALYSIS ENGINE
   Uses real candle data when available, falls
   back to time-seeded statistical simulation
════════════════════════════════════════════ */
function runAnalysis() {
  const candles = CandleStore.getAll();
  const closes  = candles.map(c => c.c);
  const n       = candles.length;
  const hasData = n >= 10; // have enough real data
  const now     = getBDTime();

  // ── Compute each module score (–100 to +100, positive = UP) ──

  // 1. Trend (EMA alignment)
  let trend = 0;
  if (hasData && closes.length >= 20) {
    const ema7  = TA.ema(closes, 7)  || 0;
    const ema14 = TA.ema(closes, 14) || 0;
    const ema21 = TA.ema(closes, 21) || 0;
    const price = closes[closes.length-1];
    // Price above all EMAs = strong up trend
    trend  = (price > ema7  ? 20 : -20);
    trend += (price > ema14 ? 15 : -15);
    trend += (price > ema21 ? 15 : -15);
    trend += (ema7  > ema14 ? 25 : -25);
    trend += (ema14 > ema21 ? 25 : -25);
  } else {
    trend = simScore(1, now);
  }

  // 2. Momentum (MACD)
  let momentum = 0;
  if (hasData && closes.length >= 26) {
    const { hist } = TA.macd(closes);
    momentum = Math.max(-100, Math.min(100, hist * 10000));
  } else {
    momentum = simScore(2, now);
  }

  // 3. MA Cross
  let ma = 0;
  if (hasData && closes.length >= CFG.maPeriod + 5) {
    const fast = TA.sma(closes, Math.max(5, Math.floor(CFG.maPeriod/2)));
    const slow = TA.sma(closes, CFG.maPeriod);
    if (fast !== null && slow !== null) {
      ma = fast > slow ? 60 + Math.min(40,(fast-slow)/slow*1e5) :
                        -60 - Math.min(40,(slow-fast)/slow*1e5);
    }
  } else {
    ma = simScore(3, now);
  }

  // 4. Volatility (ATR-based directionality)
  let volatility = 0;
  if (hasData) {
    const atr   = TA.atr(candles);
    const price = closes[closes.length-1];
    const bb    = TA.bbands(closes, 20);
    if (bb && price) {
      // Below lower band = oversold → bullish; above upper → bearish
      const bbPos = (price - bb.lower) / (bb.upper - bb.lower || 1);
      volatility  = (bbPos - 0.5) * 200; // –100..+100
    }
    // Temper with ATR magnitude
    const atrPct = price ? atr/price*100 : 0;
    if (atrPct > 0.5) volatility *= 0.7; // high vol → less certain
  } else {
    volatility = simScore(4, now);
  }

  // 5. Candle Pattern
  let candle = 0;
  if (candles.length >= 3) {
    candle = TA.candlePattern(candles);
  } else {
    candle = simScore(5, now);
  }

  // 6. Frequency (volume analysis)
  let freq = 0;
  if (hasData) {
    const volProfile = TA.volumeProfile(candles);
    const recent = candles.slice(-5);
    const upVol   = recent.filter(c => c.c >= c.o).reduce((s,c) => s+c.v,0);
    const dnVol   = recent.filter(c => c.c < c.o).reduce((s,c) => s+c.v,0);
    const total   = upVol + dnVol;
    freq = total > 0 ? ((upVol - dnVol) / total * 80) : 0;
    freq += volProfile * 0.2;
  } else {
    freq = simScore(6, now);
  }

  // 7. Bayesian (posterior probability based on history)
  let bayes = 0;
  const pUp = Markov.pUp();
  bayes = (pUp - 0.5) * 200; // –100..+100
  if (!hasData) bayes = bayes * 0.5 + simScore(7, now) * 0.5;

  // 8. Markov chain
  let markov = (pUp - 0.5) * 180;

  // 9. Streak (contrarian: long streak → reversal likely)
  let streak = 0;
  const sLen = Markov.streakLen();
  const sDir = Markov.seq.length ? Markov.seq[Markov.seq.length-1] : null;
  if (sLen > 0) {
    // After 3+ same direction: expect reversal
    const reversion = Math.min(sLen * 12, 70);
    streak = sDir === 'UP' ? -reversion : reversion;
  } else {
    streak = simScore(9, now);
  }

  // 10. Reversal (RSI overbought/oversold)
  let reversal = 0;
  if (hasData && closes.length >= 14) {
    const rsiVal = TA.rsi(closes);
    if (rsiVal > 70)      reversal = -(rsiVal - 70) * 3;   // overbought → down
    else if (rsiVal < 30) reversal =  (30 - rsiVal) * 3;   // oversold → up
    else                  reversal = (50 - rsiVal) * 0.5;
  } else {
    reversal = simScore(10, now);
  }

  // 11. RSI direct signal
  let rsi = 0;
  if (hasData && closes.length >= 14) {
    const rsiVal = TA.rsi(closes);
    rsi = (50 - rsiVal) * 1.5; // RSI<50 → bullish bias
  } else {
    rsi = simScore(11, now);
  }

  // 12. Adaptive weight (Stochastic)
  let adaptive = 0;
  if (hasData && candles.length >= 14) {
    const stoch = TA.stoch(candles);
    if (stoch > 80)      adaptive = -(stoch - 80) * 2;
    else if (stoch < 20) adaptive =  (20 - stoch) * 2;
    else                 adaptive =  (50 - stoch);
  } else {
    adaptive = simScore(12, now);
  }

  // ── Weighted combination ──
  const weights = {
    trend:1.6, momentum:1.3, ma:1.4, volatility:0.8,
    candle:1.2, freq:1.0, bayes:1.5, markov:1.3,
    streak:1.1, reversal:0.9, rsi:1.2, adaptive:1.0,
  };
  const scores = { trend, momentum, ma, volatility, candle, freq,
                   bayes, markov, streak, reversal, rsi, adaptive };

  let wSum = 0, wTot = 0;
  for (const [k, w] of Object.entries(weights)) {
    wSum += (scores[k] || 0) * w;
    wTot += w;
  }
  const composite = wSum / wTot;                     // –100..+100
  const dir        = composite >= 0 ? 'UP' : 'DOWN';
  const confidence = Math.round(50 + Math.abs(composite) / 100 * 44);
  const strength   = Math.min(99, Math.round(Math.abs(composite) * 0.9 + 8));

  // Trend percentage for bar
  const trendPct = Math.round((trend + 100) / 2);

  // Volatility percentage (always positive for bar)
  const volatilityPct = Math.round((Math.abs(volatility) + 50) / 150 * 100);

  // Risk
  const atrNow = hasData ? TA.atr(candles) : 0;
  const price   = CandleStore.lastPrice || (closes[closes.length-1] || 1);
  const atrPct  = price ? atrNow / price * 100 : 0;
  const risk    = atrPct > 0.6 ? 5 : atrPct > 0.4 ? 4 :
                  atrPct > 0.2 ? 3 : confidence < 60 ? 3 : 2;

  return { dir, confidence, strength, trendPct, volatilityPct, risk, scores,
           live: APP.wsConnected && hasData, candleCount: n };
}

/* Time-seeded simulation fallback for a module */
function simScore(moduleId, now) {
  const s = Math.sin(now.getTime() / 1000 + moduleId * 73.19) * 43758.5453;
  return ((s - Math.floor(s)) - 0.5) * 180;
}

/* ════════════════════════════════════════════
   SECTION 11 — CANDLESTICK CHART RENDERER
════════════════════════════════════════════ */
const Chart = {
  tf: 1,          // current timeframe in minutes
  showMA: true, showBB: false, showVol: true,
  panOffset: 0,   // pan offset in candles
  hovIdx: -1,     // hovered candle index

  init() {
    this.resize();
    window.addEventListener('resize', () => this.resize(), {passive:true});
    this.bindInteraction();
  },

  resize() {
    const cc = DOM.candleCanvas, vc = DOM.volumeCanvas;
    const w  = cc.parentElement.clientWidth - 12;
    const ch = Math.max(140, Math.min(220, window.innerHeight * 0.22));
    const vh = Math.max(28, Math.round(ch * 0.22));
    cc.width  = w * devicePixelRatio; cc.height = ch * devicePixelRatio;
    cc.style.width  = w + 'px'; cc.style.height = ch + 'px';
    vc.width  = w * devicePixelRatio; vc.height = vh * devicePixelRatio;
    vc.style.width  = w + 'px'; vc.style.height = vh + 'px';
    this.draw();
  },

  draw() {
    const allCandles = CandleStore.getAll();
    if (!allCandles.length) { this.drawEmpty(); return; }

    // Aggregate to timeframe (if tf > 1)
    const candles = this.tf === 1 ? allCandles : this.aggregateTF(allCandles, this.tf);

    const cc  = DOM.candleCanvas;
    const ctx = cc.getContext('2d');
    const dpr = devicePixelRatio;
    const W   = cc.width, H = cc.height;
    ctx.clearRect(0, 0, W, H);

    const maxVisible = Math.min(candles.length, Math.floor(W / dpr / 7));
    const startIdx   = Math.max(0, candles.length - maxVisible - this.panOffset);
    const endIdx     = Math.min(candles.length, startIdx + maxVisible);
    const visible    = candles.slice(startIdx, endIdx);
    if (!visible.length) return;

    const hi   = Math.max(...visible.map(c => c.h));
    const lo   = Math.min(...visible.map(c => c.l));
    const pad  = (hi - lo) * 0.08 || hi * 0.001;
    const yHi  = hi + pad, yLo = lo - pad;
    const yRange = yHi - yLo;

    const toY    = v => H - ((v - yLo) / yRange * H * 0.92 + H * 0.04);
    const cW     = Math.max(3, Math.floor(W / visible.length * 0.78));
    const gap    = Math.floor(W / visible.length);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = dpr;
    for (let i=0; i<=4; i++) {
      const y = H * 0.04 + H * 0.92 * (i/4);
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
      const price = yHi - yRange * (i/4);
      ctx.fillStyle = 'rgba(140,170,210,0.3)';
      ctx.font = `${9*dpr}px monospace`;
      ctx.fillText(price.toFixed(5), 4, y - 3*dpr);
    }

    // Bollinger Bands overlay
    if (this.showBB) {
      const closes = visible.map(c => c.c);
      const bbData = [];
      for (let i=0; i<visible.length; i++) {
        const slice = closes.slice(0, i+1);
        if (slice.length >= 10) {
          bbData.push(TA.bbands(slice, Math.min(20, slice.length)));
        } else bbData.push(null);
      }
      this.drawBBand(ctx, bbData, visible, gap, toY, W, H, dpr);
    }

    // MA overlay
    if (this.showMA && visible.length >= 5) {
      const closes  = visible.map(c => c.c);
      const maPer   = Math.min(CFG.maPeriod, visible.length);
      const maVals  = [];
      for (let i=0; i<visible.length; i++) {
        const s = closes.slice(0, i+1);
        maVals.push(s.length >= maPer ? TA.sma(s, maPer) : null);
      }
      ctx.beginPath();
      let first = true;
      for (let i=0; i<maVals.length; i++) {
        if (!maVals[i]) continue;
        const x = i * gap + gap/2;
        if (first) { ctx.moveTo(x, toY(maVals[i])); first = false; }
        else        ctx.lineTo(x, toY(maVals[i]));
      }
      ctx.strokeStyle = 'rgba(176,106,255,0.6)';
      ctx.lineWidth   = 1.5 * dpr;
      ctx.stroke();
    }

    // Candles
    visible.forEach((c, i) => {
      const x   = i * gap + gap/2;
      const isUp = c.c >= c.o;
      const col  = isUp ? 'rgba(0,229,160,' : 'rgba(255,77,109,';

      // Wick
      ctx.strokeStyle = col + '0.75)';
      ctx.lineWidth   = dpr;
      ctx.beginPath();
      ctx.moveTo(x, toY(c.h));
      ctx.lineTo(x, toY(c.l));
      ctx.stroke();

      // Body
      const yO = toY(c.o), yC = toY(c.c);
      const bodyH = Math.max(2*dpr, Math.abs(yC - yO));
      const bodyY = Math.min(yO, yC);

      if (CFG.candleStyle === 'hollow') {
        ctx.strokeStyle = col + '0.9)';
        ctx.lineWidth   = dpr;
        ctx.strokeRect(x - cW/2, bodyY, cW, bodyH);
      } else if (CFG.candleStyle === 'bar') {
        ctx.strokeStyle = col + '0.9)';
        ctx.lineWidth   = 2*dpr;
        ctx.beginPath();
        ctx.moveTo(x - cW/2, toY(c.o)); ctx.lineTo(x, toY(c.o));
        ctx.moveTo(x, toY(c.h));        ctx.lineTo(x, toY(c.l));
        ctx.moveTo(x, toY(c.c));        ctx.lineTo(x + cW/2, toY(c.c));
        ctx.stroke();
      } else {
        // Classic filled
        ctx.fillStyle = col + (i === visible.length-1 ? '0.55)' : '0.85)');
        ctx.fillRect(x - cW/2, bodyY, cW, bodyH);
        ctx.strokeStyle = col + '0.95)';
        ctx.lineWidth   = dpr * 0.7;
        ctx.strokeRect(x - cW/2, bodyY, cW, bodyH);
      }

      // Hover highlight
      if (i === this.hovIdx) {
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(x - gap/2, 0, gap, H);
        // Show tooltip
        const info = `O:${c.o.toFixed(5)} H:${c.h.toFixed(5)} L:${c.l.toFixed(5)} C:${c.c.toFixed(5)}`;
        DOM.chInfo.textContent = info;
        DOM.chartCrosshair.classList.remove('hidden');
        DOM.chartCrosshair.style.left = Math.min(x / dpr + 5, W/dpr - 180) + 'px';
        DOM.chartCrosshair.style.top  = '10px';
      }
    });

    // Live candle glow
    if (CandleStore.liveCandle) {
      const x = (visible.length - 1) * gap + gap/2;
      ctx.shadowColor = 'rgba(0,229,160,0.5)';
      ctx.shadowBlur  = 8 * dpr;
      const lc = visible[visible.length-1];
      if (lc) {
        const isUp = lc.c >= lc.o;
        ctx.strokeStyle = isUp ? 'rgba(0,229,160,0.9)' : 'rgba(255,77,109,0.9)';
        ctx.lineWidth   = 2 * dpr;
        ctx.strokeRect(x - cW/2, Math.min(toY(lc.o), toY(lc.c)),
                        cW, Math.max(2, Math.abs(toY(lc.c) - toY(lc.o))));
        ctx.shadowBlur = 0;
      }
    }

    if (this.hovIdx < 0) DOM.chartCrosshair.classList.add('hidden');

    // Volume chart
    if (this.showVol) this.drawVolume(visible, gap, dpr);
  },

  drawVolume(visible, gap, dpr) {
    const vc  = DOM.volumeCanvas;
    const ctx = vc.getContext('2d');
    const W   = vc.width, H = vc.height;
    ctx.clearRect(0, 0, W, H);

    const maxV = Math.max(...visible.map(c => c.v || 0), 1);

    visible.forEach((c, i) => {
      const x  = i * gap + gap/2;
      const bH = Math.max(1, (c.v || 0) / maxV * (H - 2*dpr));
      const isUp = c.c >= c.o;
      ctx.fillStyle = isUp ? 'rgba(0,229,160,0.4)' : 'rgba(255,77,109,0.4)';
      ctx.fillRect(x - gap*0.35, H - bH, gap * 0.7, bH);
    });
  },

  drawBBand(ctx, bbData, visible, gap, toY, W, H, dpr) {
    ['upper','lower'].forEach(band => {
      ctx.beginPath(); let first=true;
      bbData.forEach((bb, i) => {
        if (!bb) return;
        const x = i*gap + gap/2;
        if (first) { ctx.moveTo(x, toY(bb[band])); first=false; }
        else ctx.lineTo(x, toY(bb[band]));
      });
      ctx.strokeStyle = 'rgba(255,184,48,0.3)';
      ctx.lineWidth   = dpr;
      ctx.stroke();
    });
  },

  drawEmpty() {
    const cc  = DOM.candleCanvas;
    const ctx = cc.getContext('2d');
    const dpr = devicePixelRatio;
    const W   = cc.width, H = cc.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(140,170,210,0.2)';
    ctx.font      = `${11*dpr}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Waiting for live candle data…', W/2, H/2);
    ctx.textAlign = 'start';
  },

  aggregateTF(candles, tf) {
    const grouped = [];
    let bucket = null;
    for (const c of candles) {
      const bStart = Math.floor(c.t / (tf * 60000)) * (tf * 60000);
      if (!bucket || bucket.t !== bStart) {
        if (bucket) grouped.push(bucket);
        bucket = { t: bStart, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v };
      } else {
        bucket.h = Math.max(bucket.h, c.h);
        bucket.l = Math.min(bucket.l, c.l);
        bucket.c = c.c;
        bucket.v += c.v;
      }
    }
    if (bucket) grouped.push(bucket);
    return grouped;
  },

  bindInteraction() {
    const cc = DOM.candleCanvas;

    cc.addEventListener('pointermove', e => {
      const r   = cc.getBoundingClientRect();
      const x   = (e.clientX - r.left) * devicePixelRatio;
      const W   = cc.width;
      const candles = CandleStore.getAll();
      const vis = Math.min(candles.length, Math.floor(W / devicePixelRatio / 7));
      const gap = W / Math.max(vis, 1);
      this.hovIdx = Math.floor(x / gap);
      this.draw();
    }, {passive:true});

    cc.addEventListener('pointerleave', () => {
      this.hovIdx = -1;
      DOM.chartCrosshair.classList.add('hidden');
      this.draw();
    }, {passive:true});

    // Pinch zoom / pan (touch)
    let lastTx = 0;
    cc.addEventListener('touchstart', e => { lastTx = e.touches[0].clientX; }, {passive:true});
    cc.addEventListener('touchmove', e => {
      if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - lastTx;
        lastTx = e.touches[0].clientX;
        this.panOffset = Math.max(0, Math.min(MAX_CANDLES - 10,
          this.panOffset + Math.round(dx / 8)));
        this.draw();
      }
    }, {passive:true});

    // Timeframe buttons
    DOM.ctbBtns.forEach(btn => {
      const tf = parseInt(btn.dataset.tf || '0');
      if (!tf) return;
      btn.addEventListener('click', () => {
        this.tf = tf;
        this.panOffset = 0;
        DOM.ctbBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.draw();
      });
    });

    // Indicator toggles
    DOM.btnMA.addEventListener('click', () => {
      this.showMA = !this.showMA; CFG.showMA = this.showMA;
      DOM.btnMA.classList.toggle('active', this.showMA);
      this.draw();
    });
    DOM.btnBB.addEventListener('click', () => {
      this.showBB = !this.showBB; CFG.showBB = this.showBB;
      DOM.btnBB.classList.toggle('active', this.showBB);
      this.draw();
    });
    DOM.btnVol.addEventListener('click', () => {
      this.showVol = !this.showVol; CFG.showVol = this.showVol;
      DOM.btnVol.classList.toggle('active', this.showVol);
      DOM.volumeCanvas.style.display = this.showVol ? '' : 'none';
      this.draw();
    });

    DOM.btnMA.classList.toggle('active', this.showMA);
    DOM.btnBB.classList.toggle('active', this.showBB);
    DOM.btnVol.classList.toggle('active', this.showVol);
  },
};

/* ════════════════════════════════════════════
   SECTION 12 — SIGNAL TRIGGER & CINEMA
════════════════════════════════════════════ */
async function triggerSignal() {
  if (APP.analyzing) return;
  APP.analyzing = true;

  const result = runAnalysis();
  const aid    = `AID-${APP.aidCounter++}-${getBDTime().getMinutes()}${getBDTime().getSeconds()}`;

  setAnalysisStatus('active');

  if (CFG.animations !== 'off') {
    await runCinema(result);
  }

  applySignalUI(result, aid);

  Markov.push(result.dir);

  if (CFG.voice && CFG.autoSpeak) speakSignal(result.dir, result.confidence);
  if (CFG.vibration && navigator.vibrate) navigator.vibrate([90,40,90]);

  addHistory(result, aid);
  APP.lastSignal = result;
  APP.analyzing  = false;
}

function setAnalysisStatus(state) {
  const s = DOM.astatus;
  s.className = `as-${state}`;
  s.textContent = state === 'active' ? '⬤ SCANNING' :
                  state === 'up'     ? '⬤ BULLISH'  :
                  state === 'dn'     ? '⬤ BEARISH'  : '⬤ IDLE';
}

function applySignalUI(r, aid) {
  const { dir, confidence, strength, trendPct, volatilityPct, risk, scores, live } = r;

  // Direction card
  DOM.dirCard.className  = `dir-${dir.toLowerCase()}`;
  DOM.dirArrow.textContent = dir === 'UP' ? '↑' : '↓';
  DOM.dirLabel.textContent = dir;
  DOM.dirConf.textContent  = `${confidence}%`;

  // Metric bars
  setBar(DOM.mbConf,  DOM.mvConf,  confidence,    '%');
  setBar(DOM.mbStr,   DOM.mvStr,   strength,       '%');
  setBar(DOM.mbTrend, DOM.mvTrend, trendPct,       '%');
  setBar(DOM.mbVol,   DOM.mvVol,   volatilityPct,  '%');

  // Risk dots
  const dots = DOM.riskDots.querySelectorAll('.rdot');
  const rc   = risk <= 2 ? 'rl' : risk <= 3 ? 'rm' : 'rh';
  dots.forEach((d,i) => { d.className = 'rdot'; if (i < risk) d.classList.add(rc); });

  // Meta
  DOM.aid.textContent = aid;
  setAnalysisStatus(dir === 'UP' ? 'up' : 'dn');

  // Engine scores
  const mods = Object.keys(DOM.escores);
  mods.forEach((key, idx) => {
    const raw  = scores[key] || 0;
    const pct  = Math.round(Math.abs(raw));
    const isUp = raw >= 0;
    const scoreEl = DOM.escores[key];
    const barEl   = DOM.ebars[key];
    const card    = DOM.ecards[idx];
    if (!scoreEl || !card) return;

    scoreEl.textContent = (isUp ? '+' : '−') + pct;
    if (barEl) barEl.style.width = pct + '%';
    card.classList.remove('res-up','res-dn','scanning');
    card.classList.add(isUp ? 'res-up' : 'res-dn');

    // Stagger animation
    setTimeout(() => {
      card.style.transform = 'scale(1.05)';
      setTimeout(() => card.style.transform = '', 160);
    }, idx * 42);
  });
}

function setBar(barEl, valEl, pct, suffix='') {
  if (barEl) barEl.style.width = Math.min(100, pct) + '%';
  if (valEl) valEl.textContent = Math.round(pct) + suffix;
}

/* ════════════════════════════════════════════
   SECTION 13 — HISTORY
════════════════════════════════════════════ */
function addHistory(result, aid) {
  const { dir, confidence, live } = result;
  const entry = { dir, confidence, live, aid,
    time: formatTime(getBDTime()) };
  APP.signalHistory.unshift(entry);
  if (APP.signalHistory.length > 30) APP.signalHistory.pop();
  renderHistory();
}

function renderHistory() {
  const up    = APP.signalHistory.filter(h => h.dir === 'UP').length;
  const dn    = APP.signalHistory.filter(h => h.dir === 'DOWN').length;
  const total = APP.signalHistory.length;
  DOM.hsTotal.textContent = total;
  DOM.hsUp.textContent    = up;
  DOM.hsDn.textContent    = dn;
  DOM.hsSrc.textContent   = APP.wsConnected ? 'LIVE' : 'SIM';

  DOM.historyList.innerHTML = '';
  APP.signalHistory.forEach(h => {
    const div = document.createElement('div');
    div.className = `hi ${h.dir === 'UP' ? 'hi-up' : 'hi-dn'}`;
    div.innerHTML = `
      <span class="hi-dir">${h.dir === 'UP' ? '↑' : '↓'}</span>
      <span class="hi-time">${h.time}</span>
      <span class="hi-conf">${h.confidence}%</span>
      <span class="hi-src ${h.live ? 'live' : ''}">${h.live ? 'LIVE' : 'SIM'}</span>`;
    DOM.historyList.appendChild(div);
  });
}

/* ════════════════════════════════════════════
   SECTION 14 — CINEMA ANIMATION
════════════════════════════════════════════ */
let cinRAF = null, cinCtx = null, cinParts = [];

async function runCinema(result) {
  DOM.cinemaLayer.classList.remove('hidden');
  DOM.cinResult.classList.add('hidden');
  DOM.cinProgBar.style.width = '0%';
  DOM.cinProgNum.textContent = '0%';
  DOM.cinModules.forEach(m => m.classList.remove('active'));
  DOM.cinAsset.textContent = CFG.asset.replace('#OTC_','').replace('OTC_','');

  initCinemaCanvas();

  const phases = [
    { label: 'LOADING CANDLE DATA',      pct: 18,  ms: 260 },
    { label: 'COMPUTING INDICATORS',     pct: 36,  ms: 300 },
    { label: 'RUNNING BAYESIAN FILTER',  pct: 54,  ms: 270 },
    { label: 'MARKOV CHAIN ANALYSIS',    pct: 70,  ms: 240 },
    { label: 'RSI & PATTERN SCORING',    pct: 85,  ms: 220 },
    { label: 'ADAPTIVE WEIGHT FUSION',   pct: 100, ms: 200 },
  ];

  const mods = Array.from(DOM.cinModules);
  for (let i=0; i<phases.length; i++) {
    DOM.cinStatus.textContent = phases[i].label;
    cinAnimateProgress(phases[i].pct);
    if (mods[i]) mods[i].classList.add('active');
    await sleep(phases[i].ms);
  }

  // Reveal
  DOM.cinResult.classList.remove('hidden');
  const isUp = result.dir === 'UP';
  DOM.cinDir.textContent  = isUp ? '↑' : '↓';
  DOM.cinDir.style.color  = isUp ? 'var(--emerald)' : 'var(--danger)';
  DOM.cinConf.textContent = `${result.confidence}% Confidence`;
  DOM.cinConf.style.color = isUp ? 'var(--emerald)' : 'var(--danger)';
  DOM.cinDataNote.textContent = result.live
    ? `✓ ${result.candleCount} live candles analyzed`
    : '⚠ Simulation mode (no live data)';
  DOM.cinStatus.textContent = `SIGNAL: ${result.dir}`;

  await sleep(1300);

  // Fade out
  DOM.cinemaLayer.style.transition = 'opacity 0.35s';
  DOM.cinemaLayer.style.opacity    = '0';
  await sleep(370);
  DOM.cinemaLayer.classList.add('hidden');
  DOM.cinemaLayer.style.opacity    = '';
  DOM.cinemaLayer.style.transition = '';
  stopCinemaCanvas();
}

function initCinemaCanvas() {
  const cv = DOM.cinemaCanvas;
  cv.width  = window.innerWidth  * devicePixelRatio;
  cv.height = window.innerHeight * devicePixelRatio;
  cv.style.width  = window.innerWidth  + 'px';
  cv.style.height = window.innerHeight + 'px';
  cinCtx = cv.getContext('2d');
  cinParts = [];
  for (let i=0; i<70; i++) {
    cinParts.push({
      x: Math.random() * cv.width,  y: Math.random() * cv.height,
      vx:(Math.random()-.5)*1.4,    vy:(Math.random()-.5)*1.4,
      r: Math.random()*1.8+.4,      a: Math.random(),
      col: Math.random()>.5 ? '#00e5a0' : '#00d4ff',
    });
  }
  let radarA = 0, lastT = 0;
  const COLS = Math.floor(cv.width / (18 * devicePixelRatio));
  const matCols = Array.from({length: COLS}, (_, c) => ({
    x: c * 18 * devicePixelRatio,
    y: Math.random() * cv.height,
    spd: (8 + Math.random()*14) * devicePixelRatio,
  }));

  function frame(ts) {
    cinRAF = requestAnimationFrame(frame);
    const dt = Math.min(ts - lastT, 50); lastT = ts;
    const ctx = cinCtx, W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = 'rgba(0,229,160,0.04)';
    ctx.lineWidth = devicePixelRatio;
    const gs = 36 * devicePixelRatio;
    for (let x=0; x<W; x+=gs) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for (let y=0; y<H; y+=gs) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

    // Matrix rain
    ctx.font = `${11*devicePixelRatio}px monospace`;
    matCols.forEach(col => {
      const ch = String.fromCharCode(0x30A0 + Math.floor(Math.random()*96));
      ctx.fillStyle = 'rgba(0,229,160,0.15)';
      ctx.fillText(ch, col.x, col.y);
      col.y += col.spd * dt / 1000 * 60;
      if (col.y > H) col.y = -20 * devicePixelRatio;
    });

    // Particles + neural net
    cinParts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x<0||p.x>W) p.vx*=-1; if (p.y<0||p.y>H) p.vy*=-1;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r*devicePixelRatio, 0, Math.PI*2);
      ctx.fillStyle = p.col.replace(')',`,${p.a})`).replace('rgb','rgba');
      ctx.fill();
    });
    const pts = cinParts.slice(0, 24);
    for (let i=0; i<pts.length; i++) {
      for (let j=i+1; j<pts.length; j++) {
        const dx=pts[i].x-pts[j].x, dy=pts[i].y-pts[j].y;
        const d=Math.sqrt(dx*dx+dy*dy);
        const maxD = 120 * devicePixelRatio;
        if (d < maxD) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(0,212,255,${0.1*(1-d/maxD)})`;
          ctx.lineWidth = devicePixelRatio*0.6;
          ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y);
          ctx.stroke();
        }
      }
    }

    // Radar
    const cx=W/2, cy=H/2, rad=Math.min(W,H)*0.38;
    radarA += Math.PI * dt / 1000;
    ctx.save(); ctx.translate(cx,cy);
    ctx.beginPath(); ctx.arc(0,0,rad,0,Math.PI*2);
    ctx.strokeStyle='rgba(0,229,160,0.1)'; ctx.lineWidth=devicePixelRatio; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,0);
    ctx.arc(0,0,rad,radarA-1.0,radarA,false);
    ctx.fillStyle='rgba(0,229,160,0.07)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0,0);
    ctx.lineTo(Math.cos(radarA)*rad, Math.sin(radarA)*rad);
    ctx.strokeStyle='rgba(0,229,160,0.4)'; ctx.lineWidth=2*devicePixelRatio; ctx.stroke();
    ctx.restore();

    // Flowing lines
    const t = ts/1000;
    for (let l=0; l<4; l++) {
      const y = H*(0.2+l*0.2) + Math.sin(t+l)*20*devicePixelRatio;
      ctx.beginPath(); ctx.moveTo(0,y);
      for (let x=0; x<W; x+=8*devicePixelRatio) {
        ctx.lineTo(x, y + Math.sin(x/(40*devicePixelRatio)+t*2+l)*6*devicePixelRatio);
      }
      ctx.strokeStyle='rgba(0,212,255,0.06)';
      ctx.lineWidth=devicePixelRatio; ctx.stroke();
    }
  }
  requestAnimationFrame(frame);
}

function stopCinemaCanvas() {
  if (cinRAF) { cancelAnimationFrame(cinRAF); cinRAF = null; }
  cinParts = [];
  if (cinCtx) cinCtx.clearRect(0,0, DOM.cinemaCanvas.width, DOM.cinemaCanvas.height);
}

function cinAnimateProgress(target) {
  const bar = DOM.cinProgBar, num = DOM.cinProgNum;
  const start = parseFloat(bar.style.width || '0');
  const diff  = target - start;
  let el = 0, last = null;
  function tick(ts) {
    if (!last) last = ts;
    el += ts - last; last = ts;
    const p = Math.min(1, el / 280);
    const v = start + diff * (1-(1-p)**3);
    bar.style.width = v + '%'; num.textContent = Math.round(v) + '%';
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ════════════════════════════════════════════
   SECTION 15 — VOICE
════════════════════════════════════════════ */
let synth = window.speechSynthesis, voice = null;

function initVoice() {
  if (!synth) return;
  const pick = () => {
    const voices = synth.getVoices();
    voice = voices.find(v => v.name.includes('Samantha')) ||
            voices.find(v => v.name.includes('Google UK English Female')) ||
            voices.find(v => v.name.includes('Microsoft Zira')) ||
            voices.find(v => v.lang === 'en-US') ||
            voices.find(v => v.lang.startsWith('en')) || voices[0] || null;
  };
  pick(); synth.onvoiceschanged = pick;
}

function speakSignal(dir, conf) {
  if (!CFG.voice || !synth) return;
  try {
    synth.cancel();
    const phrases = dir === 'UP'
      ? [`Analysis complete. Signal: Up. Confidence ${conf} percent.`,
         `Quantum analysis done. Next candle direction: Up.`,
         `Signal confirmed. Bullish. ${conf} percent confidence.`]
      : [`Analysis complete. Signal: Down. Confidence ${conf} percent.`,
         `Quantum analysis done. Next candle direction: Down.`,
         `Signal confirmed. Bearish. ${conf} percent confidence.`];
    const utt  = new SpeechSynthesisUtterance(phrases[Math.floor(Math.random()*3)]);
    if (voice) utt.voice = voice;
    utt.rate = 0.95; utt.pitch = 1.0; utt.volume = CFG.volume / 100;
    synth.speak(utt);
  } catch(e) {}
}

/* ════════════════════════════════════════════
   SECTION 16 — BANGLADESH TIME & SIGNAL TIMER
════════════════════════════════════════════ */
let lastSignalSecond = -1;

function getBDTime() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }));
}
function formatTime(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function pad(n) { return String(n).padStart(2,'0'); }

function timeTick() {
  const now = getBDTime();
  const sec = now.getSeconds();
  const rem = 60 - sec;

  DOM.bdTime.textContent = formatTime(now);
  DOM.cdNum.textContent  = rem === 60 ? '60' : rem;

  // Ring arc
  const offset = RING_CIRC * (sec / 60);
  DOM.cdArc.style.strokeDashoffset = RING_CIRC - offset;
  const urgent = rem <= 5;
  DOM.cdArc.classList.toggle('urgent', urgent);
  DOM.cdNum.style.color = urgent ? 'var(--danger)' : 'var(--cyan)';

  // Fire at :55
  if (sec === SIGNAL_AT_SECOND && sec !== lastSignalSecond) {
    lastSignalSecond = sec;
    triggerSignal();
  }
  if (sec < SIGNAL_AT_SECOND) lastSignalSecond = -1;

  // Redraw chart on chart tab every second
  if (APP.activeTab === 'chart') Chart.draw();
}

/* ════════════════════════════════════════════
   SECTION 17 — FAB DRAG
════════════════════════════════════════════ */
(function initFAB() {
  const fab = DOM.fab;
  let dragging=false, moved=false, sx, sy, longTimer=null;

  try {
    const s = JSON.parse(localStorage.getItem(FAB_KEY) || 'null');
    if (s) { fab.style.left=s.x+'px'; fab.style.top=s.y+'px';
             fab.style.right='auto'; fab.style.bottom='auto'; }
  } catch(e) {}

  function snapEdge() {
    const r = fab.getBoundingClientRect();
    const W = window.innerWidth;
    const nx = (r.left + r.width/2) < W/2 ? 10 : W - r.width - 10;
    fab.classList.add('snapping');
    fab.style.left=nx+'px'; fab.style.right='auto';
    setTimeout(() => fab.classList.remove('snapping'), 400);
    try { localStorage.setItem(FAB_KEY, JSON.stringify({x:nx, y:r.top})); } catch(e) {}
  }

  fab.addEventListener('pointerdown', e => {
    e.preventDefault(); fab.setPointerCapture(e.pointerId);
    const r = fab.getBoundingClientRect();
    sx = e.clientX - r.left; sy = e.clientY - r.top;
    moved = false; dragging = false;
    longTimer = setTimeout(() => { if (!moved) openSettings(); }, 600);
  });
  fab.addEventListener('pointermove', e => {
    if (!fab.hasPointerCapture(e.pointerId)) return;
    const dx = Math.abs(e.clientX - (fab.getBoundingClientRect().left + sx));
    const dy = Math.abs(e.clientY - (fab.getBoundingClientRect().top + sy));
    if (dx>5||dy>5) { moved=true; clearTimeout(longTimer); }
    if (!moved) return;
    dragging = true;
    const W=window.innerWidth, H=window.innerHeight, sz=44;
    let nx=e.clientX-sx, ny=e.clientY-sy;
    nx=Math.max(0,Math.min(W-sz,nx)); ny=Math.max(0,Math.min(H-sz,ny));
    fab.style.left=nx+'px'; fab.style.top=ny+'px';
    fab.style.right='auto'; fab.style.bottom='auto';
  });
  fab.addEventListener('pointerup', () => {
    clearTimeout(longTimer);
    if (dragging) { snapEdge(); dragging=false; }
    else if (!moved) toggleOverlay();
    moved=false;
  });
})();

/* ════════════════════════════════════════════
   SECTION 18 — OVERLAY DRAG & RESIZE
════════════════════════════════════════════ */
(function initOverlayDrag() {
  const ov = DOM.overlay, tb = DOM.titlebar;
  let drag=false, sx, sy;

  try {
    const s = JSON.parse(localStorage.getItem(POS_KEY)||'null');
    if (s) { ov.style.left=s.x+'px'; ov.style.top=s.y+'px';
             ov.style.transform='none';
             if(s.w) ov.style.width=s.w+'px';
             if(s.h) ov.style.height=s.h+'px'; }
  } catch(e) {}

  function savePos() {
    try {
      const r = ov.getBoundingClientRect();
      localStorage.setItem(POS_KEY, JSON.stringify({x:r.left,y:r.top,w:r.width,h:r.height}));
    } catch(e) {}
  }

  tb.addEventListener('pointerdown', e => {
    if (APP.overlayMax) return; e.preventDefault();
    tb.setPointerCapture(e.pointerId);
    const r = ov.getBoundingClientRect();
    sx=e.clientX-r.left; sy=e.clientY-r.top;
    drag=true; ov.style.transform='none';
  });
  tb.addEventListener('pointermove', e => {
    if (!drag) return;
    const W=window.innerWidth, H=window.innerHeight;
    const r=ov.getBoundingClientRect();
    let nx=e.clientX-sx, ny=e.clientY-sy;
    nx=Math.max(0,Math.min(W-r.width,nx));
    ny=Math.max(0,Math.min(H-r.height,ny));
    ov.style.left=nx+'px'; ov.style.top=ny+'px';
  });
  tb.addEventListener('pointerup', () => { drag=false; savePos(); });

  // Corner resize
  const rh = DOM.resizeHandle;
  let res=false, rsx, rsy, rw, rh2;
  rh.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    rh.setPointerCapture(e.pointerId);
    const r=ov.getBoundingClientRect();
    rsx=e.clientX; rsy=e.clientY; rw=r.width; rh2=r.height; res=true;
  });
  rh.addEventListener('pointermove', e => {
    if (!res) return;
    const nw=Math.max(265,Math.min(window.innerWidth*.95, rw+e.clientX-rsx));
    const nh=Math.max(220,Math.min(window.innerHeight*.88, rh2+e.clientY-rsy));
    ov.style.width=nw+'px'; ov.style.height=nh+'px';
    if (APP.activeTab==='chart') Chart.resize();
  });
  rh.addEventListener('pointerup', () => { res=false; savePos(); });

  // Pinch resize
  let pDist=null, pW=null, pH=null;
  ov.addEventListener('touchstart', e => {
    if (e.touches.length===2) {
      const dx=e.touches[0].clientX-e.touches[1].clientX;
      const dy=e.touches[0].clientY-e.touches[1].clientY;
      pDist=Math.sqrt(dx*dx+dy*dy);
      const r=ov.getBoundingClientRect(); pW=r.width; pH=r.height;
    }
  },{passive:true});
  ov.addEventListener('touchmove', e => {
    if (e.touches.length===2 && pDist) {
      e.preventDefault();
      const dx=e.touches[0].clientX-e.touches[1].clientX;
      const dy=e.touches[0].clientY-e.touches[1].clientY;
      const sc=Math.sqrt(dx*dx+dy*dy)/pDist;
      ov.style.width =Math.max(265,Math.min(window.innerWidth*.95,pW*sc))+'px';
      ov.style.height=Math.max(220,Math.min(window.innerHeight*.88,pH*sc))+'px';
      if (APP.activeTab==='chart') Chart.resize();
    }
  },{passive:false});
  ov.addEventListener('touchend', e => {
    if(e.touches.length<2){pDist=null; savePos();}
  },{passive:true});

  window.addEventListener('resize', () => {
    if (APP.overlayMax) return;
    const r=ov.getBoundingClientRect(), W=window.innerWidth, H=window.innerHeight;
    if(r.right>W)  ov.style.left=Math.max(0,W-r.width)+'px';
    if(r.bottom>H) ov.style.top =Math.max(0,H-r.height)+'px';
    if(APP.activeTab==='chart') Chart.resize();
  },{passive:true});
})();

/* ════════════════════════════════════════════
   SECTION 19 — OVERLAY OPEN/CLOSE/MIN/MAX
════════════════════════════════════════════ */
function toggleOverlay() { APP.overlayOpen ? closeOverlay() : openOverlay(); }

function openOverlay() {
  if (APP.overlayOpen) return;
  APP.overlayOpen = true;
  DOM.overlay.classList.remove('hidden','ov-exit');
  DOM.overlay.classList.add('ov-enter');
  DOM.fab.classList.add('fab-on');
  if (!APP.lastSignal && !APP.analyzing) setTimeout(triggerSignal, 500);
  if (APP.activeTab === 'chart') setTimeout(() => Chart.resize(), 420);
}

function closeOverlay() {
  DOM.overlay.classList.remove('ov-enter');
  DOM.overlay.classList.add('ov-exit');
  DOM.fab.classList.remove('fab-on');
  setTimeout(() => {
    APP.overlayOpen = APP.overlayMin = APP.overlayMax = false;
    DOM.overlay.classList.add('hidden');
    DOM.overlay.classList.remove('ov-exit','minimized','maximized');
  }, 280);
}

function minimizeOverlay() {
  if (APP.overlayMax) return;
  APP.overlayMin = !APP.overlayMin;
  DOM.overlay.classList.toggle('minimized', APP.overlayMin);
}

function maximizeOverlay() {
  if (APP.overlayMin) { APP.overlayMin=false; DOM.overlay.classList.remove('minimized'); }
  APP.overlayMax = !APP.overlayMax;
  DOM.overlay.classList.toggle('maximized', APP.overlayMax);
  if (!APP.overlayMax) {
    try {
      const s=JSON.parse(localStorage.getItem(POS_KEY)||'null');
      if(s){ DOM.overlay.style.left=s.x+'px'; DOM.overlay.style.top=s.y+'px';
             DOM.overlay.style.transform='none'; if(s.w) DOM.overlay.style.width=s.w+'px'; }
    } catch(e) {}
  }
  setTimeout(() => { if(APP.activeTab==='chart') Chart.resize(); }, 80);
}

function openSettings() {
  APP.settingsOpen = true;
  DOM.settingsPanel.classList.remove('hidden');
}
function closeSettings() {
  APP.settingsOpen = false;
  DOM.settingsPanel.classList.add('hidden');
  saveCFG();
  // Re-subscribe if asset changed
  if (APP.wsConnected) subscribeAsset(CFG.asset);
}

/* ════════════════════════════════════════════
   SECTION 20 — TABS
════════════════════════════════════════════ */
function initTabs() {
  DOM.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const name = tab.dataset.tab;
      DOM.tabs.forEach(t => t.classList.remove('active'));
      DOM.tabPanes.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + name)?.classList.add('active');
      APP.activeTab = name;
      if (name === 'chart') setTimeout(() => Chart.resize(), 80);
    });
  });
}

/* ════════════════════════════════════════════
   SECTION 21 — SETTINGS WIRING
════════════════════════════════════════════ */
function initSettingsControls() {
  const bind = (id, key, parse) => {
    const el = document.getElementById(id); if (!el) return;
    const update = () => {
      CFG[key] = parse ? parse(el) :
                 el.type === 'checkbox' ? el.checked : el.value;
      applyCFG();
    };
    el.addEventListener('change', update);
    el.addEventListener('input',  update);
  };
  bind('s-voice',          'voice');
  bind('s-auto-speak',     'autoSpeak');
  bind('s-vibration',      'vibration');
  bind('s-animations',     'animations',  e => e.value);
  bind('s-opacity',        'opacity',     e => +e.value);
  bind('s-volume',         'volume',      e => +e.value);
  bind('s-dark',           'darkMode');
  bind('s-candle-style',   'candleStyle', e => e.value);
  bind('s-ma-period',      'maPeriod',    e => +e.value);
  bind('s-asset',          'asset',       e => e.value);
  bind('s-auto-reconnect', 'autoReconnect');
}

/* ════════════════════════════════════════════
   SECTION 22 — IFRAME FALLBACK
════════════════════════════════════════════ */
function initIframe() {
  let timeout = setTimeout(() => {
    try {
      const doc = DOM.marketFrame.contentDocument;
      if (!doc || !doc.body || doc.body.innerHTML.trim() === '') {
        DOM.iframeFallback.classList.remove('hidden');
      }
    } catch(e) { /* cross-origin = iframe loaded fine */ }
  }, 9000);
  DOM.marketFrame.addEventListener('load', () => clearTimeout(timeout));
  DOM.marketFrame.addEventListener('error', () => DOM.iframeFallback.classList.remove('hidden'));
}

/* ════════════════════════════════════════════
   SECTION 23 — MAIN RAF LOOP
════════════════════════════════════════════ */
let raf = null, lastTick = 0;

function mainLoop(ts) {
  raf = requestAnimationFrame(mainLoop);
  if (ts - lastTick >= 500) { lastTick = ts; timeTick(); }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if(raf){cancelAnimationFrame(raf);raf=null;} }
  else { if(!raf) raf=requestAnimationFrame(mainLoop); }
});

/* ════════════════════════════════════════════
   SECTION 24 — EVENT BINDINGS
════════════════════════════════════════════ */
function bindEvents() {
  DOM.btnClose.addEventListener('click', closeOverlay);
  DOM.btnMin.addEventListener('click',   minimizeOverlay);
  DOM.btnMax.addEventListener('click',   maximizeOverlay);
  DOM.btnSettingsOpen.addEventListener('click',  () => APP.settingsOpen ? closeSettings() : openSettings());
  DOM.btnSettingsClose.addEventListener('click', closeSettings);

  DOM.overlay.addEventListener('touchmove', e => e.stopPropagation(), {passive:false});
  DOM.fab.addEventListener('keydown', e => {
    if (e.key==='Enter'||e.key===' ') { e.preventDefault(); toggleOverlay(); }
  });
}

/* ════════════════════════════════════════════
   SECTION 25 — UTILITY
════════════════════════════════════════════ */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ════════════════════════════════════════════
   SECTION 26 — BOOT
════════════════════════════════════════════ */
(function boot() {
  loadCFG();
  initSettingsControls();
  initVoice();
  initTabs();
  Chart.init();
  bindEvents();
  initIframe();

  // Connect WebSocket
  wsConnect();

  // Start RAF
  raf = requestAnimationFrame(mainLoop);

  // Initial UI state
  setAnalysisStatus('idle');
  DOM.dataSource.textContent = 'SIM';

  console.log(
    '%c⚛ Quantum Overlay AI v2%c\nLive WebSocket + Real Candlestick Analysis\nStatistical analysis only — not financial advice.',
    'color:#00e5a0;font-size:15px;font-weight:900;',
    'color:#888;font-size:11px;'
  );
})();
