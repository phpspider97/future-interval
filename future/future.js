const axios = require('axios')
const crypto = require('crypto')
require('dotenv').config()
const WebSocket = require('ws')
const nodemailer = require('nodemailer')   
const { findCandleTrend } = require('./trend.js')
const fs = require('fs')

const EventEmitter = require('events');
const futureEmitter = new EventEmitter();

let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.USER_EMAIL,
      pass: process.env.USER_PASSWORD
    },
})  
function sendEmail(message,subject){
    //return true 
    let mailOptions = {
        from: 'phpspider97@gmail.com',
        to: 'allinonetrade0009@gmail.com',
        subject: 'FUTURE BOT : ' +subject,
        html: message
    }
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            return console.log('Error:', error);
        }
        console.log('Email sent:', info.response);
    });
}

const API_URL       =   process.env.API_URL 
const SOCKET_URL    =   process.env.API_URL_SOCKET 
const KEY           =   process.env.FUTURE_WEB_KEY
const SECRET        =   process.env.FUTURE_WEB_SECRET 
const USER_ID       =   process.env.FUTURE_WEB_USER_ID

let lot_size_array                  =    [1, 1, 1] 
let is_live                         =    false
let LOSS_EXCEED_LIMIT               =    0 
let bitcoin_product_id              =    0
let is_break_time                   =    false
let border_buy_price                =    0
let border_buy_profit_price         =    0
let border_price                    =    0
let border_sell_price               =    0
let border_sell_profit_price        =    0
let buy_sell_profit_point           =    180
let buy_sell_point                  =    50
let total_error_count               =    0
let order_in_progress               =    false   
let current_running_order           =    ''
let reconnectInterval               =    2000
let number_of_time_order_executed   =    0 
let extra_buy_range                 =    0
let extra_sell_range                =    0
let create_order_error              =   {}


function wsConnect() { 
  const WEBSOCKET_URL = SOCKET_URL;
  const API_KEY = KEY;
  const API_SECRET = SECRET;
 
  function generateSignature(SECRET, message) {
    return crypto.createHmac('sha256', SECRET).update(message).digest('hex');
  }
 
  function subscribe(ws, channel, symbols) {
    const payload = {
      type: 'subscribe',
      payload: {
        channels: [
          {
            name: channel,
            symbols: symbols
          }
        ]
      }
    };
    ws.send(JSON.stringify(payload));
  }
   
  async function onMessage(data) { 
    const message = JSON.parse(data)
    if (message.type === 'success' && message.message === 'Authenticated') {
        subscribe(ws, 'orders', ['all'])
        subscribe(ws, 'v2/ticker', ['BTCUSD'])
    } else {
        if(message.type == 'error'){
            sendEmail(message.message,`IP ADDRESS ERROR`)
            console.log(message.message)
        }
        if(!is_live){
            return true
        }
        if(total_error_count>3) { 
            is_live = false
            fs.writeFileSync('./future/orderInfo.json', '', 'utf8')
            ws.close(1000, 'Too many errors');
        }    
        if(message.type == "orders"){
            // console.log('') 
            // console.log('message__',JSON.stringify(message))
            // console.log('') 
            if(message.state == 'closed' && message.meta_data.pnl != undefined){  
                //console.log('message___',JSON.stringify(message))
                let order_fill_at = message?.average_fill_price
                let side = message?.side
                let size = message?.size
                let is_update = false
                current_running_order = side
  
                await cancelPerticularOpenOrder()

                if(message.meta_data.pnl > 0){
                    sendEmail('',`PROFIT IN ORDER : ${size} LOT OF ${side.toUpperCase()} PROFIT OF $${message.meta_data.pnl}`)
                    await init()
                    return false
                }
                if(message.meta_data.pnl < 0){
                    sendEmail('',`LOSS IN ORDER : ${size} LOT OF ${side.toUpperCase()} LOSS OF $${message.meta_data.pnl}`)
                    await init()
                    return false
                }

                sendEmail('',`CREATE ${size} LOT OF ${side.toUpperCase()} ORDER AT ${order_fill_at}`)
 
                if(side == 'sell'){
                    let order_fill_difference = border_sell_price-order_fill_at
                    if(order_fill_difference>20){
                        is_update = true
                        border_buy_price -= order_fill_difference 
                        border_buy_profit_price -= order_fill_difference
                        border_price -= order_fill_difference
                        border_sell_price -= order_fill_difference
                        border_sell_profit_price -= order_fill_difference
                    } 
 
                    let buy_grid    =   generateGrid(border_buy_price,border_buy_profit_price,30)
                    let sell_grid   =   generateGrid(border_sell_profit_price-180,border_sell_profit_price,30)

                    await Promise.all(
                        buy_grid.slice(0, 4).map(async (stop_price) => {
                            await createOrder('buy', stop_price, border_price, false, size) 
                        })
                    )
                    await Promise.all(
                        sell_grid.slice(-4).map(async (stop_price) => {
                            await createOrder('buy', stop_price, border_price, true, size) 
                        })
                    )
                    // buy_grid.slice(0,4).forEach( async (stop_price)=>{
                    //     order_in_progress = false 
                    //     await createOrder('buy',stop_price,border_price,false,size)
                    //     await sleep(100)
                    // })
                    // sell_grid.slice(-4).forEach( async (stop_price)=>{
                    //     order_in_progress = false 
                    //     await createOrder('buy',stop_price,border_price,true,size)
                    //     await sleep(100)
                    // })
                }
                if(side == 'buy'){
                    let order_fill_difference = order_fill_at-border_buy_price
                    if(order_fill_difference>20){
                        is_update = true
                        border_buy_price += order_fill_difference 
                        border_buy_profit_price += order_fill_difference
                        border_price += order_fill_difference
                        border_sell_price += order_fill_difference
                        border_sell_profit_price += order_fill_difference
                    } 
  
                    let buy_grid  =  generateGrid(border_buy_profit_price,border_buy_profit_price+180,30)
                    let sell_grid   =   generateGrid(border_sell_profit_price,border_sell_price ,30)

                    await Promise.all(
                        buy_grid.slice(0, 4).map(async (stop_price) => {
                            await createOrder('sell', stop_price, border_price, true, size) 
                        })
                    )
                    await Promise.all(
                        sell_grid.slice(-4).map(async (stop_price) => {
                            await createOrder('sell', stop_price, border_price, false, size) 
                        })
                    )

                    // buy_grid.slice(0,4).forEach( async (stop_price)=>{
                    //     order_in_progress = false 
                    //     await createOrder('sell',stop_price,border_price,true,size)
                    //     await sleep(100)
                    // })

                    // sell_grid.slice(-4).forEach( async (stop_price)=>{
                    //     order_in_progress = false 
                    //     await createOrder('sell',stop_price,border_price,false,size)
                    //     await sleep(100)
                    // })
                }

                if(is_update){ 
                    updateOrderInfo(JSON.stringify({
                        bitcoin_product_id,
                        border_buy_profit_price,
                        border_buy_price,
                        border_price,
                        border_sell_price,
                        border_sell_profit_price,
                        is_update:true
                    }))
                }
            }
        }
        if(message.type == "v2/ticker"){
            let candle_current_price = message?.close
            if(is_break_time == true){
                return true
            }
            
            if(current_running_order == 'sell'){
                extra_buy_range = -60
                extra_sell_range = 110
            }

            if(current_running_order == 'buy'){
                extra_buy_range = 110
                extra_sell_range = -60
            }

            if (candle_current_price > border_buy_profit_price+extra_buy_range || candle_current_price < border_sell_profit_price-extra_sell_range ) {
                await init()
            }
            await triggerOrder(candle_current_price)
        } 
    } 
  } 
  async function onError(error) {
    await cancelAllOpenOrder() 
    sendEmail(error.message??'',`SOCKET DEFAULT ERROR TRIGGERED`) 
    setTimeout(() => {
        sendEmail('',`SOCKET RE-CONNECT AGAIN AFTER 2 SECONDS CLOSED DUE TO SOCKET DEFAULT ERROR TRIGGERED`)
        wsConnect()
    }, reconnectInterval)
  }
  async function resetLoop(){ 
    number_of_time_order_executed = 0
    setTimeout(async () => {
        await init()
        is_break_time = false
    }, 60000)
  }
  async function onClose(code, reason) {
    console.log(`Socket closed with code: ${code}, reason: ${reason.toString()}`)
    if(code == 1000){ 
      sendEmail(reason.toString(),`SOCKET CLOSED DUE TO TOO MANY ERROR`)
      await cancelAllOpenOrder()
      setTimeout(() => {
        total_error_count = 0 
        sendEmail('',`SOCKET RE-CONNECT AGAIN AFTER 1 MINUTE CLOSED DUE TO TOO MANY ERROR`)
        wsConnect()
        init()
      }, 60000)

    }else{
      total_error_count = 0
      sendEmail(reason.toString(),`SOCKET UNEXPECTED ERROR`)
      setTimeout(() => {
        sendEmail('',`SOCKET RE-CONNECT AGAIN AFTER 2 SECONDS CLOSED DUE TO SOCKET UNEXPECTED ERROR`)
        wsConnect()
      }, reconnectInterval)
    }
  }
  
  function sendAuthentication(ws) {
    const method = 'GET'
    const path = '/live'
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const signatureData = method + timestamp + path
    const signature = generateSignature(API_SECRET, signatureData)
    const authPayload = {
      type: 'auth',
      payload: {
        'api-key': API_KEY,
        signature: signature,
        timestamp: timestamp
      }
    }
    ws.send(JSON.stringify(authPayload))
  }

  const ws = new WebSocket(WEBSOCKET_URL);
  ws.on('open', () => { 
    sendAuthentication(ws);
  });
  ws.on('message', onMessage);
  ws.on('error', onError);
  ws.on('close', onClose);
}
wsConnect()
  
async function generateEncryptSignature(signaturePayload) { 
  return crypto.createHmac("sha256", SECRET).update(signaturePayload).digest("hex");
}

async function cancelAllOpenOrder() {
    try {
        current_running_order = ''
        const timestamp = Math.floor(Date.now() / 1000)
        const bodyParams = {
        close_all_portfolio: true,
        close_all_isolated: true,
        user_id: USER_ID,
        }; 
        const signaturePayload = `POST${timestamp}/v2/positions/close_all${JSON.stringify(bodyParams)}`;
        const signature = await generateEncryptSignature(signaturePayload);
        const headers = {
        "api-key": KEY,
        "signature": signature,
        "timestamp": timestamp,
        "Content-Type": "application/json",
        "Accept": "application/json",
        }
        const response = await axios.post(`${API_URL}/v2/positions/close_all`, bodyParams, { headers })
        return { data: response.data, status: true }
    } catch (error) { 
        sendEmail(error.message,`ERROR IN WHEN CANCEL ALL ORDER`)
        return { message: error.message, status: false };
    }
}

async function createOrder(bidType,order_price,bitcoin_current_price,is_limit_order=false,size) {
    try { 
        // let current_trend = await findCandleTrend() 
        // if(bidType == 'sell' && (current_trend == 'neutral' || current_trend == 'bull') ){
        //     return true
        // }
        // if(bidType == 'buy' && (current_trend == 'neutral' || current_trend == 'bear') ){
        //     return true
        // } 
        if(number_of_time_order_executed > lot_size_array.length-1){
            number_of_time_order_executed = 0 
        }   
        if(total_error_count > 3){
            return true
        }
        if(LOSS_EXCEED_LIMIT>3){ 
            sendEmail('',`${bidType.toUpperCase()} ORDER RESTRICT DUE TO EXCEED LOSS LIMIT`)
            return true
        }
        if (order_in_progress){ 
            //return true
        }
        order_in_progress = true
    
        const timestamp = Math.floor(Date.now() / 1000)
        let bodyParams = {}
        if(is_limit_order){
            bodyParams = {
                product_id: bitcoin_product_id,
                product_symbol: "BTCUSD",
                size: size,
                side: bidType,
                order_type: "limit_order",  
                limit_price : order_price,
            }
        }else{
            bodyParams = {
                product_id: bitcoin_product_id,
                product_symbol: "BTCUSD",
                size: 1,
                side: bidType,
                order_type: "limit_order", 
                stop_order_type: "stop_loss_order", 
                limit_price : (bidType == 'buy')?order_price-2:order_price, 
                stop_price  : (bidType == 'buy')?order_price:order_price-2,
                //stop_trigger_method: "last_traded_price"
            }
        }
        create_order_error = bodyParams
        //console.log('bodyParams', bitcoin_current_price, bodyParams)
        const signaturePayload = `POST${timestamp}/v2/orders${JSON.stringify(bodyParams)}`;
        const signature = await generateEncryptSignature(signaturePayload);

        const headers = {
            "api-key": KEY,
            "signature": signature,
            "timestamp": timestamp,
            "Content-Type": "application/json",
            "Accept": "application/json",
        };
        const response = await axios.post(`${API_URL}/v2/orders`, bodyParams, { headers });
            
        if (response.data.success) {  
            number_of_time_order_executed++
            return { data: response.data, status: true }
        }
        return { message: "Order failed", status: false }
    } catch (error) { 
        sendEmail(error.message + JSON.stringify(create_order_error),`ERROR IN WHEN CREATING ORDER`) 
        total_error_count++ 
        order_in_progress = false;  
        return { message: error?.message, status: false }
    } finally {
        order_in_progress = false;
    }
}

async function getCurrentPrice() {
    try {
        const response = await axios.get(`${API_URL}/v2/tickers?contract_type=perpetual_futures`);
        const btc_ticker_data = response.data.result.find(ticker => ticker.symbol === 'BTCUSD');

        return { data: btc_ticker_data, status: true };
    } catch (error) {
        sendEmail(error.message,`ERROR IN WHEN GET CURRENT PRICE`) 
        return { message: error.message, status: false };
    }
}

function generateGrid(start,end,step){
    const points = []
    for (let i = start; i <= end; i += step) {
        points.push(i);
    }
    return points
}
 
async function init() {  
    try{
        let buy_grid = []
        let sell_grid = []

        await cancelAllOpenOrder()
        await cancelPerticularOpenOrder() 

        const result = await getCurrentPrice() 
        if (!result?.data?.close) return
        const spot_price = Math.round(result?.data?.close)
        bitcoin_product_id = result.data.product_id
        
        border_buy_price = spot_price + buy_sell_point
        border_buy_profit_price = border_buy_price + buy_sell_profit_point
        border_price = spot_price
        border_sell_price = spot_price - buy_sell_point
        border_sell_profit_price = border_sell_price - buy_sell_profit_point
    
        total_error_count = 0   
        current_running_order = ''
        
        console.log('==================BUY PROFIT BORDER==================',border_buy_profit_price)
        console.log('==================BUY BORDER==================',border_buy_price)
        console.log('==================CURRENT PRICE==================',spot_price)
        console.log('==================SELL BORDER==================',border_sell_price)
        console.log('==================SELL PROFIT BORDER==================',border_sell_profit_price)

        updateOrderInfo(JSON.stringify({
            bitcoin_product_id,
            border_buy_profit_price,
            border_buy_price,
            border_price:spot_price,
            border_sell_price,
            border_sell_profit_price,
            is_update:false
        }))
 
        buy_grid    =   generateGrid(border_buy_price,border_buy_profit_price,30)
        sell_grid   =   generateGrid(border_sell_profit_price,border_sell_price,30)
         
        //console.log('buy_grid__',buy_grid)
        //console.log('sell_grid__',sell_grid)
 
        await Promise.all(
            buy_grid.slice(0, 4).map(async (stop_price) => {
                await createOrder('buy', stop_price, border_price, false, 1) 
            })
        )
        await Promise.all(
            sell_grid.slice(-4).map(async (stop_price) => {
                await createOrder('sell', stop_price, border_price, false, 1) 
            })
        )
 
    }catch(error){
        sendEmail(error.message,`ERROR IN WHEN CALL INIT FUNCTION`)
    }
}

async function cancelPerticularOpenOrder() {
    try { 
        const timestamp = Math.floor(Date.now() / 1000)
        const bodyParams = {
            "product_id": bitcoin_product_id,
            "contract_types": "perpetual_futures",
            "cancel_limit_orders": true,
            "cancel_stop_orders": true,
            "cancel_reduce_only_orders": false
        }
          
        const signaturePayload = `DELETE${timestamp}/v2/orders/all${JSON.stringify(bodyParams)}`;
        const signature = await generateEncryptSignature(signaturePayload);
        const headers = {
            "api-key": KEY,
            "signature": signature,
            "timestamp": timestamp,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        const response = await axios.delete(`${API_URL}/v2/orders/all`, { 
            headers,
            data : bodyParams
        })
        return { data: response.data, status: true }
    } catch (error) {  
        sendEmail(error.message,`ERROR IN WHEN CANCEL ALL ORDER`)
        return { message: error.message, status: false };
    }
}

async function getBalance() {
    try {   
        const timestamp = Math.floor(Date.now() / 1000)
        const signaturePayload = `GET${timestamp}/v2/wallet/balances`;
        const signature = await generateEncryptSignature(signaturePayload);

        const headers = {
            "api-key": KEY,
            "signature": signature,
            "timestamp": timestamp,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }; 
        const response = await axios.get(`${API_URL}/v2/wallet/balances`, { headers })
        return response.data.result[0].balance_inr
    } catch (error) {
        sendEmail(error.message,`ERROR IN WHEN GET BALANCE`)
    }
}

(function() { 
    is_live = (fs.statSync('./future/orderInfo.json').size != 0)?true:false
    if(is_live){
        let order_data = fs.readFileSync('./future/orderInfo.json', 'utf8')
        order_data = JSON.parse(order_data) 
        bitcoin_product_id = order_data.bitcoin_product_id
        border_buy_profit_price = order_data.border_buy_profit_price
        border_buy_price = order_data.border_buy_price
        border_price = order_data.border_price 
        border_sell_price = order_data.border_sell_price
        border_sell_profit_price = order_data.border_sell_profit_price
        is_update = order_data.is_update
    }
})();
  
async function updateOrderInfo(content){
    fs.writeFile('./future/orderInfo.json', content, (error) => {
        if (error) {
            sendEmail(JSON.stringify(error),`ERROR IN WHEN UPDATE ORDER FILE`)
        } else {
            console.log('File created and text written successfully.');
        }
    })
}

async function socketEventInfo(current_price){
    let order_data = {}
    let current_balance = await getBalance() 
    is_live = (fs.statSync('./future/orderInfo.json').size != 0)?true:false
    if(is_live){
        order_data = fs.readFileSync('./future/orderInfo.json', 'utf8')
        order_data = JSON.parse(order_data) 
    }
    
    let current_trend = await findCandleTrend()
    futureEmitter.emit("future_trade_info", {
        balance : current_balance, 
        bitcoin_product_id : order_data.bitcoin_product_id??0,
        current_price : current_price??0,
        border_buy_profit_price : order_data.border_buy_profit_price??0,
        border_buy_price : order_data.border_buy_price??0,
        border_price : order_data.border_price??0, 
        border_sell_price : order_data.border_sell_price??0,
        border_sell_profit_price : order_data.border_sell_profit_price??0,
        is_update : order_data.is_update??0,
        is_live : is_live,
        current_trend
    })
}

async function triggerOrder(current_price) {
    try{
        socketEventInfo(current_price)
    }catch(error){ 
        sendEmail(error.message,`ERROR IN WHEN GET PRODUCT INFORMATION BY SOCKET`)
    }
}

futureEmitter.on("future_start", () => { 
    init() 
    is_live = true 
    sendEmail('',`BOT START BUTTON PRESSED`)
})

futureEmitter.on("future_stop", async () => { 
    await cancelAllOpenOrder() 
    fs.writeFileSync('./future/orderInfo.json', '', 'utf8')
    is_live = false 
    sendEmail('',`BOT STOP BUTTON PRESSED`)
})

module.exports = { futureEmitter }