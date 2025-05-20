const axios = require('axios');

let now = Math.floor(Date.now() / 1000); // current time in seconds
 //now = now - (60 * 24 * 60 * 60); // 30 days in seconds
const thirtyDaysAgo = now - (30 * 24 * 60 * 60); // 30 days in seconds

// console.log('Start (30 days ago):', thirtyDaysAgo);
// console.log('End (now):', now);

const API_URL = 'https://api.india.delta.exchange/v2/history/candles';
const symbol = 'BTCUSD';
const resolution = '15m';
const start = thirtyDaysAgo; // Replace with your desired UNIX timestamp
const end = now;   // Replace with your desired UNIX timestamp
let candles = {}

async function getCandleData() {
    try {
        const response = await axios.get(API_URL, {
        params: { symbol, resolution, start, end }
        });

        candles = response.data.result
        return candles
    }catch(error){
        console.log(error)
    }
} 

 
const { EMA } = require('technicalindicators');
 
const EMA_FAST = 9;
const EMA_SLOW = 21;

let position = null; // 'long' | 'short' | null
let entryPrice = 0;
let trades = [];

function calculateEMA(period, values) {
  return EMA.calculate({ period, values });
}

async function backtest() {
    const candles = await getCandleData()
  const closes = candles.map(c => c.close);
  const fastEMA = calculateEMA(EMA_FAST, closes);
  const slowEMA = calculateEMA(EMA_SLOW, closes);

  for (let i = EMA_SLOW + 1; i < candles.length; i++) {
    const prevFast = fastEMA[i - EMA_SLOW - 1];
    const prevSlow = slowEMA[i - EMA_SLOW - 1];
    const currFast = fastEMA[i - EMA_SLOW];
    const currSlow = slowEMA[i - EMA_SLOW];
    const currentPrice = closes[i];

    if (prevFast < prevSlow && currFast > currSlow) {
      if (position === 'short') {
        trades.push({ type: 'short', entry: entryPrice, exit: currentPrice, pnl: entryPrice - currentPrice });
        position = null;
      }
      if (position !== 'long') {
        position = 'long';
        entryPrice = currentPrice;
      }
    }

    if (prevFast > prevSlow && currFast < currSlow) {
      if (position === 'long') {
        trades.push({ type: 'long', entry: entryPrice, exit: currentPrice, pnl: currentPrice - entryPrice });
        position = null;
      }
      if (position !== 'short') {
        position = 'short';
        entryPrice = currentPrice;
      }
    }
  }

  // Close open position at last price
  if (position !== null) {
    const finalPrice = closes[closes.length - 1];
    const pnl = position === 'long' ? finalPrice - entryPrice : entryPrice - finalPrice;
    trades.push({ type: position, entry: entryPrice, exit: finalPrice, pnl });
  }

  analyzeResults(trades);
}

function analyzeResults(trades) {
  let totalPnL = 0;
  let wins = 0;
  let losses = 0;

  trades.forEach(t => {
    totalPnL += t.pnl;
    if (t.pnl > 0) wins++;
    else losses++;
  });

  console.log(`Total Trades: ${trades.length}`);
  console.log(`Wins: ${wins}, Losses: ${losses}`);
  console.log(`Net PnL: $${totalPnL.toFixed(2)}`);
  console.log(`Win Rate: ${(wins / trades.length * 100).toFixed(2)}%`);
}

backtest();
