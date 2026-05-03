require("dotenv").config();
const pullback = require('./ema_pullback');
const mathematic = require('./mathematic');
const strangle = require('./strangle-detector');
const intervalManager = require('./intervalManager');


intervalManager.start('!=== EMA PULLBACK START ===!',pullback.run,60000);
intervalManager.start('!=== MATHEMATIC BOT START ===!',mathematic.run,60000);
intervalManager.start('!=== STRANGLE BOT START ===!',strangle.run,60000);


console.log(`%====================================================================%`);