// File: /Users/peterdunham/00_Git/cdk_Poststand/link-layer-modules.js
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const projectRoot = process.cwd();

function findCollectionDirectories(startPath) {
    const directories = [];
    const entries = fs.readdirSync(startPath, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) {
            const fullPath = path.join(startPath, entry.name);
            if (fs.existsSync(path.join(fullPath, '_collection_config.yaml'))) {
                directories.push(fullPath);
            }
        }
    }
    return directories;
}

function processCollectionDirectory(collectionDir) {
    console.log(`\nProcessing collection: ${path.relative(projectRoot, collectionDir)}`);
    const configPath = path.join(collectionDir, '_collection_config.yaml');

    if (!fs.existsSync(configPath)) {
        console.warn(`  Skipping: _collection_config.yaml not found in ${collectionDir}`);
        return;
    }

    let collectionConfig;
    try {
        const configContent = fs.readFileSync(configPath, 'utf8');
        collectionConfig = yaml.load(configContent);
    } catch (err) {
        console.error(`  Error reading or parsing ${configPath}:`, err);
        return;
    }

    const layerNames = collectionConfig.layers || [];
    if (layerNames.length === 0) {
        console.log("  No layers specified in config. Skipping symlink creation.");
        return;
    }
    
    // We will try to link to the node_modules of the first valid layer.
    // Lambda merges modules from all layers, but for local dev,
    // linking to the primary one providing core dependencies is often sufficient.
    let targetLayerNodeModulesPath = null;
    for (const layerName of layerNames) {
        const potentialPath = path.join(projectRoot, 'layers', layerName, 'nodejs', 'node_modules');
        if (fs.existsSync(potentialPath) && fs.lstatSync(potentialPath).isDirectory()) {
            targetLayerNodeModulesPath = potentialPath;
            console.log(`  Found target layer node_modules: ${path.relative(projectRoot, targetLayerNodeModulesPath)}`);
            break; 
        } else {
            const altPotentialPath = path.join(projectRoot, 'layers', layerName, 'nodejs');
            if (fs.existsSync(altPotentialPath) && fs.lstatSync(altPotentialPath).isDirectory() && fs.existsSync(path.join(altPotentialPath, 'node_modules'))) {
                 targetLayerNodeModulesPath = path.join(altPotentialPath, 'node_modules');
                 console.log(`  Found target layer node_modules: ${path.relative(projectRoot, targetLayerNodeModulesPath)}`);
                 break;
            }
            console.log(`  Layer node_modules not found at ${path.relative(projectRoot, potentialPath)} or ${path.join(path.relative(projectRoot, altPotentialPath), 'node_modules')}`);
        }
    }

    if (!targetLayerNodeModulesPath) {
        console.warn(`  Warning: No valid layer node_modules found for layers: ${layerNames.join(', ')}. Cannot create symlink.`);
        return;
    }

    const symlinkPath = path.join(collectionDir, 'node_modules');

    try {
        // Remove existing symlink or directory if it exists
        if (fs.existsSync(symlinkPath) || fs.lstatSync(symlinkPath, {throwIfNoEntry: false})) {
            const stats = fs.lstatSync(symlinkPath); // Use lstat to check if it's a symlink itself
            if (stats.isSymbolicLink() || stats.isDirectory()) {
                console.log(`  Removing existing ${stats.isSymbolicLink() ? 'symlink' : 'directory'} at ${path.relative(projectRoot, symlinkPath)}`);
                if (stats.isDirectory() && !stats.isSymbolicLink()){ // only rmdir if it's a real directory
                    fs.rmSync(symlinkPath, { recursive: true, force: true });
                } else { // it's a symlink or file
                     fs.unlinkSync(symlinkPath);
                }
            } else {
                 console.log(`  An item exists at ${path.relative(projectRoot, symlinkPath)} but it's not a symlink or directory. Skipping removal and symlink creation.`);
                 return;
            }
        }
    } catch (err) {
        if (err.code !== 'ENOENT') { // Ignore "not found" errors for removal
             console.error(`  Error removing existing ${symlinkPath}:`, err);
             return;
        }
    }
    
    try {
        // Create the symlink. Note: target path should be absolute for reliability,
        // or relative from the symlink's location to the target.
        // For simplicity and clarity, using absolute path for target.
        // fs.symlinkSync(targetLayerNodeModulesPath, symlinkPath, 'junction'); // 'junction' for Windows, 'dir' for others
        // To make it more portable, calculate relative path for symlink target
        const relativeTargetLayerPath = path.relative(collectionDir, targetLayerNodeModulesPath);
        fs.symlinkSync(relativeTargetLayerPath, symlinkPath, process.platform === "win32" ? "junction" : "dir");

        console.log(`  Successfully created symlink: ${path.relative(projectRoot, symlinkPath)} -> ${relativeTargetLayerPath}`);
    } catch (err) {
        console.error(`  Error creating symlink from ${symlinkPath} to ${targetLayerNodeModulesPath}:`, err);
        console.error("  On Windows, you might need to run this script with Administrator privileges or enable Developer Mode.");
    }
}

function main() {
    let collectionDirsToProcess = process.argv.slice(2);

    if (collectionDirsToProcess.length === 0) {
        console.log("No specific collection directories provided. Scanning 'functions/' directory...");
        const functionsPath = path.join(projectRoot, 'functions');
        if (fs.existsSync(functionsPath)) {
            collectionDirsToProcess = findCollectionDirectories(functionsPath);
        } else {
            console.error("Error: 'functions/' directory not found. Please provide paths to collection directories.");
            process.exit(1);
        }
        if (collectionDirsToProcess.length === 0) {
             console.log("No collection directories with _collection_config.yaml found in 'functions/'.");
        }
    } else {
        collectionDirsToProcess = collectionDirsToProcess.map(p => path.resolve(projectRoot, p));
    }
    
    if (collectionDirsToProcess.length > 0) {
        console.log(`Project root identified as: ${projectRoot}`);
        collectionDirsToProcess.forEach(processCollectionDirectory);
        console.log("\nFinished processing all specified collection directories.");
    } else {
        console.log("No collection directories to process.");
    }
    
    console.log("\nReminder: Add 'functions/**/node_modules/' to your .gitignore file if you haven't already.");
}

main();