const axios = require('axios');

let now = Math.floor(Date.now() / 1000); // current time in seconds
 //now = now - (60 * 24 * 60 * 60); // 30 days in seconds
const thirtyDaysAgo = now - (2 * 24 * 60 * 60); // 30 days in seconds

// console.log('Start (30 days ago):', thirtyDaysAgo);
// console.log('End (now):', now);

const API_URL = 'https://api.india.delta.exchange/v2/history/candles';
const symbol = 'BTCUSD';
const resolution = '5m';
const start = thirtyDaysAgo; // Replace with your desired UNIX timestamp
const end = now;   // Replace with your desired UNIX timestamp

async function backtest() {
  try {
    const response = await axios.get(API_URL, {
      params: { symbol, resolution, start, end }
    });

    const candles = response.data.result;
    
    let lot_size                =   [1, 3, 9, 27, 81, 243] 
    let current_running_order   =   'sell'
    let loss                    =   0
    let profit                  =   0 
    let candle_index            =   0
    var lot_array_count         =   0 
    let trading_fees_one_lot    =   0.05
    let loss_one_lot            =   0.1
    let profit_one_lot          =   0.2
    let crossCount              =   -1;
    let loss_arr                =   []
    let profite_arr              =   []

    //console.log('candles___',candles)
    console.clear();
    for (const candle of candles) { 
        if(lot_array_count>3){ lot_array_count = 0 }
        crossCount++
        let closePrice                  =   candle.open;
        let first_close_caldle          =   candles[candle_index].open; 
        let sell_stop_loss              =   first_close_caldle-100
        let buy_stop_loss               =   first_close_caldle
        let border_buy_profit_price     =   first_close_caldle+200
        let border_sell_profit_price    =   first_close_caldle-100-200
       
        if(current_running_order == 'sell' && closePrice < sell_stop_loss){ 
            current_running_order = 'buy'
            loss += ( (loss_one_lot  + trading_fees_one_lot ) * lot_size[lot_array_count]) 
            lot_array_count++
        }
        
        if(current_running_order == 'buy' && closePrice > buy_stop_loss){
            current_running_order = 'sell'
            loss += ( loss_one_lot * lot_size[lot_array_count] + trading_fees_one_lot * lot_size[lot_array_count] )
            lot_array_count++ 
        }
          
        if (closePrice > border_buy_profit_price || closePrice < border_sell_profit_price) {
            current_running_order = 'sell'
            candle_index = crossCount
            profit += ( profit_one_lot * lot_size[lot_array_count] - trading_fees_one_lot * lot_size[lot_array_count] )  
            lot_array_count = 0  
        }
    }

    //console.log('loss_arr____',loss_arr)
    //console.log('profite_arr____',profite_arr)
    //const total_loss_arr = loss_arr.reduce((total, num) => total + num, 0);
    //const total_profite_arr = profite_arr.reduce((total, num) => total + num, 0);

    console.log('COUNT : '  , crossCount);
    console.log('GAIN : '   , profit.toFixed(2));
    console.log('LOSS :   ', loss.toFixed(2));
    console.log('PROFIT :   ',(profit-loss).toFixed(2));
  } catch (error) {
    console.error('Error fetching or processing data:', error.message);
  }
}

backtest();