const { globalGet,isAWSLambda } = require('poststand-core');

console.log("From SCRIPT 11 HOLLELR")
console.log(isAWSLambda())

if(!isAWSLambda()){
   console.log("Loading Global")
   console.log(globalGet("testGlobal"))
}