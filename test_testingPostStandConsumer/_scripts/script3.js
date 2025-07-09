const { globalSet, globalGet, globalsClear, getSecret } = require('poststand-core');

globalSet("script3Save", ("Script 3 save" + " " + globalGet("script3Save")));

(async () => {

    // Example: Retrieve the entire secret named "secretOne"
    const secretOneFull = await getSecret('secretOne');
    console.log('secretOne FULL:', secretOneFull);


   await new Promise(resolve => setTimeout(resolve, 1000));
   globalSet("script3SaveTwo", "Script 3 save" + " " + globalGet("script3TwoSave"))
   console.log("Script 3: First log after 9 seconds.");


    // Example: Retrieve a nested key inside "secretTwo", e.g. secretTwo.dbCredentials.username
    const secretUser = await getSecret('secretTwo.dbCredentials.username');
    //console.log('secretTwo.dbCredentials.username:', secretUser);



   await new Promise(resolve => setTimeout(resolve, 1000));
   console.log("Script 3: Second log after 5 seconds.");
   globalSet("booleanTest", true)
 })();

 console.log("hollering return",globalGet("holler"))