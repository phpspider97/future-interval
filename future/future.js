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
    return true
    let mailOptions = {
        from: 'phpspider97@gmail.com',
        to: 'neelbhardwaj97@gmail.com',
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
let bitcoin_product_id              =    0 
let border_buy_price                =    0
let border_buy_profit_price         =    0
let border_price                    =    0
let border_sell_price               =    0
let border_sell_profit_price        =    0
let buy_sell_profit_point           =    140
let buy_sell_point                  =    100
let total_error_count               =    0
let order_in_progress               =    false   
let current_running_order           =    ''
let reconnectInterval               =    2000
let number_of_time_order_executed   =    0  
let create_order_info               =    []
let is_update                       =    false

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
            console.log("FUTURE : " + message.message)
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
            if(message.state == 'closed' && message.meta_data.pnl != undefined){   
                let spot_price = parseInt(message?.average_fill_price)
                let side = message?.side 
                
                border_buy_price = spot_price - buy_sell_point
                border_buy_profit_price = spot_price + buy_sell_profit_point
                border_price = spot_price
                border_sell_price = spot_price + buy_sell_point
                border_sell_profit_price = spot_price - buy_sell_profit_point
                current_running_order = side
                is_update = true
 
                if(is_update){
                    updateOrderInfo(JSON.stringify({
                        bitcoin_product_id,
                        border_buy_profit_price,
                        border_buy_price,
                        border_price,
                        border_sell_price,
                        border_sell_profit_price,
                        is_update:true,
                        current_running_order,
                        number_of_time_order_executed
                    }))
                }
                await cancelPerticularOpenOrder()
            }
        }
          
        if(message.type == "v2/ticker"){
            let candle_current_price = message?.close
             
            if (current_running_order == 'buy' && (candle_current_price > border_buy_profit_price || candle_current_price < border_buy_price) ) {
                await resetLoop()
            } 
            if (current_running_order == 'sell' && (candle_current_price < border_sell_profit_price || candle_current_price > border_sell_price) ) { 
                await resetLoop() 
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
    current_running_order = ''
    number_of_time_order_executed = 0
    await cancelAllOpenOrder()
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
        resetLoop()
      }, 60000);

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
 
async function createOrder(bidType,order_price,bitcoin_current_price) {
    try {  
        if(total_error_count > 3){
            return true
        } 
        if (order_in_progress){ 
            return true
        }
        order_in_progress = true
    
        const timestamp = Math.floor(Date.now() / 1000)
        const bodyParams = { 
            product_id: bitcoin_product_id,
            product_symbol: "BTCUSD",
            size: 1,
            side: bidType,
            order_type: "limit_order", 
            stop_order_type: "stop_loss_order", 
            limit_price : (bidType == 'buy')?order_price-2:order_price, 
            stop_price  : (bidType == 'buy')?order_price:order_price-2,
            post_only: true, 
            stop_trigger_method: "last_traded_price"
        };
        console.log('bodyParams__',bodyParams)

        const signaturePayload = `POST${timestamp}/v2/orders${JSON.stringify(bodyParams)}`;
        const signature = await generateEncryptSignature(signaturePayload);
 
        const headers = {
            "api-key": KEY,
            "signature": signature,
            "timestamp": timestamp,
            "Content-Type": "application/json",
            "Accept": "application/json",
        };
        const response = await axios.post(`${API_URL}/v2/orders`, bodyParams, { headers }) 
        if (response.data.success) { 
            const message_template = `<br /><br /><br />
            <table border="1" cellpadding="8" cellspacing="3">
                <tr>
                    <td>Size</td>
                    <td>:</td>
                    <td>${lot_size_array[number_of_time_order_executed]}</td> 
                </tr>
                <tr>
                    <td>Side</td>
                    <td>:</td>
                    <td>${bidType}</td> 
                </tr>
                <tr>
                    <td>Current Price</td>
                    <td>:</td>
                    <td>${bitcoin_current_price}</td> 
                </tr>
                <tr style='background:green;color:white'>
                    <td>Border Buy Profit Price</td>
                    <td>:</td>
                    <td>${border_buy_profit_price}</td> 
                </tr>
                <tr style='background:green;color:white'>
                    <td>border_buy_price</td>
                    <td>:</td>
                    <td>${border_buy_price}</td> 
                </tr>
                <tr style='background:yellow;color:black'>
                    <td>Border Price</td>
                    <td>:</td>
                    <td>${border_price}</td> 
                </tr> 
                <tr style='background:red;color:white'>
                    <td>Border Sell Price</td>
                    <td>:</td>
                    <td>${border_sell_price}</td> 
                </tr>
                <tr style='background:red;color:white'>
                    <td>Border Sell Profit Price</td>
                    <td>:</td>
                    <td>${border_sell_profit_price}</td> 
                </tr> 
            </table>
            `
            //sendEmail(message_template,`CREATE ORDER : ${lot_size_array[number_of_time_order_executed]} - ${bidType}`)

            number_of_time_order_executed++ 
            create_order_info.push(response.data.result.id)
            return { data: response.data, status: true }
        }
        return { message: "Order failed", status: false }
    } catch (error) {
        console.log(error.message) 
        sendEmail(error.message,`ERROR IN WHEN CREATING ORDER`) 
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
 
async function init() {  
    try{
        await cancelAllOpenOrder()
        const result = await getCurrentPrice() 
        if (!result?.data?.close) return
        const spot_price = Math.round(result?.data?.close)

        bitcoin_product_id = result.data.product_id 
        border_buy_price = spot_price - buy_sell_point
        border_buy_profit_price = spot_price + buy_sell_profit_point
        border_price = spot_price
        border_sell_price = spot_price + buy_sell_point
        border_sell_profit_price = spot_price - buy_sell_profit_point
        is_update  = false
        total_error_count = 0   
           
        continueCheckTrend()
 
        updateOrderInfo(JSON.stringify({
            bitcoin_product_id,
            border_buy_profit_price,
            border_buy_price,
            border_price:spot_price,
            border_sell_price,
            border_sell_profit_price,
            is_update:false,
            current_running_order,
            number_of_time_order_executed:0
        }))
    }catch(error){
        sendEmail(error.message,`ERROR IN WHEN CALL INIT FUNCTION`)
    }
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function updatePriceSetting(spot_price){
    border_buy_price = spot_price - buy_sell_point
    border_buy_profit_price = spot_price + buy_sell_profit_point
    border_price = spot_price
    border_sell_price = spot_price + buy_sell_point
    border_sell_profit_price = spot_price - buy_sell_profit_point
}
function continueCheckTrend(){
    setInterval( async () => {
        const result = await getCurrentPrice() 
        if (!result?.data?.close) return
        const spot_price = Math.round(parseInt(result?.data?.close))
        bitcoin_product_id = result.data.product_id 
        let current_trend = await findCandleTrend() 
        current_trend = 'bear'  
        if(current_trend == 'bear' && number_of_time_order_executed == 0 && current_running_order == ''){
            number_of_time_order_executed++ 
            await cancelAllOpenOrder()
            for(let count = 60; count >= 20; count-=20){ 
                order_in_progress = false
                updatePriceSetting(spot_price)
                await createOrder('sell',spot_price - count,spot_price)
                await sleep(500)
            }
        }  
        if(current_trend == 'bull' && number_of_time_order_executed == 0 && current_running_order == ''){
            number_of_time_order_executed++
            await cancelAllOpenOrder()
            for (let count = 20; count <= 60; count += 20) {
                order_in_progress = false
                updatePriceSetting(spot_price)
                await createOrder('buy',spot_price + count,spot_price)
                await sleep(500)
            } 
        }   
        // console.clear() 
        // console.table([
        //     { Label: 'Current trend', Data: current_trend },
        //     { Label: 'BUY PROFIT BORDER', Data: border_buy_profit_price },
        //     { Label: 'BUY BORDER', Data: border_buy_price },
        //     { Label: 'CURRENT PRICE', Data: border_price },
        //     { Label: 'SELL BORDER', Data: border_sell_price },
        //     { Label: 'SELL PROFIT BORDER', Data: border_sell_profit_price },
        //     { Label: 'IS UPDATED', Data: is_update??null },
        //     { Label: 'current_running_order', Data: current_running_order },
        //     { Label: 'number_of_time_order_executed', Data: number_of_time_order_executed }
        // ]) 
    }, 3000)
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
        wsConnect() 
        continueCheckTrend()
        let order_data = fs.readFileSync('./future/orderInfo.json', 'utf8')
        order_data = JSON.parse(order_data) 
        bitcoin_product_id = order_data.bitcoin_product_id
        border_buy_profit_price = order_data.border_buy_profit_price
        border_buy_price = order_data.border_buy_price
        border_price = order_data.border_price 
        border_sell_price = order_data.border_sell_price
        border_sell_profit_price = order_data.border_sell_profit_price
        is_update = order_data.is_update
        current_running_order = order_data.current_running_order
        number_of_time_order_executed = order_data.number_of_time_order_executed
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
    wsConnect()
    sendEmail('',`BOT START BUTTON PRESSED`)
})

futureEmitter.on("future_stop", async () => { 
    await cancelAllOpenOrder() 
    fs.writeFileSync('./future/orderInfo.json', '', 'utf8')
    is_live = false 
    sendEmail('',`BOT STOP BUTTON PRESSED`)
})

module.exports = { futureEmitter }