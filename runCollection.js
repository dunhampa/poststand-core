// runCollection.js
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

// To this:
const { runScriptsInOrder } = require('./executor.js');
const { globalSet, globalsClear, isAWSLambda } = require('./globalMgmt.js');
/**
 * Shared function to run a collection of scripts
 * @param {Object} options Configuration options
 * @param {string} options.configPath Path to the collection config YAML (optional)
 * @param {Object} options.initialGlobals Initial globals to set (optional)
 * @param {boolean} options.clearGlobals Whether to clear globals before starting (default: !isAWSLambda())
 * @returns {Promise<Object>} Result object
 */
async function runCollection(options = {}) {
  const inLambda = isAWSLambda();
  const {
   configPath = inLambda 
     ? (process.env.LAMBDA_CONFIG_PATH || process.cwd() + '/_collection_config.yaml')
     : path.join(process.cwd(), '_collection_config.yaml'),
   initialGlobals = {},
   clearGlobals = !inLambda,
    } = options;

  // Optional clear
  if (clearGlobals) {
    globalsClear();
  }

  // Set any initial globals
  for (const [key, value] of Object.entries(initialGlobals)) {
    globalSet(key, value);
  }

  // Load collection config
  let config;
  try {
    const configFile = fs.readFileSync(configPath, 'utf8');
    config = yaml.load(configFile);
  } catch (err) {
    console.error(`Could not load config from ${configPath}:`, err);
    throw new Error(`Missing or invalid config file: ${err.message}`);
  }

  // Get script lists
  const collectionOrder = config.collection_order || config.scripts || [];
  const allowedScripts = config.allowed_scripts || collectionOrder || [];

  if (!Array.isArray(collectionOrder) || collectionOrder.length === 0) {
    throw new Error('No scripts defined in collection_order/scripts');
  }

  // Run scripts
  await runScriptsInOrder(collectionOrder, allowedScripts);
  
  return { success: true };
}

module.exports = { runCollection };