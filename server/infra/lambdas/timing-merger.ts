import { S3Event } from 'aws-lambda'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { Client } from '@opensearch-project/opensearch'
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws'
import { defaultProvider } from '@aws-sdk/credential-provider-node'

const OPENSEARCH_ENDPOINT = process.env.OPENSEARCH_ENDPOINT
const OPENSEARCH_INDEX = process.env.OPENSEARCH_INDEX || 'ito-timing-analytics'
const STAGE = process.env.STAGE || 'dev'

if (!OPENSEARCH_ENDPOINT) {
  throw new Error('OPENSEARCH_ENDPOINT environment variable is required')
}

// Initialize clients
const s3Client = new S3Client({ region: process.env.AWS_REGION })
const osClient = new Client({
  ...AwsSigv4Signer({
    region: process.env.AWS_REGION || 'us-east-1',
    service: 'es',
    getCredentials: () => defaultProvider()(),
  }),
  node: `https://${OPENSEARCH_ENDPOINT}`,
})

interface TimingEvent {
  name: string
  startMs: number
  endMs?: number
  durationMs?: number
}

interface ClientTimingData {
  source: 'client'
  interactionId: string
  userId: string
  platform: string
  appVersion: string
  hostname: string
  architecture: string
  timestamp: string
  totalDurationMs: number
  events: TimingEvent[]
}

interface ServerTimingData {
  source: 'server'
  interactionId: string
  userId: string
  hostname: string
  architecture: string
  timestamp: string
  totalDurationMs: number
  events: TimingEvent[]
}

type TimingData = ClientTimingData | ServerTimingData

async function getS3Object(bucket: string, key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key })
  const response = await s3Client.send(command)

  if (!response.Body) {
    throw new Error(`No body in S3 object: ${bucket}/${key}`)
  }

  return await response.Body.transformToString()
}

async function mergeAndUpsertTimingReport(
  timingData: TimingData,
): Promise<void> {
  const { interactionId, source } = timingData

  console.log(
    `[TimingMerger] Processing ${source} timing for interaction: ${interactionId}`,
  )

  try {
    // Try to get existing document
    const existing = await osClient
      .get({
        index: OPENSEARCH_INDEX,
        id: interactionId,
      })
      .catch(() => null)

    let mergedDoc: any

    if (existing && existing.body._source) {
      // Merge with existing document
      const existingSource = existing.body._source
      console.log(
        `[TimingMerger] Found existing document for ${interactionId}, merging...`,
      )

      mergedDoc = {
        ...existingSource,
        '@timestamp': existingSource['@timestamp'] || new Date().toISOString(),
        'event.dataset': 'ito-timing-analytics',
        interaction_id: interactionId,
        user_id: timingData.userId || existingSource.user_id,
        stage: STAGE,
      }

      // Merge source-specific data
      if (source === 'client') {
        const clientData = timingData as ClientTimingData
        mergedDoc.client = {
          platform: clientData.platform,
          app_version: clientData.appVersion,
          hostname: clientData.hostname,
          architecture: clientData.architecture,
          timestamp: clientData.timestamp,
          total_duration_ms: clientData.totalDurationMs,
          events: clientData.events.map(e => ({
            name: e.name,
            start_ms: e.startMs,
            end_ms: e.endMs,
            duration_ms: e.durationMs,
          })),
        }
        // Keep existing server data if present
        if (existingSource.server) {
          mergedDoc.server = existingSource.server
        }
      } else {
        const serverData = timingData as ServerTimingData
        mergedDoc.server = {
          hostname: serverData.hostname,
          architecture: serverData.architecture,
          timestamp: serverData.timestamp,
          total_duration_ms: serverData.totalDurationMs,
          events: serverData.events.map(e => ({
            name: e.name,
            start_ms: e.startMs,
            end_ms: e.endMs,
            duration_ms: e.durationMs,
          })),
        }
        // Keep existing client data if present
        if (existingSource.client) {
          mergedDoc.client = existingSource.client
        }
      }
    } else {
      // Create new document
      console.log(
        `[TimingMerger] Creating new document for ${interactionId}...`,
      )

      mergedDoc = {
        '@timestamp': new Date().toISOString(),
        'event.dataset': 'ito-timing-analytics',
        interaction_id: interactionId,
        user_id: timingData.userId,
        stage: STAGE,
      }

      if (source === 'client') {
        const clientData = timingData as ClientTimingData
        mergedDoc.client = {
          platform: clientData.platform,
          app_version: clientData.appVersion,
          hostname: clientData.hostname,
          architecture: clientData.architecture,
          timestamp: clientData.timestamp,
          total_duration_ms: clientData.totalDurationMs,
          events: clientData.events.map(e => ({
            name: e.name,
            start_ms: e.startMs,
            end_ms: e.endMs,
            duration_ms: e.durationMs,
          })),
        }
      } else {
        const serverData = timingData as ServerTimingData
        mergedDoc.server = {
          hostname: serverData.hostname,
          architecture: serverData.architecture,
          timestamp: serverData.timestamp,
          total_duration_ms: serverData.totalDurationMs,
          events: serverData.events.map(e => ({
            name: e.name,
            start_ms: e.startMs,
            end_ms: e.endMs,
            duration_ms: e.durationMs,
          })),
        }
      }
    }

    // Upsert the merged document
    await osClient.index({
      index: OPENSEARCH_INDEX,
      id: interactionId,
      body: mergedDoc,
      refresh: false, // Don't wait for refresh for better performance
    })

    console.log(
      `[TimingMerger] Successfully merged ${source} timing for interaction: ${interactionId}`,
    )
  } catch (error) {
    console.error(
      `[TimingMerger] Failed to merge timing report for ${interactionId}:`,
      error,
    )
    throw error
  }
}

export const handler = async (event: S3Event): Promise<void> => {
  console.log(
    `[TimingMerger] Processing ${event.Records.length} S3 events`,
  )

  // Process all records in parallel
  await Promise.all(
    event.Records.map(async record => {
      try {
        const bucket = record.s3.bucket.name
        const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '))

        console.log(`[TimingMerger] Processing S3 object: ${bucket}/${key}`)

        // Read timing data from S3
        const jsonContent = await getS3Object(bucket, key)
        const timingData = JSON.parse(jsonContent) as TimingData

        // Validate required fields
        if (!timingData.interactionId || !timingData.source) {
          console.error(
            `[TimingMerger] Invalid timing data in ${key}: missing interactionId or source`,
          )
          return
        }

        // Merge and upsert to OpenSearch
        await mergeAndUpsertTimingReport(timingData)
      } catch (error) {
        console.error(
          `[TimingMerger] Failed to process record ${record.s3.object.key}:`,
          error,
        )
        // Don't throw - we want to continue processing other records
      }
    }),
  )

  console.log(`[TimingMerger] Finished processing batch`)
}
