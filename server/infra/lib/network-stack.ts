import { Stack, StackProps } from 'aws-cdk-lib'
import { Vpc, GatewayVpcEndpointAwsService } from 'aws-cdk-lib/aws-ec2'
import { Construct } from 'constructs'

export class NetworkStack extends Stack {
  public readonly vpc: Vpc

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)
    this.vpc = new Vpc(this, 'ItoVpc', {
      maxAzs: 2,
      natGateways: 2,
    })

    // Add S3 Gateway Endpoint to avoid NAT Gateway charges for S3 traffic
    // This is free and provides better performance for S3 access
    this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: GatewayVpcEndpointAwsService.S3,
    })
  }
}
