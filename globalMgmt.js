// globalsMgmt.js
const fs   = require('fs');
const path = require('path');

function isAWSLambda() {
  return Boolean(
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.AWS_EXECUTION_ENV   ||
    process.env.LAMBDA_TASK_ROOT
  );
}

function getGlobalsFilePath() {
  const inLambda = isAWSLambda();
  const dir = inLambda
    ? process.env.LAMBDA_GLOBALS       // must be set by your handler
    : process.cwd();

  if (inLambda && !dir) {
    throw new Error(
      '[globalsMgmt] process.env.LAMBDA_GLOBALS is not set; cannot write globals'
    );
  }

  return path.join(dir, 'globals.json');
}

function loadGlobals() {
  const file = getGlobalsFilePath();
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error('[globalsMgmt] load error:', err);
    return {};
  }
}

function saveGlobals(obj) {
  const file = getGlobalsFilePath();
  try {
    fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8');
  } catch (err) {
    console.error('[globalsMgmt] save error:', err);
  }
}

function globalSet(key, value) {
  const g = loadGlobals();
  g[key] = value;
  saveGlobals(g);
}

function globalGet(key) {
  return loadGlobals()[key];
}

function globalsClear() {
  saveGlobals({});
}

function globalListAll() {
  return loadGlobals();
}

function queueNextScript(name) {
  const g = loadGlobals();
  g.nextScripts = g.nextScripts || [];
  g.nextScripts.push(name);
  saveGlobals(g);
}

module.exports = {
  globalSet,
  globalGet,
  globalsClear,
  globalListAll,
  queueNextScript,
  isAWSLambda,
};
