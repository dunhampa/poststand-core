// poststand-core/loadScriptOrder.js
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');


//console.log('Debug: I am in file:', __filename);
//console.log('Debug: My __dirname is:', __dirname);

function loadScriptOrder(scriptOrderFilename = '_script_order.yaml', dirname = __dirname) {
  const scriptOrderPath = path.join(dirname, scriptOrderFilename);
  //console.log('Debug: Checking for script order file at:', scriptOrderPath);


  // Check if the file exists
  if (!fs.existsSync(scriptOrderPath)) {
    throw new Error(`No "${scriptOrderFilename}" file found at: ${scriptOrderPath}`);
  }

  // Read and parse the YAML file
  const fileContents = fs.readFileSync(scriptOrderPath, 'utf8');
  const config = yaml.load(fileContents);

  // Validate that the YAML has a scripts array
  if (!config || !Array.isArray(config.scripts)) {
    throw new Error(`"${scriptOrderFilename}" is missing a valid "scripts" array.`);
  }

  // Return the scripts
  return config.scripts;
}

module.exports = { loadScriptOrder };
