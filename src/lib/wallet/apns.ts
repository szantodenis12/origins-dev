import http2 from "node:http2";
import forge from "node-forge";
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

export async function sendApnsNotification(
  pushToken: string,
  topic: string = process.env.APPLE_PASS_TYPE_ID || "pass.ro.originscafe.circle",
): Promise<boolean> {
  const tlsOpts = getTlsOptions();
  if (!tlsOpts) {
    console.warn("[apns] missing APPLE_CERT_P12_BASE64, APNs notification skipped");
    return false;
  }

  return new Promise((resolve) => {
    try {
      const client = http2.connect("https://api.push.apple.com:443", {
        pfx: tlsOpts.pfx,
        passphrase: tlsOpts.passphrase,
      });

      client.on("error", (err) => {
        console.error("[apns] client connection error:", err);
        resolve(false);
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
        const status = headers[":status"];
        client.close();
        if (status === 200) {
          console.log(`[apns] Push notification successfully sent to device (${pushToken.substring(0, 8)}...)`);
          resolve(true);
        } else {
          console.warn(`[apns] APNs responded with status ${status} for token ${pushToken.substring(0, 8)}...`);
          resolve(false);
        }
      });

      req.on("error", (err) => {
        console.error("[apns] request error:", err);
        client.close();
        resolve(false);
      });

      req.end(JSON.stringify({}));
    } catch (err) {
      console.error("[apns] send error:", err);
      resolve(false);
    }
  });
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
