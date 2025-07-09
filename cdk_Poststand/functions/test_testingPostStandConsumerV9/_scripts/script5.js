const axios = require('axios');
const { globalSet, globalGet, globalsClear, getSecret, globalListAll } = require('poststand-core');

/*------------------------------*/
/*---PRE_SCRIPT-----------------*/
/*------------------------------*/
async function preScript() {
  console.log('Running pre-script...');
  const scopeTest = "WhatupCuz";
  globalSet("testingScope", scopeTest);

  await new Promise(resolve => {
    setTimeout(() => {
      console.log("Hold Prescript for 5 seconds");
      resolve();
    }, 5000);
  });
}
/*------------------------------*/
/*---MAIN_REQUEST-----------------*/
/*------------------------------*/
async function mainFunction() {
  console.log('Running main function...');
  console.log(globalGet("testingScope"));

  try {
    const response = await axios.get('https://jsonplaceholder.typicode.com/posts/1');
    console.log('API Response Title:', response.data.title);
  } catch (error) {
    console.error('API request failed:', error.message);
  }
}
/*------------------------------*/
/*---POST-SCRIPT-----------------*/
/*------------------------------*/
async function cleanUp() {
  console.log('Running cleanup...');
  const globals = globalListAll();
  console.log("Globals", JSON.stringify(globals));
}
/*------------------------------*/
/*---EXECUTION(NO UPDATES)-----*/
/*------------------------------*/
async function run() {
  try {
    await preScript();
    await mainFunction();
  } catch (error) {
    console.error('Error during execution:', error);
  } finally {
    await cleanUp();
  }
}

run();
