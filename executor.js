// executor.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const {
  isAWSLambda,
  globalGet,
  globalSet,
} = require('./globalMgmt.js'); // import your globalMgmt methods

//-----------------------------------------------
// Helper: remove a directory and all contents
//-----------------------------------------------
function removeDirectoryRecursively(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  fs.readdirSync(dirPath).forEach((file) => {
    const curPath = path.join(dirPath, file);
    if (fs.lstatSync(curPath).isDirectory()) {
      removeDirectoryRecursively(curPath);
    } else {
      fs.unlinkSync(curPath);
    }
  });
  fs.rmdirSync(dirPath);
}

//-----------------------------------------------
// Helper: cleanup old subfolders in /tmp
//   - e.g. subfolders with a name <something>-<timestamp>
//   - if older than 30 minutes, remove them
//-----------------------------------------------
function cleanupStaleTmpDirectories(tmpRoot) {
  const now = Date.now();
  const THIRTY_MINUTES = 30 * 60 * 1000;

  if (!fs.existsSync(tmpRoot)) {
    return;
  }

  const items = fs.readdirSync(tmpRoot);
  items.forEach((item) => {
    const fullPath = path.join(tmpRoot, item);

    if (fs.statSync(fullPath).isDirectory()) {
      // parse time from item (the part after the last dash, maybe)
      const parts = item.split('-');
      const maybeDateStr = parts[parts.length - 1];
      const folderTime = new Date(maybeDateStr).getTime();
      if (!isNaN(folderTime)) {
        const age = now - folderTime;
        if (age > THIRTY_MINUTES) {
          console.log(`[executor] Removing stale folder: ${fullPath} (age ${age} ms)`);
          removeDirectoryRecursively(fullPath);
        }
      }
    }
  });
}

//-----------------------------------------------
// Helper: log /tmp usage
//-----------------------------------------------
function logTmpUsage() {
  // For Linux/Mac, we can use `du -sh /tmp`
  if (os.platform() === 'linux' || os.platform() === 'darwin') {
    const du = spawn('du', ['-sh', '/tmp']);
    du.stdout.on('data', (data) => {
      console.log(`[executor] /tmp usage: ${data.toString().trim()}`);
    });
    du.stderr.on('data', (err) => {
      console.error(`[executor] Error measuring /tmp usage: ${err}`);
    });
  } else {
    console.log('[executor] /tmp usage logging is not implemented on this OS.');
  }
}

//-----------------------------------------------
// Main runner: runs scripts in sequential order
//-----------------------------------------------
async function runScriptsInOrder(scripts) {
  // Decide if we are in Lambda
  const inLambda = isAWSLambda();
  let tmpNamespaceDir = null;

  if (inLambda) {
    console.log('[executor] Detected Lambda environment.');

    // 1) Cleanup old subfolders
    cleanupStaleTmpDirectories('/tmp');

    // 2) Log /tmp usage
    logTmpUsage();

    // 3) Create a unique subfolder in /tmp, e.g. /tmp/<requestId>-<timestamp>
    const requestId = process.env.AWS_REQUEST_ID || 'unknownRequest';
    const timestamp = new Date().toISOString();
    tmpNamespaceDir = path.join('/tmp', `${requestId}-${timestamp}`);

    fs.mkdirSync(tmpNamespaceDir, { recursive: true });
    console.log('[executor] Created tmp namespace dir:', tmpNamespaceDir);
  } else {
    console.log('[executor] Not in Lambda, using local approach.');
  }

  return new Promise((resolve, reject) => {
    let index = 0;

    function runNextScript() {
      if (index >= scripts.length) {
        console.log('[executor] All scripts executed successfully.');

        // If in Lambda, cleanup our tmpNamespaceDir
        if (inLambda && tmpNamespaceDir) {
          console.log('[executor] Cleaning up tmp directory after run:', tmpNamespaceDir);
          removeDirectoryRecursively(tmpNamespaceDir);
        }
        return resolve();
      }

      const script = scripts[index];
      console.log(`[executor] Executing: ${script}`);

      // Build childEnv, preserving existing environment vars
      const childEnv = { ...process.env };
      // If in Lambda, point TMP_GLOBALS_DIR to our namespace
      if (inLambda && tmpNamespaceDir) {
        childEnv.TMP_GLOBALS_DIR = tmpNamespaceDir;
      }

      // Spawn the script as a child process
      const child = spawn('node', [script], {
        stdio: 'inherit',
        env: childEnv,
      });

      // Handle script completion
      child.on('close', (code) => {
        if (code !== 0) {
          console.error(`[executor] Script ${script} exited with error code ${code}.`);

          // Cleanup on error if in Lambda
          if (inLambda && tmpNamespaceDir) {
            console.log('[executor] Cleaning up tmp directory on error:', tmpNamespaceDir);
            removeDirectoryRecursively(tmpNamespaceDir);
          }
          return reject(new Error(`Script ${script} failed with code ${code}`));
        } else {
          // On success, see if the script queued additional scripts
          const queued = globalGet('nextScripts') || [];
          if (queued.length > 0) {
            console.log(`[executor] Script ${script} queued ${queued.length} new script(s):`, queued);

            // Insert them after the current script index
            scripts.splice(index + 1, 0, ...queued);

            // Clear out 'nextScripts' so they aren't repeatedly inserted
            globalSet('nextScripts', []);
          }

          // Move to the next script
          index++;
          runNextScript();
        }
      });
    }

    runNextScript();
  });
}

//-----------------------------------------------
// Exports
//-----------------------------------------------
module.exports = {
  runScriptsInOrder,
};
