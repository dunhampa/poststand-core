const { globalSet,isAWSLambda } = require('poststand-core');

if(!isAWSLambda()){
   console.log("Loading Global")
 
   globalSet("testGlobal", "Hollering")
}