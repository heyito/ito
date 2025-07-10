import { Stack, StackProps, Tags } from 'aws-cdk-lib'
import { Peer, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2'
import { FargateService } from 'aws-cdk-lib/aws-ecs'
import { Construct } from 'constructs'
import { DB_PORT } from './constants'

export interface SecurityStackProps extends StackProps {
  fargateService: FargateService
  dbSecurityGroupId: string
}

export class SecurityStack extends Stack {
  constructor(scope: Construct, id: string, props: SecurityStackProps) {
    super(scope, id, props)

    const dbSG = SecurityGroup.fromSecurityGroupId(
      this,
      'ImportedDbSG',
      props.dbSecurityGroupId,
    )

    dbSG.addIngressRule(
      Peer.securityGroupId(
        props.fargateService.connections.securityGroups[0].securityGroupId,
      ),
      Port.tcp(DB_PORT),
      'Allow app to connect to aurora',
    )

    Tags.of(this).add('Project', 'Ito')
  }
}
