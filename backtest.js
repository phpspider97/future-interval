require("dotenv").config();

const ccxt = require("ccxt");
const ti = require("technicalindicators");

// ======================================================
// EXCHANGE
// ======================================================

const exchange = new ccxt.delta({
    enableRateLimit: true,
    options: {
        defaultType: "future"
    },
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

const TIMEFRAME = "15m";

const FAST_EMA = 21;
const SLOW_EMA = 50;
const TREND_EMA = 200;

const RSI_LENGTH = 14;

const RR = 1

const STOP_BUFFER = 0.15;

const VOLUME_MULTIPLIER = 1.2;

const INITIAL_BALANCE = 1000;

// ======================================================
// FETCH HISTORICAL DATA
// ======================================================

async function fetchAllCandles() {

    let since =
        Date.now() - (30 * 24 * 60 * 60 * 1000);

    let allCandles = [];

    while (true) {

        const candles =
            await exchange.fetchOHLCV(
                SYMBOL,
                TIMEFRAME,
                since,
                1000
            );

        if (!candles.length) {
            break;
        }

        allCandles.push(...candles);

        since =
            candles[candles.length - 1][0] + 1;

        console.log(
            `Fetched Candles: ${allCandles.length}`
        );

        await new Promise(
            r => setTimeout(r, 500)
        );

        if (candles.length < 1000) {
            break;
        }
    }

    return allCandles.map(c => ({
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

async function backtest() {

    const candles =
        await fetchAllCandles();

    console.log(
        `Total Candles: ${candles.length}`
    );

    const closes =
        candles.map(c => c.close);

    const volumes =
        candles.map(c => c.volume);

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
    // OFFSET
    // ==================================================

    const offset = TREND_EMA + 5;

    // ==================================================
    // STATS
    // ==================================================

    let balance = INITIAL_BALANCE;

    let peakBalance = INITIAL_BALANCE;

    let maxDrawdown = 0;

    let wins = 0;

    let losses = 0;

    let grossProfit = 0;

    let grossLoss = 0;

    const trades = [];

    // ==================================================
    // MAIN LOOP
    // ==================================================

    for (
        let i = offset;
        i < candles.length - 20;
        i++
    ) {

        const candle =
            candles[i];

        const price =
            candle.close;

        // ==============================================
        // EMA VALUES
        // ==============================================

        const fast =
            fastEMA[
                i - FAST_EMA
            ];

        const slow =
            slowEMA[
                i - SLOW_EMA
            ];

        const trend =
            trendEMA[
                i - TREND_EMA
            ];

        const trendPrev =
            trendEMA[
                i - TREND_EMA - 1
            ];

        // ==============================================
        // RSI
        // ==============================================

        const currentRSI =
            rsi[
                i - RSI_LENGTH
            ];

        // ==============================================
        // VOLUME
        // ==============================================

        const avgVolume =
            volumes
                .slice(i - 25, i)
                .reduce(
                    (a, b) => a + b,
                    0
                ) / 25;

        const highVolume =
            candle.volume >
            avgVolume *
            VOLUME_MULTIPLIER;

        // ==============================================
        // TREND
        // ==============================================

        const bullishTrend =
            price > trend;

        const bearishTrend =
            price < trend;

        const bullishSlope =
            trend > trendPrev;

        const bearishSlope =
            trend < trendPrev;

        // ==============================================
        // EMA STRUCTURE
        // ==============================================

        const emaBullish =
            fast > slow;

        const emaBearish =
            fast < slow;

        // ==============================================
        // EMA REJECTION
        // ==============================================

        const rejectionBuy =
            candle.low <= fast &&
            candle.close > fast;

        const rejectionSell =
            candle.high >= fast &&
            candle.close < fast;

        // ==============================================
        // BUY SIGNAL
        // ==============================================

        const buySignal =
            bullishTrend &&
            bullishSlope &&
            emaBullish &&
            rejectionBuy &&
            highVolume &&
            currentRSI > 52;

        // ==============================================
        // SELL SIGNAL
        // ==============================================

        const sellSignal =
            bearishTrend &&
            bearishSlope &&
            emaBearish &&
            rejectionSell &&
            highVolume &&
            currentRSI < 48;

        // ==============================================
        // SKIP
        // ==============================================

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
            candles[i + 1].open;

        let side;

        let sl;

        let tp;

        // ==============================================
        // BUY
        // ==============================================

        if (buySignal) {

            side = "BUY";

            sl =
                candle.low *
                (
                    1 -
                    STOP_BUFFER / 100
                );

            const risk =
                entry - sl;

            tp =
                entry +
                (
                    risk * RR
                );
        }

        // ==============================================
        // SELL
        // ==============================================

        else {

            side = "SELL";

            sl =
                candle.high *
                (
                    1 +
                    STOP_BUFFER / 100
                );

            const risk =
                sl - entry;

            tp =
                entry -
                (
                    risk * RR
                );
        }

        // ==============================================
        // POINTS
        // ==============================================

        const slPoints =
            Math.abs(entry - sl);

        const tpPoints =
            Math.abs(tp - entry);

        // ==============================================
        // RESULT
        // ==============================================

        let result = "OPEN";

        // ==============================================
        // CHECK NEXT CANDLES
        // ==============================================

        for (
            let j = i + 1;
            j < i + 20;
            j++
        ) {

            const next =
                candles[j];

            // ==========================================
            // BUY
            // ==========================================

            if (side === "BUY") {

                if (
                    next.low <= sl
                ) {

                    result = "LOSS";

                    balance -= 100;

                    grossLoss += 100;

                    losses++;

                    break;
                }

                if (
                    next.high >= tp
                ) {

                    result = "WIN";

                    balance += 150;

                    grossProfit += 150;

                    wins++;

                    break;
                }
            }

            // ==========================================
            // SELL
            // ==========================================

            else {

                if (
                    next.high >= sl
                ) {

                    result = "LOSS";

                    balance -= 100;

                    grossLoss += 100;

                    losses++;

                    break;
                }

                if (
                    next.low <= tp
                ) {

                    result = "WIN";

                    balance += 150;

                    grossProfit += 150;

                    wins++;

                    break;
                }
            }
        }

        // ==============================================
        // DRAWDOWN
        // ==============================================

        peakBalance =
            Math.max(
                peakBalance,
                balance
            );

        const drawdown =
            (
                (
                    peakBalance -
                    balance
                ) / peakBalance
            ) * 100;

        maxDrawdown =
            Math.max(
                maxDrawdown,
                drawdown
            );

        // ==============================================
        // STORE TRADE
        // ==============================================

        trades.push({

            Date:
                new Date(
                    candle.time
                ).toLocaleString(),

            Side: side,

            Entry:
                entry.toFixed(2),

            SL:
                sl.toFixed(2),

            TP:
                tp.toFixed(2),

            "SL Points":
                slPoints.toFixed(2),

            "TP Points":
                tpPoints.toFixed(2),

            RSI:
                currentRSI.toFixed(2),

            Result: result,

            Balance:
                balance.toFixed(2)
        });
    }

    // ==================================================
    // FINAL STATS
    // ==================================================

    const totalTrades =
        wins + losses;

    const winRate =
        (
            wins / totalTrades
        ) * 100;

    const profitFactor =
        grossProfit / grossLoss;

    const avgSL =
        trades.reduce(
            (a, b) =>
                a +
                Number(
                    b["SL Points"]
                ),
            0
        ) / trades.length;

    const avgTP =
        trades.reduce(
            (a, b) =>
                a +
                Number(
                    b["TP Points"]
                ),
            0
        ) / trades.length;

    // ==================================================
    // RESULTS
    // ==================================================

    console.log(
        "\n========== BACKTEST RESULTS ==========\n"
    );

    console.table(
        trades.slice(-20)
    );

    console.log(
        `Symbol: ${SYMBOL}`
    );

    console.log(
        `Timeframe: ${TIMEFRAME}`
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
        `Average SL Points: ${avgSL.toFixed(2)}`
    );

    console.log(
        `Average TP Points: ${avgTP.toFixed(2)}`
    );

    console.log(
        `Profit Factor: ${profitFactor.toFixed(2)}`
    );

    console.log(
        `Max Drawdown: ${maxDrawdown.toFixed(2)}%`
    );

    console.log(
        `Final Balance: ${balance.toFixed(2)}`
    );
}

// ======================================================
// START
// ======================================================

backtest();