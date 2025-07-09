// lambda_handler.js
const path = require('path');
const fs = require('fs');
const { runCollection }  = require('poststand-core');
const yaml = require('js-yaml'); // Added for YAML parsing

exports.main = async (event, context) => {
  try {
    // Lambda-specific: Create unique temp directory
    const requestId = context.awsRequestId;
    const timestamp = Date.now();
    const dirName = `${requestId}_${timestamp}`;
    const tmpDirPath = path.join('/tmp', dirName);
    fs.mkdirSync(tmpDirPath, {recursive: true});
    process.env.LAMBDA_GLOBALS = tmpDirPath;
   
    let jsonData; // Declare jsonData here

    // Parse request body
    if(event.httpMethod || (event.context && event.context["http-method"])){ // Corrected condition
      console.log("Invocation from API Gateway")
      
      try {
         jsonData = JSON.parse(event.body || '{}');  // Assign to jsonData
      } catch (e){
          var response = {
              statusCode: 400,
              body: "Unable to parse event body. User provided info could be invalid. For instance, a missing comma in json.",
              isBase64Encoded: false
   
          };
          console.log(response.body)
          //returns for AWS handler
          const failedPromise = Promise.resolve(response)
          return failedPromise
   
   
      }
   }
   else
   {
      console.log("Invocation from other source (e.g., direct Lambda invoke)");
      jsonData = event; // Assign event to jsonData
   }

    let requestedReturnSpec = null;

    // Attempt to get return_globals from jsonData (parsed body or direct event)
    // And remove it from jsonData so it's not treated as a regular global by runCollection
    if (jsonData && typeof jsonData === 'object' && jsonData !== null && jsonData.hasOwnProperty('return_globals')) {
        requestedReturnSpec = jsonData.return_globals;
        // Ensure what we extracted is either 'all' or an array, otherwise nullify
        if (!(typeof requestedReturnSpec === 'string' && requestedReturnSpec.toLowerCase() === 'all') && !Array.isArray(requestedReturnSpec)) {
            console.log("Invalid format for 'return_globals' in jsonData; expected 'all' or an array. Ignoring.", JSON.stringify(requestedReturnSpec));
            requestedReturnSpec = null; 
        } else {
            console.log('Found and extracted return_globals from jsonData (parsed body/event):', JSON.stringify(requestedReturnSpec));
        }
        delete jsonData.return_globals; // Important: remove it from jsonData
    }

    // If not found or invalid in jsonData, try event.context (for non-API Gateway or alternative setups)
    if (!requestedReturnSpec && event.context && event.context.return_globals) {
        const contextReturnSpec = event.context.return_globals;
        if ((typeof contextReturnSpec === 'string' && contextReturnSpec.toLowerCase() === 'all') || Array.isArray(contextReturnSpec)) {
            requestedReturnSpec = contextReturnSpec;
            console.log('Found return_globals in event.context:', JSON.stringify(requestedReturnSpec));
        } else {
            console.log("Invalid format for 'return_globals' in event.context; expected 'all' or an array. Ignoring.", JSON.stringify(contextReturnSpec));
        }
    }
    
    process.env.LAMBDA_CONFIG_PATH = path.join(__dirname, '_collection_config.yaml');

    // Run collection with request body as initial globals
    // jsonData no longer contains 'return_globals' if it was extracted above
    await runCollection({
      initialGlobals: jsonData, 
      clearGlobals: false // Don't clear globals in Lambda
    });

    // --- Logic to handle returning globals ---
    const configPath = process.env.LAMBDA_CONFIG_PATH;
    const configContent = fs.readFileSync(configPath, 'utf8');
    const collectionConfig = yaml.load(configContent);

    const returnPolicyConfig = collectionConfig.returnable_globals || { policy: 'none' };
    let policyType = (returnPolicyConfig.policy || 'none').toLowerCase();
    if (policyType === 'any') { // Handle 'any' as 'all'
        policyType = 'all';
    }
    const allowedListFromConfig = Array.isArray(returnPolicyConfig.allowed) ? returnPolicyConfig.allowed : [];

    let globalsToReturnInResponse = null;
    let returnProcessingError = null;

    if (requestedReturnSpec) {
        const allCurrentGlobals = jsonData; // Assumes jsonData now holds all globals

        if (typeof requestedReturnSpec === 'string' && requestedReturnSpec.toLowerCase() === 'all') {
            if (policyType === 'all') {
                globalsToReturnInResponse = { ...allCurrentGlobals };
            } else if (policyType === 'specified') {
                globalsToReturnInResponse = {};
                for (const key of allowedListFromConfig) {
                    if (allCurrentGlobals.hasOwnProperty(key)) {
                        globalsToReturnInResponse[key] = allCurrentGlobals[key];
                    }
                }
            } else { // 'none' or unrecognized policy restricting 'all'
                returnProcessingError = "Configuration does not allow returning all globals.";
            }
        } else if (Array.isArray(requestedReturnSpec)) {
            if (policyType === 'none') {
                returnProcessingError = "Configuration does not allow returning specified globals.";
            } else {
                globalsToReturnInResponse = {};
                const errors = [];
                for (const key of requestedReturnSpec) {
                    if (!allCurrentGlobals.hasOwnProperty(key)) {
                        errors.push(`Global '${key}' does not exist.`);
                    } else if (policyType === 'specified' && !allowedListFromConfig.includes(key)) {
                        errors.push(`Global '${key}' is not configured for return.`);
                    } else { // Allowed by 'all' policy, or 'specified' and in allowedList
                        globalsToReturnInResponse[key] = allCurrentGlobals[key];
                    }
                }
                if (errors.length > 0) {
                    returnProcessingError = "Error processing requested globals: " + errors.join(" ");
                    globalsToReturnInResponse = null; // Do not return partial data if there are errors
                } else if (Object.keys(globalsToReturnInResponse).length === 0 && requestedReturnSpec.length > 0 && policyType !== 'none') {
                    // This means an empty array of globals was requested, or requested globals didn't exist (already covered by 'does not exist' error)
                    // If no actual errors but nothing to return, it's not an error state per se, just empty result.
                }
            }
        } else {
            returnProcessingError = "Invalid 'return_globals' specification in event.context. Must be 'all' or an array of strings.";
        }
    }

    if (returnProcessingError) {
        return {
            statusCode: 400, // Bad Request due to issues with globals request
            body: JSON.stringify({
                error: 'Failed to return requested globals',
                details: returnProcessingError,
            }),
        };
    }

    const responsePayload = { message: 'Scripts completed successfully!' };
    if (globalsToReturnInResponse !== null) {
        responsePayload.returned_globals = globalsToReturnInResponse;
    }

    return {
      statusCode: 200,
      body: JSON.stringify(responsePayload),
    };
  } catch (err) {
    console.error('Error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Execution failed',
        details: err.message,
      }),
    };
  }
};