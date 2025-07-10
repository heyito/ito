import * as aws from '@aws-sdk/client-ecs'

const ecs = new aws.ECS()

export const handler = async () => {
  console.log('Migration ECS task started')

  await ecs.runTask({
    cluster: process.env.CLUSTER!,
    taskDefinition: process.env.TASK_DEF!,
    launchType: 'FARGATE',
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: process.env.SUBNETS!.split(','),
        securityGroups: [process.env.SECURITY_GROUPS!],
        assignPublicIp: 'DISABLED',
      },
    },
    overrides: {
      containerOverrides: [
        {
          name: process.env.CONTAINER_NAME!,
          command: ['bun', 'run', 'db:migrate'],
        },
      ],
    },
  })

  console.log('Migration ECS task completed')
}
