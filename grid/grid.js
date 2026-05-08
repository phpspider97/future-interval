const axios = require('axios')
const crypto = require('crypto')
require('dotenv').config()
const WebSocket = require('ws')
const fs = require('fs') 

const pullback = require('../bot-test/ema_pullback');
const mathematic = require('../bot-test/mathematic'); 
const intervalManager = require('../bot-test/intervalManager');

console.log(`%====================================================================%`);
intervalManager.start('!=== EMA PULLBACK START ===!',pullback.run,60000);
intervalManager.start('!=== MATHEMATIC BOT START ===!',mathematic.run,60000); 
console.log(`%====================================================================%`);

// TELEGRAM
const TOKEN = process.env.TELEGRAM_GRID_TOKEN;
const CHAT_ID = process.env.TELEGRAM_GRID_CHAT_ID;

async function sendTelegram(message) {
    try {
        await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: message,
            parse_mode: "Markdown"
        });
    } catch (err) {
        console.error("Telegram Error:", err.message);
    }
}
  
const EventEmitter = require('events')
const gridEmitter = new EventEmitter()

const lastSentTimestamps = {}
const THROTTLE_INTERVAL_MS = 60 * 1000
async function sendEmail(message='NA',subject="NA"){
    try{
        const now = Date.now();
        const subjectKey = subject.trim().toLowerCase();
        if (lastSentTimestamps[subjectKey] && now - lastSentTimestamps[subjectKey] < THROTTLE_INTERVAL_MS) {
            console.log(`GRID BOT : Throttled: Email with subject "${subject}" was sent recently.`);
            return;
        }
        lastSentTimestamps[subjectKey] = now;
    
        await sendTelegram(`
✅ *GRID BOT*

📊 *Subject:* ${subject}
📈 *Message:* ${message}
    
🕒 ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
        `);
    }catch(error){
        console.log('EMAIL ERROR : ', error.message)
    }
}

const API_URL       =   process.env.API_URL 
const SOCKET_URL    =   process.env.API_URL_SOCKET 
const KEY           =   process.env.GRID_WEB_KEY
const SECRET        =   process.env.GRID_WEB_SECRET 
const USER_ID       =   process.env.GRID_WEB_USER_ID
 
let product_id              =   0 
let is_live                         =   false
let given_price_range               =   []
let lower_price                     =   0 
let upper_price                     =   0 
let grid_spacing                    =   0
let numberOfGrids                   =   100
let profit_margin                   =   5
let stoploss_both_side              =   0
let total_error_count               =   0 
let number_of_time_order_executed   =   0
let roundedToHundred                =   (price) => Math.round(price / 5) * 5
let reconnectInterval               =   2000
let order_in_progress               =   false 
let is_price_out_of_grid            =   false
let body_param_for_testing          =   {}
let size                            =   50
 

async function getOpenOrderCount() {
    try {
        const timestamp = Math.floor(Date.now() / 1000);
        const path = "/v2/orders";
        const signaturePayload = `GET${timestamp}${path}`;
        const signature = crypto
            .createHmac("sha256", process.env.GRID_WEB_SECRET)
            .update(signaturePayload)
            .digest("hex");

        const headers = {
            "api-key": process.env.GRID_WEB_KEY,
            "signature": signature,
            "timestamp": timestamp,
            "Accept": "application/json"
        };

        const response = await axios.get(
            `${process.env.API_URL}${path}`,
            { headers }
        );
        const openOrders = response.data.result.filter(order =>
            order.state === "open" ||
            order.state === "pending"
        );
        return response.data.meta.total_count
    } catch (error) {
        return 0;
    }
}

setInterval(async () => {
    try {
        const totalOpenOrders = await getOpenOrderCount();
        console.log('totalOpenOrders:', totalOpenOrders);
        if (totalOpenOrders != 98) {
            await sendEmail(
                `CURRENT TOTAL COUNT IS : ${totalOpenOrders}`,
                `ORDER COUNT MISMATCH ${98 - totalOpenOrders}`
            );
        }
    } catch (error) {
        console.error('Error in order count check:', error);
    }
}, 15 * 60 * 1000); // runs every 60 seconds

function wsConnect() { 
    const WEBSOCKET_URL = SOCKET_URL
    const API_KEY = KEY
    const API_SECRET = SECRET
    
    function generateSignature(secret, message) {
        return crypto.createHmac('sha256', secret).update(message).digest('hex');
    }
    function subscribe(ws, channel, symbols) {
        const payload = {
        type: 'subscribe',
        payload: {
            channels: [
                {
                    name: channel,
                    symbols: symbols
                }
            ]
        }
        };
        ws.send(JSON.stringify(payload));
    }
    async function onMessage(data) {
        try{
            const message = JSON.parse(data) 
            if (message.type === 'success' && message.message === 'Authenticated') {
                subscribe(ws, 'orders', ['all'])
                subscribe(ws, 'v2/ticker', ['PAXGUSD'])
                subscribe(ws, 'l2_orderbook', ['PAXGUSD']) 
            } else {
                if(message.type == 'error'){
                    sendEmail(message.message,`IP ADDRESS ERROR`)
                    console.log("GRID : " + message.message)
                }
                if(!is_live){ 
                    return true
                } 
                if(total_error_count > 3) {   
                    //console.log('total_error_count___',total_error_count)
                    sendEmail(`TOTAL ERROR : ${total_error_count}`,'TOTAL ERROR MESSAGE EXCEEDED')
                    is_live = false
                    fs.writeFileSync('./grid/orderInfo.json', '', 'utf8')
                    ws.close(1000, 'Too many errors');
                }  
                if(message.type == "orders"){  
                    //console.log('enter1',message.state,message.meta_data.pnl)
                    if(message.state == 'closed' && message.meta_data.pnl != undefined){  
                        //console.log('enter2')
                        //console.log('message____',message)
                        const side = message.side
                        const size = message.size
                        const order_at = parseFloat(message.limit_price)
                        //const order_at = message.limit_price
                        const update_order_price = (side == 'buy')?order_at+profit_margin:order_at-profit_margin 

                        //console.log('order_at___',order_at,side,update_order_price,is_price_out_of_grid,upper_price,lower_price)

                        if(!is_price_out_of_grid && order_at <= upper_price && order_at >= lower_price){  
                            //console.log('size____ : ',size,update_order_price)
                            console.log('message : ',message)
                            await createOrder((side == 'buy')?'sell':'buy',update_order_price,size,true)
                        }
                    }
                }else{
                    //console.log(JSON.stringify(message))
                } 
                if(message.type == "v2/ticker"){
                    let candle_current_price = message?.close
                    if ( given_price_range && given_price_range.length>0 && (candle_current_price > given_price_range[given_price_range.length-1]?.price+stoploss_both_side || candle_current_price < given_price_range[0]?.price-stoploss_both_side) && !is_price_out_of_grid ) {
                        is_price_out_of_grid = true
                        sendEmail('',`BOT STOP BECAUSE OUT OF GRID`)
                    }else{
                        is_price_out_of_grid = false
                    }
                    triggerOrder(candle_current_price)
                } 
            } 
        }catch(error){
            console.log('socket error : ', error.message)
        }
    } 
    async function onError(error) {
        //await cancelAllOpenOrder()
        sendEmail(error.message??'',`SOCKET DEFAULT ERROR TRIGGERED`)
        setTimeout(() => {
            sendEmail('',`SOCKET RE-CONNECT AGAIN AFTER 2 SECONDS CLOSED DUE TO SOCKET DEFAULT ERROR TRIGGERED`)
            wsConnect()
        }, reconnectInterval)
    }

    async function onClose(code, reason) {
        if(!is_live){
            return true
        }
        console.log(`Socket closed with code: ${code}, reason: ${reason}`)
        if(code == 1000){
            sendEmail(reason.toString(),`SOCKET CLOSED DUE TO TOO MANY ERROR`)
            //await cancelAllOpenOrder()
            setTimeout(() => {
                total_error_count = 0 
                sendEmail('',`SOCKET RE-CONNECT AGAIN AFTER 1 MINUTE CLOSED DUE TO TOO MANY ERROR`)
                wsConnect()
                //resetLoop()
            }, 60000)
        }else{
            total_error_count = 0
            sendEmail(reason.toString(),`SOCKET UNEXPECTED ERROR`)
            setTimeout(() => {
                sendEmail('',`SOCKET RE-CONNECT AGAIN AFTER 2 SECONDS CLOSED DUE TO SOCKET UNEXPECTED ERROR`)
                wsConnect()
            }, reconnectInterval)
        }
    }
    function sendAuthentication(ws) {
        const method = 'GET'
        const path = '/live'
        const timestamp = Math.floor(Date.now() / 1000).toString(); // Unix timestamp in seconds
        const signatureData = method + timestamp + path
        const signature = generateSignature(API_SECRET, signatureData)
        const authPayload = {
            type: 'auth',
            payload: {
                'api-key': API_KEY,
                signature: signature,
                timestamp: timestamp
            }
        }
        ws.send(JSON.stringify(authPayload))
    }
    
    const ws = new WebSocket(WEBSOCKET_URL)
    ws.on('open', () => {
        console.log('Socket opened')
        sendAuthentication(ws)
    })
    ws.on('message', onMessage)
    ws.on('error', onError)
    ws.on('close', onClose)
}
 
async function cancelAllOpenOrder() {
    try {
        given_price_range = [];
        const timestamp = Math.floor(Date.now() / 1000);
        const bodyParams = {
            close_all_portfolio: true,
            close_all_isolated: true,
            user_id: USER_ID,
        }; 
        const signaturePayload = `POST${timestamp}/v2/positions/close_all${JSON.stringify(bodyParams)}`;
        const signature = await generateEncryptSignature(signaturePayload);

        const headers = {
            "api-key": KEY,
            "signature": signature,
            "timestamp": timestamp,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }; 
        const response = await axios.post(`${API_URL}/v2/positions/close_all`, bodyParams, { headers });
        return { data: response.data, status: true };
    } catch (error) {
        sendEmail(error.message,`ERROR IN WHEN CANCEL ALL ORDER`)
        return { message: error.message + ' ' + JSON.stringify(error.response?.data) , status: false };
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
 
async function setRangeLimitOrder() {
    try {
        //await cancelAllOpenOrder()
        const response = await axios.get(`${API_URL}/v2/tickers/PAXGUSD`);
        const current_price = Math.round(response?.data?.result?.close);  
        product_id = response.data.result.product_id;
        let round_of_current_price = roundedToHundred(current_price)  
        //let round_of_current_price =  Math.round(current_price)  
       
        upper_price       =  round_of_current_price + 250
        lower_price       =  round_of_current_price - 250
        grid_spacing      =  (upper_price - lower_price) / numberOfGrids ;
        //console.log('response___',response) 
        for (let i = 0; i < numberOfGrids; i++) {
            const rawBuyPrice = lower_price + i * grid_spacing
            given_price_range.push({
                price : rawBuyPrice,
                fill : {
                    buy  : false,
                    sell : false
                }
            }); 
        } 
        sendEmail(`PAXG PRICE : ${round_of_current_price}`,`ENTRY POINT OF GRID`)
        console.log('given_price_range____',round_of_current_price, numberOfGrids, grid_spacing)
        //console.log('upper_price',upper_price)
        //console.log('lower_price',lower_price)
       
        //console.log('given_price_range___', round_of_current_price, upper_price, lower_price, grid_spacing)
        const first_five = given_price_range.slice(1, 50).reverse()
        const last_five = given_price_range.slice(-50)

        //console.log('first_five',first_five)
        //console.log('last_five',last_five)
        //return true

        for (const data of first_five) { 
            order_in_progress = false; 
            await createOrder('buy', data.price,size);
            await sleep(500);
        }
        
        for (const data of last_five) {
            order_in_progress = false;
            await createOrder('sell', data.price,size);
            await sleep(500);
        }
  
          
        updateOrderInfo(JSON.stringify({
            product_id,
            upper_price,
            lower_price,
            grid_spacing,
        })) 

        is_price_out_of_grid = false

        const update_range_order_wise = given_price_range.slice().sort((a, b) => b.price - a.price).map(item => item.price) 
        start_buy_option    =   update_range_order_wise[1]
        stop_buy_option     =   update_range_order_wise[2]
        stop_sell_option    =   update_range_order_wise[update_range_order_wise.length-4]
        start_sell_option   =   update_range_order_wise[update_range_order_wise.length-3]
 
        // console.log('first_five___',first_five)
        // console.log('last_five___',last_five)
        // console.log('given_price_range___',given_price_range)
        // console.log('buy_side_limit___',given_price_range[given_price_range.length-1].price+stoploss_both_side)
        // console.log('buy_sell_limit___',given_price_range[0].price+stoploss_both_side)
        // console.log('update_range_order_wise',update_range_order_wise) 
        // console.log('start_buy_option___',start_buy_option)
        // console.log('stop_buy_option___',stop_buy_option)
        // console.log('')
        // console.log('start_sell_option____',start_sell_option)
        // console.log('stop_sell_option___',stop_sell_option)

    } catch (error) {
        sendEmail(error.message,`ERROR IN WHEN CREATING ALL ORDER`)
        return { message: error.message, status: false };
    }
}

async function generateEncryptSignature(signaturePayload) { 
    return crypto.createHmac("sha256", SECRET).update(signaturePayload).digest("hex");
}
async function createOrder(bid_type,order_price,size,byDynamic=false){
    if(byDynamic){
        //console.log('total_error_count___',total_error_count)
    }
    // if(total_error_count>3){
    //     return true
    // } 
    if (order_in_progress){ 
        return true
    }
    order_in_progress = true
    try {  
        const timestamp = Math.floor(Date.now() / 1000);
        const bodyParams = {
            product_id : product_id,
            product_symbol : "PAXGUSD",
            size : size, 
            side : bid_type,   
            order_type : "limit_order",
            limit_price : order_price
        } 
        body_param_for_testing = bodyParams
        if(byDynamic){
            //console.log('body_param_for_testing: ',body_param_for_testing)
        }
        const signaturePayload = `POST${timestamp}/v2/orders${JSON.stringify(bodyParams)}`;
        const signature = await generateEncryptSignature(signaturePayload);

        const headers = {
            "api-key": KEY,
            "signature": signature,
            "timestamp": timestamp,
            "Content-Type": "application/json",
            "Accept": "application/json",
        } 
         
        const response = await axios.post(`${API_URL}/v2/orders`, bodyParams, { headers })
        //console.log('create order : ',response.data, body_param_for_testing)
        if (response.data.success) { 
            number_of_time_order_executed++  
            return { data: response.data, status: true }
        }
        sendEmail('Order failed',`ERROR IN WHEN CREATING ORDER`)
        return { message: "Order failed", status: false }
    } catch (error) {
        sendEmail(error.response.data || error.message +' '+JSON.stringify(body_param_for_testing),`ERROR IN WHEN CREATING ORDER`)
        //console.log('error : ',error) 
        //console.log('error 2 : ',error.response.data || error.message) 
        //console.log('body_param_for_testing___',body_param_for_testing) 
        total_error_count++ 
        order_in_progress = false;  
        return { message: error?.message, status: false }
    } finally {
        order_in_progress = false;
    }
}
 
(async function() {
    is_live = (fs.statSync('./grid/orderInfo.json').size != 0)?true:false
    if(is_live){
        wsConnect()
        let order_data = fs.readFileSync('./grid/orderInfo.json', 'utf8')
        order_data = JSON.parse(order_data) 
        
        product_id = order_data.product_id
        upper_price = order_data.upper_price
        border_buy_price = order_data.border_buy_price
        lower_price = order_data.lower_price 
        grid_spacing = order_data.grid_spacing 
    }
})();

async function updateOrderInfo(content){
    fs.writeFile('./grid/orderInfo.json', content, (error) => {
        if (error) {
            sendEmail(JSON.stringify(error),`ERROR IN WHEN UPDATE ORDER FILE`)
        } else {
           //console.log('File created and text written successfully.')
        }
    });
}
async function socketEventInfo(current_price){
    let order_data = {}
    let current_balance = 100000 
    is_live = (fs.statSync('./grid/orderInfo.json').size != 0)?true:false
    if(is_live){
        order_data = fs.readFileSync('./grid/orderInfo.json', 'utf8')
        order_data = JSON.parse(order_data) 
    } 
    //let current_trend = await classifyLastCandle()
    let current_trend = "Neutral"
    gridEmitter.emit("grid_trade_info", {
        balance : current_balance,
        product_symbol : "PAXGUSD",
        product_id : order_data.product_id??0,
        current_price : current_price??0,
        upper_price,
        lower_price,
        grid_spacing,
        is_live : is_live,
        current_trend
    })
}
async function triggerOrder(current_price) {
    try{
        socketEventInfo(current_price)
    }catch(error){ 
        sendEmail(error.message,`ERROR IN WHEN GET PRODUCT INFORMATION BY SOCKET`)
    }
}

gridEmitter.on("grid_start", async () => { 
    total_error_count = 0
    await setRangeLimitOrder()
    is_live = true 
    wsConnect()
    sendEmail('',`BOT START BUTTON PRESSED`)
})

gridEmitter.on("grid_stop", async () => { 
    total_error_count = 0
    await cancelAllOpenOrder() 
    fs.writeFileSync('./grid/orderInfo.json', '', 'utf8')
    sendEmail('',`BOT STOP BUTTON PRESSED`)
    is_live = false 
})

module.exports = { gridEmitter }