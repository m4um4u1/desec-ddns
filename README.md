# desec-ddns

A secure tool to update a desec.io A record with your current public IP.

## Features

- **Secure**: HTTPS validation, input validation, minimal permissions
- **Reliable**: Multiple IP providers with fallback and retry logic
- **Privacy-focused**: Uses IP providers with better privacy practices

## Usage

### Required Environment Variables
- `DESEC_TOKEN`: Your desec.io API token
- `DESEC_DOMAIN`: Your domain (e.g., `example.com`)

### Optional Environment Variables
- `DESEC_RECORD`: Subdomain to update (default: `@`)
- `INTERVAL_SECONDS`: Update interval in seconds (default: 300)
- `TTL`: DNS record TTL in seconds (default: 3600)

### Docker (Recommended)

```sh
docker run -d --name desec-ddns \
  -e DESEC_TOKEN=your_token \
  -e DESEC_DOMAIN=example.com \
  -e DESEC_RECORD=home \
  --security-opt=no-new-privileges:true \
  --restart unless-stopped \
  m4um4u1/desec-ddns
```

### Docker Secrets (More Secure)

```sh
echo "your_token" | docker secret create desec_token -
echo "example.com" | docker secret create desec_domain -

docker service create \
  --name desec-ddns \
  --secret desec_token \
  --secret desec_domain \
  -e DESEC_RECORD=home \
  --security-opt=no-new-privileges:true \
  m4um4u1/desec-ddns
```

## Security Features

- HTTPS certificate validation with minimum TLS 1.2
- Privacy-focused IP providers
- Rate limiting for API requests
- Non-root user in Docker container
- Structured logging for monitoring

## License

MIT