// globalsMgmt.js
const fs   = require('fs');
const path = require('path');
const { isAWSLambda } = require('./utils.js');

function getGlobalsFilePath() {
  const inLambda = isAWSLambda();
  let dirPath;

  if (inLambda) {
    dirPath = process.env.LAMBDA_GLOBALS;
    if (!dirPath) {
      throw new Error(
        '[globalsMgmt] process.env.LAMBDA_GLOBALS is not set; cannot write globals'
      );
    }
  } else {
    const currentWorkingDirectory = process.cwd();
    if (path.basename(currentWorkingDirectory) === '_scripts') {
      dirPath = path.dirname(currentWorkingDirectory);
    } else {
      dirPath = currentWorkingDirectory;
    }
  }
  return path.join(dirPath, 'globals.json');
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
