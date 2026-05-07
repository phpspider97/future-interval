// require("dotenv").config();
// const axios = require("axios");
// const ccxt = require("ccxt");
// const ti = require("technicalindicators"); 

// const exchange = new ccxt.binance({
//     enableRateLimit: true
// });

// const SYMBOL = "BTC/USDT";
// const TIMEFRAME = "15m";
// const LIMIT = 300;

// // SETTINGS
// const slopeLookback = 5;
// const slopeThreshold = 0.001; // 0.1%
// const atrMultiplier = 1.5;

// // STATE
// let lastSignal = 0; // 1 = BUY, -1 = SELL

// async function run() {
//     const ohlcv = await exchange.fetchOHLCV(SYMBOL, TIMEFRAME, undefined, LIMIT);
   
//     const closes = ohlcv.map(c => c[4]);
//     const highs  = ohlcv.map(c => c[2]);
//     const lows   = ohlcv.map(c => c[3]);

//     // INDICATORS
//     const ema9   = ti.EMA.calculate({ period: 9, values: closes });
//     const ema21  = ti.EMA.calculate({ period: 21, values: closes });
//     const ema200 = ti.EMA.calculate({ period: 200, values: closes });

//     const atr = ti.ATR.calculate({
//         high: highs,
//         low: lows,
//         close: closes,
//         period: 14
//     });

//     const i = closes.length - 1;

//     const price = closes[i];
//     const e9 = ema9[ema9.length - 1];
//     const e21 = ema21[ema21.length - 1];
//     const e200 = ema200[ema200.length - 1];
//     const atrVal = atr[atr.length - 1];

//     // SLOPE
//     const emaPrev = ema9[ema9.length - 1 - slopeLookback];
//     const slope = (e9 - emaPrev) / emaPrev;

//     // TREND
//     const upTrend = e9 > e21 && e21 > e200;
//     const downTrend = e9 < e21 && e21 < e200;

//     // PULLBACK
//     const pullbackBuy = price <= e9 * 1.002;
//     const pullbackSell = price >= e9 * 0.998;

//     // SIGNALS
//     const buySignal = upTrend && pullbackBuy && slope > slopeThreshold && price > e9 && lastSignal !== 1;
//     const sellSignal = downTrend && pullbackSell && slope < -slopeThreshold && price < e9 && lastSignal !== -1;
//     // console.table([
//     //     {
//     //         upTrend,
//     //         downTrend, 
//     //         slope,
//     //         slopeThreshold,
//     //         price,
//     //         e9,
//     //         lastSignal,
//     //     }
//     // ]);
//     if (buySignal) {
//         lastSignal = 1;

//         const sl = price - atrVal * atrMultiplier;
//         const tp1 = price + atrVal * 3;
//         const tp2 = price + atrVal * 5;

//         //console.log("🟢 BUY SIGNAL");
//         // sendTelegram(`🟢 EMA PULL BACK BOT : BUY BTC
//         // Price: ${price}
//         // SL: ${sl}
//         // TP1: ${tp1}
//         // TP2: ${tp2}`);
//         sendTelegram(`
//         🚀 *EMA PULLBACK SIGNAL*

//         🟢 *BUY BTC*

//         💰 *Entry:* ${price}

//         🛑 *Stop Loss:* ${sl}

//         🎯 *Take Profit Targets:*
//         • TP1: ${tp1}
//         • TP2: ${tp2}

//         ━━━━━━━━━━━━━━━
//         📊 *Strategy:* EMA Pullback
        
//         🕒 *Time* : ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
//         `);
//         //console.log({ price, sl, tp1, tp2 });

//         // TODO: send to Telegram / webhook
//     }

//     if (sellSignal) {
//         lastSignal = -1;

//         const sl = price + atrVal * atrMultiplier;
//         const tp1 = price - atrVal * 3;
//         const tp2 = price - atrVal * 5;

//         // console.log("🔴 SELL SIGNAL");
//         // sendTelegram(`🔴 EMA PULL BACK BOT : SELL BTC
//         // Price: ${price}
//         // SL: ${sl}
//         // TP1: ${tp1}
//         // TP2: ${tp2}`);
//         sendTelegram(`
//         🚀 *EMA PULLBACK SIGNAL*

//         🔴 *SELL BTC*

//         💰 *Entry:* ${price}

//         🛑 *Stop Loss:* ${sl}

//         🎯 *Take Profit Targets:*
//         • TP1: ${tp1}
//         • TP2: ${tp2}

//         ━━━━━━━━━━━━━━━
//         📊 *Strategy:* EMA Pullback
        
//         🕒 *Time* : ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
//         `);
//         //console.log({ price, sl, tp1, tp2 });
//     }
// }

// // RUN LOOP
// //console.log("🤖 High Win Rate Delta Bot Running...");
// //setInterval(run, 60 * 1000); // every 1 min

// //intervalManager.start("Pull back bot", run, 60000);
// module.exports = { run };


// // TELEGRAM CODE
// const TOKEN = process.env.TELEGRAM_EMA_PULLBACK_TOKEN;
// const CHAT_ID = process.env.TELEGRAM_EMA_PULLBACK_CHAT_ID;

// async function sendTelegram(message) {
//     try { 
//         await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
//             chat_id: CHAT_ID,
//             text: message,
//             parse_mode: "HTML"
//         });
//     } catch (err) {
//         console.error("Telegram Error:", err.message);
//     }
// } 
 


///======================== UPDATED CODE V:2 =========================================

// require("dotenv").config();
// const axios = require("axios");
// const ccxt = require("ccxt");
// const ti = require("technicalindicators"); 
// const crypto = require('crypto');

// const exchange = new ccxt.delta({
//     apiKey: process.env.GRID_WEB_KEY,
//     secret: process.env.GRID_WEB_SECRET,
//     enableRateLimit: true,
//     urls: {
//         api: {
//             public: "https://api.india.delta.exchange",
//             private: "https://api.india.delta.exchange",
//         }
//     }
// });

// // MULTI SYMBOL
// const SYMBOLS = ["BTCUSD", "ETHUSD", "PAXGUSD", "SLVONUSD"];

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

// await sendTelegram(`🚀 *EMA PULLBACK SIGNAL*

// 🟢 *BUY ${SYMBOL}*

// 💰 *Entry:* ${price.toFixed(2)}

// 🛑 *Stop Loss:* ${sl.toFixed(2)}

// 🎯 *Take Profit Targets:*
// • TP1: ${tp1.toFixed(2)}
// • TP2: ${tp2.toFixed(2)}

// ━━━━━━━━━━━━━━━
// 🕒 ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
// `);
//             }

//             if (sellSignal) {
//                 lastSignal[SYMBOL] = -1;

//                 const sl = price + atrVal * atrMultiplier;
//                 const tp1 = price - atrVal * 1.5;
//                 const tp2 = price - atrVal * 2.5;

//                 await createOrder('sell',SYMBOL,price?.toFixed(2),sl?.toFixed(2),tp2?.toFixed(2),1)

// await sendTelegram(`🚀 *EMA PULLBACK SIGNAL*

// 🔴 *SELL ${SYMBOL}*

// 💰 *Entry:* ${price.toFixed(2)}

// 🛑 *Stop Loss:* ${sl.toFixed(2)}

// 🎯 *Take Profit Targets:*
// • TP1: ${tp1.toFixed(2)}
// • TP2: ${tp2.toFixed(2)}

// ━━━━━━━━━━━━━━━
// 🕒 ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`);

//             }

//         } catch (err) {
//             console.error(`Error in ${SYMBOL}:`, err);
//         }
//     }
// }

// // LOOP
// setInterval(run, 10 * 1000);

// //module.exports = { run };


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


require("dotenv").config();
const axios = require("axios");
const ccxt = require("ccxt");
const ti = require("technicalindicators"); 
const crypto = require('crypto');

const exchange = new ccxt.delta({
    apiKey: process.env.GRID_WEB_KEY,
    secret: process.env.GRID_WEB_SECRET,
    enableRateLimit: true,
    urls: {
        api: {
            public: "https://api.india.delta.exchange",
            private: "https://api.india.delta.exchange",
        }
    }
});

// SYMBOLS
const SYMBOLS = ["BTCUSD", "ETHUSD", "SLVONUSD"];


const LTF = "15m";
const HTF = "1h";
const LIMIT = 300;

// SETTINGS
const slopeLookback = 5;
const slopeThreshold = 0.001;
const atrMultiplier = 1.2;
const cooldownTime = 60 * 60 * 1000; // 1 hour

// STATE
let lastSignal = {};
let lastTradeTime = {};

async function run() {
    for (let SYMBOL of SYMBOLS) {
        try {
            // ===== FETCH DATA =====
            const ohlcv = await exchange.fetchOHLCV(SYMBOL, LTF, undefined, LIMIT);
            const htfData = await exchange.fetchOHLCV(SYMBOL, HTF, undefined, LIMIT);

            const closes = ohlcv.map(c => c[4]);
            const highs  = ohlcv.map(c => c[2]);
            const lows   = ohlcv.map(c => c[3]);
            const volumes = ohlcv.map(c => c[5]);

            const htfCloses = htfData.map(c => c[4]);

            const i = closes.length - 1;

            // ===== INDICATORS =====
            const ema9   = ti.EMA.calculate({ period: 9, values: closes });
            const ema21  = ti.EMA.calculate({ period: 21, values: closes });
            const ema200 = ti.EMA.calculate({ period: 200, values: closes });

            const htfEma200 = ti.EMA.calculate({ period: 200, values: htfCloses });

            const atr = ti.ATR.calculate({
                high: highs,
                low: lows,
                close: closes,
                period: 14
            });

            const price = closes[i];
            const e9 = ema9.at(-1);
            const e21 = ema21.at(-1);
            const e200 = ema200.at(-1);
            const atrVal = atr.at(-1);

            const htfPrice = htfCloses.at(-1);
            const htfE200 = htfEma200.at(-1);

            // ===== INIT STATE =====
            if (!lastSignal[SYMBOL]) lastSignal[SYMBOL] = 0;
            if (!lastTradeTime[SYMBOL]) lastTradeTime[SYMBOL] = 0;

            const canTrade = Date.now() - lastTradeTime[SYMBOL] > cooldownTime;

            // ===== TREND =====
            const upTrend = e9 > e21 && e21 > e200;
            const downTrend = e9 < e21 && e21 < e200;

            const htfUp = htfPrice > htfE200;
            const htfDown = htfPrice < htfE200;

            // ===== SLOPE =====
            const emaPrev = ema9[ema9.length - 1 - slopeLookback];
            const slope = (e9 - emaPrev) / emaPrev;

            // ===== TREND STRENGTH =====
            const trendStrength = Math.abs(e9 - e21) / e21;
            const strongTrend = trendStrength > 0.0015;

            // ===== VOLUME =====
            const avgVol = volumes.slice(-20).reduce((a,b)=>a+b)/20;
            const volumeSpike = volumes[i] > avgVol * 1.5;

            // ===== ATR FILTER =====
            const atrFilter = atrVal / price > 0.002;

            // ===== CANDLE REJECTION =====
            const prevClose = closes[i - 1];
            const prevOpen = ohlcv[i - 1][1];

            const bullishRejection =
                prevClose < e9 && price > e9 && prevClose > prevOpen;

            const bearishRejection =
                prevClose > e9 && price < e9 && prevClose < prevOpen;

            // ===== SESSION FILTER =====
            const hour = new Date().getUTCHours();
            const activeSession = hour >= 7 && hour <= 20;

            // ===== SIGNALS =====
            const buySignal =
                htfUp &&
                upTrend &&
                strongTrend &&
                bullishRejection &&
                slope > slopeThreshold &&
                volumeSpike &&
                atrFilter &&
                activeSession &&
                canTrade &&
                lastSignal[SYMBOL] !== 1;

            const sellSignal =
                htfDown &&
                downTrend &&
                strongTrend &&
                bearishRejection &&
                slope < -slopeThreshold &&
                volumeSpike &&
                atrFilter &&
                activeSession &&
                canTrade &&
                lastSignal[SYMBOL] !== -1;

            // ===== EXECUTION =====
            if (buySignal) {
                lastSignal[SYMBOL] = 1;
                lastTradeTime[SYMBOL] = Date.now();

                const sl = price - atrVal * atrMultiplier;
                const tp1 = price + atrVal * 1.5;
                const tp2 = price + atrVal * 2.5;

                //await createOrder('buy',SYMBOL,price?.toFixed(2),sl?.toFixed(2),tp2?.toFixed(2),1)

                await sendTelegram(`
🎯 *SNIPER TRADE*

🟢 *BUY ${SYMBOL}*

💰 Entry: ${price.toFixed(2)}
🛑 SL: ${sl.toFixed(2)}

🎯 Targets:
• TP1: ${tp1.toFixed(2)}
• TP2: ${tp2.toFixed(2)}

━━━━━━━━━━━━━━━
🧠 High Probability Setup
🕒 ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
`);
            }

            if (sellSignal) {
                lastSignal[SYMBOL] = -1;
                lastTradeTime[SYMBOL] = Date.now();

                const sl = price + atrVal * atrMultiplier;
                const tp1 = price - atrVal * 1.5;
                const tp2 = price - atrVal * 2.5;

                //await createOrder('sell',SYMBOL,price?.toFixed(2),sl?.toFixed(2),tp2?.toFixed(2),1)

                await sendTelegram(`
🎯 *SNIPER TRADE*

🔴 *SELL ${SYMBOL}*

💰 Entry: ${price.toFixed(2)}
🛑 SL: ${sl.toFixed(2)}

🎯 Targets:
• TP1: ${tp1.toFixed(2)}
• TP2: ${tp2.toFixed(2)}

━━━━━━━━━━━━━━━
🧠 High Probability Setup
🕒 ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
`);
            }
            //await sendTelegram('No Signal !!')
            //console.log('No Signal !!')
        } catch (err) {
            console.error(`Error in ${SYMBOL}:`, err.message);
        }
    }
}

// LOOP
//setInterval(run, 60 * 1000);
module.exports = { run };

// TELEGRAM
const TOKEN = process.env.TELEGRAM_EMA_PULLBACK_TOKEN;
const CHAT_ID = process.env.TELEGRAM_EMA_PULLBACK_CHAT_ID;

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

//======================== updated code V:3 ===============================
/// CREATE ORDER ------>
async function generateEncryptSignature(payload) {
    return crypto.createHmac("sha256", process.env.GRID_WEB_SECRET).update(payload).digest("hex");
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

async function createOrder(signal,symbol,price,sl,tp2,qty) {
    try {  
        //console.log('qty : ',qty)
        const timestamp = Math.floor(Date.now() / 1000);
        //const trail_amount = (bidType == 'buy')?'-300':'300'
        const take_profit_amount = tp2
        const stop_loss_amount = sl 
        const coin_data = await getCurrentPriceOfCoin(symbol)
        const product_id = coin_data?.data?.product_id
        //console.log(product_id)
    
        const bodyParams = {
        product_id: product_id,
        product_symbol: symbol,
        size: qty,
        side: signal,
        order_type: "market_order",
        //trail_amount:trail_amount,
        //bracket_trail_amount:trail_amount,
        bracket_take_profit_limit_price: take_profit_amount,
        bracket_take_profit_price: take_profit_amount,
        bracket_stop_loss_limit_price: stop_loss_amount,
        bracket_stop_loss_price: stop_loss_amount,
      };
      //console.log(bodyParams)
      const signaturePayload = `POST${timestamp}/v2/orders${JSON.stringify(bodyParams)}`;
      const signature = await generateEncryptSignature(signaturePayload);
      const headers = {
        "api-key": process.env.GRID_WEB_KEY,
        "signature": signature,
        "timestamp": timestamp,
        "Content-Type": "application/json",
        "Accept": "application/json",
      };

      const res = await axios.post(`https://api.india.delta.exchange/v2/orders`, bodyParams, { headers });
      if (res.data.success) { 
        orderTelegramAlert(true,symbol,signal,price,qty,sl,tp2,product_id,res.data)
      }
      orderTelegramAlert(false,symbol,signal,price,qty,sl,tp2,product_id)
    } catch (error) {
        console.log("Error : ",error.response?.data)
        orderTelegramAlert(false,symbol,signal,price,qty,sl,tp2,0,error)
    }
}

async function orderTelegramAlert(status,symbol,side,entry,qty,sl,tp2,orderId,error=''){
    if(status){
        await sendTelegram(`
✅ *ORDER EXECUTED*

📊 *Symbol:* ${symbol}
📈 *Side:* ${side}

💰 *Entry Price:* ${entry}
📦 *Quantity:* ${qty}

🛑 *Stop Loss:* ${sl}

🎯 *Targets:* 
• TP: ${tp2}

━━━━━━━━━━━━━━━
⚙️ *Strategy:* EMA Pullback
🆔 *Order ID:* ${orderId} 

🆔 *Order Data:* ${JSON.stringify(error)}

🕒 ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
`);
    }else{
        await sendTelegram(`
❌ *ORDER FAILED*

📊 *Symbol:* ${symbol}
📈 *Side:* ${side}

⚠️ *Reason:* ${error?.message}

━━━━━━━━━━━━━━━
🕒 ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
`);
    }
}