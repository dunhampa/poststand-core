import { Stack, StackProps, Duration, Size } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as path from 'path';
import * as fs from 'fs';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as yaml from 'js-yaml';

interface PostStandConfig {
  handlerFile?: string;
  scripts?: string[];
  layers?: string[];
  timeoutDurationInSecs?: number;
  memorySize?: number;
  ephemeralStorageSize?: number;
  retryAttempts?: number;
}

export class CdkPoststandStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // 1. Define your layer(s)
    const postStandLayerV1 = new lambda.LayerVersion(this, 'PoststandCoreLayerV1', {
      code: lambda.Code.fromAsset(path.join(__dirname, '../layers/poststand-layer-v1')),
      description: 'Lambda Layer containing poststand-core library (v1)',
      compatibleRuntimes: [lambda.Runtime.NODEJS_16_X, lambda.Runtime.NODEJS_18_X, lambda.Runtime.NODEJS_20_X],
      layerVersionName: 'poststand-core-layer-v1',
    });

    const layerMap: Record<string, lambda.ILayerVersion> = {
      'poststand-core-layer-v1': postStandLayerV1,
      // If more layers exist, define them here
    };

    // 2. Create an API Gateway
    const api = new apigw.RestApi(this, 'PostStandApi', {
      restApiName: 'poststand',
    });

    // 3. Read subdirectories in functions/
    const functionsDir = path.join(__dirname, '../functions');
    const functionFolders = fs.readdirSync(functionsDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    // 4. For each folder, parse config, copy files + chosen handler, then create the Lambda
    functionFolders.forEach((folderName) => {
      const folderPath = path.join(functionsDir, folderName);
      const configPath = path.join(folderPath, '_collection_config.yaml');
      if (!fs.existsSync(configPath)) {
        console.warn(`Skipping folder "${folderName}" - no _collection_config.yaml found`);
        return;
      }

      // Parse the YAML config
      const configFile = fs.readFileSync(configPath, 'utf8');
      const config = yaml.load(configFile) as PostStandConfig;

      // Which handler do we copy from the top-level handlers/ dir?
      // Default to "handler_v1.js" if not specified
      const handlerFile = config.handlerFile || 'handler_v1.js';

      // The place in your top-level repo where handlers live
      const handlersDir = path.join(__dirname, '../handlers');
      const handlerSourcePath = path.join(handlersDir, handlerFile);
      if (!fs.existsSync(handlerSourcePath)) {
        console.warn(`Handler file "${handlerFile}" not found in ${handlersDir} for folder "${folderName}"`);
        return;
      }

      // 5. Create a temp directory for bundling
      // Example: /tmp/myStack-<folderName>-random
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `cdk-${folderName}-`));

      // Copy the entire function folder into tempDir
      // (except we will rely on fromAsset exclude for node_modules, etc.)
      fse.copySync(folderPath, tempDir);

      // Also copy the selected handler from handlersDir => tempDir
      // e.g. place it there as "handler.js" or keep original name "handler_v1.js"
      // Usually you keep the same name, but let's keep it the same for clarity:
      fse.copySync(handlerSourcePath, path.join(tempDir, handlerFile));

      // Now our merged code is in tempDir

      // Fallback defaults from config
      const memorySize = config.memorySize && !isNaN(config.memorySize) ? config.memorySize : 256;
      const ephemeralStorage = config.ephemeralStorageSize && !isNaN(config.ephemeralStorageSize)
        ? config.ephemeralStorageSize
        : 1024;
      const retryAttempts = config.retryAttempts && !isNaN(config.retryAttempts)
        ? config.retryAttempts
        : 0;
      const timeoutSecs = config.timeoutDurationInSecs && !isNaN(config.timeoutDurationInSecs)
        ? config.timeoutDurationInSecs
        : 900; // 15 min

      // Construct the actual AWS Lambda Handler string:
      // If we keep the file name "handler_v1.js", then it's "handler_v1.main"
      const handlerName = path.parse(handlerFile).name + '.main';

      // 6. Create the Lambda
      const functionName = folderName; // or derive something else
      const lambdaFn = new lambda.Function(this, functionName, {
        functionName,
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: handlerName,
        code: lambda.Code.fromAsset(tempDir, {
          // Exclude local stuff so we rely on the layer
          exclude: [
            'node_modules',
            'package.json',
            'package-lock.json',
            'globals.json',
          ],
        }),
        layers: (config.layers || []).map((l) => {
          const layerObj = layerMap[l];
          if (!layerObj) {
            throw new Error(`Layer "${l}" not found in layerMap. Check config or add layer definition.`);
          }
          return layerObj;
        }),
        environment: {
          NODE_ENV: 'production',
        },
        timeout: Duration.seconds(timeoutSecs),
        retryAttempts,
        memorySize,
        ephemeralStorageSize: Size.mebibytes(ephemeralStorage),
      });

      // 7. Create a Resource + POST method
      const integration = new apigw.LambdaIntegration(lambdaFn);
      const resource = api.root.addResource(folderName);
      resource.addMethod('POST', integration);
    });
  }
}
