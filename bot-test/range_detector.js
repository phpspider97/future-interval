require("dotenv").config();
const ccxt = require("ccxt");
const ti = require("technicalindicators");
const axios = require("axios");

// ===== CONFIG =====
const SYMBOL = "BTC/USDT";
const TIMEFRAME = "15m";
const LIMIT = 200;
const INTERVAL = 60 * 1000; // 1 min
const COOLDOWN = 5 * 60 * 1000; // 5 min

// ===== STATE =====
let lastTrend = null;
let lastBreakout = null;
let lastSignalTime = 0;


// ===== EXCHANGE =====
const exchange = new ccxt.binance({
  enableRateLimit: true,
});

// ===== TELEGRAM FUNCTION =====
async function sendTelegram(message) {
  try {
    const url = `https://api.telegram.org/bot${process.env.TELEGRAM_RANGE_DETECTOR_TOKEN}/sendMessage`;

    const res = await axios.post(url, {
      chat_id: process.env.TELEGRAM_RANGE_DETECTOR_CHAT_ID,
      text: message,
      parse_mode: "Markdown"
    });

    if (!res.data.ok) {
      console.log("❌ Telegram Error:", res.data);
    }

  } catch (err) {
    console.error("❌ Telegram API Failed:", err.response?.data || err.message);
  }
}

// ===== FETCH DATA =====
async function fetchCandles() {
  const ohlcv = await exchange.fetchOHLCV(SYMBOL, TIMEFRAME, undefined, LIMIT);

  const close = ohlcv.map(c => c[4]);
  const high = ohlcv.map(c => c[2]);
  const low = ohlcv.map(c => c[3]);
  const volume = ohlcv.map(c => c[5]);

  return { close, high, low, volume };
}

// ===== INDICATORS =====
function calculateIndicators({ close, high, low, volume }) {

  const ema9 = ti.EMA.calculate({ period: 9, values: close });
  const ema21 = ti.EMA.calculate({ period: 21, values: close });
  const ema200 = ti.EMA.calculate({ period: 200, values: close });

  const adx = ti.ADX.calculate({
    period: 14,
    close,
    high,
    low,
  });

  const atr = ti.ATR.calculate({
    period: 14,
    high,
    low,
    close,
  });

  const volumeMA = ti.SMA.calculate({
    period: 20,
    values: volume,
  });

  const bb = ti.BollingerBands.calculate({
    period: 20,
    stdDev: 2,
    values: close,
  });

  return { ema9, ema21, ema200, adx, atr, volumeMA, bb };
}

// ===== ANALYSIS =====
function analyzeMarket(data, ind) {
  const { close, volume } = data;
  const { ema9, ema21, ema200, adx, atr, volumeMA, bb } = ind;

  const lastClose = close.at(-1);
  const lastVolume = volume.at(-1);

  const lastEMA9 = ema9.at(-1);
  const lastEMA21 = ema21.at(-1);
  const lastEMA200 = ema200.at(-1);

  const lastADX = adx.at(-1)?.adx || 0;
  const lastATR = atr.at(-1) || 0;
  const lastVolMA = volumeMA.at(-1) || 0;

  const lastBB = bb.at(-1);
  const bbWidth = lastBB ? (lastBB.upper - lastBB.lower) : 0;

  const isHighVolume = lastVolume > lastVolMA;
  const isLowVolume = lastVolume < lastVolMA;

  let trend = "NO TRADE";

  if (
    lastADX > 25 &&
    lastEMA9 > lastEMA21 &&
    lastClose > lastEMA200 &&
    isHighVolume
  ) {
    trend = "STRONG UPTREND";
  }

  else if (
    lastADX > 25 &&
    lastEMA9 < lastEMA21 &&
    lastClose < lastEMA200 &&
    isHighVolume
  ) {
    trend = "STRONG DOWNTREND";
  }

  else if (
    lastADX < 20 &&
    isLowVolume &&
    bbWidth < lastClose * 0.01
  ) {
    trend = "RANGE";
  }

  else {
    trend = "WEAK / FAKE MARKET";
  }

  // ===== BREAKOUT =====
  const resistance = Math.max(...close.slice(-20));
  const support = Math.min(...close.slice(-20));

  let breakout = "NONE";

  if (lastClose > resistance) {
    breakout = isHighVolume ? "REAL BREAKOUT UP" : "FAKE BREAKOUT UP";
  }

  else if (lastClose < support) {
    breakout = isHighVolume ? "REAL BREAKOUT DOWN" : "FAKE BREAKOUT DOWN";
  }

  return {
    trend,
    breakout,
    lastClose,
    lastADX,
    lastVolume,
    lastVolMA,
    lastATR
  };
}

// ===== MAIN BOT =====
async function run() {
  try {
    const data = await fetchCandles();
    const indicators = calculateIndicators(data);
    const result = analyzeMarket(data, indicators);

    const now = Date.now();

    const isNewSignal =
      result.trend !== lastTrend ||
      result.breakout !== lastBreakout;

    const isCooldownOver =
      now - lastSignalTime > COOLDOWN;

    if (isNewSignal && isCooldownOver) {

      const msg = `
🚨 *MARKET SIGNAL*

💰 Price: ${result.lastClose}
📊 Trend: *${result.trend}*
🚀 Breakout: ${result.breakout}

📈 ADX: ${result.lastADX.toFixed(2)}
📦 Volume: ${result.lastVolume}
📊 Vol MA: ${result.lastVolMA}

⏱ *Time:* ${new Date().toLocaleTimeString()}
`;

      console.log(msg);
      await sendTelegram(msg);

      // UPDATE STATE
      lastTrend = result.trend;
      lastBreakout = result.breakout;
      lastSignalTime = now;

    } else {
      //console.log("⏸ No Change / Cooldown Active");
    }

  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

// ===== START ===== 
// runBot();
// setInterval(run, INTERVAL);
module.exports = { run };