require("dotenv").config();

const ccxt = require("ccxt");
const ti = require("technicalindicators");

// ======================================================
// EXCHANGE
// ======================================================

const exchange = new ccxt.binance({
    enableRateLimit: true
});

// ======================================================
// CONFIG
// ======================================================

const SYMBOL = "BTC/USDT";

const TIMEFRAME = "1m";

// ======================================================
// DAYS
// ======================================================

// node backtest.js 365

const DAYS =
    Number(process.argv[2]) || 30;

// ======================================================
// STRATEGY
// ======================================================

const FAST_EMA = 21;

const SLOW_EMA = 50;

const TREND_EMA = 200;

const RSI_LENGTH = 14;

const VOLUME_MULTIPLIER = 1.2;

const STOP_BUFFER_PERCENT = 0.15;

const RISK_REWARD = 1.5;

// ======================================================
// REALISTIC SETTINGS
// ======================================================

const FEES_PERCENT = 0.05;

const SLIPPAGE_PERCENT = 0.02;

const COOLDOWN_CANDLES = 5;

const MAX_HOLD_CANDLES = 50;

// ======================================================
// FETCH DATA
// ======================================================

async function getCandles() {

    let allCandles = [];

    const limit = 1000;

    let since =
        Date.now() -
        DAYS * 24 * 60 * 60 * 1000;

    while (true) {

        console.log(
            `Fetching:
            ${new Date(since).toLocaleString()}`
        );

        const candles =
            await exchange.fetchOHLCV(
                SYMBOL,
                TIMEFRAME,
                since,
                limit
            );

        if (!candles.length) {
            break;
        }

        allCandles =
            allCandles.concat(candles);

        since =
            candles[candles.length - 1][0] + 1;

        console.log(
            `Fetched:
            ${allCandles.length}`
        );

        if (candles.length < limit) {
            break;
        }
    }

    // ==================================================
    // REMOVE DUPLICATES
    // ==================================================

    const uniqueCandles =
        Array.from(
            new Map(
                allCandles.map(c => [c[0], c])
            ).values()
        );

    return uniqueCandles.map(c => ({
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

    console.log("\nFETCHING DATA...\n");

    const candles =
        await getCandles();

    console.log(
        `\nTOTAL CANDLES:
        ${candles.length}\n`
    );

    // ==================================================
    // ARRAYS
    // ==================================================

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
    // START INDEX
    // ==================================================

    const startIndex =
        TREND_EMA + 10;

    // ==================================================
    // STATS
    // ==================================================

    let totalTrades = 0;

    let wins = 0;

    let losses = 0;

    let totalPnL = 0;

    let maxWin = 0;

    let maxLoss = 0;

    let lastTradeIndex = -999;

    let tradeLogs = [];

    // ==================================================
    // HOURLY STATS
    // ==================================================

    const hourlyStats = {};

    for (let h = 0; h < 24; h++) {

        hourlyStats[h] = {

            trades: 0,

            wins: 0,

            losses: 0,

            pnl: 0
        };
    }

    // ==================================================
    // MAIN LOOP
    // ==================================================

    for (
        let i = startIndex;
        i < candles.length - 1;
        i++
    ) {

        // ==============================================
        // COOLDOWN
        // ==============================================

        if (
            i - lastTradeIndex <
            COOLDOWN_CANDLES
        ) {
            continue;
        }

        const candle =
            candles[i];

        const prevCandle =
            candles[i - 1];

        // ==============================================
        // EMA FIX
        // ==============================================

        const fastCurrent =
            fastEMA[i - FAST_EMA];

        const slowCurrent =
            slowEMA[i - SLOW_EMA];

        const trendCurrent =
            trendEMA[i - TREND_EMA];

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
        // CONDITIONS
        // ==============================================

        const bullishTrend =
            candle.close >
            trendCurrent;

        const bearishTrend =
            candle.close <
            trendCurrent;

        const emaBullish =
            fastCurrent >
            slowCurrent;

        const emaBearish =
            fastCurrent <
            slowCurrent;

        const nearFastEMAForBuy =
            candle.close <=
            fastCurrent * 1.001;

        const nearFastEMAForSell =
            candle.close >=
            fastCurrent * 0.999;

        const bullishCandle =
            candle.close >
            candle.open &&
            candle.close >
            prevCandle.high;

        const bearishCandle =
            candle.close <
            candle.open &&
            candle.close <
            prevCandle.low;

        const avgVolume =
            volumes
                .slice(i - 25, i)
                .reduce((a, b) => a + b, 0) / 25;

        const highVolume =
            candle.volume >
            avgVolume *
            VOLUME_MULTIPLIER;

        // ==============================================
        // SIGNALS
        // ==============================================

        const buySignal =

            bullishTrend &&
            emaBullish &&
            nearFastEMAForBuy &&
            bullishCandle &&
            highVolume &&
            rsiCurrent > 50;

        const sellSignal =

            bearishTrend &&
            emaBearish &&
            nearFastEMAForSell &&
            bearishCandle &&
            highVolume &&
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

        lastTradeIndex = i;

        totalTrades++;

        // ==============================================
        // TRADE HOUR
        // ==============================================

        const tradeHour =
            new Date(candle.time)
                .getUTCHours();

        // UTC → IST
        const indiaHour =
            (tradeHour + 5 + 30 / 60) % 24;

        const hourKey =
            Math.floor(indiaHour);

        hourlyStats[hourKey].trades++;

        // ==============================================
        // ENTRY
        // ==============================================

        let side = "";

        let entry =
            candle.close;

        // ==============================================
        // SLIPPAGE
        // ==============================================

        if (buySignal) {

            side = "BUY";

            entry =
                entry *
                (
                    1 +
                    SLIPPAGE_PERCENT / 100
                );
        }

        if (sellSignal) {

            side = "SELL";

            entry =
                entry *
                (
                    1 -
                    SLIPPAGE_PERCENT / 100
                );
        }

        let sl;

        let tp;

        // ==============================================
        // BUY
        // ==============================================

        if (buySignal) {

            sl =
                fastCurrent *
                (
                    1 -
                    STOP_BUFFER_PERCENT / 100
                );

            const risk =
                entry - sl;

            tp =
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

            sl =
                fastCurrent *
                (
                    1 +
                    STOP_BUFFER_PERCENT / 100
                );

            const risk =
                sl - entry;

            tp =
                entry -
                (
                    risk *
                    RISK_REWARD
                );
        }

        // ==============================================
        // TRADE MANAGEMENT
        // ==============================================

        let result = "OPEN";

        let pnl = 0;

        let exitPrice = 0;

        let holdCandles = 0;

        for (
            let j = i + 1;
            j < candles.length;
            j++
        ) {

            holdCandles++;

            const next =
                candles[j];

            // ==========================================
            // TIME EXIT
            // ==========================================

            if (
                holdCandles >=
                MAX_HOLD_CANDLES
            ) {

                exitPrice =
                    next.close;

                if (side === "BUY") {

                    pnl =
                        exitPrice - entry;
                }

                if (side === "SELL") {

                    pnl =
                        entry - exitPrice;
                }

                result = "TIME EXIT";

                totalPnL += pnl;

                hourlyStats[hourKey].pnl += pnl;

                break;
            }

            // ==========================================
            // BUY EXIT
            // ==========================================

            if (side === "BUY") {

                // LOSS
                if (next.low <= sl) {

                    exitPrice = sl;

                    pnl =
                        sl - entry;

                    result = "LOSS";

                    losses++;

                    totalPnL += pnl;

                    hourlyStats[hourKey].losses++;

                    hourlyStats[hourKey].pnl += pnl;

                    break;
                }

                // WIN
                if (next.high >= tp) {

                    exitPrice = tp;

                    pnl =
                        tp - entry;

                    result = "WIN";

                    wins++;

                    totalPnL += pnl;

                    hourlyStats[hourKey].wins++;

                    hourlyStats[hourKey].pnl += pnl;

                    break;
                }
            }

            // ==========================================
            // SELL EXIT
            // ==========================================

            if (side === "SELL") {

                // LOSS
                if (next.high >= sl) {

                    exitPrice = sl;

                    pnl =
                        entry - sl;

                    result = "LOSS";

                    losses++;

                    totalPnL += pnl;

                    hourlyStats[hourKey].losses++;

                    hourlyStats[hourKey].pnl += pnl;

                    break;
                }

                // WIN
                if (next.low <= tp) {

                    exitPrice = tp;

                    pnl =
                        entry - tp;

                    result = "WIN";

                    wins++;

                    totalPnL += pnl;

                    hourlyStats[hourKey].wins++;

                    hourlyStats[hourKey].pnl += pnl;

                    break;
                }
            }
        }

        // ==============================================
        // FEES
        // ==============================================

        const fees =
            (
                entry +
                exitPrice
            ) *
            (
                FEES_PERCENT / 100
            );

        pnl -= fees;

        // ==============================================
        // MAX WIN/LOSS
        // ==============================================

        if (pnl > maxWin) {
            maxWin = pnl;
        }

        if (pnl < maxLoss) {
            maxLoss = pnl;
        }

        // ==============================================
        // TRADE LOG
        // ==============================================

        tradeLogs.push({

            Time:
                new Date(candle.time)
                    .toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata"
                    }),

            Hour:
                `${hourKey}:00`,

            Side: side,

            Entry:
                entry.toFixed(2),

            Exit:
                exitPrice.toFixed(2),

            SL:
                sl.toFixed(2),

            TP:
                tp.toFixed(2),

            Result: result,

            Hold:
                holdCandles,

            PnL:
                pnl.toFixed(2)
        });
    }

    // ==================================================
    // TRADE LOGS
    // ==================================================

    console.log("\nTRADE LOGS\n");

    console.table(tradeLogs);

    // ==================================================
    // FINAL RESULT
    // ==================================================

    const winRate =
        totalTrades > 0
            ? (
                wins / totalTrades * 100
            ).toFixed(2)
            : 0;

    console.log("\nFINAL RESULT\n");

    console.table([{

        Symbol: SYMBOL,

        Timeframe: TIMEFRAME,

        Days: DAYS,

        Trades: totalTrades,

        Wins: wins,

        Losses: losses,

        "Win Rate %": winRate,

        "Max Win":
            maxWin.toFixed(2),

        "Max Loss":
            maxLoss.toFixed(2),

        "Total PnL":
            totalPnL.toFixed(2)
    }]);

    // ==================================================
    // HOURLY REPORT
    // ==================================================

    const hourlyTable = [];

    for (let h = 0; h < 24; h++) {

        const stats =
            hourlyStats[h];

        const winRate =
            stats.trades > 0
                ? (
                    stats.wins /
                    stats.trades * 100
                ).toFixed(2)
                : "0.00";

        hourlyTable.push({

            Hour:
                `${h}:00`,

            Trades:
                stats.trades,

            Wins:
                stats.wins,

            Losses:
                stats.losses,

            "Win Rate %":
                winRate,

            PnL:
                stats.pnl.toFixed(2)
        });
    }

    // ==================================================
    // SORT BEST HOURS
    // ==================================================

    hourlyTable.sort(
        (a, b) =>
            Number(b["Win Rate %"]) -
            Number(a["Win Rate %"])
    );

    console.log("\nBEST HOURS (IST)\n");

    console.table(hourlyTable);
}

// ======================================================
// START
// ======================================================

backtest();