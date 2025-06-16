import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
  Tags,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_ecs_patterns as ecsPatterns,
  aws_rds as rds,
  aws_cloudwatch as cw,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  Certificate,
  CertificateValidation,
} from "aws-cdk-lib/aws-certificatemanager";
import { Application } from "aws-cdk-lib/aws-appconfig";
import {
  ApplicationProtocol,
  SslPolicy,
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Bucket } from "aws-cdk-lib/aws-s3";

const DB_NAME = "ito-db";
export class ItoExpressAppStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "ItoVpc", {
      maxAzs: 2,
      natGateways: 1,
    });

    const cluster = new ecs.Cluster(this, "ItoCluster", {
      vpc,
    });

    const dbCredentialsSecret = new rds.DatabaseSecret(this, "ItoDbSecret", {
      username: "dbadmin",
      secretName: "prod/ito-db/cdk-credentials",
    });
    dbCredentialsSecret.applyRemovalPolicy(RemovalPolicy.RETAIN);

    const dbCluster = new rds.DatabaseCluster(this, "ItoAurora", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_3,
      }),
      writer: rds.ClusterInstance.provisioned("WriterInstance", {
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.BURSTABLE2,
          ec2.InstanceSize.SMALL
        ),
      }),
      readers: [],
      credentials: rds.Credentials.fromSecret(dbCredentialsSecret),
      defaultDatabaseName: DB_NAME,
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      removalPolicy: RemovalPolicy.RETAIN,
      backup: {
        retention: Duration.days(7),
        preferredWindow: "03:00-04:00",
      },
    });

    const cert = Certificate.fromCertificateArn(
      this,
      "ItoCert",
      "arn:aws:acm:us-west-2:287641434880:certificate/bc787183-0191-49db-a955-b28bd5960cca"
    );

    const fargateService =
      new ecsPatterns.ApplicationLoadBalancedFargateService(
        this,
        "ItoFargateService",
        {
          cluster,
          cpu: 256,
          memoryLimitMiB: 512,
          desiredCount: 1,
          publicLoadBalancer: true,
          taskImageOptions: {
            image: ecs.ContainerImage.fromAsset("../"),
            containerPort: 3000,
            secrets: {
              DB_USER: ecs.Secret.fromSecretsManager(
                dbCredentialsSecret,
                "username"
              ),
              DB_PASSWORD: ecs.Secret.fromSecretsManager(
                dbCredentialsSecret,
                "password"
              ),
            },
            environment: {
              DB_HOST: dbCluster.clusterEndpoint.hostname,
              DB_NAME,
            },
            logDriver: new ecs.AwsLogDriver({ streamPrefix: "ito-server" }),
          },
          protocol: ApplicationProtocol.HTTPS,
          certificate: cert,
          redirectHTTP: true,
          sslPolicy: SslPolicy.RECOMMENDED,
        }
      );

    fargateService.targetGroup.configureHealthCheck({
      path: "/ping-db",
      interval: Duration.seconds(30),
      timeout: Duration.seconds(5),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 5,
    });

    const alb = fargateService.loadBalancer;
    alb.logAccessLogs(
      new Bucket(this, "AlbLogsBucket", {
        removalPolicy: RemovalPolicy.RETAIN,
        lifecycleRules: [{ expiration: Duration.days(90) }],
      }),
      "/ito-alb"
    );

    // TODO: Consider adding auto-scaling in the future. Keeping off for now
    // const scaling = fargateService.service.autoScaleTaskCount({
    //   maxCapacity: 4,
    // });
    // scaling.scaleOnCpuUtilization("CpuScaling", {
    //   targetUtilizationPercent: 50,
    //   scaleInCooldown: Duration.seconds(60),
    //   scaleOutCooldown: Duration.seconds(60),
    // });

    const svc = fargateService.service;
    new cw.Alarm(this, "HighCpu", {
      metric: svc.metricCpuUtilization(),
      threshold: 80,
      evaluationPeriods: 2,
      alarmDescription: "Fargate CPU > 80% for 2 periods",
    });
    new cw.Alarm(this, "DbFreeStorage", {
      metric: dbCluster.metric("FreeStorageSpace"),
      threshold: 20 * 1024 * 1024 * 1024, // 20 GiB
      evaluationPeriods: 1,
      alarmDescription: "Aurora free storage < 20 GiB",
    });

    dbCluster.connections.allowDefaultPortFrom(
      fargateService.service,
      "Allow ECS to connect to Aurora"
    );

    new CfnOutput(this, "ServiceURL", {
      value: fargateService.loadBalancer.loadBalancerDnsName,
    });
    new CfnOutput(this, "DbEndpoint", {
      value: dbCluster.clusterEndpoint.socketAddress,
    });

    Tags.of(this).add("Project", "Ito");
  }
}
