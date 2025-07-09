// __test_testingPostStandConsumer.js
//const { runCollection } = require('../runCollection');
const {runCollection} = require('poststand-core');


console.log('Starting collection runner at:', process.cwd());
runCollection({
  clearGlobals: true // Always clear globals locally
})
  .then(() => {
    console.log('Scripts completed successfully in main.js');
  })
  .catch((err) => {
    console.error('Error running scripts:', err);
    process.exit(1);
  });



