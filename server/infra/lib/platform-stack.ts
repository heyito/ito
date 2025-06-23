import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
  Tags,
} from 'aws-cdk-lib'
import { SecurityGroup, Vpc } from 'aws-cdk-lib/aws-ec2'
import {
  AuroraPostgresEngineVersion,
  ClusterInstance,
  Credentials,
  DatabaseCluster,
  DatabaseClusterEngine,
} from 'aws-cdk-lib/aws-rds'
import { Secret } from 'aws-cdk-lib/aws-secretsmanager'
import { Construct } from 'constructs'
import { DB_NAME } from './constants'
import { Repository } from 'aws-cdk-lib/aws-ecr'

export interface PlatformStackProps extends StackProps {
  vpc: Vpc
}

export class PlatformStack extends Stack {
  public readonly dbSecretArn: string
  public readonly dbEndpoint: string
  public readonly dbSecurityGroupId: string
  public readonly serviceRepo: Repository

  constructor(scope: Construct, id: string, props: PlatformStackProps) {
    super(scope, id, props)

    const dbSecurityGroup = new SecurityGroup(this, 'ItoDbSecurityGroup', {
      vpc: props.vpc,
      description: 'Allow ECS Fargate service to connect to Aurora',
      allowAllOutbound: true,
    })

    const dbCredentialsSecret = new Secret(this, 'ItoDbCredentials', {
      secretName: 'prod/ito-db/admin-db',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'dbadmin' }),
        excludePunctuation: true,
        includeSpace: false,
        generateStringKey: 'password',
      },
    })

    this.dbSecretArn = dbCredentialsSecret.secretArn

    const dbCluster = new DatabaseCluster(this, 'ItoAuroraServerless', {
      engine: DatabaseClusterEngine.auroraPostgres({
        version: AuroraPostgresEngineVersion.VER_16_2,
      }),
      vpc: props.vpc,
      securityGroups: [dbSecurityGroup],
      credentials: Credentials.fromSecret(dbCredentialsSecret),
      defaultDatabaseName: DB_NAME,

      writer: ClusterInstance.serverlessV2('WriterInstance'),
      readers: [
        ClusterInstance.serverlessV2('ReaderInstance', {
          scaleWithWriter: true,
        }),
      ],
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 4,
      backup: {
        retention: Duration.days(7),
      },
      removalPolicy: RemovalPolicy.RETAIN,
    })

    this.dbEndpoint = dbCluster.clusterEndpoint.hostname
    this.dbSecurityGroupId = dbSecurityGroup.securityGroupId

    new CfnOutput(this, 'DbEndpoint', {
      value: dbCluster.clusterEndpoint.socketAddress,
    })

    this.serviceRepo = new Repository(this, 'ItoServiceRepo', {
      repositoryName: 'ito-server',
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [{ maxImageCount: 20 }],
    })

    Tags.of(this).add('Project', 'Ito')
  }
}
