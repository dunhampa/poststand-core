//const { globalSet, globalGet, globalsClear, queueNextScript } = require('poststand-core');
const psc = require('poststand-core');

psc.globalSet("script1Save", "Script 1 save" + " " +psc.globalGet("script1Save"))

// Debug: Log enabledScripts list to check if script10.js is included
const globals = psc.globalListAll();
console.log("Globals", JSON.stringify(globals));
//console.log("ENABLED SCRIPTS:", JSON.stringify(globals.enabledScripts));
//console.log("SCRIPT QUEUE:", JSON.stringify(globals.scriptQueue));

setTimeout(() => {
   console.log("Script 1: First log after 5 seconds.");
   setTimeout(() => {
     console.log("Script 1: Second log after 8 seconds.");
   }, 1000);
 }, 1000);

 psc.globalSet("holler", "This is holler from Script 1")
 psc.queueNextScript('script10.js');
 
 // Debug: Log enabledScripts list again after queuing
 const globalsAfter = psc.globalListAll();
 console.log("ENABLED SCRIPTS AFTER QUEUE:", JSON.stringify(globalsAfter.enabledScripts));
 console.log("SCRIPT QUEUE AFTER QUEUE:", JSON.stringify(globalsAfter.scriptQueue));