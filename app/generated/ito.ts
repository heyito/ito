import type * as grpc from '@grpc/grpc-js';
import type { MessageTypeDefinition } from '@grpc/proto-loader';

import type { ItoServiceClient as _ito_ItoServiceClient, ItoServiceDefinition as _ito_ItoServiceDefinition } from './ito/ItoService';

type SubtypeConstructor<Constructor extends new (...args: any) => any, Subtype> = {
  new(...args: ConstructorParameters<Constructor>): Subtype;
};

export interface ProtoGrpcType {
  ito: {
    AudioChunk: MessageTypeDefinition
    ItoService: SubtypeConstructor<typeof grpc.Client, _ito_ItoServiceClient> & { service: _ito_ItoServiceDefinition }
    TranscribeFileRequest: MessageTypeDefinition
    TranscriptionResponse: MessageTypeDefinition
  }
}

