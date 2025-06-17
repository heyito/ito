import { RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { DatabaseSecret } from "aws-cdk-lib/aws-rds";
import { BlockPublicAccess, Bucket, IBucket } from "aws-cdk-lib/aws-s3";
import { ISecret, Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

export class SharedResourcesStack extends Stack {
  // --- Public properties to be consumed by other stacks ---
  public readonly logBucket: IBucket;
  public readonly dbSecretArn: string;
  private readonly dbCredentialsSecret: ISecret;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.logBucket = new Bucket(this, "ItoAlbLogsBucket", {
      bucketName: "ito-alb-logs",
      removalPolicy: RemovalPolicy.RETAIN,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
    });

    this.dbCredentialsSecret = new Secret(this, "ItoDbCredentials", {
      secretName: "prod/ito-db/db-admin",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "dbadmin" }),
        excludePunctuation: true,
        includeSpace: false,
        generateStringKey: "password",
      },
    });

    this.dbSecretArn = this.dbCredentialsSecret.secretArn;
  }
}
