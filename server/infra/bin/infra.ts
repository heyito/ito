import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { ItoExpressAppStack } from "../lib/ito-express-app-stack";
import { SharedResourcesStack } from "../lib/shared-resources-stack";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const sharedStack = new SharedResourcesStack(app, "ItoSharedResourcesStack", {
  env: env,
  description: "Stack for shared, persistent resources like logs and secrets.",
});

const appStack = new ItoExpressAppStack(app, "ItoExpressAppStack", {
  env: env,
  description: "The main Ito Express application service.",
  logBucket: sharedStack.logBucket,
  dbSecretArn: sharedStack.dbSecretArn,
});

appStack.addDependency(sharedStack);
