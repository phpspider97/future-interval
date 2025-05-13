const axios = require('axios')

const API_URL = 'https://api.india.delta.exchange/v2/history/candles'
const symbol = 'BTCUSD'
const resolution = '5m'
const start = Math.floor(Date.now() / 1000) - (1 * 24 * 60 * 60)
const end = Math.floor(Date.now() / 1000)
const config = {
    lot_size : [1,3,9],
    total_loss_one_lot : 20 + 10, 
    total_profit_one_lot : 20 - 10, 
    buy_trigger_price : 50,
    buy_profit_price : 230,
    sell_trigger_price : 50,
    sell_profit_price :  230,
};

async function getHistoricalCandle(){
    const response = await axios.get(API_URL, {
        params: { symbol, resolution, start, end }
    })
    return response.data.result.reverse()
}
setTimeout( async ()=>{
    candles = await getHistoricalCandle()
    let count = 0
    for(candle of candles){
        count++
        if(count == 1){
            let spot_price = candle.close
            border_buy_price = spot_price + config.buy_trigger_price
            border_buy_profit_price = border_buy_price + config.buy_profit_price

            border_price = spot_price

            border_sell_price = spot_price - config.sell_trigger_price
            border_sell_profit_price = border_sell_price - config.sell_profit_price
        }

        if (candle.close > border_buy_profit_price || candle.close < border_sell_profit_price ) { 
             
        }
        console.log(candle.time)
    }

     

},1000)