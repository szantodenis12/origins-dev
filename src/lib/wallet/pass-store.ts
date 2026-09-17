import { supabaseClient } from "../db/supabase-client";

export interface PassRegistration {
  deviceId: string;
  passTypeId: string;
  serialNumber: string;
  pushToken: string;
  updatedAt: string;
}

// In-memory fallback if Supabase table is not yet provisioned
const memoryStore = new Map<string, PassRegistration>();

function getKey(deviceId: string, passTypeId: string, serialNumber: string): string {
  return `${deviceId}:${passTypeId}:${serialNumber}`;
}

export async function registerDevicePass(
  deviceId: string,
  passTypeId: string,
  serialNumber: string,
  pushToken: string,
): Promise<boolean> {
  const updatedAt = new Date().toISOString();
  const key = getKey(deviceId, passTypeId, serialNumber);

  memoryStore.set(key, {
    deviceId,
    passTypeId,
    serialNumber,
    pushToken,
    updatedAt,
  });

  if (!supabaseClient) return true;

  try {
    const { error } = await supabaseClient
      .from("apple_pass_registrations")
      .upsert({
        device_id: deviceId,
        pass_type_id: passTypeId,
        serial_number: serialNumber,
        push_token: pushToken,
        updated_at: updatedAt,
      });

    if (error) {
      console.warn("[apple-pass] Supabase registration upsert notice:", error.message);
    }
  } catch (err) {
    console.warn("[apple-pass] Supabase registration error:", err);
  }

  return true;
}

export async function unregisterDevicePass(
  deviceId: string,
  passTypeId: string,
  serialNumber: string,
): Promise<boolean> {
  const key = getKey(deviceId, passTypeId, serialNumber);
  memoryStore.delete(key);

  if (!supabaseClient) return true;

  try {
    await supabaseClient
      .from("apple_pass_registrations")
      .delete()
      .eq("device_id", deviceId)
      .eq("pass_type_id", passTypeId)
      .eq("serial_number", serialNumber);
  } catch (err) {
    console.warn("[apple-pass] Supabase registration delete error:", err);
  }

  return true;
}

export async function getRegistrationsForSerial(
  serialNumber: string,
): Promise<PassRegistration[]> {
  const results: PassRegistration[] = [];

  // Memory store results
  for (const reg of memoryStore.values()) {
    if (reg.serialNumber === serialNumber) {
      results.push(reg);
    }
  }

  if (!supabaseClient) return results;

  try {
    const { data, error } = await supabaseClient
      .from("apple_pass_registrations")
      .select("*")
      .eq("serial_number", serialNumber);

    if (!error && data) {
      for (const row of data) {
        if (!results.some((r) => r.deviceId === row.device_id)) {
          results.push({
            deviceId: row.device_id,
            passTypeId: row.pass_type_id,
            serialNumber: row.serial_number,
            pushToken: row.push_token,
            updatedAt: row.updated_at,
          });
        }
      }
    }
  } catch {}

  return results;
}

export async function getSerialNumbersForDevice(
  deviceId: string,
  passTypeId: string,
  passesUpdatedSince?: string,
): Promise<{ lastUpdated: string; serialNumbers: string[] }> {
  const serials = new Set<string>();
  let latestUpdate = new Date(0);

  // Check memory store
  for (const reg of memoryStore.values()) {
    if (reg.deviceId === deviceId && reg.passTypeId === passTypeId) {
      const regTime = new Date(reg.updatedAt);
      if (!passesUpdatedSince || regTime > new Date(passesUpdatedSince)) {
        serials.add(reg.serialNumber);
      }
      if (regTime > latestUpdate) latestUpdate = regTime;
    }
  }

  if (supabaseClient) {
    try {
      let query = supabaseClient
        .from("apple_pass_registrations")
        .select("*")
        .eq("device_id", deviceId)
        .eq("pass_type_id", passTypeId);

      if (passesUpdatedSince) {
        query = query.gt("updated_at", passesUpdatedSince);
      }

      const { data, error } = await query;
      if (!error && data) {
        for (const row of data) {
          serials.add(row.serial_number);
          const rowTime = new Date(row.updated_at);
          if (rowTime > latestUpdate) latestUpdate = rowTime;
        }
      }
    } catch {}
  }

  return {
    lastUpdated: latestUpdate.getTime() > 0 ? latestUpdate.toISOString() : new Date().toISOString(),
    serialNumbers: Array.from(serials),
  };
}
