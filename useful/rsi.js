const axios = require('axios') 
require('dotenv').config()
const SYMBOL = 'BTCUSD'
const INTERVAL = '5m'
const api_url = process.env.API_URL 

const { RSI } = require("technicalindicators")

async function fetchCandles() {
    const end_time_stamp = Math.floor(Date.now() / 1000)
    const start_time_stamp = end_time_stamp - (20 * 60 * 60)
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
        const closePrices = candles.map(c => parseFloat(c.close))
        return closePrices.reverse();

    } catch (err) {
        console.error('❌ Error fetching candles:', err.message);
        return [];
    }
}
  
async function calculateRSI() {
    try {
        let closes = await fetchCandles()  
        const rsiValues = RSI.calculate({
            values: closes,
            period: 14,
        });

        const latestRSI = rsiValues[rsiValues.length - 1];
        console.log(`Latest RSI : `, latestRSI) ;
    } catch (error) {
        console.error("Error calculating RSI:", error.message);
    }
}

setInterval( async ()=>{ 
    await calculateRSI() 
},2000)