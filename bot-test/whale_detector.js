require("dotenv").config();
const ccxt = require("ccxt");
const axios = require("axios");

// ================= CONFIG =================
const SYMBOL = "BTC/USDT";
const TIMEFRAME = "1m";

// ================= EXCHANGE =================
const exchange = new ccxt.binance({
    enableRateLimit: true,
});

// ================= FETCH CANDLES =================
async function getCandles() {
    const ohlcv = await exchange.fetchOHLCV(SYMBOL, TIMEFRAME, undefined, 50);

    return ohlcv.map(c => ({
        time: c[0],
        open: c[1],
        high: c[2],
        low: c[3],
        close: c[4],
        volume: c[5],
    }));
}

// ================= FETCH ORDER BOOK =================
async function getOrderBook() {
    const ob = await exchange.fetchOrderBook(SYMBOL);

    const bidVolume = ob.bids
        .slice(0, 20)
        .reduce((sum, b) => sum + b[1], 0);

    const askVolume = ob.asks
        .slice(0, 20)
        .reduce((sum, a) => sum + a[1], 0);

    return { bidVolume, askVolume };
}

// ================= AVG VOLUME =================
function averageVolume(data) {
    return data.reduce((sum, c) => sum + c.volume, 0) / data.length;
}

// ================= WHALE DETECTOR =================
function detectWhale(candles, orderBook, avgVol) {
    const last = candles[candles.length - 1];

    const volumeSpike = last.volume > avgVol * 2;

    const body = Math.abs(last.close - last.open);
    const lowerWick = Math.min(last.open, last.close) - last.low;
    const upperWick = last.high - Math.max(last.open, last.close);

    const imbalance = orderBook.bidVolume / orderBook.askVolume;

    // ================= WHALE BUY =================
    if (
        volumeSpike &&
        lowerWick > body * 1.5 &&
        imbalance > 1.3
    ) {
        return {
            signal: "🐋 WHALE BUY",
            direction: "LONG",
            strength: "HIGH",
        };
    }

    // ================= WHALE SELL =================
    if (
        volumeSpike &&
        upperWick > body * 1.5 &&
        imbalance < 0.8
    ) {
        return {
            signal: "🐋 WHALE SELL",
            direction: "SHORT",
            strength: "HIGH",
        };
    }

    return { signal: "NO WHALE", direction: null };
}

// ================= MAIN LOOP =================
async function run() {
    try {
        const candles = await getCandles();
        const orderBook = await getOrderBook();

        const avgVol = averageVolume(candles);
        const result = detectWhale(candles, orderBook, avgVol);

        const lastPrice = candles[candles.length - 1].close;

        // console.log("====================================");
        // console.log("Price:", lastPrice);
        // console.log("Bid Volume:", orderBook.bidVolume.toFixed(2));
        // console.log("Ask Volume:", orderBook.askVolume.toFixed(2));
        // console.log("Signal:", result.signal);

        if (result.direction) {
            //console.log("Direction:", result.direction);
            //console.log("Strength:", result.strength);
            // sendTelegram(`🟢 🔴 WHALE DETECTOR BOT :
            // Direction: ${result.direction}
            // Strength: ${result.strength}`);
            sendTelegram(`
            🐋 *WHALE DETECTOR BOT*

            ━━━━━━━━━━━━━━━━━━━
            📊 *Direction:* ${result.direction === "BUY" ? "🟢 BUY" : "🔴 SELL"}
            ⚡ *Strength:* ${result.strength}

            📡 *Signal Type:* ${result.strength > 70 ? "🚀 STRONG" : "⚠️ MODERATE"}
            ━━━━━━━━━━━━━━━━━━━

            🕒 *Time* : ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
            `);

            }
              

    } catch (err) {
        console.error("Error:", err.message);
    }
}

// ================= RUN EVERY 10 SEC =================
module.exports = { run };

// TELEGRAM CODE
const TOKEN = process.env.TELEGRAM_WHALE_DETECTOR_TOKEN;
const CHAT_ID = process.env.TELEGRAM_WHALE_DETECTOR_CHAT_ID;

async function sendTelegram(message) {
    try { 
        await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: message
        });
    } catch (err) {
        console.error("Telegram Error:", err.message);
    }
} 
 