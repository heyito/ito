import * as aws from '@aws-sdk/client-ecs'

const ecs = new aws.ECS()

export const handler = async () => {
  console.log('Migration ECS task started')

  const { tasks } = await ecs.runTask({
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
          command: ['sh', './scripts/migrate.sh', 'up'],
        },
      ],
    },
  })

  if (!tasks || tasks.length === 0) {
    throw new Error('Failed to start ECS task')
  }

  const taskArn = tasks[0].taskArn
  console.log(`Task started: ${taskArn}`)

  let lastStatus
  let attempts = 0
  const maxAttempts = 100
  while (true) {
    if (attempts >= maxAttempts) {
      throw new Error('Migration ECS task timed out')
    }

    const { tasks: describeTasks } = await ecs.describeTasks({
      cluster: process.env.CLUSTER!,
      tasks: [taskArn!],
    })

    const task = describeTasks?.[0]
    if (!task) throw new Error('Could not describe ECS task')

    lastStatus = task.lastStatus
    console.log(`Current ECS task status: ${lastStatus}`)

    if (lastStatus === 'STOPPED') {
      const container = task.containers?.[0]
      if (container?.exitCode !== 0) {
        throw new Error(
          `Migration failed with exit code ${container?.exitCode} (reason: ${container?.reason})`,
        )
      }

      console.log('Migration ECS task completed successfully ✅')
      break
    }

    attempts++
    await new Promise(resolve => setTimeout(resolve, 5000)) // wait 5 sec before next check
  }

  return { success: true, message: 'Migration completed successfully' }
}
