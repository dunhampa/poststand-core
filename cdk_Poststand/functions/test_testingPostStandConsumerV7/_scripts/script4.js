(async () => {
   console.log("About to throw an error in script4.js");
   await new Promise(resolve => setTimeout(resolve, 1000));
   throw new Error("This is an intentional error in script4.js");
})();
