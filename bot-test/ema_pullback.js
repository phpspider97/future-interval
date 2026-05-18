require("dotenv").config();

const ccxt = require("ccxt");
const ti = require("technicalindicators");
const axios = require("axios");

const API_KEY     =   process.env.GRID_WEB_KEY
const API_SECRET  =   process.env.GRID_WEB_SECRET

const exchange = new ccxt.delta({
    apiKey: API_KEY,
    secret: API_SECRET,
    enableRateLimit: true,
    urls: {
        api: {
            public: "https://api.india.delta.exchange",
            private: "https://api.india.delta.exchange",
        }
        // api: {
        //     public: "https://cdn-ind.testnet.deltaex.org",
        //     private: "https://cdn-ind.testnet.deltaex.org",
        // }
    }
});

const SYMBOLS = [
    "BTCUSD",
    "ETHUSD",
    "SOLUSD",
    "BNBUSD",
    "XRPUSD",
    "PAXGUSD",
    "AVAXUSD",
    "DOGEUSD",
    "LINKUSD",
    "ADAUSD", 
    "LTCUSD", 
    "TRXUSD",
    "NEARUSD",
    "APTUSD",
    "ARBUSD",
    "OPUSD",
    "SUIUSD",
    "INJUSD"
];

const TIMEFRAME = "15m";

const EMA_FAST = 9;
const EMA_SLOW = 21;

const RR = 2;

const EMA_DISTANCE_FILTER = 0.15;

const activeSignals = {};

// ======================
// TELEGRAM
// ======================

const TOKEN = process.env.TELEGRAM_EMA_PULLBACK_TOKEN;
const CHAT_ID = process.env.TELEGRAM_EMA_PULLBACK_CHAT_ID;

async function sendTelegramMessage(message) {
    try {
        await axios.post(
            `https://api.telegram.org/bot${TOKEN}/sendMessage`,
            {
                chat_id: CHAT_ID,
                text: message,
                parse_mode: "Markdown"
            }
        );
    } catch (err) {
        console.log("Telegram Error:", err.message);
    }
}

async function fetchCandles(symbol) {

    const ohlcv = await exchange.fetchOHLCV(
        symbol,
        TIMEFRAME,
        undefined,
        200
    );

    return ohlcv.map(c => ({
        time: c[0],
        open: c[1],
        high: c[2],
        low: c[3],
        close: c[4],
        volume: c[5]
    }));
}

function calculateEMA(data, period) {

    return ti.EMA.calculate({
        period,
        values: data
    });
}

function getSignal(candles) {

    const closes = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);

    const ema9 = calculateEMA(closes, EMA_FAST);
    const ema21 = calculateEMA(closes, EMA_SLOW);

    const latestClose = closes[closes.length - 1];

    const latestVolume = volumes[volumes.length - 1];

    const avgVolume =
        volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;

    const currentEMA9 = ema9[ema9.length - 1];
    const currentEMA21 = ema21[ema21.length - 1];

    const previousEMA9 = ema9[ema9.length - 2];
    const previousEMA21 = ema21[ema21.length - 2];

    const lastCandle = candles[candles.length - 1];

    // TREND FILTER
    const emaDistance =
        Math.abs(currentEMA9 - currentEMA21)
        / currentEMA21 * 100;

    if (emaDistance < EMA_DISTANCE_FILTER) {
        return null;
    }

    // VOLUME FILTER
    if (latestVolume < avgVolume) {
        return null;
    }

    // CROSS
    const bullishCross =
        previousEMA9 < previousEMA21 &&
        currentEMA9 > currentEMA21;

    const bearishCross =
        previousEMA9 > previousEMA21 &&
        currentEMA9 < currentEMA21;

    // PULLBACK
    const longPullback =
        latestClose <= currentEMA9 * 1.002;

    const shortPullback =
        latestClose >= currentEMA9 * 0.998;

    // REJECTION CANDLE
    const bullishReject =
        lastCandle.close > lastCandle.open &&
        lastCandle.low <= currentEMA9;

    const bearishReject =
        lastCandle.close < lastCandle.open &&
        lastCandle.high >= currentEMA9;

    // BUY
    if (
        bullishCross ||
        (
            currentEMA9 > currentEMA21 &&
            longPullback &&
            bullishReject
        )
    ) {

        const swingLow =
            Math.min(
                ...candles.slice(-10).map(c => c.low)
            );

        return {
            side: "BUY",
            entry: latestClose,
            sl: swingLow,
            tp:
                latestClose +
                ((latestClose - swingLow) * RR),
            ema9: currentEMA9,
            ema21: currentEMA21
        };
    }

    // SELL
    if (
        bearishCross ||
        (
            currentEMA9 < currentEMA21 &&
            shortPullback &&
            bearishReject
        )
    ) {

        const swingHigh =
            Math.max(
                ...candles.slice(-10).map(c => c.high)
            );

        return {
            side: "SELL",
            entry: latestClose,
            sl: swingHigh,
            tp:
                latestClose -
                ((swingHigh - latestClose) * RR),
            ema9: currentEMA9,
            ema21: currentEMA21
        };
    }

    return null;
}

async function processSymbol(symbol) {

    try {

        const candles = await fetchCandles(symbol);

        const signal = getSignal(candles);

        if (!signal) {

            // console.log(
            //     `${symbol} → No Signal`
            // );

            return;
        }

        // PREVENT DUPLICATE SIGNALS
        const key =
            `${symbol}_${signal.side}`;

        if (activeSignals[key]) {
            return;
        }

        activeSignals[key] = true;

        setTimeout(() => {
            delete activeSignals[key];
        }, 1000 * 60 * 30);

        const sideEmoji =
        signal.side === "BUY"
            ? "🟢"
            : "🔴";
    
    const message = `
${sideEmoji} EMA PULLBACK SIGNAL

📌 Symbol: ${symbol}

📈 Side: ${signal.side}

💰 Entry: ${signal.entry.toFixed(2)}

🛑 Stop Loss: ${signal.sl.toFixed(2)}

🎯 Target: ${signal.tp.toFixed(2)}

📊 EMA 9: ${signal.ema9.toFixed(2)}

📊 EMA 21: ${signal.ema21.toFixed(2)}

⏰ TF: ${TIMEFRAME}

🕒 ${new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata"
})}
`;

        console.clear();

        console.log(message);

        await sendTelegramMessage(message);

    } catch (err) {

        console.log(
            `${symbol} Error:`,
            err.message
        );
    }
}

async function run() {
    console.clear()
    console.log(
        "\nChecking Market:",
        new Date().toLocaleTimeString()
    );

    for (const symbol of SYMBOLS) {

        await processSymbol(symbol);

        await sleep(1000);
    }
}

function sleep(ms) {
    return new Promise(resolve =>
        setTimeout(resolve, ms)
    );
}

console.log("🚀 EMA Pullback Bot Started");

// Run immediately
run();

//setInterval(run, 1000 * 60);
module.exports = { run };