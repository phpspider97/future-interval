require("dotenv").config();
const ccxt = require("ccxt");
const moment = require("moment");
const axios = require("axios");

const exchange = new ccxt.delta({
    enableRateLimit: true,
});

// ================= CONFIG =================
const SYMBOL = "BTC/USDT:USDT";
const DAYS_BACK = 5;
const TARGET_DELTA = 0.20;

// ================= TIME =================
function getEntryTimeUTC(date) {
    return moment(date)
        .utc()
        .hour(5)
        .minute(30)
        .second(0)
        .millisecond(0)
        .valueOf();
}

function toIST(ts) {
    return moment(ts)
        .utcOffset("+05:30")
        .format("HH:mm");
}

// ================= CANDLE =================
async function get11amCandle(date) {
    const since = getEntryTimeUTC(date);

    const candles = await exchange.fetchOHLCV(
        SYMBOL,
        "5m",
        since - (30 * 60 * 1000),
        20
    );

    if (!candles || candles.length === 0) return null;

    const target = candles.find(c =>
        moment(c[0]).utc().format("HH:mm") === "05:30"
    );

    return target || candles[candles.length - 1];
}

// ================= API =================
async function getOptionTickers() {
    try {
        const res = await axios.get("https://api.delta.exchange/v2/tickers");
        return res.data.result;
    } catch {
        return [];
    }
}

// ================= HELPERS =================
function isValidDelta(d) {
    return d !== null && !isNaN(Number(d));
}

function formatDelta(d) {
    const num = Number(d);
    return isNaN(num) ? "NA" : num.toFixed(2);
}

// ================= BTC FILTER =================
function isBTCOption(t) {
    const s = t.symbol;

    return (
        s &&
        (
            s.startsWith("C-BTC") ||
            s.startsWith("P-BTC") ||
            s.includes("-BTC-")
        ) &&
        s.match(/\d{6}$/) &&
        t.greeks &&
        isValidDelta(t.greeks.delta)
    );
}

// ================= EXPIRY =================
function extractExpiry(symbol) {
    const match = symbol.match(/(\d{6})$/);
    return match ? match[1] : null;
}

function parseExpiry(e) {
    return moment.utc(e, "DDMMYY");
}

function getNextDayExpiry(tickers, date) {
    const target = moment.utc(date).add(1, "day").startOf("day");

    const map = new Map();

    for (let t of tickers) {
        const exp = extractExpiry(t.symbol);
        if (!exp) continue;

        if (!map.has(exp)) {
            map.set(exp, parseExpiry(exp));
        }
    }

    const list = Array.from(map.entries())
        .map(([str, d]) => ({ str, d }))
        .sort((a, b) => a.d - b.d);

    console.log("📅 Expiries:", list.map(e => e.str));

    for (let e of list) {
        if (e.d.isSame(target, "day")) return e.str;
    }

    for (let e of list) {
        if (e.d.isAfter(date)) return e.str;
    }

    return null;
}

// ================= OPTION FILTER =================
function filterOptions(tickers, expiry) {
    return tickers.filter(t => extractExpiry(t.symbol) === expiry);
}

// ================= DELTA SELECT =================
function findClosestDelta(options, target, type) {
    const filtered = options.filter(o => o.symbol.startsWith(`${type}-`));

    let best = null;
    let min = Infinity;

    for (let o of filtered) {
        const d = Number(o.greeks.delta);
        if (isNaN(d)) continue;

        const diff = Math.abs(Math.abs(d) - target);

        if (diff < min) {
            min = diff;
            best = o;
        }
    }

    return best;
}

// ================= BACKTEST =================
async function runBacktest() {

    const summary = [];

    for (let i = 1; i <= DAYS_BACK; i++) {

        const date = moment().subtract(i, "days");
        console.log(`\n📅 ${date.format("YYYY-MM-DD")}`);

        const entryTimeIST = "11:00";

        // Spot
        const candle = await get11amCandle(date);
        if (!candle) continue;

        const spot = candle[4];
        console.log("📊 Spot:", spot);

        // Tickers
        const all = await getOptionTickers();
        if (!all.length) continue;

        const tickers = all.filter(isBTCOption);
        console.log("📊 BTC Options:", tickers.length);

        if (!tickers.length) continue;

        // Expiry
        const expiry = getNextDayExpiry(tickers, date);
        if (!expiry) continue;

        console.log("📅 Selected Expiry:", expiry);

        const options = filterOptions(tickers, expiry);
        if (!options.length) continue;

        // Select
        const call = findClosestDelta(options, TARGET_DELTA, "C");
        const put = findClosestDelta(options, TARGET_DELTA, "P");

        if (!call || !put) continue;

        const callStrike = call.strike_price;
        const putStrike = put.strike_price;

        // ENTRY TABLE
        console.log("\n📥 ENTRY");
        console.table([
            {
                Leg: "CALL",
                Symbol: call.symbol,
                Strike: callStrike,
                Delta: formatDelta(call.greeks.delta),
            },
            {
                Leg: "PUT",
                Symbol: put.symbol,
                Strike: putStrike,
                Delta: formatDelta(put.greeks.delta),
            }
        ]);

        // TRACK
        const since = getEntryTimeUTC(date);

        const candles = await exchange.fetchOHLCV(
            SYMBOL,
            "5m",
            since,
            100
        );

        let result = {
            Date: date.format("YYYY-MM-DD"),
            Spot: spot,
            CallStrike: callStrike,
            PutStrike: putStrike,
            Entry_IST: entryTimeIST,
            Exit_IST: "-",
            Crossed: "NO",
            Side: "-",
            Event: "No Cross"
        };

        let lastTime = "-";

        for (let c of candles) {
            const high = c[2];
            const low = c[3];
            const time = toIST(c[0]);

            lastTime = time;

            if (high >= callStrike) {
                result.Crossed = "YES";
                result.Side = "CALL";
                result.Event = "Call Strike Hit";
                result.Exit_IST = time;
                break;
            }

            if (low <= putStrike) {
                result.Crossed = "YES";
                result.Side = "PUT";
                result.Event = "Put Strike Hit";
                result.Exit_IST = time;
                break;
            }
        }

        if (result.Exit_IST === "-") {
            result.Exit_IST = lastTime;
        }

        console.log("\n📊 RESULT");
        console.table([result]);

        summary.push(result);
    }

    console.log("\n📊 FINAL SUMMARY (IST)");
    console.table(summary);
}

// RUN
runBacktest();