import { Construct } from 'constructs'
import { Stack, Duration, CustomResource } from 'aws-cdk-lib'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { PolicyStatement } from 'aws-cdk-lib/aws-iam'
import { Domain } from 'aws-cdk-lib/aws-opensearchservice'
import * as cr from 'aws-cdk-lib/custom-resources'

export interface OpenSearchBootstrapConfig {
  stageName: string
  opensearchDomain: Domain
}

export interface OpenSearchBootstrapResources {
  bootstrapLambda: NodejsFunction
  bootstrapProvider: cr.Provider
  bootstrapResource: CustomResource
}

export function createOpenSearchBootstrap(
  scope: Construct,
  config: OpenSearchBootstrapConfig,
): OpenSearchBootstrapResources {
  const stack = Stack.of(scope)

  const bootstrapLambda = new NodejsFunction(scope, 'ItoOpenSearchBootstrap', {
    entry: 'lambdas/opensearch-bootstrap.ts',
    handler: 'handler',
    environment: {
      DOMAIN_ENDPOINT: config.opensearchDomain.domainEndpoint,
      REGION: stack.region,
      STAGE: config.stageName,
    },
    timeout: Duration.minutes(2),
  })

  bootstrapLambda.addToRolePolicy(
    new PolicyStatement({
      actions: ['es:ESHttpGet', 'es:ESHttpPut'],
      resources: [
        config.opensearchDomain.domainArn,
        `${config.opensearchDomain.domainArn}/*`,
      ],
    }),
  )

  const bootstrapProvider = new cr.Provider(
    scope,
    'ItoOpenSearchBootstrapProvider',
    {
      onEventHandler: bootstrapLambda,
    },
  )

  const bootstrapResource = new CustomResource(
    scope,
    'ItoOpenSearchBootstrapResource',
    {
      serviceToken: bootstrapProvider.serviceToken,
      properties: {
        domain: config.opensearchDomain.domainEndpoint,
        stage: config.stageName,
      },
    },
  )

  return {
    bootstrapLambda,
    bootstrapProvider,
    bootstrapResource,
  }
}
