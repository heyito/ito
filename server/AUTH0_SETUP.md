# Auth0 Integration Setup Guide

This guide explains how to set up Auth0 authentication for your gRPC server.

## Prerequisites

- An Auth0 account (free tier available at [auth0.com](https://auth0.com))
- Node.js and npm/yarn installed
- The Ito gRPC server dependencies installed

## Auth0 Configuration

### 1. Create an Auth0 Application

1. Log in to your [Auth0 Dashboard](https://manage.auth0.com/)
2. Navigate to **Applications** → **Applications**
3. Click **Create Application**
4. Choose **Machine to Machine Applications** (for server-to-server communication)
5. Select your API (create one if you don't have one - see step 2)

### 2. Create an Auth0 API

1. Navigate to **Applications** → **APIs**
2. Click **Create API**
3. Provide:
   - **Name**: `Ito Transcription API`
   - **Identifier**: `https://api.ito.transcription` (or your preferred identifier)
   - **Signing Algorithm**: `RS256`

### 3. Get Your Configuration Values

From your Auth0 Dashboard, collect these values:

#### From your API:
- **Audience**: The identifier you set for your API (e.g., `https://api.ito.transcription`)

#### From your Auth0 tenant:
- **Domain**: Your Auth0 domain (e.g., `your-tenant.auth0.com`)

#### From your Application:
- **Client ID**: Found in the application settings

## Environment Setup

### 1. Create Environment File

Create a `.env` file in the `server/` directory with your Auth0 configuration:

```bash
# Auth0 Configuration
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=your-client-id-here
AUTH0_AUDIENCE=https://api.ito.transcription

# Database Configuration (existing)
DB_HOST=localhost
DB_PORT=5432
DB_USER=your-db-user
DB_PASSWORD=your-db-password
DB_NAME=your-db-name

# Server Configuration
PORT=3000
NODE_ENV=development
```

### 2. Update Your Values

Replace the placeholder values with your actual Auth0 configuration:
- `your-tenant.auth0.com` → Your Auth0 domain
- `your-client-id-here` → Your application's Client ID
- `https://api.ito.transcription` → Your API identifier

## Running the Server

Start the server with Auth0 authentication enabled:

```bash
cd server
npm run dev
```

You should see:
```
gRPC server listening on 3000 with Auth0 authentication enabled
```

## Testing the Authentication

### 1. Test Without Authentication (Should Fail)

```bash
npm run test-auth
```

This will test unauthenticated requests, which should fail with authentication errors.

### 2. Test With Authentication

#### Get a JWT Token

1. Go to your Auth0 Dashboard
2. Navigate to **Applications** → **APIs** → **Your API** → **Test**
3. Copy the **Access Token** from the test section

#### Run Authenticated Tests

```bash
export TEST_JWT_TOKEN="your-jwt-token-here"
npm run test-auth
```

## Client Integration

### JavaScript/TypeScript Client

```typescript
import * as grpc from '@grpc/grpc-js';

// Create metadata with Auth0 JWT token
const createAuthMetadata = (token: string): grpc.Metadata => {
  const metadata = new grpc.Metadata();
  metadata.add('authorization', `Bearer ${token}`);
  return metadata;
};

// Example usage
const metadata = createAuthMetadata(yourJwtToken);
client.TranscribeFile({ audioData }, metadata, (error, response) => {
  // Handle response
});
```

### Python Client

```python
import grpc

def create_auth_metadata(token):
    return [('authorization', f'Bearer {token}')]

# Example usage
metadata = create_auth_metadata(your_jwt_token)
response = stub.TranscribeFile(request, metadata=metadata)
```

### cURL Example

```bash
grpcurl -H "authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"audioData":"ZmFrZS1hdWRpby1kYXRh"}' \
  localhost:3000 ito.ItoService/TranscribeFile
```

## Security Features

### What's Protected
- ✅ All gRPC service methods require valid JWT tokens
- ✅ Token signature validation using Auth0 public keys
- ✅ Audience and issuer validation
- ✅ Token expiration checking

### Token Requirements
- Must be a valid JWT token issued by your Auth0 tenant
- Must have the correct audience (`AUTH0_AUDIENCE`)
- Must not be expired
- Must be sent in the `authorization` metadata field as `Bearer <token>`

## Error Handling

### Common Authentication Errors

#### `UNAUTHENTICATED: No authorization token provided`
- **Cause**: Request sent without authorization metadata
- **Fix**: Include `authorization: Bearer <token>` in gRPC metadata

#### `UNAUTHENTICATED: Invalid token`
- **Cause**: Token is malformed, expired, or has wrong signature
- **Fix**: Get a fresh token from Auth0

#### `UNAUTHENTICATED: Authentication failed`
- **Cause**: Token doesn't match expected audience or issuer
- **Fix**: Verify your Auth0 configuration in `.env`

## Development Tips

### 1. Token Debugging

Add logging to see token validation details:

```typescript
// In your client code
console.log('JWT Token:', token.substring(0, 20) + '...');
```

### 2. Token Expiration

Auth0 tokens typically expire after 24 hours. For development, you can:
- Get fresh tokens from the Auth0 Dashboard
- Implement token refresh logic in your client
- Use longer-lived tokens for testing (configure in Auth0 API settings)

### 3. Environment Variables

Use different `.env` files for different environments:
- `.env.development` - Development settings
- `.env.production` - Production settings
- `.env.test` - Test environment settings

## Production Considerations

### 1. Environment Variables
- Never commit `.env` files to version control
- Use secure secret management in production (AWS Secrets Manager, etc.)
- Rotate secrets regularly

### 2. Token Validation
- The server validates tokens using Auth0's public keys
- Public keys are cached and automatically rotated
- No secrets need to be stored on the server

### 3. Rate Limiting
Consider adding rate limiting based on authenticated user:

```typescript
// Example: Track requests per user
const userRequestCounts = new Map();

// In your service handlers
const userId = authResult.user.sub;
// Implement rate limiting logic
```

## Troubleshooting

### Server Won't Start
1. Check all environment variables are set correctly
2. Verify Auth0 domain is accessible
3. Ensure all dependencies are installed

### Authentication Always Fails
1. Verify `AUTH0_DOMAIN` matches your Auth0 tenant
2. Check `AUTH0_AUDIENCE` matches your API identifier
3. Ensure token is not expired
4. Verify token was issued for the correct audience

### Need Help?
- Check the Auth0 logs in your dashboard
- Use the test client (`npm run test-auth`) to debug
- Review server logs for detailed error messages

## Next Steps

- Implement user-specific features using `authResult.user.sub`
- Add role-based access control using Auth0 roles
- Implement audit logging for authenticated requests
- Set up monitoring for authentication failures 