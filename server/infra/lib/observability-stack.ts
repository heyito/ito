import { Stack, StackProps, Stage, Tags } from 'aws-cdk-lib'
import { Alarm } from 'aws-cdk-lib/aws-cloudwatch'
import { Construct } from 'constructs'
import { AppStage } from '../bin/infra'
import { Topic } from 'aws-cdk-lib/aws-sns'
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions'
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns'

export interface ObservabilityStackProps extends StackProps {
  albFargate: ApplicationLoadBalancedFargateService
}

export class ObservabilityStack extends Stack {
  public readonly alertTopic: Topic

  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props)

    const stage = Stage.of(this) as AppStage
    const stageName = stage.stageName

    const alertTopic = new Topic(this, 'ItoAlarmTopic', {
      topicName: `${stageName}-ito-alarms`,
      displayName: `Ito service alarms for ${stageName}`,
    })
    this.alertTopic = alertTopic

    const snsAction = new SnsAction(alertTopic)

    new Alarm(this, `${stageName}-HighItoFargateCpu`, {
      metric: props.albFargate.service.metricCpuUtilization(),
      threshold: 80,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      alarmDescription: 'Fargate CPU > 80% for 2 consecutive periods',
      actionsEnabled: true,
      alarmName: `${stageName}-ito-cpu-high`,
    }).addAlarmAction(snsAction)

    new Alarm(this, `${stageName}-HighItoFargateMemory`, {
      metric: props.albFargate.service.metricMemoryUtilization(),
      threshold: 75,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      alarmDescription: 'Fargate Memory > 75% for 2 consecutive periods',
      actionsEnabled: true,
      alarmName: `${stageName}-ito-memory-high`,
    }).addAlarmAction(snsAction)

    new Alarm(this, `${stageName}-ItoUnhealthyTasks`, {
      metric: props.albFargate.targetGroup.metrics.unhealthyHostCount(),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'There is at least 1 unhealthy task in the service',
      actionsEnabled: true,
      alarmName: `${stageName}-ito-unhealthy-tasks`,
    }).addAlarmAction(snsAction)

    Tags.of(this).add('Project', 'Ito')
  }
}
