// Original file: src/ito.proto


export interface TranscribeFileRequest {
  'audioData'?: (Buffer | Uint8Array | string);
}

export interface TranscribeFileRequest__Output {
  'audioData'?: (Buffer);
}
