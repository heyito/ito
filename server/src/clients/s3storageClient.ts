import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommandInput,
  GetObjectCommandInput,
  DeleteObjectCommandInput,
  ListObjectsV2CommandInput,
  HeadObjectCommandInput,
} from '@aws-sdk/client-s3'
import { Readable } from 'stream'

export class S3StorageClient {
  private s3Client: S3Client
  private bucketName: string
  private bucketChecked: boolean = false

  constructor() {
    const bucketName = process.env.BLOB_STORAGE_BUCKET
    if (!bucketName) {
      throw new Error('BLOB_STORAGE_BUCKET environment variable is not set')
    }

    this.bucketName = bucketName
    
    // Configure S3 client with support for MinIO/local development
    const s3Config: any = {
      region: process.env.AWS_REGION || 'us-west-2',
    }

    // If S3_ENDPOINT is set, we're using MinIO or another S3-compatible service
    if (process.env.S3_ENDPOINT) {
      s3Config.endpoint = process.env.S3_ENDPOINT
      s3Config.forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true'
      
      // Use explicit credentials for local development
      if (process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY) {
        s3Config.credentials = {
          accessKeyId: process.env.S3_ACCESS_KEY_ID,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        }
      }
    }

    this.s3Client = new S3Client(s3Config)
  }

  private async ensureBucketExists(): Promise<void> {
    if (this.bucketChecked) {
      return
    }

    try {
      // Check if bucket exists
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucketName }))
      this.bucketChecked = true
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        try {
          // Create bucket if it doesn't exist
          console.log(`Creating bucket: ${this.bucketName}`)
          await this.s3Client.send(new CreateBucketCommand({ Bucket: this.bucketName }))
          this.bucketChecked = true
          console.log(`✅ Created bucket: ${this.bucketName}`)
        } catch (createError: any) {
          console.error(`Failed to create bucket ${this.bucketName}:`, createError)
          throw createError
        }
      } else {
        console.error(`Failed to check bucket ${this.bucketName}:`, error)
        throw error
      }
    }
  }

  async uploadObject(
    key: string,
    body: Buffer | Uint8Array | string | Readable,
    contentType?: string,
    metadata?: Record<string, string>,
  ): Promise<void> {
    await this.ensureBucketExists()

    const params: PutObjectCommandInput = {
      Bucket: this.bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata,
    }

    await this.s3Client.send(new PutObjectCommand(params))
  }

  async getObject(key: string): Promise<{
    body: Readable | undefined
    contentType?: string
    metadata?: Record<string, string>
  }> {
    const params: GetObjectCommandInput = {
      Bucket: this.bucketName,
      Key: key,
    }

    const response = await this.s3Client.send(new GetObjectCommand(params))

    return {
      body: response.Body as Readable,
      contentType: response.ContentType,
      metadata: response.Metadata,
    }
  }

  async deleteObject(key: string): Promise<void> {
    const params: DeleteObjectCommandInput = {
      Bucket: this.bucketName,
      Key: key,
    }

    await this.s3Client.send(new DeleteObjectCommand(params))
  }

  async listObjects(
    prefix?: string,
    maxKeys?: number,
  ): Promise<{
    keys: string[]
    isTruncated: boolean
  }> {
    const params: ListObjectsV2CommandInput = {
      Bucket: this.bucketName,
      Prefix: prefix,
      MaxKeys: maxKeys,
    }

    const response = await this.s3Client.send(new ListObjectsV2Command(params))

    return {
      keys: response.Contents?.map(item => item.Key!).filter(Boolean) || [],
      isTruncated: response.IsTruncated || false,
    }
  }

  async objectExists(key: string): Promise<boolean> {
    const params: HeadObjectCommandInput = {
      Bucket: this.bucketName,
      Key: key,
    }

    try {
      await this.s3Client.send(new HeadObjectCommand(params))
      return true
    } catch (error: any) {
      if (
        error.name === 'NotFound' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        return false
      }
      throw error
    }
  }

  async getObjectUrl(key: string, _expiresIn?: number): Promise<string> {
    // For public buckets or when using CloudFront
    // TODO: Implement presigned URL generation when needed
    return `https://${this.bucketName}.s3.amazonaws.com/${key}`
  }

  getBucketName(): string {
    return this.bucketName
  }
}

// Singleton instance
let storageClient: S3StorageClient | null = null

export function getStorageClient(): S3StorageClient {
  if (!storageClient) {
    storageClient = new S3StorageClient()
  }
  return storageClient
}
