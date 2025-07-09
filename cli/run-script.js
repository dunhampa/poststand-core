#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const yaml = require('js-yaml');
const inquirer = require('inquirer');

async function findFunctionDetails(startPath) {
  let currentPath = path.resolve(startPath);
  while (true) {
    const configFilePath = path.join(currentPath, '_collection_config.yaml');
    const scriptsDir = path.join(currentPath, '_scripts');
    if (fs.existsSync(configFilePath) && fs.existsSync(scriptsDir) && fs.lstatSync(scriptsDir).isDirectory()) {
      const functionName = path.basename(currentPath);
      return {
        functionRoot: currentPath,
        functionName,
        configFilePath,
        scriptsDir,
      };
    }
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) { 
      return null;
    }
    currentPath = parentPath;
  }
}

async function updateYamlList(filePath, listKey, itemToAdd) {
  try {
    const configFileContent = fs.readFileSync(filePath, 'utf8');
    const config = yaml.load(configFileContent);

    if (!config) {
      console.error(`Error: Could not parse ${filePath}`);
      return false;
    }
    if (!config[listKey] || !Array.isArray(config[listKey])) {
      config[listKey] = [];
    }

    if (!config[listKey].includes(itemToAdd)) {
      const { confirmAdd } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmAdd',
          message: `Script '${itemToAdd}' is not in '${listKey}'. Add it?`,
          default: true,
        },
      ]);
      if (confirmAdd) {
        config[listKey].push(itemToAdd);
        fs.writeFileSync(filePath, yaml.dump(config), 'utf8');
        console.log(`Script '${itemToAdd}' added to '${listKey}' in ${path.basename(filePath)}.`);
        return true;
      } else {
        console.log(`Script '${itemToAdd}' not added to '${listKey}'.`);
        return false;
      }
    }
    return true; 
  } catch (error) {
    console.error(`Error updating ${filePath}:`, error);
    return false;
  }
}


async function main(script, options = {}) {
  try {
    const functionDetails = await findFunctionDetails(process.cwd());

    if (!functionDetails) {
      console.error('Error: Not inside a recognized function directory.');
      console.error('Make sure a "_collection_config.yaml" file and a "_scripts" directory exist in the current or a parent directory.');
      process.exit(1);
    }

    const { functionRoot, configFilePath, scriptsDir } = functionDetails;
    
    const runAlone = options.alone || process.argv.slice(2).includes('--alone');
    let scriptToRun = script;


    const availableScripts = fs.readdirSync(scriptsDir)
      .filter(file => fs.statSync(path.join(scriptsDir, file)).isFile() && file.endsWith('.js'));

    if (availableScripts.length === 0) {
      console.error(`No scripts found in ${scriptsDir}.`);
      process.exit(1);
    }

    if (scriptToRun) {
      if (!availableScripts.includes(scriptToRun)) {
        console.error(`Error: Script '${scriptToRun}' provided as argument not found in ${scriptsDir}.`);
        console.log('Available scripts:', availableScripts.join(', '));
        process.exit(1);
      }
    } else {
      const { selectedScript } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedScript',
          message: 'Select a script to run:',
          choices: availableScripts,
        },
      ]);
      scriptToRun = selectedScript;
    }
    
    const fullScriptPath = path.join(scriptsDir, scriptToRun);

    if (!fs.existsSync(fullScriptPath)) {
        console.error(`Error: Script file not found at ${fullScriptPath}`);
        process.exit(1);
    }
    
    if (!runAlone) {
      await updateYamlList(configFilePath, 'collection_order', scriptToRun);
      await updateYamlList(configFilePath, 'allowed_scripts', scriptToRun);
    }

    let confirmRun = false;
    if (runAlone) {
      confirmRun = true;
    } else {
      const result = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmRun',
          message: `Run the script '${scriptToRun}'?`,
          default: true,
        },
      ]);
      confirmRun = result.confirmRun;
    }

    if (confirmRun) {
      if (!runAlone) {
        const runCommandSuggestion = `npx pstand runScript ${scriptToRun} --alone`;
        console.log(`\nTo skip these prompts next time, run: ${runCommandSuggestion}\n`);
        console.log(`Executing: node ${path.join('_scripts', scriptToRun)} in ${functionRoot}\n`);
      }
      
      const child = spawn('node', [fullScriptPath], { cwd: functionRoot, stdio: 'inherit' });

      child.on('close', (code) => {
        if (code !== 0) {
          console.error(`\nScript '${scriptToRun}' failed with code ${code}`);
        } else {
          console.log(`\nScript '${scriptToRun}' completed successfully.`);
        }
        process.exit(code);
      });

      child.on('error', (err) => {
        console.error(`\nFailed to start script '${scriptToRun}'.`, err);
        process.exit(1);
      });
    } else {
      console.log('Execution cancelled.');
      process.exit(0);
    }

  } catch (error) {
    if (error.isTtyError) {
        console.error("Prompt rendering failed. Are you running in a compatible terminal?");
    } else {
        console.error('An unexpected error occurred:', error);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  const cliArgs = process.argv.slice(2);
  const scriptToRun = cliArgs.find(arg => !arg.startsWith('-'));
  const options = { alone: cliArgs.includes('--alone') };
  main(scriptToRun, options);
}

module.exports = main;