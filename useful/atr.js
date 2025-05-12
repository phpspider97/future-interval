const axios = require('axios') 
require('dotenv').config()
const SYMBOL = 'BTCUSD'
const INTERVAL = '5m'
const api_url = process.env.API_URL 
const { ATR } = require('technicalindicators')

async function fetchCandles() {
    const end_time_stamp = Math.floor(Date.now() / 1000)
    const start_time_stamp = end_time_stamp - (15 * 60 * 60)

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
        const highPrices = candles.map(c => parseFloat(c.high));
        const lowPrices = candles.map(c => parseFloat(c.low));
        const closePrices = candles.map(c => parseFloat(c.close));
        return {
            high  : highPrices.reverse(),
            low   : lowPrices.reverse(),
            close : closePrices.reverse()
        }

    } catch (err) {
        console.error('❌ Error fetching candles:', err.message);
        return [];
    }
}
  

async function checkATR(){
    const candle_data = await fetchCandles()  
    const high = candle_data.high
    const low = candle_data.low
    const close = candle_data.close
    
    const period = 14
    const atr_value = ATR.calculate({ high, low, close, period })
    console.clear()
    //console.log('atr_value___',JSON.stringify(atr_value))
    console.log('ATR Values:', atr_value[atr_value.length - 1].toFixed(2) )
}
let count = 0
setInterval( async ()=>{
    count++
    await checkATR(count) 
},2000)
