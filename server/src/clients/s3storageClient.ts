import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
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

  constructor() {
    const bucketName = process.env.BLOB_STORAGE_BUCKET
    if (!bucketName) {
      throw new Error('BLOB_STORAGE_BUCKET environment variable is not set')
    }

    this.bucketName = bucketName
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-west-2',
    })
  }

  async uploadObject(
    key: string,
    body: Buffer | Uint8Array | string | Readable,
    contentType?: string,
    metadata?: Record<string, string>,
  ): Promise<void> {
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
