import { Stack, StackProps } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import {
  OpenIdConnectProvider,
  OpenIdConnectPrincipal,
  Role,
  PolicyStatement,
} from 'aws-cdk-lib/aws-iam'
import { Repository } from 'aws-cdk-lib/aws-ecr'
import { ITO_PREFIX } from './constants'

export interface GitHubOidcStackProps extends StackProps {
  serviceRepo: Repository
}

export class GitHubOidcStack extends Stack {
  constructor(scope: Construct, id: string, props: GitHubOidcStackProps) {
    super(scope, id, props)

    const oidcProviderArn = `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`
    const oidc = OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      'ImportedGitHubOidcProvider',
      oidcProviderArn,
    )
    const principal = new OpenIdConnectPrincipal(oidc, {
      StringLike: {
        'token.actions.githubusercontent.com:sub':
          'repo:demox-labs/ito-rewrite:*',
        'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
      },
    })

    const appEcrRole = new Role(this, 'ItoGitHubCiCdRole', {
      assumedBy: principal,
      description: 'GitHub Actions can assume this via OIDC',
    })

    appEcrRole.addToPolicy(
      new PolicyStatement({
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*'],
      }),
    )

    const repoArn = props.serviceRepo.repositoryArn
    const repoObject = `${repoArn}/*` // layer blobs + manifests
    appEcrRole.addToPolicy(
      new PolicyStatement({
        actions: [
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:InitiateLayerUpload',
          'ecr:UploadLayerPart',
          'ecr:CompleteLayerUpload',
          'ecr:PutImage',
          'ecr:DescribeRepositories',
          'ecr:ListImages',
        ],
        resources: [repoArn, repoObject],
      }),
    )

    // allow CFN actions on any stack whose name starts with "Ito"
    const cfnArnPattern = `arn:aws:cloudformation:${this.region}:${this.account}:stack/${ITO_PREFIX}*/*`
    appEcrRole.addToPolicy(
      new PolicyStatement({
        actions: [
          'cloudformation:CreateChangeSet',
          'cloudformation:ExecuteChangeSet',
          'cloudformation:DeleteStack',
          'cloudformation:DescribeStacks',
        ],
        resources: [cfnArnPattern],
      }),
    )
  }
}
