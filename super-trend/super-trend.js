const axios = require('axios');
require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { ATR, EMA, RSI } = require('technicalindicators');
const EventEmitter = require('events');
  
const SYMBOL = 'BTCUSD';
const INTERVAL = '15m';
const superTrendEmitter = new EventEmitter();

const key = process.env.SUPER_TREND_WEB_KEY;
const secret = process.env.SUPER_TREND_WEB_SECRET;
const api_url = process.env.API_URL;
const ORDER_SIZE = parseFloat(process.env.ORDER_SIZE || 1);

//console.log(key,' === ',secret)

let bitcoin_current_price = 0;
let bitcoin_product_id = null;
let signal_type = '';
let current_order_status = '';
let total_error_count = 0;
let number_of_time_order_executed = 0;
let project_error_message = '';
let orderInProgress = false;
let is_live = false;
let super_trend_over_interval;

let transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.USER_EMAIL,
    pass: process.env.USER_PASSWORD
  },
});

async function fetchCandles() {
  const end_time_stamp = Math.floor(Date.now() / 1000);
  const start_time_stamp = end_time_stamp - (30 * 60 * 60);
  try {
    const response = await axios.get(`${api_url}/v2/history/candles`, {
      params: { symbol: SYMBOL, resolution: INTERVAL, start: start_time_stamp, end: end_time_stamp }
    });
    return response.data.result.reverse();
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
  for (let i = 0; i < atr.length && (i + period) < candles.length; i++) {
    const idx = i + period;
    const hl2 = (high[idx] + low[idx]) / 2;
    const upperBand = hl2 + multiplier * atr[i];
    const lowerBand = hl2 - multiplier * atr[i];
    const closePrice = close[idx];

    let trend = 'down';
    if (i > 0 && result[i - 1]) {
      const prev = result[i - 1];
      trend = (closePrice > prev.upperBand) ? 'up' :
              (closePrice < prev.lowerBand) ? 'down' :
              prev.trend;
    }

    result.push({
      time: candles[idx].time,
      upperBand,
      lowerBand,
      trend
    });
  }
  return result;
}

function calculateIndicators(candles) {
  const close = candles.map(c => parseFloat(c.close));
  const ema9 = EMA.calculate({ period: 9, values: close });
  const ema21 = EMA.calculate({ period: 21, values: close });
  const rsi14 = RSI.calculate({ period: 14, values: close });

  return {
    ema9: ema9.at(-1),
    ema21: ema21.at(-1),
    rsi: rsi14.at(-1)
  };
}

function getSignal(supertrend) {
  return supertrend.at(-1)?.trend === 'up' ? 'BUY' : 'SELL';
}

async function getCurrentPriceOfBitcoin() {
  try {
    const response = await axios.get(`${api_url}/v2/tickers?contract_type=perpetual_futures`);
    const data = response.data.result.find(t => t.symbol === SYMBOL);
    return { data, status: true };
  } catch (error) {
    return { message: error.message, status: false };
  }
}

async function generateEncryptSignature(payload) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

async function cancelAllOpenOrder() {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
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
    project_error_message = JSON.stringify(error?.response?.data || error.message);
    return { message: error.message, status: false };
  }
}

function sendEmail(message, subject) {
  const options = {
    from: process.env.USER_EMAIL,
    to: 'allinonetrade0009@gmail.com',
    subject: 'SUPER TREND BOT : ' + subject,
    html: `<pre>${message}</pre>`
  };
  transporter.sendMail(options, (err, info) => {
    if (err) return console.log('Email error:', err);
    console.log('📧 Email sent:', info.response);
  });
}

async function createOrder(bidType) {
    if (!is_live || orderInProgress) return true;
    orderInProgress = true;
    sendEmail(`CREATE ORDER ${bidType}`);
    console.log('bidType : ',bidType)
    return true
    try {
      await cancelAllOpenOrder();
      const timestamp = Math.floor(Date.now() / 1000);
      const trail_amount = (bidType == 'buy')?'-300':'300'
      const bodyParams = {
        product_id: bitcoin_product_id,
        product_symbol: SYMBOL,
        size: ORDER_SIZE,
        side: bidType,
        order_type: "market_order",
        //trail_amount:trail_amount,
        //bracket_trail_amount:trail_amount
      };
      const signaturePayload = `POST${timestamp}/v2/orders${JSON.stringify(bodyParams)}`;
      const signature = await generateEncryptSignature(signaturePayload);
      const headers = {
        "api-key": key,
        "signature": signature,
        "timestamp": timestamp,
        "Content-Type": "application/json",
        "Accept": "application/json",
      };

      const res = await axios.post(`${api_url}/v2/orders`, bodyParams, { headers });
      if (res.data.success) {
        number_of_time_order_executed++;
        return { data: res.data, status: true };
      }
      //console.log(res.data)
      return { message: "Order failed", status: false };
    } catch (error) {
      console.log("Error : ",error.response?.data)
      //sendEmail(JSON.stringify(error.response?.data) + ' ==> ' + error.message, `ERROR CREATE ORDER`);
      total_error_count++;
      return { message: error.message, status: false };
    } finally {
      orderInProgress = false;
    }
}

async function updateOrderInfo(content) {
  await fs.promises.writeFile('./super-trend/orderInfo.json', content);
}

async function checkSuperTrend() {
  try {
    const res = await getCurrentPriceOfBitcoin();
    bitcoin_current_price = res?.data?.close;
    bitcoin_product_id = res?.data?.product_id;

    const candles = await fetchCandles();
    if (candles.length < 21) return console.log('⚠️ Not enough data');

    const supertrend = calculateSupertrend(candles, 10, 3);
    let signal = getSignal(supertrend);
    const { ema9, ema21, rsi } = calculateIndicators(candles);

    if ([ema9, ema21, rsi].some(x => x == null || isNaN(x))) return;

    const emaSignal = ema9 > ema21 ? 'BUY' : 'SELL';
    const rsiSignal = rsi > 50 ? 'BUY' : 'SELL';
    let super_trend_signal = signal
    signal = emaSignal
    //console.log('SUPER TREND:',super_trend_signal, '| EMA:', emaSignal, '| RSI:', rsiSignal);
 
    if (current_order_status !== signal && signal === emaSignal && signal === rsiSignal) {
      current_order_status = signal;
      signal_type = signal;
      sendEmail(`SUPER TREND CHANGED : ${signal}`, 'Signal Match');
      //signal = 'buy'
      await createOrder(signal.toLowerCase());
    }

    await updateOrderInfo(JSON.stringify({
      bitcoin_product_id,
      current_price: bitcoin_current_price ?? 0,
      signal_type: signal.toUpperCase()
    }));

    triggerOrder(bitcoin_current_price);
  } catch (err) {
    console.log('❌ checkSuperTrend error:', err.message);
  }
}

function triggerOrder(current_price) {
  superTrendEmitter.emit("super_trend_trade_info", {
    balance: 100000,
    product_symbol: SYMBOL,
    bitcoin_product_id,
    signal_type,
    current_price,
    order_type: signal_type,
    is_live,
    current_trend: 'Neutral'
  });
}

function init() {
  if (fs.existsSync('./super-trend/orderInfo.json') && fs.statSync('./super-trend/orderInfo.json').size !== 0) {
    is_live = true;
    const data = JSON.parse(fs.readFileSync('./super-trend/orderInfo.json', 'utf8'));
    bitcoin_product_id = data.bitcoin_product_id;
    bitcoin_current_price = data.current_price ?? 0;
    signal_type = data.signal_type ?? '';
    super_trend_over_interval = setInterval(checkSuperTrend, 30000);
  }
}

superTrendEmitter.on("super_trend_start", async () => {
  is_live = true;
  await checkSuperTrend();
  setTimeout(() => init(), 1000);
});

superTrendEmitter.on("super_trend_stop", async () => {
  is_live = false;
  clearInterval(super_trend_over_interval);
  await cancelAllOpenOrder();
  fs.writeFileSync('./super-trend/orderInfo.json', '', 'utf8');
});

module.exports = { superTrendEmitter };

init();
