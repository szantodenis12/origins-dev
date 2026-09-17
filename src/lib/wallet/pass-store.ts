import { supabaseClient } from "../db/supabase-client";

export interface PassRegistration {
  deviceId: string;
  passTypeId: string;
  serialNumber: string;
  pushToken: string;
  updatedAt: string;
}

// In-memory cache for fast local access
const memoryStore = new Map<string, PassRegistration>();

function getKey(deviceId: string, passTypeId: string, serialNumber: string): string {
  return `${deviceId}:${passTypeId}:${serialNumber}`;
}

/**
 * Persist pass registrations inside Supabase `loyalty_config` table
 * under `config._passRegistrations` so it persists reliably across all Vercel serverless functions!
 */
async function loadRegistrationsFromSupabase(): Promise<PassRegistration[]> {
  if (!supabaseClient) return Array.from(memoryStore.values());

  try {
    const { data, error } = await supabaseClient
      .from("loyalty_config")
      .select("config")
      .eq("id", true)
      .single();

    if (error || !data?.config?._passRegistrations) {
      return Array.from(memoryStore.values());
    }

    const regs: PassRegistration[] = data.config._passRegistrations;
    // Populate memory cache
    for (const r of regs) {
      const k = getKey(r.deviceId, r.passTypeId, r.serialNumber);
      memoryStore.set(k, r);
    }
    return regs;
  } catch (err) {
    console.warn("[pass-store] error loading from Supabase:", err);
    return Array.from(memoryStore.values());
  }
}

async function saveRegistrationsToSupabase(regs: PassRegistration[]): Promise<void> {
  if (!supabaseClient) return;

  try {
    const { data } = await supabaseClient
      .from("loyalty_config")
      .select("config")
      .eq("id", true)
      .single();

    const currentConfig = data?.config || {};
    const updatedConfig = {
      ...currentConfig,
      _passRegistrations: regs,
    };

    await supabaseClient
      .from("loyalty_config")
      .upsert({ id: true, config: updatedConfig });
  } catch (err) {
    console.warn("[pass-store] error saving to Supabase:", err);
  }
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

  const allRegs = await loadRegistrationsFromSupabase();
  const existingIndex = allRegs.findIndex(
    (r) =>
      r.deviceId === deviceId &&
      r.passTypeId === passTypeId &&
      r.serialNumber === serialNumber,
  );

  if (existingIndex >= 0) {
    allRegs[existingIndex] = newReg;
  } else {
    allRegs.push(newReg);
  }

  await saveRegistrationsToSupabase(allRegs);
  console.log(`[pass-store] Saved registration for pass ${serialNumber} on device ${deviceId} (total: ${allRegs.length})`);

  return true;
}

export async function unregisterDevicePass(
  deviceId: string,
  passTypeId: string,
  serialNumber: string,
): Promise<boolean> {
  const key = getKey(deviceId, passTypeId, serialNumber);
  memoryStore.delete(key);

  const allRegs = await loadRegistrationsFromSupabase();
  const filtered = allRegs.filter(
    (r) =>
      !(
        r.deviceId === deviceId &&
        r.passTypeId === passTypeId &&
        r.serialNumber === serialNumber
      ),
  );

  await saveRegistrationsToSupabase(filtered);
  console.log(`[pass-store] Unregistered pass ${serialNumber} on device ${deviceId}`);

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
