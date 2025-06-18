// Original file: node_modules/grpc-health-check/proto/health/v1/health.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { HealthCheckRequest as _grpc_health_v1_HealthCheckRequest, HealthCheckRequest__Output as _grpc_health_v1_HealthCheckRequest__Output } from '../../../grpc/health/v1/HealthCheckRequest.js';
import type { HealthCheckResponse as _grpc_health_v1_HealthCheckResponse, HealthCheckResponse__Output as _grpc_health_v1_HealthCheckResponse__Output } from '../../../grpc/health/v1/HealthCheckResponse.js';

export interface HealthClient extends grpc.Client {
  Check(argument: _grpc_health_v1_HealthCheckRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_grpc_health_v1_HealthCheckResponse__Output>): grpc.ClientUnaryCall;
  Check(argument: _grpc_health_v1_HealthCheckRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_grpc_health_v1_HealthCheckResponse__Output>): grpc.ClientUnaryCall;
  Check(argument: _grpc_health_v1_HealthCheckRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_grpc_health_v1_HealthCheckResponse__Output>): grpc.ClientUnaryCall;
  Check(argument: _grpc_health_v1_HealthCheckRequest, callback: grpc.requestCallback<_grpc_health_v1_HealthCheckResponse__Output>): grpc.ClientUnaryCall;
  check(argument: _grpc_health_v1_HealthCheckRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_grpc_health_v1_HealthCheckResponse__Output>): grpc.ClientUnaryCall;
  check(argument: _grpc_health_v1_HealthCheckRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_grpc_health_v1_HealthCheckResponse__Output>): grpc.ClientUnaryCall;
  check(argument: _grpc_health_v1_HealthCheckRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_grpc_health_v1_HealthCheckResponse__Output>): grpc.ClientUnaryCall;
  check(argument: _grpc_health_v1_HealthCheckRequest, callback: grpc.requestCallback<_grpc_health_v1_HealthCheckResponse__Output>): grpc.ClientUnaryCall;
  
  Watch(argument: _grpc_health_v1_HealthCheckRequest, metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientReadableStream<_grpc_health_v1_HealthCheckResponse__Output>;
  Watch(argument: _grpc_health_v1_HealthCheckRequest, options?: grpc.CallOptions): grpc.ClientReadableStream<_grpc_health_v1_HealthCheckResponse__Output>;
  watch(argument: _grpc_health_v1_HealthCheckRequest, metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientReadableStream<_grpc_health_v1_HealthCheckResponse__Output>;
  watch(argument: _grpc_health_v1_HealthCheckRequest, options?: grpc.CallOptions): grpc.ClientReadableStream<_grpc_health_v1_HealthCheckResponse__Output>;
  
}

export interface HealthHandlers extends grpc.UntypedServiceImplementation {
  Check: grpc.handleUnaryCall<_grpc_health_v1_HealthCheckRequest__Output, _grpc_health_v1_HealthCheckResponse>;
  
  Watch: grpc.handleServerStreamingCall<_grpc_health_v1_HealthCheckRequest__Output, _grpc_health_v1_HealthCheckResponse>;
  
}

export interface HealthDefinition extends grpc.ServiceDefinition {
  Check: MethodDefinition<_grpc_health_v1_HealthCheckRequest, _grpc_health_v1_HealthCheckResponse, _grpc_health_v1_HealthCheckRequest__Output, _grpc_health_v1_HealthCheckResponse__Output>
  Watch: MethodDefinition<_grpc_health_v1_HealthCheckRequest, _grpc_health_v1_HealthCheckResponse, _grpc_health_v1_HealthCheckRequest__Output, _grpc_health_v1_HealthCheckResponse__Output>
}
