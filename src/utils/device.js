import { createSupabaseClient } from './supabaseClient';
import { getAssignedArm, persistAssignedArm } from './sessionLog.js';

const DEVICE_ID_KEY = 'pred-study:device-id';

function coinFlipArm() {
  return Math.random() < 0.5 ? 'feedback' : 'silent';
}

export function getOrCreateDeviceId() {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function getDeviceType(userAgent = navigator.userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(ua)) return 'tablet';
  if (/mobile|iphone|ipod|android.*mobile|windows phone|blackberry/.test(ua)) return 'mobile';
  return 'desktop';
}

export async function lookupPublicIp() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3500);
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: ctrl.signal });
    const body = await res.json();
    return typeof body.ip === 'string' ? body.ip : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function getDeviceContext() {
  const userAgent = navigator.userAgent || '';
  return {
    deviceId: getOrCreateDeviceId(),
    deviceType: getDeviceType(userAgent),
    userAgent,
    ipAddress: await lookupPublicIp(),
  };
}

export async function checkDeviceCanStart(device) {
  const supabase = createSupabaseClient();
  if (!supabase) {
    return { allowed: true };
  }
  const { data, error } = await supabase.rpc('device_can_start', {
    p_device_id: device.deviceId,
    p_ip: device.ipAddress,
  });
  if (error) throw new Error(error.message || 'Could not check device');
  return data || { allowed: false, reason: 'Could not check device' };
}

export async function claimProtocolArm(deviceId) {
  const stored = getAssignedArm();
  if (stored) return stored;

  const id = deviceId || getOrCreateDeviceId();
  const supabase = createSupabaseClient();
  let arm = coinFlipArm();

  if (supabase && id) {
    const { data, error } = await supabase.rpc('claim_protocol', { p_device_id: id });
    if (!error && (data === 'feedback' || data === 'silent')) {
      arm = data;
    }
  }

  persistAssignedArm(arm);
  return arm;
}
