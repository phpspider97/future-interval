// const axios = require('axios')
// const EMA_PERIOD = 288;
// const RETEST_THRESHOLD_PERCENT = 0.1
  
// function calculateEMA(candles, period) {
//     const k = 2 / (period + 1);
//     let ema = candles.slice(0, period).reduce((sum, c) => sum + parseFloat(c.close), 0) / period;

//     for (let i = period; i < candles.length; i++) { 
//         const close = parseFloat(candles[i].close);
//         ema = close * k + ema * (1 - k);
//     }
//     return ema
// }
 
// function isRetest(close, ema, thresholdPercent) {
//     const diffPercent = Math.abs((close - ema) / ema) * 100
//     return diffPercent <= thresholdPercent
// }
 
// async function checkRetests() {
//     const end_time_stamp = Math.floor(Date.now() / 1000)
//     const start_time_stamp = end_time_stamp - (50 * 60 * 60)
//     let results = []
//     let get_all_symbol = await fetchAllSymbols()
//     for (const symbol of get_all_symbol) {
//         try {
//             const response = await axios.get(`https://api.delta.exchange/v2/history/candles`, {
//                 params : { 
//                     symbol : symbol, 
//                     resolution : '5m', 
//                     start : start_time_stamp, 
//                     end : end_time_stamp 
//                 }
//             })
//             const candles = response.data.result 
//             const ema = calculateEMA(candles, EMA_PERIOD)
//             const lastClose = parseFloat(candles[candles.length - 1]?.close); 
//             if (isRetest(lastClose, ema, RETEST_THRESHOLD_PERCENT)) {
//                 //console.log(`${symbol} is retesting 288 EMA at close ${lastClose.toFixed(2)} (EMA: ${ema.toFixed(2)})`);
//                 results.push({ SYMBOL : symbol.replace(/T$/, '') });
//             }
//         } catch (err) {
//             console.error(`Error for ${symbol}:`, err.message);
//         }
//     }
//     console.table(results)
// }
// checkRetests()

const axios = require('axios');
const ti = require('technicalindicators');
const SYMBOLS = [
  'ETHUSDT',      // Ethereum
  'SOLUSDT',      // Solana
  'MATICUSDT',    // Polygon
  'AVAXUSDT',     // Avalanche
  'ARBUSDT',      // Arbitrum
  'OPUSDT',       // Optimism
  'INJUSDT',      // Injective
  'RNDRUSDT',     // Render
  'LDOUSDT',      // Lido DAO
  'PEPEUSDT',     // Pepe (high risk/meme)
  'DOGEUSDT',     // Dogecoin
  'SHIBUSDT',     // Shiba Inu
  'DYDXUSDT',     // dYdX
  'NEARUSDT',     // NEAR Protocol
  'SUIUSDT',      // Sui
  'TIAUSDT',      // Celestia
  'LINKUSDT',     // Chainlink
  'ATOMUSDT',     // Cosmos
  'APTUSDT',      // Aptos
  'BLURUSDT'      // Blur (NFT token)
];
// --- Supertrend Custom Implementation ---
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
  
      if (closes[idx] > finalUpperBand) {
        trend = 'up';
      } else if (closes[idx] < finalLowerBand) {
        trend = 'down';
      }
  
      supertrend.push({
        value: trend === 'up' ? finalLowerBand : finalUpperBand,
        trend
      });
    }
  
    return supertrend;
}
 
//const symbols = ['ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'AVAXUSDT', 'MATICUSDT'];

async function fetchCandles(symbol) {
    const end_time_stamp = Math.floor(Date.now() / 1000)
    const start_time_stamp = end_time_stamp - (50 * 60 * 60)
    
    try {   
        const response = await axios.get(`https://api.delta.exchange/v2/history/candles`, {
            params : { 
                symbol : symbol, 
                resolution : '15m', 
                start : start_time_stamp, 
                end : end_time_stamp 
            }
        }); 
        
        const candles = response.data.result  
        //console.log(candles)
        return candles.reverse().map(c => ({
            time: c.timestamp,
            close: parseFloat(c.close),
            high: parseFloat(c.high),
            low: parseFloat(c.low)
        }));

    } catch (err) {
        console.error('❌ Error fetching candles:', err.message);
        //return previous_candle_data
    }
}

function calculateSignals(candles) {
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
  
    const ema9 = ti.EMA.calculate({ period: 9, values: closes });
    const ema21 = ti.EMA.calculate({ period: 21, values: closes });
    const rsi = ti.RSI.calculate({ period: 14, values: closes });
    const supertrend = calculateSupertrend(highs, lows, closes, 10, 3);
  
    const minLength = Math.min(ema9.length, ema21.length, rsi.length, supertrend.length);
    if (minLength < 1) return 'HOLD';
  
    const idx = ema9.length - 1;
  
    const lastRSI = rsi[rsi.length - 1];
    const lastEMA9 = ema9[idx];
    const lastEMA21 = ema21[ema21.length - 1];
    const lastST = supertrend[supertrend.length - 1];
  
    // STRONG BUY
    if (
      lastRSI > 55 &&
      lastEMA9 > lastEMA21 * 1.001 && // at least 0.1% above
      lastST.trend === 'up'
    ) {
      return 'BUY';
    }
  
    // STRONG SELL
    if (
      lastRSI < 45 &&
      lastEMA9 < lastEMA21 * 0.999 && // at least 0.1% below
      lastST.trend === 'down'
    ) {
      return 'SELL';
    }
  
    return 'HOLD';
}

function calculateSignalsOld(candles) {
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
  
    const ema5 = ti.EMA.calculate({ period: 5, values: closes });
  
    const emaIndex = ema5.length - 2; // second-last candle
    const candleIndex = candles.length - (ema5.length - emaIndex); // align with ema index
  
    if (emaIndex < 0 || candleIndex < 1) return 'SKIP';
  
    const prevCandle = candles[candleIndex];
    const prevEMA5 = ema5[emaIndex];
  
    if (prevCandle.close > prevEMA5 && prevCandle.low > prevEMA5) {
      return 'ABOVE_5EMA_NO_TOUCH';
    }
  
    return 'NO_MATCH';
  }
  
  
async function scanAltcoins() {
  const results = [];
  //const symbols = SYMBOLS
  const symbols = await fetchAllSymbols();
  //console.log(symbols)
  for (const symbol of symbols) {
    try {
      const candles = await fetchCandles(symbol);
      const signal = calculateSignals(candles);
      if (signal !== 'HOLD') {
        results.push({ symbol:symbol.replace(/T$/, ''), signal });
      }
    } catch (err) {
      console.error(`Error with ${symbol}:`, err.message);
    }
  }

  console.table(results);
}

async function fetchAllSymbols() {
    try{
        let symbol = [];
        const params = { page_size: 1800 };
        const res = await axios.get('https://api.india.delta.exchange/v2/tickers', {
            params,
            headers: { Accept: 'application/json' }
        });
        const items = res.data.result; 
        items.forEach((data)=>{
            if(data.contract_type == 'perpetual_futures'){
                symbol.push(data.symbol+'T')
            }
        }) 
        return symbol
    }catch(error){
        console.log('error : ', error.message)
    }
}

async function fetchTopGainers() {
  try {
    const res = await axios.get('https://api.india.delta.exchange/v2/tickers');
    const data = res.data.result;

    const gainers = data
      .filter(item => item.contract_type === 'perpetual_futures')
      .filter(item => parseFloat(item.mark_change_24h) >= 5)
      .map(item => ({
        symbol: item.symbol,
        close_price: parseFloat(item.close), 
        change_24h: parseFloat(item.mark_change_24h).toFixed(2) + '%'
      }))
      .sort((a, b) => parseFloat(b.mark_change_24h) - parseFloat(a.mark_change_24h))

    if (gainers.length === 0) {
      console.log('🚫 No tokens up 30%+ in the last 24 hours.');
    } else {
      console.table(gainers);
    }
  } catch (err) {
    console.error('❌ Error fetching gainers:', err.message);
  }
}
// function findSupportResistance(candles) {
//     const supports = [];
//     const resistances = [];
  
//     for (let i = 2; i < candles.length - 2; i++) {
//       let l = candles[i];
//       if (
//         l.low < candles[i - 1].low &&
//         l.low < candles[i - 2].low &&
//         l.low < candles[i + 1].low &&
//         l.low < candles[i + 2].low
//       ) {
//         supports.push(l.low);
//       }
  
//       if (
//         l.high > candles[i - 1].high &&
//         l.high > candles[i - 2].high &&
//         l.high > candles[i + 1].high &&
//         l.high > candles[i + 2].high
//       ) {
//         resistances.push(l.high);
//       }
//     }
  
//     // Remove near duplicates (within 1% of each other)
//     const uniqueSupports = [...new Set(supports.filter((s, i, arr) =>
//       arr.findIndex(x => Math.abs(x - s) / s < 0.01) === i
//     ))];
//     const uniqueResistances = [...new Set(resistances.filter((r, i, arr) =>
//       arr.findIndex(x => Math.abs(x - r) / r < 0.01) === i
//     ))];
  
//     return { uniqueSupports, uniqueResistances };
//   }
  
//   (async () => {
//     const results = [];
//     const symbols = await fetchAllSymbols();
//     //console.log(symbols)
//     for (const symbol of symbols) {
//         try {
//         const candles = await fetchCandles(symbol);
//         //console.log(candles)
//         const currentPrice = candles[candles.length - 1]?.close;
//         const { uniqueSupports, uniqueResistances } = findSupportResistance(candles);
    
//         // Find nearest levels
//         const nearestSupport = uniqueSupports
//         .filter(s => s < currentPrice)
//         .sort((a, b) => Math.abs(currentPrice - a) - Math.abs(currentPrice - b))[0];
    
//         const nearestResistance = uniqueResistances
//         .filter(r => r > currentPrice)
//         .sort((a, b) => Math.abs(currentPrice - a) - Math.abs(currentPrice - b))[0];
     
//         results.push({ symbol:symbol.replace(/T$/, ''), currentPrice,nearestSupport, nearestResistance })
        
//         } catch (err) {
//             console.error(`Error with ${symbol}:`, err.message);
//         }
//     }
//     console.table(results)
// })()
//fetchTopGainers()
scanAltcoins()