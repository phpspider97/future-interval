require("dotenv").config();
const WebSocket = require("ws");
const ccxt = require("ccxt");
const ti = require("technicalindicators");

// ===== CONFIG =====
const SYMBOL = process.env.SYMBOL || "BTCUSDT";
const INTERVAL = "5m";
const RISK = parseFloat(process.env.RISK_PER_TRADE || "0.01");
const ATR_MULTIPLIER = 1.5;
const MIN_CANDLES = 60;

// ===== EXCHANGE =====
const exchange = new ccxt.delta({
    apiKey: process.env.API_KEY,
    secret: process.env.API_SECRET,
    enableRateLimit: true
});

// ===== STATE =====
let candles = [];
let lastCandleTime = null;
let lastSignal = 0;
let activeTrade = null;

// ===== LOAD INITIAL DATA =====
async function loadHistory() {
    await exchange.loadMarkets();

    const ohlcv = await exchange.fetchOHLCV(SYMBOL, INTERVAL, undefined, 100);

    candles = ohlcv.map(c => ({
        time: c[0],
        open: c[1],
        high: c[2],
        low: c[3],
        close: c[4],
        volume: c[5]
    }));

    console.log("📊 History loaded:", candles.length);
}

// ===== INDICATORS =====
function getIndicators() {
    if (candles.length < MIN_CANDLES) return null;

    const close = candles.map(c => c.close);
    const high = candles.map(c => c.high);
    const low = candles.map(c => c.low);
    const volume = candles.map(c => c.volume);

    const ema9 = ti.EMA.calculate({ period: 9, values: close }).at(-1);
    const ema21 = ti.EMA.calculate({ period: 21, values: close }).at(-1);
    const rsi = ti.RSI.calculate({ period: 14, values: close }).at(-1);
    const macd = ti.MACD.calculate({
        values: close, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9
    }).at(-1);
    const atr = ti.ATR.calculate({ high, low, close, period: 14 }).at(-1);
    const adx = ti.ADX.calculate({ high, low, close, period: 14 }).at(-1)?.adx || 0;

    if (!ema9 || !ema21 || !rsi || !macd || !atr) return null;

    return { ema9, ema21, rsi, macd, atr, adx };
}

// ===== STRATEGY =====
async function checkSignal() {
    const data = getIndicators();
    if (!data) return;

    const current = candles.at(-1);

    let bull = 0, bear = 0;

    if (current.close > data.ema9) bull++;
    if (data.rsi > 50) bull++;
    if (data.macd.MACD > data.macd.signal) bull++;
    if (data.ema9 > data.ema21) bull++;
    if (data.adx > 25) bull++;

    if (current.close < data.ema9) bear++;
    if (data.rsi < 50) bear++;
    if (data.macd.MACD < data.macd.signal) bear++;
    if (data.ema9 < data.ema21) bear++;
    if (data.adx > 25) bear++;

    const bullPct = (bull / 5) * 100;
    const bearPct = (bear / 5) * 100;

    console.log(`📊 Bull: ${bullPct}% | Bear: ${bearPct}%`);

    let signal = null;

    if (data.ema9 > data.ema21 && bullPct > 60 && lastSignal <= 0) {
        signal = "buy";
        lastSignal = 1;
    }

    if (data.ema9 < data.ema21 && bearPct > 60 && lastSignal >= 0) {
        signal = "sell";
        lastSignal = -1;
    }

    if (!signal || activeTrade) return;

    const entry = current.close;
    const risk = data.atr * ATR_MULTIPLIER;

    const sl = signal === "buy" ? entry - risk : entry + risk;

    const tps = [
        signal === "buy" ? entry + risk : entry - risk,
        signal === "buy" ? entry + risk * 2 : entry - risk * 2,
        signal === "buy" ? entry + risk * 3 : entry - risk * 3
    ];

    console.log(`🚀 SIGNAL: ${signal.toUpperCase()}`);

    activeTrade = await placeTrade(signal, entry, sl, tps);
}

// ===== PLACE TRADE =====
async function placeTrade(side, entry, sl, tps) {
    try {
        const balance = (await exchange.fetchBalance()).total.USDT || 0;
        const riskAmount = balance * RISK;
        const size = riskAmount / Math.abs(entry - sl);

        console.log("📊 Size:", size);

        await exchange.createMarketOrder(SYMBOL, side, size);

        await exchange.createOrder(
            SYMBOL,
            "stop_market",
            side === "buy" ? "sell" : "buy",
            size,
            undefined,
            { stopPrice: sl }
        );

        const tpSize = size / tps.length;

        for (let tp of tps) {
            await exchange.createLimitOrder(
                SYMBOL,
                side === "buy" ? "sell" : "buy",
                tpSize,
                tp
            );
        }

        return { side, entry, sl };

    } catch (err) {
        console.error("❌ Trade Error:", err.message);
        return null;
    }
}

// ===== WEBSOCKET =====
function startWebSocket() {
    const ws = new WebSocket("wss://socket.delta.exchange");

    ws.on("open", () => {
        console.log("🔌 Connected to Delta WebSocket");

        ws.send(JSON.stringify({
            type: "subscribe",
            payload: {
                channels: [{
                    name: "candlestick_5m",
                    symbols: [SYMBOL]
                }]
            }
        }));
    });

    ws.on("message", async (msg) => {
        const data = JSON.parse(msg);

        if (!data || !data.candle) return;

        const c = data.candle;

        // Only process CLOSED candles
        if (c.close_time === lastCandleTime) return;

        lastCandleTime = c.close_time;

        const newCandle = {
            time: c.close_time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume
        };

        candles.push(newCandle);

        if (candles.length > 200) candles.shift();

        console.log("🕯 New Candle:", newCandle.close);

        await checkSignal();
    });

    ws.on("close", () => {
        console.log("🔁 Reconnecting...");
        setTimeout(startWebSocket, 3000);
    });

    ws.on("error", (err) => {
        console.error("❌ WS Error:", err.message);
    });
}

// ===== START =====
(async () => {
    console.log("🤖 Delta WS Bot Started...");
    await loadHistory();
    startWebSocket();
})();