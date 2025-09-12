import { Construct } from 'constructs'
import { Stack, Duration } from 'aws-cdk-lib'
import { CfnSubscriptionFilter, ILogGroup } from 'aws-cdk-lib/aws-logs'
import { CfnDeliveryStream } from 'aws-cdk-lib/aws-kinesisfirehose'
import { Bucket } from 'aws-cdk-lib/aws-s3'
import { Domain } from 'aws-cdk-lib/aws-opensearchservice'
import {
  Role as IamRole,
  IRole,
  ServicePrincipal,
  Policy,
  PolicyStatement,
} from 'aws-cdk-lib/aws-iam'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import * as cr from 'aws-cdk-lib/custom-resources'

export interface FirehoseConfig {
  stageName: string
  opensearchDomain: Domain
  firehoseBackupBucket: Bucket
  firehoseRole: IRole
  clientLogGroup: ILogGroup
  serverLogGroup: ILogGroup
  ensureClientLogGroup: cr.AwsCustomResource
  ensureServerLogGroup: cr.AwsCustomResource
}

export interface FirehoseResources {
  clientDeliveryStream: CfnDeliveryStream
  serverDeliveryStream: CfnDeliveryStream
  clientProcessor: NodejsFunction
  serverProcessor: NodejsFunction
  logsToFirehoseRole: IamRole
  logsToFirehosePolicy: Policy
  clientSubscription: CfnSubscriptionFilter
  serverSubscription: CfnSubscriptionFilter
}

export function createFirehoseStreams(
  scope: Construct,
  config: FirehoseConfig,
): FirehoseResources {
  Stack.of(scope)

  const clientProcessor = new NodejsFunction(
    scope,
    'ItoClientFirehoseProcessor',
    {
      entry: 'lambdas/firehose-transform.ts',
      handler: 'handler',
      environment: { DATASET: 'client', STAGE: config.stageName },
      timeout: Duration.seconds(30),
    },
  )

  const serverProcessor = new NodejsFunction(
    scope,
    'ItoServerFirehoseProcessor',
    {
      entry: 'lambdas/firehose-transform.ts',
      handler: 'handler',
      environment: { DATASET: 'server', STAGE: config.stageName },
      timeout: Duration.seconds(30),
    },
  )

  const clientInvokeGrant = clientProcessor.grantInvoke(config.firehoseRole)
  const serverInvokeGrant = serverProcessor.grantInvoke(config.firehoseRole)

  const clientDeliveryStream = new CfnDeliveryStream(
    scope,
    'ItoClientLogsToOs-client',
    {
      deliveryStreamName: `${config.stageName}-ito-client-logs`,
      amazonopensearchserviceDestinationConfiguration: {
        domainArn: config.opensearchDomain.domainArn,
        indexName: 'client-logs',
        indexRotationPeriod: 'OneDay',
        roleArn: config.firehoseRole.roleArn,
        bufferingHints: { intervalInSeconds: 60, sizeInMBs: 5 },
        s3BackupMode: 'AllDocuments',
        s3Configuration: {
          bucketArn: config.firehoseBackupBucket.bucketArn,
          roleArn: config.firehoseRole.roleArn,
          bufferingHints: { intervalInSeconds: 60, sizeInMBs: 5 },
          compressionFormat: 'GZIP',
        },
        processingConfiguration: {
          enabled: true,
          processors: [
            {
              type: 'Lambda',
              parameters: [
                {
                  parameterName: 'LambdaArn',
                  parameterValue: clientProcessor.functionArn,
                },
                { parameterName: 'NumberOfRetries', parameterValue: '3' },
                {
                  parameterName: 'BufferIntervalInSeconds',
                  parameterValue: '60',
                },
                { parameterName: 'BufferSizeInMBs', parameterValue: '3' },
              ],
            },
          ],
        },
      },
    },
  )

  const serverDeliveryStream = new CfnDeliveryStream(
    scope,
    'ItoServerLogsToOs-server',
    {
      deliveryStreamName: `${config.stageName}-ito-server-logs`,
      amazonopensearchserviceDestinationConfiguration: {
        domainArn: config.opensearchDomain.domainArn,
        indexName: 'server-logs',
        indexRotationPeriod: 'OneDay',
        roleArn: config.firehoseRole.roleArn,
        bufferingHints: { intervalInSeconds: 60, sizeInMBs: 5 },
        s3BackupMode: 'AllDocuments',
        s3Configuration: {
          bucketArn: config.firehoseBackupBucket.bucketArn,
          roleArn: config.firehoseRole.roleArn,
          bufferingHints: { intervalInSeconds: 60, sizeInMBs: 5 },
          compressionFormat: 'GZIP',
        },
        processingConfiguration: {
          enabled: true,
          processors: [
            {
              type: 'Lambda',
              parameters: [
                {
                  parameterName: 'LambdaArn',
                  parameterValue: serverProcessor.functionArn,
                },
                { parameterName: 'NumberOfRetries', parameterValue: '3' },
                {
                  parameterName: 'BufferIntervalInSeconds',
                  parameterValue: '60',
                },
                { parameterName: 'BufferSizeInMBs', parameterValue: '3' },
              ],
            },
          ],
        },
      },
    },
  )

  const clientS3PolicyAttach = config.firehoseRole.addToPrincipalPolicy(
    new PolicyStatement({
      actions: [
        's3:AbortMultipartUpload',
        's3:GetBucketLocation',
        's3:GetObject',
        's3:ListBucket',
        's3:ListBucketMultipartUploads',
        's3:PutObject',
      ],
      resources: [
        config.firehoseBackupBucket.bucketArn,
        `${config.firehoseBackupBucket.bucketArn}/*`,
      ],
    }),
  )

  const clientEsPolicyAttach = config.firehoseRole.addToPrincipalPolicy(
    new PolicyStatement({
      actions: ['es:*'],
      resources: [
        config.opensearchDomain.domainArn,
        `${config.opensearchDomain.domainArn}/*`,
      ],
    }),
  )

  const clientEsDescribePolicyAttach = config.firehoseRole.addToPrincipalPolicy(
    new PolicyStatement({
      actions: [
        'es:DescribeElasticsearchDomain',
        'es:DescribeElasticsearchDomains',
        'es:DescribeElasticsearchDomainConfig',
        'es:DescribeDomain',
        'es:DescribeDomains',
        'es:DescribeDomainConfig',
      ],
      resources: ['*'],
    }),
  )

  if (clientS3PolicyAttach.policyDependable)
    clientDeliveryStream.node.addDependency(
      clientS3PolicyAttach.policyDependable,
    )
  if (clientEsPolicyAttach.policyDependable)
    clientDeliveryStream.node.addDependency(
      clientEsPolicyAttach.policyDependable,
    )
  if (clientEsDescribePolicyAttach.policyDependable)
    clientDeliveryStream.node.addDependency(
      clientEsDescribePolicyAttach.policyDependable,
    )
  clientInvokeGrant.applyBefore(clientDeliveryStream)

  const serverS3PolicyAttach = config.firehoseRole.addToPrincipalPolicy(
    new PolicyStatement({
      actions: [
        's3:AbortMultipartUpload',
        's3:GetBucketLocation',
        's3:GetObject',
        's3:ListBucket',
        's3:ListBucketMultipartUploads',
        's3:PutObject',
      ],
      resources: [
        config.firehoseBackupBucket.bucketArn,
        `${config.firehoseBackupBucket.bucketArn}/*`,
      ],
    }),
  )

  const serverEsPolicyAttach = config.firehoseRole.addToPrincipalPolicy(
    new PolicyStatement({
      actions: ['es:*'],
      resources: [
        config.opensearchDomain.domainArn,
        `${config.opensearchDomain.domainArn}/*`,
      ],
    }),
  )

  const serverEsDescribePolicyAttach = config.firehoseRole.addToPrincipalPolicy(
    new PolicyStatement({
      actions: [
        'es:DescribeElasticsearchDomain',
        'es:DescribeElasticsearchDomains',
        'es:DescribeElasticsearchDomainConfig',
        'es:DescribeDomain',
        'es:DescribeDomains',
        'es:DescribeDomainConfig',
      ],
      resources: ['*'],
    }),
  )

  if (serverS3PolicyAttach.policyDependable)
    serverDeliveryStream.node.addDependency(
      serverS3PolicyAttach.policyDependable,
    )
  if (serverEsPolicyAttach.policyDependable)
    serverDeliveryStream.node.addDependency(
      serverEsPolicyAttach.policyDependable,
    )
  if (serverEsDescribePolicyAttach.policyDependable)
    serverDeliveryStream.node.addDependency(
      serverEsDescribePolicyAttach.policyDependable,
    )
  serverInvokeGrant.applyBefore(serverDeliveryStream)

  const logsToFirehoseRole = new IamRole(scope, 'ItoLogsToFirehoseRole', {
    assumedBy: new ServicePrincipal('logs.amazonaws.com'),
  })

  const logsToFirehosePolicy = new Policy(
    scope,
    'ItoLogsToFirehoseWritePolicy',
    {
      statements: [
        new PolicyStatement({
          actions: ['firehose:PutRecord', 'firehose:PutRecordBatch'],
          resources: [
            clientDeliveryStream.attrArn,
            serverDeliveryStream.attrArn,
          ],
        }),
      ],
    },
  )

  logsToFirehoseRole.attachInlinePolicy(logsToFirehosePolicy)

  const clientSubscription = new CfnSubscriptionFilter(
    scope,
    'ItoClientLogsSubscription',
    {
      logGroupName: config.clientLogGroup.logGroupName,
      destinationArn: clientDeliveryStream.attrArn,
      filterPattern: '',
      roleArn: logsToFirehoseRole.roleArn,
    },
  )

  clientSubscription.addDependency(clientDeliveryStream)
  clientSubscription.node.addDependency(logsToFirehosePolicy)
  clientSubscription.node.addDependency(config.ensureClientLogGroup)

  const serverSubscription = new CfnSubscriptionFilter(
    scope,
    'ItoServerLogsSubscription',
    {
      logGroupName: config.serverLogGroup.logGroupName,
      destinationArn: serverDeliveryStream.attrArn,
      filterPattern: '',
      roleArn: logsToFirehoseRole.roleArn,
    },
  )

  serverSubscription.addDependency(serverDeliveryStream)
  serverSubscription.node.addDependency(logsToFirehosePolicy)
  serverSubscription.node.addDependency(config.ensureServerLogGroup)

  return {
    clientDeliveryStream,
    serverDeliveryStream,
    clientProcessor,
    serverProcessor,
    logsToFirehoseRole,
    logsToFirehosePolicy,
    clientSubscription,
    serverSubscription,
  }
}
