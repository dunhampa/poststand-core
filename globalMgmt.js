//globalMgmt.js
require('dotenv').config(); // optional if you use .env locally

const fs = require('fs');
const path = require('path');

//-----------------------------------------------------------------
// Detect if we are running in AWS Lambda
//-----------------------------------------------------------------
function isAWSLambda() {
  return Boolean(
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.AWS_EXECUTION_ENV ||
    process.env.LAMBDA_TASK_ROOT
  );
}

//-----------------------------------------------------------------
// Determine if we store in local file or in /tmp namespace
//-----------------------------------------------------------------
const inLambda = isAWSLambda();

// This environment variable is set by executor.js so each script
// knows *which* /tmp folder to use for ephemeral globals.
const tmpGlobalsDir = process.env.TMP_GLOBALS_DIR || '/tmp';

// If not in Lambda, we store globals in a local JSON file
// (just like your original approach).
let runLocal = !inLambda;

//-----------------------------------------------------------------
// File-based storage (for local dev or non-Lambda environment)
//-----------------------------------------------------------------
const localGlobalsFilePath = path.join(process.cwd(), 'globals.json');

function loadLocalGlobals() {
  if (!fs.existsSync(localGlobalsFilePath)) {
    return {};
  }
  try {
    const data = fs.readFileSync(localGlobalsFilePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('[globalsMgmt] Error reading local globals file:', err);
    return {};
  }
}

function saveLocalGlobals(globals) {
  try {
    fs.writeFileSync(
      localGlobalsFilePath,
      JSON.stringify(globals, null, 2),
      'utf8'
    );
  } catch (err) {
    console.error('[globalsMgmt] Error writing local globals file:', err);
  }
}

//-----------------------------------------------------------------
// /tmp-based storage (for Lambda)
// We namespace by a subdirectory in /tmp, e.g. /tmp/<uniqueID>/globals.json
//-----------------------------------------------------------------
function getTmpGlobalsFilePath() {
  // We assume executor.js sets TMP_GLOBALS_DIR to something unique like:
  //   /tmp/<awsRequestId>-<timestamp>
  return path.join(tmpGlobalsDir, 'globals.json');
}

function loadTmpGlobals() {
  const tmpPath = getTmpGlobalsFilePath();
  if (!fs.existsSync(tmpPath)) {
    return {};
  }
  try {
    const data = fs.readFileSync(tmpPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('[globalsMgmt] Error reading tmp globals file:', err);
    return {};
  }
}

function saveTmpGlobals(globals) {
  const tmpPath = getTmpGlobalsFilePath();
  try {
    fs.writeFileSync(
      tmpPath,
      JSON.stringify(globals, null, 2),
      'utf8'
    );
  } catch (err) {
    console.error('[globalsMgmt] Error writing tmp globals file:', err);
  }
}

//-----------------------------------------------------------------
// Decide which approach to use
//-----------------------------------------------------------------
let loadGlobals, saveGlobals;
if (runLocal) {
  console.log('[globalsMgmt] Using LOCAL file-based storage at:', localGlobalsFilePath);
  loadGlobals = loadLocalGlobals;
  saveGlobals = saveLocalGlobals;
} else {
  console.log('[globalsMgmt] Using /tmp-based storage in:', tmpGlobalsDir);
  loadGlobals = loadTmpGlobals;
  saveGlobals = saveTmpGlobals;
}

//-----------------------------------------------------------------
// Exported Functions
//-----------------------------------------------------------------
function globalSet(key, value) {
  const globals = loadGlobals();
  globals[key] = value;
  saveGlobals(globals);
}

function globalGet(key) {
  const globals = loadGlobals();
  return globals[key];
}

function globalsClear() {
  saveGlobals({});
}

function queueNextScript(scriptName) {
  // Load existing "nextScripts" array (if it exists)
  const globals = loadGlobals();
  const queued = globals.nextScripts || [];

  // Push the new script name
  queued.push(scriptName);

  // Save it back
  globals.nextScripts = queued;
  saveGlobals(globals);
}


function globalListAll() {
  // Return *all* global key-value pairs
  return loadGlobals();
}


module.exports = {
  globalSet,
  globalGet,
  globalsClear,
  isAWSLambda,
  globalListAll,
  queueNextScript,
};
