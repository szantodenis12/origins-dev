import { supabaseClient } from "../db/supabase-client.ts";

/**
 * Which phone holds which pass, and the APNs token that reaches it.
 *
 * `apple_pass_registrations` is the record. The JSON mirror inside
 * `loyalty_config` is only a safety net for the case where that table is
 * unreachable: it is a read-modify-write of a single row, so two phones
 * registering at the same moment overwrite each other, and it must never be
 * the normal path.
 */

export interface PassRegistration {
  deviceId: string;
  passTypeId: string;
  serialNumber: string;
  pushToken: string;
  updatedAt: string;
}

/**
 * Per-process cache. It makes a warm instance fast, but it is not storage:
 * the next request may land on another instance with an empty map, which is
 * exactly why a failed table write has to be loud.
 */
const memoryStore = new Map<string, PassRegistration>();

function getKey(
  deviceId: string,
  passTypeId: string,
  serialNumber: string,
): string {
  return `${deviceId}:${passTypeId}:${serialNumber}`;
}

function keyOf(reg: PassRegistration): string {
  return getKey(reg.deviceId, reg.passTypeId, reg.serialNumber);
}

function fromRow(row: Record<string, string>): PassRegistration {
  return {
    deviceId: row.device_id,
    passTypeId: row.pass_type_id,
    serialNumber: row.serial_number,
    pushToken: row.push_token,
    updatedAt: row.updated_at,
  };
}

async function readMirror(): Promise<PassRegistration[]> {
  if (!supabaseClient) return [];
  try {
    const { data } = await supabaseClient
      .from("loyalty_config")
      .select("config")
      .eq("id", true)
      .single();
    const regs = data?.config?._passRegistrations;
    return Array.isArray(regs) ? (regs as PassRegistration[]) : [];
  } catch {
    return [];
  }
}

async function writeMirror(registrations: PassRegistration[]): Promise<void> {
  if (!supabaseClient) return;
  try {
    const { data } = await supabaseClient
      .from("loyalty_config")
      .select("config")
      .eq("id", true)
      .single();
    await supabaseClient.from("loyalty_config").upsert({
      id: true,
      config: { ...(data?.config || {}), _passRegistrations: registrations },
    });
  } catch (err) {
    console.error("[pass-store] mirror write failed:", err);
  }
}

export async function loadRegistrationsFromSupabase(): Promise<
  PassRegistration[]
> {
  const map = new Map<string, PassRegistration>();
  for (const reg of memoryStore.values()) map.set(keyOf(reg), reg);

  if (!supabaseClient) return Array.from(map.values());

  try {
    const { data, error } = await supabaseClient
      .from("apple_pass_registrations")
      .select("*");

    if (error) {
      console.error(
        "[pass-store] cannot read apple_pass_registrations:",
        error.message,
      );
    } else if (data) {
      for (const row of data) {
        const reg = fromRow(row);
        map.set(keyOf(reg), reg);
        memoryStore.set(keyOf(reg), reg);
      }
      // The table answered, so it is authoritative; the mirror is only
      // consulted when it did not.
      return Array.from(map.values());
    }
  } catch (err) {
    console.error("[pass-store] apple_pass_registrations threw:", err);
  }

  for (const reg of await readMirror()) {
    map.set(keyOf(reg), reg);
    memoryStore.set(keyOf(reg), reg);
  }
  return Array.from(map.values());
}

export async function registerDevicePass(
  deviceId: string,
  passTypeId: string,
  serialNumber: string,
  pushToken: string,
): Promise<boolean> {
  const updatedAt = new Date().toISOString();
  const reg: PassRegistration = {
    deviceId,
    passTypeId,
    serialNumber,
    pushToken,
    updatedAt,
  };
  memoryStore.set(keyOf(reg), reg);

  if (!supabaseClient) return true;

  // The primary key is (device_id, pass_type_id, serial_number), so this is
  // race-free: two phones registering at once touch two different rows.
  const { error } = await supabaseClient
    .from("apple_pass_registrations")
    .upsert(
      {
        device_id: deviceId,
        pass_type_id: passTypeId,
        serial_number: serialNumber,
        push_token: pushToken,
        updated_at: updatedAt,
      },
      { onConflict: "device_id,pass_type_id,serial_number" },
    );

  if (!error) {
    console.log(`[pass-store] registered ${serialNumber} on ${deviceId}`);
    return true;
  }

  // Losing this silently is how a member ends up never receiving an update,
  // so say so and fall back to the mirror rather than dropping it.
  console.error(
    `[pass-store] registration write failed for ${serialNumber}: ${error.message} — falling back to mirror`,
  );
  const all = await readMirror();
  const next = all.filter((r) => keyOf(r) !== keyOf(reg));
  next.push(reg);
  await writeMirror(next);
  return true;
}

export async function unregisterDevicePass(
  deviceId: string,
  passTypeId: string,
  serialNumber: string,
): Promise<boolean> {
  memoryStore.delete(getKey(deviceId, passTypeId, serialNumber));

  if (!supabaseClient) return true;

  const { error } = await supabaseClient
    .from("apple_pass_registrations")
    .delete()
    .eq("device_id", deviceId)
    .eq("pass_type_id", passTypeId)
    .eq("serial_number", serialNumber);

  if (error) {
    console.error(`[pass-store] unregister failed: ${error.message}`);
  }

  const mirror = await readMirror();
  if (mirror.length > 0) {
    await writeMirror(
      mirror.filter(
        (r) => keyOf(r) !== getKey(deviceId, passTypeId, serialNumber),
      ),
    );
  }
  return true;
}

/**
 * Drop every registration using a token APNs has retired (410 / Unregistered).
 * Without this, a reinstalled or wiped phone keeps costing a failed push on
 * every stamp, forever.
 */
export async function removeRegistrationsForToken(
  pushToken: string,
): Promise<void> {
  for (const [key, reg] of memoryStore) {
    if (reg.pushToken === pushToken) memoryStore.delete(key);
  }

  if (!supabaseClient) return;

  const { error } = await supabaseClient
    .from("apple_pass_registrations")
    .delete()
    .eq("push_token", pushToken);

  if (error) {
    console.error(`[pass-store] dead-token cleanup failed: ${error.message}`);
  }

  const mirror = await readMirror();
  if (mirror.some((r) => r.pushToken === pushToken)) {
    await writeMirror(mirror.filter((r) => r.pushToken !== pushToken));
  }
}

export async function getRegistrationsForSerial(
  serialNumber: string,
): Promise<PassRegistration[]> {
  const all = await loadRegistrationsFromSupabase();
  return all.filter((r) => r.serialNumber === serialNumber);
}

/**
 * Answers Apple's "what changed for this device since X".
 *
 * `lastUpdated` is an opaque token Apple hands back on the next poll. It has
 * to describe the data we are returning, so it is the newest registration we
 * know about — not the current clock, which would make every poll look fresh
 * and the value meaningless.
 */
export async function getSerialNumbersForDevice(
  deviceId: string,
  passTypeId: string,
  passesUpdatedSince?: string,
): Promise<{ lastUpdated: string; serialNumbers: string[] }> {
  const all = await loadRegistrationsFromSupabase();
  const mine = all.filter(
    (r) => r.deviceId === deviceId && r.passTypeId === passTypeId,
  );

  let newest = 0;
  for (const reg of mine) {
    const t = new Date(reg.updatedAt).getTime();
    if (!Number.isNaN(t) && t > newest) newest = t;
  }

  const since = passesUpdatedSince
    ? new Date(passesUpdatedSince).getTime()
    : NaN;

  // Apple asks for what changed; answering with everything is safe but makes
  // the phone re-download passes it already has. Only narrow when the marker
  // parses and we have something strictly newer to report.
  const changed = Number.isNaN(since)
    ? mine
    : mine.filter((r) => new Date(r.updatedAt).getTime() > since);

  return {
    lastUpdated: new Date(newest || Date.now()).toISOString(),
    serialNumbers: Array.from(new Set(changed.map((r) => r.serialNumber))),
  };
}

/**
 * Mark passes as freshly changed, so a device polling with
 * `passesUpdatedSince` is told to come and fetch them.
 */
export async function touchPassRegistration(
  serialNumber: string | string[],
): Promise<void> {
  const serials = Array.isArray(serialNumber) ? serialNumber : [serialNumber];
  if (serials.length === 0) return;

  const updatedAt = new Date().toISOString();
  for (const reg of memoryStore.values()) {
    if (serials.includes(reg.serialNumber)) reg.updatedAt = updatedAt;
  }

  if (!supabaseClient) return;

  const { error } = await supabaseClient
    .from("apple_pass_registrations")
    .update({ updated_at: updatedAt })
    .in("serial_number", serials);

  if (error) {
    console.error(`[pass-store] touch failed: ${error.message}`);
  }
}

export async function listAllRegistrations(): Promise<PassRegistration[]> {
  return loadRegistrationsFromSupabase();
}
