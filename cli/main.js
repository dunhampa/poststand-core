#!/usr/bin/env node

const { Command } = require('commander');
const runCollectionAction = require('./run-collection.js');
const runScriptAction = require('./run-script.js');
const program = new Command();

program
  .name('pstand')
  .description('CLI tool for managing PostStand function workflows')
  .version('1.0.0');

program
  .command('runCollection')
  .description('Run a full collection of scripts based on _collection_config.yaml')
  .option('--alone', 'Skip confirmation prompt and run non-interactively')
  .action(runCollectionAction);

program
  .command('runScript')
  .description('Run a single script from the _scripts directory')
  .argument('[script]', 'The name of the script to run')
  .option('--alone', 'Skip confirmation prompts and run non-interactively')
  .action(runScriptAction);

program.parseAsync(process.argv);