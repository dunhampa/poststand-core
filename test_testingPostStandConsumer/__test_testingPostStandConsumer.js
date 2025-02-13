const {runScriptsInOrder, loadScriptOrder, globalsClear} = require('poststand-core');

// Example of initializing variables or environment
process.env.NODE_ENV = 'production';
console.log('main.js is located at:', __dirname);
let scripts;
try {
  // loadScriptOrder takes the filename and directory from which to load.
  // If you don't pass dirname, it defaults to the file's own location inside the poststand package,
  // so be sure to specify the correct path in your usage:
  scripts = loadScriptOrder('_collection_config.yaml', __dirname);
} catch (err) {
  console.error("Not finding collection_config.yaml file in collection directory");
  process.exit(1);
}


globalsClear();
// Run the scripts in order
runScriptsInOrder(scripts)
  .then(() => {
    console.log('Scripts completed successfully in main.js');
  })
  .catch((err) => {
    console.error('Error running scripts:', err);
    process.exit(1);
  });
