require("dotenv").config();

const axios = require("axios");

// ======================================================
// SETTINGS
// ======================================================

const SYMBOL = "PAXGUSD";

const RANGE_POINTS = 2;
const CLOSE_POINTS = 8;

const BASE_LOT = 1;
const MARTINGALE_MULTIPLIER = 2;

const DAYS = 30;

// ======================================================
// FETCH DELTA 1M CANDLES
// ======================================================

async function getCandles() {

    const end =
        Math.floor(Date.now() / 1000);

    const start =
        end - (DAYS * 24 * 60 * 60);

    const response = await axios.get(
        "https://api.india.delta.exchange/v2/history/candles",
        {
            params: {
                symbol: SYMBOL,
                resolution: "1m",
                start,
                end
            }
        }
    );

    return response.data.result || [];
}

// ======================================================
// BACKTEST
// ======================================================

async function runBacktest() {

    const candles = await getCandles();

    if (!candles.length) {

        console.log("No candle data");
        return;
    }

    let basePrice =
        Math.round(Number(candles[0].close));

    let tradeHistory = [];

    let activeTrades = [];

    let nextExpectedSide = null;

    let currentLot = BASE_LOT;

    let totalPnL = 0;

    let totalOrders = 0;

    let totalSessions = 0;

    let winningSessions = 0;

    let losingSessions = 0;

    let maxTradeReachedCount = 0;

    const sessionStats = [];

    const flipDistribution = {};

    // ==================================================
    // LOOP
    // ==================================================

    for (const candle of candles) {

        const high =
            Math.round(Number(candle.high));

        const low =
            Math.round(Number(candle.low));

        const close =
            Math.round(Number(candle.close));

        const upperBreak =
            basePrice + RANGE_POINTS;

        const lowerBreak =
            basePrice - RANGE_POINTS;

        const upperTarget =
            basePrice + CLOSE_POINTS;

        const lowerTarget =
            basePrice - CLOSE_POINTS;

        // ==========================================
        // FIRST ENTRY
        // ==========================================

        if (!nextExpectedSide) {

            if (high >= upperBreak) {

                activeTrades.push({
                    side: "buy",
                    entry: upperBreak,
                    lot: currentLot
                });

                tradeHistory.push({
                    side: "buy",
                    lot: currentLot
                });

                totalOrders++;

                nextExpectedSide = "sell";

                if (tradeHistory.length < 8) {
                    currentLot *= MARTINGALE_MULTIPLIER;
                }
            }

            else if (low <= lowerBreak) {

                activeTrades.push({
                    side: "sell",
                    entry: lowerBreak,
                    lot: currentLot
                });

                tradeHistory.push({
                    side: "sell",
                    lot: currentLot
                });

                totalOrders++;

                nextExpectedSide = "buy";

                if (tradeHistory.length < 8) {
                    currentLot *= MARTINGALE_MULTIPLIER;
                }
            }
        }

        // ==========================================
        // FLIP ENTRIES
        // ==========================================

        else {

            if (
                nextExpectedSide === "sell" &&
                low <= lowerBreak
            ) {

                activeTrades.push({
                    side: "sell",
                    entry: lowerBreak,
                    lot: currentLot
                });

                tradeHistory.push({
                    side: "sell",
                    lot: currentLot
                });

                totalOrders++;

                nextExpectedSide = "buy";

                if (tradeHistory.length < 8) {
                    currentLot *= MARTINGALE_MULTIPLIER;
                }
            }

            else if (
                nextExpectedSide === "buy" &&
                high >= upperBreak
            ) {

                activeTrades.push({
                    side: "buy",
                    entry: upperBreak,
                    lot: currentLot
                });

                tradeHistory.push({
                    side: "buy",
                    lot: currentLot
                });

                totalOrders++;

                nextExpectedSide = "sell";

                if (tradeHistory.length < 8) {
                    currentLot *= MARTINGALE_MULTIPLIER;
                }
            }
        }

        // ==========================================
        // MAX TRADE REACHED
        // ==========================================

        if (
            tradeHistory.length === 5
        ) {
            maxTradeReachedCount++;
        }

        // ==========================================
        // TARGET CHECK
        // ==========================================

        let exitPrice = null;

        if (high >= upperTarget) {
            exitPrice = upperTarget;
        }

        else if (low <= lowerTarget) {
            exitPrice = lowerTarget;
        }

        if (exitPrice === null) continue;

        // ==========================================
        // SESSION PNL
        // ==========================================

        let sessionPnL = 0;

        for (const trade of activeTrades) {

            if (trade.side === "buy") {

                sessionPnL +=
                    (exitPrice - trade.entry) *
                    trade.lot;
            }

            else {

                sessionPnL +=
                    (trade.entry - exitPrice) *
                    trade.lot;
            }
        }

        // ==========================================
        // FLIP COUNT
        // ==========================================

        let flips = 0;

        for (
            let i = 1;
            i < tradeHistory.length;
            i++
        ) {

            if (
                tradeHistory[i].side !==
                tradeHistory[i - 1].side
            ) {
                flips++;
            }
        }

        flipDistribution[flips] =
            (flipDistribution[flips] || 0) + 1;

        totalPnL += sessionPnL;

        totalSessions++;

        if (sessionPnL > 0) {
            winningSessions++;
        } else {
            losingSessions++;
        }

        sessionStats.push({
            SESSION: totalSessions,
            ORDERS: tradeHistory.length,
            FLIPS: flips,
            PNL: sessionPnL.toFixed(2)
        });

        // ==========================================
        // RESET SESSION
        // ==========================================

        basePrice = close;

        tradeHistory = [];

        activeTrades = [];

        nextExpectedSide = null;

        currentLot = BASE_LOT;
    }

    // ==================================================
    // SUMMARY
    // ==================================================

    console.log("\n==============================");
    console.log("BACKTEST SUMMARY");
    console.log("==============================");

    console.table([{
        DAYS,

        TOTAL_SESSIONS:
            totalSessions,

        TOTAL_ORDERS:
            totalOrders,

        AVG_ORDERS_PER_SESSION:
            totalSessions
                ? (
                    totalOrders /
                    totalSessions
                ).toFixed(2)
                : 0,

        WINNING_SESSIONS:
            winningSessions,

        LOSING_SESSIONS:
            losingSessions,

        WIN_RATE:
            totalSessions
                ? (
                    winningSessions /
                    totalSessions *
                    100
                ).toFixed(2) + "%"
                : "0%",

        MAX_TRADE_REACHED:
            maxTradeReachedCount,

        TOTAL_PNL:
            totalPnL.toFixed(2)
    }]);

    console.log("\n==============================");
    console.log("SESSION DETAILS");
    console.log("==============================");

    console.table(sessionStats);

    console.log("\n==============================");
    console.log("FLIP DISTRIBUTION");
    console.log("==============================");

    console.table(
        Object.entries(
            flipDistribution
        ).map(([flip, count]) => ({
            FLIPS: Number(flip),
            SESSIONS: count
        }))
    );
}

// ======================================================
// START
// ======================================================

runBacktest().catch(console.error);