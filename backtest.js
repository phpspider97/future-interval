require("dotenv").config();

const ccxt = require("ccxt");
const ti = require("technicalindicators");

// ======================================
// CONFIG
// ======================================

const API_KEY = process.env.GRID_WEB_KEY;
const API_SECRET = process.env.GRID_WEB_SECRET;

const SYMBOL = "BTCUSD";

const TIMEFRAME = "5m";

const EMA_FAST = 9;
const EMA_SLOW = 21;

const SL_BUFFER_PERCENT = 0.15;

const SWING_LOOKBACK = 20;

const INITIAL_CAPITAL = 10000;

// ======================================
// DELTA EXCHANGE
// ======================================

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

// ======================================
// GET SWING HIGH
// ======================================

function getSwingHigh(highs, index) {

    const start = Math.max(
        0,
        index - SWING_LOOKBACK
    );

    return Math.max(
        ...highs.slice(start, index)
    );
}

// ======================================
// GET SWING LOW
// ======================================

function getSwingLow(lows, index) {

    const start = Math.max(
        0,
        index - SWING_LOOKBACK
    );

    return Math.min(
        ...lows.slice(start, index)
    );
}

// ======================================
// BACKTEST
// ======================================

async function backtest() {

    console.log("Fetching Data...");

    const candles = await exchange.fetchOHLCV(
        SYMBOL,
        TIMEFRAME,
        undefined,
        2000
    );

    const closePrices = candles.map(c => c[4]);
    const highs = candles.map(c => c[2]);
    const lows = candles.map(c => c[3]);

    // ======================================
    // EMA
    // ======================================

    const ema9 = ti.EMA.calculate({
        period: EMA_FAST,
        values: closePrices
    });

    const ema21 = ti.EMA.calculate({
        period: EMA_SLOW,
        values: closePrices
    });

    let balance = INITIAL_CAPITAL;

    let totalTrades = 0;
    let wins = 0;
    let losses = 0;

    let totalProfit = 0;
    let totalLoss = 0;

    const results = [];

    // ======================================
    // LOOP
    // ======================================

    for (
        let i = EMA_SLOW + 5;
        i < candles.length - 1;
        i++
    ) {

        const ema9Current =
            ema9[i - EMA_FAST];

        const ema9Prev =
            ema9[i - EMA_FAST - 1];

        const ema21Current =
            ema21[i - EMA_SLOW];

        const ema21Prev =
            ema21[i - EMA_SLOW - 1];

        if (
            ema9Current === undefined ||
            ema21Current === undefined
        ) {
            continue;
        }

        const entry =
            closePrices[i];

        const candleTime =
            new Date(candles[i][0]);

        // ======================================
        // BUY CROSS
        // ======================================

        const bullishCross =
            ema9Prev <= ema21Prev &&
            ema9Current > ema21Current;

        // ======================================
        // SELL CROSS
        // ======================================

        const bearishCross =
            ema9Prev >= ema21Prev &&
            ema9Current < ema21Current;

        // ======================================
        // BUY TRADE
        // ======================================

        if (bullishCross) {

            totalTrades++;

            // SL BELOW EMA21
            const sl =
                ema21Current -
                (
                    ema21Current *
                    SL_BUFFER_PERCENT /
                    100
                );

            // TP = SWING HIGH
            const tp =
                getSwingHigh(highs, i);

            const slDistance =
                entry - sl;

            const tpDistance =
                tp - entry;

            const rrRatio =
                slDistance > 0
                    ? (
                        tpDistance /
                        slDistance
                    ).toFixed(2)
                    : "-";

            let result = "OPEN";

            let exitPrice = entry;

            // ======================================
            // CHECK FUTURE CANDLES
            // ======================================

            for (
                let j = i + 1;
                j < candles.length;
                j++
            ) {

                const futureHigh =
                    highs[j];

                const futureLow =
                    lows[j];

                // TP HIT
                if (
                    futureHigh >= tp
                ) {

                    result = "WIN";

                    exitPrice = tp;

                    wins++;

                    const profit =
                        tp - entry;

                    totalProfit += profit;

                    balance += profit;

                    break;
                }

                // SL HIT
                if (
                    futureLow <= sl
                ) {

                    result = "LOSS";

                    exitPrice = sl;

                    losses++;

                    const loss =
                        entry - sl;

                    totalLoss += loss;

                    balance -= loss;

                    break;
                }
            }

            // ======================================
            // STORE RESULT
            // ======================================

            results.push({
                Time: candleTime.toLocaleString(
                    "en-IN"
                ),
                Type: "BUY",

                Entry:
                    entry.toFixed(2),

                SL:
                    sl.toFixed(2),

                TP:
                    tp.toFixed(2),

                "SL Diff":
                    slDistance.toFixed(2),

                "TP Diff":
                    tpDistance.toFixed(2),

                "RR Ratio":
                    rrRatio,

                Exit:
                    exitPrice.toFixed(2),

                Result:
                    result,

                Balance:
                    balance.toFixed(2)
            });
        }

        // ======================================
        // SELL TRADE
        // ======================================

        if (bearishCross) {

            totalTrades++;

            // SL ABOVE EMA21
            const sl =
                ema21Current +
                (
                    ema21Current *
                    SL_BUFFER_PERCENT /
                    100
                );

            // TP = SWING LOW
            const tp =
                getSwingLow(lows, i);

            const slDistance =
                sl - entry;

            const tpDistance =
                entry - tp;

            const rrRatio =
                slDistance > 0
                    ? (
                        tpDistance /
                        slDistance
                    ).toFixed(2)
                    : "-";

            let result = "OPEN";

            let exitPrice = entry;

            // ======================================
            // CHECK FUTURE CANDLES
            // ======================================

            for (
                let j = i + 1;
                j < candles.length;
                j++
            ) {

                const futureHigh =
                    highs[j];

                const futureLow =
                    lows[j];

                // TP HIT
                if (
                    futureLow <= tp
                ) {

                    result = "WIN";

                    exitPrice = tp;

                    wins++;

                    const profit =
                        entry - tp;

                    totalProfit += profit;

                    balance += profit;

                    break;
                }

                // SL HIT
                if (
                    futureHigh >= sl
                ) {

                    result = "LOSS";

                    exitPrice = sl;

                    losses++;

                    const loss =
                        sl - entry;

                    totalLoss += loss;

                    balance -= loss;

                    break;
                }
            }

            // ======================================
            // STORE RESULT
            // ======================================

            results.push({
                Time: candleTime.toLocaleString(
                    "en-IN"
                ),
                Type: "SELL",

                Entry:
                    entry.toFixed(2),

                SL:
                    sl.toFixed(2),

                TP:
                    tp.toFixed(2),

                "SL Diff":
                    slDistance.toFixed(2),

                "TP Diff":
                    tpDistance.toFixed(2),

                "RR Ratio":
                    rrRatio,

                Exit:
                    exitPrice.toFixed(2),

                Result:
                    result,

                Balance:
                    balance.toFixed(2)
            });
        }
    }

    // ======================================
    // SUMMARY
    // ======================================

    const winRate =
        totalTrades > 0
            ? (
                (
                    wins /
                    totalTrades
                ) * 100
            ).toFixed(2)
            : 0;

    console.clear();

    console.log("=================================");
    console.log(" EMA CROSS BACKTEST ");
    console.log("=================================\n");

    console.table(results);

    console.log("\n=================================");
    console.log(" BACKTEST SUMMARY ");
    console.log("=================================\n");

    console.table([
        {
            Symbol: SYMBOL,
            Timeframe: TIMEFRAME,

            Trades: totalTrades,

            Wins: wins,

            Losses: losses,

            "Win Rate %":
                winRate,

            Profit:
                totalProfit.toFixed(2),

            Loss:
                totalLoss.toFixed(2),

            FinalBalance:
                balance.toFixed(2)
        }
    ]);
}

// ======================================
// START
// ======================================

backtest();