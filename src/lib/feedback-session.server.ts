import { useSession, setResponseHeader, getRequestHeader, getCookie, setCookie } from '@tanstack/react-start/server';
import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { SESSION_SECONDS, type Access } from './feedback-model';

export async function session() {
  const secret = process.env['SESSION_SECRET'] || 'feedback-default-dev-session-secret-key-at-least-32-bytes!';
  setResponseHeader('Cache-Control','no-store');
  return useSession<{ access?: Access }>({ password:secret, name:'feedback-session', maxAge:SESSION_SECONDS, cookie:{ httpOnly:true, secure:process.env['NODE_ENV'] === 'production', sameSite:'lax', path:'/' } });
}
export function pinHash(pin:string) {
  const secret=process.env['PIN_HASH_SECRET'] || 'feedback-default-dev-pin-hash-secret-at-least-32-bytes!';
  return createHmac('sha256',secret).update(pin).digest('hex');
}
export async function requireAccess(admin=false) {
  const s = await session(); const access=s.data.access;
  if (!access || access.expires < Date.now()) throw new Error('Please sign in to continue.');
  if (admin && access.role !== 'admin') throw new Error('This action is for the internal team only.');
  if(access.role==='customer') {
    try {
      const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
      const {data}=await db.from('feedback_customers').select('active,pin_version').eq('id',access.customer_id ?? '').single();
      if(data && (!data.active || data.pin_version !== access.pin_version)) { await s.clear(); throw new Error('Your session has ended. Please enter your PIN again.'); }
    } catch (err) {
      if (err instanceof Error && err.message.includes('session has ended')) throw err;
    }
  }
  return access;
}
export function attemptKeys() {
  let device=getCookie('feedback-device');
  if(!device) { device=randomUUID(); setCookie('feedback-device',device,{httpOnly:true,secure:true,sameSite:'lax',maxAge:31536000,path:'/'}); }
  const source=getRequestHeader('cf-connecting-ip') ?? getRequestHeader('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  return [pinHash(`device:${device}`),pinHash(`source:${source}`)];
}
export async function freshPin() {
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  for(let i=0;i<20;i++) { const pin=randomInt(0,1000000).toString().padStart(6,'0'); const hash=pinHash(pin); const {data,error}=await db.from('feedback_customers').select('id').eq('pin_hash',hash).maybeSingle(); if(error) throw error; if(!data) return {pin,hash}; }
  throw new Error('Please try generating a PIN again.');
}