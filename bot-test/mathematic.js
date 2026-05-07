require("dotenv").config();
const ccxt = require("ccxt");
const axios = require("axios");

const exchange = new ccxt.binance({
    enableRateLimit: true
});

const SYMBOL = "BTC/USDT";
const TIMEFRAME = "15m";

// ===== SETTINGS =====
const LIMIT = 200;
const Z_ENTRY = 1.5;       // normal mode
const Z_SNIPER = 2.5;      // sniper mode
const RR_MIN = 1.5;
const USE_SNIPER = false;  // true = very selective trades

// ===== Math Functions =====
function mean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr) {
    const m = mean(arr);
    return Math.sqrt(arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / arr.length);
}

function zScore(price, mu, sigma) {
    return (price - mu) / sigma;
}

// ===== EMA Trend =====
function ema(prices, period = 50) {
    const k = 2 / (period + 1);
    let emaVal = prices[0];

    for (let i = 1; i < prices.length; i++) {
        emaVal = prices[i] * k + emaVal * (1 - k);
    }

    return emaVal;
}

// ===== Fetch Data =====
async function fetchPrices() {
    const ohlcv = await exchange.fetchOHLCV(SYMBOL, TIMEFRAME, undefined, LIMIT);
    return ohlcv.map(c => c[4]);
}

// ===== Main Logic =====
async function run() {
    try {
        const prices = await fetchPrices();

        const mu = mean(prices.slice(-100));
        const sigma = std(prices.slice(-100));
        const price = prices[prices.length - 1];

        const z = zScore(price, mu, sigma);
        const ema50 = ema(prices.slice(-100), 50);

        let side = null;

        const threshold = USE_SNIPER ? Z_SNIPER : Z_ENTRY;

        // ===== ENTRY LOGIC =====
        if (z < -threshold && price > ema50) side = "buy";
        if (z > threshold && price < ema50) side = "sell";

        if (!side) {
            //console.log(`No trade | z: ${z.toFixed(2)} | price: ${price} | EMA: ${ema50.toFixed(2)}`);
            return;
        }

        // ===== SL / TP =====
        let sl, tp;

        if (side === "buy") {
            tp = mu;
            sl = mu - 3 * sigma;
        } else {
            tp = mu;
            sl = mu + 3 * sigma;
        }

        const risk = Math.abs(price - sl);
        const reward = Math.abs(tp - price);
        const rr = reward / risk;

        // ===== FILTER BAD TRADES =====
        if (rr < RR_MIN) {
            console.log("Skipped: Low R:R", rr.toFixed(2));
            return;
        }

        console.log("------ TRADE SIGNAL ------");
        console.log("Side:", side.toUpperCase());
        console.log("Price:", price);
        console.log("Z-score:", z.toFixed(2));
        console.log("EMA50:", ema50.toFixed(2));
        console.log("TP:", tp.toFixed(2));
        console.log("SL:", sl.toFixed(2));
        console.log("R:R =", rr.toFixed(2));

        // ===== TELEGRAM ALERT =====
        const emoji = side === "buy" ? "🟢" : "🔴";

        await sendTelegram(`
🚀 *MATHEMATICAL BOT SIGNAL*

━━━━━━━━━━━━━━━━━━━
${emoji} *TRADE:* ${side.toUpperCase()} BTC  
💰 *Entry Price:* ${price}

━━━━━━━━━━━━━━━━━━━
📈 *Z-Score:* ${z.toFixed(2)}  
📉 *EMA Trend:* ${ema50.toFixed(2)}

━━━━━━━━━━━━━━━━━━━
🎯 *Take Profit:* ${tp.toFixed(2)}  
🛑 *Stop Loss:* ${sl.toFixed(2)}  
⚖️ *Risk/Reward:* ${rr.toFixed(2)}

━━━━━━━━━━━━━━━━━━━
⚡ *Mode:* ${USE_SNIPER ? "SNIPER" : "NORMAL"}  
🕒 *Time:* ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
        `);

        // ===== EXECUTION (OPTIONAL) =====
        // const size = 0.001;
        // await exchange.createMarketOrder(SYMBOL, side, size);

    } catch (err) {
        console.error("Error:", err.message);
    }
}

module.exports = { run };

// ===== TELEGRAM =====
const TOKEN = process.env.TELEGRAM_MATHEMATIC_TOKEN;
const CHAT_ID = process.env.TELEGRAM_MATHEMATIC_CHAT_ID;

async function sendTelegram(message) {
    try {
        await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: message,
            parse_mode: "Markdown"
        });
    } catch (err) {
        console.error("Telegram Error:", err.message);
    }
}