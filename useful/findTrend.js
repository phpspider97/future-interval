const axios = require('axios') 
const { MACD, VWAP, SuperTrend } = require('technicalindicators')
require('dotenv').config()
const api_url = process.env.API_URL 
const SYMBOL = 'BTCUSD'
const INTERVAL = '15m'
 
async function fetchCandles() {
    const end_time_stamp = Math.floor(Date.now() / 1000)
    const start_time_stamp = end_time_stamp - (5 * 60 * 60)
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
 
// Manual VWAP calculation
function calculateVWAP(candles) {
    let cumulativeTPV = 0;
    let cumulativeVolume = 0;
  
    for (const c of candles) {
      const typicalPrice = (c.high + c.low + c.close) / 3;
      cumulativeTPV += typicalPrice * c.volume;
      cumulativeVolume += c.volume;
    }
  
    return cumulativeVolume === 0 ? 0 : cumulativeTPV / cumulativeVolume;
  }
  
  // Manual Supertrend calculation (simplified)
  function calculateSupertrend(candles, period = 10, multiplier = 3) {
    const atrs = [];
    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      atrs.push(tr);
    }
  
    const recentATRs = atrs.slice(-period);
    const avgATR = recentATRs.reduce((a, b) => a + b, 0) / recentATRs.length;
  
    const lastCandle = candles[candles.length - 1];
    const middle = (lastCandle.high + lastCandle.low) / 2;
    const upperBand = middle + multiplier * avgATR;
    const lowerBand = middle - multiplier * avgATR;
  
    const trend =
      lastCandle.close > upperBand ? 'up' :
      lastCandle.close < lowerBand ? 'down' :
      'sideways';
  
    return { trend, upperBand, lowerBand };
  }
  
  // Detect trend using combined signals
  function detectTrend({ macd, vwap, supertrend, latestPrice }) {
    const aboveVWAP = latestPrice > vwap;
    const macdBullish = macd.MACD > macd.signal;
    const supertrendBullish = supertrend.trend === 'up';
  
    if (aboveVWAP && macdBullish && supertrendBullish) return 'bullish';
    if (!aboveVWAP && !macdBullish && supertrend.trend === 'down') return 'bearish';
    return 'neutral';
  }
  
  // API endpoint
  async function getTrend(){
    try {
      const candles = await fetchCandles();
      const closes = candles.map(c => c.close);
  
      const macdSeries = MACD.calculate({
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false,
      });
  
      const latestMACD = macdSeries[macdSeries.length - 1];
      const vwap = calculateVWAP(candles);
      const supertrend = calculateSupertrend(candles);
      const latestPrice = closes[closes.length - 1];
  
      const trend = detectTrend({ macd: latestMACD, vwap, supertrend, latestPrice });
      console.clear()
      console.table({
        trend, 
        latestPrice,
        vwap:vwap.toFixed(2),
        macd: JSON.stringify(latestMACD),
        supertrend : JSON.stringify(supertrend), 
      })
    } catch (err) {
      console.error('Error:', err); 
    }
}

setInterval( async ()=>{
    await getTrend()
},5000)
  