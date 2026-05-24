require("dotenv").config();

const ccxt = require("ccxt");
const axios = require("axios");

// ======================================================
// ENV
// ======================================================

const API_KEY = process.env.GRID_WEB_KEY;
const API_SECRET = process.env.GRID_WEB_SECRET;

const TOKEN = process.env.TELEGRAM_MATHEMATIC_TOKEN;
const CHAT_ID = process.env.TELEGRAM_MATHEMATIC_CHAT_ID;

// ======================================================
// EXCHANGE
// ======================================================

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

// ======================================================
// SYMBOLS
// ======================================================

const symbols = [
    "BTCUSD",
    "ETHUSD",
    "PAXGUSD",
    "SLVONUSD",
];

// ======================================================
// SETTINGS
// ======================================================

const RESET_BUFFER = {
    BTCUSD: 100,
    ETHUSD: 10,
    PAXGUSD: 5,
    SLVONUSD: 0.5
};

const DISCOUNT_BUFFER = {
    BTCUSD: 100,
    ETHUSD: 10,
    PAXGUSD: 5,
    SLVONUSD: 0.5
};

const COOLDOWN_MINUTES = {
    BTCUSD: 30,
    ETHUSD: 30,
    PAXGUSD: 45,
    SLVONUSD: 60
};

// ======================================================
// GLOBAL STATE
// ======================================================

let isRunning = false;

// Prevent repeated alerts
const alertState = {};

// Store last alert time
const lastAlertTime = {};

// ======================================================
// TELEGRAM
// ======================================================

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

        console.log("Telegram Error:", err.message);

    }
}

// ======================================================
// MAIN LOGIC
// ======================================================

async function getDiscountData(symbol) {

    // ==========================================
    // FETCH CANDLES
    // ==========================================

    const candles =
        await exchange.fetchOHLCV(
            symbol,
            "15m",
            undefined,
            100
        );

    const highs = candles.map(c => c[2]);
    const lows = candles.map(c => c[3]);

    const recentHigh = Math.max(...highs);
    const recentLow = Math.min(...lows);

    // ==========================================
    // EQUILIBRIUM
    // ==========================================

    const equilibrium =
        recentLow + ((recentHigh - recentLow) * 0.5);

    // ==========================================
    // LIVE PRICE
    // ==========================================

    const ticker = await exchange.fetchTicker(symbol);

    const price = ticker.last;

    // ==========================================
    // DISCOUNT ZONE
    // ==========================================

    const nearLowPrice =
        recentLow + DISCOUNT_BUFFER[symbol];

    // IMPORTANT:
    // NO Math.round() in logic
    const inDiscount =
        price <= nearLowPrice;

    // ==========================================
    // RESET ALERT STATE
    // ==========================================

    if (
        price >
        equilibrium + RESET_BUFFER[symbol]
    ) {
        alertState[symbol] = false;
    }

    // ==========================================
    // COOLDOWN
    // ==========================================

    const now = Date.now();

    const cooldown =
        COOLDOWN_MINUTES[symbol] * 60 * 1000;

    const canAlert =
        !lastAlertTime[symbol] ||
        now - lastAlertTime[symbol] > cooldown;

    // ==========================================
    // SEND ALERT
    // ==========================================

    if (
        inDiscount &&
        !alertState[symbol] &&
        canAlert
    ) {

        const symbolEmoji = {
            BTCUSD: "₿",
            ETHUSD: "♦️",
            PAXGUSD: "🥇",
            SLVONUSD: "🥈"
        };

        const message = `
🟢 <b>${symbolEmoji[symbol]} ${symbol} DISCOUNT ZONE</b>

━━━━━━━━━━━━━━

💰 <b>Price:</b> ${price.toFixed(2)}

📈 <b>Recent High:</b> ${recentHigh.toFixed(2)}

📉 <b>Recent Low:</b> ${recentLow.toFixed(2)}

⚖️ <b>Equilibrium:</b> ${equilibrium.toFixed(2)}

🎯 <b>Discount Zone:</b> ${nearLowPrice.toFixed(2)}

━━━━━━━━━━━━━━

🕒 <b>Time:</b>

${new Date().toLocaleString(
    "en-IN",
    {
        timeZone: "Asia/Kolkata"
    }
)}

🚀 Smart Money Discount Opportunity
`;

        console.log(`${symbol} ALERT SENT`);

        await sendTelegram(message);

        // Save alert state
        alertState[symbol] = true;

        // Save last alert time
        lastAlertTime[symbol] = now;
    }

    // ==========================================
    // RETURN TABLE DATA
    // ==========================================

    return {

        Symbol: symbol,

        Price: price.toFixed(2),

        High: recentHigh.toFixed(2),

        Equilibrium: equilibrium.toFixed(2),

        Low: recentLow.toFixed(2),

        DiscountZone: nearLowPrice.toFixed(2),

        Discount: inDiscount ? "YES" : "NO",

        AlertSent: alertState[symbol]
            ? "YES"
            : "NO",

        Cooldown:
            lastAlertTime[symbol]
                ? `${Math.floor(
                    (
                        Date.now() -
                        lastAlertTime[symbol]
                    ) / 1000
                )} sec ago`
                : "-",

        Time: new Date().toLocaleString(
            "en-IN",
            {
                timeZone: "Asia/Kolkata"
            }
        )
    };
}

// ======================================================
// RUN
// ======================================================

async function run() {

    if (isRunning) return;

    isRunning = true;

    try {

        const tableData = await Promise.all(
            symbols.map(symbol =>
                getDiscountData(symbol)
            )
        );

        console.clear();

        //console.table(tableData);

    } catch (err) {

        console.log(
            "ERROR:",
            err.message
        );

    } finally {

        isRunning = false;

    }
}

// ======================================================
// START
// ======================================================

// Run immediately
run();

// Run every 1 minute
// setInterval(
//     run,
//     1 * 60 * 1000
// );

module.exports = { run };