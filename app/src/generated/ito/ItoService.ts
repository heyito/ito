// Original file: src/ito.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { AudioChunk as _ito_AudioChunk, AudioChunk__Output as _ito_AudioChunk__Output } from '../ito/AudioChunk.js';
import type { HealthCheckRequest as _ito_HealthCheckRequest, HealthCheckRequest__Output as _ito_HealthCheckRequest__Output } from '../ito/HealthCheckRequest.js';
import type { HealthCheckResponse as _ito_HealthCheckResponse, HealthCheckResponse__Output as _ito_HealthCheckResponse__Output } from '../ito/HealthCheckResponse.js';
import type { TranscribeFileRequest as _ito_TranscribeFileRequest, TranscribeFileRequest__Output as _ito_TranscribeFileRequest__Output } from '../ito/TranscribeFileRequest.js';
import type { TranscriptionResponse as _ito_TranscriptionResponse, TranscriptionResponse__Output as _ito_TranscriptionResponse__Output } from '../ito/TranscriptionResponse.js';

export interface ItoServiceClient extends grpc.Client {
  HealthCheck(argument: _ito_HealthCheckRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ito_HealthCheckResponse__Output>): grpc.ClientUnaryCall;
  HealthCheck(argument: _ito_HealthCheckRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ito_HealthCheckResponse__Output>): grpc.ClientUnaryCall;
  HealthCheck(argument: _ito_HealthCheckRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ito_HealthCheckResponse__Output>): grpc.ClientUnaryCall;
  HealthCheck(argument: _ito_HealthCheckRequest, callback: grpc.requestCallback<_ito_HealthCheckResponse__Output>): grpc.ClientUnaryCall;
  healthCheck(argument: _ito_HealthCheckRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ito_HealthCheckResponse__Output>): grpc.ClientUnaryCall;
  healthCheck(argument: _ito_HealthCheckRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ito_HealthCheckResponse__Output>): grpc.ClientUnaryCall;
  healthCheck(argument: _ito_HealthCheckRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ito_HealthCheckResponse__Output>): grpc.ClientUnaryCall;
  healthCheck(argument: _ito_HealthCheckRequest, callback: grpc.requestCallback<_ito_HealthCheckResponse__Output>): grpc.ClientUnaryCall;
  
  TranscribeFile(argument: _ito_TranscribeFileRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ito_TranscriptionResponse__Output>): grpc.ClientUnaryCall;
  TranscribeFile(argument: _ito_TranscribeFileRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ito_TranscriptionResponse__Output>): grpc.ClientUnaryCall;
  TranscribeFile(argument: _ito_TranscribeFileRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ito_TranscriptionResponse__Output>): grpc.ClientUnaryCall;
  TranscribeFile(argument: _ito_TranscribeFileRequest, callback: grpc.requestCallback<_ito_TranscriptionResponse__Output>): grpc.ClientUnaryCall;
  transcribeFile(argument: _ito_TranscribeFileRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ito_TranscriptionResponse__Output>): grpc.ClientUnaryCall;
  transcribeFile(argument: _ito_TranscribeFileRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ito_TranscriptionResponse__Output>): grpc.ClientUnaryCall;
  transcribeFile(argument: _ito_TranscribeFileRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ito_TranscriptionResponse__Output>): grpc.ClientUnaryCall;
  transcribeFile(argument: _ito_TranscribeFileRequest, callback: grpc.requestCallback<_ito_TranscriptionResponse__Output>): grpc.ClientUnaryCall;
  
  TranscribeStream(metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ito_TranscriptionResponse__Output>): grpc.ClientWritableStream<_ito_AudioChunk>;
  TranscribeStream(metadata: grpc.Metadata, callback: grpc.requestCallback<_ito_TranscriptionResponse__Output>): grpc.ClientWritableStream<_ito_AudioChunk>;
  TranscribeStream(options: grpc.CallOptions, callback: grpc.requestCallback<_ito_TranscriptionResponse__Output>): grpc.ClientWritableStream<_ito_AudioChunk>;
  TranscribeStream(callback: grpc.requestCallback<_ito_TranscriptionResponse__Output>): grpc.ClientWritableStream<_ito_AudioChunk>;
  transcribeStream(metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ito_TranscriptionResponse__Output>): grpc.ClientWritableStream<_ito_AudioChunk>;
  transcribeStream(metadata: grpc.Metadata, callback: grpc.requestCallback<_ito_TranscriptionResponse__Output>): grpc.ClientWritableStream<_ito_AudioChunk>;
  transcribeStream(options: grpc.CallOptions, callback: grpc.requestCallback<_ito_TranscriptionResponse__Output>): grpc.ClientWritableStream<_ito_AudioChunk>;
  transcribeStream(callback: grpc.requestCallback<_ito_TranscriptionResponse__Output>): grpc.ClientWritableStream<_ito_AudioChunk>;
  
}

export interface ItoServiceHandlers extends grpc.UntypedServiceImplementation {
  HealthCheck: grpc.handleUnaryCall<_ito_HealthCheckRequest__Output, _ito_HealthCheckResponse>;
  
  TranscribeFile: grpc.handleUnaryCall<_ito_TranscribeFileRequest__Output, _ito_TranscriptionResponse>;
  
  TranscribeStream: grpc.handleClientStreamingCall<_ito_AudioChunk__Output, _ito_TranscriptionResponse>;
  
}

export interface ItoServiceDefinition extends grpc.ServiceDefinition {
  HealthCheck: MethodDefinition<_ito_HealthCheckRequest, _ito_HealthCheckResponse, _ito_HealthCheckRequest__Output, _ito_HealthCheckResponse__Output>
  TranscribeFile: MethodDefinition<_ito_TranscribeFileRequest, _ito_TranscriptionResponse, _ito_TranscribeFileRequest__Output, _ito_TranscriptionResponse__Output>
  TranscribeStream: MethodDefinition<_ito_AudioChunk, _ito_TranscriptionResponse, _ito_AudioChunk__Output, _ito_TranscriptionResponse__Output>
}
