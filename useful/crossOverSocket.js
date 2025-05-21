const axios = require('axios') 
require('dotenv').config()
const SYMBOL = 'BTCUSD'
const INTERVAL = '5m'
const api_url = process.env.API_URL 

async function fetchCandles() {
    const end_time_stamp = Math.floor(Date.now() / 1000)
    const start_time_stamp = end_time_stamp - (24 * 60 * 60)

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
        const closePrices = candles.map(c => parseFloat(c.close));
        return closePrices.reverse()

    } catch (err) {
        console.error('❌ Error fetching candles:', err.message);
        return [];
    }
}
 ;
  
  function calculateEMA(period, prices) {
    const k = 2 / (period + 1);
    let ema = prices[0];
    const result = [ema];
    for (let i = 1; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
      result.push(ema);
    }
    return result;
  }
  
async function backtest() {
    const candles = await fetchCandles()
    //console.log('candles___',candles)
    const lotSize = 0.001;
    const targetPoints = 1000;
    const pointValue = 1; // 1 point per tick
    let balance = 0;
    let position = null; // { entryPrice, direction: "long" | "short" }
  
    const ema9 = calculateEMA(9, candles);
    const ema21 = calculateEMA(21, candles);
  
    for (let i = 21; i < candles.length; i++) {
      const price = candles[i];
      const prevSpread = ema9[i - 1] - ema21[i - 1];
      const currSpread = ema9[i] - ema21[i];
      const slope = currSpread - prevSpread;
  
      if (!position) {
        // Entry signals
        if (prevSpread < 0 && currSpread >= 0 && slope > 0) {
          position = { entryPrice: price, direction: "long", entryIndex: i };
          console.log(`🟢 Long entry @ ${price} (index ${i})`);
        } else if (prevSpread > 0 && currSpread <= 0 && slope < 0) {
          position = { entryPrice: price, direction: "short", entryIndex: i };
          console.log(`🔴 Short entry @ ${price} (index ${i})`);
        }
      } else {
        // Exit logic
        const move = price - position.entryPrice;
        const pnl = position.direction === "long"
          ? move * lotSize * pointValue
          : -move * lotSize * pointValue;
  
        if (Math.abs(move) >= targetPoints) {
          balance += pnl;
          console.log(
            `💰 Exit @ ${price} | ${position.direction} | PnL: $${pnl.toFixed(2)} | Balance: $${balance.toFixed(2)}`
          );
          position = null;
        }
      }
    }
  
    console.log(`\n🔚 Final balance: $${balance.toFixed(2)}`);
  }
  
  // Run backtest
  backtest();
  