const axios = require('axios')
const crypto = require('crypto')
require('dotenv').config()
const WebSocket = require('ws')
const fs = require('fs')
//const { classifyLastCandle } = require('./trend.js')
const nodemailer = require('nodemailer')

const EventEmitter = require('events')
const gridEmitter = new EventEmitter()
 
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

const API_URL       =   process.env.API_URL 
const SOCKET_URL    =   process.env.API_URL_SOCKET 
const KEY           =   process.env.GRID_WEB_KEY
const SECRET        =   process.env.GRID_WEB_SECRET 
const USER_ID       =   process.env.GRID_WEB_USER_ID
 
let bitcoin_product_id              =   0
let bitcoin_option_product_id       =   0
let bitcoin_option_product_symbol   =   ''
let is_live                         =   false
let given_price_range               =   []
let lower_price                     =   0 
let upper_price                     =   0 
let grid_spacing                    =   0
let numberOfGrids                   =   33
let profit_margin                   =   200
let stoploss_both_side              =   0
let total_error_count               =   0 
let number_of_time_order_executed   =   0
let roundedToHundred                =   (price) => Math.round(price / 100) * 100
let reconnectInterval               =   2000
let order_in_progress               =   false 
let is_price_out_of_grid            =   false
let body_param_for_testing          =   {}
let start_buy_option                =   0
let stop_buy_option                 =   0
let start_sell_option               =   0
let stop_sell_option                =   0
let store_data_for_testing          =   {}
 
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
                subscribe(ws, 'v2/ticker', ['BTCUSD'])
                subscribe(ws, 'l2_orderbook', ['BTCUSD']) 
            } else {
                if(message.type == 'error'){
                    sendEmail(message.message,`IP ADDRESS ERROR`)
                    console.log("GRID : " + message.message)
                }
                if(!is_live){ 
                    return true
                } 
                if(total_error_count > 3) {   
                    console.log('total_error_count___',total_error_count)
                    is_live = false
                    fs.writeFileSync('./grid/orderInfo.json', '', 'utf8')
                    ws.close(1000, 'Too many errors');
                }  
                if(message.type == "orders"){  
                    console.log('enter1')
                    if(message.state == 'closed' && message.meta_data.pnl != undefined){  
                        console.log('enter2')
                        console.log('message____',message)
                        const side = message.side
                        const size = message.size
                        const order_at = parseInt(message.limit_price)
                        console.log('order_at___',order_at)
                        const update_order_price = (side == 'buy')?order_at+profit_margin:order_at-profit_margin 
                        if(!is_price_out_of_grid && order_at <= upper_price && order_at >= lower_price){  
                            console.log('size____ : ',size,update_order_price)
                            await createOrder((side == 'buy')?'sell':'buy',update_order_price,size,true)
                        }

                        // if(start_buy_option == order_at && side == 'sell'){ 
                        //     const result = await getCurrentPriceOfBitcoin('call')
                        //     if (!result.status) return;
                        //     bitcoin_option_product_id = result?.data?.option_data?.product_id
                        //     bitcoin_option_product_symbol = result?.data?.option_data?.symbol
                        //     await createOptionOrder(result?.data?.option_data?.product_id,result?.data?.option_data?.symbol,'buy')
                        // }
                        
                        // if(start_sell_option == order_at && side == 'buy'){
                        //     const result = await getCurrentPriceOfBitcoin('put')
                        //     if (!result.status) return;
                        //     bitcoin_option_product_id = result?.data?.option_data?.product_id
                        //     bitcoin_option_product_symbol = result?.data?.option_data?.symbol
                        //     await createOptionOrder(result?.data?.option_data?.product_id,result?.data?.option_data?.symbol,'buy')
                        // }
    
                        // if(stop_buy_option == order_at && side == 'buy' && bitcoin_option_product_id != 0 && bitcoin_option_product_symbol != ''){
                        //     await createOptionOrder(bitcoin_option_product_id,bitcoin_option_product_symbol,'buy')
                        //     bitcoin_option_product_id       =   0
                        //     bitcoin_option_product_symbol   =   ''
                        // }

                        // if(stop_sell_option == order_at && side == 'sell' && bitcoin_option_product_id != 0 && bitcoin_option_product_symbol != ''){
                        //     await createOptionOrder(bitcoin_option_product_id,bitcoin_option_product_symbol,'buy')
                        //     bitcoin_option_product_id       =   0
                        //     bitcoin_option_product_symbol   =   ''
                        // }

                        // store_data_for_testing = {
                        //     order_at,
                        //     side,
                        //     bitcoin_option_product_id,
                        //     bitcoin_option_product_symbol,
                        //     start_buy_option,
                        //     stop_buy_option,
                        //     stop_sell_option,
                        //     start_sell_option
                        // }
                        // console.table(store_data_for_testing)
                        
                        //sendEmail('',`ONE ${side.toUpperCase()} SIDE STOP ORDER TRIGGERED AT ${order_at}`)
                    }
                } 
                if(message.type == "v2/ticker"){
                    let candle_current_price = message?.close
                    if ( given_price_range && given_price_range.length>0 && (candle_current_price > given_price_range[given_price_range.length-1]?.price+stoploss_both_side || candle_current_price < given_price_range[0]?.price-stoploss_both_side) && !is_price_out_of_grid ) {
                        is_price_out_of_grid = true

                        total_error_count = 0
                        await cancelAllOpenOrder() 
                        fs.writeFileSync('./grid/orderInfo.json', '', 'utf8')
                        sendEmail('',`BOT STOP BECAUSE OUT OF GRID`)
                        is_live = false 

                        //sendEmail('',`PRICE OUT OF THE GRID NOW GRID STOP FOR 10 MINUTE`)
                        //await cancelAllOpenOrder()
                        // setTimeout(async () => {
                        //     sendEmail('',`GRID CREATE AGAIN AFTER 10 MINUTE`)
                        //     await setRangeLimitOrder()
                        // }, 600000) 
                        // 10 min
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
        await cancelAllOpenOrder()
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
            await cancelAllOpenOrder()
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
        await cancelAllOpenOrder()
        const response = await axios.get(`${API_URL}/v2/tickers/BTCUSD`);
        const current_price = Math.round(response?.data?.result?.close);  
        bitcoin_product_id = response.data.result.product_id;
        let round_of_current_price = roundedToHundred(current_price)  
        upper_price       =  round_of_current_price + 3300
        lower_price       =  round_of_current_price - 3300
        grid_spacing      =  (upper_price - lower_price) / numberOfGrids;
         
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
  
        const first_five = given_price_range.slice(1, 17)
        const last_five = given_price_range.slice(-16)

        // console.log('current_price___',current_price)
        // console.log('first_five___',first_five)
        // console.log('last_five___',last_five)
 
        first_five.forEach(async (data)=>{
            order_in_progress = false
            await createOrder('buy',data.price,1)
            await sleep(500)
        })
        last_five.forEach(async (data)=>{
            order_in_progress = false
            await createOrder('sell',data.price,1)
            await sleep(500)
        })

        // const put_result = await getCurrentPriceOfBitcoin('put',1200)
        // if(put_result.data.option_data != undefined){
        //     await createOptionOrder(put_result?.data?.option_data?.product_id,put_result?.data?.option_data?.symbol)
        // } 
        // const call_result = await getCurrentPriceOfBitcoin('call',1000)
        // if(call_result.data.option_data != undefined){
        //     await createOptionOrder(call_result?.data?.option_data?.product_id,call_result?.data?.option_data?.symbol)
        // }  
        updateOrderInfo(JSON.stringify({
            bitcoin_product_id,
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

        // start_buy_option    =   update_range_order_wise[3]
        // stop_buy_option     =   update_range_order_wise[4]
        // stop_sell_option    =   update_range_order_wise[6]
        // start_sell_option   =   update_range_order_wise[7]
 
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
        sendEmail(error.message,`ERROR IN WHEN CANCEL ALL ORDER`)
        return { message: error.message, status: false };
    }
}

async function generateEncryptSignature(signaturePayload) { 
    return crypto.createHmac("sha256", SECRET).update(signaturePayload).digest("hex");
}
async function createOrder(bid_type,order_price,size,byDynamic=false){
    if(byDynamic){
        console.log('total_error_count___',total_error_count)
    }
    if(total_error_count>3){
        return true
    } 
    if (order_in_progress){ 
        return true
    }
    order_in_progress = true
    try {  
        const timestamp = Math.floor(Date.now() / 1000);
        const bodyParams = {
            product_id : bitcoin_product_id,
            product_symbol : "BTCUSD",
            size : size, 
            side : bid_type,   
            order_type : "limit_order",
            limit_price : order_price
        } 
        body_param_for_testing = bodyParams
        if(byDynamic){
            console.log('body_param_for_testing: ',body_param_for_testing)
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
        console.log('create order : ',response.data, body_param_for_testing)
        if (response.data.success) { 
            number_of_time_order_executed++  
            return { data: response.data, status: true }
        }
        return { message: "Order failed", status: false }
    } catch (error) {
        //console.log('error : ',error) 
        console.log('error 2 : ',error.response.data || error.message) 

        // const errData = error?.response?.data || {};
        // const errStatus = error?.response?.status || 'NO_STATUS';
        // const errMsg = error?.message || 'Unknown Error';

        // console.error('Error Status : ', errStatus);
        // console.error('Error Data   : ', errData);
        // console.error('Error Msg    : ', errMsg);

        //sendEmail(error.message +' '+JSON.stringify(body_param_for_testing),`ERROR IN WHEN CREATING ORDER`) 
        total_error_count++ 
        order_in_progress = false;  
        return { message: error?.message, status: false }
    } finally {
        order_in_progress = false;
    }
}

async function createOptionOrder(product_id,bitcoin_option_symbol,side='sell') { 
    // if (order_in_progress){ 
    //     return true
    // }
    // order_in_progress = true
     
    try { 
        const timestamp = Math.floor(Date.now() / 1000);
        const bodyParams = {
            product_id: product_id??0, 
            product_symbol: bitcoin_option_symbol??'', 
            size: 30,
            side: side, 
            order_type: "market_order"
        } 
        //console.log('bodyParams___',bodyParams)

        body_param_for_testing = bodyParams
        const signaturePayload = `POST${timestamp}/v2/orders${JSON.stringify(bodyParams)}`;
        const signature = await generateEncryptSignature(signaturePayload);

        const headers = {
            "api-key": KEY,
            "signature": signature,
            "timestamp": timestamp,
            "Content-Type": "application/json",
            "Accept": "application/json",
        };
        const response = await axios.post(`${API_URL}/v2/orders`, bodyParams, { headers });
        
        if (response.data.success) {  
            const message_template = `<br /><br /><br />
            <table border="1" cellpadding="8" cellspacing="3">
                <tr>
                    <td>Product Symbol</td>
                    <td>:</td>
                    <td>${bitcoin_option_symbol}</td> 
                </tr>
                <tr>
                    <td>Size</td>
                    <td>:</td>
                    <td>8</td> 
                </tr> 
            </table>
            ` 
            sendEmail(message_template,`CREATE OPTION ORDER FROM LESS LOSS : ${bitcoin_option_symbol}`)
            number_of_time_order_executed++
            return { data: response.data, status: true }
        }
        return { message: "Order failed", status: false };
    } catch (error) {
        sendEmail(error.message + ' ' + JSON.stringify(body_param_for_testing),`ERROR IN WHEN CREATING OPTION ORDER IN GRID`) 
        total_error_count++ 
        order_in_progress = false; 
        return { message: error?.message, status: false };
    } finally {
        order_in_progress = false;
    }
}
 
function getAdjustedDate() { 
    const now = new Date()
    const currentHour = now.getHours()
 
    const targetDate = new Date(now)
    if (currentHour >= 18) {
        targetDate.setDate(targetDate.getDate() + 2);
    }
 
    const day = String(targetDate.getDate()).padStart(2, '0');
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const year = targetDate.getFullYear();
   
    return `${day}-${month}-${year}`;
}

async function getCurrentPriceOfBitcoin(data_type,price_addition=0) {
    try { 
        const expiry_date = getAdjustedDate()  
        const response = await axios.get(`${API_URL}/v2/tickers/?underlying_asset_symbols=BTC&contract_types=call_options,put_options&states=live&expiry_date=${expiry_date}`)
        const allProducts = response.data.result
        
        const spot_price = Math.round(allProducts[0].spot_price / 200) * 200
         
        console.log('url',`${API_URL}/v2/tickers/?underlying_asset_symbols=BTC&contract_types=call_options,put_options&states=live&expiry_date=${expiry_date}`)
        //console.log('allProducts___',allProducts)
        console.log('spot_price___',spot_price)
        console.log('data_type___',data_type)
        
        let option_data = []
        if(data_type == 'call'){ 
            option_data = allProducts.filter(product =>
                product.contract_type == 'call_options' && product.strike_price == spot_price+200
            ); 
        }else if(data_type == 'put'){ 
            option_data = allProducts.filter(product =>
                product.contract_type == 'put_options' && product.strike_price == spot_price-200
            ); 
        } 
        const bitcoin_option_data = {
            option_data : option_data[0]
        } 

        console.log('bitcoin_option_data___',bitcoin_option_data)
        return { data: bitcoin_option_data, status: true }
    } catch (error) {
        sendEmail(error.message,`ERROR IN GETTING BITCOIN INFORMATION`) 
        return { message: error.message, status: false }
    }
}

async function getBalance() {
    try {   
        const timestamp = Math.floor(Date.now() / 1000)
        const signaturePayload = `GET${timestamp}/v2/wallet/balances`;
        const signature = await generateEncryptSignature(signaturePayload);

        const headers = {
            "api-key": KEY,
            "signature": signature,
            "timestamp": timestamp,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }; 
        const response = await axios.get(`${API_URL}/v2/wallet/balances`, { headers })
        return response.data.result[0].balance_inr
    } catch (error) {
        sendEmail(error.message,`ERROR IN WHEN GET BALANCE`)
    }
}
 
(async function() {
    // const result = await getCurrentPriceOfBitcoin('call')
    // if (!result.status) return;
    // bitcoin_option_product_id = result?.data?.option_data?.product_id
    // bitcoin_option_product_symbol = result?.data?.option_data?.symbol
    // console.log('bitcoin_option_product_id : ',bitcoin_option_product_id)
    // await createOptionOrder(result?.data?.option_data?.product_id,result?.data?.option_data?.symbol,'sell')
   
    // setTimeout(async () => { 
    //     await createOptionOrder(bitcoin_option_product_id,bitcoin_option_product_symbol,'buy')
    // }, 10000)

    is_live = (fs.statSync('./grid/orderInfo.json').size != 0)?true:false
    if(is_live){
        wsConnect()
        let order_data = fs.readFileSync('./grid/orderInfo.json', 'utf8')
        order_data = JSON.parse(order_data) 
        
        bitcoin_product_id = order_data.bitcoin_product_id
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
        product_symbol : "BTCUSD",
        bitcoin_product_id : order_data.bitcoin_product_id??0,
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