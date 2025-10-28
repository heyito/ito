import {
  CloudWatchLogsClient,
  CreateLogStreamCommand,
  PutLogEventsCommand,
  DescribeLogStreamsCommand,
} from '@aws-sdk/client-cloudwatch-logs'

export interface CloudWatchLogEntry {
  timestamp: number
  message: string
}

/**
 * Shared CloudWatch logger for both client logs and timing analytics
 */
export class CloudWatchLogger {
  private logsClient: CloudWatchLogsClient | null
  private logGroupName: string | null
  private logStreamName: string | null
  private nextSequenceToken: string | undefined

  constructor(logGroupName?: string | null, logStreamNameSuffix?: string) {
    this.logGroupName = logGroupName || null
    this.logsClient = logGroupName ? new CloudWatchLogsClient({}) : null
    this.logStreamName = logGroupName
      ? `${logStreamNameSuffix || 'logs'}-${new Date().toISOString().slice(0, 10)}`
      : null
  }

  /**
   * Ensure the CloudWatch log stream exists
   */
  async ensureStream(): Promise<void> {
    if (!this.logsClient || !this.logGroupName || !this.logStreamName) return

    try {
      await this.logsClient.send(
        new CreateLogStreamCommand({
          logGroupName: this.logGroupName,
          logStreamName: this.logStreamName,
        }),
      )
    } catch (err: any) {
      if (err?.name !== 'ResourceAlreadyExistsException') {
        throw err
      }
    }

    const desc = await this.logsClient.send(
      new DescribeLogStreamsCommand({
        logGroupName: this.logGroupName,
        logStreamNamePrefix: this.logStreamName,
        limit: 1,
      }),
    )

    const stream = desc.logStreams?.[0]
    this.nextSequenceToken = stream?.uploadSequenceToken
  }

  /**
   * Send log entries to CloudWatch
   * Returns true if CloudWatch is configured, false otherwise
   */
  async sendLogs(entries: CloudWatchLogEntry[]): Promise<boolean> {
    // If no CloudWatch client configured, return false
    if (!this.logsClient || !this.logGroupName || !this.logStreamName) {
      return false
    }

    // Sort entries by timestamp
    entries.sort((a, b) => a.timestamp - b.timestamp)

    try {
      const params = {
        logGroupName: this.logGroupName,
        logStreamName: this.logStreamName,
        logEvents: entries,
        sequenceToken: this.nextSequenceToken,
      }

      const res = await this.logsClient.send(new PutLogEventsCommand(params))
      this.nextSequenceToken = res.nextSequenceToken
      return true
    } catch (err: any) {
      // Retry once on sequence token error
      if (err?.name === 'InvalidSequenceTokenException') {
        await this.ensureStream()

        const res = await this.logsClient.send(
          new PutLogEventsCommand({
            logGroupName: this.logGroupName,
            logStreamName: this.logStreamName,
            logEvents: entries,
            sequenceToken: this.nextSequenceToken,
          }),
        )

        this.nextSequenceToken = res.nextSequenceToken
        return true
      }

      return false
    }
  }

  /**
   * Check if CloudWatch is configured
   */
  isConfigured(): boolean {
    return !!(this.logsClient && this.logGroupName && this.logStreamName)
  }
}
