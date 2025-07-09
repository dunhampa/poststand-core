// logger.js

/**
 * Generates a prelude script to be injected into user scripts
 * to override the global console object for conditional logging in AWS Lambda.
 * @param {string} utilsPath - The absolute path to the utils.js file.
 */
function getPrelude(utilsPath) {
  // This prelude will be injected into spawned scripts.
  // It overrides console.log and console.warn to be conditional on a `verbose`
  // flag in the collection's config when running in AWS Lambda.
  // It also adds a `console.always()` for unconditional logging.

  // We need to escape backslashes for Windows compatibility when injecting the path.
  const escapedUtilsPath = utilsPath.replace(/\\/g, '\\\\');

  const prelude = `
const { isAWSLambda, findCollectionConfig } = require('${escapedUtilsPath}');

const inLambda = isAWSLambda();

// findCollectionConfig is robust and returns an empty config if not found,
// so we don't need to wrap this in a try-catch.
const { config } = findCollectionConfig(process.cwd());
const isVerbose = config && config.verbose === true;

const originalLog = console.log;
const originalWarn = console.warn;

if (inLambda) {
  console.log = (...args) => {
    if (isVerbose) {
      originalLog.apply(console, args);
    }
  };

  console.warn = (...args) => {
    if (isVerbose) {
      originalWarn.apply(console, args);
    }
  };
}

// Add a console.always for unconditional logging.
console.always = (...args) => {
    originalLog.apply(console, args);
};
`;
  return prelude;
}


module.exports = {
  getPrelude,
};