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
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3'
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
  ManagedPolicy,
  FederatedPrincipal,
} from 'aws-cdk-lib/aws-iam'
import {
  UserPool,
  UserPoolDomain,
  CfnIdentityPool,
  UserPoolClient,
  CfnIdentityPoolRoleAttachment,
} from 'aws-cdk-lib/aws-cognito'
import { createTimingInfrastructure } from './timing-config'

export interface PlatformStackProps extends StackProps {
  vpc: Vpc
}

export class PlatformStack extends Stack {
  public readonly dbSecretArn: string
  public readonly dbEndpoint: string
  public readonly dbSecurityGroupId: string
  public readonly serviceRepo: Repository
  public readonly opensearchDomain: Domain
  public readonly blobStorageBucket: Bucket
  public readonly timingBucketName: string

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

    // Blob storage bucket for storing user-uploaded files and data
    this.blobStorageBucket = new Bucket(this, 'ItoBlobStorage', {
      bucketName: `${stageName}-${this.account}-${this.region}-ito-blob-storage`,
      removalPolicy: isDev(stageName)
        ? RemovalPolicy.DESTROY
        : RemovalPolicy.RETAIN,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
    })

    // Firehose role is created in the platform stack so the OpenSearch domain
    // resource policy can reference a stable principal without cross-stack timing issues
    const firehoseRole = new Role(this, 'ItoFirehoseRole', {
      assumedBy: new ServicePrincipal('firehose.amazonaws.com'),
      roleName: `${stageName}-ItoFirehoseRole`,
    })

    // Cognito resources for OpenSearch Dashboards authentication
    const userPool = new UserPool(this, 'ItoOsUserPool', {
      userPoolName: `${stageName}-ito-os-userpool`,
      selfSignUpEnabled: true,
      signInAliases: { email: true, username: true },
      accountRecovery: undefined,
    })
    new UserPoolClient(this, 'ItoOsUserPoolClient', {
      userPool,
      userPoolClientName: `${stageName}-ito-os-client`,
      generateSecret: false,
      authFlows: { userSrp: true, userPassword: true },
    })
    new UserPoolDomain(this, 'ItoOsUserPoolDomain', {
      userPool,
      cognitoDomain: {
        domainPrefix: `${stageName}-${this.account}-ito-os`.toLowerCase(),
      },
    })
    const identityPool = new CfnIdentityPool(this, 'ItoOsIdentityPool', {
      allowUnauthenticatedIdentities: true,
      identityPoolName: `${stageName}-ito-os-identitypool`,
      // Leave providers empty so OpenSearch can register its own App Client
    })
    const authenticatedRole = new Role(this, 'ItoOsCognitoAuthenticatedRole', {
      assumedBy: new FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
    })
    const unauthenticatedRole = new Role(
      this,
      'ItoOsCognitoUnauthenticatedRole',
      {
        assumedBy: new FederatedPrincipal(
          'cognito-identity.amazonaws.com',
          {
            StringEquals: {
              'cognito-identity.amazonaws.com:aud': identityPool.ref,
            },
            'ForAnyValue:StringLike': {
              'cognito-identity.amazonaws.com:amr': 'unauthenticated',
            },
          },
          'sts:AssumeRoleWithWebIdentity',
        ),
      },
    )
    // Attach the authenticated role to the identity pool
    new CfnIdentityPoolRoleAttachment(this, 'ItoOsIdentityPoolRoleAttachment', {
      identityPoolId: identityPool.ref,
      roles: {
        authenticated: authenticatedRole.roleArn,
        unauthenticated: unauthenticatedRole.roleArn,
      },
    })
    const cognitoAccessRole = new Role(this, 'ItoOsCognitoAccessRole', {
      assumedBy: new ServicePrincipal('opensearchservice.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          'AmazonOpenSearchServiceCognitoAccess',
        ),
      ],
    })

    // OpenSearch domain for logs (one per stage)
    const domain = new Domain(this, 'ItoLogsDomain', {
      domainName: `${stageName}-ito-logs`,
      version: EngineVersion.OPENSEARCH_2_13,
      enforceHttps: true,
      nodeToNodeEncryption: true,
      encryptionAtRest: { enabled: true },
      fineGrainedAccessControl: {
        masterUserArn: `arn:aws:iam::${this.account}:root`,
      },
      cognitoDashboardsAuth: {
        userPoolId: userPool.userPoolId,
        identityPoolId: identityPool.ref,
        role: cognitoAccessRole,
      },
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

    // Allow any IAM principal from this AWS account to access the domain via IAM (SigV4)
    // Using AccountRootPrincipal is the recommended way to grant all users/roles in the account
    domain.addAccessPolicies(
      new PolicyStatement({
        effect: Effect.ALLOW,
        principals: [new AccountRootPrincipal()],
        actions: ['es:ESHttp*'],
        resources: [domain.domainArn, `${domain.domainArn}/*`],
      }),
    )

    // Allow Cognito authenticated users (role assumed via Identity Pool) to use Dashboards
    domain.addAccessPolicies(
      new PolicyStatement({
        effect: Effect.ALLOW,
        principals: [new ArnPrincipal(authenticatedRole.roleArn)],
        actions: ['es:ESHttp*'],
        resources: [domain.domainArn, `${domain.domainArn}/*`],
      }),
    )
    this.opensearchDomain = domain

    // Create timing infrastructure (S3 + Lambda merger)
    const timingResources = createTimingInfrastructure(this, {
      stageName,
      opensearchDomain: domain,
      accountId: this.account,
      region: this.region,
    })
    this.timingBucketName = timingResources.timingBucket.bucketName

    new CfnOutput(this, 'OpenSearchEndpoint', {
      value: domain.domainEndpoint,
    })

    new CfnOutput(this, 'BlobStorageBucketArn', {
      value: this.blobStorageBucket.bucketArn,
    })

    new CfnOutput(this, 'TimingBucketName', {
      value: this.timingBucketName,
      description: 'S3 bucket for raw timing analytics data',
    })

    new CfnOutput(this, 'TimingQueueUrl', {
      value: timingResources.timingQueue.queueUrl,
      description: 'SQS queue for timing events',
    })

    new CfnOutput(this, 'TimingDLQUrl', {
      value: timingResources.timingDLQ.queueUrl,
      description: 'Dead letter queue for failed timing events',
    })

    Tags.of(this).add('Project', 'Ito')
  }
}
