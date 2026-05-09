require("dotenv").config();
const ccxt = require("ccxt");
const moment = require("moment-timezone");

const exchange = new ccxt.binance({
    enableRateLimit: true,
});

const SYMBOL = "PAXG/USDT";
const TIMEFRAME = "5m";
const BACKTEST_DAYS = 100;

// ===== COLORS =====
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BRIGHT_RED = "\x1b[91m";
const RESET = "\x1b[0m";

// ===== COLOR FUNCTION =====
function colorMove(value) {

    const formatted = Number(value).toFixed(2);

    if (value > 150) {
        return `${BRIGHT_RED}${formatted}${RESET}`;
    }

    if (value > 100) {
        return `${RED}${formatted}${RESET}`;
    }

    if (value > 70) {
        return `${YELLOW}${formatted}${RESET}`;
    }

    return `${GREEN}${formatted}${RESET}`;
}

// ===== FETCH ALL DATA =====
async function fetchAllCandles(days = 100) {

    const since =
        exchange.milliseconds() -
        (days * 24 * 60 * 60 * 1000);

    let allCandles = [];
    let from = since;

    while (true) {

        const candles = await exchange.fetchOHLCV(
            SYMBOL,
            TIMEFRAME,
            from,
            1000
        );

        if (!candles.length) {
            break;
        }

        allCandles.push(...candles);

        console.log(
            `Fetched ${candles.length} candles | Total ${allCandles.length}`
        );

        from = candles[candles.length - 1][0] + 1;

        await exchange.sleep(500);

        if (candles.length < 1000) {
            break;
        }
    }

    return allCandles;
}

// ===== MAIN BACKTEST =====
async function runBacktest() {

    console.log("\nFetching PAXG candles...\n");

    const candles = await fetchAllCandles(BACKTEST_DAYS);

    console.log(`\nTotal candles fetched: ${candles.length}\n`);

    let sessions = [];

    let currentSession = null;

    let firstHit = null;

    for (const candle of candles) {

        const ts = candle[0];

        const ist = moment(ts).tz("Asia/Kolkata");

        const open = candle[1];
        const high = candle[2];
        const low = candle[3];

        const hour = ist.hour();
        const minute = ist.minute();

        // ===== START NEW SESSION =====
        if (hour === 9 && minute === 0) {

            // SAVE PREVIOUS SESSION
            if (currentSession) {

                currentSession.upperMove =
                    +(currentSession.high - currentSession.startPrice).toFixed(2);

                currentSession.lowerMove =
                    +(currentSession.startPrice - currentSession.low).toFixed(2);

                currentSession.firstHit =
                    firstHit || "NONE";

                sessions.push(currentSession);
            }

            // CREATE NEW SESSION
            currentSession = {
                date: ist.format("YYYY-MM-DD"),
                day: ist.format("dddd"),
                startTime: ist.format("YYYY-MM-DD HH:mm"),
                startPrice: open,
                high: high,
                low: low,
            };

            firstHit = null;
        }

        if (!currentSession) {
            continue;
        }

        // ===== UPDATE HIGH =====
        if (high > currentSession.high) {

            currentSession.high = high;

            if (!firstHit) {
                firstHit = "UP";
            }
        }

        // ===== UPDATE LOW =====
        if (low < currentSession.low) {

            currentSession.low = low;

            if (!firstHit) {
                firstHit = "DOWN";
            }
        }
    }

    // ===== SAVE FINAL SESSION =====
    if (currentSession) {

        currentSession.upperMove =
            +(currentSession.high - currentSession.startPrice).toFixed(2);

        currentSession.lowerMove =
            +(currentSession.startPrice - currentSession.low).toFixed(2);

        currentSession.firstHit =
            firstHit || "NONE";

        sessions.push(currentSession);
    }

    // ===== DISPLAY TABLE =====
    console.table(
        sessions.map(s => ({

            Date: s.date,

            Day: s.day,

            Start: Number(s.startPrice).toFixed(2),

            High: Number(s.high).toFixed(2),

            Low: Number(s.low).toFixed(2),

            Upper_Move: colorMove(s.upperMove),

            Lower_Move: colorMove(s.lowerMove),

            First_Hit: s.firstHit,
        }))
    );

    // ===== SUMMARY =====

    const avgUpper =
        sessions.reduce((a, b) => a + b.upperMove, 0)
        / sessions.length;

    const avgLower =
        sessions.reduce((a, b) => a + b.lowerMove, 0)
        / sessions.length;

    const maxUpper =
        Math.max(...sessions.map(x => x.upperMove));

    const maxLower =
        Math.max(...sessions.map(x => x.lowerMove));

    const upFirst =
        sessions.filter(x => x.firstHit === "UP").length;

    const downFirst =
        sessions.filter(x => x.firstHit === "DOWN").length;

    const bigUpper =
        sessions.filter(x => x.upperMove > 100).length;

    const bigLower =
        sessions.filter(x => x.lowerMove > 100).length;

    console.log("\n================ SUMMARY ================\n");

    console.log(
        "Total Sessions:",
        sessions.length
    );

    console.log(
        "Average Upper Move:",
        avgUpper.toFixed(2)
    );

    console.log(
        "Average Lower Move:",
        avgLower.toFixed(2)
    );

    console.log(
        "Max Upper Move:",
        maxUpper.toFixed(2)
    );

    console.log(
        "Max Lower Move:",
        maxLower.toFixed(2)
    );

    console.log(
        "UP Hit First:",
        upFirst
    );

    console.log(
        "DOWN Hit First:",
        downFirst
    );

    console.log(
        `${RED}Upper > 100:${RESET}`,
        bigUpper
    );

    console.log(
        `${RED}Lower > 100:${RESET}`,
        bigLower
    );

    console.log("\n=========================================\n");
}

// ===== RUN =====
runBacktest();