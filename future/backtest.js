const axios = require('axios')

const API_URL = 'https://api.india.delta.exchange/v2/history/candles'
const symbol = 'BTCUSD'
const resolution = '5m'
const start = Math.floor(Date.now() / 1000) - (1 * 24 * 60 * 60)
const end = Math.floor(Date.now() / 1000)
let border_buy_price;
let border_buy_profit_price;
let border_price;
let border_sell_price;
let border_sell_profit_price;
let current_order = '';
let total_order_trigger = 0
let total_loss = 0
let total_profit = 0
const config = {
    lot_size : [1,3,9],
    total_loss_one_lot : 20 + 10, 
    total_profit_one_lot : 20 - 10, 
    buy_trigger_price : 50,
    buy_profit_price : 430,
    sell_trigger_price : 50,
    sell_profit_price :  430,
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
    console.log('candles length : ', candles.length)
    for(candle of candles){
        count++
        //console.log('total_order_trigger___',total_order_trigger)
        if(count == 1 || total_order_trigger>config.lot_size.length-1){
            total_order_trigger = (total_order_trigger>config.lot_size.length-1)?0:total_order_trigger
            await resetData(candle)
        } 
        //console.log(config.lot_size[total_order_trigger],total_order_trigger)
        if (candle.close > border_buy_price && current_order == '') {
            current_order = 'BUY'
        } 
        if (candle.close < border_sell_price && current_order == '') { 
            current_order = 'SELL'
        } 
        if (candle.close < border_sell_price && current_order == 'BUY') {
            total_loss += config.lot_size[total_order_trigger] * config.total_loss_one_lot
            total_order_trigger++ 
        } 
        if (candle.close > border_buy_price && current_order == 'SELL') {
            total_loss += config.lot_size[total_order_trigger] * config.total_loss_one_lot
            total_order_trigger++ 
        } 
        if (candle.close > border_buy_profit_price || candle.close < border_sell_profit_price ) { 
            total_order_trigger = (total_order_trigger>config.lot_size.length-1)?0:total_order_trigger
            total_profit += config.lot_size[total_order_trigger] * config.total_profit_one_lot
            total_order_trigger = 0
            current_order = '' 
            await resetData(candle)
        } 
    }
    console.clear()
    console.table({
        total_profit,
        total_loss,
        net:total_profit-total_loss
    })

},1000)

async function resetData(candle){
    let spot_price = candle.close
    border_buy_price = spot_price + config.buy_trigger_price
    border_buy_profit_price = border_buy_price + config.buy_profit_price

    border_price = spot_price

    border_sell_price = spot_price - config.sell_trigger_price
    border_sell_profit_price = border_sell_price - config.sell_profit_price
}