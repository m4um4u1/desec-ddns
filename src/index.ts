import fetch from 'node-fetch';

// Read config from environment variables
const DESEC_TOKEN = process.env.DESEC_TOKEN;
const DESEC_DOMAIN = process.env.DESEC_DOMAIN;
const DESEC_RECORD = process.env.DESEC_RECORD;
const INTERVAL_SECONDS = parseInt(process.env.INTERVAL_SECONDS || '300', 10); // default: 5 minutes

if (!DESEC_TOKEN || !DESEC_DOMAIN || !DESEC_RECORD) {
  console.error('Missing required environment variables: DESEC_TOKEN, DESEC_DOMAIN, DESEC_RECORD');
  process.exit(1);
}

async function getPublicIP(): Promise<string> {
  const res = await fetch('https://api.ipify.org?format=json');
  if (!res.ok) throw new Error('Failed to fetch public IP');
  const data = await res.json();
  return data.ip;
}

async function updateDesecARecord(ip: string) {
  const url = `https://desec.io/api/v1/domains/${DESEC_DOMAIN}/rrsets/${DESEC_RECORD}/A/`;
  const body = JSON.stringify({
    subname: DESEC_RECORD,
    records: [ip],
    ttl: 60
  });
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Token ${DESEC_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to update A record: ${res.status} ${err}`);
  }
  console.log(`[${new Date().toISOString()}] A record updated to ${ip}`);
}

async function mainLoop() {
  let lastIp: string | null = null;
  while (true) {
    try {
      const ip = await getPublicIP();
      if (ip !== lastIp) {
        console.log(`[${new Date().toISOString()}] IP changed: ${lastIp} -> ${ip}`);
        await updateDesecARecord(ip);
        lastIp = ip;
      } else {
        console.log(`[${new Date().toISOString()}] IP unchanged (${ip}), no update needed.`);
      }
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Error:`, err);
    }
    await new Promise(res => setTimeout(res, INTERVAL_SECONDS * 1000));
  }
}

mainLoop();
