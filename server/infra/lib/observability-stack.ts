import { Stack, StackProps, Stage, Tags } from 'aws-cdk-lib'
import { Alarm } from 'aws-cdk-lib/aws-cloudwatch'
import { FargateService } from 'aws-cdk-lib/aws-ecs'
import { Construct } from 'constructs'
import { AppStage } from '../bin/infra'

export interface ObservabilityStackProps extends StackProps {
  fargateService: FargateService
}

export class ObservabilityStack extends Stack {
  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props)

    const stage = Stage.of(this) as AppStage
    const stageName = stage.stageName

    new Alarm(this, `${stageName}-HighItoFargateCpu`, {
      metric: props.fargateService.metricCpuUtilization(),
      threshold: 80,
      evaluationPeriods: 2,
      alarmDescription: 'Fargate CPU > 80% for 2 periods',
    })

    Tags.of(this).add('Project', 'Ito')
  }
}
