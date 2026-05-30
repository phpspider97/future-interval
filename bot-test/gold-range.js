require("dotenv").config();

const ccxt = require("ccxt");
const axios = require("axios");
const crypto = require("crypto");

// ======================================================
// ENV
// ======================================================

const API_KEY = process.env.G_GRID_WEB_KEY;
const API_SECRET = process.env.G_GRID_WEB_SECRET;

const TELEGRAM_BOT =
    process.env.TELEGRAM_EMA_PULLBACK_TOKEN;

const CHAT_ID =
    process.env.TELEGRAM_EMA_PULLBACK_CHAT_ID;

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
        console.log("Telegram Error:", err.message);
    }
}

// ======================================================
// ERROR ALERT
// ======================================================

async function sendErrorAlert(error, context) {

    await sendTelegramMessage(`
🚨 <b>BOT ERROR</b>

📍 Context: ${context}

⚠️ ${error?.message || error}

🕒 ${new Date().toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata"
    })}
`);
}

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
// SETTINGS
// ======================================================

const SYMBOL = "PAXGUSD";

const RANGE_POINTS = 5;
const CLOSE_POINTS = 15;

const BASE_LOT = 1;
const MARTINGALE_MULTIPLIER = 2;
const MAX_TRADE_LENGTH  =   5;

// ======================================================
// STATE
// ======================================================

let basePrice = null;

let activeTrade = null;

let tradeHistory = [];

let nextExpectedSide = null;

let currentLot = BASE_LOT;

let lastSignal = null;

let isProcessingOrder = false;

let maxTradeReached = false;

let maxTradeAlertSent = false;

// ======================================================
// PRICE
// ======================================================

async function getPrice() {

    const ticker =
        await exchange.fetchTicker(SYMBOL);

    return Math.round(ticker.last);
}

// ======================================================
// INIT
// ======================================================

async function initialize() {

    basePrice = await getPrice();

    activeTrade = null;
    tradeHistory = [];
    nextExpectedSide = null;
    currentLot = BASE_LOT;
    lastSignal = null;

    maxTradeReached = false;
    maxTradeAlertSent = false;

    console.log("\nNEW SESSION STARTED");
    console.log("BASE:", basePrice);

    await sendTelegramMessage(`
🚀 <b>NEW SESSION STARTED</b>

📊 ${SYMBOL}
💰 Base: ${basePrice}

📈 Upper: ${basePrice + RANGE_POINTS}
📉 Lower: ${basePrice - RANGE_POINTS}

🎯 TP Up: ${basePrice + CLOSE_POINTS}
🎯 TP Down: ${basePrice - CLOSE_POINTS}

📦 Base Lot: ${BASE_LOT}
🧠 Max Trades: 5
`);
}

// ======================================================
// EXECUTE ORDER (FIXED - NO WRONG LOT CHANGE)
// ======================================================

async function executeTrade(side, lot) {

    try {

        let updated_lot = 1
        if(lot != 1){
            updated_lot = lot + (lot/2)
        }

        const order =
            await exchange.createMarketOrder(
                SYMBOL,
                side,
                updated_lot
            );

        await sendTelegramMessage(`
✅ <b>ORDER EXECUTED</b>

📊 ${SYMBOL}
📈 ${side.toUpperCase()}
📦 Lot: ${lot}
📦 Update Lot: ${updated_lot}
`);

        return order;

    } catch (err) {

        await sendErrorAlert(err, "executeTrade");

        return null;
    }
}

// ======================================================
// OPEN TRADE (FIXED LOT SNAPSHOT + ALERT FIX)
// ======================================================

async function openTrade(side, price) {

    if (isProcessingOrder) return;

    isProcessingOrder = true;

    try {

        const tradeLot = currentLot;

        const order =
            await executeTrade(side, tradeLot);

        if (!order) return;

        activeTrade = {
            side,
            entry: price,
            lot: tradeLot
        };

        tradeHistory.push({
            time: new Date().toLocaleTimeString(),
            side,
            entry: price,
            lot: tradeLot
        });

        console.table([{
            SIDE: side,
            ENTRY: price,
            LOT: tradeLot
        }]);

        nextExpectedSide =
            side === "buy" ? "sell" : "buy";

        lastSignal = side;

        // MARTINGALE
        currentLot *= MARTINGALE_MULTIPLIER;

        // MAX TRADE CHECK
        if (tradeHistory.length >= MAX_TRADE_LENGTH) {

            maxTradeReached = true;

            if (!maxTradeAlertSent) {

                maxTradeAlertSent = true;

                await sendTelegramMessage(`
⚠️ <b>MAX TRADE REACHED</b>

📊 ${SYMBOL}
📦 Trades: ${tradeHistory.length}
💰 Price: ${price}

🚫 Martingale STOPPED
`);
            }
        }

    } catch (err) {

        await sendErrorAlert(err, "openTrade");

    } finally {

        setTimeout(() => {
            isProcessingOrder = false;
        }, 1500);
    }
}

// ======================================================
// CLOSE ALL
// ======================================================

async function closeAll(price) {

    try {

        for (const t of tradeHistory) {

            const closeSide =
                t.side === "buy" ? "sell" : "buy";

            await exchange.createMarketOrder(
                SYMBOL,
                closeSide,
                t.lot
            );
        }

        await sendTelegramMessage(`
🔄 <b>SESSION CLOSED</b>

📊 ${SYMBOL}
📦 Trades: ${tradeHistory.length}
💰 Exit: ${price}
`);

        await initialize();

    } catch (err) {

        await sendErrorAlert(err, "closeAll");
    }
}

// ======================================================
// BOT LOOP
// ======================================================

async function run() {

    try {

        if (!basePrice) await initialize();

        const price = await getPrice();

        const upperBreak = basePrice + RANGE_POINTS;
        const lowerBreak = basePrice - RANGE_POINTS;

        const upperClose = basePrice + CLOSE_POINTS;
        const lowerClose = basePrice - CLOSE_POINTS;

        console.clear();

        console.table([{
            PRICE: price,
            BASE: basePrice,
            TRADES: tradeHistory.length,
            LOT: currentLot,
            MAX: maxTradeReached ? "YES" : "NO"
        }]);

        // MAX LIMIT
        if (maxTradeReached) {

            if (
                price >= upperClose ||
                price <= lowerClose
            ) {
                await closeAll(price);
            }

            return;
        }

        // ENTRY
        if (!activeTrade) {

            if (price >= upperBreak) {
                await openTrade("buy", price);
            }

            else if (price <= lowerBreak) {
                await openTrade("sell", price);
            }
        }

        // FLIP
        else {

            if (
                nextExpectedSide === "sell" &&
                price <= lowerBreak
            ) {
                await openTrade("sell", price);
            }

            else if (
                nextExpectedSide === "buy" &&
                price >= upperBreak
            ) {
                await openTrade("buy", price);
            }
        }

        // CLOSE
        if (
            price >= upperClose ||
            price <= lowerClose
        ) {
            await closeAll(price);
        }

    } catch (err) {

        await sendErrorAlert(err, "run");
    }
}

// ======================================================
// START
// ======================================================

//run();

//setInterval(run, 1000);
module.exports = { run };

//10, 20, 40, 80, 160, 320



// function calculateNewBuyPrice() {

//     // =========================
//     // INPUT VALUES (EDIT HERE)
//     // =========================

//     const qty1 = 3200;       // existing quantity
//     const price1 = 4621;     // existing entry price

//     const qty2 = 900;        // new quantity to buy
//     const targetAvg = 4566;  // desired average price

//     // =========================
//     // FORMULA
//     // avg = (q1*p1 + q2*p2) / (q1+q2)
//     // =========================

//     const totalQty = qty1 + qty2;

//     const requiredTotalValue = targetAvg * totalQty;

//     const currentValue = qty1 * price1;

//     const price2 = (requiredTotalValue - currentValue) / qty2;

//     // =========================
//     // OUTPUT
//     // =========================

//     console.log("\n📊 DCA CALCULATION RESULT");
//     console.log("============================");

//     console.log("Existing Qty:", qty1);
//     console.log("Existing Price:", price1);
//     console.log("New Qty:", qty2);
//     console.log("Target Avg:", targetAvg);

//     console.log("----------------------------");

//     console.log("👉 Buy Price Needed:", price2.toFixed(2));

//     console.log("Total Qty After Buy:", totalQty);
// }

// calculateNewBuyPrice();