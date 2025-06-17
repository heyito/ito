import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { ProtoGrpcType } from "./src/generated/ito";
import * as fs from "fs";

const PROTO_PATH = "./src/ito.proto";

const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const itoProto = grpc.loadPackageDefinition(packageDefinition) as unknown as ProtoGrpcType;

const client = new itoProto.ito.ItoService(
  "localhost:3000",
  grpc.credentials.createInsecure()
);

// Create a dummy audio file to send
fs.writeFileSync("dummy-audio.wav", "this is not real audio data");
const audioBuffer = fs.readFileSync("dummy-audio.wav");

console.log("--- Calling TranscribeFile ---");
client.TranscribeFile({ audioData: audioBuffer }, (err, response) => {
  if (err) {
    return console.error("Error:", err.message);
  }
  console.log("Response Received:", response?.transcript);
});