const axios = require('axios') 
require('dotenv').config()
const crypto = require('crypto');
const SYMBOL = 'BTCUSD'
const INTERVAL = '5m'
const fs = require('fs')
const nodemailer = require('nodemailer') 
const { ATR } = require('technicalindicators')
const { classifyLastCandle } = require('./trend.js')

const EventEmitter = require('events')
const superTrendEmitter = new EventEmitter()

  
const key = process.env.SUPER_TREND_WEB_KEY
const secret = process.env.SUPER_TREND_WEB_SECRET 
const api_url = process.env.API_URL 

let bitcoin_current_price = 0 
let order_type = ''
let super_trend_over_interval
let signal_type = ''
let total_error_count = 0
let number_of_time_order_executed = 0
let current_order_status = ''

let transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.USER_EMAIL,
    pass: process.env.USER_PASSWORD
  },
}); 

async function fetchCandles() {
    const end_time_stamp = Math.floor(Date.now() / 1000)
    const start_time_stamp = end_time_stamp - (2 * 60 * 60)

    try {
        const response = await axios.get(`${api_url}/v2/history/candles`, {
            params : { 
                symbol : SYMBOL, 
                resolution : INTERVAL, 
                start : start_time_stamp, 
                end : end_time_stamp 
            }
        }); 
        const candles = response.data.result  
        return candles.reverse()

    } catch (err) {
        console.error('❌ Error fetching candles:', err.message);
        return [];
    }
}

function calculateSupertrend(candles, period, multiplier) {
    const high = candles.map(c => parseFloat(c.high));
    const low = candles.map(c => parseFloat(c.low));
    const close = candles.map(c => parseFloat(c.close));
    const atr = ATR.calculate({ high, low, close, period });
  
    const result = [];
    for (let i = 0; i < atr.length; i++) {
      const idx = i + period;
      const hl2 = (high[idx] + low[idx]) / 2;
      const upperBand = hl2 + multiplier * atr[i];
      const lowerBand = hl2 - multiplier * atr[i];
      const closePrice = close[idx];
  
      let trend = 'none';
      if (i > 0 && result[i - 1]) {
        const prevTrend = result[i - 1].trend;
        trend = (closePrice > result[i - 1].upperBand) ? 'up'
              : (closePrice < result[i - 1].lowerBand) ? 'down'
              : prevTrend;
      } else {
        trend = 'down';
      }
  
      result.push({
        time: candles[idx].time,
        upperBand,
        lowerBand,
        trend
      });
    }
    //console.log(result)
    return result;
}
function getSignal(supertrend) {
    const latest = supertrend[supertrend.length - 1];
    return latest.trend === 'up' ? 'buy' : 'sell';
}
async function checkSuperTrend(){
    try{
        const result = await getCurrentPriceOfBitcoin() 
        bitcoin_current_price = result?.data?.close
        bitcoin_product_id = result.data.product_id 
        const candles = await fetchCandles() 
        // if (candles.length < 21) {
        //     console.log('⚠️ Not enough data to calculate EMAs');
        //     return;
        // } 
        const supertrend = calculateSupertrend(candles, 10, 3);
        const signal = getSignal(supertrend);
        //console.log(`[${new Date().toISOString()}] Signal: ${signal}`)
        current_order_status = signal

        if(current_order_status != signal){
            await createOrder(signal)
        }
            
        updateOrderInfo(JSON.stringify({
            bitcoin_product_id,  
            current_price : bitcoin_current_price??0,
            signal_type : signal.toUpperCase()
        }))

        triggerOrder(bitcoin_current_price)
    }catch(error){
        console.log('error : ', error)
    }
}

async function getCurrentPriceOfBitcoin() {
  try {
    const response = await axios.get(`${api_url}/v2/tickers?contract_type=perpetual_futures`);
    const btc_ticker_data = response.data.result.find(ticker => ticker.symbol === 'BTCUSD');
    return { data: btc_ticker_data, status: true };
  } catch (error) {
    return { message: error.message, status: false };
  }
}

async function generateEncryptSignature(signaturePayload) { 
  return crypto.createHmac("sha256", secret).update(signaturePayload).digest("hex");
}

async function cancelAllOpenOrder() {
  try {
    current_running_order = ''
    const timestamp = Math.floor(Date.now() / 1000)
    const bodyParams = {
      close_all_portfolio: true,
      close_all_isolated: true,
      user_id: process.env.SUPER_TREND_WEB_USER_ID,
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
    project_error_message = JSON.stringify(error?.response?.data || error?.message)
    return { message: error.message, status: false };
  }
}

function sendEmail(message,subject){
    let mailOptions = {
        from: 'phpspider97@gmail.com',
        to: 'neelbhardwaj97@gmail.com',
        subject: 'SUPER TREND BOT : ' + subject,
        html: message
    };
    
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            return console.log('Error:', error);
        }
        console.log('Email sent:', info.response);
    });
}

async function createOrder(bidType) {
  try {
    if(!is_live){
      return true
    } 
    const timestamp = Math.floor(Date.now() / 1000);
    const bodyParams = {
      product_id: bitcoin_product_id,
      product_symbol: "BTCUSD",
      size: 1, 
      side: bidType,   
      order_type: "market_order", 
    }
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
              <td>Size</td>
              <td>:</td>
              <td>1</td> 
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
      </table>
      `
      sendEmail(message_template,`CREATE ORDER : 1`)

      number_of_time_order_executed++
      return { data: response.data, status: true };
    }

    return { message: "Order failed", status: false };
  } catch (error) {
    sendEmail(JSON.stringify(error.response?.data) +'==>'+ JSON.stringify(error.message),`ERROR CREATE ORDER`)
    console.log('error.message___2_',JSON.stringify(error?.message))
    total_error_count++
    project_error_message = JSON.stringify(error?.response?.data)
    orderInProgress = false;  
    return { message: error?.message, status: false };
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
          "api-key": key,
          "signature": signature,
          "timestamp": timestamp,
          "Content-Type": "application/json",
          "Accept": "application/json",
      }; 
      const response = await axios.get(`${api_url}/v2/wallet/balances`, { headers })
      //console.log('balance_response : ',response.data)
      return response.data.result[0].balance_inr
  } catch (err) {
      console.log('err__',err)
  }
}
 
function init() { 
  is_live = (fs.statSync('./super-trend/orderInfo.json').size != 0)?true:false 
  //console.log('is_live___',is_live)
  if(is_live){
      let order_data = fs.readFileSync('./super-trend/orderInfo.json', 'utf8')
      order_data = JSON.parse(order_data) 
      bitcoin_product_id = order_data.bitcoin_product_id
      bitcoin_current_price = order_data.current_price??0, 
      signal_type = order_data.signal_type??''
      super_trend_over_interval = setInterval( async () => { 
        await checkSuperTrend()
      }, 5000)
  }
}
init() 
  
async function updateOrderInfo(content){
  fs.writeFile('./super-trend/orderInfo.json', content, (err) => {
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
  is_live = (fs.statSync('./super-trend/orderInfo.json').size != 0)?true:false
  if(is_live){
      order_data = fs.readFileSync('./super-trend/orderInfo.json', 'utf8')
      order_data = JSON.parse(order_data) 
  }
  
  let current_trend = await classifyLastCandle()

  superTrendEmitter.emit("super_trend_trade_info", {
      balance : current_balance,
      product_symbol : "BTCUSD",
      bitcoin_product_id : order_data.bitcoin_product_id??0,
      signal_type : order_data.signal_type??0,
      current_price : current_price??0,
      order_type : order_type??0,
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
 
superTrendEmitter.on("super_trend_start", async () => { 
  try{
    //console.log('checkSuperTrend')
    await checkSuperTrend()
    setTimeout(()=>{
        init() 
    },1000)
    
  }catch(error){
    console.log('error : ', error.message)
  }
})

superTrendEmitter.on("super_trend_stop", async () => { 
  is_live = false 
  clearInterval(super_trend_over_interval)
  await cancelAllOpenOrder() 
  fs.writeFileSync('./super-trend/orderInfo.json', '', 'utf8')
})

module.exports = { superTrendEmitter }