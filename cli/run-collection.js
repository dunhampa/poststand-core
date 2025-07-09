#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const inquirer = require('inquirer');
const { runCollection } = require('../index.js');

async function findFunctionDetails(startPath) {
  let currentPath = path.resolve(startPath);
  while (true) {
    const configFilePath = path.join(currentPath, '_collection_config.yaml');
    if (fs.existsSync(configFilePath)) {
      const functionName = path.basename(currentPath);
      return {
        functionRoot: currentPath,
        functionName,
        configFilePath,
      };
    }
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) { // Reached filesystem root
      return null;
    }
    currentPath = parentPath;
  }
}

async function main(options = {}) {
  try {
    const functionDetails = await findFunctionDetails(process.cwd());

    if (!functionDetails) {
      console.error('Error: Not inside a recognized function directory.');
      console.error('Make sure a "_collection_config.yaml" file exists in the current or parent directory.');
      process.exit(1);
    }

    const { functionRoot, functionName, configFilePath } = functionDetails;

    if (!fs.existsSync(configFilePath)) {
      console.error(`Error: Configuration file not found at ${configFilePath}`);
      process.exit(1);
    }

    const configFileContent = fs.readFileSync(configFilePath, 'utf8');
    const config = yaml.load(configFileContent);

    if (!config || !config.collection_order || !config.allowed_scripts) {
      console.error(`Error: Invalid _collection_config.yaml. It must contain 'collection_order' and 'allowed_scripts' arrays.`);
      process.exit(1);
    }

    const collectionOrder = config.collection_order || [];
    const allowedScripts = new Set(config.allowed_scripts || []);

    console.log(`Collection execution plan for '${functionName}':\n`);
    console.log('Scripts from collection_order:');

    const scriptsToDisplay = collectionOrder.map(script => {
      if (allowedScripts.has(script)) {
        return `  - ${script}`;
      } else {
        return `  - ${script} (BYPASSED, not in allowed_scripts)`;
      }
    });
    scriptsToDisplay.forEach(line => console.log(line));
    console.log('');

    const allowedNotInOrder = [...allowedScripts].filter(script => !collectionOrder.includes(script));

    if (allowedNotInOrder.length > 0) {
      console.log('Allowed scripts not in collection_order:');
      console.log(`  ${allowedNotInOrder.join(', ')}`);
      console.log('');
    }

    const skipPrompt = options.alone || process.argv.includes('--alone');
    let proceed = false;

    if (skipPrompt) {
      proceed = true;
    } else {
      const result = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message: 'Proceed with execution?',
          default: true,
        },
      ]);
      proceed = result.proceed;
    }

    if (proceed) {
      console.log(`\nExecuting collection for '${functionName}' in ${functionRoot}\n`);
      
      process.chdir(functionRoot);

      await runCollection({
        clearGlobals: true, 
      });

      console.log('\nExecution completed successfully.');
      process.exit(0);

    } else {
      console.log('Execution cancelled.');
      process.exit(0);
    }

  } catch (error) {
    console.error('An unexpected error occurred:', error);
    process.exit(1);
  }
}

// This allows the script to be called directly for testing, but it's meant to be imported by main.js
if (require.main === module) {
  main();
}

module.exports = main;