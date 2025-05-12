const axios = require('axios')
require('dotenv').config()
const { EMA } = require('technicalindicators');
const api_url = process.env.API_URL 
const SYMBOL = 'BTCUSD'
const INTERVAL = '5m'

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
 
async function calculateEMA(){
    let closes = await fetchCandles() 

    let ema_9 = EMA.calculate({ period : 9, values : closes });
    ema_9 = ema_9[ema_9.length - 1];
    let ema_21 = EMA.calculate({ period : 21, values : closes });
    ema_21 = ema_21[ema_21.length - 1];
    console.clear() 
    console.table({
        ema_9 : Math.round(ema_9),
        ema_21 : Math.round(ema_21)
    })
}
 
setInterval( async ()=>{
    await calculateEMA() 
},2000) // 40 sec