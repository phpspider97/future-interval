require("dotenv").config();
const ccxt = require("ccxt");
const axios = require("axios");

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
 

const INTERVAL = 5000; // 5 sec loop

let position = null;
let hasEnteredToday = false;
let lastTradeDate = null;
let isRunning = false;
let lastUpdateTime = 0;
let is_entered = false

// ===== TELEGRAM FUNCTION =====
async function sendTelegram(message) {
    try {
      const url = `https://api.telegram.org/bot${process.env.TELEGRAM_STRANGLE_DETECTOR_TOKEN}/sendMessage`;
  
      const res = await axios.post(url, {
        chat_id: process.env.TELEGRAM_STRANGLE_DETECTOR_CHAT_ID,
        text: message,
        parse_mode: "HTML"
      });
  
      if (!res.data.ok) {
        console.log("❌ Telegram Error:", res.data);
      }
  
    } catch (err) {
      console.error("❌ Telegram API Failed:", err.response?.data || err.message);
    }
  }

// 🕒 IST Time
function getIST() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}

// ⏱ Time Range
function inTimeRange(startH, startM, endH, endM) {
    const now = getIST();

    const start = new Date(now);
    start.setHours(startH, startM, 0);

    const end = new Date(now);
    end.setHours(endH, endM, 0);

    return now >= start && now <= end;
}

// 🔍 Fetch Options
async function getOptions() {
    const markets = await exchange.loadMarkets();
    return Object.values(markets).filter(m =>
        m.symbol.includes("BTC/USD") && m.option
    );
}

// 📊 Mark Price
async function getMark(symbol) {
    const ticker = await exchange.fetchTicker(symbol);
    return ticker.last;
}

// 🎯 Delta
function getDelta(o) {
    return o?.info?.greeks?.delta 
        ?? o?.info?.delta 
        ?? null;
}

// 🎯 Strike
function getStrike(o) {
    return o?.strike ?? o?.info?.strike ?? "NA";
}

// 🎯 Select Strikes
async function selectStrikes(options) {
    const calls = options.filter(o => o.optionType === "call");
    const puts = options.filter(o => o.optionType === "put");
    //console.log(puts)
    // 1️⃣ Try delta
    let call = calls.find(o => {
        const d = getDelta(o);
        return d !== null && Math.abs(d - 0.1) < 0.05;
    });

    let put = puts.find(o => {
        const d = getDelta(o);
        return d !== null && Math.abs(d + 0.1) < 0.05;
    });

    // 2️⃣ Fallback → premium
    if (!call || !put) {
        console.log("⚠️ Using premium fallback (40–60)");
        //console.log(calls)
        for (let c of calls) {
            //console.log(c.symbol)
            const price = await getMark(c.symbol);
            if (price >= 40 && price <= 100) {
                call = c;
                break;
            }
        }

        for (let p of puts) {
            const price = await getMark(p.symbol);
            if (price >= 40 && price <= 100) {
                put = p;
                break;
            }
        }
    }

    if (!call || !put) {
        console.log("❌ No valid strikes found");
        return { call: null, put: null };
    }

    return { call, put };
}

// 🚀 ENTRY
async function tryEnter() {
    const now = getIST();
    const today = now.toDateString();

    if (hasEnteredToday && lastTradeDate === today) return;
    if (!inTimeRange(11, 1, 11, 30)) return;

    console.log("🔵 ENTRY CHECK");

    const options = await getOptions();

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    //tomorrow.setDate(tomorrow.getDate());
    console.log(tomorrow.setDate(tomorrow.getDate()))

    const nextExpiry = options.filter(o =>
        new Date(o.expiry).toDateString() === tomorrow.toDateString()
    );
        //console.log(nextExpiry)
    const { call, put } = await selectStrikes(nextExpiry);
    if (!call || !put) return;

    const callPrice = await getMark(call.symbol);
    const putPrice = await getMark(put.symbol);

    const callStrike = getStrike(call);
    const putStrike = getStrike(put);

    const initialPremium = callPrice + putPrice;

    position = {
        callSymbol: call.symbol,
        putSymbol: put.symbol,
        callStrike,
        putStrike,
        initialPremium,
        alerted: false
    };

    hasEnteredToday = true;
    lastTradeDate = today;
    //console.log(call)
    await sendTelegram(`📥 <b>STRANGLE ENTRY</b>

    🟢 <b>CALL LEG</b>
    Symbol : <code>${call.symbol}</code>
    Strike : <b>${callStrike}</b>
    Premium: <b>${callPrice.toFixed(2)}</b>

    🔴 <b>PUT LEG</b>
    Symbol : <code>${put.symbol}</code>
    Strike : <b>${putStrike}</b>
    Premium: <b>${putPrice.toFixed(2)}</b>

    ━━━━━━━━━━━━━━━
    💰 <b>TOTAL PREMIUM</b>: <b>${initialPremium.toFixed(2)}</b>
    ━━━━━━━━━━━━━━━

    🕒 Time: ${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}
    `);
}

// 🔁 MONITOR
async function monitor() {
    if (!position) return;

    const callPrice = await getMark(position.callSymbol);
    const putPrice = await getMark(position.putSymbol);

    const currentPremium = callPrice + putPrice;
    const pnl = position.initialPremium - currentPremium;

    //console.log("Premium:", currentPremium);

    // 🚨 Premium doubled alert
    if (!position.alerted && currentPremium >= 2 * position.initialPremium) {
        await sendTelegram(`🚨 *PREMIUM DOUBLED ALERT*
            ━━━━━━━━━━━━━━━
            📊 *STRANGLE STATUS*
            ━━━━━━━━━━━━━━━

            🟢 *CALL* (${position.callStrike})
            💰 Premium: *${callPrice.toFixed(2)}*

            🔴 *PUT* (${position.putStrike})
            💰 Premium: *${putPrice.toFixed(2)}*

            ━━━━━━━━━━━━━━━
            📈 *SUMMARY*
            ━━━━━━━━━━━━━━━

            Initial Premium : *${position.initialPremium.toFixed(2)}*
            Current Premium : *${currentPremium.toFixed(2)}*

            💹 *PnL*: ${pnl >= 0 ? "🟢 +" : "🔴 "}${pnl.toFixed(2)}

            ━━━━━━━━━━━━━━━
            ⚠️ Market moving aggressively

            🕒 Time : ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
        `);
        position.alerted = true;
    }

    // 📊 Periodic update (every 60 sec)
    const now = Date.now();
    if (now - lastUpdateTime > 30*60000) {
        //if(currentPremium < position.initialPremium && is_entered) return true
        await sendTelegram(`📊 <b>STRANGLE UPDATE</b>

        🟢 <b>CALL</b>
        Strike: <code>${position.callStrike}</code>
        Premium: <b>${callPrice.toFixed(2)}</b>

        🔴 <b>PUT</b>
        Strike: <code>${position.putStrike}</code>
        Premium: <b>${putPrice.toFixed(2)}</b>

        ━━━━━━━━━━━━━━
        💰 <b>TOTAL:</b> ${currentPremium.toFixed(2)}
        📈 <b>PnL:</b> ${pnl.toFixed(2)}

        🕒 Time : ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
        `);
        lastUpdateTime = now;
        is_entered = true
    }
}

// ❌ EXIT
async function tryExit() {
    if (!position) return;
    if (!inTimeRange(7, 0, 7, 30)) return;

    console.log("🔴 EXIT");

    await sendTelegram(`📤 *STRANGLE EXIT*
        ━━━━━━━━━━━━━━━━━━
        📞 *CALL LEG*
        Symbol : ${position.callSymbol}
        Strike : ${position.callStrike}

        📉 *PUT LEG*
        Symbol : ${position.putSymbol}
        Strike : ${position.putStrike}
        ━━━━━━━━━━━━━━━━━━

        🕒 Time : ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
    `);

    position = null;
    hasEnteredToday = false;
    is_entered = false
}

// 🧠 MAIN LOOP
async function run() {
    if (isRunning) return;
    isRunning = true;

    try {
        await tryEnter();
        await monitor();
        await tryExit();
    } catch (err) {
        console.log("Error:", err.message);
        console.log("Error:", err.stack);
    }

    isRunning = false;
}

// 🔁 START BOT
//setInterval(run, INTERVAL);
module.exports = { run };