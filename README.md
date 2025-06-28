# desec-ddns

A secure, Dockerized tool to update a desec.io A record to the current public IP of the device running the container.

## Features

- **Multiple IP Providers**: Falls back to alternative providers if one fails
- **Enhanced Security**: HTTPS certificate validation, input validation, and secure Docker configuration
- **Robust Error Handling**: Retry mechanism with exponential backoff
- **Rate Limiting**: Prevents API abuse
- **Structured Logging**: JSON-formatted logs for better monitoring
- **Healthchecks**: Docker healthcheck to monitor container status
- **Non-root Execution**: Container runs as a non-privileged user

## Usage

### Environment Variables

#### Required:
- `DESEC_TOKEN`: Your desec.io API token
- `DESEC_DOMAIN`: The domain managed in desec.io (e.g., `example.com`)

#### Optional:
- `DESEC_RECORD`: The subdomain/record to update (e.g., `@` for root, or `home` for `home.example.com`). Default: `@`
- `INTERVAL_SECONDS`: How often to check/update, in seconds. Default: 300 (5 minutes)
- `MAX_RETRIES`: Maximum number of retry attempts for API calls. Default: 3
- `REQUESTS_PER_MINUTE`: Rate limit for API requests. Default: 30
- `TTL`: Time-to-live for DNS records in seconds. Default: 3600 (1 hour)

### Build and Run with Docker

```sh
docker build -t desec-ddns .

docker run --rm \
  -e DESEC_TOKEN=your_token \
  -e DESEC_DOMAIN=example.com \
  -e DESEC_RECORD=home \
  --security-opt=no-new-privileges:true \
  --cap-drop=ALL \
  --cap-add=NET_OUTBOUND \
  desec-ddns
```

### Secure Docker Deployment

For enhanced security, run with:

```sh
docker run --rm \
  -e DESEC_TOKEN=your_token \
  -e DESEC_DOMAIN=example.com \
  -e DESEC_RECORD=home \
  --security-opt=no-new-privileges:true \
  --cap-drop=ALL \
  --cap-add=NET_OUTBOUND \
  --read-only \
  --tmpfs /tmp \
  desec-ddns
```

### Using Docker Secrets (Recommended)

Instead of passing the API token as an environment variable, use Docker secrets:

```sh
echo "your_token" | docker secret create desec_token -

docker service create \
  --name desec-ddns \
  --secret desec_token \
  -e DESEC_TOKEN_FILE=/run/secrets/desec_token \
  -e DESEC_DOMAIN=example.com \
  -e DESEC_RECORD=home \
  --security-opt=no-new-privileges:true \
  --cap-drop=ALL \
  --cap-add=NET_OUTBOUND \
  desec-ddns
```

## How it works

- Fetches the current public IP using multiple providers (ipify.org, ifconfig.me, ipinfo.io, icanhazip.com)
- Validates the IP address format before using it
- Updates the specified A record in desec.io using their API with retry logic
- Uses structured logging for better monitoring and debugging
- Implements rate limiting to prevent API abuse
- Runs with minimal permissions in Docker for enhanced security

## Security Features

- HTTPS certificate validation with minimum TLS 1.2
- Input validation for all environment variables
- IP address format validation
- Rate limiting for API requests
- Retry mechanism with exponential backoff
- Non-root user in Docker container
- Dropped capabilities for least privilege
- Structured logging for better monitoring
