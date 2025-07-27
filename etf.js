const axios = require("axios");
const tough = require("tough-cookie");
const { wrapper } = require("axios-cookiejar-support");

const jar = new tough.CookieJar();
const client = wrapper(axios.create({ jar }));

// ETF symbols (expand as needed)
const etfSymbols = [
  "NIFTYBEES",
  "BANKBEES",
  "CPSEETF",
  "GOLDBEES",
  "ICICINIFTY",
  "SETFNIF50",
  "KOTAKNIFTY",
  "MOFNIFTY",
  "ICICILOVOL",
  "UTINEXT50"
];

async function setupNSESession() {
  // Step 1: Get cookies by loading NSE homepage
  await client.get("https://www.nseindia.com", {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });
}

async function fetchETF(symbol) {
  try {
    const url = `https://www.nseindia.com/api/quote-equity?symbol=${symbol}`;
    const res = await client.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
        "Referer": `https://www.nseindia.com/get-quotes/equity?symbol=${symbol}`
      }
    });

    const info = res.data;
    return {
      symbol: info.info.symbol,
      lastPrice: info.priceInfo.lastPrice,
      change: info.priceInfo.change,
      percentChange: info.priceInfo.pChange,
      volume: info.marketDeptOrderBook.totalTradedVolume
    };
  } catch (err) {
    return { symbol, error: "Failed to fetch" };
  }
}

async function main() {
  await setupNSESession();

  const results = [];
  for (let i = 0; i < etfSymbols.length; i++) {
    const symbol = etfSymbols[i];
    const data = await fetchETF(symbol);
    results.push(data);
  }

  console.table(results);
}

main();
