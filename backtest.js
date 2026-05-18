require("dotenv").config();

const ccxt = require("ccxt");

const API_KEY     =   process.env.GRID_WEB_KEY
const API_SECRET  =   process.env.GRID_WEB_SECRET

const exchange = new ccxt.delta({
    apiKey: API_KEY,
    secret: API_SECRET,
    enableRateLimit: true,
    urls: {
        api: {
            public: "https://api.india.delta.exchange",
            private: "https://api.india.delta.exchange",
        }
    }
});

const symbols = [
    "BTCUSD",
    "ETHUSD",
    "PAXGUSD",
    "SLVONUSD",
];

async function getDiscountData(symbol) {

    const candles = await exchange.fetchOHLCV(symbol, '15m', undefined, 100);

    const highs = candles.map(c => c[2]);
    const lows = candles.map(c => c[3]);

    const recentHigh = Math.max(...highs);
    const recentLow = Math.min(...lows);

    const equilibrium =
        recentLow + ((recentHigh - recentLow) * 0.5);

    const ticker = await exchange.fetchTicker(symbol);
    const price = ticker.last;
    
    let discount_buffer = 0
    if(symbol == 'BTCUSD'){
        discount_buffer = 200
    }else if(symbol == 'ETHUSD'){
        discount_buffer = 20
    }else if(symbol == 'PAXGUSD'){
        discount_buffer = 10
    }else if(symbol == 'SLVONUSD'){
        discount_buffer = 1
    }

    const inDiscount = Math.round(price) <= Math.round(recentLow+discount_buffer);

    return {
        Symbol: symbol,
        Price: Math.round(price),
        High: Math.round(recentHigh),
        Equilibrium: Math.round(equilibrium),
        Low: Math.round(recentLow),
        DiscountBuffer: Math.round(recentLow+discount_buffer),
        Discount: inDiscount,
        Time: new Date().toLocaleString("en-IN", {timeZone: "Asia/Kolkata"})
    };
}

async function main() {

    try {

        const tableData = [];

        for (const symbol of symbols) {

            const data = await getDiscountData(symbol);

            tableData.push(data);
        }

        console.clear();

        console.table(tableData);

    } catch (err) {

        console.log("ERROR:", err.message);
    }
}
main()
setInterval(main, 1 * 60 * 1000)