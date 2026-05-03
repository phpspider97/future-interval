require("dotenv").config();
const ccxt = require("ccxt"); 
const axios = require("axios");

const exchange = new ccxt.binance({
    enableRateLimit: true
});

const SYMBOL = "BTC/USDT";
const TIMEFRAME = "15m";

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

// ===== Trend Slope =====
function slope(arr, period = 20) {
    const recent = arr.slice(-period);
    return (recent[recent.length - 1] - recent[0]) / period;
}

// ===== Fetch Data =====
async function fetchPrices() {
    const ohlcv = await exchange.fetchOHLCV(SYMBOL, TIMEFRAME, undefined, 100);
    return ohlcv.map(c => c[4]);
}

// ===== Main Logic =====
async function run() {
    try {
        const prices = await fetchPrices();

        const mu = mean(prices.slice(-50));
        const sigma = std(prices.slice(-50));
        const price = prices[prices.length - 1];

        const z = zScore(price, mu, sigma);
        const trendSlope = slope(prices, 20);

        let side = null;

        // ===== Entry + Trend Filter =====
        if (z < -2 && trendSlope > 0) side = "buy";
        if (z > 2 && trendSlope < 0) side = "sell";

        if (!side) {
            //console.log("No trade | z:", z.toFixed(2), "| slope:", trendSlope.toFixed(4));
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

        console.log("------ TRADE SIGNAL ------");
        console.log("Side:", side.toUpperCase());
        console.log("Price:", price);
        console.log("Z-score:", z.toFixed(2));
        console.log("Slope:", trendSlope.toFixed(4));
        console.log("TP:", tp.toFixed(2));
        console.log("SL:", sl.toFixed(2));
        console.log("R:R =", rr.toFixed(2));

        if(side.toUpperCase() == 'BUY'){
            // sendTelegram(`🟢 MATEMATIC BOT : BUY BTC
            // Side: ${side.toUpperCase()}
            // Price: ${price}
            // Z-score: ${z.toFixed(2)}
            // Slope: ${trendSlope.toFixed(4)}
            // TP: ${tp.toFixed(2)}
            // SL: ${sl.toFixed(2)}
            // R:R: ${rr.toFixed(2)}`)

            sendTelegram(`
            🚀 *MATHEMATICAL BOT SIGNAL*

            ━━━━━━━━━━━━━━━━━━━
            🟢 *TRADE:* BUY BTC  
            📊 *Side:* ${side.toUpperCase()}  
            💰 *Entry Price:* ${price}

            ━━━━━━━━━━━━━━━━━━━
            📈 *Z-Score:* ${z.toFixed(2)}  
            📉 *Trend Slope:* ${trendSlope.toFixed(4)}  

            ━━━━━━━━━━━━━━━━━━━
            🎯 *Take Profit:* ${tp.toFixed(2)}  
            🛑 *Stop Loss:* ${sl.toFixed(2)}  
            ⚖️ *Risk/Reward:* ${rr.toFixed(2)}

            ━━━━━━━━━━━━━━━━━━━
            ⚡ *Strategy:* Mean Reversion + Trend Confirmation
            `)
        }else{
            // sendTelegram(`🔴  MATEMATIC BOT : SELL BTC
            // Side: ${side.toUpperCase()}
            // Price: ${price}
            // Z-score: ${z.toFixed(2)}
            // Slope: ${trendSlope.toFixed(4)}
            // TP: ${tp.toFixed(2)}
            // SL: ${sl.toFixed(2)}
            // R:R: ${rr.toFixed(2)}`)

            sendTelegram(`
            🚀 *MATHEMATICAL BOT SIGNAL*

            ━━━━━━━━━━━━━━━━━━━
            🔴 *TRADE:* SELL BTC  
            📊 *Side:* ${side.toUpperCase()}  
            💰 *Entry Price:* ${price}

            ━━━━━━━━━━━━━━━━━━━
            📈 *Z-Score:* ${z.toFixed(2)}  
            📉 *Trend Slope:* ${trendSlope.toFixed(4)}  

            ━━━━━━━━━━━━━━━━━━━
            🎯 *Take Profit:* ${tp.toFixed(2)}  
            🛑 *Stop Loss:* ${sl.toFixed(2)}  
            ⚖️ *Risk/Reward:* ${rr.toFixed(2)}

            ━━━━━━━━━━━━━━━━━━━
            ⚡ *Strategy:* Mean Reversion + Trend Confirmation

            ⏱ *Time:* ${new Date().toLocaleTimeString()}
            `)
        }

        if (rr < 1.5) {
            console.log("Skipped: Low R:R");
            return;
        }

        const size = 0.001;

        // await exchange.createMarketOrder(SYMBOL, side, size);

        console.log("Trade Ready (execution commented)");

    } catch (err) {
        console.error("Error:", err.message);
    }
}
 
//intervalManager.start("Pull back bot", trade, 60000);
module.exports = { run };

// TELEGRAM CODE
const TOKEN = process.env.TELEGRAM_MATHEMATIC_TOKEN;
const CHAT_ID = process.env.TELEGRAM_MATHEMATIC_CHAT_ID;

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