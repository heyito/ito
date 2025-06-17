import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
// Correct path to the generated types
import { ProtoGrpcType } from "./generated/ito";
// Correct path to the generated service handler type
import { ItoServiceHandlers } from "./generated/ito/ItoService";
import { PassThrough } from "stream";

// Correct path to the proto file
const PROTO_PATH = "./src/ito.proto";

const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const itoProto = grpc.loadPackageDefinition(packageDefinition) as unknown as ProtoGrpcType;

// Use a consistent name for the server implementation
const itoServer: ItoServiceHandlers = {
  /**
   * Implementation for the Unary (whole file) RPC method.
   */
  TranscribeFile(call, callback) {
    // Add a check to ensure audio_data exists
    if (!call.request.audioData) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        details: "No audio data received",
      });
    }

    console.log("Received TranscribeFile request.");
    const audioData: Buffer = call.request.audioData;

    console.log(`Processing audio file of size: ${audioData.length} bytes.`);
    // TODO: Replace with actual call to Groq/Gemini STT
    const dummyTranscript = "This is a transcript from the whole file.";

    callback(null, { transcript: dummyTranscript });
  },

  /**
   * Implementation for the Client-Streaming RPC method.
   */
  TranscribeStream(call, callback) {
    console.log("Client has started streaming audio.");
    const audioChunks: Buffer[] = [];

    call.on("data", (chunk: { audio_data: Buffer }) => {
      console.log(`Received audio chunk of size: ${chunk.audio_data.length}`);
      audioChunks.push(chunk.audio_data);
    });

    call.on("error", (err: Error) => {
        console.error("Error during stream:", err);
    });

    call.on("end", () => {
      console.log("Client finished streaming. Processing final audio.");
      const fullAudio: Buffer = Buffer.concat(audioChunks);

      // TODO: Replace with actual call to Groq/Gemini STT
      console.log(`Processing final concatenated audio of size: ${fullAudio.length} bytes.`);
      const dummyTranscript = "This is a transcript from the streamed audio.";

      callback(null, { transcript: dummyTranscript });
    });
  },
};

function main() {
  const server = new grpc.Server();
  // Ensure we use the correct service definition and implementation
  server.addService(itoProto.ito.ItoService.service, itoServer);
  
  const port = "0.0.0.0:3000";
  server.bindAsync(port, grpc.ServerCredentials.createInsecure(), (err, port) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log(`gRPC server listening on ${port}`);
  });
}

main();