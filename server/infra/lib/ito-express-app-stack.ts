import {
  RemovalPolicy,
  Stack,
  StackProps,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_ecs_patterns as ecsPatterns,
  aws_rds as rds,
  aws_secretsmanager as secretsmanager,
} from "aws-cdk-lib";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

export class ItoExpressAppStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "ItoVpc", {
      maxAzs: 2,
    });

    const cluster = new ecs.Cluster(this, "ItoCluster", {
      vpc,
    });

    const dbCredentialsSecret = Secret.fromSecretNameV2(
      this,
      "ItoDbCredentials",
      "prod/ito-db/admin"
    );
    const dbCluster = new rds.DatabaseCluster(this, "ItoAurora", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_3,
      }),
      instances: 1,
      credentials: rds.Credentials.fromSecret(dbCredentialsSecret),
      defaultDatabaseName: "ito-db",
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      removalPolicy: RemovalPolicy.DESTROY, // optional: good for dev
    });

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
            environment: {
              DB_HOST: dbCluster.clusterEndpoint.hostname,
              DB_NAME: "ito-db",
              DB_USER: dbCredentialsSecret
                .secretValueFromJson("username")
                .unsafeUnwrap(),
              DB_PASSWORD: dbCredentialsSecret
                .secretValueFromJson("password")
                .unsafeUnwrap(),
            },
          },
        }
      );

    dbCluster.connections.allowDefaultPortFrom(
      fargateService.service,
      "Allow ECS to connect to Aurora"
    );
  }
}
