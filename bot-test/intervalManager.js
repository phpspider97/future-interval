const intervals = {};

function start(name, fn, time) {
    if (intervals[name]) {
        console.log(`Interval ${name} already running`);
        return;
    } 
    intervals[name] = setInterval(fn, time);
    console.log(`Started interval: ${name}`);
}
 
module.exports = { start };