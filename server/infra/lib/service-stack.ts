import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
  Tags,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager'
import {
  ApplicationProtocol,
  Protocol,
  SslPolicy,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import {
  BlockPublicAccess,
  Bucket,
  BucketPolicy,
  IBucket,
} from 'aws-cdk-lib/aws-s3'
import { Platform } from 'aws-cdk-lib/aws-ecr-assets'
import { DB_NAME } from './constants'
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
import { DatabaseCluster } from 'aws-cdk-lib/aws-rds'
import { Vpc } from 'aws-cdk-lib/aws-ec2'
import { PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam'
import { Repository } from 'aws-cdk-lib/aws-ecr'

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

    const dbCredentialsSecret = Secret.fromSecretCompleteArn(
      this,
      'ImportedDbSecret',
      props.dbSecretArn,
    )

    // Cloudflare DNS - CNAME setup for HTTPs
    const cert = Certificate.fromCertificateArn(
      this,
      'ItoCert',
      'arn:aws:acm:us-west-2:287641434880:certificate/bc787183-0191-49db-a955-b28bd5960cca',
    )

    const cluster = new Cluster(this, 'ItoEcsCluster', {
      vpc: props.vpc,
    })

    const logBucket = new Bucket(this, 'ItoAlbLogsBucket', {
      bucketName: 'ito-alb-logs',
      removalPolicy: RemovalPolicy.RETAIN,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
    })

    const fargateService = new ApplicationLoadBalancedFargateService(
      this,
      'ItoFargateService',
      {
        cluster,
        cpu: 256,
        memoryLimitMiB: 512,
        desiredCount: 1,
        publicLoadBalancer: true,
        runtimePlatform: {
          operatingSystemFamily: OperatingSystemFamily.LINUX,
          cpuArchitecture: CpuArchitecture.ARM64,
        },
        taskImageOptions: {
          // image: ContainerImage.fromAsset("../", {
          //   platform: Platform.LINUX_ARM64,
          // }),
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
          },
          logDriver: new AwsLogDriver({ streamPrefix: 'ito-server' }),
        },
        protocol: ApplicationProtocol.HTTPS,
        certificate: cert,
        redirectHTTP: true,
        sslPolicy: SslPolicy.RECOMMENDED,
      },
    )

    fargateService.targetGroup.configureHealthCheck({
      protocol: Protocol.HTTP,
      port: '3000',
      path: '/healthz',
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
