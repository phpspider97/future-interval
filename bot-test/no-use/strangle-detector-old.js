require("dotenv").config();
const ccxt = require("ccxt");
const axios = require("axios");

// ================= EXCHANGE =================
const exchange = new ccxt.delta({
    apiKey: process.env.API_KEY,
    secret: process.env.API_SECRET,
    enableRateLimit: true,
    urls: {
        api: {
            public: "https://api.india.delta.exchange",
            private: "https://api.india.delta.exchange",
        }
    }
});

// ================= STATE =================
let position = "NONE";
let entryPremium = 0;
let selectedCall = null;
let selectedPut = null;

// ================= TELEGRAM =================
async function sendTelegram(msg) {
    try {
        await axios.post(
            `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`,
            {
                chat_id: process.env.TELEGRAM_CHAT_ID,
                text: msg
            }
        );
    } catch (err) {
        console.error("Telegram Error:", err.message);
    }
}

// ================= SAFE NUMBER =================
const num = (v) => (isNaN(Number(v)) ? null : Number(v));

// ================= IST HELPERS =================
function getISTNow() {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    return new Date(utc + 5.5 * 60 * 60000);
}

// ================= DAY AFTER TOMORROW RANGE =================
function getDayAfterTomorrowRange() {

    const ist = getISTNow();

    const start = new Date(ist);
    start.setDate(start.getDate() + 1);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setHours(23, 59, 59, 999);

    return {
        start: start.getTime(),
        end: end.getTime()
    };
}


// ---------------- RANGE DETECTION ----------------
function isRangeMarket(closes) {
    const bb = ti.BollingerBands.calculate({
        period: 20,
        values: closes,
        stdDev: 2
    });

    const last = bb[bb.length - 1];
    const price = closes[closes.length - 1];

    const width = last.upper - last.lower;

    return {
        ok: width < price * 0.03,
        upper: last.upper,
        lower: last.lower,
        price
    };
}

// ================= BTC PRICE =================
async function getBTCPrice() {
    try {
        const t = await exchange.fetchTicker("BTCUSD");
        return num(t?.last || t?.mark_price);
    } catch (err) {
        console.error("BTC ERROR:", err.message);
        return null;
    }
}

// ================= OPTIONS =================
async function getOptions() {

    const res = await exchange.fetchMarkets();
    const markets = res?.result || res || [];

    return markets.filter(m =>
        m.type === "option" && m.active
    );
}

// ================= FILTER EXPIRY =================
function filterExpiry(options) {

    const { start, end } = getDayAfterTomorrowRange();

    return options.filter(o => {

        const expiry = Number(o.expiry);

        return expiry >= start && expiry <= end;
    });
}

// ================= HELPERS =================
function isCall(o) {
    return o.optionType === "call" || o.info?.option_type === "call";
}

function isPut(o) {
    return o.optionType === "put" || o.info?.option_type === "put";
}

function isValid(o) {
    return o?.strike && o.strike % 200 === 0;
}

// ================= STRANGLE ENGINE =================
function selectStrangle(options, spot) {

    const buffer = spot * 0.015;

    const calls = options.filter(o =>
        isCall(o) && isValid(o) && o.strike >= spot + buffer
    );

    const puts = options.filter(o =>
        isPut(o) && isValid(o) && o.strike <= spot - buffer
    );

    if (!calls.length || !puts.length) return null;

    const call = calls.sort((a, b) => a.strike - b.strike)[0];
    const put = puts.sort((a, b) => b.strike - a.strike)[0];

    return { call, put };
}

// ================= PREMIUM =================
async function getPremium(call, put) {

    const callT = await exchange.fetchTicker(call.symbol);
    const putT = await exchange.fetchTicker(put.symbol);

    const callP = num(callT?.mark_price || callT?.last);
    const putP = num(putT?.mark_price || putT?.last);

    if (!callP || !putP) return null;

    return {
        call: callP,
        put: putP,
        total: callP + putP
    };
}

// ---------------- PRICE DATA ----------------
async function getPrice() {
    const ohlcv = await exchange.fetchOHLCV(SYMBOL, TIMEFRAME, undefined, 100);
    return ohlcv.map(c => c[4]);
}

// ================= MAIN BOT =================
async function run() {

    try {

        const spot = await getBTCPrice();
        if (!spot) return;
        const closes = await getPrice();

        const allOptions = await getOptions();
        const range = isRangeMarket(closes);

        // 🔥 APPLY EXPIRY FILTER (DAY AFTER TOMORROW ONLY)
        const options = filterExpiry(allOptions);

        if (!options.length) {
            console.log("No options for selected expiry");
            return;
        }

        // ================= ENTRY =================
        if (position === "NONE" && range.ok) {

            const selected = selectStrangle(options, spot);
            if (!selected) return;

            const premium = await getPremium(selected.call, selected.put);
            if (!premium) return;

            entryPremium = premium.total;
            position = "OPEN";

            selectedCall = selected.call;
            selectedPut = selected.put;

            const expiry = new Date(Number(selected.call.expiry)).toUTCString();

            console.log("ENTRY:", {
                spot,
                call: selected.call.strike,
                put: selected.put.strike,
                premium: premium.total
            });

            await sendTelegram(`
📢 STRANGLE ENTRY (V11 EXPIRY FILTER)

BTC: ${spot}

CALL: ${selected.call.strike}
PUT: ${selected.put.strike}

CALL PREMIUM: ${premium.call}
PUT PREMIUM: ${premium.put}
TOTAL: ${premium.total}

📅 EXPIRY: ${expiry}

STATUS: ACTIVE STRANGLE
            `.trim());
        }

        // ================= EXIT =================
        if (position === "OPEN") {

            const premium = await getPremium(selectedCall, selectedPut);
            if (!premium) return;

            if (premium.total >= 2 * entryPremium) {

                await sendTelegram(`
📢 STRANGLE EXIT 🚨

ENTRY: ${entryPremium}
CURRENT: ${premium.total}

REASON: 2x SL hit
                `.trim());

                position = "NONE";
                entryPremium = 0;
                selectedCall = null;
                selectedPut = null;
            }
        }

    } catch (err) {
        console.error("MAIN ERROR:", err.message);
    }
}

// ================= LOOP =================
//setInterval(runBot, 5 * 1000);
module.exports = { run };