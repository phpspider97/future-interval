/*
========================================================
BTC Trendline Breakout Bot
========================================================

LOGIC
--------------------------------------------------------
LONG SETUP:
1. Detect recent lower highs
2. Build descending trendline
3. Price closes ABOVE trendline
4. Volume confirmation
5. Alert once

SHORT SETUP:
1. Detect recent higher lows
2. Build ascending trendline
3. Price closes BELOW trendline
4. Volume confirmation
5. Alert once

FEATURES
--------------------------------------------------------
✓ BTC Trendline breakout detection
✓ Long + Short signals
✓ Volume confirmation
✓ Telegram alerts
✓ Duplicate signal protection
✓ Console table output
✓ Works on Delta Exchange via CCXT

========================================================
INSTALL
========================================================

npm install ccxt technicalindicators axios dotenv

Create .env file:

GRID_WEB_KEY=YOUR_KEY
GRID_WEB_SECRET=YOUR_SECRET

TELEGRAM_BOT_TOKEN=XXXX
TELEGRAM_CHAT_ID=XXXX

========================================================
*/

require("dotenv").config();

const ccxt = require("ccxt");
const axios = require("axios");

// ======================================================
// CONFIG
// ======================================================

const SYMBOL = "BTC/USDT";
const TIMEFRAME = "5m";

const LIMIT = 200;

const SWING_LOOKBACK = 3;
const TREND_POINTS = 3;

const VOLUME_MULTIPLIER = 1.2;

const CHECK_INTERVAL = 60 * 1000;

// ======================================================
// ENV
// ======================================================

const API_KEY = process.env.GRID_WEB_KEY;
const API_SECRET = process.env.GRID_WEB_SECRET;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ======================================================
// EXCHANGE
// ======================================================

const exchange = new ccxt.delta({
    apiKey: API_KEY,
    secret: API_SECRET,
    enableRateLimit: true,
});

// ======================================================
// TELEGRAM
// ======================================================

async function sendTelegram(message) {
    try {
        if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

        await axios.post(url, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
        });
    } catch (err) {
        console.log("Telegram Error:", err.message);
    }
}

// ======================================================
// UTILITIES
// ======================================================

function average(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function getSwingHighs(candles) {
    const highs = [];

    for (let i = SWING_LOOKBACK; i < candles.length - SWING_LOOKBACK; i++) {
        let isHigh = true;

        for (let j = 1; j <= SWING_LOOKBACK; j++) {
            if (
                candles[i][2] <= candles[i - j][2] ||
                candles[i][2] <= candles[i + j][2]
            ) {
                isHigh = false;
                break;
            }
        }

        if (isHigh) {
            highs.push({
                index: i,
                price: candles[i][2],
            });
        }
    }

    return highs;
}

function getSwingLows(candles) {
    const lows = [];

    for (let i = SWING_LOOKBACK; i < candles.length - SWING_LOOKBACK; i++) {
        let isLow = true;

        for (let j = 1; j <= SWING_LOOKBACK; j++) {
            if (
                candles[i][3] >= candles[i - j][3] ||
                candles[i][3] >= candles[i + j][3]
            ) {
                isLow = false;
                break;
            }
        }

        if (isLow) {
            lows.push({
                index: i,
                price: candles[i][3],
            });
        }
    }

    return lows;
}

// ======================================================
// TRENDLINE
// ======================================================

function buildTrendline(points) {
    if (points.length < 2) return null;

    const p1 = points[points.length - 2];
    const p2 = points[points.length - 1];

    const slope = (p2.price - p1.price) / (p2.index - p1.index);

    return {
        slope,
        intercept: p1.price - slope * p1.index,
    };
}

function getTrendlinePrice(line, index) {
    return line.slope * index + line.intercept;
}

// ======================================================
// SIGNAL STATE
// ======================================================

let lastSignal = "";

// ======================================================
// MAIN
// ======================================================

async function checkTrendlineBreakout() {
    try {
        // ==================================================
        // FETCH DATA
        // ==================================================

        const candles = await exchange.fetchOHLCV(
            SYMBOL,
            TIMEFRAME,
            undefined,
            LIMIT
        );

        const closes = candles.map((c) => c[4]);
        const volumes = candles.map((c) => c[5]);

        const lastCandle = candles[candles.length - 1];

        const close = lastCandle[4];
        const volume = lastCandle[5];

        const avgVolume = average(volumes.slice(-20));

        // ==================================================
        // SWINGS
        // ==================================================

        const swingHighs = getSwingHighs(candles);
        const swingLows = getSwingLows(candles);

        const recentHighs = swingHighs.slice(-TREND_POINTS);
        const recentLows = swingLows.slice(-TREND_POINTS);

        const descendingTrendline = buildTrendline(recentHighs);
        const ascendingTrendline = buildTrendline(recentLows);

        const currentIndex = candles.length - 1;

        // ==================================================
        // TRENDLINE VALUES
        // ==================================================

        let upperTrendline = null;
        let lowerTrendline = null;

        if (descendingTrendline) {
            upperTrendline = getTrendlinePrice(
                descendingTrendline,
                currentIndex
            );
        }

        if (ascendingTrendline) {
            lowerTrendline = getTrendlinePrice(
                ascendingTrendline,
                currentIndex
            );
        }

        // ==================================================
        // LONG BREAKOUT
        // ==================================================

        const longBreakout =
            upperTrendline &&
            close > upperTrendline &&
            volume > avgVolume * VOLUME_MULTIPLIER;

        // ==================================================
        // SHORT BREAKDOWN
        // ==================================================

        const shortBreakout =
            lowerTrendline &&
            close < lowerTrendline &&
            volume > avgVolume * VOLUME_MULTIPLIER;

        // ==================================================
        // CONSOLE
        // ======================================================

        console.clear();

        console.table([
            {
                Symbol: SYMBOL,
                TF: TIMEFRAME,
                Close: close.toFixed(2),
                UpperTrendline: upperTrendline
                    ? upperTrendline.toFixed(2)
                    : "-",
                LowerTrendline: lowerTrendline
                    ? lowerTrendline.toFixed(2)
                    : "-",
                Volume: volume.toFixed(2),
                AvgVolume: avgVolume.toFixed(2),
                LongBreakout: longBreakout ? "YES" : "NO",
                ShortBreakout: shortBreakout ? "YES" : "NO",
            },
        ]);

        // ==================================================
        // LONG ALERT
        // ======================================================

        if (longBreakout && lastSignal !== "LONG") {
            lastSignal = "LONG";

            const message = `
🚀 BTC TRENDLINE BREAKOUT LONG

Symbol: ${SYMBOL}
TF: ${TIMEFRAME}

Price: ${close}

Trendline: ${upperTrendline.toFixed(2)}

Volume Confirmed ✅
`;

            console.log(message);

            await sendTelegram(message);
        }

        // ==================================================
        // SHORT ALERT
        // ======================================================

        if (shortBreakout && lastSignal !== "SHORT") {
            lastSignal = "SHORT";

            const message = `
🔻 BTC TRENDLINE BREAKDOWN SHORT

Symbol: ${SYMBOL}
TF: ${TIMEFRAME}

Price: ${close}

Trendline: ${lowerTrendline.toFixed(2)}

Volume Confirmed ✅
`;

            console.log(message);

            await sendTelegram(message);
        }
    } catch (err) {
        console.log("ERROR:", err.message);
    }
}

// ======================================================
// START
// ======================================================

console.log("Trendline Breakout Bot Started...");

checkTrendlineBreakout();

setInterval(checkTrendlineBreakout, CHECK_INTERVAL);