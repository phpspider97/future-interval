require("dotenv").config();

const ccxt = require("ccxt");
const ti = require("technicalindicators");
const axios = require("axios");

const API_KEY = process.env.GRID_WEB_KEY;
const API_SECRET = process.env.GRID_WEB_SECRET;

// ======================================
// CONFIG
// ======================================

const TIMEFRAME = "15m";

const EMA_FAST = 9;
const EMA_SLOW = 21;

const CHECK_INTERVAL = 30 * 1000;

// STOP LOSS BUFFER %
const SL_BUFFER_PERCENT = 0.15;

// SWING LOOKBACK
const SWING_LOOKBACK = 20;

const SYMBOLS = [
    "BTCUSD",
    "ETHUSD",
    "PAXGUSD",
];

// ======================================
// DELTA EXCHANGE
// ======================================

const exchange = new ccxt.delta({
    apiKey: API_KEY,
    secret: API_SECRET,
    enableRateLimit: true,
    urls: {
        api: {
            public: "https://api.india.delta.exchange",
            private: "https://api.india.delta.exchange",
        }
    }
});

// ======================================
// STORE LAST SIGNAL
// ======================================

const lastSignal = {};

// ======================================
// TABLE DATA
// ======================================

const tableData = [];

// ======================================
// TELEGRAM
// ======================================

const TOKEN = process.env.TELEGRAM_EMA_PULLBACK_TOKEN;
const CHAT_ID = process.env.TELEGRAM_EMA_PULLBACK_CHAT_ID;

// ======================================
// TELEGRAM ALERT
// ======================================

async function sendTelegram(message) {

    try {

        await axios.post(
            `https://api.telegram.org/bot${TOKEN}/sendMessage`,
            {
                chat_id: CHAT_ID,
                text: message,
                parse_mode: "HTML"
            }
        );

    } catch (err) {

        console.log(
            "Telegram Error:",
            err.message
        );
    }
}

// ======================================
// GET SWING HIGH
// ======================================

function getSwingHigh(highs) {

    const recentHighs = highs.slice(-SWING_LOOKBACK);

    return Math.max(...recentHighs);
}

// ======================================
// GET SWING LOW
// ======================================

function getSwingLow(lows) {

    const recentLows = lows.slice(-SWING_LOOKBACK);

    return Math.min(...recentLows);
}

// ======================================
// CHECK SIGNAL
// ======================================

async function checkSignal(symbol) {

    try {

        // ======================================
        // FETCH OHLCV
        // ======================================

        const candles = await exchange.fetchOHLCV(
            symbol,
            TIMEFRAME,
            undefined,
            100
        );

        const closePrices = candles.map(c => c[4]);
        const highs = candles.map(c => c[2]);
        const lows = candles.map(c => c[3]);

        // ======================================
        // EMA CALCULATION
        // ======================================

        const ema9 = ti.EMA.calculate({
            period: EMA_FAST,
            values: closePrices
        });

        const ema21 = ti.EMA.calculate({
            period: EMA_SLOW,
            values: closePrices
        });

        const currentEMA9 = ema9[ema9.length - 1];
        const previousEMA9 = ema9[ema9.length - 2];

        const currentEMA21 = ema21[ema21.length - 1];
        const previousEMA21 = ema21[ema21.length - 2];

        const currentPrice = closePrices[closePrices.length - 1];

        // ======================================
        // CROSS CONDITIONS
        // ======================================

        const bullishCross =
            previousEMA9 <= previousEMA21 &&
            currentEMA9 > currentEMA21;

        const bearishCross =
            previousEMA9 >= previousEMA21 &&
            currentEMA9 < currentEMA21;

        // ======================================
        // DEFAULT VALUES
        // ======================================

        let signal = "NO SIGNAL";

        let stopLoss = "-";
        let takeProfit = "-";

        const trend =
            currentEMA9 > currentEMA21
                ? "BULLISH"
                : "BEARISH";

        // ======================================
        // BUY SIGNAL 
        // ======================================
        if (
            bullishCross &&
            lastSignal[symbol] !== "BUY"
        ) {

            lastSignal[symbol] = "BUY";

            signal = "BUY";

            // ======================================
            // SL BELOW EMA 21
            // ======================================

            stopLoss =
                currentEMA21 -
                (
                    currentEMA21 *
                    SL_BUFFER_PERCENT /
                    100
                );

            // ======================================
            // TP = SWING HIGH
            // ======================================

            takeProfit = getSwingHigh(highs);

            const rr =
                (
                    (takeProfit - currentPrice) /
                    (currentPrice - stopLoss)
                ).toFixed(2);

            const message = `
🟢 <b>EMA BULLISH CROSS</b>

<b>Symbol:</b> ${symbol}

<b>Timeframe:</b> ${TIMEFRAME}

<b>Entry:</b> ${currentPrice.toFixed(2)}

<b>EMA 9:</b> ${currentEMA9.toFixed(2)}
<b>EMA 21:</b> ${currentEMA21.toFixed(2)}

<b>Stop Loss:</b> ${stopLoss.toFixed(2)}

<b>Take Profit:</b> ${takeProfit.toFixed(2)}

<b>Risk Reward:</b> 1:${rr}

<b>Trend:</b> ${trend}

<b>Signal:</b> BUY

<b>Time:</b>
${new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata"
})}
`;

            console.log(`🟢 BUY ALERT => ${symbol}`);

            await sendTelegram(message);
        }

        // ======================================
        // SELL SIGNAL
        // ======================================

        if (
            bearishCross &&
            lastSignal[symbol] !== "SELL"
        ) {

            lastSignal[symbol] = "SELL";

            signal = "SELL";

            // ======================================
            // SL ABOVE EMA 21
            // ======================================

            stopLoss =
                currentEMA21 +
                (
                    currentEMA21 *
                    SL_BUFFER_PERCENT /
                    100
                );

            // ======================================
            // TP = SWING LOW
            // ======================================

            takeProfit = getSwingLow(lows);

            const rr =
                (
                    (currentPrice - takeProfit) /
                    (stopLoss - currentPrice)
                ).toFixed(2);

            const message = `
🔴 <b>EMA BEARISH CROSS</b>

<b>Symbol:</b> ${symbol}

<b>Timeframe:</b> ${TIMEFRAME}

<b>Entry:</b> ${currentPrice.toFixed(2)}

<b>EMA 9:</b> ${currentEMA9.toFixed(2)}
<b>EMA 21:</b> ${currentEMA21.toFixed(2)}

<b>Stop Loss:</b> ${stopLoss.toFixed(2)}

<b>Take Profit:</b> ${takeProfit.toFixed(2)}

<b>Risk Reward:</b> 1:${rr}

<b>Trend:</b> ${trend}

<b>Signal:</b> SELL

<b>Time:</b>
${new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata"
})}
`;

            console.log(`🔴 SELL ALERT => ${symbol}`);

            await sendTelegram(message);
        }

        // ======================================
        // PUSH TABLE DATA
        // ======================================

        tableData.push({
            Symbol: symbol,
            Signal: signal,
            Price: currentPrice.toFixed(2),
            EMA9: currentEMA9.toFixed(2),
            EMA21: currentEMA21.toFixed(2),
            SL:
                stopLoss === "-"
                    ? "-"
                    : stopLoss.toFixed(2),
            TP:
                takeProfit === "-"
                    ? "-"
                    : takeProfit.toFixed(2),
            Trend: trend,
            Timeframe: TIMEFRAME,
            Time: new Date().toLocaleTimeString(
                "en-IN",
                {
                    timeZone: "Asia/Kolkata"
                }
            )
        });

    } catch (error) {

        console.log(
            `${symbol} Error:`,
            error.message
        );
    }
}

// ======================================
// SLEEP
// ======================================

function sleep(ms) {

    return new Promise(resolve =>
        setTimeout(resolve, ms)
    );
}

// ======================================
// MAIN LOOP
// ======================================

async function run() {

    // console.log("=================================");
    // console.log(" EMA CROSS BOT STARTED ");
    // console.log("=================================\n");

    while (true) {

        try {

            tableData.length = 0;

            for (const symbol of SYMBOLS) {

                await checkSignal(symbol);

                await sleep(1000);
            }

            console.clear();

            // console.log("=================================");
            // console.log(" EMA 9 / EMA 21 LIVE SCANNER ");
            // console.log("=================================\n");

            // console.table(tableData);

            // console.log(
            //     `Next Scan In ${CHECK_INTERVAL / 1000} Seconds...\n`
            // );

            await sleep(CHECK_INTERVAL);

        } catch (error) {

            console.log(
                "Main Loop Error:",
                error.message
            );

            await sleep(5000);
        }
    }
}

// ======================================
// START BOT
// ======================================

module.exports = { run };