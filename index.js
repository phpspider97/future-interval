const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path"); 
const { futureEmitter } = require("./future/future"); 

const app = express();
const server = http.createServer(app);
const io = new Server(server); 
 

futureEmitter.on("future_trade_info", (data) => { 
    io.emit("future_trade_info", data)
})  
app.get('/future', (req, res) => {  
    res.sendFile(path.join(__dirname, 'public', 'future.html'));
})  
 
 

io.on("connection", (socket) => {
    socket.on("future_start", () => { 
        futureEmitter.emit("future_start")
    })
    socket.on("future_stop", () => { 
        futureEmitter.emit("future_stop")
    })
});
 
server.listen(3000, () => {
    console.log("🚀 Server running on http://localhost:3000")
});
