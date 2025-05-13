const axios = require('axios')

const API_URL = 'https://api.india.delta.exchange/v2/history/candles'
const symbol = 'BTCUSD'
const resolution = '5m'
const start = Math.floor(Date.now() / 1000) - (1 * 24 * 60 * 60)
const end = Math.floor(Date.now() / 1000)
const candles_data = 

async function getHistoricalCandle(){
    const response = await axios.get(API_URL, {
        params: { symbol, resolution, start, end }
    })
    return response.data.result
}
setTimeout( async ()=>{
   const candles_data = await getHistoricalCandle()
   console.table(candles_data)
},1000)

const fs = require('fs');

// Load historical candle data
const candles = JSON.parse(fs.readFileSync('./candles.json', 'utf8'));

// Backtest configuration
const config = {
  initialBalance: 1000,
  baseOrderSize: 10,
  maxMartingaleSteps: 6,
  entryDropPercent: 1,     // Buy if price drops X% from last close
  takeProfitPercent: 1.5,  // Take profit at X%
  stopLossPercent: 1.0,    // Optional: fixed stop loss (not used in basic martingale)
};

let balance = config.initialBalance;
let currentOrderSize = config.baseOrderSize;
let lastEntryPrice = null;
let tradeCount = 0;
let lossStreak = 0;
let wins = 0;
let losses = 0;

candles.forEach((candle, i) => {
  if (i === 0) return; // skip first candle

  const prevClose = candles[i - 1].close;
  const currentLow = candle.low;
  const currentHigh = candle.high;

  // Entry condition: drop by entryDropPercent
  const triggerPrice = prevClose * (1 - config.entryDropPercent / 100);

  if (!lastEntryPrice && currentLow <= triggerPrice) {
    // Open trade
    lastEntryPrice = triggerPrice;
    tradeCount++;
    console.log(`[Entry] Candle ${i}, Buying at ${lastEntryPrice.toFixed(2)}, Size: $${currentOrderSize}`);
  }

  // Exit logic if in a trade
  if (lastEntryPrice) {
    const takeProfitPrice = lastEntryPrice * (1 + config.takeProfitPercent / 100);

    if (currentHigh >= takeProfitPrice) {
      // Win
      const profit = currentOrderSize * (config.takeProfitPercent / 100);
      balance += profit;
      console.log(`[Take Profit] Candle ${i}, Sold at ${takeProfitPrice.toFixed(2)}, Profit: $${profit.toFixed(2)}, Balance: $${balance.toFixed(2)}`);

      // Reset
      currentOrderSize = config.baseOrderSize;
      lastEntryPrice = null;
      lossStreak = 0;
      wins++;
    } else if (i === candles.length - 1) {
      // End of data, close trade at last close price
      const finalPrice = candle.close;
      const loss = currentOrderSize * ((lastEntryPrice - finalPrice) / lastEntryPrice);
      balance -= loss;
      console.log(`[Forced Exit] Final Candle, Sold at ${finalPrice.toFixed(2)}, Loss: $${loss.toFixed(2)}, Balance: $${balance.toFixed(2)}`);
      lastEntryPrice = null;
    } else if (currentLow < lastEntryPrice * (1 - config.stopLossPercent / 100)) {
      // Optional stop loss - can be commented out for pure martingale
      const loss = currentOrderSize * (config.stopLossPercent / 100);
      balance -= loss;
      console.log(`[Stop Loss] Candle ${i}, Sold at ${candle.low.toFixed(2)}, Loss: $${loss.toFixed(2)}, Balance: $${balance.toFixed(2)}`);

      // Martingale: Double the order size
      lossStreak++;
      if (lossStreak >= config.maxMartingaleSteps) {
        console.log(`❌ Max martingale steps reached. Resetting.`);
        currentOrderSize = config.baseOrderSize;
        lossStreak = 0;
      } else {
        currentOrderSize *= 2;
      }

      lastEntryPrice = null;
      losses++;
    }
  }
});

console.log(`\n📊 Backtest Summary:
- Trades: ${tradeCount}
- Wins: ${wins}
- Losses: ${losses}
- Final Balance: $${balance.toFixed(2)}
- Net PnL: $${(balance - config.initialBalance).toFixed(2)}
`)