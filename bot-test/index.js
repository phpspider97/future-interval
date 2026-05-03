require("dotenv").config();
const pullback = require('./ema_pullback');
const mathematic = require('./mathematic');
const rangeDetector = require('./range_detector');
const whaleDetector = require('./whale_detector');
const strangleDetector = require('./strangle_detector');

const intervalManager = require('./intervalManager');


intervalManager.start('!=== EMA PULLBACK START ===!',pullback.run,60000);
intervalManager.start('!=== MATHEMATIC BOT START ===!',mathematic.run,60000);
intervalManager.start('!=== RANGE DETECTOR BOT START ===!',rangeDetector.run,60000);
intervalManager.start('!=== WHALE DETECTOR BOT START ===!',whaleDetector.run,60000);
intervalManager.start('!=== STRANGLE DETECTOR BOT START ===!',strangleDetector.run,60000);


console.log(`%====================================================================%`);