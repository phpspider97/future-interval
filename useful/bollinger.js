const axios = require('axios')
const { BollingerBands } = require('technicalindicators')
require('dotenv').config()
const SYMBOL = 'BTCUSD'
const INTERVAL = '5m'
const api_url = process.env.API_URL 

async function fetchCandles() {
    const end_time_stamp = Math.floor(Date.now() / 1000)
    const start_time_stamp = end_time_stamp - (4 * 60 * 60)

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
        return closePrices;

    } catch (err) {
        console.error('❌ Error fetching candles:', err.message);
        return [];
    }
}

async function getBollingerValue(){
    let closes = await fetchCandles()
    closes = closes.slice(-50) 
    if (closes.length < 20) {
      console.log('⚠️ Not enough data to calculate EMAs')
      return;
    }

    const input = {
        period: 20,
        values: closes,
        stdDev: 2
    };

    const result = BollingerBands.calculate(input)
    console.table({
        upper : parseFloat(result[0].upper).toFixed(0),
        middle : parseFloat(result[0].middle).toFixed(0),
        lower : parseFloat(result[0].lower).toFixed(0),
        pb : parseFloat(result[0].pb).toFixed(2),
        upper_lower_diff : parseFloat(result[0].upper).toFixed(0)-parseFloat(result[0].lower).toFixed(0),
        upper_middle_diff : parseFloat(result[0].upper).toFixed(0)-parseFloat(result[0].middle).toFixed(0),
        lower_lower_diff : parseFloat(result[0].middle).toFixed(0)-parseFloat(result[0].lower).toFixed(0)
    })
}
 
setInterval( async ()=>{
    await getBollingerValue() 
},2000) // 40 sec
