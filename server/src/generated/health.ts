import type * as grpc from '@grpc/grpc-js';
import type { MessageTypeDefinition } from '@grpc/proto-loader';

import type { HealthClient as _grpc_health_v1_HealthClient, HealthDefinition as _grpc_health_v1_HealthDefinition } from './grpc/health/v1/Health';

type SubtypeConstructor<Constructor extends new (...args: any) => any, Subtype> = {
  new(...args: ConstructorParameters<Constructor>): Subtype;
};

export interface ProtoGrpcType {
  grpc: {
    health: {
      v1: {
        Health: SubtypeConstructor<typeof grpc.Client, _grpc_health_v1_HealthClient> & { service: _grpc_health_v1_HealthDefinition }
        HealthCheckRequest: MessageTypeDefinition
        HealthCheckResponse: MessageTypeDefinition
      }
    }
  }
}

