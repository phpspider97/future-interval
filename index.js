const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path"); 
// const { futureEmitter } = require("./future/future"); 
// const { optionEmitter } = require("./option/option"); 
const { gridEmitter } = require("./grid/grid"); 
const { vgridEmitter } = require("./grid/v-grid"); 
const { ggridEmitter } = require("./grid/g-grid"); 
// const { crossEmitter } = require("./cross/cross"); 
// const { strangleOptionEmitter } = require("./strangle/strangle"); 
//const { superTrendEmitter } = require("./super-trend/super-trend"); 
 
const app = express();
const server = http.createServer(app);
const io = new Server(server); 
 
//==============================FUTURE==================================
// futureEmitter.on("future_trade_info", (data) => { 
//     io.emit("future_trade_info", data)
// })  
// app.get('/', (req, res) => {  
//     res.sendFile(path.join(__dirname, 'public', 'future.html'));
// }) 
//==============================FUTURE==================================

//==============================OPTION==================================
// optionEmitter.on("option_trade_info", (data) => { 
//     io.emit("option_trade_info", data)
// })  
// app.get('/option', (req, res) => {  
//     res.sendFile(path.join(__dirname, 'public', 'option.html'));
// }) 
//==============================OPTION==================================

//==============================GRID==================================
gridEmitter.on("grid_trade_info", (data) => { 
    io.emit("grid_trade_info", data)
})  
app.get('/', (req, res) => {  
    res.sendFile(path.join(__dirname, 'public', 'grid.html'));
}) 
//==============================GRID==================================

//==============================GRID==================================
vgridEmitter.on("grid_trade_info", (data) => { 
    io.emit("grid_trade_info", data)
})  
app.get('/v-grid', (req, res) => {  
    res.sendFile(path.join(__dirname, 'public', 'v-grid.html'));
}) 
//==============================GRID==================================

//==============================GRID==================================
ggridEmitter.on("grid_trade_info", (data) => { 
    io.emit("grid_trade_info", data)
})  
app.get('/g-grid', (req, res) => {  
    res.sendFile(path.join(__dirname, 'public', 'g-grid.html'));
}) 
//==============================GRID==================================

//==============================CROSS==================================
// crossEmitter.on("cross_trade_info", (data) => {  
//     //console.log('data__',data)
//     io.emit("cross_trade_info", data)
// })  
// app.get('/cross', (req, res) => {  
//     res.sendFile(path.join(__dirname, 'public', 'cross.html'));
// }) 
//==============================CROSS==================================

//==============================SUPER TREND==================================
// superTrendEmitter.on("super_trend_trade_info", (data) => {  
//     //console.log('data__',data)
//     io.emit("super_trend_trade_info", data)
// })  
// app.get('/super-trend', (req, res) => {  
//     res.sendFile(path.join(__dirname, 'public', 'super-trend.html'));
// }) 
//==============================SUPER TREND==================================

//==============================STRANGLE==================================
// strangleOptionEmitter.on("strangle_trade_info", (data) => {  
//     //console.log('data__',data)
//     io.emit("strangle_trade_info", data)
// })  
// app.get('/strangle', (req, res) => {  
//     res.sendFile(path.join(__dirname, 'public', 'strangle.html'));
// }) 
//==============================STRANGLE==================================

io.on("connection", (socket) => {
    // socket.on("future_start", () => { 
    //     futureEmitter.emit("future_start")
    // })
    // socket.on("future_stop", () => { 
    //     futureEmitter.emit("future_stop")
    // })
    // socket.on("option_start", () => { 
    //     optionEmitter.emit("option_start")
    // })
    // socket.on("option_stop", () => { 
    //     optionEmitter.emit("option_stop")
    // })
    socket.on("grid_start", () => { 
        gridEmitter.emit("grid_start")
    })
    socket.on("grid_stop", () => { 
        gridEmitter.emit("grid_stop")
    })
    
    socket.on("v_grid_start", () => { 
        vgridEmitter.emit("v_grid_start")
    })
    socket.on("v_grid_stop", () => { 
        vgridEmitter.emit("v_grid_stop")
    })

    socket.on("g_grid_start", () => { 
        ggridEmitter.emit("g_grid_start")
    })
    socket.on("g_grid_stop", () => { 
        ggridEmitter.emit("g_grid_stop")
    })
    // socket.on("cross_start", () => { 
    //     crossEmitter.emit("cross_start")
    // })
    // socket.on("cross_stop", () => { 
    //     crossEmitter.emit("cross_stop")
    // })
    // socket.on("strangle_start", () => { 
    //     strangleOptionEmitter.emit("strangle_start")
    // })
    // socket.on("strangle_stop", () => { 
    //     strangleOptionEmitter.emit("strangle_stop")
    // })
    // socket.on("super_trend_start", () => { 
    //     superTrendEmitter.emit("super_trend_start")
    // })
    // socket.on("super_trend_stop", () => { 
    //     superTrendEmitter.emit("super_trend_stop")
    // })
});
 
server.listen(3000, () => {
    console.log("🚀 Server running on http://localhost:3000")
});
 