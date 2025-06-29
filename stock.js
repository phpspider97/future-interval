const yf = require('yahoo-finance2').default;
const fs = require('fs')
const path = require('path');

// Adjust if you saved the file elsewhere
const filePath = path.join(__dirname, 'nifty500.csv');

// Read and parse
const csvData = fs.readFileSync(filePath, 'utf8').split('\n');

// Remove header
const rows = csvData.slice(1);

// Parse symbols
const symbols = rows
  .map(line => line.trim().split(',')[2])  // 3rd column is 'Symbol'
  .filter(sym => sym && !sym.includes(' '))  // skip empty or malformed
  .map(sym => sym + '.NS');

// Remove duplicates and limit to 500
const uniqueSymbols = [...new Set(symbols)].slice(0, 500);

// ✅ Output or use in your scanner
//console.log(`✅ Loaded ${uniqueSymbols.length} symbols`);
//console.log(uniqueSymbols);


function calculateEMA(data, period) {
  const k = 2 / (period + 1);
  let emaArray = [data[0].close];
  for (let i = 1; i < data.length; i++) {
    emaArray.push((data[i].close - emaArray[i - 1]) * k + emaArray[i - 1]);
  }
  return emaArray;
}

function calculateRSI(closes, period = 14) {
  let gains = 0, losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  const rsi = [100 - 100 / (1 + avgGain / avgLoss)];

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - diff) / period;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(100 - 100 / (1 + rs));
  }

  return rsi;
}

async function checkStock(symbol) {
  try {
    const result = await yf.chart(symbol, {
      period1: '2024-01-01',
      interval: '1d'
    });

    const candles = result?.quotes || [];
    if (candles.length < 22) return null;

    const closes = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);
    const lows = candles.map(c => c.low);

    const ema9 = calculateEMA(candles, 9);
    const ema21 = calculateEMA(candles, 21);
    const rsi = calculateRSI(closes);

    const len = closes.length;
    const crossover =
      ema9[len - 2] < ema21[len - 2] && ema9[len - 1] > ema21[len - 1];

    const avgVolume = volumes.slice(-10).reduce((a, b) => a + b) / 10;
    const volumeToday = volumes[len - 1];
    const volumeOK = volumeToday > avgVolume;

    const rsiToday = rsi[rsi.length - 1];
    const rsiOK = rsiToday > 40 && rsiToday < 60;

    if (crossover && volumeOK && rsiOK) {
      const entry = closes[len - 1];
      const stopLoss = Math.min(...lows.slice(len - 6, len)); // Last 5 candles
      const risk = entry - stopLoss;
      const target = entry + risk * 2;

      return {
        symbol,
        crossover: "Bullish EMA 9/21",
        rsi: rsiToday.toFixed(2),
        volume: volumeToday,
        entry: entry.toFixed(2),
        stopLoss: stopLoss.toFixed(2),
        target: target.toFixed(2),
        rewardRisk: "1:2"
      };
    }

    return null;
  } catch (err) {
    console.error(`Error with ${symbol}: ${err.message}`);
    return null;
  }
}

async function scan() {
  const results = [];

  for (const symbol of uniqueSymbols) {
    const result = await checkStock(symbol);
    if (result) results.push(result);
  }

  console.log("📈 Swing Trade Candidates (with Entry, SL, Target):\n");
  console.table(results);
}

scan();
