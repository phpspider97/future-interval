require("dotenv").config();
const ccxt = require("ccxt");
const axios = require("axios");
//const TelegramBot = require("node-telegram-bot-api");

const API_KEY = process.env.GRID_WEB_KEY;
const API_SECRET = process.env.GRID_WEB_SECRET;

//const bot = new TelegramBot(BOT_TOKEN);

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
const symbols = [
    "BTCUSD",
    "ETHUSD",
    "PAXGUSD",
    "SLVONUSD",
];

// Prevent overlapping interval execution
let isRunning = false;

// Store alert state per symbol
const alertState = {};
 
const TOKEN = process.env.TELEGRAM_MATHEMATIC_TOKEN;
const CHAT_ID = process.env.TELEGRAM_MATHEMATIC_CHAT_ID;

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

async function getDiscountData(symbol) {
    const candles =
        await exchange.fetchOHLCV(symbol, '15m', undefined, 100);

    const highs = candles.map(c => c[2]);
    const lows = candles.map(c => c[3]);

    const recentHigh = Math.max(...highs);
    const recentLow = Math.min(...lows);

    // Smart Money equilibrium
    const equilibrium =
        recentLow + ((recentHigh - recentLow) * 0.5);

    const ticker = await exchange.fetchTicker(symbol);

    const price = ticker.last;

    let discountBuffer = 0;

    if (symbol === 'BTCUSD') {
        discountBuffer = 50;
    } else if (symbol === 'ETHUSD') {
        discountBuffer = 5;
    } else if (symbol === 'PAXGUSD') {
        discountBuffer = 10;
    } else if (symbol === 'SLVONUSD') {
        discountBuffer = 1;
    }

    // Near low price
    const nearLowPrice =
        recentLow + discountBuffer;

    // Discount condition
    const inDiscount =
        Math.round(price) <= Math.round(nearLowPrice);

    // Reset alert when price moves above equilibrium
    if (price > equilibrium) {
        alertState[symbol] = false;
    }

    // Send only one alert until reset
    if (inDiscount && !alertState[symbol]) {

        const symbolEmoji = {
            BTCUSD: "₿",
            ETHUSD: "♦️",
            PAXGUSD: "🥇",
            SLVONUSD: "🥈"
        };

        const message = `
🟢 <b>DISCOUNT ZONE ALERT</b>

━━━━━━━━━━━━━━

💰 <b>Symbol:</b> (${symbolEmoji[symbol]}) ${symbol}

📍 <b>Current Price:</b> ${Math.round(price)}

📈 <b>Recent High:</b> ${Math.round(recentHigh)}

📉 <b>Recent Low:</b> ${Math.round(recentLow)}

⚖️ <b>Equilibrium:</b> ${Math.round(equilibrium)}

🎯 <b>Discount Zone:</b> ${Math.round(nearLowPrice)}

━━━━━━━━━━━━━━

🕒 <b>Time:</b>
${new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata"
})}

🚀 Smart Money Discount Opportunity
`;

        console.log(`${symbol} ALERT SENT`);

        await sendTelegram(message);

        alertState[symbol] = true;
    }

    return {
        Symbol: symbol,
        Price: price,
        High: recentHigh,
        Equilibrium: equilibrium.toFixed(2),
        Low: recentLow,
        DiscountBuffer: nearLowPrice,
        Discount: inDiscount ? "YES" : "NO",
        AlertSent: alertState[symbol] ? "YES" : "NO",
        Time: new Date().toLocaleString(
            "en-IN",
            { timeZone: "Asia/Kolkata" }
        )
    };
}

async function run() {

    //console.clear();
    //process.stdout.write('\x1Bc');

    if (isRunning) return;

    isRunning = true;

    try {

        const tableData = await Promise.all(
            symbols.map(symbol => getDiscountData(symbol))
        );

        //console.clear();
        //process.stdout.write('\x1Bc');
        //console.table(tableData);

    } catch (err) {

        console.log("ERROR:", err.message);

    } finally {

        isRunning = false;
    }
}

// Run immediately
run();

// Run every 1 minute
//setInterval(run, 1 * 60 * 1000);
module.exports = { run };