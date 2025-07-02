const axios = require('axios') 
require('dotenv').config()
const SYMBOL = 'BTCUSD'
const INTERVAL = '1m'
const api_url = process.env.API_URL 
const { ATR } = require('technicalindicators')

async function fetchCandles() {
    const end_time_stamp = Math.floor(Date.now() / 1000)
    const start_time_stamp = end_time_stamp - (1 * 60 * 60)

    try {
        const response = await axios.get(`${api_url}/v2/history/candles`, {
            params : { 
                symbol : SYMBOL, 
                resolution : INTERVAL, 
                start : start_time_stamp, 
                end : end_time_stamp 
            }
        }); 
        const candles = response.data.result  
        return candles.reverse() 
    } catch (err) {
        console.error('❌ Error fetching candles:', err.message);
        return [];
    }
}

function calculateSupertrend(candles, period, multiplier) {
    const high = candles.map(c => parseFloat(c.high));
    const low = candles.map(c => parseFloat(c.low));
    const close = candles.map(c => parseFloat(c.close));
    const atr = ATR.calculate({ high, low, close, period });
  
    const result = [];
    for (let i = 0; i < atr.length; i++) {
      const idx = i + period;
      const hl2 = (high[idx] + low[idx]) / 2;
      const upperBand = hl2 + multiplier * atr[i];
      const lowerBand = hl2 - multiplier * atr[i];
      const closePrice = close[idx];
  
      let trend = 'none';
      if (i > 0 && result[i - 1]) {
        const prevTrend = result[i - 1].trend;
        trend = (closePrice > result[i - 1].upperBand) ? 'up'
              : (closePrice < result[i - 1].lowerBand) ? 'down'
              : prevTrend;
      } else {
        trend = 'down';
      }
  
      result.push({
        time: candles[idx].time,
        upperBand,
        lowerBand,
        trend
      });
    }
    //console.log(result)
    return result;
}
  
function getSignal(supertrend) {
    const latest = supertrend[supertrend.length - 1];
    return latest.trend === 'up' ? 'BUY' : 'SELL';
}

async function runBot() {
    try {
      const candles = await fetchCandles();
      const supertrend = calculateSupertrend(candles, 10, 3);
      const signal = getSignal(supertrend);
        console.clear()
      console.table({
        ...supertrend,
        signal
      })
       
    } catch (error) {
      console.error('Bot error:', error);
    }
  }
  
  setInterval(()=>{
    runBot();
  },3000)
  