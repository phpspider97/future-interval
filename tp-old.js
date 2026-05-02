require("dotenv").config();
const ccxt = require("ccxt");
const ti = require("technicalindicators");
const nodemailer = require('nodemailer')

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
    try{
        const now = Date.now();
        const subjectKey = subject.trim().toLowerCase();
        if (lastSentTimestamps[subjectKey] && now - lastSentTimestamps[subjectKey] < THROTTLE_INTERVAL_MS) {
            console.log(`GRID BOT : Throttled: Email with subject "${subject}" was sent recently.`);
            return;
        }
        lastSentTimestamps[subjectKey] = now;
    
        let mailOptions = {
            from: 'phpspider97@gmail.com',
            to: 'allinonetrade0009@gmail.com',
            subject: 'GRID BOT : ' +subject,
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

// ===== CONFIG =====
const SYMBOL = process.env.SYMBOL || "BTCUSDT";
const TIMEFRAME = process.env.TIMEFRAME || "5m";
const RISK = parseFloat(process.env.RISK_PER_TRADE || "0.01");
const ATR_MULTIPLIER = 1.5;
const LIMIT = 100;
const MIN_CANDLES = 60;

// ===== EXCHANGE =====
const exchange = new ccxt.delta({
    apiKey: process.env.API_KEY,
    secret: process.env.API_SECRET,
    enableRateLimit: true,
    urls: {
        api: {
            public: "https://api.india.delta.exchange",
            private: "https://api.india.delta.exchange",
            // public: "https://cdn-ind.testnet.deltaex.org",
            // private: "https://cdn-ind.testnet.deltaex.org"
        }
    }
});

// ===== STATE =====
let lastSignal = 0;
let lastTradeTime = 0;
const COOLDOWN = 50 * 60 * 1000; // 5 min

// ===== FETCH CANDLES =====
async function getCandles() {
    await exchange.loadMarkets();

    const ohlcv = await exchange.fetchOHLCV(SYMBOL, TIMEFRAME, undefined, LIMIT);
    //console.log("📊 Candles fetched:", ohlcv.length);

    if (!ohlcv || ohlcv.length < 10) return [];

    return ohlcv.map(c => ({
        time: c[0],
        open: c[1],
        high: c[2],
        low: c[3],
        close: c[4],
        volume: c[5]
    }));
}

// ===== INDICATORS =====
function getIndicators(candles) {
    if (candles.length < MIN_CANDLES) return null;

    const close = candles.map(c => c.close);
    const high = candles.map(c => c.high);
    const low = candles.map(c => c.low);
    //console.log('candle : ',close, high, low)
    const ema9 = ti.EMA.calculate({ period: 9, values: close }).at(-1);
    const ema21 = ti.EMA.calculate({ period: 21, values: close }).at(-1);
    const rsi = ti.RSI.calculate({ period: 14, values: close }).at(-1);
    const macd = ti.MACD.calculate({
        values: close, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9
    }).at(-1);
    const atr = ti.ATR.calculate({ high, low, close, period: 14 }).at(-1);
    const adx = ti.ADX.calculate({ high, low, close, period: 14 }).at(-1)?.adx || 0;
    //console.log('atr:',atr.at(-1))
    
    //if (!ema9.length || !ema21.length || !rsi.length ||!macd.length || !atr.length || !adx.length) return null;

    return { ema9, ema21, rsi, macd, atr, adx };
}

// ===== FILTERS =====
function isTrending(d) {
    return {
        trending: d.adx > 25,
        trendUp: d.adx > 25 && d.ema9 > d.ema21,
        trendDown: d.adx > 25 && d.ema9 < d.ema21
    };
}

function isTradingSession() {
    const h = new Date().getUTCHours();
    return (h >= 7 && h < 16) || (h >= 13 && h < 22);
}

function isPullbackEntry(d, c, t) {
    if (t.trendUp) return c.low <= d.ema9 && c.close > d.ema9 && c.close > c.open;
    if (t.trendDown) return c.high >= d.ema9 && c.close < d.ema9 && c.close < c.open;
    return false;
}

function isVolatile(d, candles) {
    const atrArr = ti.ATR.calculate({
        high: candles.map(c => c.high),
        low: candles.map(c => c.low),
        close: candles.map(c => c.close),
        period: 14
    });
    if (atrArr.length < 5) return false;
    const recent = atrArr.at(-1);
    const prev = atrArr.slice(-5, -1).reduce((a, b) => a + b, 0) / 4;
    return recent > prev * 1.1;
}

function momentumFilter(d, t) {
    if (t.trendUp) return d.rsi > 55;
    if (t.trendDown) return d.rsi < 45;
    return false;
}

// ===== POSITION CHECK =====
async function getOpenPosition() {
    try {
        const positions = await exchange.fetchPositions();
        return positions.find(p =>
            p.symbol === SYMBOL &&
            Math.abs(p.contracts || p.size || p.positionAmt || 0) > 0
        ) || null;
    } catch {
        return null;
    }
}

// ===== POSITION SIZE =====
function calcPosition(balance, entry, sl) {
    const riskAmt = balance * RISK;
    const dist = Math.abs(entry - sl);
    return dist === 0 ? 0 : riskAmt / dist;
}

// ===== PLACE TRADE =====
async function placeTrade(side, entry, sl, tps) {
    try {
        //const balance = (await exchange.fetchBalance()).total.USDT || 0;
        //const size = calcPosition(balance, entry, sl);
        const size = 3 
       
        await exchange.createMarketOrder(SYMBOL, side, size);

        await exchange.createLimitOrder(
            SYMBOL,
            side !== "buy" ? "sell" : "buy",
            size,
            Number(sl.toFixed(2))
        );

        const tpSize = size / tps.length;
        for (let tp of tps) {
            await exchange.createLimitOrder(
                SYMBOL,
                side === "buy" ? "sell" : "buy",
                tpSize,
                tp
            );
        }

        return true;
    } catch (err) {
        console.error("❌ Trade Error:", err.message);
        return null;
    }
}

// ===== MAIN BOT =====
async function runBot() {
    try { 
        const candles = await getCandles();
        if (candles.length < MIN_CANDLES) return; 
        const current = candles.at(-1);
        const data = getIndicators(candles);
        if (!data) return;

        const trend = isTrending(data);
        const session = isTradingSession();
        const pullback = isPullbackEntry(data, current, trend);
        const vol = isVolatile(data, candles);
        const momentum = momentumFilter(data, trend);

        //const pullback = true  
        //console.log(`Trend:${trend.trending} Session:${session} Pullback:${pullback} Vol:${vol}`);
        console.table([
            {
                Trend:trend.trending,
                Session:session,
                Pullback:pullback,
                Vol:vol
            }
        ]);
        if (!trend.trending || !session || !vol || !momentum) return;

        const position = await getOpenPosition();
        if (position) {
            console.log("⛔ Already in trade");
            return;
        }else{
            console.log(`Trend:${trend.trending} Session:${session} Pullback:${pullback} Vol:${vol}`);
        }

        if (Date.now() - lastTradeTime < COOLDOWN) {
            console.log("⏳ Cooldown active");
            return;
        }

        let signal = null;

        if (trend.trendUp && pullback && lastSignal <= 0) {
            signal = "buy";
            lastSignal = 1;
        }

        if (trend.trendDown && pullback && lastSignal >= 0) {
            signal = "sell";
            lastSignal = -1;
        }

        if (!signal) return;

        const entry = current.close;
        //console.log('data___',data)
        const risk = data.atr * ATR_MULTIPLIER;

        const sl = signal === "buy" ? entry - risk : entry + risk;

        const tps = [
            signal === "buy" ? entry + risk * 0.8 : entry - risk * 0.8,
            signal === "buy" ? entry + risk * 1.5 : entry - risk * 1.5,
            signal === "buy" ? entry + risk * 2.5 : entry - risk * 2.5
        ];

        console.log(`🚀 ${signal.toUpperCase()} SIGNAL`);
 
        console.table([
            {
                SIDE:signal,
                SIZE:3,
                ENTRY:entry,
                SL:sl.toFixed(2),
                TP1: tps[0].toFixed(2),
                TP2: tps[1].toFixed(2),
                TP3: tps[2].toFixed(2)
            }
        ]);

        const message_template = `
            <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
            <tr>
                <td><b>ORDER DATA</b></td>
                <td>:</td>
                <td>
                SIDE: ${signal}<br/>
                SIZE: 3<br/>
                ENTRY: ${entry}<br/>
                SL: ${sl?.toFixed(2)}<br/>
                TP1: ${tps?.[0]?.toFixed(2)}<br/>
                TP2: ${tps?.[1]?.toFixed(2)}<br/>
                TP3: ${tps?.[2]?.toFixed(2)}
                </td>
            </tr>
            </table>
            `;

        sendEmail(message_template, "CREATE ORDER");

        return true
        const trade = await placeTrade(signal, entry, sl, tps);

        if (trade) {
            lastTradeTime = Date.now();
            console.log("✅ Trade placed");
        }

    } catch (err) {
        console.error("❌ Bot Error:", err.message);
    }
}

// ===== LOOP =====
console.log("🤖 High Win Rate Delta Bot Running...");
setInterval(runBot, 3 * 60 * 1000);