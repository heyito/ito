import { Construct } from 'constructs'
import { Duration, RemovalPolicy } from 'aws-cdk-lib'
import { Bucket, BlockPublicAccess, EventType } from 'aws-cdk-lib/aws-s3'
import { Domain } from 'aws-cdk-lib/aws-opensearchservice'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { SqsDestination } from 'aws-cdk-lib/aws-s3-notifications'
import { PolicyStatement } from 'aws-cdk-lib/aws-iam'
import { Queue } from 'aws-cdk-lib/aws-sqs'
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources'

export interface TimingConfig {
  stageName: string
  opensearchDomain: Domain
  accountId: string
  region: string
}

export interface TimingResources {
  timingBucket: Bucket
  timingMergerLambda: NodejsFunction
  timingQueue: Queue
  timingDLQ: Queue
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

  // Create DLQ for failed timing events
  const timingDLQ = new Queue(scope, 'ItoTimingDLQ', {
    queueName: `${config.stageName}-ito-timing-dlq`,
    retentionPeriod: Duration.days(14), // Keep failed messages for 14 days
    removalPolicy: isDev ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
  })

  // Create main queue for timing events with DLQ
  const timingQueue = new Queue(scope, 'ItoTimingQueue', {
    queueName: `${config.stageName}-ito-timing-queue`,
    visibilityTimeout: Duration.seconds(60), // Should be >= Lambda timeout
    retentionPeriod: Duration.days(7),
    deadLetterQueue: {
      queue: timingDLQ,
      maxReceiveCount: 3, // Retry failed messages 3 times before sending to DLQ
    },
    removalPolicy: isDev ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
  })

  // Create timing merger Lambda
  const timingMergerLambda = new NodejsFunction(scope, 'ItoTimingMerger', {
    entry: 'lambdas/timing-merger.ts',
    handler: 'handler',
    environment: {
      OPENSEARCH_ENDPOINT: config.opensearchDomain.domainEndpoint,
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

  // Configure S3 to send notifications to SQS on object creation
  timingBucket.addEventNotification(
    EventType.OBJECT_CREATED,
    new SqsDestination(timingQueue),
    {
      // Filter for timing data objects (client/ or server/ prefix)
      prefix: '',
      suffix: '.json',
    },
  )

  // Configure Lambda to consume from SQS
  timingMergerLambda.addEventSource(
    new SqsEventSource(timingQueue, {
      batchSize: 10, // Process up to 10 messages at once
      maxBatchingWindow: Duration.seconds(5), // Wait up to 5s to collect batch
      reportBatchItemFailures: true, // Enable partial batch failure reporting
    }),
  )

  return {
    timingBucket,
    timingMergerLambda,
    timingQueue,
    timingDLQ,
  }
}
