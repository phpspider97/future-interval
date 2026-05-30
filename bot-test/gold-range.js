require("dotenv").config();

const ccxt = require("ccxt");
const axios = require("axios");
const crypto = require("crypto");

// ======================================================
// ENV
// ======================================================

const API_KEY = process.env.G_GRID_WEB_KEY;
const API_SECRET = process.env.G_GRID_WEB_SECRET;
const API_URL = process.env.API_URL;

// const API_KEY = process.env.TEST_API_KEY;
// const API_SECRET = process.env.TEST_API_SECRET;
// const API_URL = process.env.TEST_API_URL;

// ======================================================
// SETTINGS
// ======================================================

const SYMBOL = "PAXGUSD";

const RANGE_POINTS = 3;
const CLOSE_POINTS = 9;

const BASE_LOT = 1;
const MARTINGALE_MULTIPLIER = 2;
const MAX_TRADE_LENGTH  =   5;
const ADDITIONAL_FEES_COVER_LOT = 0

let isClosingSession = false;
let isInitializing = false;


// ======================================================
// TELEGRAM
// ======================================================

const TELEGRAM_BOT = process.env.TELEGRAM_EMA_PULLBACK_TOKEN;
const CHAT_ID = process.env.TELEGRAM_EMA_PULLBACK_CHAT_ID;

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
            public: API_URL,
            private: API_URL,
        }
    }
});

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

    return Math.round(ticker.markPrice);
}

// ======================================================
// INIT
// ======================================================

async function initialize() {

    if (isInitializing) return;

    isInitializing = true;

    try {

        basePrice = await getPrice();

        activeTrade = null;
        tradeHistory = [];
        nextExpectedSide = null;
        currentLot = BASE_LOT;
        lastSignal = null;

        maxTradeReached = false;
        maxTradeAlertSent = false;

        await sendTelegramMessage(`
🚀 <b>NEW SESSION STARTED</b>

📊 ${SYMBOL}
💰 Base: ${basePrice}

📈 Upper: ${basePrice + RANGE_POINTS}
📉 Lower: ${basePrice - RANGE_POINTS}

🎯 TP Up: ${basePrice + CLOSE_POINTS}
🎯 TP Down: ${basePrice - CLOSE_POINTS}

📦 Base Lot: ${BASE_LOT}
🧠 Max Trades: ${MAX_TRADE_LENGTH}
`);
    }

    finally {

        isInitializing = false;
    }
}

// ======================================================
// EXECUTE ORDER (FIXED - NO WRONG LOT CHANGE)
// ======================================================

async function executeTrade(side, lot) {

    try {

        // let updated_lot = lot
        // if(lot != 1){
        //     updated_lot = lot + ADDITIONAL_FEES_COVER_LOT
        // }
        // if(lot != 1){
        //     updated_lot = lot + ADDITIONAL_FEES_COVER_LOT
        // }
        // if(maxTradeReached){
        //     updated_lot = lot + ADDITIONAL_FEES_COVER_LOT
        // }

        const order =
            await exchange.createMarketOrder(
                SYMBOL,
                side,
                lot
            );

        await sendTelegramMessage(`
✅ <b>ORDER EXECUTED</b>

📊 ${SYMBOL}
📈 ${side.toUpperCase()}
📦 Lot: ${lot}
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

async function closeActiveTrade() {
    closeAll(0,false)
}

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

        // console.table([{
        //     SIDE: side,
        //     ENTRY: price,
        //     LOT: tradeLot
        // }]);

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

async function closeAll(price,inner=true) {

    if (isClosingSession) return;

    isClosingSession = true;

    try {

        console.log("CLOSING ALL POSITIONS");

        const positions =
            await exchange.fetchPositions([SYMBOL]);

        const position =
            positions.find(
                p =>
                    Math.abs(
                        Number(
                            p.contracts ||
                            p.info?.size ||
                            0
                        )
                    ) > 0
            );

        if (position) {

            const rawSize =
                Number(
                    position.contracts ||
                    position.info?.size ||
                    0
                );

            const size =
                Math.abs(rawSize);

            const closeSide =
                rawSize > 0
                    ? "sell"
                    : "buy";

            await exchange.createMarketOrder(
                SYMBOL,
                closeSide,
                size,
                undefined,
                {
                    reduce_only: true
                }
            );

            console.log(
                `Closed ${size} contracts`
            );
        }
if(inner){
        await sendTelegramMessage(`
🔄 <b>SESSION CLOSED</b>

📊 ${SYMBOL}
📦 Trades: ${tradeHistory.length}
💰 Exit: ${price}

🕒 ${new Date().toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata"
        })}
`);

        await initialize();
}

    } catch (err) {

        await sendErrorAlert(
            err,
            "closeAll"
        );

    } finally {

        isClosingSession = false;
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
            upperBreak: upperBreak,
            lowerBreak: lowerBreak,
            upperClose: upperClose,
            lowerClose: lowerClose,
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
                await closeActiveTrade();
                await openTrade("sell", price);
            }

            else if (
                nextExpectedSide === "buy" &&
                price >= upperBreak
            ) {
                await closeActiveTrade();
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