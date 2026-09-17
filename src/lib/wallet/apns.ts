import http2 from "node:http2";
import { getRegistrationsForSerial } from "./pass-store";

function getTlsOptions(): { pfx: Buffer; passphrase: string } | null {
  const p12Base64 = process.env.APPLE_CERT_P12_BASE64;
  const p12Password = process.env.APPLE_CERT_PASSWORD ?? "origins2024";

  if (!p12Base64) return null;

  try {
    const p12Der = Buffer.from(p12Base64, "base64");
    return {
      pfx: p12Der,
      passphrase: p12Password,
    };
  } catch (err) {
    console.error("[apns] error loading p12 certificate:", err);
    return null;
  }
}

async function sendToApnsHost(
  host: string,
  pushToken: string,
  topic: string,
  tlsOpts: { pfx: Buffer; passphrase: string },
): Promise<{ success: boolean; status?: number; error?: string }> {
  return new Promise((resolve) => {
    try {
      const client = http2.connect(`https://${host}:443`, {
        pfx: tlsOpts.pfx,
        passphrase: tlsOpts.passphrase,
      });

      client.on("error", (err) => {
        console.error(`[apns] connection error (${host}):`, err.message);
        resolve({ success: false, error: err.message });
      });

      const req = client.request({
        ":method": "POST",
        ":path": `/3/device/${pushToken}`,
        "apns-topic": topic,
        "apns-push-type": "background",
        "apns-priority": "5",
        "content-type": "application/json",
      });

      req.on("response", (headers) => {
        const status = Number(headers[":status"]);
        client.close();
        if (status === 200) {
          console.log(`[apns] Success (${host}) -> token ${pushToken.substring(0, 8)}...`);
          resolve({ success: true, status });
        } else {
          console.warn(`[apns] Rejected (${host}) status ${status} -> token ${pushToken.substring(0, 8)}...`);
          resolve({ success: false, status });
        }
      });

      req.on("error", (err) => {
        console.error(`[apns] request error (${host}):`, err.message);
        client.close();
        resolve({ success: false, error: err.message });
      });

      req.end(JSON.stringify({}));
    } catch (err: any) {
      console.error(`[apns] exception (${host}):`, err?.message);
      resolve({ success: false, error: err?.message });
    }
  });
}

export async function sendApnsNotification(
  pushToken: string,
  topic: string = process.env.APPLE_PASS_TYPE_ID || "pass.ro.originscafe.circle",
): Promise<boolean> {
  const tlsOpts = getTlsOptions();
  if (!tlsOpts) {
    console.warn("[apns] missing APPLE_CERT_P12_BASE64, APNs skipped");
    return false;
  }

  // Try production APNs first
  let res = await sendToApnsHost("api.push.apple.com", pushToken, topic, tlsOpts);
  if (res.success) return true;

  // Fall back to sandbox APNs
  res = await sendToApnsHost("api.sandbox.push.apple.com", pushToken, topic, tlsOpts);
  return res.success;
}

export async function notifyPassUpdated(serialNumber: string): Promise<void> {
  try {
    const registrations = await getRegistrationsForSerial(serialNumber);
    if (registrations.length === 0) {
      console.log(`[apns] No registered devices found for serial ${serialNumber}`);
      return;
    }

    console.log(`[apns] Sending APNs update notifications to ${registrations.length} device(s) for serial ${serialNumber}`);
    for (const reg of registrations) {
      await sendApnsNotification(reg.pushToken, reg.passTypeId);
    }
  } catch (err) {
    console.error("[apns] notifyPassUpdated error:", err);
  }
}
