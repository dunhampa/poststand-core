
const axios = require('axios');
const { Buffer } = require('buffer');
const { globalSet, globalGet, globalsClear, getSecret } = require('poststand-core');

if (typeof console.always !== 'function') {
  console.always = console.log;
}

/*-----------------------------------------------------------------*/
/*---FLEXIBLE API FUNCTION-----------------------------------------*/
/*-----------------------------------------------------------------*/
async function makeApiCall({ method, url, queryParams = {}, headers = {}, body = null, auth = {} }) {
    try {
        const config = { 
            method, 
            url, 
            params: queryParams, 
            data: body, 
            headers: { ...headers },
            validateStatus: () => true // Accept all status codes
        };
        
        // Add default headers, allowing user overrides
        config.headers = {
          'User-Agent': 'curl/8.7.1',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'X-Force-Accept-Language': 'true',
          ...config.headers
        }

        if (auth.type) {
            switch (auth.type) {
                case 'bearer':
                    if (!auth.token) throw new Error('Bearer token is missing.');
                    config.headers['Authorization'] = `Bearer ${auth.token}`;
                    break;
                case 'apiKey':
                    if (!auth.key || !auth.value) throw new Error('API key/value is missing.');
                    config.headers[auth.key] = auth.value;
                    break;
                case 'basic':
                    if (typeof auth.username !== 'string' || typeof auth.password !== 'string') throw new Error('Basic auth credentials missing or not strings.');
                    config.headers['Authorization'] = `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`;
                    break;
                default: console.warn(`Unsupported auth type: ${auth.type}`);
            }
        }
        
        console.log(`🚀 Making ${config.method.toUpperCase()} request to ${config.url}`);
        // if (Object.keys(config.params || {}).length > 0) console.log('   Query Params:', config.params);
        // if (Object.keys(config.headers || {}).length > 0) console.log('   Headers:', config.headers);
        // if (config.data !== null && typeof config.data !== 'undefined') console.log('   Body:', config.data);
        
        const response = await axios(config);
        //console.log(`✅ Response received: ${response.status} ${response.statusText}`);
        return response;
    } catch (error) {
        if (error.response) {
            console.error(`❌ API Call Error: ${error.response.status} ${error.response.statusText}`, error.response.data);
        } else if (error.request) {
            console.error("❌ API Call Error: No response received. Network issue or CORS problem if browser.", error.request);
        } else {
            console.error('❌ API Call Error: Error setting up request:', error.message);
        }
        throw error;
    }
}

/*-----------------------------------------------------------------*/
/*---STAGE 1: PRE-REQUEST SCRIPT-----------------------------------*/
/*-----------------------------------------------------------------*/
async function preScript() {
  console.log('--- Running Pre-Script ---');
  try {
    // Pre-request script
// console.log("Pre-request script is running!");
  } catch (e) {
    console.error('Error in Pre-Script:', e);
    throw e;
  }
}

/*-----------------------------------------------------------------*/
/*---STAGE 2: MAIN API REQUEST-------------------------------------*/
/*-----------------------------------------------------------------*/
async function mainFunction() {
  console.log('--- Running Main Request ---');

  let body = null;
  

  const requestConfig = {
    method: 'GET',
    url: "https://mydomain.atlassian.net/rest/api/2/issue/SETUP-100",
    queryParams: {
      
    },
    headers: {
      
    },
    auth: {},
    body: body
  };
  
  const authConfig = { type: 'basic', username: "myemailhardcoded@mydomain.com", password: await getSecret('secretOne.jiraApiKey') };
  requestConfig.auth = authConfig;

  const response = await makeApiCall(requestConfig);
  return response;
}

/*-----------------------------------------------------------------*/
/*---STAGE 3: POST-REQUEST SCRIPT----------------------------------*/
/*-----------------------------------------------------------------*/
async function postScript(response) {
  console.log('--- Running Post-Script ---');
  if (!response && typeof response !== 'undefined' && response !== null) {
      console.log("Post-Script: No response object from main request (it might have failed).");
  }
  try {
    // Post-request script
// console.log("Post-request script is running with status:", response?.status);
  } catch (e) {
    console.error('Error in Post-Script:', e);
  }
}

/*-----------------------------------------------------------------*/
/*---EXECUTION ORCHESTRATOR (DO NOT MODIFY)------------------------*/
/*-----------------------------------------------------------------*/
async function run() {
  let response = null;
  try {
    await preScript();
    response = await mainFunction();
  } catch (error) {
    console.error('\n🛑 Execution halted due to an error in Pre-Script or Main Request.');
  } finally {
    try {
        await postScript(response);
    } catch (postScriptError) {
        console.error('\n🛑 Error occurred during Post-Script execution:', postScriptError);
    }

    if (response) {
      console.always(`
✅ ${response.config.method.toUpperCase()} ${response.config.url} ${response.status} ${response.statusText}`);
      //console.log('Request Body (Sent):', JSON.stringify(response.config.data))
      // console.log('Response Headers:', response.headers);
       console.log('Response Body (Received):', JSON.stringify(response.data));
    }

    console.log('\n✨ Execution finished.');
  }
}

run();
