require("dotenv").config();

const ccxt = require("ccxt");
const ti = require("technicalindicators");

const exchange = new ccxt.binance({
    enableRateLimit: true,
});

const SYMBOL = "BTC/USDT";
const TIMEFRAME = "5m";

async function runBot() {

    const candles = await exchange.fetchOHLCV(
        SYMBOL,
        TIMEFRAME,
        undefined,
        100
    );

    const closes = candles.map(c => c[4]);

    const ema9 = ti.EMA.calculate({
        period: 9,
        values: closes
    });

    const ema21 = ti.EMA.calculate({
        period: 21,
        values: closes
    });

    const lastPrice = closes[closes.length - 1];

    const lastEMA9 = ema9[ema9.length - 1];
    const lastEMA21 = ema21[ema21.length - 1];

    console.log("Price:", lastPrice);
    console.log("EMA 9:", lastEMA9);
    console.log("EMA 21:", lastEMA21);

    if (lastEMA9 > lastEMA21) {
        console.log("BUY SIGNAL");
    }
    else if (lastEMA9 < lastEMA21) {
        console.log("SELL SIGNAL");
    }
    else {
        console.log("NO SIGNAL");
    }
}

setInterval(runBot, 10000);