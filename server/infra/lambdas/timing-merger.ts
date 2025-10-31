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
  timestamp: string
  totalDurationMs: number
  events: TimingEvent[]
}

type TimingData = ClientTimingData | ServerTimingData

interface MergedEvent {
  source: 'client' | 'server'
  name: string
  start_ms: number
  end_ms?: number
  duration_ms?: number
}

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

      // Start with existing document structure
      mergedDoc = {
        ...existingSource,
        '@timestamp': existingSource['@timestamp'] || new Date().toISOString(),
        'event.dataset': 'ito-timing-analytics',
        interaction_id: interactionId,
        user_id: timingData.userId || existingSource.user_id,
        stage: STAGE,
      }

      // Get existing events or initialize empty array
      const existingEvents: MergedEvent[] = existingSource.events || []

      // Add new events with source tag
      const newEvents: MergedEvent[] = timingData.events.map(e => ({
        source: source,
        name: e.name,
        start_ms: e.startMs,
        end_ms: e.endMs,
        duration_ms: e.durationMs,
      }))

      // Combine events (filter out duplicates from same source)
      const filteredExisting = existingEvents.filter(
        (e: MergedEvent) => e.source !== source,
      )
      mergedDoc.events = [...filteredExisting, ...newEvents]

      // Update @timestamp to earliest event across all sources
      const allEvents = mergedDoc.events as MergedEvent[]
      if (allEvents.length > 0) {
        const earliestMs = Math.min(...allEvents.map(e => e.start_ms))
        mergedDoc['@timestamp'] = new Date(earliestMs).toISOString()
      }

      // Update data completeness
      const hasClient = allEvents.some((e: MergedEvent) => e.source === 'client')
      const hasServer = allEvents.some((e: MergedEvent) => e.source === 'server')
      mergedDoc.data_completeness = hasClient && hasServer ? 'both' : hasClient ? 'client_only' : 'server_only'

      // Update source-specific metadata and track receipt time
      if (source === 'client') {
        const clientData = timingData as ClientTimingData
        mergedDoc.client_metadata = {
          platform: clientData.platform,
          app_version: clientData.appVersion,
          hostname: clientData.hostname,
        }
        mergedDoc.client_total_duration_ms = clientData.totalDurationMs
        mergedDoc.client_received_at = new Date().toISOString()
      } else {
        mergedDoc.server_total_duration_ms = timingData.totalDurationMs
        mergedDoc.server_received_at = new Date().toISOString()
      }
    } else {
      // Create new document
      console.log(
        `[TimingMerger] Creating new document for ${interactionId}...`,
      )

      // Map events with source tag
      const events: MergedEvent[] = timingData.events.map(e => ({
        source: source,
        name: e.name,
        start_ms: e.startMs,
        end_ms: e.endMs,
        duration_ms: e.durationMs,
      }))

      // Use earliest event as document timestamp
      const earliestEventMs =
        events.length > 0 ? Math.min(...events.map(e => e.start_ms)) : Date.now()

      mergedDoc = {
        '@timestamp': new Date(earliestEventMs).toISOString(),
        'event.dataset': 'ito-timing-analytics',
        interaction_id: interactionId,
        user_id: timingData.userId,
        stage: STAGE,
        events: events,
        data_completeness: source === 'client' ? 'client_only' : 'server_only',
      }

      // Track when each source's data arrived
      if (source === 'client') {
        mergedDoc.client_received_at = new Date().toISOString()
      } else {
        mergedDoc.server_received_at = new Date().toISOString()
      }

      // Add source-specific metadata
      if (source === 'client') {
        const clientData = timingData as ClientTimingData
        mergedDoc.client_metadata = {
          platform: clientData.platform,
          app_version: clientData.appVersion,
          hostname: clientData.hostname,
        }
        mergedDoc.client_total_duration_ms = clientData.totalDurationMs
      } else {
        mergedDoc.server_total_duration_ms = timingData.totalDurationMs
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
