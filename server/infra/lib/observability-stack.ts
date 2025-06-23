import { Stack, StackProps, Tags } from 'aws-cdk-lib'
import { Alarm } from 'aws-cdk-lib/aws-cloudwatch'
import { FargateService } from 'aws-cdk-lib/aws-ecs'
import { Construct } from 'constructs'

export interface ObservabilityStackProps extends StackProps {
  fargateService: FargateService
}

export class ObservabilityStack extends Stack {
  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props)

    new Alarm(this, 'HighItoFargateCpu', {
      metric: props.fargateService.metricCpuUtilization(),
      threshold: 80,
      evaluationPeriods: 2,
      alarmDescription: 'Fargate CPU > 80% for 2 periods',
    })

    Tags.of(this).add('Project', 'Ito')
  }
}
