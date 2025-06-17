import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as fs from "fs";

// 1. Import the pre-compiled service definition directly from the library
import { service as healthServiceDefinition } from 'grpc-health-check';

// Import the Ito service type from your generated types
import { ProtoGrpcType as ItoProtoType } from "./src/generated/ito";

// --- Configuration ---
const ITO_PROTO_PATH = "./src/ito.proto";
const SERVER_ADDRESS = "localhost:3000";


// --- Load Service Definitions ---

// Load your Ito service definition using proto-loader (this is still correct for your own service)
const itoPackageDefinition = protoLoader.loadSync(ITO_PROTO_PATH);
const itoProto = grpc.loadPackageDefinition(itoPackageDefinition) as unknown as ItoProtoType;


// --- Create Clients ---

// Create a client for your ItoService
const itoClient = new itoProto.ito.ItoService(
  SERVER_ADDRESS,
  grpc.credentials.createInsecure()
);

// 2. Create the Health Client using the imported service definition object
// This mirrors the official test file's method and avoids all file system lookups.
const HealthClientConstructor = grpc.makeClientConstructor(healthServiceDefinition, 'Health');
const healthClient = new HealthClientConstructor(
    SERVER_ADDRESS,
    grpc.credentials.createInsecure()
); // Cast to the generated type for type-safety


/**
 * Checks the health of a gRPC service.
 */
function checkServerHealth(service: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = { service };

    healthClient.check(request, (error, response) => {
      if (error) {
        console.error(`Health check failed for service "${service}":`, error.message);
        return reject(error);
      }
      
      if (response?.status === 'SERVING') {
        console.log(`Health check for "${service || 'Server Overall'}" PASSED. Status: SERVING.`);
        resolve();
      } else {
        const errorMsg = `Health check for "${service || 'Server Overall'}" FAILED. Status: ${response?.status}`;
        console.error(errorMsg);
        reject(new Error(errorMsg));
      }
    });
  });
}

async function main() {
    try {
        console.log("--- Checking Server Health ---");
        await checkServerHealth('');
        await checkServerHealth('ito.ItoService');

        const dummyAudioFile = "dummy-audio.wav";
        fs.writeFileSync(dummyAudioFile, "this is not real audio data");
        const audioBuffer = fs.readFileSync(dummyAudioFile);

        console.log("\n--- Calling TranscribeFile ---");
        itoClient.TranscribeFile({ audioData: audioBuffer }, (err, response) => {
            if (err) {
                console.error("TranscribeFile Error:", err.message);
            } else {
                console.log("Response Received:", response?.transcript);
            }

            fs.unlinkSync(dummyAudioFile);
            itoClient.close();
            healthClient.close();
        });

    } catch (error) {
        console.error("\nServer is not healthy. Aborting operation.");
        itoClient.close();
        healthClient.close();
        process.exit(1);
    }
}

main();