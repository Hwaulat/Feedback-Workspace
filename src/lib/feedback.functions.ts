import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { itemSchema, PIN_PATTERN, SESSION_SECONDS, type Access, type Customer, type FeedbackItem, type HistoryEntry } from './feedback-model';

export const getAccess = createServerFn({method:'GET'}).handler(async()=>{
  try {
    const { session, requireAccess } = await import('./feedback-session.server');
    const s = await session();
    if(!s.data.access) return null;
    return await requireAccess();
  } catch {
    return null;
  }
});

export const signIn = createServerFn({method:'POST'}).inputValidator((v)=>z.object({mode:z.enum(['admin','customer']),passcode:z.string().min(1).max(200),actor:z.string().trim().max(100)}).parse(v)).handler(async({data})=>{
  const { session, pinHash, attemptKeys } = await import('./feedback-session.server');
  const s = await session();
  const keys = attemptKeys();
  const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');

  try {
    const {data:attempts}=await db.from('feedback_attempts').select('locked_until').in('key',keys);
    if(attempts?.some(a=>a.locked_until && Date.parse(a.locked_until)>Date.now())) return {ok:false,error:'Too many attempts. Please try again in 15 minutes.'};
  } catch {}

  let access:Access|null=null;
  if(data.mode==='admin') {
    const expected=process.env['ADMIN_PASSCODE'] || 'admin123';
    let match = data.passcode.length === expected.length;
    let diff = 0;
    for (let i = 0; i < Math.max(data.passcode.length, expected.length); i++) {
      diff |= (data.passcode.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
    }
    if (match && diff === 0 && data.actor) {
      access={role:'admin',actor:data.actor,expires:Date.now()+SESSION_SECONDS*1000};
    }
  } else if(PIN_PATTERN.test(data.passcode)) {
    try {
      const {data:customer}=await db.from('feedback_customers').select('id,name,pin_version').eq('pin_hash',pinHash(data.passcode)).eq('active',true).maybeSingle();
      if(customer) access={role:'customer',actor:customer.name,customer_id:customer.id,pin_version:customer.pin_version,expires:Date.now()+SESSION_SECONDS*1000};
    } catch {}
  }

  if(!access) {
    try { await db.rpc('feedback_record_failure',{attempt_keys:keys}); } catch {}
    return {ok:false,error:'Access details are incorrect. Please try again.'};
  }

  await s.update({access});
  return {ok:true,error:null};
});

export const signOut = createServerFn({method:'POST'}).handler(async()=>{
  try {
    const { session } = await import('./feedback-session.server');
    await (await session()).clear();
  } catch {}
  return {ok:true};
});

export const clearWorkspaceData = createServerFn({method:'POST'}).handler(async()=>{
  try {
    const { requireAccess } = await import('./feedback-session.server');
    await requireAccess(true);
    const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
    await db.from('feedback_history').delete().neq('id','00000000-0000-0000-0000-000000000000');
    await db.from('feedback_items').delete().neq('id','00000000-0000-0000-0000-000000000000');
    await db.from('feedback_customers').delete().neq('id','00000000-0000-0000-0000-000000000000');
  } catch {}
  return {ok:true};
});

export const getWorkspace = createServerFn({method:'GET'}).handler(async(): Promise<{customers:Customer[];items:FeedbackItem[];history:HistoryEntry[]}>=>{
  const { requireAccess } = await import('./feedback-session.server');
  const access=await requireAccess();
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  let cq=db.from('feedback_customers').select('id,name,active,pin_version,created_at').order('name');
  let iq=db.from('feedback_items').select('*').order('number').limit(1000);
  if(access.role==='customer') { cq=cq.eq('id',access.customer_id ?? '');iq=iq.eq('customer_id',access.customer_id ?? '').is('deleted_at',null); }
  const [customers,items]=await Promise.all([cq,iq]);if(customers.error||items.error)throw new Error('Feedback could not be loaded. Please try again.');
  const history=access.role==='admin'?await db.from('feedback_history').select('*').order('created_at',{ascending:false}).limit(100):{data:[],error:null};
  if(history.error) throw new Error('Change history could not be loaded.');
  return {customers:(customers.data ?? []) as Customer[],items:(items.data ?? []) as unknown as FeedbackItem[],history:(history.data ?? []) as HistoryEntry[]};
});

export const saveItem = createServerFn({method:'POST'}).inputValidator(v=>z.object({item:itemSchema,id:z.string().uuid().optional(),version:z.number().int().optional()}).parse(v)).handler(async({data})=>{
  const { requireAccess } = await import('./feedback-session.server');
  const access=await requireAccess(true);
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  const { needs_review: _nr, image: _img, report_date: _rd, ...dbItem } = data.item;
  if(data.id) { const {data:updated,error}=await db.from('feedback_items').update({...dbItem,actor:access.actor}).eq('id',data.id).eq('version',data.version ?? 0).select('id');if(error) throw new Error(error.code==='23505'?'This feedback number already exists.':'Feedback could not be saved.');if(!updated?.length)throw new Error('Someone changed this item. Reload before saving your changes.'); }
  else { const {error}=await db.from('feedback_items').insert({...dbItem,actor:access.actor});if(error)throw new Error(error.code==='23505'?'This feedback number already exists.':'Feedback could not be saved.'); }
  return {ok:true};
});

export const deleteItem = createServerFn({method:'POST'}).inputValidator(v=>z.object({id:z.string().uuid(),version:z.number().int(),restore:z.boolean()}).parse(v)).handler(async({data})=>{
  const { requireAccess } = await import('./feedback-session.server');
  const access=await requireAccess(true);
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  if (!data.restore) {
    const { data: item } = await db.from('feedback_items').select('activity').eq('id', data.id).single();
    if (item?.activity === 'Done') throw new Error("Feedback with activity status 'Done' cannot be deleted.");
  }
  const {data:rows,error}=await db.from('feedback_items').update({deleted_at:data.restore?null:new Date().toISOString(),actor:access.actor}).eq('id',data.id).eq('version',data.version).select('id');
  if(error||!rows?.length) throw new Error('This item changed. Refresh and try again.');
  return {ok:true};
});

export const manageCustomer = createServerFn({method:'POST'}).inputValidator(v=>z.object({action:z.enum(['create','regenerate','toggle']),id:z.string().uuid().optional(),name:z.string().trim().min(1).max(150)}).parse(v)).handler(async({data})=>{
  const { requireAccess, freshPin } = await import('./feedback-session.server');
  const access=await requireAccess(true);
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  if(data.action==='create') {const p=await freshPin(); const {data:row,error}=await db.from('feedback_customers').insert({name:data.name,pin_hash:p.hash}).select('id').single();if(error)throw new Error('Customer could not be created. The name may already exist.'); await db.from('feedback_history').insert({customer_id:row.id,action:'Created customer',actor:access.actor});return {pin:p.pin};}
  if(!data.id)throw new Error('Select a customer.');const {data:row,error}=await db.from('feedback_customers').select('pin_version,active').eq('id',data.id).single();if(error||!row)throw new Error('Customer not found.');
  const p=data.action==='regenerate'?await freshPin():null;
  const {error:updateError}=await db.from('feedback_customers').update({pin_version:row.pin_version+1,...(p?{pin_hash:p.hash}:{active:!row.active})}).eq('id',data.id);if(updateError)throw new Error('Customer could not be updated.');
  await db.from('feedback_history').insert({customer_id:data.id,action:p?'Regenerated PIN':row.active?'Deactivated customer':'Activated customer',actor:access.actor}); return {pin:p?.pin ?? null};
});