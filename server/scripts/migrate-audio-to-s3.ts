#!/usr/bin/env tsx

/**
 * Migration script to move raw audio blobs from PostgreSQL to S3
 * This script should be run after deploying the raw_audio_id column
 */

import pool from '../src/db.js'
import { getStorageClient } from '../src/clients/s3storageClient.js'
import { v4 as uuidv4 } from 'uuid'
import { createAudioKey } from '../src/constants/storage.js'

interface InteractionRow {
  id: string
  user_id: string | null
  raw_audio: Buffer | null
  raw_audio_id: string | null
}

async function migrateAudioToS3() {
  console.log('Starting audio migration to S3...')

  try {
    const storageClient = getStorageClient()

    // Find all interactions with raw_audio but no raw_audio_id
    const result = await pool.query<InteractionRow>(`
      SELECT id, user_id, raw_audio, raw_audio_id 
      FROM interactions 
      WHERE raw_audio IS NOT NULL 
      AND raw_audio_id IS NULL 
      AND deleted_at IS NULL
      ORDER BY created_at DESC
    `)

    const interactions = result.rows
    console.log(`Found ${interactions.length} interactions to migrate`)

    if (interactions.length === 0) {
      console.log('No interactions need migration')
      return
    }

    let migrated = 0
    let failed = 0

    for (const interaction of interactions) {
      if (!interaction.raw_audio || !interaction.user_id) {
        console.log(
          `Skipping interaction ${interaction.id} - missing audio or user_id`,
        )
        continue
      }

      try {
        // Generate UUID for this audio file
        const audioUuid = uuidv4()
        const audioKey = createAudioKey(interaction.user_id, audioUuid)

        console.log(
          `Migrating interaction ${interaction.id} (${interaction.raw_audio.length} bytes)`,
        )

        // Upload to S3
        await storageClient.uploadObject(
          audioKey,
          interaction.raw_audio,
          'audio/wav',
          {
            userId: interaction.user_id,
            interactionId: interaction.id,
            migratedAt: new Date().toISOString(),
            originalSize: interaction.raw_audio.length.toString(),
          },
        )

        // Update database with UUID and clear blob
        await pool.query(
          `UPDATE interactions 
           SET raw_audio_id = $1, raw_audio = NULL, updated_at = current_timestamp 
           WHERE id = $2`,
          [audioUuid, interaction.id],
        )

        migrated++
        console.log(`✅ Migrated interaction ${interaction.id}`)

        // Add small delay to avoid overwhelming S3
        await new Promise(resolve => setTimeout(resolve, 100))
      } catch (error) {
        console.error(
          `❌ Failed to migrate interaction ${interaction.id}:`,
          error,
        )
        failed++
      }
    }

    console.log(`\n🎉 Migration complete!`)
    console.log(`✅ Migrated: ${migrated}`)
    console.log(`❌ Failed: ${failed}`)
    console.log(`📊 Total: ${interactions.length}`)

    // Verify migration
    const remainingResult = await pool.query(`
      SELECT COUNT(*) as count 
      FROM interactions 
      WHERE raw_audio IS NOT NULL 
      AND raw_audio_id IS NULL 
      AND deleted_at IS NULL
    `)

    const remaining = parseInt(remainingResult.rows[0].count)
    if (remaining > 0) {
      console.log(`⚠️  Warning: ${remaining} interactions still need migration`)
    } else {
      console.log(`✅ All interactions have been migrated successfully`)
    }
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateAudioToS3().catch(console.error)
}

export { migrateAudioToS3 }
