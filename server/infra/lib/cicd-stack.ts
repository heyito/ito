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

    // ─── reference the existing GitHub OIDC provider ───────────────────────────
    const oidcProviderArn = `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`
    const oidc = OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      'ImportedGitHubOidcProvider',
      oidcProviderArn,
    )

    // ─── allow only workflows from your repo/org ────────────────────────────────
    const principal = new OpenIdConnectPrincipal(oidc, {
      StringLike: {
        'token.actions.githubusercontent.com:sub': `repo:demox-labs/ito-rewrite:*`,
        'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
      },
    })

    // ─── create the CI/CD role ─────────────────────────────────────────────────
    const appEcrRole = new Role(this, 'ItoGitHubCiCdRole', {
      assumedBy: principal,
      roleName: 'ItoGitHubCiCdRole',
      description: 'GitHub Actions can assume this via OIDC',
    })

    // ─── ECR: login + push ─────────────────────────────────────────────────────
    appEcrRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*'], // auth token is account-wide
      }),
    )

    const repoArn = props.serviceRepo.repositoryArn
    appEcrRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
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

    // ─── CloudFormation on any of our “Ito*” stacks ──────────────────────────────
    const cfnArnPattern = `arn:aws:cloudformation:${this.region}:${this.account}:stack/${ITO_PREFIX}*/*`
    appEcrRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'cloudformation:CreateChangeSet',
          'cloudformation:ExecuteChangeSet',
          'cloudformation:DeleteStack',
          'cloudformation:DescribeStacks',
        ],
        resources: [cfnArnPattern],
      }),
    )

    // ─── CDK bootstrap version lookup (wildcard qualifier) ────────────────────
    const ssmBootstrapBase = `arn:aws:ssm:${this.region}:${this.account}:parameter/cdk-bootstrap/*`
    appEcrRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['ssm:GetParameter', 'ssm:GetParameters'],
        resources: [ssmBootstrapBase, `${ssmBootstrapBase}/*`],
      }),
    )

    // ─── S3: publishing assets into the CDK assets bucket (wildcard bootstrap) ─
    // bucket name pattern is: cdk-<qualifier>-assets-<acct>-<region>
    const bucketPattern = `arn:aws:s3:::cdk-hnb*assets-${this.account}-${this.region}`
    appEcrRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:GetBucketLocation', 's3:ListBucket', 's3:GetBucketAcl'],
        resources: [bucketPattern],
      }),
    )
    appEcrRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:GetObject', 's3:PutObject', 's3:PutObjectAcl'],
        resources: [`${bucketPattern}/*`],
      }),
    )

    // ─── allow CDK bootstrap roles to be assumed (wildcard qualifier) ──────────
    const deployRolePattern = `arn:aws:iam::${this.account}:role/cdk-hnb*-deploy-role-${this.account}-${this.region}`
    const publishRolePattern = `arn:aws:iam::${this.account}:role/cdk-hnb*-file-publishing-role-${this.account}-${this.region}`
    appEcrRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['sts:AssumeRole'],
        resources: [deployRolePattern, publishRolePattern],
      }),
    )
  }
}
