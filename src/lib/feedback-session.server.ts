import { useSession, setResponseHeader, getRequestHeader, getCookie, setCookie } from '@tanstack/react-start/server';
import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { SESSION_SECONDS, type Access } from './feedback-model';

export function getRequiredSecret(name: string, devFallback: string): string {
  const val = process.env[name];
  if (!val) {
    console.warn(`[Security Warning]: Missing environment variable ${name}, using fallback secret.`);
    return devFallback;
  }
  return val;
}

export async function session() {
  const secret = getRequiredSecret('SESSION_SECRET', 'feedback-default-dev-session-secret-key-at-least-32-bytes!');
  setResponseHeader('Cache-Control', 'no-store');
  const isProd = process.env['NODE_ENV'] === 'production';
  return useSession<{ access?: Access }>({
    password: secret,
    name: 'feedback-session',
    maxAge: SESSION_SECONDS,
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
    },
  });
}

export function pinHash(pin: string) {
  const secret = getRequiredSecret('PIN_HASH_SECRET', 'feedback-default-dev-pin-hash-secret-at-least-32-bytes!');
  return createHmac('sha256', secret).update(pin).digest('hex');
}

export async function requireAccess(admin = false) {
  const s = await session();
  const access = s.data.access;
  if (!access || access.expires < Date.now()) {
    throw new Error('Please sign in to continue.');
  }
  if (admin && access.role !== 'admin') {
    throw new Error('This action is for the internal team only.');
  }
  if (access.role === 'customer') {
    try {
      // 1. Primary check against Supabase Cloud
      const { supabaseAdmin: db, hasSupabaseAdmin } = await import('@/integrations/supabase/client.server');
      let checkedInSupabase = false;
      if (hasSupabaseAdmin()) {
        const { data } = await db
          .from('feedback_customers')
          .select('active,pin_version')
          .eq('id', access.customer_id ?? '')
          .maybeSingle();
        if (data) {
          checkedInSupabase = true;
          if (!data.active || data.pin_version !== access.pin_version) {
            await s.clear();
            throw new Error('Your session has ended. Please enter your PIN again.');
          }
        }
      }

      // 2. Fallback check against server store
      if (!checkedInSupabase) {
        const { readServerStore } = await import('./server-store');
        const store = await readServerStore();
        const cust = store.customers.find(c => c.id === access.customer_id);
        if (cust && (!cust.active || cust.pin_version !== access.pin_version)) {
          await s.clear();
          throw new Error('Your session has ended. Please enter your PIN again.');
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('session has ended')) throw err;
    }
  }
  return access;
}

export function attemptKeys(targetIdentifier?: string) {
  const isProd = process.env['NODE_ENV'] === 'production';
  let device = getCookie('feedback-device');
  if (!device) {
    device = randomUUID();
    setCookie('feedback-device', device, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 31536000,
      path: '/',
    });
  }
  const source =
    getRequestHeader('cf-connecting-ip') ??
    getRequestHeader('x-forwarded-for')?.split(',')[0]?.trim() ??
    'local';
  const keys = [pinHash(`device:${device}`), pinHash(`source:${source}`)];
  if (targetIdentifier) {
    keys.push(pinHash(`target:${targetIdentifier.toLowerCase().trim()}`));
  }
  return keys;
}

export function attemptKeysWithTarget(targetIdentifier?: string) {
  return attemptKeys(targetIdentifier);
}

export async function freshPin(): Promise<{ pin: string; hash: string }> {
  const { readServerStore } = await import('./server-store');
  const store = await readServerStore();
  const existingHashes = new Set(store.customers.map(c => c.pin_hash).filter(Boolean));

  for (let i = 0; i < 50; i++) {
    const pin = randomInt(100000, 999999).toString();
    const hash = pinHash(pin);
    if (!existingHashes.has(hash)) {
      return { pin, hash };
    }
  }
  throw new Error('Please try generating a PIN again.');
}