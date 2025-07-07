import {
  aws_elasticloadbalancingv2,
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
  ApplicationProtocolVersion,
  Protocol,
  SslPolicy,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3'
import { CLUSTER_NAME, DB_NAME, SERVICE_NAME } from './constants'
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
import { Port, Vpc } from 'aws-cdk-lib/aws-ec2'
import { Repository } from 'aws-cdk-lib/aws-ecr'
import { HostedZone } from 'aws-cdk-lib/aws-route53'
import { AppStage } from '../bin/infra'
import { isDev } from './helpers'
// FIX: The Role and ServicePrincipal imports were slightly off, corrected to be from aws-iam
// (Though your original code might have auto-resolved it, this is more explicit)
import {
  Role as IamRole,
  ServicePrincipal as IamServicePrincipal,
} from 'aws-cdk-lib/aws-iam'

export interface ServiceStackProps extends StackProps {
  dbSecretArn: string
  dbEndpoint: string
  serviceRepo: Repository
  vpc: Vpc
}

export class ServiceStack extends Stack {
  public readonly fargateService: FargateService
  constructor(scope: Construct, id: string, props: ServiceStackProps) {
    super(scope, id, props)

    const stage = Stage.of(this) as AppStage
    const stageName = stage.stageName

    const dbCredentialsSecret = Secret.fromSecretCompleteArn(
      this,
      'ImportedDbSecret',
      props.dbSecretArn,
    )

    const groqApiKeySecret = Secret.fromSecretNameV2(
      this,
      'GroqApiKey',
      'groq-api-key',
    )

    const fargateTaskRole = new IamRole(this, 'ItoFargateTaskRole', {
      assumedBy: new IamServicePrincipal('ecs-tasks.amazonaws.com'),
    })

    dbCredentialsSecret.grantRead(fargateTaskRole)
    groqApiKeySecret.grantRead(fargateTaskRole)

    // --- 2. DEFINE THE TASK DEFINITION AND CONTAINER ---

    const taskDefinition = new FargateTaskDefinition(
      this,
      'ItoTaskDefinition',
      {
        taskRole: fargateTaskRole,
        cpu: 256,
        memoryLimitMiB: 512,
        runtimePlatform: {
          operatingSystemFamily: OperatingSystemFamily.LINUX,
          cpuArchitecture: CpuArchitecture.ARM64,
        },
      },
    )

    taskDefinition.addContainer('ItoServerContainer', {
      image: ContainerImage.fromEcrRepository(props.serviceRepo, 'latest'),
      portMappings: [{ containerPort: 3000 }],
      secrets: {
        DB_USER: EcsSecret.fromSecretsManager(dbCredentialsSecret, 'username'),
        DB_PASSWORD: EcsSecret.fromSecretsManager(
          dbCredentialsSecret,
          'password',
        ),
        GROQ_API_KEY: EcsSecret.fromSecretsManager(groqApiKeySecret),
      },
      environment: {
        DB_HOST: props.dbEndpoint,
        DB_NAME,
        REQUIRE_AUTH: 'true',
        AUTH0_DOMAIN: 'dev-8rsdprb2tatdfcps.us.auth0.com',
        AUTH0_AUDIENCE: 'http://localhost:3000',
        GROQ_TRANSCRIPTION_MODEL: 'distil-whisper-large-v3-en',
      },
      logging: new AwsLogDriver({ streamPrefix: 'ito-server' }),
    })

    const zone = HostedZone.fromLookup(this, 'HostedZone', {
      domainName: 'ito-api.com',
    })

    const domainName = `${stageName}.ito-api.com`
    const cert = new Certificate(this, 'SiteCert', {
      domainName,
      validation: CertificateValidation.fromDns(zone),
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

    const alb = fargateService.loadBalancer
    alb.logAccessLogs(logBucket, 'ito-alb-access-logs')

    this.fargateService = fargateService.service

    new CfnOutput(this, 'ServiceURL', {
      value: fargateService.loadBalancer.loadBalancerDnsName,
    })

    Tags.of(this).add('Project', 'Ito')
  }
}
