require("dotenv").config();
const axios = require("axios");
const ccxt = require("ccxt");
const ti = require("technicalindicators"); 

const exchange = new ccxt.binance({
    enableRateLimit: true
});

const SYMBOL = "BTC/USDT";
const TIMEFRAME = "15m";
const LIMIT = 300;

// SETTINGS
const slopeLookback = 5;
const slopeThreshold = 0.001; // 0.1%
const atrMultiplier = 1.5;

// STATE
let lastSignal = 0; // 1 = BUY, -1 = SELL

async function run() {
    const ohlcv = await exchange.fetchOHLCV(SYMBOL, TIMEFRAME, undefined, LIMIT);
   
    const closes = ohlcv.map(c => c[4]);
    const highs  = ohlcv.map(c => c[2]);
    const lows   = ohlcv.map(c => c[3]);

    // INDICATORS
    const ema9   = ti.EMA.calculate({ period: 9, values: closes });
    const ema21  = ti.EMA.calculate({ period: 21, values: closes });
    const ema200 = ti.EMA.calculate({ period: 200, values: closes });

    const atr = ti.ATR.calculate({
        high: highs,
        low: lows,
        close: closes,
        period: 14
    });

    const i = closes.length - 1;

    const price = closes[i];
    const e9 = ema9[ema9.length - 1];
    const e21 = ema21[ema21.length - 1];
    const e200 = ema200[ema200.length - 1];
    const atrVal = atr[atr.length - 1];

    // SLOPE
    const emaPrev = ema9[ema9.length - 1 - slopeLookback];
    const slope = (e9 - emaPrev) / emaPrev;

    // TREND
    const upTrend = e9 > e21 && e21 > e200;
    const downTrend = e9 < e21 && e21 < e200;

    // PULLBACK
    const pullbackBuy = price <= e9 * 1.002;
    const pullbackSell = price >= e9 * 0.998;

    // SIGNALS
    const buySignal = upTrend && pullbackBuy && slope > slopeThreshold && price > e9 && lastSignal !== 1;
    const sellSignal = downTrend && pullbackSell && slope < -slopeThreshold && price < e9 && lastSignal !== -1;
    // console.table([
    //     {
    //         upTrend,
    //         downTrend, 
    //         slope,
    //         slopeThreshold,
    //         price,
    //         e9,
    //         lastSignal,
    //     }
    // ]);
    if (buySignal) {
        lastSignal = 1;

        const sl = price - atrVal * atrMultiplier;
        const tp1 = price + atrVal * 1;
        const tp2 = price + atrVal * 2;

        console.log("🟢 BUY SIGNAL");
        sendTelegram(`🟢 EMA PULL BACK BOT : BUY BTC
        Price: ${price}
        SL: ${sl}
        TP1: ${tp1}
        TP2: ${tp2}`);
        //console.log({ price, sl, tp1, tp2 });

        // TODO: send to Telegram / webhook
    }

    if (sellSignal) {
        lastSignal = -1;

        const sl = price + atrVal * atrMultiplier;
        const tp1 = price - atrVal * 1;
        const tp2 = price - atrVal * 2;

        console.log("🔴 SELL SIGNAL");
        sendTelegram(`🔴 EMA PULL BACK BOT : SELL BTC
        Price: ${price}
        SL: ${sl}
        TP1: ${tp1}
        TP2: ${tp2}`);
        //console.log({ price, sl, tp1, tp2 });
    }
}

// RUN LOOP
//console.log("🤖 High Win Rate Delta Bot Running...");
//setInterval(run, 60 * 1000); // every 1 min

//intervalManager.start("Pull back bot", run, 60000);
module.exports = { run };


// TELEGRAM CODE
const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

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
 