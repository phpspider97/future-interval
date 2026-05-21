require("dotenv").config();

const ccxt = require("ccxt");
const ti = require("technicalindicators");

// ======================================================
// EXCHANGE
// ======================================================

const exchange = new ccxt.delta({
    enableRateLimit: true,
    urls: {
        api: {
            public: "https://api.india.delta.exchange",
            private: "https://api.india.delta.exchange",
        }
    }
});

// ======================================================
// CONFIG
// ======================================================

const SYMBOL = "BTCUSD";
const TIMEFRAME = "5m";

const FAST_EMA = 21;
const SLOW_EMA = 50;
const TREND_EMA = 200;

const RSI_LENGTH = 14;

const STOP_BUFFER_PERCENT = 0.3;
const RISK_REWARD = 2;

const INITIAL_BALANCE = 1000;
const RISK_PER_TRADE = 100;

const CANDLE_LIMIT = 5000;

// ======================================================
// FETCH CANDLES
// ======================================================

async function getCandles() {

    console.log("Fetching candles...");

    const candles =
        await exchange.fetchOHLCV(
            SYMBOL,
            TIMEFRAME,
            undefined,
            CANDLE_LIMIT
        );

    return candles.map(c => ({
        time: c[0],
        open: c[1],
        high: c[2],
        low: c[3],
        close: c[4],
        volume: c[5]
    }));
}

// ======================================================
// BACKTEST
// ======================================================

async function runBacktest() {

    try {

        const candles =
            await getCandles();

        const closes =
            candles.map(c => c.close);

        // ==================================================
        // INDICATORS
        // ==================================================

        const fastEMA =
            ti.EMA.calculate({
                period: FAST_EMA,
                values: closes
            });

        const slowEMA =
            ti.EMA.calculate({
                period: SLOW_EMA,
                values: closes
            });

        const trendEMA =
            ti.EMA.calculate({
                period: TREND_EMA,
                values: closes
            });

        const rsi =
            ti.RSI.calculate({
                period: RSI_LENGTH,
                values: closes
            });

        // ==================================================
        // START INDEX
        // ==================================================

        const startIndex =
            TREND_EMA + 5;

        // ==================================================
        // STATS
        // ==================================================

        let balance =
            INITIAL_BALANCE;

        let totalTrades = 0;
        let wins = 0;
        let losses = 0;

        let totalProfit = 0;
        let totalLoss = 0;

        // ==================================================
        // LOOP
        // ==================================================

        for (
            let i = startIndex;
            i < candles.length - 1;
            i++
        ) {

            // ==============================================
            // EMA VALUES
            // ==============================================

            const fastCurrent =
                fastEMA[i - FAST_EMA];

            const fastPrevious =
                fastEMA[
                    i - FAST_EMA - 1
                ];

            const slowCurrent =
                slowEMA[i - SLOW_EMA];

            const slowPrevious =
                slowEMA[
                    i - SLOW_EMA - 1
                ];

            const trendCurrent =
                trendEMA[
                    i - TREND_EMA
                ];

            const rsiCurrent =
                rsi[i - RSI_LENGTH];

            if (
                !fastCurrent ||
                !slowCurrent ||
                !trendCurrent ||
                !rsiCurrent
            ) {
                continue;
            }

            // ==============================================
            // CROSSOVER
            // ==============================================

            const bullCross =
                fastPrevious <
                slowPrevious &&
                fastCurrent >
                slowCurrent;

            const bearCross =
                fastPrevious >
                slowPrevious &&
                fastCurrent <
                slowCurrent;

            // ==============================================
            // TREND
            // ==============================================

            const bullishTrend =
                fastCurrent >
                trendCurrent;

            const bearishTrend =
                fastCurrent <
                trendCurrent;

            // ==============================================
            // SIGNALS
            // ==============================================

            const buySignal =
                bullCross &&
                bullishTrend &&
                rsiCurrent > 50;

            const sellSignal =
                bearCross &&
                bearishTrend &&
                rsiCurrent < 50;

            if (
                !buySignal &&
                !sellSignal
            ) {
                continue;
            }

            // ==============================================
            // ENTRY
            // ==============================================

            const entry =
                candles[i].close;

            let stopLoss;
            let takeProfit;

            let side = "";

            // ==============================================
            // BUY
            // ==============================================

            if (buySignal) {

                side = "BUY";

                stopLoss =
                    fastCurrent *
                    (
                        1 -
                        STOP_BUFFER_PERCENT / 100
                    );

                const risk =
                    entry - stopLoss;

                takeProfit =
                    entry +
                    (
                        risk *
                        RISK_REWARD
                    );
            }

            // ==============================================
            // SELL
            // ==============================================

            if (sellSignal) {

                side = "SELL";

                stopLoss =
                    fastCurrent *
                    (
                        1 +
                        STOP_BUFFER_PERCENT / 100
                    );

                const risk =
                    stopLoss - entry;

                takeProfit =
                    entry -
                    (
                        risk *
                        RISK_REWARD
                    );
            }

            // ==============================================
            // CHECK FUTURE CANDLES
            // ==============================================

            let tradeClosed = false;

            for (
                let j = i + 1;
                j < candles.length;
                j++
            ) {

                const high =
                    candles[j].high;

                const low =
                    candles[j].low;

                // ==========================================
                // BUY RESULT
                // ==========================================

                if (side === "BUY") {

                    // TP HIT
                    if (high >= takeProfit) {

                        const profit =
                            RISK_PER_TRADE *
                            RISK_REWARD;

                        balance += profit;

                        totalProfit += profit;

                        wins++;
                        totalTrades++;

                        console.log(
`✅ BUY WIN

Entry: ${entry}
SL: ${stopLoss.toFixed(2)}
TP: ${takeProfit.toFixed(2)}
Balance: ${balance.toFixed(2)}`
                        );

                        tradeClosed = true;
                        break;
                    }

                    // SL HIT
                    if (low <= stopLoss) {

                        balance -=
                            RISK_PER_TRADE;

                        totalLoss +=
                            RISK_PER_TRADE;

                        losses++;
                        totalTrades++;

                        console.log(
`❌ BUY LOSS

Entry: ${entry}
SL: ${stopLoss.toFixed(2)}
TP: ${takeProfit.toFixed(2)}
Balance: ${balance.toFixed(2)}`
                        );

                        tradeClosed = true;
                        break;
                    }
                }

                // ==========================================
                // SELL RESULT
                // ==========================================

                if (side === "SELL") {

                    // TP HIT
                    if (low <= takeProfit) {

                        const profit =
                            RISK_PER_TRADE *
                            RISK_REWARD;

                        balance += profit;

                        totalProfit += profit;

                        wins++;
                        totalTrades++;

                        console.log(
`✅ SELL WIN

Entry: ${entry}
SL: ${stopLoss.toFixed(2)}
TP: ${takeProfit.toFixed(2)}
Balance: ${balance.toFixed(2)}`
                        );

                        tradeClosed = true;
                        break;
                    }

                    // SL HIT
                    if (high >= stopLoss) {

                        balance -=
                            RISK_PER_TRADE;

                        totalLoss +=
                            RISK_PER_TRADE;

                        losses++;
                        totalTrades++;

                        console.log(
`❌ SELL LOSS

Entry: ${entry}
SL: ${stopLoss.toFixed(2)}
TP: ${takeProfit.toFixed(2)}
Balance: ${balance.toFixed(2)}`
                        );

                        tradeClosed = true;
                        break;
                    }
                }
            }
        }

        // ==================================================
        // FINAL STATS
        // ==================================================

        const winRate =
            (
                wins /
                Math.max(totalTrades, 1)
            ) * 100;

        console.log(
            "\n================================="
        );

        console.log(
            "BACKTEST COMPLETE"
        );

        console.log(
            "================================="
        );

        console.log(
            `Initial Balance: ${INITIAL_BALANCE}`
        );

        console.log(
            `Final Balance: ${balance.toFixed(2)}`
        );

        console.log(
            `Net Profit: ${(balance - INITIAL_BALANCE).toFixed(2)}`
        );

        console.log(
            `Total Trades: ${totalTrades}`
        );

        console.log(
            `Wins: ${wins}`
        );

        console.log(
            `Losses: ${losses}`
        );

        console.log(
            `Win Rate: ${winRate.toFixed(2)}%`
        );

        console.log(
            `Total Profit: ${totalProfit.toFixed(2)}`
        );

        console.log(
            `Total Loss: ${totalLoss.toFixed(2)}`
        );

    } catch (err) {

        console.log(
            "BACKTEST ERROR:"
        );

        console.log(
            err.message
        );
    }
}

// ======================================================
// START
// ======================================================

runBacktest();