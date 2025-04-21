import fetch from 'node-fetch';

// Read config from environment variables
const DESEC_TOKEN = process.env.DESEC_TOKEN;
const DESEC_DOMAIN = process.env.DESEC_DOMAIN;
const DESEC_RECORD = process.env.DESEC_RECORD;
const INTERVAL_SECONDS = parseInt(process.env.INTERVAL_SECONDS || '300', 10); // default: 5 minutes

if (!DESEC_TOKEN || !DESEC_DOMAIN) {
  console.error('Missing required environment variables: DESEC_TOKEN, DESEC_DOMAIN');
  process.exit(1);
}

async function getPublicIP(): Promise<string> {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    if (!res.ok) throw new Error('Failed to fetch public IP');
    const { ip } = await res.json();
    return ip;
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error fetching public IP:`, err);
    throw err;
  }
}

async function getCurrentARecordIP(): Promise<string | null> {
  try {
    const url = DESEC_RECORD && DESEC_RECORD !== '@'
        ? `https://desec.io/api/v1/domains/${DESEC_DOMAIN}/rrsets/${DESEC_RECORD}/A/`
        : `https://desec.io/api/v1/domains/${DESEC_DOMAIN}/rrsets/.../A/`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${DESEC_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to fetch A record: ${res.status} ${err}`);
    }

    const data = await res.json();
    return data.records && data.records.length > 0 ? data.records[0] : null;
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error fetching current A record IP:`, err);
    throw err;
  }
}

async function updateDesecARecord(ip: string) {
  try {
    const url = DESEC_RECORD && DESEC_RECORD !== '@'
        ? `https://desec.io/api/v1/domains/${DESEC_DOMAIN}/rrsets/${DESEC_RECORD}/A/`
        : `https://desec.io/api/v1/domains/${DESEC_DOMAIN}/rrsets/.../A/`;

    const body = JSON.stringify({
      subname: DESEC_RECORD && DESEC_RECORD !== '@' ? DESEC_RECORD : '',
      records: [ip],
      ttl: 3600,
      type: 'A'
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
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error updating A record:`, err);
    throw err;
  }
}

async function monitorAndUpdateIP() {
  let lastIp: string | null;

  try {
    lastIp = await getCurrentARecordIP();
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Failed to retrieve initial A record IP, setting lastIp to null`);
    lastIp = null;
  }

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
      process.exit(1); // Terminate the process on error
    }

    await new Promise(res => setTimeout(res, INTERVAL_SECONDS * 1000));
  }
}

monitorAndUpdateIP().catch(err => {
  console.error(`[${new Date().toISOString()}] Unhandled error occurred:`, err);
  process.exit(1); // Terminate the process on unhandled error
});
