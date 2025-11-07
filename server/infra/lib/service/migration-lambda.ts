import { Construct } from 'constructs'
import { Duration } from 'aws-cdk-lib'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { PolicyStatement } from 'aws-cdk-lib/aws-iam'
import { LogGroup } from 'aws-cdk-lib/aws-logs'
import * as cr from 'aws-cdk-lib/custom-resources'
import {
  FargateTaskDefinition,
  FargateService,
  Cluster,
} from 'aws-cdk-lib/aws-ecs'
import { Vpc } from 'aws-cdk-lib/aws-ec2'
import { IRole } from 'aws-cdk-lib/aws-iam'

export interface MigrationLambdaConfig {
  stageName: string
  dbName: string
  cluster: Cluster
  taskDefinition: FargateTaskDefinition
  vpc: Vpc
  fargateService: FargateService
  containerName: string
  taskExecutionRole: IRole
  taskRole: IRole
}

export interface MigrationLambdaResources {
  migrationLambda: NodejsFunction
}

export function createMigrationLambda(
  scope: Construct,
  config: MigrationLambdaConfig,
): MigrationLambdaResources {
  const logGroupName = `/aws/lambda/${config.stageName}-${config.dbName}-migration`

  // Ensure log group exists (handles case where it already exists)
  const ensureLogGroup = new cr.AwsCustomResource(
    scope,
    'EnsureMigrationLogGroup',
    {
      onCreate: {
        service: 'CloudWatchLogs',
        action: 'createLogGroup',
        parameters: { logGroupName },
        physicalResourceId: cr.PhysicalResourceId.of(
          `loggroup-${config.stageName}-migration`,
        ),
        ignoreErrorCodesMatching: 'ResourceAlreadyExistsException',
      },
      onUpdate: {
        service: 'CloudWatchLogs',
        action: 'createLogGroup',
        parameters: { logGroupName },
        physicalResourceId: cr.PhysicalResourceId.of(
          `loggroup-${config.stageName}-migration`,
        ),
        ignoreErrorCodesMatching: 'ResourceAlreadyExistsException',
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new PolicyStatement({
          actions: ['logs:CreateLogGroup'],
          resources: ['*'],
        }),
      ]),
    },
  )

  const logGroup = LogGroup.fromLogGroupName(
    scope,
    'MigrationLambdaLogGroup',
    logGroupName,
  )

  const migrationLambda = new NodejsFunction(scope, 'ItoMigrationLambda', {
    functionName: `${config.stageName}-${config.dbName}-migration`,
    entry: 'lambdas/run-migration.ts',
    handler: 'handler',
    logGroup,
    environment: {
      CLUSTER: config.cluster.clusterName,
      TASK_DEF: config.taskDefinition.taskDefinitionArn,
      SUBNETS: config.vpc.privateSubnets.map(s => s.subnetId).join(','),
      SECURITY_GROUPS:
        config.fargateService.connections.securityGroups[0].securityGroupId,
      STAGE_NAME: config.stageName,
      CONTAINER_NAME: config.containerName,
    },
    timeout: Duration.minutes(10),
  })

  // Ensure log group is created before Lambda
  migrationLambda.node.addDependency(ensureLogGroup)

  migrationLambda.addToRolePolicy(
    new PolicyStatement({
      actions: ['ecs:RunTask'],
      resources: [config.taskDefinition.taskDefinitionArn],
    }),
  )

  migrationLambda.addToRolePolicy(
    new PolicyStatement({
      actions: ['ecs:DescribeTasks'],
      resources: ['*'],
    }),
  )

  migrationLambda.addToRolePolicy(
    new PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [config.taskExecutionRole.roleArn, config.taskRole.roleArn],
      conditions: {
        StringEquals: {
          'iam:PassedToService': 'ecs-tasks.amazonaws.com',
        },
      },
    }),
  )

  return {
    migrationLambda,
  }
}
