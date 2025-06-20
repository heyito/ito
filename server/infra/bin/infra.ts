import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { PlatformStack } from "../lib/platform-stack";
import { NetworkStack } from "../lib/network-stack";
import { ServiceStack } from "../lib/service-stack";
import { SecurityStack } from "../lib/security-stack";
import { ObservabilityStack } from "../lib/observability-stack";

const app = new cdk.App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const network = new NetworkStack(app, "ItoNetworking", { env });

const platform = new PlatformStack(app, "ItoPlatform", {
  env,
  vpc: network.vpc,
});

const service = new ServiceStack(app, "ItoService", {
  env,
  vpc: network.vpc,
  dbSecretArn: platform.dbSecretArn,
  dbEndpoint: platform.dbEndpoint,
});

const security = new SecurityStack(app, "ItoSecurity", {
  env,
  fargateService: service.fargateService,
  dbSecurityGroupId: platform.dbSecurityGroupId,
});

const observability = new ObservabilityStack(app, "ItoObservability", {
  env,
  fargateService: service.fargateService,
});

platform.addDependency(network);
service.addDependency(platform);
service.addDependency(network);
security.addDependency(platform);
security.addDependency(service);
observability.addDependency(service);
