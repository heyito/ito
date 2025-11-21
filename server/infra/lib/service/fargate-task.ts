import { Construct } from 'constructs'
import { Stack } from 'aws-cdk-lib'
import {
  ContainerImage,
  CpuArchitecture,
  Secret as EcsSecret,
  FargateTaskDefinition,
  OperatingSystemFamily,
  AwsLogDriver,
} from 'aws-cdk-lib/aws-ecs'
import {
  Role as IamRole,
  ServicePrincipal,
  ManagedPolicy,
  Policy,
  PolicyStatement,
} from 'aws-cdk-lib/aws-iam'
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager'
import { Repository } from 'aws-cdk-lib/aws-ecr'
import { ILogGroup } from 'aws-cdk-lib/aws-logs'
import { isDev } from '../helpers'

export interface FargateTaskConfig {
  stageName: string
  serviceRepo: Repository
  dbCredentialsSecret: ISecret
  groqApiKeySecret: ISecret
  cerebrasApiKeySecret: ISecret
  stripeSecretKeySecret: ISecret
  stripeWebhookSecret: ISecret
  dbEndpoint: string
  dbName: string
  dbPort: number
  domainName: string
  clientLogGroup: ILogGroup
  serverLogGroup: ILogGroup
  blobStorageBucketName?: string
  timingBucketName?: string
}

export interface FargateTaskResources {
  taskDefinition: FargateTaskDefinition
  taskRole: IamRole
  taskExecutionRole: IamRole
  containerName: string
  taskLogsPolicy: Policy
}

export function createFargateTask(
  scope: Construct,
  config: FargateTaskConfig,
): FargateTaskResources {
  const stack = Stack.of(scope)

  const fargateTaskRole = new IamRole(scope, 'ItoFargateTaskRole', {
    assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
  })

  config.dbCredentialsSecret.grantRead(fargateTaskRole)
  config.groqApiKeySecret.grantRead(fargateTaskRole)
  config.cerebrasApiKeySecret.grantRead(fargateTaskRole)
  config.stripeSecretKeySecret.grantRead(fargateTaskRole)
  config.stripeWebhookSecret.grantRead(fargateTaskRole)

  const taskExecutionRole = new IamRole(scope, 'ItoTaskExecRole', {
    assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
    managedPolicies: [
      ManagedPolicy.fromAwsManagedPolicyName(
        'service-role/AmazonECSTaskExecutionRolePolicy',
      ),
    ],
  })

  // Grant execution role permissions to read secrets (required for ECS to pull secrets during container startup)
  config.dbCredentialsSecret.grantRead(taskExecutionRole)
  config.groqApiKeySecret.grantRead(taskExecutionRole)
  config.cerebrasApiKeySecret.grantRead(taskExecutionRole)
  config.stripeSecretKeySecret.grantRead(taskExecutionRole)
  config.stripeWebhookSecret.grantRead(taskExecutionRole)

  // Explicitly add policy statement for secrets to ensure permissions are applied correctly
  // This is a workaround for cases where grantRead() might not work correctly with fromSecretNameV2()
  taskExecutionRole.addToPolicy(
    new PolicyStatement({
      actions: [
        'secretsmanager:GetSecretValue',
        'secretsmanager:DescribeSecret',
      ],
      resources: [
        config.dbCredentialsSecret.secretArn,
        config.groqApiKeySecret.secretArn,
        config.cerebrasApiKeySecret.secretArn,
        config.stripeSecretKeySecret.secretArn,
        config.stripeWebhookSecret.secretArn,
      ],
    }),
  )

  const taskDefinition = new FargateTaskDefinition(scope, 'ItoTaskDefinition', {
    taskRole: fargateTaskRole,
    cpu: isDev(config.stageName) ? 1024 : 4096,
    memoryLimitMiB: isDev(config.stageName) ? 2048 : 8192,
    runtimePlatform: {
      operatingSystemFamily: OperatingSystemFamily.LINUX,
      cpuArchitecture: CpuArchitecture.ARM64,
    },
    executionRole: taskExecutionRole,
  })

  const containerName = 'ItoServerContainer'

  taskDefinition.addContainer(containerName, {
    image: ContainerImage.fromEcrRepository(config.serviceRepo, 'latest'),
    portMappings: [{ containerPort: 3000 }],
    secrets: {
      DB_USER: EcsSecret.fromSecretsManager(
        config.dbCredentialsSecret,
        'username',
      ),
      DB_PASS: EcsSecret.fromSecretsManager(
        config.dbCredentialsSecret,
        'password',
      ),
      GROQ_API_KEY: EcsSecret.fromSecretsManager(config.groqApiKeySecret),
      CEREBRAS_API_KEY: EcsSecret.fromSecretsManager(
        config.cerebrasApiKeySecret,
      ),
      STRIPE_SECRET_KEY: EcsSecret.fromSecretsManager(
        config.stripeSecretKeySecret,
      ),
      STRIPE_WEBHOOK_SECRET: EcsSecret.fromSecretsManager(
        config.stripeWebhookSecret,
      ),
    },
    environment: {
      DB_HOST: config.dbEndpoint,
      DB_NAME: config.dbName,
      DB_PORT: config.dbPort.toString(),
      REQUIRE_AUTH: 'true',
      AUTH0_DOMAIN: process.env.AUTH0_DOMAIN || '',
      AUTH0_AUDIENCE: process.env.AUTH0_AUDIENCE || '',
      AUTH0_CLIENT_ID: process.env.AUTH0_CLIENT_ID || '',
      AUTH0_MGMT_CLIENT_ID: process.env.AUTH0_MGMT_CLIENT_ID || '',
      AUTH0_MGMT_CLIENT_SECRET: process.env.AUTH0_MGMT_CLIENT_SECRET || '',
      AUTH0_CALLBACK_URL: `https://${config.domainName}/callback`,
      STRIPE_PRICE_ID: process.env.STRIPE_PRICE_ID || '',
      APP_PROTOCOL: process.env.APP_PROTOCOL || '',
      STRIPE_PUBLIC_BASE_URL: process.env.STRIPE_PUBLIC_BASE_URL || '',
      GROQ_TRANSCRIPTION_MODEL: 'whisper-large-v3',
      CLIENT_LOG_GROUP_NAME: config.clientLogGroup.logGroupName,
      ...(config.blobStorageBucketName && {
        BLOB_STORAGE_BUCKET: config.blobStorageBucketName,
      }),
      ...(config.timingBucketName && {
        TIMING_BUCKET: config.timingBucketName,
      }),
      ITO_ENV: config.stageName,
      SHOW_ALL_REQUEST_LOGS: 'true',
    },
    logging: new AwsLogDriver({
      streamPrefix: 'ito-server',
      logGroup: config.serverLogGroup,
    }),
  })

  const taskLogsPolicy = new Policy(scope, 'ItoTaskLogsPolicy', {
    statements: [
      new PolicyStatement({
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
          'logs:DescribeLogStreams',
          'logs:DescribeLogGroups',
        ],
        resources: [
          `arn:aws:logs:${stack.region}:${stack.account}:log-group:/ito/${config.stageName}/client`,
          `arn:aws:logs:${stack.region}:${stack.account}:log-group:/ito/${config.stageName}/client:log-stream:*`,
          `arn:aws:logs:${stack.region}:${stack.account}:log-group:/ito/${config.stageName}/server`,
          `arn:aws:logs:${stack.region}:${stack.account}:log-group:/ito/${config.stageName}/server:log-stream:*`,
        ],
      }),
    ],
  })

  fargateTaskRole.attachInlinePolicy(taskLogsPolicy)

  return {
    taskDefinition,
    taskRole: fargateTaskRole,
    taskExecutionRole,
    containerName,
    taskLogsPolicy,
  }
}
