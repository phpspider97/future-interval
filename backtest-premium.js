require("dotenv").config();
const axios = require("axios");

const BASE_URL = "https://api.india.delta.exchange";

// ================= SETTINGS =================
const UNDERLYING = "BTCUSDT";
const STRIKE_DISTANCE = 1000;
const HOLD_MINUTES = 240;
const DAYS = 5;

// ================= CACHE =================
const candleCache = {};

// ================= TIME HELPERS =================
function timeOnly(ts) {
    return new Date(ts).toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
    });
}

function getISTHour(ts) {
    return new Date(
        new Date(ts).toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
    ).getHours();
}

// ================= FETCH PRODUCTS =================
async function getInstruments() {
    const res = await axios.get(`${BASE_URL}/v2/products`);
    const list = res.data?.result || [];

    // ONLY symbol-based filtering (IMPORTANT FIX)
    return list.filter(p =>
        p.symbol &&
        p.symbol.includes(UNDERLYING) &&
        (p.symbol.endsWith("-C") || p.symbol.endsWith("-P"))
    );
}

// ================= EXPIRY LOGIC =================
function getExpiryByTime(instruments, ts) {
    const hour = getISTHour(ts);

    const expiries = [...new Set(
        instruments
            .map(i => i.expiry_time)
            .filter(Boolean)
            .filter(e => new Date(e).getTime() > ts)
    )].sort((a, b) => new Date(a) - new Date(b));

    if (!expiries.length) return null;

    return (hour >= 8 && hour < 17)
        ? expiries[1] || expiries[0]
        : expiries[0];
}

// ================= STRIKE SELECTION =================
function extractStrike(symbol) {
    // BTCUSD-260507-65000-C
    const parts = symbol.split("-");
    return parseFloat(parts[2]);
}

function isCall(symbol) {
    return symbol.endsWith("-C");
}

function isPut(symbol) {
    return symbol.endsWith("-P");
}

function findClosest(instruments, expiry, target, typeFn) {
    const list = instruments.filter(i =>
        i.expiry_time === expiry &&
        typeFn(i.symbol)
    );

    if (!list.length) return null;

    return list.reduce((prev, curr) =>
        Math.abs(extractStrike(curr.symbol) - target) <
        Math.abs(extractStrike(prev.symbol) - target)
            ? curr : prev
    );
}

// ================= FETCH CANDLES =================
async function fetchOHLC(symbol) {
    if (candleCache[symbol]) return candleCache[symbol];

    const since = Date.now() - DAYS * 24 * 60 * 60 * 1000;

    const res = await axios.get(`${BASE_URL}/v2/history/candles`, {
        params: {
            symbol,
            resolution: "1m",
            start: Math.floor(since / 1000),
            end: Math.floor(Date.now() / 1000)
        }
    });

    const data = (res.data?.result || []).map(c => ({
        time: c.time * 1000,
        high: c.high,
        low: c.low,
        close: c.close
    }));

    candleCache[symbol] = data;
    return data;
}

// ================= MAIN ENGINE =================
async function run() {
    console.log("⏳ Loading instruments...");

    const instruments = await getInstruments();

    if (!instruments.length) {
        throw new Error("No option symbols found (check API response)");
    }

    // spot via tickers
    const tick = await axios.get(`${BASE_URL}/v2/tickers`);
    const btc = tick.data?.result?.find(t => t.symbol.includes("BTC"));
    const spot = btc?.mark_price;

    if (!spot) throw new Error("BTC spot not found");

    console.log("Spot:", spot);

    // timeline reference
    const sample = instruments[0];
    const timeline = await fetchOHLC(sample.symbol);

    let trades = [];

    for (let i = 0; i < timeline.length - HOLD_MINUTES; i += HOLD_MINUTES) {
        const entry = timeline[i];
        if (!entry) continue;

        const entryTs = entry.time;

        const expiry = getExpiryByTime(instruments, entryTs);
        if (!expiry) continue;

        const callTarget = spot + STRIKE_DISTANCE;
        const putTarget = spot - STRIKE_DISTANCE;

        const call = findClosest(instruments, expiry, callTarget, isCall);
        const put = findClosest(instruments, expiry, putTarget, isPut);

        if (!call || !put) continue;

        const callData = await fetchOHLC(call.symbol);
        const putData = await fetchOHLC(put.symbol);

        const callEntry = callData[i]?.close;
        const putEntry = putData[i]?.close;

        if (!callEntry || !putEntry) continue;

        const callSL = callEntry * 2;
        const putSL = putEntry * 2;

        let side = "TIME EXIT";
        let exitTime = entryTs;

        for (let j = 1; j <= HOLD_MINUTES; j++) {
            const c = callData[i + j];
            const p = putData[i + j];

            if (!c || !p) break;

            if (c.high >= callSL) {
                side = "CALL PREMIUM SL";
                exitTime = c.time;
                break;
            }

            if (p.high >= putSL) {
                side = "PUT PREMIUM SL";
                exitTime = p.time;
                break;
            }

            if (j === HOLD_MINUTES) {
                exitTime = c.time;
            }
        }

        trades.push({
            Day: new Date(entryTs).toLocaleDateString("en-IN"),
            Entry_Time: timeOnly(entryTs),
            Exit_Time: timeOnly(exitTime),
            Call_Strike: extractStrike(call.symbol),
            Put_Strike: extractStrike(put.symbol),
            Result: side === "TIME EXIT" ? "🟢 SAFE" : "🔴 SL HIT",
            Side: side
        });
    }

    // ================= OUTPUT =================
    let grouped = {};

    trades.forEach(t => {
        if (!grouped[t.Day]) grouped[t.Day] = [];
        grouped[t.Day].push(t);
    });

    console.log("\n📅 DAY-WISE RESULTS:");

    for (let day in grouped) {
        console.log(`\n=== ${day} ===`);
        console.table(grouped[day]);
    }

    console.log(`\n✅ TOTAL TRADES: ${trades.length}`);
}

run().catch(err => console.error("❌ ERROR:", err.message));