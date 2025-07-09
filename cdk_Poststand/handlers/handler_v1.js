const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const { runScriptsInOrder, globalSet, globalsClear } = require('poststand-core');

exports.main = async (event) => {
  // Parse incoming body
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON in request body' }),
    };
  }

  // Set global variables from the request
  for (const [key, value] of Object.entries(body)) {
    globalSet(key, value);
  }

  // Load _collection_config.yaml from the same directory
  // (the code bundle merges this handler + the scripts + the config)
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

  // Clear existing globals
  //globalsClear(); // we can't be doing this, we have to set stuff

  // Run the scripts
  const scripts = Array.isArray(config.scripts) ? config.scripts : [];
  try {
    await runScriptsInOrder(scripts, __dirname);
  } catch (err) {
    console.error('Error running scripts:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Script execution failed', details: err.message }),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Scripts completed successfully!' }),
  };
};
