import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
  Stage,
  Tags,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import {
  Certificate,
  CertificateValidation,
} from 'aws-cdk-lib/aws-certificatemanager'
import {
  ApplicationProtocol,
  Protocol,
  SslPolicy,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3'
import { CLUSTER_NAME, DB_NAME, DB_PORT, SERVICE_NAME } from './constants'
import {
  AwsLogDriver,
  Cluster,
  ContainerImage,
  CpuArchitecture,
  Secret as EcsSecret,
  FargateService,
  FargateTaskDefinition,
  OperatingSystemFamily,
} from 'aws-cdk-lib/aws-ecs'
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns'
import { Secret } from 'aws-cdk-lib/aws-secretsmanager'
import { Vpc } from 'aws-cdk-lib/aws-ec2'
import { Repository } from 'aws-cdk-lib/aws-ecr'
import { HostedZone } from 'aws-cdk-lib/aws-route53'
import { AppStage } from '../bin/infra'
import { isDev } from './helpers'
// FIX: The Role and ServicePrincipal imports were slightly off, corrected to be from aws-iam
// (Though your original code might have auto-resolved it, this is more explicit)
import {
  Role as IamRole,
  ServicePrincipal as IamServicePrincipal,
  ManagedPolicy,
  PolicyStatement,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { LogGroup, CfnSubscriptionFilter } from 'aws-cdk-lib/aws-logs'
import { Domain } from 'aws-cdk-lib/aws-opensearchservice'
import { CfnDeliveryStream } from 'aws-cdk-lib/aws-kinesisfirehose'
import * as cr from 'aws-cdk-lib/custom-resources'
import { CustomResource } from 'aws-cdk-lib'

export interface ServiceStackProps extends StackProps {
  dbSecretArn: string
  dbEndpoint: string
  serviceRepo: Repository
  vpc: Vpc
  opensearchDomain: Domain
}

export class ServiceStack extends Stack {
  public readonly fargateService: FargateService
  public readonly migrationLambda: NodejsFunction
  public readonly albFargate: ApplicationLoadBalancedFargateService
  constructor(scope: Construct, id: string, props: ServiceStackProps) {
    super(scope, id, props)

    const stage = Stage.of(this) as AppStage
    const stageName = stage.stageName

    const dbCredentialsSecret = Secret.fromSecretCompleteArn(
      this,
      'ImportedDbSecret',
      props.dbSecretArn,
    )

    const zone = HostedZone.fromLookup(this, 'HostedZone', {
      domainName: 'ito-api.com',
    })

    const domainName = `${stageName}.ito-api.com`
    const cert = new Certificate(this, 'SiteCert', {
      domainName,
      validation: CertificateValidation.fromDns(zone),
    })

    const groqApiKeyName = `${stageName}/ito/groq-api-key`

    const groqApiKeySecret = Secret.fromSecretNameV2(
      this,
      'GroqApiKey',
      groqApiKeyName,
    )

    const fargateTaskRole = new IamRole(this, 'ItoFargateTaskRole', {
      assumedBy: new IamServicePrincipal('ecs-tasks.amazonaws.com'),
    })

    dbCredentialsSecret.grantRead(fargateTaskRole)
    groqApiKeySecret.grantRead(fargateTaskRole)

    const taskExecutionRole = new IamRole(this, 'ItoTaskExecRole', {
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSTaskExecutionRolePolicy',
        ),
      ],
    })

    const taskDefinition = new FargateTaskDefinition(
      this,
      'ItoTaskDefinition',
      {
        taskRole: fargateTaskRole,
        cpu: 1024,
        memoryLimitMiB: 2048,
        runtimePlatform: {
          operatingSystemFamily: OperatingSystemFamily.LINUX,
          cpuArchitecture: CpuArchitecture.ARM64,
        },
        executionRole: taskExecutionRole,
      },
    )
    // Dedicated CloudWatch Log Group for client logs
    const clientLogGroup = new LogGroup(this, 'ItoClientLogsGroup', {
      logGroupName: `/ito/${stageName}/client`,
      retention: Infinity as any,
    })
    const serverLogGroup = new LogGroup(this, 'ItoServerLogsGroup', {
      logGroupName: `/ito/${stageName}/server`,
      retention: Infinity as any,
    })
    const containerName = 'ItoServerContainer'
    taskDefinition.addContainer(containerName, {
      image: ContainerImage.fromEcrRepository(props.serviceRepo, 'latest'),
      portMappings: [{ containerPort: 3000 }],
      secrets: {
        DB_USER: EcsSecret.fromSecretsManager(dbCredentialsSecret, 'username'),
        DB_PASS: EcsSecret.fromSecretsManager(dbCredentialsSecret, 'password'),
        GROQ_API_KEY: EcsSecret.fromSecretsManager(groqApiKeySecret),
      },
      environment: {
        DB_HOST: props.dbEndpoint,
        DB_NAME,
        DB_PORT: DB_PORT.toString(),
        REQUIRE_AUTH: 'true',
        AUTH0_DOMAIN: process.env.AUTH0_DOMAIN || '',
        AUTH0_AUDIENCE: process.env.AUTH0_AUDIENCE || '',
        AUTH0_CLIENT_ID: process.env.AUTH0_CLIENT_ID || '',
        AUTH0_CALLBACK_URL: `https://${domainName}/callback`,
        GROQ_TRANSCRIPTION_MODEL: 'whisper-large-v3',
        CLIENT_LOG_GROUP_NAME: clientLogGroup.logGroupName,
      },
      logging: new AwsLogDriver({
        streamPrefix: 'ito-server',
        logGroup: serverLogGroup,
      }),
    })

    const cluster = new Cluster(this, 'ItoEcsCluster', {
      vpc: props.vpc,
      clusterName: `${stageName}-${CLUSTER_NAME}`,
    })

    const logBucket = new Bucket(this, 'ItoAlbLogsBucket', {
      bucketName: `${stageName}-ito-alb-logs`,
      removalPolicy: isDev(stageName)
        ? RemovalPolicy.DESTROY
        : RemovalPolicy.RETAIN,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
    })

    // Firehose backup bucket
    const firehoseBackupBucket = new Bucket(this, 'ItoFirehoseBackupBucket', {
      bucketName: `${stageName}-ito-firehose-bucket`,
      removalPolicy: isDev(stageName)
        ? RemovalPolicy.DESTROY
        : RemovalPolicy.RETAIN,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
    })

    // FIX: Create the ApplicationLoadBalancedFargateService using the taskDefinition
    // you built above. We remove the `taskImageOptions` and other related properties.
    const fargateService = new ApplicationLoadBalancedFargateService(
      this,
      'ItoFargateService',
      {
        cluster,
        serviceName: `${stageName}-${SERVICE_NAME}`,
        desiredCount: 1,
        publicLoadBalancer: true,
        taskDefinition: taskDefinition,
        protocol: ApplicationProtocol.HTTPS,
        domainZone: zone,
        domainName,
        certificate: cert,
        redirectHTTP: true,
        sslPolicy: SslPolicy.RECOMMENDED,
      },
    )

    fargateService.targetGroup.configureHealthCheck({
      protocol: Protocol.HTTP,
      path: '/',
      interval: Duration.seconds(30),
      timeout: Duration.seconds(5),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 5,
    })

    const scalableTarget = fargateService.service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 5,
    })

    scalableTarget.scaleOnCpuUtilization('ItoServerCpuScalingPolicy', {
      targetUtilizationPercent: 65,
    })

    // Setup migration lambda
    const migrationLambda = new NodejsFunction(this, 'ItoMigrationLambda', {
      functionName: `${stageName}-${DB_NAME}-migration`,
      entry: 'lambdas/run-migration.ts',
      handler: 'handler',
      environment: {
        CLUSTER: cluster.clusterName,
        TASK_DEF: taskDefinition.taskDefinitionArn,
        SUBNETS: props.vpc.privateSubnets.map(s => s.subnetId).join(','),
        SECURITY_GROUPS:
          fargateService.service.connections.securityGroups[0].securityGroupId,
        STAGE_NAME: stageName,
        CONTAINER_NAME: containerName,
      },
      timeout: Duration.minutes(10),
    })

    migrationLambda.addToRolePolicy(
      new PolicyStatement({
        actions: ['ecs:RunTask'],
        resources: [taskDefinition.taskDefinitionArn],
      }),
    )

    migrationLambda.addToRolePolicy(
      new PolicyStatement({
        actions: ['ecs:DescribeTasks'],
        resources: ['*'], //  DescribeTasks can't be resource scoped
      }),
    )

    migrationLambda.addToRolePolicy(
      new PolicyStatement({
        actions: ['iam:PassRole'],
        resources: [taskExecutionRole.roleArn, fargateTaskRole.roleArn],
        conditions: {
          StringEquals: {
            'iam:PassedToService': 'ecs-tasks.amazonaws.com',
          },
        },
      }),
    )

    const alb = fargateService.loadBalancer
    alb.logAccessLogs(logBucket, 'ito-alb-access-logs')

    this.fargateService = fargateService.service
    this.albFargate = fargateService
    this.migrationLambda = migrationLambda

    // IAM permissions for task to write to client log group
    clientLogGroup.grantWrite(fargateTaskRole)

    // Firehose role to write to S3 and OpenSearch
    const firehoseRole = new IamRole(this, 'ItoFirehoseRole', {
      assumedBy: new ServicePrincipal('firehose.amazonaws.com'),
    })

    firehoseRole.addToPolicy(
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
          firehoseBackupBucket.bucketArn,
          `${firehoseBackupBucket.bucketArn}/*`,
        ],
      }),
    )

    firehoseRole.addToPolicy(
      new PolicyStatement({
        actions: [
          'es:DescribeElasticsearchDomain',
          'es:DescribeElasticsearchDomains',
          'es:DescribeElasticsearchDomainConfig',
          'es:ESHttpGet',
          'es:ESHttpHead',
          'es:ESHttpPost',
          'es:ESHttpPut',
          'es:ESHttpDelete',
        ],
        resources: [
          props.opensearchDomain.domainArn,
          `${props.opensearchDomain.domainArn}/*`,
        ],
      }),
    )

    // Lambda processors to normalize into ECS-like fields
    const clientProcessor = new NodejsFunction(
      this,
      'ItoClientFirehoseProcessor',
      {
        entry: 'lambdas/firehose-transform.ts',
        handler: 'handler',
        environment: { DATASET: 'client', STAGE: stageName },
        timeout: Duration.seconds(30),
      },
    )
    const serverProcessor = new NodejsFunction(
      this,
      'ItoServerFirehoseProcessor',
      {
        entry: 'lambdas/firehose-transform.ts',
        handler: 'handler',
        environment: { DATASET: 'server', STAGE: stageName },
        timeout: Duration.seconds(30),
      },
    )

    // Firehose needs permission to invoke the processors
    clientProcessor.grantInvoke(firehoseRole)
    serverProcessor.grantInvoke(firehoseRole)

    // Client logs Firehose → OpenSearch (index client-logs with daily rotation)
    const clientDelivery = new CfnDeliveryStream(this, 'ItoClientLogsToOs-client', {
      deliveryStreamName: `${stageName}-ito-client-logs`,
      amazonopensearchserviceDestinationConfiguration: {
        domainArn: props.opensearchDomain.domainArn,
        indexName: 'client-logs',
        indexRotationPeriod: 'OneDay',
        roleArn: firehoseRole.roleArn,
        bufferingHints: { intervalInSeconds: 60, sizeInMBs: 5 },
        s3BackupMode: 'AllDocuments',
        s3Configuration: {
          bucketArn: firehoseBackupBucket.bucketArn,
          roleArn: firehoseRole.roleArn,
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
    })

    // Server logs Firehose → OpenSearch (index server-logs with daily rotation)
    const serverDelivery = new CfnDeliveryStream(this, 'ItoServerLogsToOs-server', {
      deliveryStreamName: `${stageName}-ito-server-logs`,
      amazonopensearchserviceDestinationConfiguration: {
        domainArn: props.opensearchDomain.domainArn,
        indexName: 'server-logs',
        indexRotationPeriod: 'OneDay',
        roleArn: firehoseRole.roleArn,
        bufferingHints: { intervalInSeconds: 60, sizeInMBs: 5 },
        s3BackupMode: 'AllDocuments',
        s3Configuration: {
          bucketArn: firehoseBackupBucket.bucketArn,
          roleArn: firehoseRole.roleArn,
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
    })

    // Role for CloudWatch Logs to put data into Firehose
    const logsToFirehoseRole = new IamRole(this, 'ItoLogsToFirehoseRole', {
      assumedBy: new ServicePrincipal('logs.amazonaws.com'),
    })
    logsToFirehoseRole.addToPolicy(
      new PolicyStatement({
        actions: ['firehose:PutRecord', 'firehose:PutRecordBatch'],
        resources: [clientDelivery.attrArn, serverDelivery.attrArn],
      }),
    )

    // Subscription filter to pipe client CW logs to Firehose
    const clientSubscription = new CfnSubscriptionFilter(
      this,
      'ItoClientLogsSubscription',
      {
        logGroupName: clientLogGroup.logGroupName,
        destinationArn: clientDelivery.attrArn,
        filterPattern: '',
        roleArn: logsToFirehoseRole.roleArn,
      },
    )
    clientSubscription.addDependency(clientDelivery)

    const serverSubscription = new CfnSubscriptionFilter(
      this,
      'ItoServerLogsSubscription',
      {
        logGroupName: serverLogGroup.logGroupName,
        destinationArn: serverDelivery.attrArn,
        filterPattern: '',
        roleArn: logsToFirehoseRole.roleArn,
      },
    )
    serverSubscription.addDependency(serverDelivery)

    // OpenSearch index templates and ISM policy bootstrap (retain forever)
    const osBootstrap = new NodejsFunction(this, 'ItoOpenSearchBootstrap', {
      entry: 'lambdas/opensearch-bootstrap.ts',
      handler: 'handler',
      environment: {
        DOMAIN_ENDPOINT: props.opensearchDomain.domainEndpoint,
        REGION: this.region,
        STAGE: stageName,
      },
      timeout: Duration.minutes(2),
    })
    // Allow bootstrap to configure the domain via HTTP
    osBootstrap.addToRolePolicy(
      new PolicyStatement({
        actions: ['es:ESHttpGet', 'es:ESHttpPut'],
        resources: [
          props.opensearchDomain.domainArn,
          `${props.opensearchDomain.domainArn}/*`,
        ],
      }),
    )

    const osProvider = new cr.Provider(this, 'ItoOpenSearchBootstrapProvider', {
      onEventHandler: osBootstrap,
    })
    new CustomResource(this, 'ItoOpenSearchBootstrapResource', {
      serviceToken: osProvider.serviceToken,
      properties: {
        domain: props.opensearchDomain.domainEndpoint,
        stage: stageName,
      },
    })

    new CfnOutput(this, 'ServiceURL', {
      value: fargateService.loadBalancer.loadBalancerDnsName,
    })

    Tags.of(this).add('Project', 'Ito')
  }
}
