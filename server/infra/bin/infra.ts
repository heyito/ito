import { App, Environment } from "aws-cdk-lib";
import { ItoExpressAppStack } from "../lib/ito-express-app-stack";

const app = new App();

// use the CLI’s default if you’ve done `export AWS_REGION=us-west-2` etc:
const env: Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

new ItoExpressAppStack(app, "ItoExpressAppStack", { env });

app.synth();
