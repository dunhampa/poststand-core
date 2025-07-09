// lambda_handler.js
const path = require('path');
const fs = require('fs');
const { runCollection, globalListAll }  = require('poststand-core');
const yaml = require('js-yaml');

exports.main = async (event, context) => {
  try {
    const requestId = context.awsRequestId;
    const timestamp = Date.now();
    const dirName = `${requestId}_${timestamp}`;
    const tmpDirPath = path.join('/tmp', dirName);
    fs.mkdirSync(tmpDirPath, {recursive: true});
    process.env.LAMBDA_GLOBALS = tmpDirPath;
   
    let jsonData; 

    if(event.httpMethod || (event.context && event.context["http-method"])){
      console.log("Invocation from API Gateway");
      try {
         jsonData = JSON.parse(event.body || '{}');
      } catch (e){
          return Promise.resolve({
              statusCode: 400,
              body: "Unable to parse event body. User provided info could be invalid. For instance, a missing comma in json.",
              isBase64Encoded: false
          });
      }
   } else {
      console.log("Invocation from other source (e.g., direct Lambda invoke)");
      jsonData = event; 
   }

    // Load collection config for input validation first
    process.env.LAMBDA_CONFIG_PATH = path.join(__dirname, '_collection_config.yaml');
    const configPath = process.env.LAMBDA_CONFIG_PATH;
    const configContent = fs.readFileSync(configPath, 'utf8');
    const collectionConfig = yaml.load(configContent);

    // Input globals validation
    const inputGlobalsConfig = collectionConfig.globalInputs || { policy: 'allowAll' };
    const inputPolicy = (inputGlobalsConfig.policy || 'allowAll').toLowerCase();
    const allowedInputs = inputGlobalsConfig.allowed || [];
    
    if (inputPolicy === 'specified') {
        const validationErrors = [];
        const allowedInputMap = {};
        allowedInputs.forEach(input => allowedInputMap[input.name] = input);

        for (const key in jsonData) {
            if (key === 'return_globals') continue; // Skip special key

            if (!allowedInputMap.hasOwnProperty(key)) {
                validationErrors.push(`Input global '${key}' is not allowed by the 'specified' policy.`);
                continue;
            }

            const spec = allowedInputMap[key];
            const value = jsonData[key];

            // Type checking
            if (spec.type) {
                let typeMatch = false;
                switch (spec.type.toLowerCase()) {
                    case 'string':
                        typeMatch = typeof value === 'string';
                        break;
                    case 'number':
                        typeMatch = typeof value === 'number';
                        break;
                    case 'boolean':
                        typeMatch = typeof value === 'boolean';
                        break;
                    case 'object':
                        typeMatch = typeof value === 'object' && value !== null && !Array.isArray(value);
                        break;
                    case 'array':
                        typeMatch = Array.isArray(value);
                        break;
                    default:
                        validationErrors.push(`Unknown type '${spec.type}' specified for input global '${key}'.`);
                        continue; // Skip further checks for this key
                }
                if (!typeMatch) {
                    validationErrors.push(`Input global '${key}' has incorrect type. Expected '${spec.type}', got '${Array.isArray(value) ? 'array' : typeof value}'.`);
                    continue; 
                }
            }

            // Regex validation for strings
            if (spec.type && spec.type.toLowerCase() === 'string' && spec.regex) {
                try {
                    const regex = new RegExp(spec.regex);
                    if (!regex.test(value)) {
                        validationErrors.push(`Input global '${key}' (value: "${value}") does not match regex pattern: ${spec.regex}`);
                    }
                } catch (e) {
                    validationErrors.push(`Invalid regex pattern '${spec.regex}' for input global '${key}': ${e.message}`);
                }
            }
        }
        
        // Check for missing required inputs if we want to enforce that in the future
        // For now, 'allowed' means they are permitted if present, not that they are required.
        // If a global defined in 'allowed' is not provided, it's not an error.

        if (validationErrors.length > 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: 'Input validation failed',
                    details: validationErrors,
                }),
                isBase64Encoded: false
            };
        }
    } else if (inputPolicy !== 'allowall') { // 'allowAll' is the default if policy is missing or invalid
        // This case handles an invalid policy string that isn't 'specified' or 'allowAll'
         return {
            statusCode: 400,
            body: JSON.stringify({
                error: 'Invalid configuration for globalInputs',
                details: `Policy '${inputGlobalsConfig.policy}' is not supported. Supported policies are 'allowAll' or 'specified'.`,
            }),
            isBase64Encoded: false
        };
    }
    // End of Input globals validation

    let rawRequestedReturnSpec = null; // Stores 'all', 'anyspecified', an array, or null

    if (jsonData && typeof jsonData === 'object' && jsonData !== null && jsonData.hasOwnProperty('return_globals')) {
        const tempSpec = jsonData.return_globals;
        if (typeof tempSpec === 'string') {
            const lowerSpec = tempSpec.toLowerCase();
            if (lowerSpec === 'all' || lowerSpec === 'anyspecified') {
                rawRequestedReturnSpec = lowerSpec;
            } else {
                 // Treat other strings as invalid for now, could be an array of one string.
                 // The Array.isArray check later will handle if it's a valid single-element array.
                 // If it's just a random string not 'all' or 'anyspecified', it will be caught by the later comprehensive check.
                 rawRequestedReturnSpec = tempSpec; // Keep original for array check
            }
        } else if (Array.isArray(tempSpec)) {
            rawRequestedReturnSpec = tempSpec;
        }
        
        // Validate the extracted spec
        if (rawRequestedReturnSpec !== null && !(typeof rawRequestedReturnSpec === 'string' && (rawRequestedReturnSpec === 'all' || rawRequestedReturnSpec === 'anyspecified')) && !Array.isArray(rawRequestedReturnSpec) ) {
            console.log("Invalid format for 'return_globals' in jsonData; expected 'all', 'anyspecified', or an array. Ignoring.", JSON.stringify(rawRequestedReturnSpec));
            rawRequestedReturnSpec = null; 
        } else if (rawRequestedReturnSpec !== null) {
            console.log('Found and extracted return_globals from jsonData (parsed body/event):', JSON.stringify(rawRequestedReturnSpec));
        }
        delete jsonData.return_globals; 
    }

    if (!rawRequestedReturnSpec && event.context && event.context.return_globals) {
        const contextReturnSpec = event.context.return_globals;
        if (typeof contextReturnSpec === 'string') {
            const lowerSpec = contextReturnSpec.toLowerCase();
            if (lowerSpec === 'all' || lowerSpec === 'anyspecified') {
                rawRequestedReturnSpec = lowerSpec;
            } else {
                rawRequestedReturnSpec = contextReturnSpec; // for array check
            }
        } else if (Array.isArray(contextReturnSpec)) {
            rawRequestedReturnSpec = contextReturnSpec;
        }

        if (rawRequestedReturnSpec !== null && !(typeof rawRequestedReturnSpec === 'string' && (rawRequestedReturnSpec === 'all' || rawRequestedReturnSpec === 'anyspecified')) && !Array.isArray(rawRequestedReturnSpec)) {
            console.log("Invalid format for 'return_globals' in event.context; expected 'all', 'anyspecified', or an array. Ignoring.", JSON.stringify(rawRequestedReturnSpec));
            rawRequestedReturnSpec = null; // Or keep previous if any? No, if context is invalid, it's invalid.
        } else if (rawRequestedReturnSpec !== null) {
             console.log('Found return_globals in event.context:', JSON.stringify(rawRequestedReturnSpec));
        }
    }
    
    await runCollection({
      initialGlobals: jsonData, 
      clearGlobals: false
    });

    const returnPolicyConfig = collectionConfig.returnable_globals || { policy: 'none' };
    let policyType = (returnPolicyConfig.policy || 'none').toLowerCase();
    
    if (policyType === 'any') {
        return {
            statusCode: 400,
            body: JSON.stringify({
                error: 'Invalid configuration for returnable_globals',
                details: "Policy 'any' is not supported. Supported policies are 'all', 'specified', or 'none'.",
            }),
        };
    }
    
    const allowedListFromConfig = Array.isArray(returnPolicyConfig.allowed) ? returnPolicyConfig.allowed : [];
    let finalRequestedSpec = rawRequestedReturnSpec; // This can be 'all', an array, or null.

    if (typeof rawRequestedReturnSpec === 'string' && rawRequestedReturnSpec === 'anyspecified') {
        console.log(`Resolving "anyspecified" to keys from config's allowed list: ${JSON.stringify(allowedListFromConfig)}`);
        finalRequestedSpec = [...allowedListFromConfig]; // Now finalRequestedSpec is an array or remains 'anyspecified' if allowedList is empty (will be treated as empty array)
        if (finalRequestedSpec.length === 0 && policyType !== 'none' && policyType !== 'all') { // for 'specified', requesting empty via 'anyspecified' is valid
             console.log("Warning: 'return_globals' was 'anyspecified' but the configuration's 'allowed' list is empty. No specific globals will be returned based on 'anyspecified'.");
        }
    }

    let globalsToReturnInResponse = null;
    let returnProcessingError = null;

    if (finalRequestedSpec !== null) { // Only process if there's a request for globals
        const allCurrentGlobals = globalListAll(); 

        if (typeof finalRequestedSpec === 'string' && finalRequestedSpec === 'all') { // Must be 'all' here
            if (policyType === 'all') {
                globalsToReturnInResponse = { ...allCurrentGlobals };
            } else if (policyType === 'specified') {
                returnProcessingError = "Configuration policy is 'specified' and does not allow returning all globals. Please request specific global keys or change the policy.";
            } else { // 'none'
                returnProcessingError = `Configuration policy is '${policyType}' and does not allow returning all globals.`;
            }
        } else if (Array.isArray(finalRequestedSpec)) {
            globalsToReturnInResponse = {}; 
            let hasFatalErrorForArrayRequest = false;
            const existenceErrorMessages = [];
            const permissionWarningMessages = []; 

            if (policyType === 'none') {
                if (finalRequestedSpec.length > 0) { 
                    returnProcessingError = "Configuration policy is 'none'; it does not allow returning any specified globals.";
                }
                // If finalRequestedSpec is empty (e.g. from 'anyspecified' with empty 'allowed' list), no error.
            } else { // 'all' or 'specified'
                if (finalRequestedSpec.length === 0 && typeof rawRequestedReturnSpec === 'string' && rawRequestedReturnSpec === 'anyspecified'){
                    // This means "anyspecified" was requested, and the allowed list was empty.
                    // This is a valid scenario, resulting in an empty set of returned_globals.
                    console.log("'anyspecified' request resulted in an empty list of keys to return (config.allowed is empty).");
                }

                for (const key of finalRequestedSpec) {
                    if (!allCurrentGlobals.hasOwnProperty(key)) {
                        existenceErrorMessages.push(`Requested global '${key}' does not exist.`);
                        hasFatalErrorForArrayRequest = true;
                    } else { 
                        if (policyType === 'all') {
                            globalsToReturnInResponse[key] = allCurrentGlobals[key];
                        } else if (policyType === 'specified') {
                            if (allowedListFromConfig.includes(key)) {
                                globalsToReturnInResponse[key] = allCurrentGlobals[key];
                            } else {
                                permissionWarningMessages.push(`Requested global '${key}' exists but is not in the allowed list for 'specified' policy and was not returned.`);
                            }
                        }
                    }
                }

                if (hasFatalErrorForArrayRequest) {
                    returnProcessingError = "Error processing requested globals: " + existenceErrorMessages.join(" ");
                    globalsToReturnInResponse = null; 
                } else {
                    if (permissionWarningMessages.length > 0) {
                        console.log("Informational messages during global processing: " + permissionWarningMessages.join(" "));
                        if (Object.keys(globalsToReturnInResponse).length === 0 && finalRequestedSpec.length > 0) {
                            returnProcessingError = "None of the requested and existing globals could be returned due to policy restrictions. Details: " + permissionWarningMessages.join(" ");
                            globalsToReturnInResponse = null;
                        }
                    }
                }
            }
        } else if (finalRequestedSpec !== null) { // Should not happen if validation of rawRequestedReturnSpec is correct
             returnProcessingError = `Invalid 'return_globals' specification in event.context: ${JSON.stringify(finalRequestedSpec)}. Must be 'all', 'anyspecified', or an array of strings.`;
        }
    }


    if (returnProcessingError) {
        return {
            statusCode: 400, 
            body: JSON.stringify({
                error: 'Failed to return requested globals',
                details: returnProcessingError,
            }),
        };
    }

    const responsePayload = { message: 'Scripts completed successfully!' };
    if (globalsToReturnInResponse !== null) { // An empty object {} is a valid response
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
        stack: err.stack 
      }),
    };
  }
};