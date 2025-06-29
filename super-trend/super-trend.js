// Updated Supertrend Trading Bot Code
const axios = require('axios');
require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { ATR } = require('technicalindicators');
const EventEmitter = require('events');

const SYMBOL = 'BTCUSD';
const INTERVAL = '1h';
const superTrendEmitter = new EventEmitter();

const key = process.env.SUPER_TREND_WEB_KEY;
const secret = process.env.SUPER_TREND_WEB_SECRET;
const api_url = process.env.API_URL;

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
  const start_time_stamp = end_time_stamp - (40 * 60 * 60);
  try {
    const response = await axios.get(`${api_url}/v2/history/candles`, {
      params: {
        symbol: SYMBOL,
        resolution: INTERVAL,
        start: start_time_stamp,
        end: end_time_stamp
      }
    });
    const candles = response.data.result;
    //console.log(candles.reverse())
    return candles.reverse();
  } catch (err) {
    console.error('❌ Error fetching candles:', JSON.stringify(err.response?.data), err.message);
    return [];
  }
}

function calculateSupertrend(candles, period, multiplier) {
  const high = candles.map(c => parseFloat(c.high));
  const low = candles.map(c => parseFloat(c.low));
  const close = candles.map(c => parseFloat(c.close));
  const atr = ATR.calculate({ high, low, close, period });
  const result = [];

  let finalUpperBand = 0;
  let finalLowerBand = 0;
  let trend = 'down';

  for (let i = 0; i < atr.length; i++) {
    const idx = i + period;
    if (idx >= candles.length) break;

    const hl2 = (high[idx] + low[idx]) / 2;
    const upperBand = hl2 + multiplier * atr[i];
    const lowerBand = hl2 - multiplier * atr[i];
    const closePrice = close[idx];

    if (i > 0) {
      finalUpperBand = (upperBand < result[i - 1].finalUpperBand || closePrice > result[i - 1].finalUpperBand)
        ? upperBand : result[i - 1].finalUpperBand;
      finalLowerBand = (lowerBand > result[i - 1].finalLowerBand || closePrice < result[i - 1].finalLowerBand)
        ? lowerBand : result[i - 1].finalLowerBand;
      if (result[i - 1].trend === 'down' && closePrice > finalUpperBand) {
        trend = 'up';
      } else if (result[i - 1].trend === 'up' && closePrice < finalLowerBand) {
        trend = 'down';
      } else {
        trend = result[i - 1].trend;
      }
    } else {
      finalUpperBand = upperBand;
      finalLowerBand = lowerBand;
    }
    result.push({
      time: candles[idx].time,
      upperBand,
      lowerBand,
      finalUpperBand,
      finalLowerBand,
      trend
    });
  }
  return result;
}

function getSignal(supertrend) {
  const len = supertrend.length;
  const recentTrends = supertrend.slice(-3).map(s => s.trend);
  const upCount = recentTrends.filter(t => t === 'up').length;
  const downCount = recentTrends.filter(t => t === 'down').length;
  if (upCount >= 2) return 'buy';
  if (downCount >= 2) return 'sell';
  return 'hold';
}

async function getCurrentPriceOfBitcoin() {
  try {
    const response = await axios.get(`${api_url}/v2/tickers?contract_type=perpetual_futures`);
    const btc_ticker_data = response.data.result.find(t => t.symbol === SYMBOL);
    return { data: btc_ticker_data, status: true };
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
  let mailOptions = {
    from: process.env.USER_EMAIL,
    to: 'allinonetrade0009@gmail.com',
    subject: 'SUPER TREND BOT : ' + subject,
    html: message
  };
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) return console.log('Email error:', error);
    console.log('Email sent:', info.response);
  });
}

async function createOrder(bidType) {
  try {
    if (!is_live || orderInProgress) return true;
    orderInProgress = true;

    await cancelAllOpenOrder();
    const timestamp = Math.floor(Date.now() / 1000);
    const bodyParams = {
      product_id: bitcoin_product_id,
      product_symbol: SYMBOL,
      size: 1,
      side: bidType,
      order_type: "market_order",
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

    const response = await axios.post(`${api_url}/v2/orders`, bodyParams, { headers });
    if (response.data.success) {
      number_of_time_order_executed++;
      return { data: response.data, status: true };
    }
    return { message: "Order failed", status: false };
  } catch (error) {
    sendEmail(JSON.stringify(error.response?.data) + ' ==> ' + error.message, `ERROR CREATE ORDER`);
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
    const result = await getCurrentPriceOfBitcoin();
    bitcoin_current_price = result?.data?.close;
    bitcoin_product_id = result?.data?.product_id;
    const candles = await fetchCandles();
    if (candles.length < 21) {
      console.log('⚠️ Not enough data to calculate Supertrend');
      return;
    }
    const supertrend = calculateSupertrend(candles, 10, 3);
    const signal = getSignal(supertrend);
    //console.log('Signal:', signal);

    if (current_order_status !== signal && signal !== 'hold') {
      current_order_status = signal;
      sendEmail(`SUPER TREND CHANGED : ${signal.toUpperCase()}`, '');
      await createOrder(signal);
    }

    await updateOrderInfo(JSON.stringify({
      bitcoin_product_id,
      current_price: bitcoin_current_price ?? 0,
      signal_type: signal.toUpperCase()
    }));

    triggerOrder(bitcoin_current_price);
  } catch (error) {
    console.log('checkSuperTrend error:', error.message);
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
    super_trend_over_interval = setInterval(async () => {
      await checkSuperTrend();
    }, 60000); // every 60 seconds
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
