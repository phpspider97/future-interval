const axios = require('axios') 
require('dotenv').config()
const crypto = require('crypto');
const SYMBOL = 'BTCUSD'
const INTERVAL = '5m'
const fs = require('fs')
const nodemailer = require('nodemailer') 
const { EMA } = require('technicalindicators')
const { classifyLastCandle } = require('./trend.js')

const EventEmitter = require('events')
const crossEmitter = new EventEmitter()

  
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
    if(!is_live){
        return true
    }
    try{
        const now = Date.now();
        const subjectKey = subject.trim().toLowerCase();
        if (lastSentTimestamps[subjectKey] && now - lastSentTimestamps[subjectKey] < THROTTLE_INTERVAL_MS) {
            console.log(`CROSS BOT : Throttled: Email with subject "${subject}" was sent recently.`);
            return;
        }
        lastSentTimestamps[subjectKey] = now;
    
        let mailOptions = {
            from: 'phpspider97@gmail.com',
            to: 'allinonetrade0009@gmail.com',
            subject: 'CROSS BOT : ' +subject,
            html: message
        }
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                return console.log('Error:', error);
            }
            console.log('Email sent:', info.response);
        })
    }catch(error){
        console.log('EMAIL ERROR : ', error.message)
    }
}

const API_URL       =   process.env.API_URL 
const SOCKET_URL    =   process.env.API_URL_SOCKET 
const KEY           =   process.env.CROSS_WEB_KEY
const SECRET        =   process.env.CROSS_WEB_SECRET 
const USER_ID       =   process.env.CROSS_WEB_USER_ID
 
let bitcoin_current_price           =   0 
let order_type                      =   ''
let cross_over_interval
let cross_over_type                 =   ''
let total_error_count               =   0
let number_of_time_order_executed   =   0
let current_running_order           =   ''
let create_order_error              =   {}
let previous_candle_data            =   []
let is_live                         =   false

async function fetchCandles() {
    const end_time_stamp = Math.floor(Date.now() / 1000)
    const start_time_stamp = end_time_stamp - (20 * 60 * 60)

    try {
        const response = await axios.get(`${API_URL}/v2/history/candles`, {
            params : { 
                symbol : SYMBOL, 
                resolution : INTERVAL, 
                start : start_time_stamp, 
                end : end_time_stamp 
            }
        }); 
        const candles = response.data.result 
        const closePrices = candles.map(c => parseFloat(c.close));
        previous_candle_data = closePrices.reverse()
        return closePrices.reverse()

    } catch (err) {
        console.error('❌ Error fetching candles:', err.message);
        return previous_candle_data
    }
}

async function checkCrossOver(){
    const result = await getCurrentPrice() 
    bitcoin_current_price = result?.data?.close
    bitcoin_product_id = result.data.product_id 

    const closes = await fetchCandles() 
    if (closes.length < 21) {
      console.log('⚠️ Not enough data to calculate EMAs');
      return;
    }
 
    const ema9 = EMA.calculate({ period: 9, values: closes });
    const ema21 = EMA.calculate({ period: 21, values: closes });
 
    if (ema9.length >= 2 && ema21.length >= 2) {
        const currentEMA9 = ema9[ema9.length - 1];
        const previousEMA9 = ema9[ema9.length - 2];
        const currentEMA21 = ema21[ema21.length - 1];
        const previousEMA21 = ema21[ema21.length - 2];

        // if(current_running_order == 'buy' && bitcoin_current_price < currentEMA21){
        //     await cancelAllOpenOrder()
        // }
        // if(current_running_order == 'sell' && bitcoin_current_price > currentEMA21){
        //     await cancelAllOpenOrder()
        // }
        //console.log('order_type___',order_type)
        if (previousEMA9 < previousEMA21 && currentEMA9 > currentEMA21) {
            //console.log('Bullish')
            order_type = 'Buy'
            cross_over_type = 'Bullish' 
            await createOrder('buy')
        } else if (previousEMA9 > previousEMA21 && currentEMA9 < currentEMA21) {
            //console.log('Bearish');
            order_type = 'Sell'
            cross_over_type = 'Bearish'
            await createOrder('sell')
        } else { 
            //console.log('Neutral');
            order_type = 'Neutral' 
            cross_over_type = 'Neutral'
        }

        updateOrderInfo(JSON.stringify({
            bitcoin_product_id,  
            current_price : bitcoin_current_price??0,
            order_type,
            currentEMA9,
            currentEMA21,
            cross_over_type
        }))
    }
    triggerOrder(bitcoin_current_price)
}

async function getCurrentPrice() {
    try {
        const response = await axios.get(`${API_URL}/v2/tickers?contract_type=perpetual_futures`);
        const btc_ticker_data = response.data.result.find(ticker => ticker.symbol === 'BTCUSD');
        return { data: btc_ticker_data, status: true };
    } catch (error) {
        sendEmail(error.message,`ERROR IN WHEN GET CURRENT PRICE`) 
    }
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
            user_id: USER_ID
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
    }
}
 
async function createOrder(bid_type) {
    try {  
        if(bid_type == current_running_order){
            return true
        }
        if(!is_live){
            return true
        }

        await cancelAllOpenOrder()
        const timestamp = Math.floor(Date.now() / 1000);
        const bodyParams = {
            product_id: bitcoin_product_id,
            product_symbol: "BTCUSD",
            size: 1, 
            side: bid_type,   
            order_type: "market_order", 
        }
        create_order_error = bodyParams
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
            current_running_order = bid_type
            const message_template = `<br /><br /><br />
            <table border="1" cellpadding="8" cellspacing="3">
                <tr>
                    <td>Size</td>
                    <td>:</td>
                    <td>1</td> 
                </tr>
                <tr>
                    <td>Side</td>
                    <td>:</td>
                    <td>${bid_type}</td> 
                </tr>
                <tr>
                    <td>Current Price</td>
                    <td>:</td>
                    <td>${bitcoin_current_price}</td> 
                </tr>
            </table>
            `
            sendEmail(message_template,`CREATE ORDER : 1`)

            number_of_time_order_executed++
            return { data: response.data, status: true };
        }

        return { message: "Order failed", status: false };
    } catch (error) {
        sendEmail(error.message + JSON.stringify(create_order_error),`ERROR IN WHEN CREATING ORDER`) 
        total_error_count++ 
        order_in_progress = false;  
        return { message: error?.message, status: false }
    } finally {
        orderInProgress = false;
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
        //console.log('response : ',response.data)
        return response.data.result[0].balance_inr
    } catch (error) {
        sendEmail(error.message,`ERROR IN WHEN GET BALANCE`)
    }
}
 
async function init() { 
    await cancelAllOpenOrder()
    is_live = (fs.statSync('./cross/orderInfo.json').size != 0)?true:false 
    //console.log('is_live___',is_live)
    if(is_live){
        let order_data = fs.readFileSync('./cross/orderInfo.json', 'utf8')
        order_data = JSON.parse(order_data) 
        bitcoin_product_id = order_data.bitcoin_product_id
        bitcoin_current_price = order_data.current_price??0,
        currentEMA9 = order_data.currentEMA9??0,
        currentEMA21 = order_data.currentEMA21??0,
        cross_over_type = order_data.cross_over_type??''
        cross_over_interval = setInterval( async () => {
            await checkCrossOver()
        }, 2000)
    }
}
init() 

// async function scheduleCrossCheck() {
//   setTimeout(scheduleCrossCheck, 3000)
// }

async function updateOrderInfo(content){
  fs.writeFile('./cross/orderInfo.json', content, (err) => {
      if (err) {
          console.error('Error writing file:', err);
      } else {
          //console.log('File created and text written successfully.');
      }
  });
}
async function socketEventInfo(current_price){ 
    let order_data = {}
    let current_balance = await getBalance() 
    is_live = (fs.statSync('./cross/orderInfo.json').size != 0)?true:false
    if(is_live){
        order_data = fs.readFileSync('./cross/orderInfo.json', 'utf8')
        order_data = JSON.parse(order_data) 
    }
    
    let current_trend = await classifyLastCandle()

    crossEmitter.emit("cross_trade_info", {
        balance : current_balance,
        product_symbol : "BTCUSD",
        bitcoin_product_id : order_data.bitcoin_product_id??0,
        current_price : current_price??0,
        order_type : order_type??0,
        is_live : is_live,
        current_trend,
        currentEMA9 : order_data.currentEMA9??0,
        currentEMA21 : order_data.currentEMA21??0,
        cross_over_type
    })
}
async function triggerOrder(current_price) {
    try{
        socketEventInfo(current_price)
    }catch(error){ 
        sendEmail(error.message,`ERROR IN WHEN GET PRODUCT INFORMATION BY SOCKET`)
    }
}
 
crossEmitter.on("cross_start", async () => { 
    try{
        await checkCrossOver()
        setTimeout(()=>{
            init() 
        },1000)
        
    }catch(error){
        console.log('error : ', error.message)
    }
})

crossEmitter.on("cross_stop", async () => { 
    is_live = false 
    clearInterval(cross_over_interval)
    await cancelAllOpenOrder() 
    fs.writeFileSync('./cross/orderInfo.json', '', 'utf8')
})

module.exports = { crossEmitter }