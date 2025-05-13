const axios = require('axios')
const { EMA, RSI } = require('technicalindicators')
require('dotenv').config()
const api_url = process.env.API_URL 
const SYMBOL = 'BTCUSD'
const INTERVAL = '5m'
 
async function fetchCandles(limit = 100) {
    const end_time_stamp = Math.floor(Date.now() / 1000)
    const start_time_stamp = end_time_stamp - (6 * 60 * 60)
    const response = await axios.get(`${api_url}/v2/history/candles`, {
        params : { 
            symbol : SYMBOL, 
            resolution : INTERVAL, 
            start : start_time_stamp, 
            end : end_time_stamp 
        }
    });  

  return response.data.result.reverse().map(candle => ({
    time: candle.time,
    open: parseFloat(candle.open),
    high: parseFloat(candle.high),
    low: parseFloat(candle.low),
    close: parseFloat(candle.close),
    volume: parseFloat(candle.volume)
  }));
}
 
async function classifyLastCandle() {
  const candles = await fetchCandles(); 
  const closes = candles.map(c => c.close);
  const ema9 = EMA.calculate({ period: 9, values: closes });
  const rsi14 = RSI.calculate({ period: 14, values: closes });

  const lastCandle = candles[candles.length - 1];
  const lastEMA = ema9[ema9.length - 1];
  const lastRSI = rsi14[rsi14.length - 1];
  let candle_status
 
  if (
    lastCandle.close > lastCandle.open &&
    lastCandle.close > lastEMA &&
    lastRSI > 50
  ) {
    candle_status = 'Bullish ===> ✅'
  } else if (
    lastCandle.close < lastCandle.open &&
    lastCandle.close < lastEMA &&
    lastRSI < 50
  ) {
    candle_status = 'Bearish  ===> 🔻'
  } else {
    candle_status = 'Neutral / Uncertain candle ⚠️'
  }
  console.clear()
  console.table({
    candle_status,
    close: lastCandle.close,
    open: lastCandle.open,
    EMA9: lastEMA,
    RSI14: lastRSI
  });
}
setInterval(async ()=>{
    await classifyLastCandle()
},2000)