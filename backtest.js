require("dotenv").config();
const ccxt = require("ccxt");

const exchange = new ccxt.binance({ enableRateLimit: true });

const SYMBOL = "BTC/USDT";
const TIMEFRAME = "1m";
const DAYS = 30;

// STRATEGY SETTINGS
const STRIKE_DISTANCE = 1000;
const SL_BUFFER = 300;
const HOLD_MINUTES = 240; // 4 hours

// ===== TIME HELPERS =====
function getHour(ts) {
    return parseInt(new Date(ts).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        hour12: false
    }));
}

function getInterval(hour) {
    if (hour < 4) return "00-04";
    if (hour < 8) return "04-08";
    if (hour < 12) return "08-12";
    if (hour < 16) return "12-16";
    if (hour < 20) return "16-20";
    return "20-24";
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
    let usedIntervals = new Set();
    let totalTrades = 0;

    for (let i = 0; i < data.length - HOLD_MINUTES; i++) {
        const [timestamp, , , , close] = data[i];

        const hour = getHour(timestamp);
        const interval = getInterval(hour);
        const day = new Date(timestamp).toDateString();

        const key = `${day}-${interval}`;

        // ✅ only 1 trade per interval per day
        if (usedIntervals.has(key)) continue;
        usedIntervals.add(key);

        const entryPrice = close;

        const callSL = entryPrice + (STRIKE_DISTANCE - SL_BUFFER);
        const putSL = entryPrice - (STRIKE_DISTANCE - SL_BUFFER);

        let slHit = false;

        // check next 4 hours
        for (let j = 1; j <= HOLD_MINUTES; j++) {
            const [, , high, low] = data[i + j];

            if (high >= callSL || low <= putSL) {
                slHit = true;
                break;
            }
        }

        if (!stats[interval]) {
            stats[interval] = { total: 0, slHit: 0 };
        }

        stats[interval].total++;
        totalTrades++;

        if (slHit) stats[interval].slHit++;
    }

    return { stats, totalTrades };
}

// ===== MAIN =====
(async () => {
    console.log("⏳ Fetching data...");
    const data = await fetchData();

    console.log("⚙️ Running realistic backtest...");
    const { stats, totalTrades } = runBacktest(data);

    let result = [];

    for (let interval in stats) {
        const { total, slHit } = stats[interval];
        const prob = (slHit / total) * 100;

        result.push({
            Interval: interval,
            Trades: total,
            SL_Hit: slHit,
            SL_Probability: prob.toFixed(2) + "%"
        });
    }

    // sort safest first
    result.sort((a, b) => parseFloat(a.SL_Probability) - parseFloat(b.SL_Probability));

    console.log("\n🎯 BEST INTERVALS (REALISTIC):");
    console.table(result);

    console.log(`\n✅ TOTAL TRADES (30 DAYS): ${totalTrades}`);
})();