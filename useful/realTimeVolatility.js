const WebSocket = require('ws');

// Store historical prices
const history = {
  mark_price: [],
  spot_price: [],
  close: []
};

const MAX_LENGTH = 30; // Number of samples to keep (e.g., 30 seconds)

// Calculate standard deviation
function getStdDev(data) {
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
  return Math.sqrt(variance);
}

// Connect to WebSocket
const ws = new WebSocket('wss://socket-ind.testnet.deltaex.org');

ws.on('open', () => {
  console.log('WebSocket connected');

  // Subscribe to ticker stream for BTCUSD perpetual
  const payload = {
    type: 'subscribe',
    payload: {
      channels: [{ name: 'v2/ticker', symbols: ['BTCUSD'] }]
    }
  };
  ws.send(JSON.stringify(payload));
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data);
    if (msg.type === 'v2/ticker') {
      const ticker = msg;
        //console.log(msg)
      const markPrice = parseFloat(ticker.mark_price);
      const spotPrice = parseFloat(ticker.spot_price);
      const close = parseFloat(ticker.close);

      // Update histories
      updateHistory('mark_price', markPrice);
      updateHistory('spot_price', spotPrice);
      updateHistory('close', close);

      // Only show if enough data points
      if (history.mark_price.length === MAX_LENGTH) {
        const markVol = getStdDev(history.mark_price);
        const spotVol = getStdDev(history.spot_price);
        const closeVol = getStdDev(history.close);

        console.clear();
        console.log('Real-time Volatility (Rolling StdDev over', MAX_LENGTH, 'samples):');
        console.log(`Mark Price Volatility: ${markVol.toFixed(4)}`);
        console.log(`Spot Price Volatility: ${spotVol.toFixed(4)}`);
        console.log(`Close (Last Traded) Volatility: ${closeVol.toFixed(4)}`);
      }
    }
  } catch (err) {
    console.error('Error parsing message:', err.message);
  }
});

function updateHistory(key, value) {
  const arr = history[key];
  arr.push(value);
  if (arr.length > MAX_LENGTH) arr.shift(); // Keep history length fixed
}