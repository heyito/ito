import { Construct } from 'constructs'
import { Duration, RemovalPolicy } from 'aws-cdk-lib'
import { Bucket, BlockPublicAccess, EventType } from 'aws-cdk-lib/aws-s3'
import { Domain } from 'aws-cdk-lib/aws-opensearchservice'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { LambdaDestination } from 'aws-cdk-lib/aws-s3-notifications'
import { PolicyStatement } from 'aws-cdk-lib/aws-iam'

export interface TimingConfig {
  stageName: string
  opensearchDomain: Domain
  accountId: string
  region: string
}

export interface TimingResources {
  timingBucket: Bucket
  timingMergerLambda: NodejsFunction
}

export function createTimingInfrastructure(
  scope: Construct,
  config: TimingConfig,
): TimingResources {
  const isDev = config.stageName === 'dev'

  // Create S3 bucket for raw timing data
  const timingBucket = new Bucket(scope, 'ItoTimingDataBucket', {
    bucketName: `${config.stageName}-${config.accountId}-${config.region}-ito-timing-data`,
    removalPolicy: isDev ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
    blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    enforceSSL: true,
    versioned: false, // Don't need versioning for timing data
    lifecycleRules: [
      {
        // Auto-delete raw timing data after 7 days (it's in OpenSearch by then)
        expiration: Duration.days(7),
        enabled: true,
      },
    ],
  })

  // Create timing merger Lambda
  const timingMergerLambda = new NodejsFunction(scope, 'ItoTimingMerger', {
    entry: 'lambdas/timing-merger.ts',
    handler: 'handler',
    environment: {
      OPENSEARCH_ENDPOINT: config.opensearchDomain.domainEndpoint,
      OPENSEARCH_INDEX: 'ito-timing-analytics',
      STAGE: config.stageName,
    },
    timeout: Duration.seconds(30),
    memorySize: 512, // Give it enough memory for OpenSearch queries
  })

  // Grant Lambda permissions to read from S3
  timingBucket.grantRead(timingMergerLambda)

  // Grant Lambda permissions to read/write OpenSearch
  config.opensearchDomain.grantReadWrite(timingMergerLambda)

  // Add explicit policy for OpenSearch domain actions (needed for index operations)
  timingMergerLambda.addToRolePolicy(
    new PolicyStatement({
      actions: [
        'es:ESHttpGet',
        'es:ESHttpPut',
        'es:ESHttpPost',
        'es:ESHttpHead',
      ],
      resources: [
        config.opensearchDomain.domainArn,
        `${config.opensearchDomain.domainArn}/*`,
      ],
    }),
  )

  // Configure S3 to trigger Lambda on object creation
  timingBucket.addEventNotification(
    EventType.OBJECT_CREATED,
    new LambdaDestination(timingMergerLambda),
    {
      // Filter for timing data objects (client/ or server/ prefix)
      prefix: '',
      suffix: '.json',
    },
  )

  return {
    timingBucket,
    timingMergerLambda,
  }
}
