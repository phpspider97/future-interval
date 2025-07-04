const axios = require('axios');
const ti = require('technicalindicators');

const EMA_FAST = 9;
const EMA_SLOW = 21;
const RSI_PERIOD = 14;
const SUPER_TREND_PERIOD = 10;
const SUPER_TREND_MULTIPLIER = 3;

async function fetchAllSymbols() {
  try {
    const res = await axios.get('https://api.india.delta.exchange/v2/tickers');
    return res.data.result
      .filter(data => data.contract_type === 'perpetual_futures')
      .map(data => data.symbol + 'T');
  } catch (error) {
    console.log('❌ Error fetching symbols:', error.message);
    return [];
  }
}

async function fetchCandles(symbol) {
  const end = Math.floor(Date.now() / 1000);
  const start = end - 50 * 60 * 60;

  try {
    const response = await axios.get(`https://api.delta.exchange/v2/history/candles`, {
      params: { symbol, resolution: '15m', start, end }
    });

    return response.data.result.reverse().map(c => ({
      time: c.timestamp,
      close: parseFloat(c.close),
      high: parseFloat(c.high),
      low: parseFloat(c.low),
      volume: parseFloat(c.volume)
    }));
  } catch (err) {
    console.error(`❌ Error fetching candles for ${symbol}:`, err.message);
    return [];
  }
}

function calculateSupertrend(highs, lows, closes, period = 10, multiplier = 3) {
  const atr = ti.ATR.calculate({ high: highs, low: lows, close: closes, period });
  const supertrend = [];

  let trend = 'up';
  let finalUpperBand, finalLowerBand;

  for (let i = 0; i < atr.length; i++) {
    const idx = i + period - 1;
    const hl2 = (highs[idx] + lows[idx]) / 2;
    const upperBand = hl2 + multiplier * atr[i];
    const lowerBand = hl2 - multiplier * atr[i];

    if (i === 0) {
      finalUpperBand = upperBand;
      finalLowerBand = lowerBand;
    } else {
      finalUpperBand = closes[idx] > finalUpperBand ? Math.min(upperBand, finalUpperBand) : upperBand;
      finalLowerBand = closes[idx] < finalLowerBand ? Math.max(lowerBand, finalLowerBand) : lowerBand;
    }

    if (closes[idx] > finalUpperBand) trend = 'up';
    else if (closes[idx] < finalLowerBand) trend = 'down';

    supertrend.push({
      value: trend === 'up' ? finalLowerBand : finalUpperBand,
      trend
    });
  }

  return supertrend;
}

function calculateSignal(candles) {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);

  const ema9 = ti.EMA.calculate({ period: EMA_FAST, values: closes });
  const ema21 = ti.EMA.calculate({ period: EMA_SLOW, values: closes });
  const rsi = ti.RSI.calculate({ period: RSI_PERIOD, values: closes });
  const supertrend = calculateSupertrend(highs, lows, closes, SUPER_TREND_PERIOD, SUPER_TREND_MULTIPLIER);

  const minLen = Math.min(ema9.length, ema21.length, rsi.length, supertrend.length);
  if (minLen < 1) return 'HOLD';

  const idx = ema9.length - 1;
  const lastRSI = rsi[rsi.length - 1];
  const lastEMA9 = ema9[idx];
  const lastEMA21 = ema21[ema21.length - 1];
  const lastST = supertrend[supertrend.length - 1];

  if (lastRSI > 55 && lastEMA9 > lastEMA21 * 1.001 && lastST.trend === 'up') {
    return 'BUY';
  }

  if (lastRSI < 45 && lastEMA9 < lastEMA21 * 0.999 && lastST.trend === 'down') {
    return 'SELL';
  }

  return 'HOLD';
}

function getSwingTradeLevels(candles, signal) {
  const currentPrice = candles[candles.length - 1]?.close;
  const supports = [], resistances = [];

  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];
    if (
      c.low < candles[i - 1].low &&
      c.low < candles[i - 2].low &&
      c.low < candles[i + 1].low &&
      c.low < candles[i + 2].low
    ) supports.push(c.low);

    if (
      c.high > candles[i - 1].high &&
      c.high > candles[i - 2].high &&
      c.high > candles[i + 1].high &&
      c.high > candles[i + 2].high
    ) resistances.push(c.high);
  }

  const nearestSupport = supports
    .filter(s => s < currentPrice)
    .sort((a, b) => Math.abs(currentPrice - a) - Math.abs(currentPrice - b))[0];

  const nearestResistance = resistances
    .filter(r => r > currentPrice)
    .sort((a, b) => Math.abs(currentPrice - b) - Math.abs(currentPrice - a))[0];

  let entry = currentPrice;
  let sl = signal === 'BUY' ? nearestSupport : nearestResistance;
  let target;

  if (!entry || !sl || sl === entry) return null;

  const risk = Math.abs(entry - sl);
  if (risk === 0) return null;

  if (signal === 'BUY') {
    target = entry + 2 * risk;
  } else if (signal === 'SELL') {
    target = entry - 2 * risk;
  }

  const reward = Math.abs(target - entry);
  const rr = (reward / risk).toFixed(2);

  return {
    entry: entry.toFixed(2),
    stopLoss: sl.toFixed(2),
    target: target.toFixed(2),
    rr
  };
}

function isVolumeBreakout(candles) {
  const volumes = candles.map(c => c.volume);
  const recent = volumes[volumes.length - 1];
  const avgVol = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
  return recent >= 1.5 * avgVol;
}

async function scanSwingTrades() {
  const symbols = await fetchAllSymbols();
  const results = [];

  for (const symbol of symbols) {
    try {
      const candles = await fetchCandles(symbol);
      if (!candles || candles.length < 30) continue;

      const signal = calculateSignal(candles);
      if (signal === 'HOLD') continue;

      if (!isVolumeBreakout(candles)) continue;

      const levels = getSwingTradeLevels(candles, signal);
      if (!levels) continue;

      results.push({
        symbol: symbol.replace(/T$/, ''),
        signal,
        entry: levels.entry,
        stopLoss: levels.stopLoss,
        target: levels.target,
        rr: levels.rr
      });
    } catch (err) {
      console.error(`⚠️ ${symbol} error:`, err.message);
    }
  }

  const topResults = results.sort((a, b) => parseFloat(b.rr) - parseFloat(a.rr)).slice(0, 5);
  console.table(topResults);
}

// Run it
scanSwingTrades();