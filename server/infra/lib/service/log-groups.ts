import { Construct } from 'constructs'
import * as cr from 'aws-cdk-lib/custom-resources'
import { PolicyStatement } from 'aws-cdk-lib/aws-iam'
import { ILogGroup, LogGroup } from 'aws-cdk-lib/aws-logs'

export interface LogGroupConfig {
  stageName: string
}

export interface LogGroupResources {
  clientLogGroup: ILogGroup
  serverLogGroup: ILogGroup
  ensureClientLogGroup: cr.AwsCustomResource
  ensureServerLogGroup: cr.AwsCustomResource
}

export function createLogGroups(
  scope: Construct,
  config: LogGroupConfig,
): LogGroupResources {
  const ensureClientLogGroup = new cr.AwsCustomResource(
    scope,
    'EnsureClientLogGroup',
    {
      onCreate: {
        service: 'CloudWatchLogs',
        action: 'createLogGroup',
        parameters: { logGroupName: `/ito/${config.stageName}/client` },
        physicalResourceId: cr.PhysicalResourceId.of(
          `loggroup-${config.stageName}-client`,
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

  const ensureServerLogGroup = new cr.AwsCustomResource(
    scope,
    'EnsureServerLogGroup',
    {
      onCreate: {
        service: 'CloudWatchLogs',
        action: 'createLogGroup',
        parameters: { logGroupName: `/ito/${config.stageName}/server` },
        physicalResourceId: cr.PhysicalResourceId.of(
          `loggroup-${config.stageName}-server`,
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

  const clientLogGroup = LogGroup.fromLogGroupName(
    scope,
    'ItoClientLogsGroup',
    `/ito/${config.stageName}/client`,
  )

  const serverLogGroup = LogGroup.fromLogGroupName(
    scope,
    'ItoServerLogsGroup',
    `/ito/${config.stageName}/server`,
  )

  return {
    clientLogGroup,
    serverLogGroup,
    ensureClientLogGroup,
    ensureServerLogGroup,
  }
}
