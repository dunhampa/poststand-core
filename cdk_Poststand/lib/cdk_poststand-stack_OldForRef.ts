import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as path from 'path';
import {Duration} from 'aws-cdk-lib';
import {Size} from 'aws-cdk-lib';

export class CdkPoststandStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // 1. Define the layer
    const postStandLayerV1 = new lambda.LayerVersion(this, 'PoststandCoreLayer', {
      code: lambda.Code.fromAsset(path.join(__dirname, 'poststand-layer-v1')),
      description: 'Lambda Layer containing poststand-core library',
      compatibleRuntimes: [
        lambda.Runtime.NODEJS_16_X,
        lambda.Runtime.NODEJS_18_X,
        lambda.Runtime.NODEJS_20_X,
      ],
      layerVersionName: 'PoststandCoreLayer_v1',
    });

    // 2. Define the Lambda function with updated retry attempts and timeout
    const postStandLambdaV1 = new lambda.Function(this, 'postStandLambdaV1', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler.main',
      code: lambda.Code.fromAsset(path.join(__dirname, 'poststand-lambda-v1')),
      layers: [postStandLayerV1],
      environment: {
        NODE_ENV: 'production',
      },
      timeout: Duration.seconds(900), // Set timeout to 15 minutes
      retryAttempts: 0, // Set retry attempts to 0
      memorySize: 256, // Default memory size in MB
      ephemeralStorageSize: Size.mebibytes(1024), // Default ephemeral storage in MiB
    });

    // 3. Set up API Gateway
    const api = new apigw.RestApi(this, 'postStandApi', {
      restApiName: 'poststand',
    });

    // Add a POST method
    const lambdaIntegration = new apigw.LambdaIntegration(postStandLambdaV1);
    const resource = api.root.addResource('poststand');
    resource.addMethod('POST', lambdaIntegration);

    // Uncomment this section if you're using HTTP API from v2 APIs
    // import * as apigwv2 from '@aws-cdk/aws-apigatewayv2-alpha';
    // import * as integrations from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
    // ...
  }
}
