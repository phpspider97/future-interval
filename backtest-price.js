require("dotenv").config();
const ccxt = require("ccxt");

const exchange = new ccxt.binance({ enableRateLimit: true });

const SYMBOL = "BTC/USDT";
const TIMEFRAME = "1m";
const DAYS = 30;

// STRATEGY
const STRIKE_DISTANCE = 1500;
const SL_BUFFER = 500;
const HOLD_MINUTES = 240; // 4 hours

// ===== TIME HELPERS =====

// Time only (AM/PM)
function timeOnly(ts) {
    return new Date(ts).toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
    });
}

// Correct IST hour
function getHour(ts) {
    const date = new Date(ts);
    const ist = new Date(date.toLocaleString("en-US", {
        timeZone: "Asia/Kolkata"
    }));
    return ist.getHours();
}

// Interval mapping
function getInterval(hour) {
    if (hour >= 0 && hour < 4) return "00-04";
    if (hour >= 4 && hour < 8) return "04-08";
    if (hour >= 8 && hour < 12) return "08-12";
    if (hour >= 12 && hour < 16) return "12-16";
    if (hour >= 16 && hour < 20) return "16-20";
    return "20-24";
}

// Format interval → AM/PM
function formatInterval(interval) {
    const [start, end] = interval.split("-");

    function fmt(h) {
        let hour = parseInt(h);
        let ampm = hour >= 12 ? "PM" : "AM";
        hour = hour % 12 || 12;
        return `${hour} ${ampm}`;
    }

    return `${fmt(start)} - ${fmt(end)}`;
}

// ===== FETCH DATA =====
async function fetchData() {
    const since = Date.now() - DAYS * 24 * 60 * 60 * 1000;

    let all = [];
    let fetchSince = since;

    while (true) {
        const ohlcv = await exchange.fetchOHLCV(SYMBOL, TIMEFRAME, fetchSince, 1000);
        if (ohlcv.length === 0) break;

        all = all.concat(ohlcv);
        fetchSince = ohlcv[ohlcv.length - 1][0] + 1;

        if (ohlcv.length < 1000) break;
    }

    return all;
}

// ===== BACKTEST =====
function runBacktest(data) {
    let stats = {};
    let trades = [];
    let usedIntervals = new Set();

    for (let i = 0; i < data.length - HOLD_MINUTES; i++) {
        const [timestamp, , , , close] = data[i];

        const hour = getHour(timestamp);
        const interval = getInterval(hour);
        const day = new Date(timestamp).toLocaleDateString("en-IN");

        const key = `${day}-${interval}`;

        // only 1 trade per interval per day
        if (usedIntervals.has(key)) continue;
        usedIntervals.add(key);

        const entryPrice = close;
        const entryTime = timestamp;

        const callSL = entryPrice + (STRIKE_DISTANCE - SL_BUFFER);
        const putSL = entryPrice - (STRIKE_DISTANCE - SL_BUFFER);

        let exitPrice = close;
        let exitTime = timestamp;
        let side = "TIME EXIT";

        for (let j = 1; j <= HOLD_MINUTES; j++) {
            const [ts, , high, low] = data[i + j];

            if (high >= callSL) {
                exitPrice = callSL;
                exitTime = ts;
                side = "CALL SL";
                break;
            }

            if (low <= putSL) {
                exitPrice = putSL;
                exitTime = ts;
                side = "PUT SL";
                break;
            }

            if (j === HOLD_MINUTES) {
                exitPrice = data[i + j][4];
                exitTime = ts;
            }
        }

        trades.push({
            day,
            interval: formatInterval(interval),
            side,
            entryPrice: entryPrice.toFixed(2),
            entryTime: timeOnly(entryTime),
            exitPrice: exitPrice.toFixed(2),
            exitTime: timeOnly(exitTime)
        });

        if (!stats[interval]) {
            stats[interval] = { total: 0, slHit: 0 };
        }

        stats[interval].total++;
        if (side !== "TIME EXIT") stats[interval].slHit++;
    }

    return { trades, stats };
}

// ===== MAIN =====
(async () => {
    console.log("⏳ Fetching data...");
    const data = await fetchData();

    console.log("⚙️ Running backtest...");
    const { trades, stats } = runBacktest(data);

    // ===== DAY-WISE TABLE =====
    console.log("\n📅 DAY-WISE TRADES:");

    let grouped = {};

    trades.forEach(t => {
        if (!grouped[t.day]) grouped[t.day] = [];
        grouped[t.day].push({
            Interval: t.interval,
            Side: t.side,
            Entry_Time: t.entryTime,
            Entry_Price: t.entryPrice,
            Exit_Time: t.exitTime,
            Exit_Price: t.exitPrice,
            Status: t.side === "TIME EXIT" ? "🟢 SAFE" : "🔴 SL HIT"
        });
    });

    for (let day in grouped) {
        console.log(`\n=== ${day} ===`);
        console.table(grouped[day]);
    }

    // ===== INTERVAL STATS =====
    let result = [];

    for (let interval in stats) {
        const { total, slHit } = stats[interval];
        const prob = (slHit / total) * 100;

        result.push({
            Interval: formatInterval(interval),
            Trades: total,
            SL_Hit: slHit,
            SL_Probability: prob.toFixed(2) + "%"
        });
    }

    result.sort((a, b) => parseFloat(a.SL_Probability) - parseFloat(b.SL_Probability));

    console.log("\n🎯 INTERVAL PERFORMANCE:");
    console.table(result);

    console.log(`\n✅ TOTAL TRADES: ${trades.length}`);
})();