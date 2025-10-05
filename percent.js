let current_value   =   1551
let first_value     =   5000
let second_value    =   first_value/2
//current_value = 100
function nestedPercentage(value, percent) {
    return Math.round(value - value * percent / 100)
}

// Example:
let first_percentage = nestedPercentage(current_value, 2)
let second_percentage = nestedPercentage(first_percentage, 4)
let third_percentage = nestedPercentage(second_percentage, 8)
let forth_percentage = nestedPercentage(third_percentage, 16)

console.log('SRT :', current_value, 'LOT : ', first_value)
console.log('=======================')
console.log('MID :', (first_percentage+current_value)/2, 'LOT : ',second_value)
console.log('ORG :',first_percentage, 'LOT : ',second_value)
console.log('MID :', (second_percentage+first_percentage)/2, 'LOT : ',second_value)
console.log('ORG :',second_percentage, 'LOT : ',second_value)
console.log('MID :', (third_percentage+second_percentage)/2, 'LOT : ',second_value)
console.log('ORG :',third_percentage, 'LOT : ',second_value)
console.log('MID :', (forth_percentage+third_percentage)/2, 'LOT : ',second_value)
console.log('ORG :',forth_percentage, 'LOT : ',second_value)
//console.log(third_percentage) 

//50 ==> 150
//40 ==> 120
//30 ==> 90



// let sum = 0
// for(let i = 0; i<=3000; i+=200){
//   if(i===0){continue}
//   console.log(i,'===>',i/1000*6)
//   sum += i/1000*6
// }
// console.log(sum)


// let sum = 0
// let lot = 20
// for(let i = 0; i<=50; i+=5){ 
//   console.log(i,'===>',lot, '===>', lot*i)
//   sum += i*lot
// }

// console.log(sum, sum*85)

// ETH
// let sum = 0; let lot = 30; let added_lot = 30; let count = 0; let sum_lot = 0; let start_price = 4000; let loop_count = 15; let gap = 3
// for(let point = start_price; point>=1000; point-=100*gap){
//     lot = (count < 5)?lot:added_lot; sum += lot*(loop_count-count)*gap; sum_lot += lot
//     console.log(count+1,'===>',point,'===>',lot,'===>',sum_lot,'===>',lot*(loop_count-count)*gap); count++
// }
// console.log(sum, sum*85, Math.round(sum*85 - sum*85/3))

// BTC
// let sum = 0; let lot_main = 20; let added_lot = 10; let count = 0; let count_new = 1; let sum_lot = 0; let start_price = 120000; let loop_count = 15; let gap = 20
// for(let point = start_price; point>=start_price-30000; point-=100*gap){ count_new++
//     lot = (count_new%2 === 0)?lot_main:added_lot; sum += lot*(loop_count-count)*(gap/10); sum_lot += lot
//     console.log(count+1,'===>',point,'===>',lot,'===>',sum_lot,'===>',lot*(loop_count-count)*(gap/10)); count++
// }
// console.log(sum, sum*85, Math.round(sum*85 - sum*85/3))

let sum = 0; let lot_main = 5; let added_lot = 5; let count = 0; let count_new = 1; let sum_lot = 0; let start_price = 123000; let loop_count = 30; let gap = 10
for(let point = start_price; point>=start_price-30000; point-=100*gap){ count_new++
    lot = (count_new%2 === 0)?(count_new === 2)?lot_main*6:lot_main:added_lot; sum += lot*(loop_count-count)*(gap/10); sum_lot += lot
    console.log(count+1,'===>',point,'===>',lot,'===>',sum_lot,'===>',lot*(loop_count-count)*(gap/10)); count++
}
console.log(sum, sum*85, Math.round(sum*85 - sum*85/3))


4820
3780

// MAIN        ===>    10K
// SCALPER     ===>    53.68K
// GRID        ===>    38.03K
// SUPERTREND  ===>    21.71K

// 181900 ==> 20
// 207400 ==> 30
// 232900 ==> 40
