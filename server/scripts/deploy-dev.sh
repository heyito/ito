#!/bin/bash

set -e

AWS_REGION="us-west-2"
AWS_ACCOUNT_ID="287641434880"
ECR_REPO="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
IMAGE_NAME="dev-ito-server"
CLUSTER_NAME="dev-ito-cluster"
SERVICE_NAME="dev-ito-service"

echo "🚀 Deploying ${IMAGE_NAME} to dev environment..."

# Login to ECR
echo "🔐 Logging into ECR..."
aws ecr get-login-password --region ${AWS_REGION} \
  | docker login --username AWS --password-stdin ${ECR_REPO}

# Build and push multi-arch image
echo "🏗️  Building and pushing multi-arch Docker image..."
docker buildx create --use 2>/dev/null || docker buildx use default
docker buildx build \
  --platform linux/arm64,linux/amd64 \
  --tag ${ECR_REPO}/${IMAGE_NAME}:latest \
  --push .

# Force new ECS deployment
echo "🔄 Forcing new ECS deployment..."
aws ecs update-service \
  --cluster ${CLUSTER_NAME} \
  --service ${SERVICE_NAME} \
  --force-new-deployment \
  --region ${AWS_REGION}

echo "✅ Deployment initiated successfully!"
echo "📊 Monitor deployment: https://console.aws.amazon.com/ecs/v2/clusters/${CLUSTER_NAME}/services/${SERVICE_NAME}/health?region=${AWS_REGION}"
