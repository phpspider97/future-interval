const axios = require('axios')
const { EMA, RSI, MACD } = require('technicalindicators')
require('dotenv').config()
const api_url = process.env.API_URL 
const SYMBOL = 'BTCUSD'
const INTERVAL = '15m'
 
async function fetchCandles() {
    const end_time_stamp = Math.floor(Date.now() / 1000)
    const start_time_stamp = end_time_stamp - (40 * 60 * 60)
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
 
async function findCandleTrend() {
    const candles = await fetchCandles();
  
    if (candles.length < 50) {
      console.warn('Not enough candles to compute indicators.');
      return;
    }
  
    const closes = candles.map(c => c.close);
  
    const ema9 = EMA.calculate({ period: 9, values: closes });
    const ema21 = EMA.calculate({ period: 21, values: closes });
    const rsi14 = RSI.calculate({ period: 14, values: closes });
    const macd = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
  
    if (ema9.length < 1 || ema21.length < 1 || rsi14.length < 1 || macd.length < 1) {
      console.warn('Indicators not fully formed yet.');
      return;
    }
  
    const lastCandle = candles[candles.length - 1];
    const lastEMA9 = ema9[ema9.length - 1];
    const lastEMA21 = ema21[ema21.length - 1];
    const lastRSI = rsi14[rsi14.length - 1];
    const lastMACD = macd[macd.length - 1];
  
    // Candle body ratio
    const body = Math.abs(lastCandle.close - lastCandle.open);
    const range = lastCandle.high - lastCandle.low;
    const bodyRatio = body / (range || 1); // avoid div by zero
  
    // Trend classification
    let candle_status = 'neutral';
  
    const isBullish =
      lastCandle.close > lastCandle.open &&
      lastCandle.close > lastEMA9 &&
      lastEMA9 > lastEMA21 &&
      lastRSI > 50 &&
      lastMACD.MACD > lastMACD.signal;
  
    const isBearish =
      lastCandle.close < lastCandle.open &&
      lastCandle.close < lastEMA9 &&
      lastEMA9 < lastEMA21 &&
      lastRSI < 50 &&
      lastMACD.MACD < lastMACD.signal;
  
    if (bodyRatio < 0.3) {
      candle_status = 'neutral';
    } else if (isBullish) {
      candle_status = 'bull';
    } else if (isBearish) {
      candle_status = 'bear';
    }
    return candle_status
}

module.exports = { findCandleTrend }