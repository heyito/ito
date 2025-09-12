import { CfnOutput, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import {
  OpenIdConnectProvider,
  OpenIdConnectPrincipal,
  Role,
  PolicyStatement,
  Effect,
  AnyPrincipal,
} from 'aws-cdk-lib/aws-iam'
import { Repository } from 'aws-cdk-lib/aws-ecr'
import {
  CLUSTER_NAME,
  DB_NAME,
  ITO_PREFIX,
  SERVER_NAME,
  SERVICE_NAME,
} from './constants'
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3'
import { CachePolicy, Distribution } from 'aws-cdk-lib/aws-cloudfront'
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins'

export interface GitHubOidcStackProps extends StackProps {
  stages: string[]
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
        'token.actions.githubusercontent.com:sub': `repo:heyito/ito:*`,
        'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
      },
    })

    // ─── create the CI/CD role ─────────────────────────────────────────────────
    const ciCdRole = new Role(this, 'ItoGitHubCiCdRole', {
      assumedBy: principal,
      roleName: 'ItoGitHubCiCdRole',
      description: 'GitHub Actions can assume this via OIDC',
    })

    // ─── create s3 bucket for releases ────────────────────────
    props.stages.forEach(stage => {
      const bucketName = `${stage}-${ITO_PREFIX.toLowerCase()}-releases`
      const bucket = new Bucket(this, `${stage}-ItoReleasesBucket`, {
        bucketName,
        removalPolicy: RemovalPolicy.RETAIN,

        blockPublicAccess: BlockPublicAccess.BLOCK_ACLS_ONLY,
      })

      bucket.grantReadWrite(ciCdRole)
      bucket.grantPut(ciCdRole)
      bucket.grantDelete(ciCdRole)

      bucket.addToResourcePolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          principals: [new AnyPrincipal()],
          actions: ['s3:GetObject'],
          resources: [bucket.arnForObjects('releases/*')],
        }),
      )

      const distribution = new Distribution(this, `${stage}-ReleasesCDN`, {
        defaultBehavior: {
          origin: S3BucketOrigin.withBucketDefaults(bucket, {
            originPath: '/releases',
          }),
          cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        },
      })

      // Grant CloudFront invalidation permissions
      ciCdRole.addToPolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [
            'cloudfront:CreateInvalidation',
            'cloudfront:GetInvalidation',
            'cloudfront:ListInvalidations',
          ],
          resources: [distribution.distributionArn],
        }),
      )

      new CfnOutput(this, `${stage}-ReleasesCDNUrl`, {
        value: `https://${distribution.domainName}`,
      })

      new CfnOutput(this, `${stage}-ReleasesCDNId`, {
        value: distribution.distributionId,
      })
    })

    // ─── ECR: login + push ─────────────────────────────────────────────────────
    ciCdRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*'], // auth token is account-wide
      }),
    )

    props.stages.forEach(stage => {
      const repoName = `${stage}-${SERVER_NAME}`
      const repo = Repository.fromRepositoryName(this, `Repo${stage}`, repoName)
      const repoArn = repo.repositoryArn
      ciCdRole.addToPolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [
            'ecr:BatchCheckLayerAvailability',
            'ecr:BatchGetImage',
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

      ciCdRole.addToPolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [
            'ecs:DescribeServices',
            'ecs:UpdateService',
            'ecs:ListClusters',
            'ecs:DescribeClusters',
          ],
          resources: [
            `arn:aws:ecs:${this.region}:${this.account}:cluster/${stage}-${CLUSTER_NAME}`,
            `arn:aws:ecs:${this.region}:${this.account}:service/${stage}-${CLUSTER_NAME}/${stage}-${SERVICE_NAME}`,
          ],
        }),
      )

      ciCdRole.addToPolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [
            'lambda:GetFunction',
            'lambda:UpdateFunctionCode',
            'lambda:UpdateFunctionConfiguration',
            'lambda:InvokeFunction',
          ],
          resources: [
            `arn:aws:lambda:${this.region}:${this.account}:function:${stage}-${DB_NAME}-migration`,
          ],
        }),
      )
    })

    // ─── CloudFormation on any of our “Ito*” stacks ──────────────────────────────
    const cfnArnPattern = `arn:aws:cloudformation:${this.region}:${this.account}:stack/${ITO_PREFIX}*/*`
    ciCdRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'cloudformation:CreateChangeSet',
          'cloudformation:ExecuteChangeSet',
          'cloudformation:DeleteStack',
          'cloudformation:DescribeStacks',
          'cloudformation:GetTemplate',
        ],
        resources: [cfnArnPattern],
      }),
    )

    // ─── CDK bootstrap version lookup (wildcard qualifier) ────────────────────
    const ssmBootstrapBase = `arn:aws:ssm:${this.region}:${this.account}:parameter/cdk-bootstrap/*`
    ciCdRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['ssm:GetParameter', 'ssm:GetParameters'],
        resources: [ssmBootstrapBase, `${ssmBootstrapBase}/*`],
      }),
    )

    // ─── S3: publishing assets into the CDK assets bucket (wildcard bootstrap) ─
    // bucket name pattern is: cdk-<qualifier>-assets-<acct>-<region>
    const bucketPattern = `arn:aws:s3:::cdk-hnb*assets-${this.account}-${this.region}`
    ciCdRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:GetBucketLocation', 's3:ListBucket', 's3:GetBucketAcl'],
        resources: [bucketPattern],
      }),
    )
    ciCdRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:GetObject', 's3:PutObject', 's3:PutObjectAcl'],
        resources: [`${bucketPattern}/*`],
      }),
    )

    // ─── allow CDK bootstrap roles to be assumed (wildcard qualifier) ──────────
    const deployRolePattern = `arn:aws:iam::${this.account}:role/cdk-hnb*-deploy-role-${this.account}-${this.region}`
    const publishRolePattern = `arn:aws:iam::${this.account}:role/cdk-hnb*-file-publishing-role-${this.account}-${this.region}`
    ciCdRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['sts:AssumeRole'],
        resources: [deployRolePattern, publishRolePattern],
      }),
    )
  }
}
