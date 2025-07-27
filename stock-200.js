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

async function checkBelow200EMA(symbol) {
  try {
    const result = await yf.quoteSummary(symbol, {
      modules: ['price', 'summaryDetail']
    });

    const price = result.price.regularMarketPrice;
    const ema200 = result.summaryDetail?.twoHundredDayAverage;

    if (!price || !ema200) return null;

    const percentBelow = ((ema200 - price) / ema200) * 100;

    if (percentBelow >= 5) {
      return {
        symbol,
        price,
        ema200,
        percentBelow: percentBelow
      };
    }

    return null;
  } catch (err) {
    console.error(`Error for ${symbol}:`, err.message);
    return null;
  }
}

async function run() {
  console.log('Finding best stock below 200 EMA by 20%...\n');

  const results = await Promise.all(uniqueSymbols.map(checkBelow200EMA));
  const validStocks = results.filter(Boolean);

  if (validStocks.length === 0) {
    console.log('No stocks are more than 20% below 200 EMA.');
    return;
  }

  // Sort descending by % below EMA
  validStocks.sort((a, b) => b.percentBelow - a.percentBelow);

  const best = validStocks[0];

  console.log(`✅ Best Stock: ${best.symbol}`);
  console.log(`   Price       : ₹${best.price}`);
  console.log(`   200 EMA     : ₹${best.ema200}`);
  console.log(`   Drop %      : ${best.percentBelow.toFixed(2)}%`);
}

run();