const axios = require('axios') 
require('dotenv').config()
const SYMBOL = 'BTCUSD'
const INTERVAL = '5m'
const api_url = process.env.API_URL 

const { EMA } = require('technicalindicators');

async function fetchCandles() {
    const end_time_stamp = Math.floor(Date.now() / 1000)
    const start_time_stamp = end_time_stamp - (6 * 60 * 60)

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

async function checkCrossOver(count){
    const closes = await fetchCandles() 
    if (closes.length < 21) {
      console.log('⚠️ Not enough data to calculate EMAs');
      return;
    }

    // Calculate 9 EMA
    const ema9 = EMA.calculate({ period: 9, values: closes });
    // Calculate 21 EMA
    const ema21 = EMA.calculate({ period: 21, values: closes });

    // Make sure you have enough data points
    if (ema9.length >= 2 && ema21.length >= 2) {
        const currentEMA9 = ema9[ema9.length - 1];
        const previousEMA9 = ema9[ema9.length - 2];
        const currentEMA21 = ema21[ema21.length - 1];
        const previousEMA21 = ema21[ema21.length - 2];

        if (previousEMA9 < previousEMA21 && currentEMA9 > currentEMA21) {
            console.log('Bullish crossover (EMA9 crossed above EMA21)');
        } else if (previousEMA9 > previousEMA21 && currentEMA9 < currentEMA21) {
            console.log('Bearish crossover (EMA9 crossed below EMA21)');
        } else {
            console.clear()
            console.log(count + '. No crossover detected');
        }
    }
}
let count = 0
setInterval( async ()=>{
    count++
    await checkCrossOver(count) 
},2000)