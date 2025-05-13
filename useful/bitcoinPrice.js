const axios = require('axios');
require('dotenv').config();

const api_url = process.env.API_URL 
async function getCurrentPriceOfBitcoin() {
    try {  
      const response = await axios.get(`${api_url}/v2/tickers?contract_type=perpetual_futures`);
      //console.log(response.data.result) 
      const btc_ticker = response.data.result.find(ticker => ticker.symbol === 'BTCUSD');
      
      console.clear()
      console.table({
        close: btc_ticker.close,
        high: btc_ticker.high,
        low: btc_ticker.low,
        open: btc_ticker.open,
        mark_price: parseFloat(btc_ticker.mark_price).toFixed(2),
        spot_price: parseFloat(btc_ticker.spot_price).toFixed(2),
      })

    } catch (error) {
        console.log('error____',error.message) 
    }
}

setInterval(async ()=>{
    await getCurrentPriceOfBitcoin()
},2000)