import { Stack, StackProps } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import {
  OpenIdConnectProvider,
  OpenIdConnectPrincipal,
  Role,
  PolicyStatement,
  Effect,
} from 'aws-cdk-lib/aws-iam'
import { Repository } from 'aws-cdk-lib/aws-ecr'
import { ITO_PREFIX } from './constants'

export interface GitHubOidcStackProps extends StackProps {
  serviceRepo: Repository
}

export class GitHubOidcStack extends Stack {
  constructor(scope: Construct, id: string, props: GitHubOidcStackProps) {
    super(scope, id, props)

    // reference existing GitHub OIDC provider
    const oidcProviderArn = `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`
    const oidc = OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      'ImportedGitHubOidcProvider',
      oidcProviderArn,
    )

    // allow only workflows from your repo/org
    const principal = new OpenIdConnectPrincipal(oidc, {
      StringLike: {
        'token.actions.githubusercontent.com:sub': `repo:demox-labs/ito-rewrite:*`,
        'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
      },
    })

    const appEcrRole = new Role(this, 'ItoGitHubCiCdRole', {
      assumedBy: principal,
      roleName: 'ItoGitHubCiCdRole',
      description: 'GitHub Actions can assume this via OIDC',
    })

    // ECR: auth & push
    appEcrRole.addToPolicy(
      new PolicyStatement({
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*'],
      }),
    )
    const repoArn = props.serviceRepo.repositoryArn
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
        resources: [repoArn, `${repoArn}/*`],
      }),
    )

    // CloudFormation on any stack named Ito*
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

    // Read CDK bootstrap version
    const bootstrapParamArn = `arn:aws:ssm:${this.region}:${this.account}:parameter/cdk-bootstrap/hnb659fds/*`
    appEcrRole.addToPolicy(
      new PolicyStatement({
        actions: ['ssm:GetParameter', 'ssm:GetParameters'],
        resources: [bootstrapParamArn],
      }),
    )

    // S3: allow publishing into the CDK assets bucket
    const assetsBucketName = `cdk-hnb659fds-assets-${this.account}-${this.region}`
    const assetsBucketArn = `arn:aws:s3:::${assetsBucketName}`
    appEcrRole.addToPolicy(
      new PolicyStatement({
        actions: ['s3:GetBucketLocation', 's3:ListBucket', 's3:GetBucketAcl'],
        resources: [assetsBucketArn],
      }),
    )
    appEcrRole.addToPolicy(
      new PolicyStatement({
        actions: ['s3:GetObject', 's3:PutObject', 's3:PutObjectAcl'],
        resources: [`${assetsBucketArn}/*`],
      }),
    )

    const deployRoleArn = `arn:aws:iam::${this.account}:role/cdk-hnb659fds-deploy-role-${this.account}-${this.region}`
    const publishRoleArn = `arn:aws:iam::${this.account}:role/cdk-hnb659fds-file-publishing-role-${this.account}-${this.region}`

    appEcrRole.addToPolicy(
      new PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [deployRoleArn, publishRoleArn],
      }),
    )
  }
}
