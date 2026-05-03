require("ccxt");

const ccxt = require("ccxt");
const exchange = new ccxt.binance();

const SYMBOL = "BTC/USDT";
const TIMEFRAME = "15m";
const LIMIT = 100000;

// ===== Math Functions =====
function mean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr) {
    const m = mean(arr);
    return Math.sqrt(arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / arr.length);
}

function zScore(price, mu, sigma) {
    return (price - mu) / sigma;
}

function slope(arr, period = 20) {
    const slice = arr.slice(-period);
    return (slice[slice.length - 1] - slice[0]) / period;
}

// ===== Fetch Historical Data =====
async function fetchData() {
    const ohlcv = await exchange.fetchOHLCV(SYMBOL, TIMEFRAME, undefined, LIMIT);
    return ohlcv.map(c => ({
        time: c[0],
        open: c[1],
        high: c[2],
        low: c[3],
        close: c[4]
    }));
}

// ===== Backtest Engine =====
async function backtest() {
    const data = await fetchData();

    let balance = 1000;
    let equity = balance;
    let peak = balance;
    let drawdown = 0;

    let trades = [];
    let wins = 0;
    let losses = 0;

    let position = null;

    for (let i = 60; i < data.length; i++) {

        const slice = data.slice(i - 50, i);
        const closes = slice.map(d => d.close);

        const mu = mean(closes);
        const sigma = std(closes);

        const current = data[i];
        const price = current.close;

        const z = zScore(price, mu, sigma);
        const trend = slope(closes, 20);

        // ===== Entry =====
        if (!position) {
            if (z < -2 && trend > 0) {
                position = {
                    side: "buy",
                    entry: price,
                    sl: mu - 3 * sigma,
                    tp: mu,
                    time: current.time
                };
            }

            if (z > 2 && trend < 0) {
                position = {
                    side: "sell",
                    entry: price,
                    sl: mu + 3 * sigma,
                    tp: mu,
                    time: current.time
                };
            }
        }

        // ===== Exit =====
        if (position) {
            let exit = null;

            if (position.side === "buy") {
                if (current.low <= position.sl) exit = position.sl;
                if (current.high >= position.tp) exit = position.tp;
            }

            if (position.side === "sell") {
                if (current.high >= position.sl) exit = position.sl;
                if (current.low <= position.tp) exit = position.tp;
            }

            if (exit) {
                let pnl;

                if (position.side === "buy") {
                    pnl = (exit - position.entry) / position.entry;
                } else {
                    pnl = (position.entry - exit) / position.entry;
                }

                balance += balance * pnl;

                if (pnl > 0) wins++;
                else losses++;

                trades.push({
                    side: position.side,
                    entry: position.entry,
                    exit,
                    pnl: pnl * 100,
                    entryTime: new Date(position.time).toLocaleString(),
                    exitTime: new Date(current.time).toLocaleString()
                });

                position = null;

                // ===== Drawdown =====
                if (balance > peak) peak = balance;
                const dd = (peak - balance) / peak;
                if (dd > drawdown) drawdown = dd;
            }
        }
    }

    // ===== Results =====
    console.log("====== BACKTEST RESULT ======");
    console.log("Final Balance:", balance.toFixed(2));
    console.log("Total Trades:", trades.length);
    console.log("Wins:", wins);
    console.log("Losses:", losses);
    console.log("Win Rate:", ((wins / trades.length) * 100).toFixed(2) + "%");
    console.log("Max Drawdown:", (drawdown * 100).toFixed(2) + "%");

    console.log("\nSample Trades:");
    console.log(trades.slice(-5));
}

// Run
backtest();