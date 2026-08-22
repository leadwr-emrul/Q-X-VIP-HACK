# ⚛ Quantum Overlay AI — v3 (Bug-Fixed Edition)

## 🔧 সমস্যা যা ঠিক হয়েছে

| সমস্যা | সমাধান |
|--------|--------|
| iframe আলাদা ট্যাবে খুলছিল | `target="_self"` + `data-src` দিয়ে delayed load |
| Overlay স্ক্রিনের বাইরে চলে যেত | `clampOverlay()` — সব drag/resize এ bounds check |
| Drag কাজ করছিল না | `pointerCapture` + `transform:none` switching ঠিক করা |
| Resize কাজ করছিল না | Corner handle + pinch — উভয়ই ঠিক করা |
| বারবার "Connecting" দেখাচ্ছিল | Exponential backoff + duplicate connection guard |
| WS badge spam | `wsConnecting` flag দিয়ে একসাথে একটিই connection |

---

## 📂 ফাইল

```
quantum-v3/
├── index.html   — HTML shell (366 lines)
├── style.css    — Full glassmorphism UI (678 lines)
├── app.js       — Engine + WS + Chart + Drag (1427 lines)
└── README.md
```

---

## 🚀 ব্যবহার করুন

### Kiwi Browser / Chrome (Android)
1. তিনটি ফাইল ফোনে কপি করুন (একই ফোল্ডারে)
2. `index.html` খুলুন
3. iframe এ Market QX লোড হবে — **আলাদা ট্যাব হবে না**

### GitHub Pages
```
repo → Settings → Pages → main branch → /root
```

### Netlify
ফোল্ডারটি drag করে netlify.com/drop এ drop করুন

---

## 🎮 Controls

| Action | Result |
|--------|--------|
| FAB tap | Overlay খোলা/বন্ধ |
| FAB drag | যেকোনো দিকে সরানো (edge snap) |
| FAB long-press (0.6s) | Settings খোলে |
| Titlebar drag | Overlay সরানো |
| Corner handle drag | Resize |
| Pinch on overlay | Resize (touch) |
| 🔴 dot | Close |
| 🟡 dot | Minimize |
| 🟢 dot | Maximize |

---

## 📊 Tabs

| Tab | বিষয় |
|-----|-------|
| 📊 Signal | Direction, confidence, metrics, price |
| 📈 Chart | Live candlestick + MA/BB/Volume |
| 🧠 Engine | ১২টি module এর individual score |
| 📋 Log | Signal history + accuracy |

---

## 🔌 WebSocket

```
wss://ws2.market-qx.info/socket.io/?EIO=3&transport=websocket
```

- Connected → **LIVE DATA** (green badge)
- Disconnected → **SIM MODE** (grey) + auto-retry
- Retry: 3s → 4.5s → 6.75s → … max 30s (exponential backoff)

---

## ⚠️ Disclaimer

Statistical simulation only. Not financial advice.
