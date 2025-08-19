import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
  Stage,
  Tags,
} from 'aws-cdk-lib'
import { SecurityGroup, Vpc, EbsDeviceVolumeType } from 'aws-cdk-lib/aws-ec2'
import {
  AuroraPostgresEngineVersion,
  ClusterInstance,
  Credentials,
  DatabaseCluster,
  DatabaseClusterEngine,
} from 'aws-cdk-lib/aws-rds'
import { Secret } from 'aws-cdk-lib/aws-secretsmanager'
import { Construct } from 'constructs'
import { DB_NAME, SERVER_NAME } from './constants'
import { Repository } from 'aws-cdk-lib/aws-ecr'
import { AppStage } from '../bin/infra'
import { isDev } from './helpers'
import {
  Domain,
  EngineVersion,
  TLSSecurityPolicy,
} from 'aws-cdk-lib/aws-opensearchservice'
import {
  AccountRootPrincipal,
  Effect,
  PolicyStatement,
  ServicePrincipal,
  ArnPrincipal,
  Role,
} from 'aws-cdk-lib/aws-iam'

export interface PlatformStackProps extends StackProps {
  vpc: Vpc
}

export class PlatformStack extends Stack {
  public readonly dbSecretArn: string
  public readonly dbEndpoint: string
  public readonly dbSecurityGroupId: string
  public readonly serviceRepo: Repository
  public readonly opensearchDomain: Domain

  constructor(scope: Construct, id: string, props: PlatformStackProps) {
    super(scope, id, props)

    const stage = Stage.of(this) as AppStage
    const stageName = stage.stageName

    const dbSecurityGroup = new SecurityGroup(this, 'ItoDbSecurityGroup', {
      vpc: props.vpc,
      description: 'Allow ECS Fargate service to connect to Aurora',
      allowAllOutbound: true,
    })

    const dbCredentialsSecret = new Secret(this, 'ItoDbCredentials', {
      secretName: `${stageName}/ito-db/dbadmin`,
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
      enablePerformanceInsights: true,
      vpc: props.vpc,
      securityGroups: [dbSecurityGroup],
      credentials: Credentials.fromSecret(dbCredentialsSecret),
      defaultDatabaseName: `${DB_NAME}`,
      clusterIdentifier: `${stageName}-${DB_NAME}Cluster`,
      writer: ClusterInstance.serverlessV2('WriterInstance'),
      readers: [
        ClusterInstance.serverlessV2('ReaderInstance', {
          scaleWithWriter: true,
        }),
      ],
      serverlessV2MinCapacity: isDev(stageName) ? 0.5 : 2,
      serverlessV2MaxCapacity: isDev(stageName) ? 4 : 10,
      backup: {
        retention: Duration.days(7),
      },
      removalPolicy: isDev(stageName)
        ? RemovalPolicy.DESTROY
        : RemovalPolicy.RETAIN,
    })

    this.dbEndpoint = dbCluster.clusterEndpoint.hostname
    this.dbSecurityGroupId = dbSecurityGroup.securityGroupId

    new CfnOutput(this, 'DbEndpoint', {
      value: dbCluster.clusterEndpoint.socketAddress,
    })

    this.serviceRepo = new Repository(this, 'ItoServiceRepo', {
      repositoryName: `${stageName}-${SERVER_NAME}`,
      removalPolicy: isDev(stageName)
        ? RemovalPolicy.DESTROY
        : RemovalPolicy.RETAIN,
      lifecycleRules: [{ maxImageCount: 20 }],
    })

    // Firehose role is created in the platform stack so the OpenSearch domain
    // resource policy can reference a stable principal without cross-stack timing issues
    const firehoseRole = new Role(this, 'ItoFirehoseRole', {
      assumedBy: new ServicePrincipal('firehose.amazonaws.com'),
      roleName: `${stageName}-ItoFirehoseRole`,
    })

    // OpenSearch domain for logs (one per stage)
    const domain = new Domain(this, 'ItoLogsDomain', {
      domainName: `${stageName}-ito-logs`,
      version: EngineVersion.OPENSEARCH_2_13,
      enforceHttps: true,
      nodeToNodeEncryption: true,
      encryptionAtRest: { enabled: true },
      ebs: {
        enabled: true,
        volumeSize: isDev(stageName) ? 20 : 50,
        volumeType: EbsDeviceVolumeType.GENERAL_PURPOSE_SSD_GP3,
      },
      capacity: {
        dataNodes: isDev(stageName) ? 1 : 2,
        dataNodeInstanceType: 'm7g.large.search',
        multiAzWithStandbyEnabled: false,
      },
      zoneAwareness: isDev(stageName)
        ? { enabled: false }
        : { enabled: true, availabilityZoneCount: 2 },
      tlsSecurityPolicy: TLSSecurityPolicy.TLS_1_2,
    })
    domain.applyRemovalPolicy(
      isDev(stageName) ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
    )
    domain.addAccessPolicies(
      new PolicyStatement({
        effect: Effect.ALLOW,
        principals: [new ArnPrincipal(firehoseRole.roleArn)],
        actions: ['es:ESHttp*'],
        resources: [domain.domainArn, `${domain.domainArn}/*`],
      }),
    )

    // Also allow the Firehose service principal gated by SourceAccount/SourceArn
    domain.addAccessPolicies(
      new PolicyStatement({
        effect: Effect.ALLOW,
        principals: [new ServicePrincipal('firehose.amazonaws.com')],
        actions: ['es:ESHttp*'],
        resources: [domain.domainArn, `${domain.domainArn}/*`],
        conditions: {
          StringEquals: { 'aws:SourceAccount': this.account },
          ArnLike: {
            'aws:SourceArn': [
              `arn:aws:firehose:${this.region}:${this.account}:deliverystream/${stageName}-ito-client-logs`,
              `arn:aws:firehose:${this.region}:${this.account}:deliverystream/${stageName}-ito-server-logs`,
            ],
          },
        },
      }),
    )
    this.opensearchDomain = domain

    new CfnOutput(this, 'OpenSearchEndpoint', {
      value: domain.domainEndpoint,
    })

    Tags.of(this).add('Project', 'Ito')
  }
}
