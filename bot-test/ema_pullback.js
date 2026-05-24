// require("dotenv").config();

// const ccxt = require("ccxt");
// const ti = require("technicalindicators");
// const axios = require("axios");

// const API_KEY = process.env.GRID_WEB_KEY;
// const API_SECRET = process.env.GRID_WEB_SECRET;

// // ======================================
// // CONFIG
// // ======================================

// const TIMEFRAME = "15m";

// const EMA_FAST = 9;
// const EMA_SLOW = 21;

// const CHECK_INTERVAL = 30 * 1000;

// // STOP LOSS BUFFER %
// const SL_BUFFER_PERCENT = 0.15;

// // SWING LOOKBACK
// const SWING_LOOKBACK = 20;

// const SYMBOLS = [
//     "BTCUSD",
//     "ETHUSD",
//     "PAXGUSD",
// ];

// // ======================================
// // DELTA EXCHANGE
// // ======================================

// const exchange = new ccxt.delta({
//     apiKey: API_KEY,
//     secret: API_SECRET,
//     enableRateLimit: true,
//     urls: {
//         api: {
//             public: "https://api.india.delta.exchange",
//             private: "https://api.india.delta.exchange",
//         }
//     }
// });

// // ======================================
// // STORE LAST SIGNAL
// // ======================================

// const lastSignal = {};

// // ======================================
// // TABLE DATA
// // ======================================

// const tableData = [];

// // ======================================
// // TELEGRAM
// // ======================================

// const TOKEN = process.env.TELEGRAM_EMA_PULLBACK_TOKEN;
// const CHAT_ID = process.env.TELEGRAM_EMA_PULLBACK_CHAT_ID;

// // ======================================
// // TELEGRAM ALERT
// // ======================================

// async function sendTelegram(message) {

//     try {

//         await axios.post(
//             `https://api.telegram.org/bot${TOKEN}/sendMessage`,
//             {
//                 chat_id: CHAT_ID,
//                 text: message,
//                 parse_mode: "HTML"
//             }
//         );

//     } catch (err) {

//         console.log(
//             "Telegram Error:",
//             err.message
//         );
//     }
// }

// // ======================================
// // GET SWING HIGH
// // ======================================

// function getSwingHigh(highs) {

//     const recentHighs = highs.slice(-SWING_LOOKBACK);

//     return Math.max(...recentHighs);
// }

// // ======================================
// // GET SWING LOW
// // ======================================

// function getSwingLow(lows) {

//     const recentLows = lows.slice(-SWING_LOOKBACK);

//     return Math.min(...recentLows);
// }

// // ======================================
// // CHECK SIGNAL
// // ======================================

// async function checkSignal(symbol) {

//     try {

//         // ======================================
//         // FETCH OHLCV
//         // ======================================

//         const candles = await exchange.fetchOHLCV(
//             symbol,
//             TIMEFRAME,
//             undefined,
//             100
//         );

//         const closePrices = candles.map(c => c[4]);
//         const highs = candles.map(c => c[2]);
//         const lows = candles.map(c => c[3]);

//         // ======================================
//         // EMA CALCULATION
//         // ======================================

//         const ema9 = ti.EMA.calculate({
//             period: EMA_FAST,
//             values: closePrices
//         });

//         const ema21 = ti.EMA.calculate({
//             period: EMA_SLOW,
//             values: closePrices
//         });

//         const currentEMA9 = ema9[ema9.length - 1];
//         const previousEMA9 = ema9[ema9.length - 2];

//         const currentEMA21 = ema21[ema21.length - 1];
//         const previousEMA21 = ema21[ema21.length - 2];

//         const currentPrice = closePrices[closePrices.length - 1];

//         // ======================================
//         // CROSS CONDITIONS
//         // ======================================

//         const bullishCross =
//             previousEMA9 <= previousEMA21 &&
//             currentEMA9 > currentEMA21;

//         const bearishCross =
//             previousEMA9 >= previousEMA21 &&
//             currentEMA9 < currentEMA21;

//         // ======================================
//         // DEFAULT VALUES
//         // ======================================

//         let signal = "NO SIGNAL";

//         let stopLoss = "-";
//         let takeProfit = "-";

//         const trend =
//             currentEMA9 > currentEMA21
//                 ? "BULLISH"
//                 : "BEARISH";

//         // ======================================
//         // BUY SIGNAL 
//         // ======================================
//         if (
//             bullishCross &&
//             lastSignal[symbol] !== "BUY"
//         ) {

//             lastSignal[symbol] = "BUY";

//             signal = "BUY";

//             // ======================================
//             // SL BELOW EMA 21
//             // ======================================

//             stopLoss =
//                 currentEMA21 -
//                 (
//                     currentEMA21 *
//                     SL_BUFFER_PERCENT /
//                     100
//                 );

//             // ======================================
//             // TP = SWING HIGH
//             // ======================================

//             takeProfit = getSwingHigh(highs);

//             const rr =
//                 (
//                     (takeProfit - currentPrice) /
//                     (currentPrice - stopLoss)
//                 ).toFixed(2);

//             const message = `
// 🟢 <b>${symbol} BULLISH CROSS</b>

// <b>Symbol:</b> ${symbol}

// <b>Timeframe:</b> ${TIMEFRAME}

// <b>Entry:</b> ${currentPrice.toFixed(2)}

// <b>EMA 9:</b> ${currentEMA9.toFixed(2)}
// <b>EMA 21:</b> ${currentEMA21.toFixed(2)}

// <b>Stop Loss:</b> ${stopLoss.toFixed(2)}

// <b>Take Profit:</b> ${takeProfit.toFixed(2)}

// <b>Risk Reward:</b> 1:${rr}

// <b>Trend:</b> ${trend}

// <b>Signal:</b> BUY

// <b>Time:</b>
// ${new Date().toLocaleString("en-IN", {
//     timeZone: "Asia/Kolkata"
// })}
// `;

//             console.log(`🟢 BUY ALERT => ${symbol}`);

//             await sendTelegram(message);
//         }

//         // ======================================
//         // SELL SIGNAL
//         // ======================================

//         if (
//             bearishCross &&
//             lastSignal[symbol] !== "SELL"
//         ) {

//             lastSignal[symbol] = "SELL";

//             signal = "SELL";

//             // ======================================
//             // SL ABOVE EMA 21
//             // ======================================

//             stopLoss =
//                 currentEMA21 +
//                 (
//                     currentEMA21 *
//                     SL_BUFFER_PERCENT /
//                     100
//                 );

//             // ======================================
//             // TP = SWING LOW
//             // ======================================

//             takeProfit = getSwingLow(lows);

//             const rr =
//                 (
//                     (currentPrice - takeProfit) /
//                     (stopLoss - currentPrice)
//                 ).toFixed(2);

//             const message = `
// 🔴 <b>${symbol} BEARISH CROSS</b>

// <b>Symbol:</b> ${symbol}

// <b>Timeframe:</b> ${TIMEFRAME}

// <b>Entry:</b> ${currentPrice.toFixed(2)}

// <b>EMA 9:</b> ${currentEMA9.toFixed(2)}
// <b>EMA 21:</b> ${currentEMA21.toFixed(2)}

// <b>Stop Loss:</b> ${stopLoss.toFixed(2)}

// <b>Take Profit:</b> ${takeProfit.toFixed(2)}

// <b>Risk Reward:</b> 1:${rr}

// <b>Trend:</b> ${trend}

// <b>Signal:</b> SELL

// <b>Time:</b>
// ${new Date().toLocaleString("en-IN", {
//     timeZone: "Asia/Kolkata"
// })}
// `;

//             console.log(`🔴 SELL ALERT => ${symbol}`);

//             await sendTelegram(message);
//         }

//         // ======================================
//         // PUSH TABLE DATA
//         // ======================================

//         tableData.push({
//             Symbol: symbol,
//             Signal: signal,
//             Price: currentPrice.toFixed(2),
//             EMA9: currentEMA9.toFixed(2),
//             EMA21: currentEMA21.toFixed(2),
//             SL:
//                 stopLoss === "-"
//                     ? "-"
//                     : stopLoss.toFixed(2),
//             TP:
//                 takeProfit === "-"
//                     ? "-"
//                     : takeProfit.toFixed(2),
//             Trend: trend,
//             Timeframe: TIMEFRAME,
//             Time: new Date().toLocaleTimeString(
//                 "en-IN",
//                 {
//                     timeZone: "Asia/Kolkata"
//                 }
//             )
//         });

//     } catch (error) {

//         console.log(
//             `${symbol} Error:`,
//             error.message
//         );
//     }
// }

// // ======================================
// // SLEEP
// // ======================================

// function sleep(ms) {

//     return new Promise(resolve =>
//         setTimeout(resolve, ms)
//     );
// }

// // ======================================
// // MAIN LOOP
// // ======================================

// async function run() {

//     // console.log("=================================");
//     // console.log(" EMA CROSS BOT STARTED ");
//     // console.log("=================================\n");

//     while (true) {

//         try {

//             tableData.length = 0;

//             for (const symbol of SYMBOLS) {

//                 await checkSignal(symbol);

//                 await sleep(1000);
//             }

//             console.clear();

//             // console.log("=================================");
//             // console.log(" EMA 9 / EMA 21 LIVE SCANNER ");
//             // console.log("=================================\n");

//             // console.table(tableData);

//             // console.log(
//             //     `Next Scan In ${CHECK_INTERVAL / 1000} Seconds...\n`
//             // );

//             await sleep(CHECK_INTERVAL);

//         } catch (error) {

//             console.log(
//                 "Main Loop Error:",
//                 error.message
//             );

//             await sleep(5000);
//         }
//     }
// }

// // ======================================
// // START BOT
// // ======================================

//==========================================================================================================================================

require("dotenv").config();

const ccxt = require("ccxt");
const ti = require("technicalindicators");
const axios = require("axios");

// ======================================================
// ENV
// ======================================================

const API_KEY = process.env.GRID_WEB_KEY;
const API_SECRET = process.env.GRID_WEB_SECRET;

// ======================================================
// TELEGRAM
// ======================================================

const TELEGRAM_BOT =
    process.env.TELEGRAM_EMA_PULLBACK_TOKEN;

const CHAT_ID =
    process.env.TELEGRAM_EMA_PULLBACK_CHAT_ID;

// ======================================================
// EXCHANGE
// ======================================================

const exchange = new ccxt.delta({
    apiKey: API_KEY,
    secret: API_SECRET,
    enableRateLimit: true,
    options: {
        defaultType: "future"
    },
    urls: {
        api: {
            public: "https://api.india.delta.exchange",
            private: "https://api.india.delta.exchange",
        }
    }
});

// ======================================================
// CONFIG
// ======================================================

const SYMBOLS = [
    "BTCUSD",
    "ETHUSD",
    "PAXGUSD"
];

const TIMEFRAME = "1m";

const FAST_EMA = 21;
const SLOW_EMA = 50;
const TREND_EMA = 200;

const RSI_LENGTH = 14;

const VOLUME_MULTIPLIER = 1.2;

const STOP_BUFFER_PERCENT = 0.15;
const RISK_REWARD = 1.5;

const CHECK_INTERVAL = 30000;

// ======================================================
// ORDER SIZE
// ======================================================

const ORDER_SIZES = {
    BTCUSD: 1,
    ETHUSD: 2,
    PAXGUSD: 1
};

// ======================================================
// TELEGRAM
// ======================================================

async function sendTelegramMessage(message) {

    try {

        const url =
            `https://api.telegram.org/bot${TELEGRAM_BOT}/sendMessage`;

        await axios.post(url, {
            chat_id: CHAT_ID,
            text: message,
            parse_mode: "HTML"
        });

    } catch (err) {

        console.log(
            "Telegram Error:",
            err.response?.data || err.message
        );
    }
}

// ======================================================
// FETCH CANDLES
// ======================================================

async function getCandles(symbol) {

    const candles =
        await exchange.fetchOHLCV(
            symbol,
            TIMEFRAME,
            undefined,
            300
        );

    return candles.map(c => ({
        time: c[0],
        open: c[1],
        high: c[2],
        low: c[3],
        close: c[4],
        volume: c[5]
    }));
}

// ======================================================
// GET POSITION
// ======================================================

async function hasOpenPosition(symbol) {

    try {

        const positions =
            await exchange.fetchPositions([
                symbol
            ]);

        const position =
            positions.find(
                p =>
                    p.symbol === symbol &&
                    Math.abs(
                        Number(p.contracts)
                    ) > 0
            );

        return !!position;

    } catch (err) {

        console.log(
            `${symbol} Position Error:`,
            err.message
        );

        return false;
    }
}

// ======================================================
// CREATE MARKET ORDER
// ======================================================

async function createOrder(
    symbol,
    side,
    amount
) {

    try {

        const order =
            await exchange.createMarketOrder(
                symbol,
                side,
                amount
            );

        console.log(
            `${symbol} ${side} ORDER EXECUTED`
        );

        return order;

    } catch (err) {

        console.log(
            `${symbol} Order Error:`,
            err.message
        );

        return null;
    }
}

// ======================================================
// SIGNAL DETECTION
// ======================================================

function detectSignal(candles) {

    const closes =
        candles.map(c => c.close);

    const volumes =
        candles.map(c => c.volume);

    // ==================================================
    // EMA
    // ==================================================

    const fastEMA =
        ti.EMA.calculate({
            period: FAST_EMA,
            values: closes
        });

    const slowEMA =
        ti.EMA.calculate({
            period: SLOW_EMA,
            values: closes
        });

    const trendEMA =
        ti.EMA.calculate({
            period: TREND_EMA,
            values: closes
        });

    // ==================================================
    // RSI
    // ==================================================

    const rsi =
        ti.RSI.calculate({
            period: RSI_LENGTH,
            values: closes
        });

    // ==================================================
    // LAST CLOSED CANDLE
    // ==================================================

    const lastCandle =
        candles[candles.length - 2];

    const currentPrice =
        lastCandle.close;

    const currentVolume =
        lastCandle.volume;

    // ==================================================
    // AVG VOLUME
    // ==================================================

    const avgVolume =
        volumes
            .slice(-25)
            .reduce((a, b) => a + b, 0) / 25;

    // ==================================================
    // INDICATORS
    // ==================================================

    const fastCurrent =
        fastEMA[fastEMA.length - 2];

    const slowCurrent =
        slowEMA[slowEMA.length - 2];

    const trendCurrent =
        trendEMA[trendEMA.length - 2];

    const rsiCurrent =
        rsi[rsi.length - 2];

    // ==================================================
    // TREND
    // ==================================================

    const bullishTrend =
        currentPrice > trendCurrent;

    const bearishTrend =
        currentPrice < trendCurrent;

    // ==================================================
    // EMA DIRECTION
    // ==================================================

    const emaBullish =
        fastCurrent > slowCurrent;

    const emaBearish =
        fastCurrent < slowCurrent;

    // ==================================================
    // PULLBACK
    // ==================================================

    const nearFastEMAForBuy =
        currentPrice <= fastCurrent * 1.0015;

    const nearFastEMAForSell =
        currentPrice >= fastCurrent * 0.9985;

    // ==================================================
    // CANDLE
    // ==================================================

    const bullishCandle =
        lastCandle.close > lastCandle.open;

    const bearishCandle =
        lastCandle.close < lastCandle.open;

    // ==================================================
    // VOLUME FILTER
    // ==================================================

    const highVolume =
        currentVolume >
        avgVolume * VOLUME_MULTIPLIER;

    // ==================================================
    // BUY
    // ==================================================

    const buySignal =
        bullishTrend &&
        emaBullish &&
        nearFastEMAForBuy &&
        bullishCandle &&
        highVolume &&
        rsiCurrent > 45;

    // ==================================================
    // SELL
    // ==================================================

    const sellSignal =
        bearishTrend &&
        emaBearish &&
        nearFastEMAForSell &&
        bearishCandle &&
        highVolume &&
        rsiCurrent < 55;

    return {
        buySignal,
        sellSignal,
        currentPrice,
        fastCurrent,
        slowCurrent,
        trendCurrent,
        rsiCurrent,
        currentVolume
    };
}

// ======================================================
// LAST SIGNAL STATE
// ======================================================

const lastSignals = {};

// ======================================================
// PROCESS SYMBOL
// ======================================================

async function processSymbol(symbol) {

    try {

        const candles =
            await getCandles(symbol);

        const signal =
            detectSignal(candles);

        // ==================================================
        // SIGNAL TYPE
        // ==================================================

        let signalType = "NONE";

        if (signal.buySignal) {
            signalType = "BUY";
        }

        if (signal.sellSignal) {
            signalType = "SELL";
        }

        // ==================================================
        // POSITION CHECK
        // ==================================================

        //const hasPosition =  await hasOpenPosition(symbol);
        const hasPosition = false;

        // ==================================================
        // BUY ORDER
        // ==================================================

        if (
            signal.buySignal &&
            lastSignals[symbol] !== "BUY" &&
            !hasPosition
        ) {

            lastSignals[symbol] = "BUY";

            const stopLoss =
                signal.fastCurrent *
                (
                    1 -
                    STOP_BUFFER_PERCENT / 100
                );

            const risk =
                signal.currentPrice -
                stopLoss;

            const takeProfit =
                signal.currentPrice +
                (
                    risk *
                    RISK_REWARD
                );

            // ==============================================
            // CREATE ORDER
            // ==============================================

            await createOrder(
                symbol,
                "buy",
                ORDER_SIZES[symbol]
            );

            // ==============================================
            // TELEGRAM
            // ==============================================

            await sendTelegramMessage(

`🚀 <b>BUY ORDER EXECUTED</b>

📈 Symbol: ${symbol}

💰 Entry: ${signal.currentPrice}

🛑 SL: ${stopLoss.toFixed(2)}

🎯 TP: ${takeProfit.toFixed(2)}

📊 RSI: ${signal.rsiCurrent.toFixed(2)}

🕒 TF: ${TIMEFRAME}`
            );
        }

        // ==================================================
        // SELL ORDER
        // ==================================================

        if (
            signal.sellSignal &&
            lastSignals[symbol] !== "SELL" &&
            !hasPosition
        ) {

            lastSignals[symbol] = "SELL";

            const stopLoss =
                signal.fastCurrent *
                (
                    1 +
                    STOP_BUFFER_PERCENT / 100
                );

            const risk =
                stopLoss -
                signal.currentPrice;

            const takeProfit =
                signal.currentPrice -
                (
                    risk *
                    RISK_REWARD
                );

            // ==============================================
            // CREATE ORDER
            // ==============================================

            await createOrder(
                symbol,
                "sell",
                ORDER_SIZES[symbol]
            );

            // ==============================================
            // TELEGRAM
            // ==============================================

            await sendTelegramMessage(

`🔻 <b>SELL ORDER EXECUTED</b>

📈 Symbol: ${symbol}

💰 Entry: ${signal.currentPrice}

🛑 SL: ${stopLoss.toFixed(2)}

🎯 TP: ${takeProfit.toFixed(2)}

📊 RSI: ${signal.rsiCurrent.toFixed(2)}

🕒 TF: ${TIMEFRAME}`
            );
        }

        // ==================================================
        // RESET SIGNAL
        // ==================================================

        if (
            !signal.buySignal &&
            !signal.sellSignal
        ) {

            lastSignals[symbol] = "";
        }

        // ==================================================
        // TABLE OUTPUT
        // ==================================================

        return {

            Symbol: symbol,

            Price:
                signal.currentPrice.toFixed(2),

            RSI:
                signal.rsiCurrent.toFixed(2),

            Signal:
                signalType,

            Position:
                hasPosition
                    ? "OPEN"
                    : "NONE"
        };

    } catch (err) {

        return {

            Symbol: symbol,

            Price: "ERROR",

            RSI: "-",

            Signal: err.message,

            Position: "-"
        };
    }
}

// ======================================================
// MAIN LOOP
// ======================================================

async function run() {

    const tableData = [];

    for (const symbol of SYMBOLS) {

        const data =
            await processSymbol(symbol);

        tableData.push(data);
    }

    console.clear();

    // console.log(
    //     "\nMULTI-ASSET SCALPING BOT\n"
    // );

    //console.table(tableData);

    // console.log(
    //     `Last Update: ${
    //         new Date().toLocaleString()
    //     }`
    // );
}

// ======================================================
// START BOT
// ======================================================

(async () => {

    console.log(
        "STARTING BOT..."
    );

    await sendTelegramMessage(

`🟢 SCALPING BOT STARTED

📈 Assets:
${SYMBOLS.join(", ")}

🕒 TF:
${TIMEFRAME}`
    );
 
})();

module.exports = { run };