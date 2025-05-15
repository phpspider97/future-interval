const axios = require('axios')
const crypto = require('crypto')
require('dotenv').config()
const WebSocket = require('ws')
const nodemailer = require('nodemailer')
const { classifyLastCandle } = require('./trend.js')
const fs = require('fs')

const EventEmitter = require('events');
const optionEmitter = new EventEmitter();

let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.USER_EMAIL,
      pass: process.env.USER_PASSWORD
    },
})

function sendEmail(message,subject){
    if(!is_live){
        return false
    }
    let mailOptions = {
        from: 'phpspider97@gmail.com',
        to: 'neelbhardwaj97@gmail.com',
        subject: 'OPTION BOT : ' +subject,
        html: message
    } 
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log('Error:', error);
        }
        console.log('Email sent:', info.response);
    });
}

const API_URL       =   process.env.API_URL 
const SOCKET_URL    =   process.env.API_URL_SOCKET 
const KEY           =   process.env.OPTION_WEB_KEY
const SECRET        =   process.env.OPTION_WEB_SECRET 
const USER_ID       =   process.env.OPTION_WEB_USER_ID

let lot_size_array                  =   [2, 2, 2]
let is_live                         =   false
let is_break_time                   =   false
let LOSS_EXCEED_LIMIT               =   0
let number_of_time_order_executed   =   0
let bitcoin_current_price           =   0
let additional_profit_buy_price     =   0
let border_buy_price                =   0
let border_buy_profit_price         =   0
let border_sell_price               =   0
let border_sell_profit_price        =   0
let buy_sell_profit_point           =   400 
let CANCEL_GAP                      =   200  
let total_error_count               =   0
let order_in_progress               =   false   
let current_running_order           =   '' 
let reconnectInterval               =   2000

function wsConnect() { 
  const WEBSOCKET_URL = SOCKET_URL
  const API_KEY = KEY
  const API_SECRET = SECRET
 
  function generateSignature(secret, message) {
    return crypto.createHmac('sha256', secret).update(message).digest('hex')
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
        subscribe(ws, 'orders', ['all']);
        subscribe(ws, 'v2/ticker', ['BTCUSD']); 
    } else {
        if(message.type == 'error'){
            sendEmail(message.message,`IP ADDRESS ERROR`)
            console.log(message.message)
        }
        if(total_error_count>3) { 
            is_live = false
            fs.writeFileSync('./option/orderInfo.json', '', 'utf8')
            ws.close(1000, 'Too many errors');
        }
        if(!is_live){
            return true
        }
        if(message.type == "v2/ticker"){ 
            let candle_current_price = message?.spot_price
            if(is_break_time == true){
                return true
            } 
            if(current_running_order == 'sell' && candle_current_price < border_sell_price){ 
                console.log('1_loss__lot_size_array___',lot_size_array,number_of_time_order_executed)
                sendEmail('',`LOSS IN ORDER : LOT SIZE : ${lot_size_array[number_of_time_order_executed-1]} - ${current_running_order}`)
                current_running_order = 'buy'
                bitcoin_current_price = candle_current_price 
                LOSS_EXCEED_LIMIT++
                await cancelAllOpenOrder()
                const result = await getCurrentPriceOfBitcoin('call');
                if (!result.status) return;
                await createOrder(result?.data?.option_data?.product_id,result?.data?.option_data?.symbol)
            }

            if(current_running_order == 'buy' && candle_current_price>border_buy_price){ 
                console.log('2_loss__lot_size_array___',lot_size_array,number_of_time_order_executed)
                sendEmail('',`LOSS IN ORDER : LOT SIZE : ${lot_size_array[number_of_time_order_executed-1]} - ${current_running_order}`)
                current_running_order = 'sell'
                bitcoin_current_price = candle_current_price
                LOSS_EXCEED_LIMIT++
                await cancelAllOpenOrder()
                const result = await getCurrentPriceOfBitcoin('put')
                if (!result.status) return;
                await createOrder(result?.data?.option_data?.product_id,result?.data?.option_data?.symbol)
            }
              
            if (candle_current_price > border_buy_profit_price+additional_profit_buy_price || candle_current_price < border_sell_profit_price) {  
                console.log('profite__lot_size_array___',lot_size_array,number_of_time_order_executed)
                sendEmail('',`PROFIT IN ORDER : LOT SIZE : ${lot_size_array[number_of_time_order_executed-1]} - ${current_running_order}`) 
                is_break_time = true 
                LOSS_EXCEED_LIMIT = 0
                bitcoin_current_price = candle_current_price 
                await cancelAllOpenOrder()
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
    number_of_time_order_executed = 0
    setTimeout(async () => {
        await init()
        is_break_time = false
    }, 60000)
  }
  async function onClose(code, reason) {
    console.log(`Socket closed with code: ${code}, reason: ${reason}`)
    if(code == 1000){
        sendEmail(reason.toString(),`SOCKET CLOSED DUE TO TOO MANY ERROR`)
        await cancelAllOpenOrder()
        setTimeout(() => {
            total_error_count = 0
            sendEmail('',`SOCKET RE-CONNECT AGAIN AFTER 1 MINUTE CLOSED DUE TO TOO MANY ERROR`)
            wsConnect();
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
    const method = 'GET';
    const path = '/live';
    const timestamp = Math.floor(Date.now() / 1000).toString(); // Unix timestamp in seconds
    const signatureData = method + timestamp + path;
    const signature = generateSignature(API_SECRET, signatureData);

    const authPayload = {
      type: 'auth',
      payload: {
        'api-key': API_KEY,
        signature: signature,
        timestamp: timestamp
      }
    };

    ws.send(JSON.stringify(authPayload));
  } 
 
  const ws = new WebSocket(WEBSOCKET_URL);
  ws.on('open', () => { 
    sendAuthentication(ws);
  });
  ws.on('message', onMessage);
  ws.on('error', onError);
  ws.on('close', onClose);
}
wsConnect();


async function generateEncryptSignature(signaturePayload) { 
  return crypto.createHmac("sha256", SECRET).update(signaturePayload).digest("hex");
}

async function cancelAllOpenOrder() {
    try { 
        const timestamp = Math.floor(Date.now() / 1000);
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
        }; 
        const response = await axios.post(`${API_URL}/v2/positions/close_all`, bodyParams, { headers });
        return { data: response.data, status: true };
    } catch (error) {
        sendEmail(error.message,`ERROR IN WHEN CANCEL ALL ORDER`)
        return { message: error.message, status: false };
    }
}

async function createOrder(product_id,bitcoin_option_symbol) {
    // let current_trend = await classifyLastCandle()  
    // if(current_running_order == 'sell' && (current_trend == 'neutral' || current_trend == 'bull') ){
    //     return true
    // }
    // if(current_running_order == 'buy' && (current_trend == 'neutral' || current_trend == 'bear') ){
    //     return true
    // }
    if(number_of_time_order_executed > lot_size_array.length-1){
        number_of_time_order_executed = 0 
    }  
    if(total_error_count>3){ 
        return true
    }
    if(LOSS_EXCEED_LIMIT>3){ 
        return false
    }
    if (order_in_progress){ 
        return true
    }
    order_in_progress = true
     
    try { 
        const timestamp = Math.floor(Date.now() / 1000);
        const bodyParams = {
            product_id: product_id, 
            product_symbol: bitcoin_option_symbol, 
            size: lot_size_array[number_of_time_order_executed],
            side: 'sell', 
            order_type: "market_order"
        }
 
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
            const message_template = `<br /><br /><br />
            <table border="1" cellpadding="8" cellspacing="3">
                <tr>
                    <td>Product Symbol</td>
                    <td>:</td>
                    <td>${bitcoin_option_symbol}</td> 
                </tr>
                <tr>
                    <td>Size</td>
                    <td>:</td>
                    <td>${lot_size_array[number_of_time_order_executed]}</td> 
                </tr>
                <tr>
                    <td>Current Price</td>
                    <td>:</td>
                    <td>${bitcoin_current_price}</td> 
                </tr>
                <tr>
                    <td>Number Of Time Order Executed</td>
                    <td>:</td>
                    <td>${number_of_time_order_executed}</td> 
                </tr>
                ${
                    (additional_profit_buy_price>0)?
                    `
                    <tr>
                        <td>Price Gap From Spot Price</td>
                        <td>:</td>
                        <td>${bitcoin_current_price-(parseInt(bitcoin_option_symbol.split('-')[2])+200)}</td> 
                    </tr>`:``
                }
            </table>
            ` 
            sendEmail(message_template,`CREATE ORDER : ${bitcoin_option_symbol}`)
            number_of_time_order_executed++
            return { data: response.data, status: true }
        }
        return { message: "Order failed", status: false };
    } catch (error) {
        sendEmail(error.message,`ERROR IN WHEN CREATING ORDER`) 
        total_error_count++ 
        order_in_progress = false; 
        return { message: error?.message, status: false };
    } finally {
        order_in_progress = false;
    }
}
 
function getAdjustedDate() { 
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime()); 
    if (istTime.getHours() > 17 || (istTime.getHours() === 17 && istTime.getMinutes() >= 30)) {
        istTime.setDate(istTime.getDate() + 1);
    }
    
    const day = String(istTime.getDate()).padStart(2, '0');
    const month = String(istTime.getMonth() + 1).padStart(2, '0'); // Months are zero-based
    const year = istTime.getFullYear();

    return `${day}-${month}-${year}`
}

async function getCurrentPriceOfBitcoin(data_type) {
    try {
        additional_profit_buy_price = 0 
        const expiry_date = getAdjustedDate()  
        const response = await axios.get(`${API_URL}/v2/tickers/?underlying_asset_symbols=BTC&contract_types=call_options,put_options&states=live&expiry_date=16-05-2025`);
        const allProducts = response.data.result;
        
        const spot_price = Math.round(allProducts[0].spot_price / 200) * 200
        bitcoin_current_price = Math.round(allProducts[0].spot_price);
        let option_data = []
        if(data_type == 'call'){ 
            option_data = allProducts.filter(product =>
                product.contract_type == 'call_options' && product.strike_price == border_buy_price
            );
        }else if(data_type == 'put'){ 
            option_data = allProducts.filter(product =>
                product.contract_type == 'put_options' && product.strike_price == border_sell_price-100
            );
        }else if(data_type == 'current'){
            current_running_order = 'sell'  
            option_data = allProducts.filter(product =>
                product.contract_type == 'put_options' && product.strike_price == spot_price-CANCEL_GAP
            ); 
            if(spot_price-bitcoin_current_price < 0 &&  Math.abs(bitcoin_current_price-spot_price)>20){
                additional_profit_buy_price = 100 
            } 
        }
        
        const bitcoin_option_data = {
            option_data : option_data[0],
            border_buy_price : spot_price,
            border_sell_price : spot_price-CANCEL_GAP
        } 
        return { data: bitcoin_option_data, status: true }
    } catch (error) {
        sendEmail(error.message,`ERROR IN GETTING BITCOIN INFORMATION`) 
        return { message: error.message, status: false }
    }
  }
  
  async function init() { 
    try{ 
        await cancelAllOpenOrder()
        const result = await getCurrentPriceOfBitcoin('current')
        if (!result.status) return
        
        border_buy_price = result.data.border_buy_price
        border_buy_profit_price = bitcoin_current_price + buy_sell_profit_point
        
        border_sell_price = result.data.border_sell_price
        border_sell_profit_price = border_sell_price - buy_sell_profit_point
     
        total_error_count = 0  
            
        await createOrder(result?.data?.option_data?.product_id,result?.data?.option_data?.symbol)
        updateOrderInfo(JSON.stringify({
            bitcoin_product_id:result?.data?.option_data?.product_id,
            bitcoin_product_symbol:result?.data?.option_data?.symbol,
            border_buy_profit_price,
            border_buy_price, 
            border_sell_price,
            border_sell_profit_price,
            is_update:false
        }))
    }catch(error){
        sendEmail(error.message,`ERROR IN WHEN CALL INIT FUNCTION`)
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
    is_live = (fs.statSync('./option/orderInfo.json').size != 0)?true:false
    if(is_live){
        let order_data = fs.readFileSync('./option/orderInfo.json', 'utf8')
        order_data = JSON.parse(order_data) 
        bitcoin_product_id = order_data.bitcoin_product_id 
        border_buy_profit_price = order_data.border_buy_profit_price
        border_buy_price = order_data.border_buy_price 
        border_sell_price = order_data.border_sell_price
        border_sell_profit_price = order_data.border_sell_profit_price
        is_update = order_data.is_update
    }
})();
  
async function updateOrderInfo(content){
    fs.writeFile('./option/orderInfo.json', content, (err) => {
        if (err) {
            sendEmail(JSON.stringify(error),`ERROR IN WHEN UPDATE ORDER FILE`)
        } else {
            console.log('File created and text written successfully.')
        }
    });
}
async function socketEventInfo(current_price){
    let order_data = {}
    let current_balance = await getBalance()
    is_live = (fs.statSync('./option/orderInfo.json').size != 0)?true:false
    if(is_live){
        order_data = fs.readFileSync('./option/orderInfo.json', 'utf8')
        order_data = JSON.parse(order_data) 
    }
    let current_trend = await classifyLastCandle()

    optionEmitter.emit("option_trade_info", {
        balance : current_balance,
        product_symbol : order_data.bitcoin_product_symbol,
        bitcoin_product_id : order_data.bitcoin_product_id??0,
        current_price : current_price??0,
        border_buy_profit_price : order_data.border_buy_profit_price??0,
        border_buy_price : order_data.border_buy_price??0, 
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

optionEmitter.on("option_start", () => {  
    init() 
    is_live = true 
    sendEmail('',`BOT START BUTTON PRESSED`)
})

optionEmitter.on("option_stop", async () => { 
    await cancelAllOpenOrder() 
    fs.writeFileSync('./option/orderInfo.json', '', 'utf8')
    is_live = false 
    sendEmail('',`BOT STOP BUTTON PRESSED`)
})

module.exports = { optionEmitter }