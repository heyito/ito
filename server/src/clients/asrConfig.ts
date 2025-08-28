export interface TranscriptionOptions {
  fileType?: string
  asrModel?: string
  vocabulary?: string[]
  noSpeechThreshold?: number
  lowQualityThreshold?: number
}
