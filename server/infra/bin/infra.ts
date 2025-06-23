import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { PlatformStack } from '../lib/platform-stack'
import { NetworkStack } from '../lib/network-stack'
import { ServiceStack } from '../lib/service-stack'
import { SecurityStack } from '../lib/security-stack'
import { ObservabilityStack } from '../lib/observability-stack'
import { GitHubOidcStack } from '../lib/cicd-stack'
import { ITO_PREFIX } from '../lib/constants'

const app = new cdk.App()
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
}

const network = new NetworkStack(app, `${ITO_PREFIX}Networking`, { env })

const platform = new PlatformStack(app, `${ITO_PREFIX}Platform`, {
  env,
  vpc: network.vpc,
})

const service = new ServiceStack(app, `${ITO_PREFIX}Service`, {
  env,
  vpc: network.vpc,
  dbSecretArn: platform.dbSecretArn,
  dbEndpoint: platform.dbEndpoint,
  serviceRepo: platform.serviceRepo,
})

const security = new SecurityStack(app, `${ITO_PREFIX}Security`, {
  env,
  fargateService: service.fargateService,
  dbSecurityGroupId: platform.dbSecurityGroupId,
})

const observability = new ObservabilityStack(
  app,
  `${ITO_PREFIX}Observability`,
  {
    env,
    fargateService: service.fargateService,
  },
)

const ciCd = new GitHubOidcStack(app, `${ITO_PREFIX}CiCd`, {
  env,
  serviceRepo: platform.serviceRepo,
})

platform.addDependency(network)
service.addDependency(platform)
service.addDependency(network)
security.addDependency(platform)
security.addDependency(service)
observability.addDependency(service)
ciCd.addDependency(platform)
