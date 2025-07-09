const { globalSet, globalGet, globalsClear } = require('poststand-core');

setTimeout(() => {
   console.log("Script 1: First log after 5 seconds.");
   setTimeout(() => {
     console.log("Script 1: Second log after 8 seconds.");
   }, 1000);
 }, 1000);

 globalSet("holler", "This is holler from Script 1")