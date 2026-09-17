import { supabaseClient } from "../db/supabase-client";

export interface PassRegistration {
  deviceId: string;
  passTypeId: string;
  serialNumber: string;
  pushToken: string;
  updatedAt: string;
}

const memoryStore = new Map<string, PassRegistration>();

function getKey(deviceId: string, passTypeId: string, serialNumber: string): string {
  return `${deviceId}:${passTypeId}:${serialNumber}`;
}

export async function loadRegistrationsFromSupabase(): Promise<PassRegistration[]> {
  const map = new Map<string, PassRegistration>();

  // 1. Memory cache
  for (const r of memoryStore.values()) {
    map.set(getKey(r.deviceId, r.passTypeId, r.serialNumber), r);
  }

  if (!supabaseClient) return Array.from(map.values());

  // 2. Try dedicated table `apple_pass_registrations`
  try {
    const { data, error } = await supabaseClient
      .from("apple_pass_registrations")
      .select("*");

    if (!error && data && data.length > 0) {
      for (const row of data) {
        const reg: PassRegistration = {
          deviceId: row.device_id,
          passTypeId: row.pass_type_id,
          serialNumber: row.serial_number,
          pushToken: row.push_token,
          updatedAt: row.updated_at,
        };
        map.set(getKey(reg.deviceId, reg.passTypeId, reg.serialNumber), reg);
        memoryStore.set(getKey(reg.deviceId, reg.passTypeId, reg.serialNumber), reg);
      }
      return Array.from(map.values());
    }
  } catch {}

  // 3. Fallback to `loyalty_config` JSON column
  try {
    const { data } = await supabaseClient
      .from("loyalty_config")
      .select("config")
      .eq("id", true)
      .single();

    if (data?.config?._passRegistrations) {
      const regs: PassRegistration[] = data.config._passRegistrations;
      for (const r of regs) {
        map.set(getKey(r.deviceId, r.passTypeId, r.serialNumber), r);
        memoryStore.set(getKey(r.deviceId, r.passTypeId, r.serialNumber), r);
      }
    }
  } catch {}

  return Array.from(map.values());
}

export async function registerDevicePass(
  deviceId: string,
  passTypeId: string,
  serialNumber: string,
  pushToken: string,
): Promise<boolean> {
  const updatedAt = new Date().toISOString();
  const key = getKey(deviceId, passTypeId, serialNumber);
  const newReg: PassRegistration = {
    deviceId,
    passTypeId,
    serialNumber,
    pushToken,
    updatedAt,
  };

  memoryStore.set(key, newReg);

  if (!supabaseClient) return true;

  // Try dedicated table `apple_pass_registrations`
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

    if (!error) {
      console.log(`[pass-store] Upserted registration in apple_pass_registrations table for ${serialNumber}`);
    }
  } catch {}

  // Also save to `loyalty_config`
  try {
    const allRegs = await loadRegistrationsFromSupabase();
    const idx = allRegs.findIndex(
      (r) =>
        r.deviceId === deviceId &&
        r.passTypeId === passTypeId &&
        r.serialNumber === serialNumber,
    );
    if (idx >= 0) allRegs[idx] = newReg;
    else allRegs.push(newReg);

    const { data } = await supabaseClient
      .from("loyalty_config")
      .select("config")
      .eq("id", true)
      .single();

    const currentConfig = data?.config || {};
    await supabaseClient
      .from("loyalty_config")
      .upsert({ id: true, config: { ...currentConfig, _passRegistrations: allRegs } });
  } catch {}

  return true;
}

export async function unregisterDevicePass(
  deviceId: string,
  passTypeId: string,
  serialNumber: string,
): Promise<boolean> {
  const key = getKey(deviceId, passTypeId, serialNumber);
  memoryStore.delete(key);

  if (supabaseClient) {
    try {
      await supabaseClient
        .from("apple_pass_registrations")
        .delete()
        .eq("device_id", deviceId)
        .eq("pass_type_id", passTypeId)
        .eq("serial_number", serialNumber);
    } catch {}

    try {
      const allRegs = await loadRegistrationsFromSupabase();
      const filtered = allRegs.filter(
        (r) =>
          !(
            r.deviceId === deviceId &&
            r.passTypeId === passTypeId &&
            r.serialNumber === serialNumber
          ),
      );
      const { data } = await supabaseClient
        .from("loyalty_config")
        .select("config")
        .eq("id", true)
        .single();
      await supabaseClient
        .from("loyalty_config")
        .upsert({ id: true, config: { ...(data?.config || {}), _passRegistrations: filtered } });
    } catch {}
  }

  return true;
}

export async function getRegistrationsForSerial(
  serialNumber: string,
): Promise<PassRegistration[]> {
  const allRegs = await loadRegistrationsFromSupabase();
  return allRegs.filter((r) => r.serialNumber === serialNumber);
}

export async function getSerialNumbersForDevice(
  deviceId: string,
  passTypeId: string,
  passesUpdatedSince?: string,
): Promise<{ lastUpdated: string; serialNumbers: string[] }> {
  const allRegs = await loadRegistrationsFromSupabase();
  const serials = new Set<string>();
  let latestUpdate = new Date(0);

  for (const reg of allRegs) {
    if (reg.deviceId === deviceId && reg.passTypeId === passTypeId) {
      const regTime = new Date(reg.updatedAt);
      if (!passesUpdatedSince || regTime > new Date(passesUpdatedSince)) {
        serials.add(reg.serialNumber);
      }
      if (regTime > latestUpdate) latestUpdate = regTime;
    }
  }

  return {
    lastUpdated: latestUpdate.getTime() > 0 ? latestUpdate.toISOString() : new Date().toISOString(),
    serialNumbers: Array.from(serials),
  };
}

export async function listAllRegistrations(): Promise<PassRegistration[]> {
  return loadRegistrationsFromSupabase();
}
