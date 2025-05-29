// poststand-core/loadScriptOrder.js
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');


//console.log('Debug: I am in file:', __filename);
//console.log('Debug: My __dirname is:', __dirname);

function loadScriptOrder(scriptOrderFilename = '_collection_config.yaml', dirname = __dirname) {
  //console.log("scriptOrderPath", scriptOrderPath)
  const scriptOrderPath = path.join(dirname, scriptOrderFilename);
  console.log("scriptOrderPath", scriptOrderPath)
  // Check if the file exists
  if (!fs.existsSync(scriptOrderPath)) {
    throw new Error(`No "${scriptOrderFilename}" file found at: ${scriptOrderPath}`);
  }

  // Read and parse the YAML file
  const fileContents = fs.readFileSync(scriptOrderPath, 'utf8');
  const config = yaml.load(fileContents);

  // Get collection_order (with fallback to scripts for backward compatibility)
  const collectionOrder = config.collection_order || config.scripts;
  
  // Validate that the YAML has collection_order array
  if (!config || !Array.isArray(collectionOrder)) {
    throw new Error(`"${scriptOrderFilename}" is missing a valid "collection_order" array.`);
  }
  
  // Get allowed_scripts (default to collection_order if not specified)
  const allowedScripts = config.allowed_scripts || collectionOrder;
  
  if (!Array.isArray(allowedScripts)) {
    throw new Error(`"${scriptOrderFilename}" has invalid "allowed_scripts" (not an array).`);
  }

  // Return both arrays
  return {
    collectionOrder,
    allowedScripts
  };
}
module.exports = { loadScriptOrder };