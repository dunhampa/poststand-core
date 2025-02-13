//const { globalSet, globalGet, globalsClear, queueNextScript } = require('poststand-core');
const psc = require('poststand-core');

psc.globalSet("script1Save", "Script 1 save" + " " +psc.globalGet("script1Save"))

setTimeout(() => {
   console.log("Script 1: First log after 5 seconds.");
   setTimeout(() => {
     console.log("Script 1: Second log after 8 seconds.");
   }, 1000);
 }, 1000);

 psc.globalSet("holler", "This is holler from Script 1")
 psc.queueNextScript('script10.js');