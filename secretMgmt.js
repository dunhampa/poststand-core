// secretMgmt.js
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const {
   SecretsManagerClient,
   GetSecretValueCommand
 } = require ('@aws-sdk/client-secrets-manager');

// We'll re-use your logic for detecting Lambda:
function isAWSLambda() {
  return Boolean(
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.AWS_EXECUTION_ENV ||
    process.env.LAMBDA_TASK_ROOT
  );
}

// 1. Determine if we are in Lambda or not.
const inLambda = isAWSLambda();

// 2. A helper to read the nearest _collection_config.yaml from the caller's directory.
//    - Adjust logic if needed to find exactly the correct folder.
function findCollectionConfig(startDir) {
  // In your structure, the caller is `test_testingPostStandConsumer/`.
  // We assume the user runs `node ...` from within that directory,
  // or from the root.  Adjust the search logic as needed.

  let currentDir = startDir || process.cwd();
  const root = path.parse(currentDir).root;  // e.g. "/" or "C:\\"

  while (true) {
    const configPath = path.join(currentDir, '_collection_config.yaml');
    if (fs.existsSync(configPath)) {
      try {
        const fileContents = fs.readFileSync(configPath, 'utf8');
        const parsed = yaml.load(fileContents) || {};
        return { config: parsed, configPath };
      } catch (e) {
        console.warn(
          '[secretMgmt] Could not parse _collection_config.yaml at ',
          configPath,
          e
        );
        return { config: {}, configPath };
      }
    }

    if (currentDir === root) {
      // We reached the top of the file system
      break;
    }
    // Move one directory up
    currentDir = path.join(currentDir, '..');
  }

  // If not found, return empty
  return { config: {}, configPath: null };
}

// 3. A helper to parse dot-path string
function getValueFromDotPath(obj, dotPath) {
  // e.g. dotPath = "stringIndexOne.stringIndexDeeper.deeperStill"
  const parts = dotPath.split('.');
  let current = obj;
  for (let p of parts) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[p];
  }
  return current;
}

/**
 * getSecret(secretPath: string)
 * ----------------------------------
 * e.g. `secretOne` or `secretOne.someJsonKey.innerKey`
 */
async function getSecret(secretPath) {
  if (!secretPath || typeof secretPath !== 'string') {
    console.warn('[secretMgmt] getSecret called without valid secretPath');
    return undefined;
  }

  // The top-level secret name is everything before the first dot
  let [ secretName, ...subPathArr ] = secretPath.split('.');
  const subPath = subPathArr.join('.'); // Remainder after the first dot

  // 1) Determine if local or in Lambda
  //    - If in Lambda => use AWS Secrets Manager
  //    - If local => check _collection_config.yaml for userLocalSecrets
  let { config } = findCollectionConfig(); // you might pass process.cwd() or another directory
  const secretsArray = config.secrets || [];  // the "secrets:" section in YAML
  const useLocalSecrets = config.userLocalSecrets === true;

  // 2) Warn if secret not in config.secrets
  if (!secretsArray.includes(secretName)) {
    console.warn(
      `[secretMgmt] WARNING: Secret "${secretName}" not found in 'secrets:' key of _collection_config.yaml.`
    );
  }

  let secretValueRaw;

  // Decide local-file vs. AWS
  if (inLambda) {
    // Always AWS in Lambda
    secretValueRaw = await fetchSecretFromAWS(secretName);
  } else {
    // Local environment
    if (useLocalSecrets) {
      secretValueRaw = fetchSecretFromLocalFile(secretName);
    } else {
      secretValueRaw = await fetchSecretFromAWS(secretName);
    }
  }

  if (secretValueRaw === undefined || secretValueRaw === null) {
    console.warn(
      `[secretMgmt] WARNING: Secret "${secretName}" not found or file/secret is empty.`
    );
    return undefined;
  }

  // 3) If secretValueRaw is JSON, parse it. If not valid JSON, treat as string.
  let secretObj;
  try {
    secretObj = JSON.parse(secretValueRaw);
  } catch (e) {
    // Not JSON, treat as a raw string.
    secretObj = secretValueRaw;
  }

  // If there's no further dot notation, return the entire object/string
  if (!subPath) {
    return secretObj;
  }

  // If the secret is NOT an object (i.e. it's a plain string),
  // we can't index into it. Return undefined + warn
  if (typeof secretObj !== 'object' || secretObj === null) {
    console.warn(
      `[secretMgmt] WARNING: Secret "${secretName}" is a plain string; cannot lookup sub-path "${subPath}".`
    );
    return undefined;
  }

  // 4) Traverse deeper with dot path
  const finalVal = getValueFromDotPath(secretObj, subPath);
  if (finalVal === undefined) {
    console.warn(
      `[secretMgmt] WARNING: Secret "${secretName}" is missing sub-path "${subPath}".`
    );
  }

  return finalVal;
}


/**
 * fetchSecretFromLocalFile(secretName: string): string|undefined
 *
 * Reads a local file: ../.secrets/do_not_git/<secretName>
 * from one level above the consumer function's directory.
 * 
 * The example below assumes that your script is called from 
 * the consumer directory (test_testingPostStandConsumer),
 * and that .secrets/do_not_git is a sibling of that directory.
 * 
 * Adjust the relative path logic if your structure is different.
 */
function fetchSecretFromLocalFile(secretName) {
  // E.g. if CWD = test_testingPostStandConsumer
  // we want: ../.secrets/do_not_git/secretName
  const upOne = path.join(process.cwd(), '..');  // go up from consumer
  const secretsDir = path.join(upOne, '.secrets', 'do_not_git');
  const secretFilePath = path.join(secretsDir, secretName);

  if (!fs.existsSync(secretFilePath)) {
    console.warn(`[secretMgmt] WARNING: Local secret file not found: ${secretFilePath}`);
    return undefined;
  }

  try {
    const raw = fs.readFileSync(secretFilePath, 'utf8');
    return raw.trim();
  } catch (err) {
    console.warn('[secretMgmt] ERROR reading local secret file:', err);
    return undefined;
  }
}


/**
 * fetchSecretFromAWS(secretName: string): Promise<string|undefined>
 *
 * Uses AWS Secrets Manager to get the secret. If found, returns the
 * "SecretString" property. If "SecretBinary" is used, you can parse
 * or handle accordingly.
 */
async function fetchSecretFromAWS(secretName) {
   console.log("I'm HEREEEEEEEE")
   // You may specify region here or rely on default environment config.
   const client = new SecretsManagerClient({
     region: process.env.AWS_REGION || 'us-east-1'
   });
 
   try {
     const command = new GetSecretValueCommand({ SecretId: secretName });
     const data = await client.send(command);
     console.log("SECRET TEST PRINT REMOVE ME")
     console.log(data)
 
     if (data.SecretString) {
       return data.SecretString;
     } else if (data.SecretBinary) {
       const buff = Buffer.from(data.SecretBinary, 'base64');
       return buff.toString('utf-8');
     }
     return undefined;
 
   } catch (err) {
     console.warn(`[secretMgmt] ERROR reading secret "${secretName}" from AWS:`, err);
     return undefined;
   }
 }

// Export the main function
module.exports = {
  getSecret
};
