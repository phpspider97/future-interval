const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();
const WebSocket = require('ws');
const nodemailer = require('nodemailer');
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
  }); 

let bitcoin_product_id;
//let current_lot = [1, 3, 7, 18]
let current_lot = [2, 2, 2]
let is_live = false
let is_break_time = false
let LOSS_EXCEED_LIMIT = 0

let number_of_time_order_executed = 0;
let bitcoin_current_price = 0
let additional_profit_buy_price = 0

let border_buy_price;
let border_buy_profit_price;
let order_information = {
    product_symbol:null,
    size:0
}

let border_sell_price;
let border_sell_profit_price;
    
let buy_sell_profit_point = 200 
let CANCEL_GAP = 100  
let total_error_count = 0
 
let orderInProgress = false   
let current_running_order = ''   

const api_url = process.env.API_URL 
const socket_url = process.env.API_URL_SOCKET 
const key = process.env.OPTION_WEB_KEY
const secret = process.env.OPTION_WEB_SECRET 
 
let reconnectInterval = 2000;
function wsConnect() { 
  const WEBSOCKET_URL = socket_url;
  const API_KEY = key;
  const API_SECRET = secret;
 
  function generateSignature(secret, message) {
    return crypto.createHmac('sha256', secret).update(message).digest('hex');
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
         
        if(total_error_count>5) { 
            ws.close(1000, 'Too many errors');
        } 
 
        if(message?.bracket_order == null && message?.meta_data?.pnl != undefined){
          console.log(`============= ORDER TRIGGERED ============= `)
          //current_running_order = message.side
        } 
 
        if(!is_live){
            return true
        }
        if(message.type == "v2/ticker"){ 
            if(is_break_time == true){
                return true
            }
            if(current_running_order == 'sell' && message?.spot_price<border_sell_price){ 
                current_running_order = 'buy'
                bitcoin_current_price = message?.spot_price
                number_of_time_order_executed++
                LOSS_EXCEED_LIMIT++
                await cancelAllOpenOrder('LOSS',message?.spot_price)
                const result = await getCurrentPriceOfBitcoin('call');
                if (!result.status) return;
                await createOrder(result?.data?.option_data?.product_id,result?.data?.option_data?.symbol)
            }

            if(current_running_order == 'buy' && message?.spot_price>border_buy_price){ 
                current_running_order = 'sell'
                bitcoin_current_price = message?.spot_price
                number_of_time_order_executed++
                LOSS_EXCEED_LIMIT++
                await cancelAllOpenOrder('LOSS',message?.spot_price)
                const result = await getCurrentPriceOfBitcoin('put');
                if (!result.status) return;
                await createOrder(result?.data?.option_data?.product_id,result?.data?.option_data?.symbol)
            }
              
            if (message?.spot_price > border_buy_profit_price+additional_profit_buy_price || message?.spot_price < border_sell_profit_price) {   
                is_break_time = true 
                LOSS_EXCEED_LIMIT = 0
                bitcoin_current_price = message?.spot_price 
                await cancelAllOpenOrder('PROFIT',message?.spot_price)
                await resetLoop()
            } 

            await triggerOrder(message?.spot_price)
        } 
    }
  } 
  async function onError(error) {
    await cancelAllOpenOrder('ERROR',0)
    console.error('Socket Error:', error.message);
  }
  async function resetLoop(){ 
    number_of_time_order_executed = 0
    setTimeout(async () => {
        await init()
        is_break_time = false
    }, 60000) // 1 min
  }
  async function onClose(code, reason) {
    console.log(`Socket closed with code: ${code}, reason: ${reason}`)
    
    if(code == 1000){
      console.log('cancle all order')
      await cancelAllOpenOrder('ERROR',1)

      setTimeout(() => { // connect again after 1 minute
        total_error_count = 0
        console.log('Reconnecting after long time...')
        wsConnect();
        resetLoop()
      }, 60000);

    }else{
      total_error_count = 0
      setTimeout(() => {
        console.log('Reconnecting...')
        wsConnect();
      }, reconnectInterval);
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

  // Initialize WebSocket connection
  const ws = new WebSocket(WEBSOCKET_URL);
  ws.on('open', () => {
    console.log('Socket opened');
    sendAuthentication(ws);
  });
  ws.on('message', onMessage);
  ws.on('error', onError);
  ws.on('close', onClose);
}
wsConnect();


async function generateEncryptSignature(signaturePayload) { 
  return crypto.createHmac("sha256", secret).update(signaturePayload).digest("hex");
}

async function cancelAllOpenOrder(loss_profit,current_price) {
  try {
    if(loss_profit != 'START'){
        const message_template = `<br /><br /><br />
        <table border="1" cellpadding="8" cellspacing="3">
            <tr>
                <td>Product Symbol</td>
                <td>:</td>
                <td>${order_information.product_symbol}</td> 
            </tr>
            <tr>
                <td>Size</td>
                <td>:</td>
                <td>${order_information.size}</td> 
            </tr> 
            <tr>
                <td>Current Price</td>
                <td>:</td>
                <td>${current_price}</td> 
            </tr>
            <tr>
                <td>Sell Profit Price</td>
                <td>:</td>
                <td>${border_sell_profit_price}</td> 
            </tr>
            <tr>
                <td>Buy Profit Price</td>
                <td>:</td>
                <td>${border_buy_profit_price}</td> 
            </tr>
            <tr>
                <td>Win Or Loss</td>
                <td>:</td>
                <td>${loss_profit}</td> 
            </tr>
            <tr>
                <td>Border Buy Price</td>
                <td>:</td>
                <td>${border_buy_price}</td> 
            </tr>
            <tr>
                <td>Border Sell Price</td>
                <td>:</td>
                <td>${border_sell_price}</td> 
            </tr>
            <tr>
              <td>Number Of Time Order Executed</td>
              <td>:</td>
              <td>${number_of_time_order_executed}</td> 
          </tr>
        </table>
        `
        sendEmail(message_template,`ORDER STATUS : ${loss_profit}`)
    }
    //current_running_order = ''
    const timestamp = Math.floor(Date.now() / 1000);
    const bodyParams = {
      close_all_portfolio: true,
      close_all_isolated: true,
      user_id: process.env.OPTION_WEB_USER_ID,
    }; 
    const signaturePayload = `POST${timestamp}/v2/positions/close_all${JSON.stringify(bodyParams)}`;
    const signature = await generateEncryptSignature(signaturePayload);

    const headers = {
      "api-key": key,
      "signature": signature,
      "timestamp": timestamp,
      "Content-Type": "application/json",
      "Accept": "application/json",
    }; 
    const response = await axios.post(`${api_url}/v2/positions/close_all`, bodyParams, { headers });
    return { data: response.data, status: true };
  } catch (error) {
    console.log('error.message___1_',error.response.data)
    project_error_message = JSON.stringify(error.response.data)
    botRunning = false
    return { message: error.message, status: false };
  }
}
 
function sendEmail(message,subject){
    let mailOptions = {
        from: 'phpspider97@gmail.com',
        to: 'neelbhardwaj97@gmail.com',
        subject: 'OPTION BOT : ' +subject,
        html: message
    };
    
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            return console.log('Error:', error);
        }
        console.log('Email sent:', info.response);
    });
}

async function createOrder(product_id,bitcoin_option_symbol) {
    let current_trend = await classifyLastCandle()  
    if(current_running_order == 'sell' && (current_trend == 'neutral' || current_trend == 'bull') ){
        return true
    }
    if(current_running_order == 'buy' && (current_trend == 'neutral' || current_trend == 'bear') ){
        return true
    }
    if(total_error_count>5){ 
        return true
    }
    if(LOSS_EXCEED_LIMIT>3){
        is_break_time = true
        return false
    }
     
    if (orderInProgress) return { message: "Order already in progress", status: false };
    orderInProgress = true
    if(number_of_time_order_executed>2){
      number_of_time_order_executed = 0
    }
  try { 
    const timestamp = Math.floor(Date.now() / 1000);
    const bodyParams = {
      product_id: product_id, 
      product_symbol: bitcoin_option_symbol, 
      size: current_lot[number_of_time_order_executed],
      side: 'sell', 
      order_type: "market_order"
    };
    order_information.product_symbol = bitcoin_option_symbol
    order_information.size = current_lot[number_of_time_order_executed]

    console.log('order_bodyParams___', current_lot,number_of_time_order_executed, bodyParams)
    const signaturePayload = `POST${timestamp}/v2/orders${JSON.stringify(bodyParams)}`;
    const signature = await generateEncryptSignature(signaturePayload);

    const headers = {
      "api-key": key,
      "signature": signature,
      "timestamp": timestamp,
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
    const response = await axios.post(`${api_url}/v2/orders`, bodyParams, { headers });
    if (response.data.success) { 
      const message_template = `<br /><br /><br />
      <table border="1" cellpadding="8" cellspacing="3">
          <tr>
              <td>Product Symbol</td>
              <td>:</td>
              <td>${order_information.product_symbol}</td> 
          </tr>
          <tr>
              <td>Size</td>
              <td>:</td>
              <td>${order_information.size}</td> 
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
      sendEmail(message_template,`CREATE ORDER : ${order_information.product_symbol}`)
      return { data: response.data, status: true };
    }

    return { message: "Order failed", status: false };
  } catch (error) {
    console.log('Create order time error : ',error.response?.data || error.message)
    total_error_count++
    project_error_message = JSON.stringify(error?.response?.data)
    orderInProgress = false;
    sendEmail(JSON.stringify(error.response?.data),`ERROR CREATE ORDER : ${order_information.product_symbol}`)
    
    return { message: error?.message, status: false };
  } finally {
    orderInProgress = false;
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

  return `${day}-${month}-${year}`;
}

async function getCurrentPriceOfBitcoin(data_type) {
    try {
        additional_profit_buy_price = 0 
        const expiry_date = getAdjustedDate()  
        const response = await axios.get(`${api_url}/v2/tickers/?underlying_asset_symbols=BTC&contract_types=call_options,put_options&states=live&expiry_date=15-05-2025`);
        const allProducts = response.data.result;
        
        const spot_price = Math.round(allProducts[0].spot_price / 200) * 200
        bitcoin_current_price = Math.round(allProducts[0].spot_price);
        let option_data = []
        if(data_type == 'call'){
            //current_running_order = 'buy'
            option_data = allProducts.filter(product =>
                product.contract_type == 'call_options' && product.strike_price == border_buy_price
            );
        }else if(data_type == 'put'){
            //current_running_order = 'sell'
            option_data = allProducts.filter(product =>
                product.contract_type == 'put_options' && product.strike_price == border_sell_price-100
            );
        }else if(data_type == 'current'){
            current_running_order = 'sell' 
            //console.log('allProducts___',JSON.stringify(allProducts))
            option_data = allProducts.filter(product =>
                product.contract_type == 'put_options' && product.strike_price == spot_price-200
            ); 
            if(spot_price-bitcoin_current_price < 0 &&  Math.abs(bitcoin_current_price-spot_price)>20){
                additional_profit_buy_price = 100 
            }
            //console.log('option_data___',option_data)
        }
        
        const bitcoin_option_data = {
            option_data:option_data[0],
            border_buy_price:spot_price,
            border_sell_price:spot_price-CANCEL_GAP
        } 
        return { data: bitcoin_option_data, status: true };
        } catch (error) {
        console.log('error___',error)
        return { message: error.message, status: false };
        }
  }
  
  async function init() { 
    try{
        console.log('init')
        await cancelAllOpenOrder('START',0)
        const result = await getCurrentPriceOfBitcoin('current')
        if (!result.status) return
        
        border_buy_price = result.data.border_buy_price;
        border_buy_profit_price = bitcoin_current_price + buy_sell_profit_point
        
        border_sell_price = result.data.border_sell_price;
        border_sell_profit_price = border_sell_price - CANCEL_GAP;
    
        order_exicuted_at_price = 0 
        total_error_count = 0 
        isBracketOrderExist = false
            
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
        console.log('init error : ', error)
    }
    
  }

  async function getBalance() {
    try {   
        const timestamp = Math.floor(Date.now() / 1000)
        const signaturePayload = `GET${timestamp}/v2/wallet/balances`;
        const signature = await generateEncryptSignature(signaturePayload);

        const headers = {
            "api-key": key,
            "signature": signature,
            "timestamp": timestamp,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }; 
        const response = await axios.get(`${api_url}/v2/wallet/balances`, { headers })
        return response.data.result[0].balance_inr
    } catch (err) {
        console.log('err__',err)
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
            console.error('Error writing file:', err);
        } else {
            console.log('File created and text written successfully.');
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
        console.log('error____',error)
    }
}

optionEmitter.on("option_start", () => {  
    init() 
})

optionEmitter.on("option_stop", async () => { 
    await cancelAllOpenOrder() 
    fs.writeFileSync('./option/orderInfo.json', '', 'utf8')
    is_live = false 
})

module.exports = { optionEmitter }