require("dotenv").config();
const axios = require("axios");
const crypto = require("crypto");
const cron = require("node-cron");

const BASE_URL = process.env.API_URL;

const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_RANGE_DETECTOR_TOKEN;
const TELEGRAM_CHAT_ID =
  process.env.TELEGRAM_RANGE_DETECTOR_CHAT_ID;

// =====================================
// DELTA ACCOUNTS
// =====================================
const ACCOUNTS = [
  {
    name: "Main",
    apiKey: process.env.API_KEY,
    apiSecret: process.env.API_SECRET,
  },
  {
    name: "All in one",
    apiKey: process.env.SUPER_TREND_WEB_KEY,
    apiSecret: process.env.SUPER_TREND_WEB_SECRET,
  },
  {
    name: "Eth sell",
    apiKey: process.env.ETH_SELL_WEB_KEY,
    apiSecret: process.env.ETH_SELL_WEB_SECRET,
  },
  {
    name: "Grid",
    apiKey: process.env.GRID_WEB_KEY,
    apiSecret: process.env.GRID_WEB_SECRET,
  },
];

// =====================================
// SIGNATURE
// =====================================
function generateSignature(
  secret,
  method,
  timestamp,
  path,
  body = ""
) {
  const message = method + timestamp + path + body;

  return crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");
}

// =====================================
// GET ACCOUNT BALANCE
// =====================================
async function getBalance(account) {
  try {
    const method = "GET";
    const path = "/v2/wallet/balances";
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const signature = generateSignature(
      account.apiSecret,
      method,
      timestamp,
      path
    );

    const response = await axios.get(
      `${BASE_URL}${path}`,
      {
        headers: {
          "api-key": account.apiKey,
          timestamp,
          signature,
        },
      }
    );

    const balances = response.data.result;

    let usdBalance = 0;

    balances.forEach((asset) => {
      if (asset.asset_symbol === "USD") {
        usdBalance = Number(asset.balance);
      }
    });

    return {
      name: account.name,
      balance: usdBalance,
    };
  } catch (error) {
    return {
      name: account.name,
      balance: 0,
      error:
        error.response?.data?.error ||
        error.message ||
        "Unknown Error",
    };
  }
}

// =====================================
// TELEGRAM
// =====================================
async function sendTelegram(message) {
  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
      }
    );
  } catch (error) {
    console.error(
      "Telegram Error:",
      error.response?.data || error.message
    );
  }
}

// =====================================
// BALANCE CHECKER
// =====================================
async function run() {
  try {
    const results = await Promise.all(
      ACCOUNTS.map(getBalance)
    );

    let totalUsd = 0;

    const tableData = [];

    const currentTime = new Date().toLocaleString(
      "en-IN",
      {
        timeZone: "Asia/Kolkata",
      }
    );

    let telegramMessage = `
<b>📊 DELTA EXCHANGE BALANCE REPORT</b>

🕒 <b>${currentTime}</b>

━━━━━━━━━━━━━━━━━━━━
`;

    for (const acc of results) {
      if (acc.error) {
        telegramMessage += `
❌ <b>${acc.name}</b>
<code>${acc.error}</code>

`;

        tableData.push({
          Account: acc.name,
          USD: "ERROR",
          INR: "ERROR",
        });

        continue;
      }

      const inr = acc.balance * 85;

      totalUsd += acc.balance;

      tableData.push({
        Account: acc.name,
        USD: acc.balance.toFixed(2),
        INR: inr.toFixed(2),
      });

      telegramMessage += `
🏦 <b>${acc.name}</b>

💵 USD: <b>${acc.balance.toFixed(2)}</b>
🇮🇳 INR: <b>₹${inr.toFixed(2)}</b>

`;
    }

    const totalInr = totalUsd * 85;

    telegramMessage += `
━━━━━━━━━━━━━━━━━━━━

💰 <b>TOTAL BALANCE</b>

💵 USD: <b>${totalUsd.toFixed(2)}</b>
🇮🇳 INR: <b>₹${totalInr.toFixed(2)}</b>

━━━━━━━━━━━━━━━━━━━━
🤖 <i>Delta Exchange Balance Monitor</i>
`;

    // console.table(tableData);

    // console.log(
    //   `TOTAL BALANCE: ${totalUsd.toFixed(
    //     2
    //   )} USD | ₹${totalInr.toFixed(2)}`
    // );

    await sendTelegram(telegramMessage);
  } catch (error) {
    console.error(
      "Balance Check Error:",
      error.message
    );
  }
}

// =====================================
// STARTUP RUN
// =====================================
//run();
module.exports = { run };