import { App } from "aws-cdk-lib";
import { ItoExpressAppStack } from "../lib/ito-express-app-stack";

const app = new App();
new ItoExpressAppStack(app, "ItoExpressAppStack");
