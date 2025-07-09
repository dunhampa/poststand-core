const { globalSet, globalGet, globalsClear } = require('poststand-core');


(async () => {
   await new Promise(resolve => setTimeout(resolve, 1000));
   console.log("Script 3: First log after 9 seconds.");
   await new Promise(resolve => setTimeout(resolve, 1000));
   console.log("Script 3: Second log after 5 seconds.");
   globalSet("booleanTest", true)
 })();

 console.log("hollering return",globalGet("holler"))