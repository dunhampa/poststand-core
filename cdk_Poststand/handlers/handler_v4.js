const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

// Import early so we can initialize the shared temp directory
const {
  runScriptsInOrder,
  globalSet,
  globalsClear,
} = require('poststand-core');
const { tmpdir } = require('os');

exports.main = async (event, context) => {

   console.log("Handler V3 baby")

  // 🔹 Step 0: Initialize TMP_GLOBALS_DIR before any globalSet/globalGet
  const requestId = context.awsRequestId;
  const timestamp = Date.now()
  const dirName = `${requestId}_${timestamp}`

  const tmpDirPath = path.join('/tmp', dirName)
  fs.mkdirSync(tmpDirPath, {recursive: true})

  process.env.LAMBDA_GLOBALS = tmpDirPath

  // 🔹 Step 1: Parse request body
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON in request body' }),
    };
  }

  console.log("Handler is running");

  // 🔹 Step 2: Set global variables from the request
  for (const [key, value] of Object.entries(body)) {
    globalSet(key, value);
    console.log(`Setting global: ${key} =`, value);
  }

  // 🔹 Step 3: Load collection config
  let config;
  try {
    const configPath = path.join(__dirname, '_collection_config.yaml');
    const configFile = fs.readFileSync(configPath, 'utf8');
    config = yaml.load(configFile);
  } catch (err) {
    console.error('Could not load _collection_config.yaml:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Missing or invalid config file' }),
    };
  }

  // 🔹 Step 4: Queue scripts from config
  const scripts = Array.isArray(config.scripts) ? config.scripts : [];
  globalSet('enabledScripts', scripts);

  // 🔹 Step 5: Execute scripts
  try {
    await runScriptsInOrder(scripts);
  } catch (err) {
    console.error('Error running scripts:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Script execution failed',
        details: err.message,
      }),
    };
  }

  // 🔹 Step 6: Respond success
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Scripts completed successfully!' }),
  };
};
