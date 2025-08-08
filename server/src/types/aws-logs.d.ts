declare module '@aws-sdk/client-cloudwatch-logs' {
  export class CloudWatchLogsClient {
    constructor(config?: unknown)
    send(command: unknown): Promise<any>
  }

  export class CreateLogStreamCommand {
    constructor(input: unknown)
  }

  export class PutLogEventsCommand {
    constructor(input: unknown)
  }

  export class DescribeLogStreamsCommand {
    constructor(input: unknown)
  }
}
