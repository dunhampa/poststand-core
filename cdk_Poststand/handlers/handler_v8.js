// lambda_handler.js
const path = require('path');
const fs = require('fs');
const { runCollection }  = require('poststand-core');

exports.main = async (event, context) => {
  try {
    // Lambda-specific: Create unique temp directory
    const requestId = context.awsRequestId;
    const timestamp = Date.now();
    const dirName = `${requestId}_${timestamp}`;
    const tmpDirPath = path.join('/tmp', dirName);
    fs.mkdirSync(tmpDirPath, {recursive: true});
    process.env.LAMBDA_GLOBALS = tmpDirPath;
   
    //let body = {}
    // Parse request body
    if(event.httpMethod || event.context?event.context["http-method"]:false){
      console.log("Invocation from API Gateway")
      
      try {
         body = JSON.parse(event.body || '{}');  
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
      jsonData=event
   }

    process.env.LAMBDA_CONFIG_PATH = path.join(__dirname, '_collection_config.yaml');

    // Run collection with request body as initial globals
    await runCollection({
      initialGlobals: jsonData, //body,
      clearGlobals: false // Don't clear globals in Lambda
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Scripts completed successfully!' }),
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