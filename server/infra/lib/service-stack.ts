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
import { CLUSTER_NAME, DB_NAME, SERVICE_NAME } from './constants'
import {
  AwsLogDriver,
  Cluster,
  ContainerImage,
  CpuArchitecture,
  Secret as EcsSecret,
  FargateService,
  OperatingSystemFamily,
} from 'aws-cdk-lib/aws-ecs'
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns'
import { Secret } from 'aws-cdk-lib/aws-secretsmanager'
import { Vpc } from 'aws-cdk-lib/aws-ec2'
import { Repository } from 'aws-cdk-lib/aws-ecr'
import { HostedZone } from 'aws-cdk-lib/aws-route53'
import { AppStage } from '../bin/infra'
import { isDev } from './helpers'

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

    const fargateService = new ApplicationLoadBalancedFargateService(
      this,
      'ItoFargateService',
      {
        cluster,
        serviceName: `${stageName}-${SERVICE_NAME}`,
        cpu: 256,
        memoryLimitMiB: 512,
        desiredCount: 1,
        publicLoadBalancer: true,
        runtimePlatform: {
          operatingSystemFamily: OperatingSystemFamily.LINUX,
          cpuArchitecture: CpuArchitecture.ARM64,
        },
        taskImageOptions: {
          image: ContainerImage.fromEcrRepository(props.serviceRepo, 'latest'),
          containerPort: 3000,
          secrets: {
            DB_USER: EcsSecret.fromSecretsManager(
              dbCredentialsSecret,
              'username',
            ),
            DB_PASSWORD: EcsSecret.fromSecretsManager(
              dbCredentialsSecret,
              'password',
            ),
          },
          environment: {
            DB_HOST: props.dbEndpoint,
            DB_NAME,
            REQUIRE_AUTH: isDev(stageName) ? 'false' : 'true',
            AUTH0_DOMAIN: 'dev-8rsdprb2tatdfcps.us.auth0.com',
            AUTH0_AUDIENCE: 'http://localhost:3000',
          },
          logDriver: new AwsLogDriver({ streamPrefix: 'ito-server' }),
        },
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
      port: '3000',
      path: '/health',
      interval: Duration.seconds(30),
      timeout: Duration.seconds(5),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 5,
    })

    const alb = fargateService.loadBalancer
    alb.logAccessLogs(logBucket, 'ito-alb-access-logs')

    // TODO: Consider adding auto-scaling in the future. Keeping off for now
    // const scaling = fargateService.service.autoScaleTaskCount({
    //   maxCapacity: 4,
    // });
    // scaling.scaleOnCpuUtilization("CpuScaling", {
    //   targetUtilizationPercent: 50,
    //   scaleInCooldown: Duration.seconds(60),
    //   scaleOutCooldown: Duration.seconds(60),
    // });

    this.fargateService = fargateService.service

    new CfnOutput(this, 'ServiceURL', {
      value: fargateService.loadBalancer.loadBalancerDnsName,
    })

    Tags.of(this).add('Project', 'Ito')
  }
}
