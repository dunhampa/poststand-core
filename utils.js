// utils.js
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Checks if the current environment is an AWS Lambda function.
 * @returns {boolean}
 */
function isAWSLambda() {
  return Boolean(
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.AWS_EXECUTION_ENV ||
    process.env.LAMBDA_TASK_ROOT
  );
}

/**
 * Finds and parses the nearest _collection_config.yaml file by searching
 * upward from a starting directory.
 * @param {string} startDir The directory to start searching from.
 * @returns {{config: Object, configPath: string|null}}
 */
function findCollectionConfig(startDir) {
  // In Lambda, allow an absolute path override via environment variable.
  if (isAWSLambda() && process.env.LAMBDA_CONFIG_PATH) {
    const configPath = process.env.LAMBDA_CONFIG_PATH;
    if (fs.existsSync(configPath)) {
      try {
        const fileContents = fs.readFileSync(configPath, 'utf8');
        const parsed = yaml.load(fileContents) || {};
        return { config: parsed, configPath };
      } catch (e) {
        // Use original console.warn since logger may not be available here
        console.warn(
          '[utils] Could not parse _collection_config.yaml from LAMBDA_CONFIG_PATH at ',
          configPath,
          e
        );
        return { config: {}, configPath };
      }
    }
  }

  let currentDir = startDir || process.cwd();
  const root = path.parse(currentDir).root;

  while (true) {
    const configPath = path.join(currentDir, '_collection_config.yaml');
    if (fs.existsSync(configPath)) {
      try {
        const fileContents = fs.readFileSync(configPath, 'utf8');
        const parsed = yaml.load(fileContents) || {};
        return { config: parsed, configPath };
      } catch (e) {
        // Use original console.warn since logger may not be available here
        console.warn(
          '[utils] Could not parse _collection_config.yaml at ',
          configPath,
          e
        );
        return { config: {}, configPath };
      }
    }

    if (currentDir === root) {
      break;
    }
    currentDir = path.join(currentDir, '..');
  }

  return { config: {}, configPath: null };
}

module.exports = {
  isAWSLambda,
  findCollectionConfig
};