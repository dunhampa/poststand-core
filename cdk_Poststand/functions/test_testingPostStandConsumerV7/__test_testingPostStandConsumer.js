const {runScriptsInOrder, loadScriptOrder, globalsClear} = require('poststand-core');

// Example of initializing variables or environment
process.env.NODE_ENV = 'production';
console.log('main.js is located at:', __dirname);

let collectionOrder, allowedScripts;

try {
  ({ collectionOrder, allowedScripts } = loadScriptOrder('_collection_config.yaml', __dirname));
} catch (err) {
  console.error("Not finding collection_config.yaml file in collection directory", err);
  process.exit(1);
}

globalsClear();
// Pass BOTH arguments to runScriptsInOrder
runScriptsInOrder(collectionOrder, allowedScripts)
  .then(() => {
    console.log('Scripts completed successfully in main.js');
  })
  .catch((err) => {
    console.error('Error running scripts:', err);
    process.exit(1);
  });