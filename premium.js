require("dotenv").config();
const ccxt = require("ccxt");
const math = require("mathjs");

// ================= CONFIG =================
const SYMBOL = "BTC/USDT";
const TIMEFRAME = "5m";
const DAYS = 30;
const RISK_FREE_RATE = 0.01;
const IV = 0.6; // 60% implied volatility
const START_HOUR = 18; // 6 PM IST
const END_HOUR = 7;

// ==========================================

const exchange = new ccxt.binance();

// Black-Scholes
function normCDF(x) {
    return (1.0 + math.erf(x / Math.sqrt(2.0))) / 2.0;
}

function blackScholes(S, K, T, r, sigma, type) {
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    if (type === "call") {
        return S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
    } else {
        return K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1);
    }
}

// Approx delta strike
function getStrikeFromDelta(S, deltaTarget, type) {
    let K = S;

    for (let i = 0; i < 50; i++) {
        let T = 1 / 365;
        let d1 = (Math.log(S / K) + (IV * IV / 2) * T) / (IV * Math.sqrt(T));
        let delta = type === "call" ? normCDF(d1) : normCDF(d1) - 1;

        if (Math.abs(delta - deltaTarget) < 0.01) break;

        K += (delta - deltaTarget) * 500;
    }

    return K;
}

// Fetch candles
async function fetchData() {
    const since = Date.now() - DAYS * 24 * 60 * 60 * 1000;
    return await exchange.fetchOHLCV(SYMBOL, TIMEFRAME, since);
}

// ================= BACKTEST =================
async function backtest() {
    const candles = await fetchData();

    let balance = 0;
    let trades = [];

    for (let i = 0; i < candles.length; i++) {
        let [time, open, high, low, close] = candles[i];
        let date = new Date(time);

        if (date.getUTCHours() !== 12) continue; // 6 PM IST

        let S = close;

        // 10 delta strikes
        let callK = getStrikeFromDelta(S, 0.1, "call");
        let putK = getStrikeFromDelta(S, -0.1, "put");

        let T = 1 / 365;

        let callPremium = blackScholes(S, callK, T, RISK_FREE_RATE, IV, "call");
        let putPremium = blackScholes(S, putK, T, RISK_FREE_RATE, IV, "put");

        let totalPremium = callPremium + putPremium;

        let pnl = totalPremium;
        let straddles = 0;
        let hedged = false;

        // simulate next candles
        for (let j = i + 1; j < candles.length; j++) {
            let [t, o, h, l, c] = candles[j];

            let move = (c - S) / S;

            // Adjustment
            if (Math.abs(c - callK) < 100 || Math.abs(c - putK) < 100) {
                if (straddles === 0) {
                    straddles++;
                    pnl -= blackScholes(c, c, T, RISK_FREE_RATE, IV, "call");
                    pnl -= blackScholes(c, c, T, RISK_FREE_RATE, IV, "put");
                }
            }

            // Second straddle
            if (Math.abs(move) > 0.01 && straddles < 2) {
                straddles++;
                pnl -= blackScholes(c, c, T, RISK_FREE_RATE, IV, "call");
                pnl -= blackScholes(c, c, T, RISK_FREE_RATE, IV, "put");
            }

            // Hedge
            if (Math.abs(move) > 0.012 && !hedged) {
                hedged = true;
                pnl -= blackScholes(c, c, T, RISK_FREE_RATE, IV, Math.sign(move) > 0 ? "call" : "put");
            }

            // Stop loss
            if (pnl < -1.5 * totalPremium) break;

            let exitHour = new Date(t).getUTCHours();
            if (exitHour === 1) break; // 7 AM IST
        }

        balance += pnl;

        trades.push({
            time: date,
            pnl: pnl.toFixed(2),
            premium: totalPremium.toFixed(2)
        });
    }

    console.log("Total PnL:", balance.toFixed(2));
    console.log("Trades:", trades.length);

    let wins = trades.filter(t => t.pnl > 0).length;
    console.log("Win Rate:", (wins / trades.length * 100).toFixed(2), "%");
}

backtest();