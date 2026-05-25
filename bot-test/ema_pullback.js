require("dotenv").config();

const ccxt = require("ccxt");
const ti = require("technicalindicators");
const axios = require("axios");
const crypto = require("crypto");

// ======================================================
// ENV
// ======================================================

const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;

// ======================================================
// TELEGRAM
// ======================================================

const TELEGRAM_BOT = process.env.TELEGRAM_EMA_PULLBACK_TOKEN;
const CHAT_ID = process.env.TELEGRAM_EMA_PULLBACK_CHAT_ID;

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
    //"PAXGUSD"
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
    ETHUSD: 1,
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
        //console.log('positions : ',positions)
        const position =
            positions.find(
                p =>
                    p.info.product_symbol === symbol &&
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

        const hasPosition =  await hasOpenPosition(symbol);
        //console.log('hasPosition : ', hasPosition)
        //const hasPosition = false;

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

            await createOrder("buy",symbol,signal.currentPrice,stopLoss.toFixed(2),takeProfit.toFixed(2),ORDER_SIZES[symbol]);

            // ==============================================
            // TELEGRAM
            // ==============================================

//             await sendTelegramMessage(

// `🚀 <b>BUY ORDER EXECUTED</b>

// 📈 Symbol: ${symbol}

// 💰 Entry: ${signal.currentPrice}

// 🛑 SL: ${stopLoss.toFixed(2)}

// 🎯 TP: ${takeProfit.toFixed(2)}

// 📊 RSI: ${signal.rsiCurrent.toFixed(2)}

// 🕒 TF: ${TIMEFRAME}`
//             );
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

            await createOrder("sell",symbol,signal.currentPrice,stopLoss.toFixed(2),takeProfit.toFixed(2),ORDER_SIZES[symbol])

            // ==============================================
            // TELEGRAM
            // ==============================================

//             await sendTelegramMessage(

// `🔻 <b>SELL ORDER EXECUTED</b>

// 📈 Symbol: ${symbol}

// 💰 Entry: ${signal.currentPrice}

// 🛑 SL: ${stopLoss.toFixed(2)}

// 🎯 TP: ${takeProfit.toFixed(2)}

// 📊 RSI: ${signal.rsiCurrent.toFixed(2)}

// 🕒 TF: ${TIMEFRAME}`
//             );


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

    // console.log(
    //     "\nMULTI-ASSET SCALPING BOT\n"
    // );

    console.table(tableData);

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


async function generateEncryptSignature(payload) {
    return crypto.createHmac("sha256", API_SECRET).update(payload).digest("hex");
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

async function createOrder(signal,symbol,price,sl,tp2,qty=1){
    try {
        //await orderTelegramAlert(true,symbol,signal,price,qty,sl,tp2,"Test",'Test');
        //return true
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
        console.log('bodyParams :',bodyParams)
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

async function orderTelegramAlert(status,symbol,side,entry,qty,sl,tp2,orderId,error = ""){
    if (status) {

        await sendTelegramMessage(`
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

        await sendTelegramMessage(`
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


module.exports = { run };