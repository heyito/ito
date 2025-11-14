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
import { BlockPublicAccess, Bucket, IBucket } from 'aws-cdk-lib/aws-s3'
import { CLUSTER_NAME, DB_NAME, DB_PORT, SERVICE_NAME } from './constants'
import { Cluster, FargateService } from 'aws-cdk-lib/aws-ecs'
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns'
import { Secret } from 'aws-cdk-lib/aws-secretsmanager'
import { Vpc } from 'aws-cdk-lib/aws-ec2'
import { Repository } from 'aws-cdk-lib/aws-ecr'
import { HostedZone } from 'aws-cdk-lib/aws-route53'
import { AppStage } from '../bin/infra'
import { isDev } from './helpers'
import { Role as IamRole, PolicyStatement } from 'aws-cdk-lib/aws-iam'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { Domain } from 'aws-cdk-lib/aws-opensearchservice'

// Import our new modules
import { createLogGroups } from './service/log-groups'
import { createFargateTask } from './service/fargate-task'
import { createFirehoseStreams } from './service/firehose-config'
import { createOpenSearchBootstrap } from './service/opensearch-bootstrap'
import { createMigrationLambda } from './service/migration-lambda'

export interface ServiceStackProps extends StackProps {
  dbSecretArn: string
  dbEndpoint: string
  serviceRepo: Repository
  vpc: Vpc
  opensearchDomain: Domain
  blobStorageBucket: IBucket
  timingBucketName: string
}

export class ServiceStack extends Stack {
  public readonly fargateService: FargateService
  public readonly migrationLambda: NodejsFunction
  public readonly albFargate: ApplicationLoadBalancedFargateService

  constructor(scope: Construct, id: string, props: ServiceStackProps) {
    super(scope, id, props)

    const stage = Stage.of(this) as AppStage
    const stageName = stage.stageName

    // Import secrets
    const dbCredentialsSecret = Secret.fromSecretCompleteArn(
      this,
      'ImportedDbSecret',
      props.dbSecretArn,
    )

    const groqApiKeySecret = Secret.fromSecretNameV2(
      this,
      'GroqApiKey',
      `${stageName}/ito/groq-api-key`,
    )

    const cerebrasApiKeySecret = Secret.fromSecretNameV2(
      this,
      'CerebrasApiKey',
      `${stageName}/ito/cerebras-api-key`,
    )

    const stripeSecretKeySecret = Secret.fromSecretNameV2(
      this,
      'StripeSecretKey',
      `${stageName}/ito/stripe-secret-key`,
    )

    const stripeWebhookSecret = Secret.fromSecretNameV2(
      this,
      'StripeWebhookSecret',
      `${stageName}/ito/stripe-webhook`,
    )

    // Setup domain and certificate
    const zone = HostedZone.fromLookup(this, 'HostedZone', {
      domainName: 'ito-api.com',
    })

    const domainName = `${stageName}.ito-api.com`
    const cert = new Certificate(this, 'SiteCert', {
      domainName,
      validation: CertificateValidation.fromDns(zone),
    })

    // Create log groups
    const logGroupResources = createLogGroups(this, { stageName })

    // Import timing bucket from platform stack
    const timingBucket = Bucket.fromBucketName(
      this,
      'TimingBucket',
      props.timingBucketName,
    )

    // Create Fargate task
    const fargateTaskResources = createFargateTask(this, {
      stageName,
      serviceRepo: props.serviceRepo,
      dbCredentialsSecret,
      groqApiKeySecret,
      cerebrasApiKeySecret,
      stripeSecretKeySecret,
      stripeWebhookSecret: stripeWebhookSecret,
      dbEndpoint: props.dbEndpoint,
      dbName: DB_NAME,
      dbPort: DB_PORT,
      domainName,
      clientLogGroup: logGroupResources.clientLogGroup,
      serverLogGroup: logGroupResources.serverLogGroup,
      blobStorageBucketName: props.blobStorageBucket.bucketName,
      timingBucketName: props.timingBucketName,
    })

    // Grant Fargate task permissions to access blob storage
    props.blobStorageBucket.grantReadWrite(fargateTaskResources.taskRole)
    props.blobStorageBucket.grantDelete(fargateTaskResources.taskRole)

    // Grant Fargate task permissions to write timing data to S3
    timingBucket.grantPut(fargateTaskResources.taskRole)

    // Create ECS cluster
    const cluster = new Cluster(this, 'ItoEcsCluster', {
      vpc: props.vpc,
      clusterName: `${stageName}-${CLUSTER_NAME}`,
    })

    // Create S3 buckets
    const logBucket = new Bucket(this, 'ItoAlbLogsBucket', {
      bucketName: `${stageName}-${this.account}-${this.region}-ito-alb-logs`,
      removalPolicy: isDev(stageName)
        ? RemovalPolicy.DESTROY
        : RemovalPolicy.RETAIN,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
    })

    const firehoseBackupBucket = new Bucket(this, 'ItoFirehoseBackupBucket', {
      bucketName: `${stageName}-${this.account}-${this.region}-ito-firehose-bucket`,
      removalPolicy: isDev(stageName)
        ? RemovalPolicy.DESTROY
        : RemovalPolicy.RETAIN,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
    })

    // Create Fargate service
    const fargateService = new ApplicationLoadBalancedFargateService(
      this,
      'ItoFargateService',
      {
        cluster,
        serviceName: `${stageName}-${SERVICE_NAME}`,
        desiredCount: isDev(stageName) ? 1 : 2,
        publicLoadBalancer: true,
        taskDefinition: fargateTaskResources.taskDefinition,
        protocol: ApplicationProtocol.HTTPS,
        domainZone: zone,
        domainName,
        certificate: cert,
        redirectHTTP: true,
        sslPolicy: SslPolicy.RECOMMENDED,
        circuitBreaker: { enable: true, rollback: true },
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

    // Create migration Lambda
    const migrationLambdaResources = createMigrationLambda(this, {
      stageName,
      dbName: DB_NAME,
      cluster,
      taskDefinition: fargateTaskResources.taskDefinition,
      vpc: props.vpc,
      fargateService: fargateService.service,
      containerName: fargateTaskResources.containerName,
      taskExecutionRole: fargateTaskResources.taskExecutionRole,
      taskRole: fargateTaskResources.taskRole,
    })

    // Configure ALB logging
    const alb = fargateService.loadBalancer
    alb.logAccessLogs(logBucket, 'ito-alb-access-logs')

    // Ensure ECS Service waits for inline policy attachment and log groups creation
    fargateService.service.node.addDependency(
      fargateTaskResources.taskLogsPolicy,
    )
    fargateService.service.node.addDependency(
      logGroupResources.ensureClientLogGroup,
    )
    fargateService.service.node.addDependency(
      logGroupResources.ensureServerLogGroup,
    )

    // Import Firehose role created in platform stack
    const firehoseRole = IamRole.fromRoleArn(
      this,
      'ItoFirehoseRoleImported',
      `arn:aws:iam::${this.account}:role/${stageName}-ItoFirehoseRole`,
      { mutable: true },
    )

    // Add Firehose role policies
    firehoseRole.addToPrincipalPolicy(
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

    firehoseRole.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ['es:*'],
        resources: [
          props.opensearchDomain.domainArn,
          `${props.opensearchDomain.domainArn}/*`,
        ],
      }),
    )

    firehoseRole.addToPrincipalPolicy(
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

    // Create Firehose delivery streams
    createFirehoseStreams(this, {
      stageName,
      opensearchDomain: props.opensearchDomain,
      firehoseBackupBucket,
      firehoseRole,
      clientLogGroup: logGroupResources.clientLogGroup,
      serverLogGroup: logGroupResources.serverLogGroup,
      ensureClientLogGroup: logGroupResources.ensureClientLogGroup,
      ensureServerLogGroup: logGroupResources.ensureServerLogGroup,
    })

    // Create OpenSearch bootstrap
    createOpenSearchBootstrap(this, {
      stageName,
      opensearchDomain: props.opensearchDomain,
    })

    // Set stack properties
    this.fargateService = fargateService.service
    this.albFargate = fargateService
    this.migrationLambda = migrationLambdaResources.migrationLambda

    // Outputs
    new CfnOutput(this, 'ServiceURL', {
      value: fargateService.loadBalancer.loadBalancerDnsName,
    })

    // Tags
    Tags.of(this).add('Project', 'Ito')
  }
}
