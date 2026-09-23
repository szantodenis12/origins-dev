import http2 from "node:http2";
import {
  getRegistrationsForSerial,
  loadRegistrationsFromSupabase,
  removeRegistrationsForToken,
  touchPassRegistration,
  type PassRegistration,
} from "./pass-store.ts";

/**
 * Telling iPhones that a pass changed.
 *
 * APNs only carries the nudge: the phone answers it by calling our web
 * service for the whole .pkpass. So everything here is about the nudge
 * arriving at all — the pass itself is built in lib/wallet/apple.ts.
 */

/**
 * A push that expires immediately is discarded the moment the phone is not
 * reachable — pocket, tunnel, Low Power Mode — and APNs never tries again.
 * That is what made stamps land for a tester holding an unlocked phone and
 * silently vanish for everyone else, so notifications now stay valid for a
 * day and APNs retries until the phone reappears.
 */
const EXPIRY_WINDOW_S = 24 * 60 * 60;
const CONNECT_TIMEOUT_MS = 5_000;
const REQUEST_TIMEOUT_MS = 5_000;
/**
 * The barista's scan awaits this, so the whole fan-out gets a budget. A slow
 * APNs must never hold up the till.
 */
const BATCH_BUDGET_MS = 12_000;
const MAX_CONCURRENT = 8;

const PRODUCTION_HOST = "api.push.apple.com";
const SANDBOX_HOST = "api.sandbox.push.apple.com";

function getTlsOptions(): { pfx: Buffer; passphrase: string } | null {
  const p12Base64 = process.env.APPLE_CERT_P12_BASE64;
  const p12Password = process.env.APPLE_CERT_PASSWORD ?? "origins2024";
  if (!p12Base64) return null;

  try {
    return {
      pfx: Buffer.from(p12Base64, "base64"),
      passphrase: p12Password,
    };
  } catch (err) {
    console.error("[apns] error loading p12 certificate:", err);
    return null;
  }
}

interface ApnsOutcome {
  success: boolean;
  status?: number;
  /** APNs `reason` string, e.g. BadDeviceToken / Unregistered. */
  reason?: string;
  error?: string;
}

/**
 * One HTTP/2 session, many pushes.
 *
 * The old code opened a fresh TLS connection per device and awaited them one
 * at a time, which is a handshake per stamp and does not survive a broadcast.
 */
class ApnsSession {
  private client: http2.ClientHttp2Session | null = null;
  private connecting: Promise<http2.ClientHttp2Session | null> | null = null;
  private readonly host: string;

  // Written out rather than a parameter property: the test runner strips
  // types without transforming, and parameter properties need a transform.
  constructor(host: string) {
    this.host = host;
  }

  private connect(): Promise<http2.ClientHttp2Session | null> {
    if (this.client && !this.client.closed && !this.client.destroyed) {
      return Promise.resolve(this.client);
    }
    if (this.connecting) return this.connecting;

    const tlsOpts = getTlsOptions();
    if (!tlsOpts) return Promise.resolve(null);

    this.connecting = new Promise((resolve) => {
      let settled = false;
      const done = (value: http2.ClientHttp2Session | null) => {
        if (settled) return;
        settled = true;
        this.connecting = null;
        resolve(value);
      };

      const client = http2.connect(`https://${this.host}:443`, {
        pfx: tlsOpts.pfx,
        passphrase: tlsOpts.passphrase,
      });

      const timer = setTimeout(() => {
        console.error(`[apns] connect timeout (${this.host})`);
        client.destroy();
        done(null);
      }, CONNECT_TIMEOUT_MS);

      client.once("connect", () => {
        clearTimeout(timer);
        this.client = client;
        done(client);
      });

      client.once("error", (err) => {
        clearTimeout(timer);
        console.error(`[apns] connection error (${this.host}):`, err.message);
        this.client = null;
        done(null);
      });

      client.once("close", () => {
        this.client = null;
      });
    });

    return this.connecting;
  }

  async send(pushToken: string, topic: string): Promise<ApnsOutcome> {
    const client = await this.connect();
    if (!client) return { success: false, error: "no connection" };

    return new Promise<ApnsOutcome>((resolve) => {
      let settled = false;
      const done = (outcome: ApnsOutcome) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(outcome);
      };

      const req = client.request({
        ":method": "POST",
        ":path": `/3/device/${pushToken}`,
        // A pass update is a silent background push. "pass" reads like the
        // obvious value and is not one APNs accepts — it answers 400
        // InvalidPushType before it even looks at the token, which silently
        // costs every notification. `probeApns` exists to catch exactly that.
        "apns-push-type": "background",
        "apns-topic": topic,
        "apns-priority": "10",
        "apns-expiration": String(
          Math.floor(Date.now() / 1000) + EXPIRY_WINDOW_S,
        ),
      });

      const timer = setTimeout(() => {
        req.close(http2.constants.NGHTTP2_CANCEL);
        done({ success: false, error: "request timeout" });
      }, REQUEST_TIMEOUT_MS);

      let status = 0;
      let payload = "";

      req.on("response", (headers) => {
        status = Number(headers[":status"]);
      });
      req.setEncoding("utf8");
      req.on("data", (chunk: string) => {
        payload += chunk;
      });

      req.on("end", () => {
        if (status === 200) return done({ success: true, status });
        let reason: string | undefined;
        try {
          reason = JSON.parse(payload)?.reason;
        } catch {}
        done({ success: false, status, reason });
      });

      req.on("error", (err) => {
        done({ success: false, error: err.message });
      });

      req.end("{}");
    });
  }

  close(): void {
    this.client?.close();
    this.client = null;
  }
}

/** APNs will never accept this token again — drop the registration. */
function isDeadToken(outcome: ApnsOutcome): boolean {
  return (
    outcome.status === 410 ||
    outcome.reason === "Unregistered" ||
    outcome.reason === "BadDeviceToken" ||
    outcome.reason === "DeviceTokenNotForTopic"
  );
}

/**
 * Deliver one nudge per registration, in parallel and under a time budget.
 * Returns how many APNs accepted.
 */
async function deliver(registrations: PassRegistration[]): Promise<number> {
  if (registrations.length === 0) return 0;
  if (!getTlsOptions()) {
    console.warn("[apns] missing APPLE_CERT_P12_BASE64, APNs skipped");
    return 0;
  }

  const production = new ApnsSession(PRODUCTION_HOST);
  // Held in an array so the workers can open it lazily without the compiler
  // narrowing the outer binding to null.
  const sandbox: ApnsSession[] = [];
  const deadline = Date.now() + BATCH_BUDGET_MS;

  let sent = 0;
  let index = 0;

  const worker = async () => {
    while (index < registrations.length) {
      if (Date.now() > deadline) {
        console.warn(
          `[apns] batch budget spent, ${registrations.length - index} device(s) not reached`,
        );
        return;
      }
      const reg = registrations[index++];
      const topic = reg.passTypeId;

      let outcome = await production.send(reg.pushToken, topic);

      // A pass cert serves production; only a token APNs outright rejects is
      // worth a second try against sandbox (a device paired to a dev build).
      if (!outcome.success && outcome.reason === "BadDeviceToken") {
        if (sandbox.length === 0) sandbox.push(new ApnsSession(SANDBOX_HOST));
        outcome = await sandbox[0].send(reg.pushToken, topic);
      }

      if (outcome.success) {
        sent++;
        continue;
      }

      if (isDeadToken(outcome)) {
        console.log(
          `[apns] dropping dead registration ${reg.serialNumber} (${outcome.reason ?? outcome.status})`,
        );
        await removeRegistrationsForToken(reg.pushToken);
      } else {
        console.warn(
          `[apns] ${reg.serialNumber} not delivered: status=${outcome.status ?? "-"} reason=${outcome.reason ?? outcome.error ?? "-"}`,
        );
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(MAX_CONCURRENT, registrations.length) },
      worker,
    ),
  );

  production.close();
  sandbox[0]?.close();
  return sent;
}

/**
 * Ask APNs whether it accepts our headers, without touching anyone's phone.
 *
 * The token is deliberately invalid, and APNs validates headers first: a
 * header it dislikes comes back as InvalidPushType / BadTopic / a TLS error,
 * while `BadDeviceToken` means everything except the token was accepted —
 * which is the answer we want.
 *
 * This exists because a wrong `apns-push-type` fails every push identically
 * and invisibly: registrations stay, no errors surface, cards just quietly
 * stop updating.
 */
export async function probeApns(): Promise<{
  ok: boolean;
  status?: number;
  reason?: string;
  error?: string;
  detail: string;
}> {
  if (!getTlsOptions()) {
    return { ok: false, detail: "no certificate configured (APPLE_CERT_P12_BASE64)" };
  }

  const topic = process.env.APPLE_PASS_TYPE_ID || "pass.ro.originscafe.circle";
  const session = new ApnsSession(PRODUCTION_HOST);
  const outcome = await session.send("00".repeat(32), topic);
  session.close();

  const headersAccepted = outcome.reason === "BadDeviceToken";
  return {
    ok: headersAccepted,
    status: outcome.status,
    reason: outcome.reason,
    error: outcome.error,
    detail: headersAccepted
      ? "headers and certificate accepted (BadDeviceToken is expected for the fake token)"
      : `APNs rejected the request before the token: ${outcome.reason ?? outcome.error ?? "unknown"}`,
  };
}

/**
 * Kept for callers that only hold a token. Prefer `notifyPassUpdated`, which
 * also cleans up after a token APNs has retired.
 */
export async function sendApnsNotification(
  pushToken: string,
  topic: string = process.env.APPLE_PASS_TYPE_ID ||
    "pass.ro.originscafe.circle",
): Promise<boolean> {
  const session = new ApnsSession(PRODUCTION_HOST);
  const outcome = await session.send(pushToken, topic);
  session.close();
  return outcome.success;
}

export async function notifyPassUpdated(serialNumber: string): Promise<number> {
  try {
    const registrations = await getRegistrationsForSerial(serialNumber);
    if (registrations.length === 0) {
      console.log(`[apns] No registered devices for serial ${serialNumber}`);
      return 0;
    }

    await touchPassRegistration(serialNumber);
    const sent = await deliver(registrations);
    console.log(
      `[apns] ${serialNumber}: notified ${sent}/${registrations.length} device(s)`,
    );
    return sent;
  } catch (err) {
    console.error("[apns] notifyPassUpdated error:", err);
    return 0;
  }
}

export async function notifyAllPassesUpdated(
  serialNumbers?: string[],
): Promise<number> {
  try {
    const all = await loadRegistrationsFromSupabase();
    if (all.length === 0) {
      console.log("[apns] No registered devices found across all passes");
      return 0;
    }

    const wanted = serialNumbers?.length ? new Set(serialNumbers) : null;
    const targets = wanted ? all.filter((r) => wanted.has(r.serialNumber)) : all;

    console.log(`[apns] Broadcasting to ${targets.length} registered device(s)`);

    // One write for the whole batch instead of one per device.
    await touchPassRegistration([
      ...new Set(targets.map((r) => r.serialNumber)),
    ]);
    return await deliver(targets);
  } catch (err) {
    console.error("[apns] notifyAllPassesUpdated error:", err);
    return 0;
  }
}
