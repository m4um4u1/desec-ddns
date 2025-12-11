# desec-ddns

A secure tool to update a desec.io A record with your current public IP.

## Quick Start

```sh
docker run -d --name desec-ddns \
  -e DESEC_TOKEN=your_token \
  -e DESEC_DOMAIN=example.com \
  m4um4u1/desec-ddns
```

## Features

- Secure: HTTPS validation, input validation, minimal permissions
- Reliable: Multiple IP providers with fallback and retry logic
- Privacy-focused: Uses IP providers with better privacy practices

## Usage

### Required Environment Variables
- `DESEC_TOKEN`: Your desec.io API token
- `DESEC_DOMAIN`: Your domain (e.g., `example.com`)

### Optional Environment Variables
- `DESEC_RECORD`: Subdomain to update (default: `@` - updates the root domain)
- `INTERVAL_SECONDS`: Update interval in seconds (default: 300)
- `TTL`: DNS record TTL in seconds (default: 3600)

### Examples

Update root domain (`example.com`):
```sh
-e DESEC_DOMAIN=example.com
```

Update subdomain (`home.example.com`):
```sh
-e DESEC_DOMAIN=example.com \
-e DESEC_RECORD=home
```

### Docker

#### Minimum
```sh
docker run -d --name desec-ddns \
  -e DESEC_TOKEN=your_token \
  -e DESEC_DOMAIN=example.com \
  m4um4u1/desec-ddns
```

#### Maximum
```sh
docker run -d --name desec-ddns \
  -e DESEC_TOKEN=your_token \
  -e DESEC_DOMAIN=example.com \
  -e DESEC_RECORD=home \
  -e INTERVAL_SECONDS=300 \
  -e TTL=3600 \
  --restart unless-stopped \
  m4um4u1/desec-ddns
```

## Troubleshooting

- **Container won't start**: Ensure all required environment variables are set
- **DNS not updating**: Check your DESEC_TOKEN has proper permissions
- **IP detection issues**: The tool has built-in failover between multiple IP providers

## License

MIT