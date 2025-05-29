import { Stack, StackProps, Duration, Size } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as path from 'path';
import * as fs from 'fs';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as yaml from 'js-yaml';
import * as iam from 'aws-cdk-lib/aws-iam';

interface PostStandConfig {
  handlerFile?: string;
  scripts?: string[];
  layers?: string[];
  timeoutDurationInSecs?: number;
  memorySize?: number;
  ephemeralStorageSize?: number;
  retryAttempts?: number;
  secrets?: string[]; // <--- NEW
  includeNodeModules?: boolean;
}

export class CdkPoststandStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // 1. Dynamically discover and define layers
    const layersDir = path.join(__dirname, '../layers');
    const layerFolders = fs.readdirSync(layersDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory() && dirent.name.startsWith('poststand-layer-'))
      .map((dirent) => dirent.name);

    const layerMap: Record<string, lambda.ILayerVersion> = {};

    layerFolders.forEach((layerFolder) => {
      const parts = layerFolder.split('-');
      const version = parts[parts.length - 1]; // Get the last part which should be v1, v2, etc.
      
      if (!version || !version.startsWith('v')) {
        console.warn(`Skipping invalid layer folder name: ${layerFolder}. Expected format: poststand-layer-vX`);
        return;
      }

      const layerName = `poststand-core-layer-${version}`;
      
      layerMap[layerName] = new lambda.LayerVersion(this, `PoststandCoreLayer${version.toUpperCase()}`, {
        code: lambda.Code.fromAsset(path.join(layersDir, layerFolder)),
        description: `Lambda Layer containing poststand-core library (${version})`,
        compatibleRuntimes: [
          lambda.Runtime.NODEJS_16_X,
          lambda.Runtime.NODEJS_18_X,
          lambda.Runtime.NODEJS_20_X,
        ],
        layerVersionName: layerName,
      });
    });

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
      const handlerFile = config.handlerFile || 'handler_v1.js';

      // The place in your top-level repo where handlers live
      const handlersDir = path.join(__dirname, '../handlers');
      const handlerSourcePath = path.join(handlersDir, handlerFile);
      if (!fs.existsSync(handlerSourcePath)) {
        console.warn(`Handler file "${handlerFile}" not found in ${handlersDir} for folder "${folderName}"`);
        return;
      }

      // 5. Create a temp directory for bundling
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `cdk-${folderName}-`));

      // Copy the entire function folder into tempDir
      fse.copySync(folderPath, tempDir);

      // Also copy the selected handler from handlersDir => tempDir
      fse.copySync(handlerSourcePath, path.join(tempDir, handlerFile));

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
      const handlerName = path.parse(handlerFile).name + '.main';

      /* ------------------------------------------------------------
      * Prepare asset exclusion list
      * using includesNodeModules: true in config allows bundling of node
      * ---------------------------------------------------------- */
      const assetExcludes = ['globals.json'];

      if (!config.includeNodeModules) {
        assetExcludes.unshift('node_modules','package.json', 'package-lock.json', );
      }
  
      // 6. Create the Lambda
      const functionName = folderName; // or derive something else
      const lambdaFn = new lambda.Function(this, functionName, {
        functionName,
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: handlerName,
        code: lambda.Code.fromAsset(tempDir, { exclude: assetExcludes }),
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

      // 7. Grant Lambda permission to read specified secrets
      if (config.secrets && config.secrets.length > 0) {
        for (const secretName of config.secrets) {
          // Construct the resource ARN for the secret; 
          // adjust pattern to your naming convention
          const secretArn = `arn:aws:secretsmanager:${this.region}:${this.account}:secret:${secretName}*`;

          lambdaFn.addToRolePolicy(
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['secretsmanager:GetSecretValue'],
              resources: [secretArn],
            })
          );
        }
      }

      // 8. Create a Resource + POST method
      const integration = new apigw.LambdaIntegration(lambdaFn);
      const resource = api.root.addResource(folderName);
      resource.addMethod('POST', integration);
    });
  }
}
