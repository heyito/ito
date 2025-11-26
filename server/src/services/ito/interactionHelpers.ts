import { v4 as uuidv4 } from 'uuid'
import { getStorageClient } from '../../clients/s3storageClient.js'
import { createAudioKey } from '../../constants/storage.js'
import { InteractionsRepository } from '../../db/repo.js'
import type { Interaction } from '../../db/models.js'

export interface CreateInteractionParams {
  id: string
  userId: string
  title: string
  asrOutput: string
  llmOutput: string | null
  durationMs: number
  rawAudio?: Buffer
}

/**
 * Creates an interaction in the database, optionally uploading audio to S3.
 * This helper is shared between the gRPC createInteraction endpoint and
 * the transcribeStreamV2Handler.
 */
export async function createInteractionWithAudio(
  params: CreateInteractionParams,
): Promise<Interaction> {
  const { id, userId, title, asrOutput, llmOutput, durationMs, rawAudio } =
    params

  let rawAudioId: string | undefined

  // If raw audio is provided, upload to S3
  if (rawAudio && rawAudio.length > 0) {
    const storageClient = getStorageClient()
    rawAudioId = uuidv4()
    const audioKey = createAudioKey(userId, rawAudioId)

    await storageClient.uploadObject(
      audioKey,
      rawAudio,
      undefined, // ContentType
      {
        userId,
        interactionId: id,
        timestamp: new Date().toISOString(),
      },
    )

    console.log(
      `✅ [${new Date().toISOString()}] Uploaded audio to S3: ${audioKey}`,
    )
  }

  // Create interaction in database
  const interaction = await InteractionsRepository.create({
    id,
    userId,
    title,
    asrOutput,
    llmOutput,
    rawAudioId,
    durationMs,
  })

  console.log(`✅ [${new Date().toISOString()}] Created interaction: ${id}`)

  return interaction
}
