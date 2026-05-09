///======================== UPDATED CODE V:2 =========================================

// require("dotenv").config();
// const axios = require("axios");
// const ccxt = require("ccxt");
// const ti = require("technicalindicators"); 
// const crypto = require('crypto');

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

// // MULTI SYMBOL
// const SYMBOLS = ["BTCUSD", "ETHUSD", "SOLUSD", "SLVONUSD"];

// const TIMEFRAME = "15m";
// const LIMIT = 300;

// // SETTINGS
// const slopeLookback = 5;
// const slopeThreshold = 0.001;
// const atrMultiplier = 1.5;

// // STATE (per symbol)
// let lastSignal = {};

// async function run() {
//     for (let SYMBOL of SYMBOLS) {
//         try {
//             const ohlcv = await exchange.fetchOHLCV(SYMBOL, TIMEFRAME, undefined, LIMIT);

//             const closes = ohlcv.map(c => c[4]);
//             const highs  = ohlcv.map(c => c[2]);
//             const lows   = ohlcv.map(c => c[3]);

//             const ema9   = ti.EMA.calculate({ period: 9, values: closes });
//             const ema21  = ti.EMA.calculate({ period: 21, values: closes });
//             const ema200 = ti.EMA.calculate({ period: 200, values: closes });

//             const atr = ti.ATR.calculate({
//                 high: highs,
//                 low: lows,
//                 close: closes,
//                 period: 14
//             });

//             const i = closes.length - 1;

//             const price = closes[i];
//             const e9 = ema9[ema9.length - 1];
//             const e21 = ema21[ema21.length - 1];
//             const e200 = ema200[ema200.length - 1];
//             const atrVal = atr[atr.length - 1];

//             // INIT STATE
//             if (!lastSignal[SYMBOL]) lastSignal[SYMBOL] = 0;

//             // SLOPE
//             const emaPrev = ema9[ema9.length - 1 - slopeLookback];
//             const slope = (e9 - emaPrev) / emaPrev;

//             // TREND
//             const upTrend = e9 > e21 && e21 > e200;
//             const downTrend = e9 < e21 && e21 < e200;

//             // PULLBACK
//             const pullbackBuy = price <= e9 * 1.002;
//             const pullbackSell = price >= e9 * 0.998;

//             // SIGNALS
//             const buySignal =
//                 upTrend &&
//                 pullbackBuy &&
//                 slope > slopeThreshold &&
//                 price > e9 &&
//                 lastSignal[SYMBOL] !== 1;

//             const sellSignal =
//                 downTrend &&
//                 pullbackSell &&
//                 slope < -slopeThreshold &&
//                 price < e9 &&
//                 lastSignal[SYMBOL] !== -1;

//             if (buySignal) {
//                 lastSignal[SYMBOL] = 1;

//                 const sl = price - atrVal * atrMultiplier;
//                 const tp1 = price + atrVal * 1.5;
//                 const tp2 = price + atrVal * 2.5;

//                 await createOrder("buy",SYMBOL,price.toFixed(2),sl.toFixed(2),tp2.toFixed(2),1)

// // await sendTelegram(`🚀 *EMA PULLBACK SIGNAL*

// // 🟢 *BUY ${SYMBOL}*

// // 💰 *Entry:* ${price.toFixed(2)}

// // 🛑 *Stop Loss:* ${sl.toFixed(2)}

// // 🎯 *Take Profit Targets:*
// // • TP1: ${tp1.toFixed(2)}
// // • TP2: ${tp2.toFixed(2)}

// // ━━━━━━━━━━━━━━━
// // 🕒 ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
// // `);
//             }

//             if (sellSignal) {
//                 lastSignal[SYMBOL] = -1;

//                 const sl = price + atrVal * atrMultiplier;
//                 const tp1 = price - atrVal * 1.5;
//                 const tp2 = price - atrVal * 2.5;

//                 await createOrder('sell',SYMBOL,price?.toFixed(2),sl?.toFixed(2),tp2?.toFixed(2),1)

// // await sendTelegram(`🚀 *EMA PULLBACK SIGNAL*

// // 🔴 *SELL ${SYMBOL}*

// // 💰 *Entry:* ${price.toFixed(2)}

// // 🛑 *Stop Loss:* ${sl.toFixed(2)}

// // 🎯 *Take Profit Targets:*
// // • TP1: ${tp1.toFixed(2)}
// // • TP2: ${tp2.toFixed(2)}

// // ━━━━━━━━━━━━━━━
// // 🕒 ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`);

//             }

//         } catch (err) {
//             console.error(`Error in ${SYMBOL}:`, err);
//         }
//     }
// }

// // LOOP
// //setInterval(run, 10 * 1000);

// module.exports = { run };


// // TELEGRAM
// const TOKEN = process.env.TELEGRAM_EMA_PULLBACK_TOKEN;
// const CHAT_ID = process.env.TELEGRAM_EMA_PULLBACK_CHAT_ID;

// async function sendTelegram(message) {
//     try {
//         await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
//             chat_id: CHAT_ID,
//             text: message,
//             parse_mode: "Markdown"
//         });
//     } catch (err) {
//         console.error("Telegram Error:", err.message);
//     }
// }

// // CREATE ORDER ------>
// async function generateEncryptSignature(payload) {
//     return crypto.createHmac("sha256", API_SECRET).update(payload).digest("hex");
// }

// async function getCurrentPriceOfCoin(symbol) {
//     try {
//       const response = await axios.get(`https://api.india.delta.exchange/v2/tickers?contract_type=perpetual_futures`);
//       const data = response.data.result.find(t => t.symbol === symbol);
//       return { data, status: true };
//     } catch (error) {
//       return { message: error.message, status: false };
//     }
// }

// async function createOrder(signal,symbol,price,sl,tp2,qty) {
//     try {  
//         //console.log('qty : ',qty)
//         const timestamp = Math.floor(Date.now() / 1000);
//         //const trail_amount = (bidType == 'buy')?'-300':'300'
//         const take_profit_amount = tp2
//         const stop_loss_amount = sl 
//         const coin_data = await getCurrentPriceOfCoin(symbol)
//         const product_id = coin_data?.data?.product_id
//         //console.log(product_id)
    
//         const bodyParams = {
//         product_id: product_id,
//         product_symbol: symbol,
//         size: qty,
//         side: signal,
//         order_type: "market_order",
//         //trail_amount:trail_amount,
//         //bracket_trail_amount:trail_amount,
//         bracket_take_profit_limit_price: take_profit_amount,
//         bracket_take_profit_price: take_profit_amount,
//         bracket_stop_loss_limit_price: stop_loss_amount,
//         bracket_stop_loss_price: stop_loss_amount,
//       };
//       //console.log(bodyParams)
//       const signaturePayload = `POST${timestamp}/v2/orders${JSON.stringify(bodyParams)}`;
//       const signature = await generateEncryptSignature(signaturePayload);
//       const headers = {
//         "api-key": API_KEY,
//         "signature": signature,
//         "timestamp": timestamp,
//         "Content-Type": "application/json",
//         "Accept": "application/json",
//       };

//       const res = await axios.post(`https://api.india.delta.exchange/v2/orders`, bodyParams, { headers });
//       if (res.data.success) { 
//         orderTelegramAlert(true,symbol,signal,price,qty,sl,tp2,product_id,res.data)
//         return true
//       }
//       orderTelegramAlert(false,symbol,signal,price,qty,sl,tp2,product_id,res.data)
//     } catch (error) {
//         console.log("Error : ",error.response?.data)
//         orderTelegramAlert(false,symbol,signal,price,qty,sl,tp2,0,error)
//     }
// }

// async function orderTelegramAlert(status,symbol,side,entry,qty,sl,tp2,orderId,error=''){
//     if(status){
//         await sendTelegram(`
// ✅ *ORDER EXECUTED*

// 📊 *Symbol:* ${symbol}
// 📈 *Side:* ${side}

// 💰 *Entry Price:* ${entry}
// 📦 *Quantity:* ${qty}

// 🛑 *Stop Loss:* ${sl}

// 🎯 *Targets:* 
// • TP: ${tp2}

// ━━━━━━━━━━━━━━━
// ⚙️ *Strategy:* EMA Pullback
// 🆔 *Order ID:* ${orderId} 

// 🆔 *Order Data:* ${JSON.stringify(error)}

// 🕒 ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
// `);
//     }else{
//         await sendTelegram(`
// ❌ *ORDER FAILED*

// 📊 *Symbol:* ${symbol}
// 📈 *Side:* ${side}

// ⚠️ *Reason:* ${error?.message}

// ━━━━━━━━━━━━━━━
// 🕒 ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
// `);
//     }
// }

///======================== UPDATED CODE V:3 =========================================

require("dotenv").config();

const axios = require("axios");
const ccxt = require("ccxt");
const ti = require("technicalindicators");
const crypto = require("crypto");
const API_KEY     =   process.env.TEST_API_KEY
const API_SECRET  =   process.env.TEST_API_SECRET


const exchange = new ccxt.delta({
    apiKey: API_KEY,
    secret: API_SECRET,
    enableRateLimit: true,
    urls: {
        // api: {
        //     public: "https://api.india.delta.exchange",
        //     private: "https://api.india.delta.exchange",
        // }
        api: {
            public: "https://cdn-ind.testnet.deltaex.org",
            private: "https://cdn-ind.testnet.deltaex.org",
        }
    }
});

// ======================
// SETTINGS
// ======================

const SYMBOLS = [
    "BTCUSD",
    "ETHUSD",
    "SOLUSD",
    "PAXGUSD",
    "ONDOUSD",
    "XRPUSD",
    "ADAUSD",
    "DOGEUSD",
    "1000SHIBUSD",
    "ADAUSD",
    "NVDAXUSD"
];
//const SYMBOLS = ["BTCUSD", "ETHUSD", "SOLUSD", "SLVONUSD"];

const TIMEFRAME = "15m";
const LIMIT = 300;

const slopeLookback = 5;
const slopeThreshold = 0.0025;
const atrMultiplier = 1.5;

// ======================
// STATE
// ======================

let lastSignal = {};
let activePositions = {};

// ======================
// TELEGRAM
// ======================

const TOKEN = process.env.TELEGRAM_EMA_PULLBACK_TOKEN;
const CHAT_ID = process.env.TELEGRAM_EMA_PULLBACK_CHAT_ID;

async function sendTelegram(message) {
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

// ======================
// HELPERS
// ======================

function roundToTick(price, tickSize = 0.5) {
    return Math.round(price / tickSize) * tickSize;
}

async function generateEncryptSignature(payload) {
    return crypto
        .createHmac("sha256", API_SECRET)
        .update(payload)
        .digest("hex");
}

// ======================
// UPDATE POSITIONS
// ======================

async function updateActivePositions() {
    try {

        // reset all symbols
        SYMBOLS.forEach(symbol => {
            activePositions[symbol] = false;
        });

        // OPEN POSITIONS
        const positions = await exchange.fetchPositions();

        positions.forEach(pos => {

            const contracts = parseFloat(pos.contracts || 0);

            if (contracts > 0) {

                const matched = SYMBOLS.find(s =>
                    s.includes(pos.symbol.replace("_PERP", ""))
                );

                if (matched) {
                    activePositions[matched] = true;
                }
            }
        });

        // OPEN ORDERS
        const openOrders = await exchange.fetchOpenOrders();

        openOrders.forEach(order => {

            const matched = SYMBOLS.find(s =>
                s.includes(order.symbol.replace("_PERP", ""))
            );

            if (matched) {
                activePositions[matched] = true;
            }
        });

    } catch (err) {
        console.log("Position Update Error:", err.message);
    }
}

// ======================
// MAIN STRATEGY
// ======================

async function run() {

    await updateActivePositions();

    for (let SYMBOL of SYMBOLS) {

        try {

            // ======================
            // BLOCK SAME SYMBOL
            // ======================

            if (activePositions[SYMBOL]) {

                console.log(
                    `⚠️ ${SYMBOL} already has active trade/order`
                );

                continue;
            }

            const ohlcv = await exchange.fetchOHLCV(
                SYMBOL,
                TIMEFRAME,
                undefined,
                LIMIT
            );

            const closes = ohlcv.map(c => c[4]);
            const highs = ohlcv.map(c => c[2]);
            const lows = ohlcv.map(c => c[3]);
            const opens = ohlcv.map(c => c[1]);
            const volumes = ohlcv.map(c => c[5]);

            // ======================
            // INDICATORS
            // ======================

            const ema9 = ti.EMA.calculate({
                period: 9,
                values: closes
            });

            const ema21 = ti.EMA.calculate({
                period: 21,
                values: closes
            });

            const ema200 = ti.EMA.calculate({
                period: 200,
                values: closes
            });

            const atr = ti.ATR.calculate({
                high: highs,
                low: lows,
                close: closes,
                period: 14
            });

            const adx = ti.ADX.calculate({
                high: highs,
                low: lows,
                close: closes,
                period: 14
            });

            const volumeEma = ti.EMA.calculate({
                period: 20,
                values: volumes
            });

            // ======================
            // CLOSED CANDLE ONLY
            // ======================

            const lastClosed = closes.length - 2;

            const price = closes[lastClosed];

            const e9 = ema9[ema9.length - 2];
            const e21 = ema21[ema21.length - 2];
            const e200 = ema200[ema200.length - 2];

            const atrVal = atr[atr.length - 2];

            const adxVal = adx[adx.length - 2]?.adx || 0;

            const currentVolume = volumes[lastClosed];
            const avgVolume = volumeEma[volumeEma.length - 2];

            if (!lastSignal[SYMBOL]) {
                lastSignal[SYMBOL] = 0;
            }

            // ======================
            // SLOPE
            // ======================

            const emaPrev =
                ema9[ema9.length - 2 - slopeLookback];

            const slope = (e9 - emaPrev) / emaPrev;

            // ======================
            // TREND
            // ======================

            const upTrend =
                e9 > e21 &&
                e21 > e200;

            const downTrend =
                e9 < e21 &&
                e21 < e200;

            const strongTrend = adxVal > 20;

            // ======================
            // PULLBACK
            // ======================

            const pullbackBuy =
                price > e9 &&
                Math.abs(price - e9) <= atrVal * 0.3;

            const pullbackSell =
                price < e9 &&
                Math.abs(price - e9) <= atrVal * 0.3;

            // ======================
            // VOLUME
            // ======================

            const highVolume =
                currentVolume > avgVolume;

            // ======================
            // CANDLE STRUCTURE
            // ======================

            const bullishCandle =
                closes[lastClosed] > opens[lastClosed];

            const bearishCandle =
                closes[lastClosed] < opens[lastClosed];

            // ======================
            // SIGNALS
            // ======================

            const buySignal =
                upTrend &&
                strongTrend &&
                highVolume &&
                bullishCandle &&
                pullbackBuy &&
                slope > slopeThreshold &&
                lastSignal[SYMBOL] !== 1;

            const sellSignal =
                downTrend &&
                strongTrend &&
                highVolume &&
                bearishCandle &&
                pullbackSell &&
                slope < -slopeThreshold &&
                lastSignal[SYMBOL] !== -1;
 
            // ======================
            // BUY
            // ======================

            if (buySignal) {

                console.log(`🟢 BUY SIGNAL -> ${SYMBOL}`);

                lastSignal[SYMBOL] = 1;

                const sl = roundToTick(
                    price - atrVal * atrMultiplier
                );

                const tp2 = roundToTick(
                    price + atrVal * 2.5
                );

                await createOrder(
                    "buy",
                    SYMBOL,
                    price.toFixed(2),
                    sl.toFixed(2),
                    tp2.toFixed(2),
                    1
                );
            }

            // ======================
            // SELL
            // ======================

            else if (sellSignal) {

                console.log(`🔴 SELL SIGNAL -> ${SYMBOL}`);

                lastSignal[SYMBOL] = -1;

                const sl = roundToTick(
                    price + atrVal * atrMultiplier
                );

                const tp2 = roundToTick(
                    price - atrVal * 2.5
                );

                await createOrder(
                    "sell",
                    SYMBOL,
                    price.toFixed(2),
                    sl.toFixed(2),
                    tp2.toFixed(2),
                    1
                );
            }

            // ======================
            // NO SIGNAL
            // ======================

            else {

                // console.log(
                //     `⚪ NO SIGNAL -> ${SYMBOL} | ` +
                //     `Price: ${price.toFixed(2)} | ` +
                //     `Slope: ${slope.toFixed(4)} | ` +
                //     `ADX: ${adxVal.toFixed(2)}`
                // );
            }

        } catch (err) {

            console.log(`❌ Error in ${SYMBOL}`);

            console.log(err.message);
        }
    }
}

async function getCurrentPriceOfCoin(symbol) {
    try {
      const response = await axios.get(`https://api.india.delta.exchange/v2/tickers?contract_type=perpetual_futures`);
      const data = response.data.result.find(t => t.symbol === symbol);
      return { data, status: true };
    } catch (error) {
      return { message: error.message, status: false };
    }
}

// ======================
// CREATE ORDER
// ======================

async function createOrder(
    signal,
    symbol,
    price,
    sl,
    tp2,
    qty
) {

    try {
        await orderTelegramAlert(true,symbol,signal,price,qty,sl,tp2,"Test",'Test');
        return true
        const coin_data = await getCurrentPriceOfCoin(symbol)
        const product_id = coin_data?.data?.product_id

        const timestamp = Math.floor(Date.now() / 1000);

        const bodyParams = {
            product_id,
            product_symbol: symbol,
            size: qty,
            side: signal,
            order_type: "market_order",

            bracket_take_profit_limit_price: tp2,
            bracket_take_profit_price: tp2,

            bracket_stop_loss_limit_price: sl,
            bracket_stop_loss_price: sl,
        };

        const signaturePayload =
            `POST${timestamp}/v2/orders${JSON.stringify(bodyParams)}`;

        const signature =
            await generateEncryptSignature(signaturePayload);

        const headers = {
            "api-key": API_KEY,
            "signature": signature,
            "timestamp": timestamp,
            "Content-Type": "application/json",
            "Accept": "application/json",
        };

        const res = await axios.post(
            `https://api.india.delta.exchange/v2/orders`,
            bodyParams,
            { headers }
        );

        if (res.data.success) {

            // LOCK SYMBOL
            activePositions[symbol] = true;

            console.log(`✅ ORDER EXECUTED ${symbol}`);

            await orderTelegramAlert(
                true,
                symbol,
                signal,
                price,
                qty,
                sl,
                tp2,
                res.data.result?.id || "N/A",
                res.data
            );

            return true;
        }

        await orderTelegramAlert(
            false,
            symbol,
            signal,
            price,
            qty,
            sl,
            tp2,
            "N/A",
            res.data
        );

    } catch (error) {

        console.log(
            "Order Error:",
            error.response?.data || error.message
        );

        await orderTelegramAlert(
            false,
            symbol,
            signal,
            price,
            qty,
            sl,
            tp2,
            "N/A",
            error.response?.data || error.message
        );
    }
}

// ======================
// TELEGRAM ALERT
// ======================

async function orderTelegramAlert(
    status,
    symbol,
    side,
    entry,
    qty,
    sl,
    tp2,
    orderId,
    error = ""
) {

    if (status) {

        await sendTelegram(`
✅ *ORDER EXECUTED*

📊 Symbol: ${symbol}
📈 Side: ${side}

💰 Entry: ${entry}

📦 Qty: ${qty}

🛑 SL: ${sl}

🎯 TP: ${tp2}

━━━━━━━━━━━━━━━
⚙️ Strategy: EMA Pullback

🆔 Order ID:
${orderId}

🕒 ${new Date().toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata"
        })}
`);
    } else {

        await sendTelegram(`
❌ *ORDER FAILED*

📊 Symbol: ${symbol}

📈 Side: ${side}

⚠️ Error:
${JSON.stringify(error)}

━━━━━━━━━━━━━━━

🕒 ${new Date().toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata"
        })}
`);
    }
}

// ======================
// LOOP
// ======================

// setInterval(async () => {

//     await run();

// }, 60 * 1000);

// ======================
// EXPORT
// ======================

module.exports = { run };
 