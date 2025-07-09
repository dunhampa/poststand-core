exports.main = async (event) => {
   const { runScriptsInOrder, globalSet } = require('poststand-core');
 
   // 1. Parse the JSON body from the request
   let body;
   try {
     body = JSON.parse(event.body || '{}');
   } catch (err) {
     return {
       statusCode: 400,
       body: JSON.stringify({ error: 'Invalid JSON in request body' }),
     };
   }
 
   // 2. For each key in the body, set a global variable
   for (const [key, value] of Object.entries(body)) {
     globalSet(key, value);
   }
 
   // 3. Define the scripts to run
   const scripts = [
     'scripts/script1.js',
     'scripts/script2.js',
     'scripts/script3.js',
     // etc...
   ];
 
   // 4. Execute the scripts
   try {
     await runScriptsInOrder(scripts);
   } catch (err) {
     console.error('Error running scripts:', err);
     return {
       statusCode: 500,
       body: JSON.stringify({ error: 'Script execution failed', details: err }),
     };
   }
 
   // 5. Return success
   return {
     statusCode: 200,
     body: JSON.stringify({ message: 'Scripts completed successfully!' }),
   };
 };