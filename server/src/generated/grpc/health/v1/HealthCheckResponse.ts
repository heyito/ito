// Original file: node_modules/grpc-health-check/proto/health/v1/health.proto


// Original file: node_modules/grpc-health-check/proto/health/v1/health.proto

export const _grpc_health_v1_HealthCheckResponse_ServingStatus = {
  UNKNOWN: 0,
  SERVING: 1,
  NOT_SERVING: 2,
  SERVICE_UNKNOWN: 3,
} as const;

export type _grpc_health_v1_HealthCheckResponse_ServingStatus =
  | 'UNKNOWN'
  | 0
  | 'SERVING'
  | 1
  | 'NOT_SERVING'
  | 2
  | 'SERVICE_UNKNOWN'
  | 3

export type _grpc_health_v1_HealthCheckResponse_ServingStatus__Output = typeof _grpc_health_v1_HealthCheckResponse_ServingStatus[keyof typeof _grpc_health_v1_HealthCheckResponse_ServingStatus]

export interface HealthCheckResponse {
  'status'?: (_grpc_health_v1_HealthCheckResponse_ServingStatus);
}

export interface HealthCheckResponse__Output {
  'status'?: (_grpc_health_v1_HealthCheckResponse_ServingStatus__Output);
}
