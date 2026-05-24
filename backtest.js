require("dotenv").config();

const ccxt = require("ccxt");

// ============================================
// CONFIG
// ============================================

const SYMBOL = "BTC/USDT";
const TIMEFRAME = "30m";
const DAYS = 30;

// SESSION TIME
const START_HOUR = 9;
const START_MINUTE = 0;

const END_HOUR = 10;
const END_MINUTE = 0;

// ============================================
// EXCHANGE
// ============================================

const exchange = new ccxt.binance({
    enableRateLimit: true,
    options: {
        defaultType: "future"
    }
});

// ============================================
// HELPERS
// ============================================

function format(num) {
    return Math.round(num).toLocaleString();
}

function findNearestCandle(candles, targetTime) {

    return candles.find(c => c[0] >= targetTime);
}

// ============================================
// FETCH OHLCV
// ============================================

async function fetchCandles() {

    const since =
        Date.now() - ((DAYS + 5) * 24 * 60 * 60 * 1000);

    let allCandles = [];
    let fetchSince = since;

    while (true) {

        const candles = await exchange.fetchOHLCV(
            SYMBOL,
            TIMEFRAME,
            fetchSince,
            1000
        );

        if (!candles.length)
            break;

        allCandles.push(...candles);

        console.log(
            `Fetched candles: ${allCandles.length}`
        );

        fetchSince =
            candles[candles.length - 1][0] + 1;

        if (candles.length < 1000)
            break;
    }

    return allCandles;
}

// ============================================
// MAIN
// ============================================

async function run() {

    console.log("\nFetching BTC data...\n");

    const candles = await fetchCandles();

    const results = [];

    for (let i = DAYS; i >= 1; i--) {

        // ====================================
        // START TIME
        // ====================================

        const start = new Date();

        start.setDate(start.getDate() - i);

        start.setHours(
            START_HOUR,
            START_MINUTE,
            0,
            0
        );

        // ====================================
        // END TIME (NEXT DAY 5:30 PM)
        // ====================================

        const end = new Date(start);

        end.setDate(end.getDate() + 1);

        end.setHours(
            END_HOUR,
            END_MINUTE,
            0,
            0
        );

        // ====================================
        // FIND CANDLES
        // ====================================

        const startCandle =
            findNearestCandle(
                candles,
                start.getTime()
            );

        const endCandle =
            findNearestCandle(
                candles,
                end.getTime()
            );

        if (!startCandle || !endCandle)
            continue;

        // ====================================
        // INTERVAL CANDLES
        // ====================================

        const intervalCandles = candles.filter(
            c =>
                c[0] >= start.getTime() &&
                c[0] <= end.getTime()
        );

        if (!intervalCandles.length)
            continue;

        // ====================================
        // PRICES
        // ====================================

        const openPrice = startCandle[1];

        const closePrice = endCandle[4];

        const highest = Math.max(
            ...intervalCandles.map(c => c[2])
        );

        const lowest = Math.min(
            ...intervalCandles.map(c => c[3])
        );

        // ====================================
        // MOVES
        // ====================================

        const difference =
            closePrice - openPrice;

        const upMove =
            highest - openPrice;

        const downMove =
            openPrice - lowest;

        const netMove =
            closePrice - openPrice;

        // ====================================
        // PUSH RESULT
        // ====================================

        results.push({

            DAY:
                start.toLocaleDateString("en-IN", {
                    weekday: "long",
                    timeZone: "Asia/Kolkata"
                }),

            FROM:
                start.toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata"
                }),

            TO:
                end.toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata"
                }),

            OPEN:
                format(openPrice),

            CLOSE:
                format(closePrice),

            DIFFERENCE:
                (difference >= 0 ? "+" : "") +
                format(difference),

            HIGH_MOVE:
                "+" + format(upMove),

            LOW_MOVE:
                "-" + format(downMove),

            NET_MOVE:
                (netMove >= 0 ? "+" : "") +
                format(netMove)
        });
    }

    // ============================================
    // MAIN TABLE
    // ============================================

    console.table(results);

    // ============================================
    // NET MOVE DISTRIBUTION
    // ============================================

    const ranges = {
        "0-250": 0,
        "250-500": 0,
        "500-750": 0,
        "750-1000": 0,
        "1000-1250": 0,
        "1250-1500": 0,
        "1500-2000": 0,
        "2000-3000": 0,
        "3000+": 0
    };

    for (const row of results) {

        const move = Math.abs(
            Number(
                row.NET_MOVE.replace(/[+,]/g, "")
            )
        );

        if (move >= 0 && move < 250) {
            ranges["0-250"]++;
        }

        else if (move >= 250 && move < 500) {
            ranges["250-500"]++;
        }

        else if (move >= 500 && move < 750) {
            ranges["500-750"]++;
        }

        else if (move >= 750 && move < 1000) {
            ranges["750-1000"]++;
        }

        else if (move >= 1000 && move < 1250) {
            ranges["1000-1250"]++;
        }

        else if (move >= 1250 && move < 1500) {
            ranges["1250-1500"]++;
        }

        else if (move >= 1500 && move < 2000) {
            ranges["1500-2000"]++;
        }

        else if (move >= 2000 && move < 3000) {
            ranges["2000-3000"]++;
        }

        else {
            ranges["3000+"]++;
        }
    }

    // ============================================
    // DISTRIBUTION TABLE
    // ============================================

    console.log("\n====================================");
    console.log("NET MOVE DISTRIBUTION");
    console.log("====================================\n");

    console.table(
        Object.entries(ranges).map(([range, count]) => ({
            RANGE: range,
            COUNT: count
        }))
    );

    // ============================================
    // SUMMARY
    // ============================================

    const avgDiff =
        results.reduce((a, b) => {

            return a +
                Number(
                    b.DIFFERENCE
                        .replace(/[+,]/g, "")
                );

        }, 0) / results.length;

    const avgUp =
        results.reduce((a, b) => {

            return a +
                Number(
                    b.HIGH_MOVE
                        .replace(/[+,]/g, "")
                );

        }, 0) / results.length;

    const avgDown =
        results.reduce((a, b) => {

            return a +
                Number(
                    b.LOW_MOVE
                        .replace(/[-,]/g, "")
                );

        }, 0) / results.length;

    // ============================================
    // FINAL SUMMARY
    // ============================================

    console.log("\n====================================");
    console.log("BTC SESSION ANALYSIS");
    console.log("====================================\n");

    console.log(
        "Average Difference:",
        Math.round(avgDiff)
    );

    console.log(
        "Average High Move:",
        Math.round(avgUp)
    );

    console.log(
        "Average Low Move:",
        Math.round(avgDown)
    );

    console.log("\nDone.\n");
}

// ============================================
// START
// ============================================

run().catch(console.error);