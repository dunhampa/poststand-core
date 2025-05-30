const { globalSet, globalGet, globalsClear } = require('poststand-core');

setTimeout(async () => {
   console.log("Script 2: First log after 7 seconds.");
   await new Promise(resolve => setTimeout(resolve, 1000));
   console.log("Script 2: Second log after 6 seconds.");
 }, 1000);
 globalSet("another one", 1)
 //globalSet("objectTest", {something: "holler", booleanSomething: true})
 console.log("hollering return",globalGet("holler"))
 //globalsClear()