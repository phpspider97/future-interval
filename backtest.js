require('dotenv').config();
const axios = require('axios');
const { ATR } = require('technicalindicators');

// ========== Supertrend Calculation ==========
function calculateSupertrend(candles, period = 10, multiplier = 3) {
    const high = candles.map(c => c.high);
    const low = candles.map(c => c.low);
    const close = candles.map(c => c.close);
    const atr = ATR.calculate({ high, low, close, period });

    const supertrend = [];
    let prevUpper = 0, prevLower = 0, prevTrend = true;

    for (let i = 0; i < atr.length; i++) {
        const index = i + period - 1;
        const hl2 = (high[index] + low[index]) / 2;
        const upperBand = hl2 + multiplier * atr[i];
        const lowerBand = hl2 - multiplier * atr[i];

        let finalUpper = upperBand;
        let finalLower = lowerBand;

        if (i > 0) {
            if (close[index] > prevUpper) prevTrend = true;
            else if (close[index] < prevLower) prevTrend = false;

            if (prevTrend) finalLower = Math.max(lowerBand, prevLower);
            else finalUpper = Math.min(upperBand, prevUpper);
        }

        const trend = close[index] > finalUpper;
        supertrend.push({
            time: candles[index].time,
            value: trend ? finalLower : finalUpper,
            trend: trend ? 'up' : 'down',
            close: close[index]
        });

        prevUpper = finalUpper;
        prevLower = finalLower;
    }

    return supertrend;
}

// ========== Fetch Historical Candles ==========
 
async function fetchCandles() {
    const end_time_stamp = Math.floor(Date.now() / 1000)
    const start_time_stamp = end_time_stamp - (100 * 60 * 60)
    const response = await axios.get(`https://api.india.delta.exchange/v2/history/candles`, {
        params : { 
            symbol : 'BTCUSD', 
            resolution : '15m', 
            start : start_time_stamp, 
            end : end_time_stamp 
        }
    }); 
    //console.log(response.data.result) 
    return response.data.result.map(c => ({
        time: c.time,
        open: parseFloat(c.open),
        high: parseFloat(c.high),
        low: parseFloat(c.low),
        close: parseFloat(c.close),
    }));
}

// ========== Backtest Logic ==========
async function backtest() {
    const candles = await fetchCandles();
    const supertrend = calculateSupertrend(candles);

    let inPosition = false;
    let entryPrice = 0;
    let trades = 0, wins = 0, losses = 0;
    let totalPnL = 0;

    for (let i = 1; i < supertrend.length; i++) {
        const prev = supertrend[i - 1];
        const curr = supertrend[i];

        if (!inPosition && prev.trend !== curr.trend && curr.trend === 'up') {
            // Enter Long
            inPosition = true;
            entryPrice = curr.close;
            trades++;
            console.log(`[BUY] @ ${entryPrice} on ${new Date(curr.time * 1000)}`);
        } else if (inPosition && prev.trend !== curr.trend && curr.trend === 'down') {
            // Exit Long
            const exitPrice = curr.close;
            const pnl = exitPrice - entryPrice;
            totalPnL += pnl;
            if (pnl > 0) wins++; else losses++;
            console.log(`[SELL] @ ${exitPrice} | PnL: ${pnl.toFixed(2)}`);
            inPosition = false;
        }
    }

    console.log(`\n=== BACKTEST SUMMARY ===`);
    console.log(`Trades: ${trades}`);
    console.log(`Wins: ${wins}, Losses: ${losses}`);
    console.log(`Win Rate: ${(wins / trades * 100).toFixed(2)}%`);
    console.log(`Total PnL: ${totalPnL.toFixed(2)}`);
}

backtest();

