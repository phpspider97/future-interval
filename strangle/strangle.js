const axios = require('axios')
const crypto = require('crypto')
require('dotenv').config()
const WebSocket = require('ws')
const nodemailer = require('nodemailer') 
const fs = require('fs')

const EventEmitter = require('events');
const strangleOptionEmitter = new EventEmitter();

let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.USER_EMAIL,
      pass: process.env.USER_PASSWORD
    },
})

const lastSentTimestamps = {}
const THROTTLE_INTERVAL_MS = 60 * 1000
function sendEmail(message,subject){
    console.log("STRANGLE EMAIL MESSAGE :", message)
    if(!is_live){
        return true
    }
    const now = Date.now();
    const subjectKey = subject.trim().toLowerCase();
    if (lastSentTimestamps[subjectKey] && now - lastSentTimestamps[subjectKey] < THROTTLE_INTERVAL_MS) {
        console.log(`OPTION BOT : Throttled: Email with subject "${subject}" was sent recently.`);
        return;
    }
    lastSentTimestamps[subjectKey] = now;
 
    let mailOptions = {
        from: 'phpspider97@gmail.com',
        to: 'allinonetrade0009@gmail.com',
        subject: 'OPTION BOT : ' +subject,
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
const KEY           =   process.env.STRANGLE_WEB_KEY
const SECRET        =   process.env.STRANGLE_WEB_SECRET 
const USER_ID       =   process.env.STRANGLE_WEB_USER_ID

let lot_size_array                  =   [10, 10, 10]
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
let buy_sell_profit_point           =   800 
let CANCEL_GAP                      =   400  
let total_error_count               =   0
let order_in_progress               =   false    
let reconnectInterval               =   2000
let body_param_for_testing          =   {}
var bitcoin_option_data             =   {}
let current_entry_price             =   100
let call_average_fill_price         =   0    
let put_average_fill_price          =   0    
let adjustment_price_differece      =   100  
let call_current_mark_price         =   0 
let put_current_mark_price          =   0 

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
        //subscribe(ws, 'v2/ticker', ['BTCUSD']);    
        subscribe(ws, 'v2/ticker', ['BTCUSD',`${bitcoin_option_data[0]?.option_call_data?.symbol}`,`${bitcoin_option_data[0]?.option_put_data?.symbol}`]);    
    } else {     
        if(!is_live){
            return true
        } 
        if(message.type == 'error'){
            sendEmail(message.message,`OPTION IP ADDRESS ERROR`)
            console.log("OPTION : " + message.message)
        } 
        if(total_error_count>3) { 
            is_live = false
            fs.writeFileSync('./strangle/orderInfo.json', '', 'utf8')
            ws.close(1000, 'Too many errors');
        } 
        if(message.type == "v2/ticker"){ 
            let put_option_data = {}
            let call_option_data = {} 
            let candle_current_price = 0

            adjustment_price_differece = (call_average_fill_price+put_average_fill_price)*0.4           
             
            if(message.contract_type == 'call_options'){
                let entry_price = parseFloat(bitcoin_option_data[0]?.option_call_data?.average_fill_price).toFixed(2)
                let current_mark_price = parseFloat(message.mark_price).toFixed(2) 
                let price_difference = current_mark_price-entry_price
                call_current_mark_price = current_mark_price

                let is_delete_current_call_option = ((Math.abs(call_current_mark_price-put_current_mark_price)) > adjustment_price_differece)?true:false

                if(is_delete_current_call_option && entry_price != NaN && entry_price != '' && call_current_mark_price < call_average_fill_price){
                    await cancelParticularOption(bitcoin_option_data[0]?.option_call_data)
                    await getCurrentPriceOfBitcoin('call',bitcoin_option_data[0]?.option_put_data?.mark_price)
                }
                
                call_option_data = {
                    current_mark_price:call_current_mark_price,
                    entry_price:call_average_fill_price,
                    price_difference:price_difference.toFixed(2),
                    adjustment_price_differece,
                    trigger_price_difference:Math.abs(call_current_mark_price-put_current_mark_price).toFixed(2),
                    is_delete_current_call_option
                }
                console.table({ 
                    call_option_data
                }) 
            }else if(message.contract_type == 'put_options'){
                let entry_price = parseFloat(bitcoin_option_data[0]?.option_put_data?.average_fill_price).toFixed(2)
                let current_mark_price = parseFloat(message.mark_price).toFixed(2) 
                let price_difference = current_mark_price-entry_price
                put_current_mark_price = current_mark_price

                let is_delete_current_put_option = ((Math.abs(call_current_mark_price-put_current_mark_price)) > adjustment_price_differece)?true:false
 
                if(is_delete_current_put_option && entry_price != NaN && entry_price != '' && put_current_mark_price > put_average_fill_price){
                    await cancelParticularOption(bitcoin_option_data[0]?.option_put_data)
                    await getCurrentPriceOfBitcoin('put',bitcoin_option_data[0]?.option_call_data?.mark_price)
                }
                
                put_option_data = {
                    current_mark_price:put_current_mark_price,
                    entry_price:put_average_fill_price,
                    price_difference:price_difference.toFixed(2),
                    adjustment_price_differece,
                    trigger_price_difference:Math.abs(call_current_mark_price-put_current_mark_price).toFixed(2),
                    is_delete_current_put_option
                }
                console.table({  
                    put_option_data
                })
            }else{
                candle_current_price = message?.spot_price 
                await triggerOrder(candle_current_price)  
            }
             
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

async function generateEncryptSignature(signaturePayload) { 
  return crypto.createHmac("sha256", SECRET).update(signaturePayload).digest("hex");
}


async function cancelParticularOption(option_detail) {
    try {  
        await createOrder(option_detail.product_id,option_detail.symbol,'buy')
    } catch (error) {  
        sendEmail(error.message,`ERROR IN WHEN CANCEL PARTICULAR ORDER`)
        return { message: error.message, status: false };
    }
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

async function createOrder(product_id,bitcoin_option_symbol,option_side='sell') {
    if(total_error_count>3){ 
        return true
    }
    if(bitcoin_option_symbol == '' || product_id == 0 || product_id == ''){
        console.log('Blank data : ')
        return true
    }
    if (order_in_progress){ 
        return true
    }
    order_in_progress = true
     
    try { 
        const timestamp = Math.floor(Date.now() / 1000);
        const bodyParams = {
            product_id: product_id??0, 
            product_symbol: bitcoin_option_symbol??'', 
            size: 10,
            side: option_side, 
            order_type: "market_order"
        } 
  
        body_param_for_testing = bodyParams
        console.log('bodyParams___',bodyParams)
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
            // const message_template = `<br /><br /><br />
            // <table border="1" cellpadding="8" cellspacing="3">
            //     <tr>
            //         <td>Product Symbol</td>
            //         <td>:</td>
            //         <td>${bitcoin_option_symbol}</td> 
            //     </tr>
            //     <tr>
            //         <td>Size</td>
            //         <td>:</td>
            //         <td>${lot_size_array[number_of_time_order_executed]}</td> 
            //     </tr>
            //     <tr>
            //         <td>Current Price</td>
            //         <td>:</td>
            //         <td>${bitcoin_current_price}</td> 
            //     </tr>
            //     <tr>
            //         <td>Number Of Time Order Executed</td>
            //         <td>:</td>
            //         <td>${number_of_time_order_executed}</td> 
            //     </tr>
            //     ${
            //         (additional_profit_buy_price>0)?
            //         `
            //         <tr>
            //             <td>Price Gap From Spot Price</td>
            //             <td>:</td>
            //             <td>${bitcoin_current_price-(parseInt(bitcoin_option_symbol.split('-')[2])+200)}</td> 
            //         </tr>`:``
            //     }
            // </table>
            // ` 
            // sendEmail(message_template,`CREATE ORDER : ${bitcoin_option_symbol}`)
            number_of_time_order_executed++ 
            //console.log('response.data___',response.data)
            return { data: response.data, status: true }
        }
        return { message: "Order failed", status: false };
    } catch (error) {
        console.log('error : ',error.message)
        sendEmail(error.message + ' ' + JSON.stringify(body_param_for_testing),`ERROR IN WHEN CREATING ORDER`) 
        total_error_count++ 
        order_in_progress = false; 
        return { message: error?.message, status: false };
    } finally {
        order_in_progress = false;
    }
}
 
function getAdjustedDate() { 
    const now = new Date()
    const currentHour = now.getHours()
 
    const targetDate = new Date(now)
    if (currentHour >= 17) {
        targetDate.setDate(targetDate.getDate() + 1);
    }
 
    const day = String(targetDate.getDate()).padStart(2, '0');
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const year = targetDate.getFullYear();
   
    return `${day}-${month}-${year}`;
}

async function getCurrentPriceOfBitcoin(execute,trigger_price) {
    try { 
        additional_profit_buy_price = 0 
        const expiry_date = getAdjustedDate()  
      
        const response = await axios.get(`${API_URL}/v2/tickers/?underlying_asset_symbols=BTC&contract_types=call_options,put_options&states=live&expiry_date=${expiry_date}`)
        const allProducts = response.data.result
 
        bitcoin_current_price = Math.round(allProducts[0].spot_price);
         
        let option_put_data = allProducts.filter(product =>
            product.contract_type == 'put_options' && Math.round(product.mark_price) > parseFloat(trigger_price)-50 && Math.round(product.mark_price) < parseFloat(trigger_price)+50 
            //&& Math.round(product.spot_price) <= bitcoin_current_price 
        )
        let option_call_data = allProducts.filter(product =>
            product.contract_type == 'call_options' && Math.round(product.mark_price) > parseFloat(trigger_price)-100 && Math.round(product.mark_price) < parseFloat(trigger_price)+50 
            //&& Math.round(product.spot_price) >= bitcoin_current_price
        ) 
        console.log('option_call_data___',option_put_data)
        if(option_put_data[0] == undefined || option_call_data[option_call_data.length-1] == undefined){
            return false
        }

        bitcoin_option_data = [{ 
            option_put_data  : option_put_data[0],
            option_call_data : option_call_data[option_call_data.length-1]
        }]  
        console.log('bitcoin_option_data___',bitcoin_option_data)
        if(execute == 'both'){
            const call_order =  await createOrder(bitcoin_option_data[0]?.option_call_data?.product_id,bitcoin_option_data[0]?.option_call_data?.symbol)
            call_average_fill_price = call_order.data.result.average_fill_price
            bitcoin_option_data[0].option_call_data.average_fill_price = call_average_fill_price

            const put_order =   await createOrder(bitcoin_option_data[0]?.option_put_data?.product_id,bitcoin_option_data[0]?.option_put_data?.symbol)
            put_average_fill_price = put_order.data.result.average_fill_price
            bitcoin_option_data[0].option_put_data.average_fill_price = put_average_fill_price
        }else if(execute == 'put'){ 
            const put_order =   await createOrder(bitcoin_option_data[0]?.option_put_data?.product_id,bitcoin_option_data[0]?.option_put_data?.symbol)
            put_average_fill_price = put_order.data.result.average_fill_price
            bitcoin_option_data[0].option_put_data.average_fill_price = put_average_fill_price
            bitcoin_option_data[0].option_call_data.average_fill_price = call_average_fill_price
        }else if(execute == 'call'){ 
            const call_order =  await createOrder(bitcoin_option_data[0]?.option_call_data?.product_id,bitcoin_option_data[0]?.option_call_data?.symbol)
            call_average_fill_price = call_order.data.result.average_fill_price
            bitcoin_option_data[0].option_call_data.average_fill_price = call_average_fill_price
            bitcoin_option_data[0].option_put_data.average_fill_price = put_average_fill_price
        }
        
        console.log('call_average_fill_price__',call_average_fill_price, put_average_fill_price) 
 
        return { 
            data: bitcoin_option_data, 
            call_average_fill_price,
            put_average_fill_price,
            status: true 
        }
    } catch (error) {
        console.log(error)
        sendEmail(error.message,`ERROR IN GETTING BITCOIN INFORMATION`) 
        return { message: error.message, status: false }
    }
  }
  
  async function init() { 
    try{  
        await cancelAllOpenOrder()
        const result = await getCurrentPriceOfBitcoin('both',current_entry_price)
        
        if(result.data != undefined){
            updateOrderInfo(JSON.stringify({
                bitcoin_product_id:bitcoin_option_data[0]?.option_call_data?.product_id,
                bitcoin_product_symbol:bitcoin_option_data[0]?.option_call_data?.symbol,
                option_data:JSON.stringify(result.data),
                call_average_fill_price:result.call_average_fill_price,
                put_average_fill_price:result.put_average_fill_price
            }))  
        }
        if (!result?.status) return
      
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
    is_live = (fs.statSync('./strangle/orderInfo.json').size != 0)?true:false
    if(is_live){ 
        wsConnect()
        let order_data = fs.readFileSync('./strangle/orderInfo.json', 'utf8')
        order_data              =   JSON.parse(order_data) 
        bitcoin_product_id      =   order_data.bitcoin_product_id
        call_average_fill_price =   parseFloat(order_data.call_average_fill_price)
        put_average_fill_price  =   parseFloat(order_data.put_average_fill_price)
        bitcoin_option_data     =   JSON.parse(order_data?.option_data)
    }
})();
  
async function updateOrderInfo(content){
    fs.writeFile('./strangle/orderInfo.json', content, (error) => {
        if (error) {
            sendEmail(JSON.stringify(error),`ERROR IN WHEN UPDATE ORDER FILE`)
        } else {
            console.log('File created and text written successfully.')
        }
    });
}
async function socketEventInfo(current_price){
    let order_data = {}
    let current_balance = await getBalance()
    is_live = (fs.statSync('./strangle/orderInfo.json').size != 0)?true:false
    if(is_live){
        order_data = fs.readFileSync('./strangle/orderInfo.json', 'utf8')
        order_data = JSON.parse(order_data) 
    }
    let current_trend = 'Neutral'
    
    strangleOptionEmitter.emit("strangle_trade_info", {
        balance : current_balance,
        product_symbol : order_data.bitcoin_product_symbol,
        bitcoin_product_id : order_data.bitcoin_product_id??0,
        current_price : current_price??0, 
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

strangleOptionEmitter.on("strangle_start", () => {  
    console.log('enter')
    init() 
    is_live = true  
    wsConnect()
    sendEmail('',`BOT START BUTTON PRESSED`)
})

strangleOptionEmitter.on("strangle_stop", async () => { 
    await cancelAllOpenOrder() 
    fs.writeFileSync('./strangle/orderInfo.json', '', 'utf8')
    is_live = false 
    sendEmail('',`BOT STOP BUTTON PRESSED`)
})

module.exports = { strangleOptionEmitter }