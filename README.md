# desec-ddns

A simple Dockerized tool to update a desec.io A record to the current public IP of the device running the container.

## Usage

### Environment Variables
- `DESEC_TOKEN`: Your desec.io API token
- `DESEC_DOMAIN`: The domain managed in desec.io (e.g., `example.com`)
- `DESEC_RECORD`: The subdomain/record to update (e.g., `@` for root, or `home` for `home.example.com`)
- `INTERVAL_SECONDS`: (Optional) How often to check/update, in seconds. Default: 300 (5 minutes)

### Build and Run with Docker

```sh
docker build -t desec-ddns .

docker run --rm \
  -e DESEC_TOKEN=your_token \
  -e DESEC_DOMAIN=example.com \
  -e DESEC_RECORD=home \
  desec-ddns
```

## How it works
- Fetches the current public IP using https://api.ipify.org
- Updates the specified A record in desec.io using their API
