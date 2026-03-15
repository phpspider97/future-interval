import axios from "axios";
import chalk from "chalk";
import { Table } from "console-table-printer";

const DAYS = 100;
const BASE_URL = "https://api.india.delta.exchange/v2/history/candles";
//const SYMBOL = "ETHUSD";
const SYMBOL = "BTCUSD";
const RESOLUTION = "5m";
let above = 0
async function getDailyMoves() {
  const today = new Date();
  const table = new Table({
    title: `BTCUSD Movement (11PM - 10AM IST)`,
    columns: [
      { name: "date", title: "Date", alignment: "left" },
      { name: "open", title: "Open" },
      { name: "close", title: "Close" },
      { name: "move", title: "Move (Pts)" },
      { name: "movePct", title: "Move (%)" },
    ],
  });

  for (let i = DAYS; i > 0; i--) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);

    // 11PM IST = 17:30 UTC
    const startUTC = new Date(Date.UTC(
      day.getUTCFullYear(),
      day.getUTCMonth(),
      day.getUTCDate(),
      12, 30, 0
    ));

    // 9AM IST next day = 03:30 UTC
    const endUTC = new Date(Date.UTC(
      day.getUTCFullYear(),
      day.getUTCMonth(),
      day.getUTCDate() + 1,
      11, 30, 0
    ));

    const start = Math.floor(startUTC.getTime() / 1000);
    const end = Math.floor(endUTC.getTime() / 1000);
    // console.log(start)
    // console.log(end)
    // break
    try {
      const resp = await axios.get(BASE_URL, {
        params: { symbol: SYMBOL, resolution: RESOLUTION, start, end },
      });

      const candles = resp.data.result;
      if (!candles || candles.length === 0) continue;

      const first = candles[0];
      const last = candles[candles.length - 1];
      const move = last.close - first.open;
      const movePct = ((move / first.open) * 100).toFixed(2);

      let color = chalk.white;
      if (Math.abs(move) > 2000) {
        above++
        color = move > 0 ? chalk.red : chalk.red;
      } 

      table.addRow({
        date: color(day.toDateString()),
        open: color(first.open.toFixed(2)),
        close: color(last.close.toFixed(2)),
        move: color(move.toFixed(2)),
        movePct: color(`${movePct}%`),
      });
    } catch (err) {
      console.error(`Error on ${day.toDateString()}: ${err.message}`);
    }
  }
  console.log('above_count :',above)
  table.printTable();
}

getDailyMoves();

// let lot= 0; let sum = 0; let lot_main = 50; let added_lot = 5; let count = 0; let count_new = 1; let particular_loss = 0; let sum_lot = 0; let start_price = 4000; let loop_count = 30; let gap = 1
// for(let point = start_price; point>=start_price-3000; point-=100*gap){ count_new++
//     lot = (count === 0 || count%5 === 0)?(count === 0)?50:lot_main:added_lot; sum += lot*(loop_count-count)*(gap); particular_loss += sum_lot*85*gap; sum_lot += lot;
//     console.log(count+1,'===>',point,'===>',lot,'===>',sum_lot,'===>',lot*(loop_count-count)*(gap), '====>', particular_loss); count++
// }
// console.log('$ :',sum, 'RS :',sum*85, 'Discount :',Math.round(sum*85 - sum*85/3))

// let count = 0
// let current_price = 3200
// for(let i = 0; i <= 500; i=i+50){
//     count++
//     if(count===6){
//       console.log(current_price-i,'====>','++++++++++++++++++++++++++++++++++++++++++++++++++++')
//     }else{
//       console.log(current_price-i,'====>',(count == 1)?100:25)
//     }
// }

//FLAT 60 LAC --> 20 LAC DOWN PAYMENT --> 30k EMI
//CAR 20 LAC --> 10 LAC --> 10k EMI
//WATCH 1 LAC --> 5k EMI
//MOBILE 1 LAC --> 5k EMI
//LAPTOP 1 LAC --> 5k EMI