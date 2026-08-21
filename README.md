# ⚛ Quantum Overlay AI — v2 (Live WebSocket Edition)

**Stack:** Vanilla HTML · CSS · JavaScript (zero dependencies)  
**Target:** Android Chrome · Kiwi Browser · Edge Mobile

---

## 🔌 Live WebSocket Data

Connects to:
```
wss://ws2.market-qx.info/socket.io/?EIO=3&transport=websocket
```

### Protocol
- Socket.IO v3 (EIO=3) over raw WebSocket  
- Emits `subscribeCandle` + `subscribeTick` on connect  
- Auto-reconnects every 3 seconds if disconnected  
- Falls back to **statistical simulation** if WS unavailable

### Connection Status
| Toast Color | Meaning |
|-------------|---------|
| 🟢 Green — LIVE DATA | WebSocket connected, real candles |
| 🟡 Yellow — Connecting… | Handshake in progress |
| 🔴 Red — Reconnecting… | Disconnected, retrying |

---

## 🗂️ File Structure

```
quantum-v2/
├── index.html   — Shell, iframe, full overlay markup
├── style.css    — Glassmorphism + tabs + chart styles
├── app.js       — WS client, TA engine, chart renderer, RAF loop
└── README.md
```

---

## 📊 Candlestick Chart (Live)

Built from scratch in Canvas — no library needed.

| Feature | Detail |
|---------|--------|
| Timeframes | 1M · 5M · 15M |
| Overlays | MA (period configurable), Bollinger Bands |
| Volume | Sub-chart below candles |
| Live candle | Glows green/red at right edge |
| Pinch/pan | Touch gesture to zoom & scroll |
| Crosshair | Hover for OHLC tooltip |
| Styles | Classic · Hollow · OHLC Bar |

---

## 🧮 Technical Analysis Modules (12)

All use **real candle data** when live; simulation when offline.

| Module | Indicator Used |
|--------|---------------|
| Trend | EMA 7/14/21 alignment |
| Momentum | MACD histogram |
| MA Cross | SMA fast/slow crossover |
| Volatility | Bollinger Band position |
| Pattern | Candlestick formations (hammer, engulfing, doji, star) |
| Frequency | Volume profile — up vs down candle volume ratio |
| Bayesian | Markov posterior probability |
| Markov | Transition-state chain |
| Streak | Consecutive direction run → reversal bias |
| Reversal | RSI overbought/oversold |
| RSI | Direct RSI directional score |
| Adaptive | Stochastic oscillator |

**Weighted composite → Direction + Confidence %**

---

## ⏱️ Signal Timing

- Timezone: **Asia/Dhaka** (BD Time)
- Signal fires at **second :55** of every minute
- Countdown ring counts down 60→0
- Last 5 seconds → ring turns red

---

## 🎮 Controls

| Action | Result |
|--------|--------|
| Tap FAB | Toggle overlay |
| Drag FAB | Move (snaps to edge) |
| Long-press FAB (0.6s) | Open Settings |
| Drag titlebar | Move overlay |
| Pinch overlay | Resize |
| 🔴 dot | Close |
| 🟡 dot | Minimize |
| 🟢 dot | Maximize / restore |
| ⚙ icon | Settings |

---

## 📋 Tabs

| Tab | Content |
|-----|---------|
| 📊 Signal | Direction card, metric bars, price ticker |
| 📈 Chart | Live candlestick chart with indicators |
| 🧠 Engine | All 12 module scores with bars |
| 📋 History | Last 30 signals with source tag |

---

## ⚙️ Settings

- Voice on/off · Auto-speak · Vibration · Volume  
- Animation level (Full / Reduced / Off)  
- Overlay opacity  
- Candle style (Classic / Hollow / OHLC Bar)  
- MA period (7 / 14 / 21)  
- Asset selector (BTC/USD OTC, EUR/USD OTC, GBP/USD OTC…)  
- Auto-reconnect WebSocket

---

## 🚀 Deploy

### Kiwi Browser (local)
Copy 3 files to phone → open `index.html`

### GitHub Pages
Push repo → Settings → Pages → `main` branch

### Netlify / Vercel
Drag folder to deploy dashboard

### MT Manager APK
Place in `assets/www/` → WebView → `file:///android_asset/www/index.html`

---

## ⚠️ Disclaimer

Statistical analysis only. Not financial advice.  
Binary options carry significant risk of loss.  
Past signals do not guarantee future results.
