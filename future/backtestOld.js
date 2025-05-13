const axios = require('axios'); 
require('dotenv').config(); 

let now = Math.floor(Date.now() / 1000)
const thirtyDaysAgo = now - (1 * 24 * 60 * 60)
 

const API_URL = 'https://api.india.delta.exchange/v2/history/candles';
const symbol = 'BTCUSD';
const resolution = '5m';
const start = thirtyDaysAgo; 
const end = now; 
  
let current_profit = 0;
let total_profit = 0;
 
let lot_size_array = [1, 3, 9]

let number_of_time_order_executed = 0
let loss_limit_exceed = false
let is_break_time = false

let border_buy_price;
let border_buy_profit_price;
let border_price;
let border_sell_price;
let border_sell_profit_price;
    
let buy_sell_profit_point = 230
let buy_sell_point = 50 

let total_error_count = 0

let order_exicuted_at_price = 0
let project_error_message = ""
let current_balance = 0
let orderInProgress = false   
let current_running_order = ''
 
async function loopOrder(){
    let lot_size                =   [1, 3, 9] 
    let current_running_order   =   ''
    let loss                    =   0
    let profit                  =   0 
    let candle_index            =   0
    var lot_array_count         =   0 
    let trading_fees_one_lot    =   0.05
    let loss_one_lot            =   0.1
    let profit_one_lot          =   0.2
    let crossCount              =   -1

    const result = await getCurrentPriceOfBitcoin()  
    const candles = result;
    for (const candle of candles) { 
        if(current_running_order == 'sell' && close_price>border_buy_price){ 
            current_running_order = '' 
        }

        if(current_running_order == '' && close_price>border_buy_price){ 
            current_running_order = 'buy'   
        } 

        if(current_running_order == 'buy' && close_price<border_sell_price){ 
            current_running_order = '' 
        }

        if(current_running_order == '' && close_price<border_sell_price){ 
            current_running_order = 'sell'  
        }

        if (close_price > border_buy_profit_price || close_price < border_sell_profit_price ) { 
            
        }
    }
} 

async function getCurrentPriceOfBitcoin() {
  const response = await axios.get(API_URL, {
    params: { symbol, resolution, start, end }
  });

  const candles = response.data.result;
  return candles
}

async function init() {  
    const result = await getCurrentPriceOfBitcoin()  
    const spot_price = Math.round(result[0].close) 
    
    border_buy_price = spot_price + buy_sell_point
    border_buy_profit_price = border_buy_price + buy_sell_profit_point

    border_price = spot_price

    border_sell_price = spot_price - buy_sell_point
    border_sell_profit_price = border_sell_price - buy_sell_profit_point

    order_exicuted_at_price = 0 
    total_error_count = 0  
    loss_limit_exceed = false 
     
    console.log('==================BUY PROFIT BORDER==================',border_buy_profit_price)
    console.log('==================BUY BORDER==================',border_buy_price)
    console.log('==================CURRENT PRICE==================',spot_price)
    console.log('==================SELL BORDER==================',border_sell_price)
    console.log('==================SELL PROFIT BORDER==================',border_sell_profit_price)
}
init() 
loopOrder()