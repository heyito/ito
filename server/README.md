# Ito Server

The Ito transcription server provides gRPC-based speech-to-text services for the Ito voice assistant application. This server handles audio transcription, user data management, and API authentication.

## 🚀 Quick Start

### Prerequisites

- **Node.js 20+** with **Bun** package manager
- **Docker & Docker Compose** (for local PostgreSQL database)
- **GROQ API Key** (for transcription services)
- **Auth0 Account** (optional, for authentication)

### 1. Environment Setup

Create your environment configuration:

```bash
# Copy the example environment file
cp .env.example .env
```

Add the following configuration to your `.env` file:

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USER=devuser
DB_PASS=devpass
DB_NAME=devdb

# Storage Configuration (S3/MinIO)
BLOB_STORAGE_BUCKET=ito-audio-storage
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_FORCE_PATH_STYLE=true

# GROQ API Configuration (Required)
GROQ_API_KEY=your_groq_api_key_here

# CEREBRAS API Key (Not Required)
CEREBRAS_API_KEY=your_CEREBRAS_API_KEY_here

# Authentication (Optional - set to false for local development)
REQUIRE_AUTH=false
AUTH0_DOMAIN=your_auth0_domain.auth0.com
AUTH0_AUDIENCE=http://localhost:3000

# Billing (Stripe)
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_ID=price_xxx
APP_PROTOCOL=ito-dev
STRIPE_PUBLIC_BASE_URL=http://localhost:3000
```

### 2. Get Required API Keys

#### GROQ API Key (Required)

1. Visit [console.groq.com](https://console.groq.com)
2. Create an account or sign in
3. Navigate to **API Keys** section
4. Create a new API key
5. Copy the key to your `.env` file as `GROQ_API_KEY`

#### Auth0 Setup (Optional)

For production or authenticated development:

1. Create a [Auth0 account](https://auth0.com)
2. Create a new application (API type)
3. Copy **Domain** and **Audience** to your `.env` file
4. Set `REQUIRE_AUTH=true` in your `.env`

### 3. Install Dependencies

```bash
bun install
```

### 4. Local Services Setup

Start all local services (PostgreSQL + MinIO for S3-compatible storage):

```bash
# Start all local services
bun run local-services-up

# Run database migrations
bun run db:migrate
```

This will start:

- **PostgreSQL** on port 5432
- **MinIO S3** on port 9000 (API) and 9001 (Console)
- Auto-creates the `ito-audio-storage` bucket

### 5. Start Development Server

```bash
# Start the server with hot reload
bun run dev
```

The server will start on `http://localhost:3000`

## 📋 Available Scripts

### Development

```bash
bun run dev              # Start development server with hot reload
bun run start            # Start production server
bun run build            # Build TypeScript to JavaScript
```

### Database & Storage Management

```bash
# Services Management
bun run local-services-up    # Start PostgreSQL + MinIO
bun run local-services-down  # Stop all local services
bun run local-db-up          # Start only PostgreSQL
bun run local-s3-up          # Start only MinIO + create bucket
bun run local-s3-down        # Stop MinIO

# Database Operations
bun run db:migrate           # Run migrations up
bun run db:migrate:down      # Run migrations down
bun run db:migrate:create <name>  # Create new migration
```

### Protocol Buffers

```bash
bun run proto:gen        # Generate both server and client types
bun run proto:gen:server # Generate server types only
bun run proto:gen:client # Generate client types only
```

### Testing

```bash
bun run test-client      # Run gRPC client tests
```

## 🏗️ Architecture

### Core Components

- **Fastify Server**: HTTP/gRPC server with Auth0 integration
- **Connect RPC**: Type-safe gRPC implementation
- **PostgreSQL**: Primary database for user data and metadata
- **S3/MinIO**: Audio file storage (local development uses MinIO)
- **GROQ SDK**: AI transcription service integration

### API Services

#### 1. Transcription Service

- `TranscribeFile`: Single file transcription
- `TranscribeStream`: Real-time streaming transcription

#### 2. Notes Service

- Create, read, update, delete user notes
- Automatic transcription saving

#### 3. Dictionary Service

- Custom vocabulary management
- Pronunciation corrections

#### 4. Interactions Service

- Dictation session tracking
- Usage analytics

#### 5. User Data Service

- Complete user data deletion
- Privacy compliance

## 🔧 Configuration

### Environment Variables

| Variable               | Required | Default     | Description                                 |
| ---------------------- | -------- | ----------- | ------------------------------------------- |
| `DB_HOST`              | Yes      | `localhost` | PostgreSQL host                             |
| `DB_PORT`              | Yes      | `5432`      | PostgreSQL port                             |
| `DB_USER`              | Yes      | -           | Database username                           |
| `DB_PASS`              | Yes      | -           | Database password                           |
| `DB_NAME`              | Yes      | -           | Database name                               |
| `BLOB_STORAGE_BUCKET`  | Yes      | -           | S3 bucket name for audio storage            |
| `S3_ENDPOINT`          | No       | -           | S3 endpoint (for MinIO/local development)   |
| `S3_ACCESS_KEY_ID`     | No       | -           | S3 access key (for MinIO/local development) |
| `S3_SECRET_ACCESS_KEY` | No       | -           | S3 secret key (for MinIO/local development) |
| `S3_FORCE_PATH_STYLE`  | No       | `false`     | Use path-style S3 URLs (required for MinIO) |
| `GROQ_API_KEY`         | Yes      | -           | GROQ API key for transcription              |
| `CEREBRAS_API_KEY`     | No       | -           | CEREBRAS API key for reasoning              |
| `REQUIRE_AUTH`         | No       | `false`     | Enable Auth0 authentication                 |
| `AUTH0_DOMAIN`         | No\*     | -           | Auth0 domain (\*required if auth enabled)   |
| `AUTH0_AUDIENCE`       | No\*     | -           | Auth0 audience (\*required if auth enabled) |

### Database & Storage Configuration

**PostgreSQL Database:**
The server uses PostgreSQL with automatic migrations. The database schema includes:

- **users**: User profiles and settings
- **notes**: Transcribed text and metadata
- **interactions**: Dictation sessions (with S3 audio references)
- **dictionary**: Custom vocabulary
- **llm_settings**: User-specific LLM configuration

**S3 Storage:**
Audio files are stored in S3 (or MinIO for local development) with the following structure:

- **Bucket**: Configured via `BLOB_STORAGE_BUCKET`
- **Keys**: `raw-audio/{userId}/{audioUuid}`
- **Format**: Raw audio bytes (no file extensions)

**Local Development Setup:**

- **MinIO Console**: http://localhost:9001 (admin/admin)
- **MinIO S3 API**: http://localhost:9000
- **Auto-bucket creation**: `ito-audio-storage` created automatically

### Authentication

Authentication is optional for local development. When enabled:

- All gRPC endpoints require valid JWT tokens
- Auth0 provides user identity and authorization
- User context is automatically injected into requests

## 🚀 Production Deployment

### Docker Deployment

```bash
# Build and start with Docker Compose
docker compose up -d

# Run migrations
docker compose exec ito-grpc-server bun run db:migrate
```

### AWS Deployment

The server includes AWS CDK infrastructure:

```bash
cd infra
npm install
cdk deploy --all
```

This deploys:

- ECS Fargate service
- Application Load Balancer
- Aurora Serverless PostgreSQL
- Lambda functions for migrations

## 🧪 Testing

### Health Check

```bash
curl http://localhost:3000/
```

### gRPC Testing

```bash
# Run the test client
bun run test-client
```

### Manual Testing

Test individual services using the included test client or tools like:

- [grpcurl](https://github.com/fullstorydev/grpcurl)
- [Postman](https://www.postman.com/) (with gRPC support)
- [BloomRPC](https://github.com/bloomrpc/bloomrpc)

## 🔍 Troubleshooting

### Common Issues

#### 1. Database Connection Errors

```bash
# Check if PostgreSQL & MinIO are running
bun run local-services-up

# Verify database credentials in .env
# Ensure DB_HOST, DB_PORT, DB_USER, DB_PASS are correct
```

#### 2. GROQ API Errors

```bash
# Verify API key is valid
# Check GROQ_API_KEY in .env file
# Ensure you have credits in your GROQ account
```

#### 3. S3/MinIO Storage Issues

```bash
# Check if MinIO is running
bun run local-s3-up

# Reset MinIO data (WARNING: destroys stored files)
docker compose down -v
bun run local-services-up

# Manually setup MinIO bucket
./scripts/setup-minio.sh

# Verify S3 configuration in .env
# Ensure S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY are set
```

#### 4. Migration Failures

```bash
# Reset migrations (WARNING: destroys data)
bun run local-services-down
bun run local-services-up
bun run db:migrate
```

#### 5. Auth0 Configuration

```bash
# For local development, disable auth
echo "REQUIRE_AUTH=false" >> .env

# For production, ensure AUTH0_DOMAIN and AUTH0_AUDIENCE are set
```

#### 6. Port Conflicts

If ports 5432, 9000, or 9001 are in use:

- Modify ports in `docker-compose.yml`
- Update corresponding environment variables

### Debug Mode

Enable verbose logging:

```bash
NODE_ENV=development bun run dev
```

### MinIO Console Access

For local development, access the MinIO console at http://localhost:9001:

- **Username**: `minioadmin`
- **Password**: `minioadmin`

Use the console to:

- View stored audio files
- Monitor storage usage
- Manage buckets and objects
- Debug S3 operations

### Logs

Check server logs for detailed error information:

- Database connection issues
- API authentication failures
- Transcription service errors
- Migration problems
- S3 storage operations

## 📚 API Documentation

### Protocol Buffer Schema

The API is defined in `src/ito.proto`. Key services:

```protobuf
service ItoService {
  // Transcription
  rpc TranscribeFile(TranscribeFileRequest) returns (TranscriptionResponse);
  rpc TranscribeStream(stream AudioChunk) returns (TranscriptionResponse);

  // Data Management
  rpc CreateNote(CreateNoteRequest) returns (Note);
  rpc ListNotes(ListNotesRequest) returns (ListNotesResponse);
  // ... more services
}
```

### Client Integration

The Ito desktop app automatically connects to `localhost:3000`. Ensure the server is running before starting the desktop application.

## 🤝 Contributing

1. **Fork and clone** the repository
2. **Create feature branch** from `dev`
3. **Set up development environment** following this guide
4. **Make changes** with appropriate tests
5. **Submit pull request** with clear description

### Development Guidelines

- Follow TypeScript best practices
- Add migrations for schema changes
- Test gRPC endpoints thoroughly
- Update documentation for API changes
- Consider backwards compatibility

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/heyito/ito/issues)
- **Documentation**: [Main README](../README.md)
- **Server Logs**: Check console output for debugging information
