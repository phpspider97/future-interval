require("dotenv").config();
const ccxt = require("ccxt");

const exchange = new ccxt.binance({
    enableRateLimit: true
});

const SYMBOL = "BTC/USDT";
const TIMEFRAME = "1m";
const DAYS = 360;

// ================= SETTINGS =================

// STRANGLE SETTINGS
const STRIKE_DISTANCE = 1100;
const SL_BUFFER = 0;

// DYNAMIC INTERVAL SETTINGS
const INTERVAL_SIZE = 4; // hours
const INTERVAL_SHIFT = 1; // shift by +hour
const HOLD_MINUTES = INTERVAL_SIZE*60;

// ================= COLORS =================

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

// ================= HELPERS =================

function color(value, condition) {
    return condition
        ? `${RED}${value}${RESET}`
        : `${GREEN}${value}${RESET}`;
}

function timeOnly(ts) {
    return new Date(ts).toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
    });
}

function getISTDate(ts) {
    return new Date(ts).toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata"
    });
}

function getWeekDay(ts) {
    return new Date(ts).toLocaleDateString("en-IN", {
        weekday: "long",
        timeZone: "Asia/Kolkata"
    });
}

function getHour(ts) {

    const date = new Date(ts);

    const ist = new Date(
        date.toLocaleString("en-US", {
            timeZone: "Asia/Kolkata"
        })
    );

    return ist.getHours();
}

// ================= DYNAMIC INTERVAL =================

function getInterval(hour) {

    const shiftedHour =
        (hour - INTERVAL_SHIFT + 24) % 24;

    const blockStart =
        Math.floor(shiftedHour / INTERVAL_SIZE)
        * INTERVAL_SIZE;

    const actualStart =
        (blockStart + INTERVAL_SHIFT) % 24;

    const actualEnd =
        (actualStart + INTERVAL_SIZE) % 24;

    return `${String(actualStart).padStart(2, "0")}-${String(actualEnd).padStart(2, "0")}`;
}

function formatHour(hour) {

    let h = parseInt(hour);

    const ampm = h >= 12 ? "PM" : "AM";

    h = h % 12 || 12;

    return `${h}${ampm}`;
}

function formatInterval(interval) {

    const [start, end] = interval.split("-");

    return `${formatHour(start)}-${formatHour(end)}`;
}

// ================= FETCH DATA =================

async function fetchData() {

    const since =
        Date.now() -
        DAYS * 24 * 60 * 60 * 1000;

    let all = [];

    let fetchSince = since;

    while (true) {

        const ohlcv =
            await exchange.fetchOHLCV(
                SYMBOL,
                TIMEFRAME,
                fetchSince,
                1000
            );

        if (!ohlcv.length) break;

        all = all.concat(ohlcv);

        fetchSince =
            ohlcv[ohlcv.length - 1][0] + 1;

        console.log(
            `${YELLOW}Fetched:${RESET} ${all.length}`
        );

        if (ohlcv.length < 1000) break;
    }

    return all;
}

// ================= BACKTEST =================

function runBacktest(data) {

    const trades = [];

    const stats = {};

    const usedIntervals = new Set();

    for (
        let i = 0;
        i < data.length - HOLD_MINUTES;
        i++
    ) {

        const candle = data[i];

        const timestamp = candle[0];

        const close = candle[4];

        const day = getISTDate(timestamp);

        const weekday = getWeekDay(timestamp);

        const hour = getHour(timestamp);

        const interval = getInterval(hour);

        const uniqueKey =
            `${day}-${interval}`;

        // ONE TRADE PER INTERVAL
        if (usedIntervals.has(uniqueKey)) {
            continue;
        }

        const entryPrice = close;

        const upperSL =
            entryPrice +
            (STRIKE_DISTANCE - SL_BUFFER);

        const lowerSL =
            entryPrice -
            (STRIKE_DISTANCE - SL_BUFFER);

        let result = "TIME EXIT";

        let exitPrice = close;

        let exitTime = timestamp;

        let highest = close;

        let lowest = close;

        let maxUpMove = 0;

        let maxDownMove = 0;

        for (
            let j = 1;
            j <= HOLD_MINUTES;
            j++
        ) {

            const next = data[i + j];

            if (!next) break;

            const ts = next[0];

            const high = next[2];

            const low = next[3];

            highest =
                Math.max(highest, high);

            lowest =
                Math.min(lowest, low);

            const upMove =
                high - entryPrice;

            const downMove =
                entryPrice - low;

            maxUpMove =
                Math.max(maxUpMove, upMove);

            maxDownMove =
                Math.max(maxDownMove, downMove);

            // CALL SL
            if (high >= upperSL) {

                result = "CALL SL";

                exitPrice = upperSL;

                exitTime = ts;

                break;
            }

            // PUT SL
            if (low <= lowerSL) {

                result = "PUT SL";

                exitPrice = lowerSL;

                exitTime = ts;

                break;
            }

            // TIME EXIT
            if (j === HOLD_MINUTES) {

                exitPrice = next[4];

                exitTime = ts;
            }
        }

        usedIntervals.add(uniqueKey);

        const totalRange =
            highest - lowest;

        trades.push({

            Day: day,

            Weekday: weekday,

            Interval:
                formatInterval(interval),

            Entry:
                entryPrice.toFixed(2),

            Exit:
                exitPrice.toFixed(2),

            EntryTime:
                timeOnly(timestamp),

            ExitTime:
                timeOnly(exitTime),

            UpMove:
                maxUpMove.toFixed(2),

            DownMove:
                maxDownMove.toFixed(2),

            Range:
                totalRange.toFixed(2),

            Result: result,

            Status:
                result === "TIME EXIT"
                    ? "SAFE"
                    : "SL HIT"
        });

        if (!stats[interval]) {

            stats[interval] = {
                total: 0,
                safe: 0,
                slHit: 0,
                avgRange: 0
            };
        }

        stats[interval].total++;

        stats[interval].avgRange += totalRange;

        if (result === "TIME EXIT") {
            stats[interval].safe++;
        } else {
            stats[interval].slHit++;
        }
    }

    return { trades, stats };
}

// ================= MAIN =================

(async () => {

    console.log(
        `${YELLOW}Fetching Data...${RESET}`
    );

    const data = await fetchData();

    console.log(
        `${YELLOW}Running Backtest...${RESET}`
    );

    console.log(
        `${GREEN}INTERVAL SIZE:${RESET} ${INTERVAL_SIZE} Hours`
    );

    console.log(
        `${GREEN}INTERVAL SHIFT:${RESET} ${INTERVAL_SHIFT} Hour`
    );

    const { trades, stats } =
        runBacktest(data);

    // ================= TABLE =================

    console.log(
        `\n${YELLOW}DAY WISE TRADES${RESET}\n`
    );

    console.table(
        trades.map(t => ({

            Day: t.Day,

            Weekday: t.Weekday,

            Interval: t.Interval,

            Entry: t.Entry,

            Exit: t.Exit,

            UpMove: t.UpMove,

            DownMove: t.DownMove,

            Range: t.Range,

            Result: t.Result,

            Status: t.Status
        }))
    );

    // ================= COLOR MOVE ANALYSIS =================

    console.log(
        `\n${YELLOW}MOVE ANALYSIS${RESET}\n`
    );

    trades.forEach(t => {

        const up = color(
            t.UpMove,
            parseFloat(t.UpMove) > 1000
        );

        const down = color(
            t.DownMove,
            parseFloat(t.DownMove) > 1000
        );

        const range = color(
            t.Range,
            parseFloat(t.Range) > 2000
        );

        console.log(
            `${t.Day} | ${t.Interval} | UP: ${up} | DOWN: ${down} | RANGE: ${range}`
        );
    });

    // ================= STATS =================

    let result = [];

    for (let interval in stats) {

        const s = stats[interval];

        const safeProb =
            (
                (s.safe / s.total) * 100
            ).toFixed(2);

        const slProb =
            (
                (s.slHit / s.total) * 100
            ).toFixed(2);

        const avgRange =
            (
                s.avgRange / s.total
            ).toFixed(2);

        result.push({

            Interval:
                formatInterval(interval),

            Trades: s.total,

            SAFE: s.safe,

            SL_HIT: s.slHit,

            SAFE_Prob:
                `${safeProb}%`,

            SL_Prob:
                `${slProb}%`,

            Avg_Range: avgRange
        });
    }

    result.sort(
        (a, b) =>
            parseFloat(b.SAFE_Prob) -
            parseFloat(a.SAFE_Prob)
    );

    // ================= PERFORMANCE =================

    console.log(
        `\n${YELLOW}INTERVAL PERFORMANCE${RESET}\n`
    );

    console.table(result);

    // ================= BEST =================

    const best = result[0];

    console.log(
        `\n${GREEN}BEST INTERVAL:${RESET} ${best.Interval}`
    );

    console.log(
        `${GREEN}SAFE PROBABILITY:${RESET} ${best.SAFE_Prob}`
    );

    console.log(
        `${GREEN}AVERAGE RANGE:${RESET} ${best.Avg_Range}`
    );

    console.log(
        `\n${YELLOW}TOTAL TRADES:${RESET} ${trades.length}`
    );

})();