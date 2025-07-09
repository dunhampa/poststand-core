const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const { isAWSLambda } = require('./utils.js');
const { getPrelude } = require('./logger.js');
const {
  globalGet,
  globalSet,
} = require('./globalMgmt.js');

let cachedTmpNamespaceDir = null;

//-----------------------------------------------
// Initialize temp global state (run once)
//-----------------------------------------------
function initializeGlobalSpace() {
  // Reset cache on each Lambda invocation
  if (isAWSLambda()) {
    cachedTmpNamespaceDir = null;
  } else if (cachedTmpNamespaceDir) {
    return cachedTmpNamespaceDir;
  }

  if (isAWSLambda()) {
    console.log('[executor] Detected Lambda environment.');
    logTmpUsage();
    cleanupStaleTmpDirectories('/tmp');
    
    // Require LAMBDA_GLOBALS to be set by the Lambda handler
    if (process.env.LAMBDA_GLOBALS) {
      console.log(`[executor] Using Lambda directory: ${process.env.LAMBDA_GLOBALS}`);
      cachedTmpNamespaceDir = process.env.LAMBDA_GLOBALS;
    } else {
      // No fallback - throw an error
      throw new Error('[executor] CRITICAL ERROR: process.env.LAMBDA_GLOBALS must be set by the Lambda handler');
    }
  } else {
    console.log('[executor] Not in Lambda, using local approach.');
  }

  return cachedTmpNamespaceDir;
}

//-----------------------------------------------
// Cleanup stale /tmp directories older than 30 min
//-----------------------------------------------
function cleanupStaleTmpDirectories(tmpRoot) {
  const now = Date.now();
  const THIRTY_MINUTES = 30 * 60 * 1000;
  if (!fs.existsSync(tmpRoot)) return;
  
  console.log(`[executor] Scanning ${tmpRoot} for stale folders (older than 30 min)`);

  for (const item of fs.readdirSync(tmpRoot)) {
    const fullPath = path.join(tmpRoot, item);
    if (!fs.statSync(fullPath).isDirectory()) continue;
    
    console.log(`[executor] Checking directory: ${item}`);

    // Try to extract timestamp from both formats:
    let folderTime;
    
    if (item.includes('_')) {
      // Handler format: requestId_timestamp
      const parts = item.split('_');
      const maybeTimestamp = parts[parts.length - 1];
      folderTime = parseInt(maybeTimestamp, 10);
      console.log(`[executor] Found requestId_timestamp format: ${item}, timestamp: ${maybeTimestamp}, parsed: ${folderTime}`);
    } else if (item.includes('-')) {
      // Executor format: requestId-timestamp (ISO)
      const parts = item.split('-');
      const maybeIsoDate = parts[parts.length - 1];
      folderTime = new Date(maybeIsoDate).getTime();
      console.log(`[executor] Found requestId-timestamp format: ${item}, isoDate: ${maybeIsoDate}, parsed: ${folderTime}`);
    } else {
      // Unrecognized format
      console.log(`[executor] Skipping unrecognized format: ${item}`);
      continue;
    }

    if (!isNaN(folderTime)) {
      const ageMinutes = Math.floor((now - folderTime) / (60 * 1000));
      console.log(`[executor] Folder age: ${ageMinutes} minutes`);
      
      if (now - folderTime > THIRTY_MINUTES) {
        console.log(`[executor] Removing stale folder: ${fullPath}`);
        removeDirectoryRecursively(fullPath);
      } else {
        console.log(`[executor] Keeping recent folder: ${fullPath}`);
      }
    } else {
      console.log(`[executor] Cannot parse timestamp for: ${item}`);
    }
  }
}

//-----------------------------------------------
// Helper: remove directory and contents
//-----------------------------------------------
function removeDirectoryRecursively(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  for (const file of fs.readdirSync(dirPath)) {
    const curPath = path.join(dirPath, file);
    if (fs.lstatSync(curPath).isDirectory()) {
      removeDirectoryRecursively(curPath);
    } else {
      fs.unlinkSync(curPath);
    }
  }
  fs.rmdirSync(dirPath);
}

//-----------------------------------------------
// Log /tmp usage (Linux/Mac only)
//-----------------------------------------------
function logTmpUsage() {
  if (['linux', 'darwin'].includes(os.platform())) {
    const du = spawn('du', ['-sh', '/tmp']);
    du.stdout.on('data', data => {
      console.log(`[executor] /tmp usage: ${data.toString().trim()}`);
    });
    du.stderr.on('data', err => {
      console.error(`[executor] Error measuring /tmp usage: ${err}`);
    });
  }
}

//-----------------------------------------------
//  CSV run-tracker helpers
//-----------------------------------------------
let runnerCsvPath = null;          // full path to _collection_runner.csv
let runLog        = [];            // in-memory rows we keep rewriting

function initRunnerCsv(inLambda, tmpDir) {
  runnerCsvPath = inLambda
    ? path.join(tmpDir, '_collection_runner.csv')
    : path.join(process.cwd(), '_collection_runner.csv');

  runLog = [];                                        // start fresh every run
  fs.writeFileSync(
    runnerCsvPath,
    'script,status,durationMs\n',                     // header row
    'utf8'
  );
  console.log('[executor] Initialised run tracker at', runnerCsvPath);
}

function UpdateRunnerCsv() {
  if (!runnerCsvPath) {
    console.log('[executor] WARNING: runnerCsvPath is not set, cannot update CSV');
    return;
  }
  
  //console.log(`[executor] Updating runner CSV at ${runnerCsvPath} with ${runLog.length} entries`);
  //console.log('[executor] Current log entries:', JSON.stringify(runLog));
  
  const csvBody = runLog
    .map(r => `${r.script},${r.status},${r.durationMs ?? ''}`)
    .join('\n');
  
  try {
    fs.writeFileSync(
      runnerCsvPath,
      'script,status,durationMs\n' + csvBody + '\n',
      'utf8'
    );
    //console.log('[executor] Successfully wrote to CSV file');
  } catch (err) {
    console.error('[executor] Error writing to CSV file:', err);
  }
}

//-----------------------------------------------
// Main runner: runs scripts in sequential order
//-----------------------------------------------
async function runScriptsInOrder(scripts, allowedScripts = []) {
  const inLambda = isAWSLambda();
  const tmpNamespaceDir = initializeGlobalSpace();
  
  // Check if allowedScripts is provided
  if (!allowedScripts || allowedScripts.length === 0) {
    console.error('[executor] ERROR: No allowed_scripts provided. No scripts will be executed.');
    return Promise.resolve(); // Exit early with resolved promise
  }
  
  // Convert allowedScripts to a Set for faster lookups
  const scriptWhitelist = new Set(allowedScripts);
  
  initRunnerCsv(inLambda, tmpNamespaceDir);

  return new Promise((resolve, reject) => {
    let index = 0;

    function runNextScript() {
      if (index >= scripts.length) {
        console.log('[executor] All scripts executed successfully.');
        // Intentionally removed cleanup from here. Handler will do it.
        // if (inLambda && tmpNamespaceDir) {
        //   console.log('[executor] Cleaning up tmp directory after run:', tmpNamespaceDir);
        //   removeDirectoryRecursively(tmpNamespaceDir); 
        // }
        return resolve();
      }

      const scriptName = scripts[index]; // This is the bare name, e.g., "script1.js"
      
      // Check if script is allowed to run (using the bare name)
      if (!scriptWhitelist.has(scriptName)) {
        console.log(`[executor] SKIPPING script ${scriptName} (not in allowed_scripts list)`);
        index++;
        return runNextScript();
      }
      
      console.log(`-----------[${scriptName}]---------------------------\n`);

      // Construct the actual path to the script within the _scripts directory
      const scriptPath = path.join('_scripts', scriptName);

      // Record "Executing" state (using the bare name for logging consistency with config)
      const entry = { script: scriptName, status: 'Executing', durationMs: '' };
      runLog.push(entry);
      UpdateRunnerCsv();
      const startTime = Date.now();

      const childEnv = { ...process.env };
      if (inLambda && tmpNamespaceDir) {
        childEnv.TMP_GLOBALS_DIR = tmpNamespaceDir;
      }

      // We will now always inject the prelude to make console.always available.
      // The prelude itself is conditional, so it's safe to run everywhere.
      // We resolve the absolute path to utils.js to make the require call robust.
      const utilsPath = require.resolve('./utils.js');
      const prelude = getPrelude(utilsPath);
      
      // Determine the correct directory for the prelude file.
      const preludeDir = tmpNamespaceDir || os.tmpdir();
      const preludeFile = path.join(preludeDir, `prelude-${Date.now()}.js`);
      
      fs.writeFileSync(preludeFile, prelude);
      
      const nodeArgs = ['--require', preludeFile, scriptPath];

      const child = spawn('node', nodeArgs, { // Use the constructed nodeArgs here
        stdio: 'inherit',
        env: childEnv,
      });

      child.on('close', (code) => {
        // Clean up the prelude file
        if (preludeFile) {
          try {
            fs.unlinkSync(preludeFile);
          } catch (err) {
            console.error(`[executor] Could not clean up prelude file ${preludeFile}:`, err);
          }
        }
        
        // Update entry status and duration
        const duration = `${Date.now() - startTime}ms`;
        entry.status = code === 0 ? 'Done' : 'Error';
        entry.durationMs = duration;
        
        console.log("\n");
        UpdateRunnerCsv();

        if (code !== 0) {
          console.error(`[executor] Script ${scriptName} (path: ${scriptPath}) exited with error code ${code}.`);
          if (inLambda && tmpNamespaceDir) {
            console.log('[executor] Cleaning up tmp directory on error:', tmpNamespaceDir);
            removeDirectoryRecursively(tmpNamespaceDir);
          }
          return reject(new Error(`Script ${scriptName} (path: ${scriptPath}) failed with code ${code}`));
        } else {
          const queued = globalGet('nextScripts') || [];
          if (queued.length > 0) {
            console.log(`[executor] Script ${scriptName} queued ${queued.length} new script(s):`, queued);
            
            // Filter queued scripts against the whitelist (using bare names)
            const validQueued = queued.filter(queuedScriptName => {
              const isAllowed = scriptWhitelist.has(queuedScriptName);
              if (!isAllowed) {
                console.log(`[executor] Skipping queued script ${queuedScriptName} (not in allowed_scripts list)`);
              }
              return isAllowed;
            });
            
            scripts.splice(index + 1, 0, ...validQueued);
            globalSet('nextScripts', []);
          }
          index++;
          runNextScript();
        }
      });
    }

    runNextScript();
  });
}

module.exports = {
  runScriptsInOrder,
  initializeGlobalSpace,
  removeDirectoryRecursively,
};