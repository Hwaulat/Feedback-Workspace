import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { randomInt } from 'node:crypto';
import {
  itemSchema,
  PIN_PATTERN,
  SESSION_SECONDS,
  todayWIB,
  type Access,
  type Customer,
  type FeedbackItem,
  type HistoryEntry,
} from './feedback-model';
import {
  getServerWorkspace,
  saveServerItem,
  deleteServerItem,
  manageServerCustomer,
  importServerItems,
  clearServerWorkspace,
  syncClientDataToServer,
  readServerStore,
} from './server-store';

export const getAccess = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const { session, requireAccess } = await import('./feedback-session.server');
    const s = await session();
    if (!s.data.access) return null;
    return await requireAccess();
  } catch {
    return null;
  }
});

export const signIn = createServerFn({ method: 'POST' })
  .validator(v =>
    z
      .object({
        mode: z.enum(['admin', 'customer']),
        passcode: z.string().min(1).max(200),
        actor: z.string().trim().max(100),
      })
      .parse(v),
  )
  .handler(async ({ data }) => {
    const { session, pinHash, attemptKeys } = await import('./feedback-session.server');
    const s = await session();
    const keys = attemptKeys();

    try {
      const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
      const { data: attempts } = await db.from('feedback_attempts').select('locked_until').in('key', keys);
      if (attempts?.some(a => a.locked_until && Date.parse(a.locked_until) > Date.now())) {
        return { ok: false, error: 'Too many attempts. Please try again in 15 minutes.' };
      }
    } catch {}

    let access: Access | null = null;

    if (data.mode === 'admin') {
      const expected = process.env['ADMIN_PASSCODE'] || 'admin123';
      let match = data.passcode.length === expected.length;
      let diff = 0;
      for (let i = 0; i < Math.max(data.passcode.length, expected.length); i++) {
        diff |= (data.passcode.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
      }
      if (match && diff === 0 && data.actor) {
        access = { role: 'admin', actor: data.actor, expires: Date.now() + SESSION_SECONDS * 1000 };
      }
    } else if (PIN_PATTERN.test(data.passcode)) {
      const hash = pinHash(data.passcode);
      let cust: any = null;

      // 1. Primary: Check Supabase Cloud customers
      try {
        const { supabaseAdmin: db, hasSupabaseAdmin } = await import('@/integrations/supabase/client.server');
        if (hasSupabaseAdmin()) {
          const { data: sbCust } = await db
            .from('feedback_customers')
            .select('*')
            .or(`pin.eq.${data.passcode},pin_hash.eq.${hash}`)
            .eq('active', true)
            .maybeSingle();
          if (sbCust) {
            cust = sbCust;
          }
        }
      } catch (err) {
        console.warn('[Supabase signIn customer]:', err);
      }

      // 2. Fallback: Check server-store customers
      if (!cust) {
        try {
          const store = await readServerStore();
          cust = store.customers.find(c => c.pin === data.passcode || c.pin_hash === hash);
        } catch {}
      }

      if (cust) {
        if (!cust.active) {
          return { ok: false, error: 'This customer account is deactivated. Contact admin.' };
        }
        access = {
          role: 'customer',
          actor: cust.name,
          customer_id: cust.id,
          pin_version: cust.pin_version,
          expires: Date.now() + SESSION_SECONDS * 1000,
        };
      }
    }

    if (!access) {
      try {
        const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
        await db.rpc('feedback_record_failure', { attempt_keys: keys });
      } catch {}
      return { ok: false, error: 'Access details are incorrect. Please try again.' };
    }

    await s.update({ access });
    return { ok: true, access, error: null };
  });

export const signOut = createServerFn({ method: 'POST' }).handler(async () => {
  try {
    const { session } = await import('./feedback-session.server');
    await (await session()).clear();
  } catch {}
  return { ok: true };
});

export const clearWorkspaceData = createServerFn({ method: 'POST' }).handler(async () => {
  const { requireAccess } = await import('./feedback-session.server');
  await requireAccess(true);

  // Clear persistent server store
  await clearServerWorkspace();

  // Try clearing Supabase if configured
  try {
    const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
    await db.from('feedback_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await db.from('feedback_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await db.from('feedback_customers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  } catch {}

  return { ok: true };
});

export const getWorkspace = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ customers: Customer[]; items: FeedbackItem[]; history: HistoryEntry[] }> => {
    try {
      const { session } = await import('./feedback-session.server');
      const s = await session();
      const access = s.data.access ?? null;
      if (!access || access.expires < Date.now()) {
        return { customers: [], items: [], history: [] };
      }

      // 1. Primary: Try Supabase Cloud Database
      try {
        const { supabaseAdmin: db, hasSupabaseAdmin } = await import('@/integrations/supabase/client.server');
        if (hasSupabaseAdmin()) {
          const [cq, iq, hq] = await Promise.all([
            db.from('feedback_customers').select('*').order('name'),
            access.role === 'customer'
              ? db
                  .from('feedback_items')
                  .select('*')
                  .eq('customer_id', access.customer_id!)
                  .is('deleted_at', null)
                  .order('number')
              : db.from('feedback_items').select('*').order('number'),
            access.role === 'customer'
              ? db
                  .from('feedback_history')
                  .select('*')
                  .eq('customer_id', access.customer_id!)
                  .order('created_at', { ascending: false })
                  .limit(50)
              : db.from('feedback_history').select('*').order('created_at', { ascending: false }).limit(100),
          ]);

          if (!cq.error && !iq.error) {
            const rawItems = (iq.data ?? []) as any[];
            const mappedItems: FeedbackItem[] = rawItems.map(item => ({
              ...item,
              activity: (item.activity === 'Pending' ? 'Not started' : item.activity) as any,
              needs_review: item.needs_review ?? false,
              image: item.image ?? null,
              notes: item.notes ?? '',
              detail: item.detail ?? '',
              feature: item.feature ?? '',
            }));

            const customers: Customer[] = (cq.data ?? []) as any[];
            const history: HistoryEntry[] = (hq.data ?? []) as any[];

            return { customers, items: mappedItems, history };
          }
        }
      } catch (sbErr) {
        console.warn('[Supabase getWorkspace fallback]:', sbErr);
      }

      // 2. Fallback to local server-store
      return await getServerWorkspace(access);
    } catch {
      return { customers: [], items: [], history: [] };
    }
  },
);

export const saveItem = createServerFn({ method: 'POST' })
  .validator(v =>
    z
      .object({
        item: itemSchema,
        id: z.string().uuid().optional(),
        version: z.number().int().optional(),
      })
      .parse(v),
  )
  .handler(async ({ data }) => {
    const { requireAccess } = await import('./feedback-session.server');
    const access = await requireAccess();

    // Customer can only save/submit for their own customer_id
    if (access.role === 'customer' && data.item.customer_id !== access.customer_id) {
      throw new Error('Unauthorized customer feedback submission.');
    }

    const nowIso = new Date().toISOString();
    let saved: FeedbackItem | null = null;
    const isCustomerActor = access.role === 'customer';
    const resolvedNeedsReview = isCustomerActor ? true : (data.item.needs_review ?? false);
    const resolvedImage = data.item.image !== undefined ? data.item.image : null;
    const { needs_review: _nr, image: _img, ...dbItem } = data.item;
    const targetCustomerId = isCustomerActor ? access.customer_id! : data.item.customer_id;

    // 1. Primary: Save to Supabase Cloud
    try {
      const { supabaseAdmin: db, hasSupabaseAdmin } = await import('@/integrations/supabase/client.server');
      if (hasSupabaseAdmin()) {
        if (data.id) {
          const { data: updated, error } = await db
            .from('feedback_items')
            .update({
              ...dbItem,
              needs_review: resolvedNeedsReview,
              image: resolvedImage,
              report_date: data.item.report_date ?? null,
              actor: access.actor,
              version: (data.version ?? 1) + 1,
              updated_at: nowIso,
            })
            .eq('id', data.id)
            .select()
            .single();

          if (error) {
            console.error('[Supabase saveItem update error]:', error);
            throw new Error(error.message || 'Failed to update feedback item.');
          }

          if (updated) {
            saved = {
              ...(updated as any),
              activity: (updated.activity === 'Pending' ? 'Not started' : updated.activity) as any,
              needs_review: updated.needs_review ?? false,
              image: updated.image ?? null,
            };
          }
        } else {
          // For new feedback: determine next available number for this customer based on ACTIVE items
          const targetCustomerId = isCustomerActor ? access.customer_id! : data.item.customer_id;

          let nextNumber = data.item.number;
          if (isCustomerActor || !nextNumber) {
            const { data: maxRow } = await db
              .from('feedback_items')
              .select('number')
              .eq('customer_id', targetCustomerId)
              .is('deleted_at', null)
              .order('number', { ascending: false })
              .limit(1)
              .maybeSingle();

            nextNumber = (maxRow?.number ?? 0) + 1;
          }

          // Clean up any soft-deleted items with number >= nextNumber for this customer so unique constraint is satisfied
          await db
            .from('feedback_items')
            .delete()
            .eq('customer_id', targetCustomerId)
            .gte('number', nextNumber)
            .not('deleted_at', 'is', null);

          let insertAttempts = 0;
          let lastInsertError: any = null;

          while (insertAttempts < 5) {
            insertAttempts++;
            const { data: inserted, error } = await db
              .from('feedback_items')
              .insert({
                ...dbItem,
                customer_id: targetCustomerId,
                number: nextNumber,
                needs_review: resolvedNeedsReview,
                image: resolvedImage,
                report_date: data.item.report_date ?? null,
                actor: access.actor,
                version: 1,
                updated_at: nowIso,
              })
              .select()
              .single();

            if (!error && inserted) {
              saved = {
                ...(inserted as any),
                activity: (inserted.activity === 'Pending' ? 'Not started' : inserted.activity) as any,
                needs_review: inserted.needs_review ?? false,
                image: inserted.image ?? null,
              };
              lastInsertError = null;
              break;
            }

            lastInsertError = error;
            if (error?.code === '23505') {
              // Unique constraint violation (customer_id, number) — purge soft-deleted conflicting row if any and retry
              await db
                .from('feedback_items')
                .delete()
                .eq('customer_id', targetCustomerId)
                .eq('number', nextNumber)
                .not('deleted_at', 'is', null);

              const { data: latestMax } = await db
                .from('feedback_items')
                .select('number')
                .eq('customer_id', targetCustomerId)
                .is('deleted_at', null)
                .order('number', { ascending: false })
                .limit(1)
                .maybeSingle();

              nextNumber = Math.max(latestMax?.number ?? nextNumber, nextNumber) + 1;
              continue;
            }

            break;
          }

          if (lastInsertError && !saved) {
            console.error('[Supabase saveItem insert error]:', lastInsertError);
            throw new Error(lastInsertError.message || 'Failed to submit feedback.');
          }
        }

        if (saved) {
          await db.from('feedback_history').insert({
            customer_id: saved.customer_id,
            item_id: saved.id,
            action: data.id ? 'Updated feedback' : 'Created feedback',
            field: 'status',
            old_value: null,
            new_value: saved.status,
            actor: access.actor,
          });
        }
      }
    } catch (err) {
      console.warn('[Supabase saveItem fallback]:', err);
      const errMsg = err instanceof Error ? err.message : '';
      if (errMsg.includes('Failed to') || errMsg.includes('duplicate key') || errMsg.includes('violates')) {
        throw err;
      }
    }

    // 2. Fallback / local sync to server store
    try {
      const localSaved = await saveServerItem(
        saved ? { ...data.item, number: saved.number } : data.item,
        access.actor,
        saved?.id || data.id,
        saved?.version || data.version,
        access.role === 'customer',
      );
      if (!saved) saved = localSaved;
    } catch (localErr) {
      if (!saved) throw localErr;
    }

    return { ok: true, item: saved! };
  });

export const deleteItem = createServerFn({ method: 'POST' })
  .validator(v =>
    z
      .object({
        id: z.string().uuid(),
        version: z.number().int(),
        restore: z.boolean(),
      })
      .parse(v),
  )
  .handler(async ({ data }) => {
    const { requireAccess } = await import('./feedback-session.server');
    const access = await requireAccess(); // Allow both admin and customer
    const nowIso = new Date().toISOString();

    // 1. Try Supabase
    try {
      const { supabaseAdmin: db, hasSupabaseAdmin } = await import('@/integrations/supabase/client.server');
      if (hasSupabaseAdmin()) {
        const { data: current } = await db.from('feedback_items').select('activity, customer_id').eq('id', data.id).single();
        if (current && !data.restore && current.activity === 'Done') {
          throw new Error("Feedback with activity status 'Done' cannot be deleted.");
        }
        // Customer can only delete their own items
        if (access.role === 'customer' && current && current.customer_id !== access.customer_id) {
          throw new Error('You can only delete your own feedback items.');
        }
        const { error: updateError } = await db
          .from('feedback_items')
          .update({
            deleted_at: data.restore ? null : nowIso,
            version: data.version + 1,
            updated_at: nowIso,
            actor: access.actor,
          })
          .eq('id', data.id);

        if (updateError) {
          console.warn('[Supabase deleteItem error]:', updateError);
          throw updateError;
        }

        await db.from('feedback_history').insert({
          item_id: data.id,
          action: data.restore ? 'Restored feedback' : 'Deleted feedback',
          field: 'status',
          old_value: null,
          new_value: data.restore ? 'Active' : 'Deleted',
          actor: access.actor,
        });
      }
    } catch (err) {
      console.warn('[Supabase deleteItem fallback]:', err);
      if (err instanceof Error && (err.message.includes('Done') || err.message.includes('only delete your own'))) {
        throw err;
      }
    }

    // 2. Try server-store
    try {
      await deleteServerItem(data.id, data.version, data.restore, access.actor);
    } catch (storeErr) {
      if (storeErr instanceof Error && storeErr.message.includes('Done')) {
        throw storeErr;
      }
    }

    return { ok: true };
  });

export const manageCustomer = createServerFn({ method: 'POST' })
  .validator(v =>
    z
      .object({
        action: z.enum(['create', 'regenerate', 'toggle', 'delete']),
        id: z.string().uuid().optional(),
        name: z.string().trim().min(1).max(150),
      })
      .parse(v),
  )
  .handler(async ({ data }) => {
    const { requireAccess, pinHash } = await import('./feedback-session.server');
    const access = await requireAccess(true);

    let pin: string | null = null;
    let customer: Customer | null = null;

    // 1. Primary: Direct Supabase Cloud
    try {
      const { supabaseAdmin: db, hasSupabaseAdmin } = await import('@/integrations/supabase/client.server');
      if (hasSupabaseAdmin()) {
        if (data.action === 'create') {
          pin = String(randomInt(100000, 999999));
          const { data: newCust, error: cErr } = await db
            .from('feedback_customers')
            .insert({
              name: data.name.trim(),
              pin,
              pin_hash: pinHash(pin),
              active: true,
              pin_version: 1,
            })
            .select()
            .single();

          if (cErr) {
            console.error('[Supabase create customer error]:', cErr);
            if (cErr.code === '23505') {
              const { data: existing } = await db
                .from('feedback_customers')
                .select('*')
                .ilike('name', data.name.trim())
                .maybeSingle();
              if (existing) {
                customer = existing as any;
                pin = existing.pin || pin;
              }
            }
          } else if (newCust) {
            customer = {
              id: newCust.id,
              name: newCust.name,
              pin: newCust.pin || pin,
              pin_version: newCust.pin_version ?? 1,
              active: newCust.active ?? true,
              created_at: newCust.created_at,
            };
            pin = customer.pin ?? pin;

            await db.from('feedback_history').insert({
              customer_id: newCust.id,
              action: 'Created customer',
              field: 'name',
              new_value: data.name.trim(),
              actor: access.actor,
            });
          }
        } else if (data.action === 'regenerate' && data.id) {
          pin = String(randomInt(100000, 999999));
          const { data: current } = await db.from('feedback_customers').select('pin_version').eq('id', data.id).single();
          const nextVersion = (current?.pin_version ?? 1) + 1;
          const { data: updated } = await db
            .from('feedback_customers')
            .update({
              pin,
              pin_hash: pinHash(pin),
              pin_version: nextVersion,
            })
            .eq('id', data.id)
            .select()
            .single();

          if (updated) customer = updated as any;

          await db.from('feedback_history').insert({
            customer_id: data.id,
            action: 'Regenerated customer PIN',
            field: 'pin_version',
            new_value: String(nextVersion),
            actor: access.actor,
          });
        } else if (data.action === 'toggle' && data.id) {
          const { data: current } = await db.from('feedback_customers').select('active').eq('id', data.id).single();
          if (current) {
            const { data: toggled } = await db
              .from('feedback_customers')
              .update({ active: !current.active })
              .eq('id', data.id)
              .select()
              .single();
            if (toggled) customer = toggled as any;

            await db.from('feedback_history').insert({
              customer_id: data.id,
              action: !current.active ? 'Activated customer' : 'Deactivated customer',
              field: 'active',
              new_value: !current.active ? 'true' : 'false',
              actor: access.actor,
            });
          }
        } else if (data.action === 'delete' && data.id) {
          await db.from('feedback_customers').delete().eq('id', data.id);
          await db.from('feedback_history').insert({
            action: 'Deleted customer',
            field: 'customer',
            new_value: data.id,
            actor: access.actor,
          });
        }
      }
    } catch (err) {
      console.warn('[Supabase manageCustomer error]:', err);
    }

    // 2. Try server-store
    try {
      const localResult = await manageServerCustomer(data.action, data.name, data.id, access.actor);
      if (!pin) pin = localResult.pin ?? null;
      if (!customer && localResult.customer) customer = localResult.customer;
    } catch {}

    return { pin, customer };
  });

export const importFeedback = createServerFn({ method: 'POST' })
  .validator(v =>
    z
      .object({
        rows: z.array(
          itemSchema.extend({
            customer_name: z.string().trim().min(1),
            is_update: z.boolean().optional(),
          }),
        ),
      })
      .parse(v),
  )
  .handler(async ({ data }) => {
    const { requireAccess, pinHash } = await import('./feedback-session.server');
    const access = await requireAccess(true);

    let count = 0;
    const newPins: { name: string; pin: string }[] = [];
    const nowIso = new Date().toISOString();

    // 1. Primary: Direct Supabase Cloud Import with accurate foreign key resolution
    try {
      const { supabaseAdmin: db, hasSupabaseAdmin } = await import('@/integrations/supabase/client.server');
      if (hasSupabaseAdmin()) {
        // Fetch all existing customers
        const { data: existingCustomers } = await db.from('feedback_customers').select('*');
        const customerMap = new Map<string, { id: string; name: string; pin: string | null }>();
        existingCustomers?.forEach(c => customerMap.set(c.name.trim().toLowerCase(), c));

        // Create missing customers in Supabase
        for (const r of data.rows) {
          const key = r.customer_name.trim().toLowerCase();
          if (!customerMap.has(key)) {
            const pin = String(randomInt(100000, 999999));
            const { data: newCust, error } = await db
              .from('feedback_customers')
              .insert({
                name: r.customer_name.trim(),
                pin,
                pin_hash: pinHash(pin),
                active: true,
                pin_version: 1,
              })
              .select('id, name, pin')
              .single();

            if (newCust && !error) {
              customerMap.set(key, newCust);
              newPins.push({ name: r.customer_name.trim(), pin });
            } else {
              const { data: fetched } = await db
                .from('feedback_customers')
                .select('id, name, pin')
                .eq('name', r.customer_name.trim())
                .maybeSingle();
              if (fetched) customerMap.set(key, fetched);
            }
          }
        }

        // Fetch existing items for these customers in Supabase
        const customerIds = Array.from(customerMap.values()).map(c => c.id);
        const existingItemMap = new Map<string, { id: string; version: number; report_date: string | null }>();
        if (customerIds.length > 0) {
          const { data: existingDbItems } = await db
            .from('feedback_items')
            .select('id, customer_id, number, version, report_date')
            .in('customer_id', customerIds);
          existingDbItems?.forEach(i => existingItemMap.set(`${i.customer_id}::${i.number}`, i));
        }

        // Prepare items to upsert with exact customer_id matching the foreign key constraint
        const itemsToUpsert = [];
        for (const r of data.rows) {
          const cust = customerMap.get(r.customer_name.trim().toLowerCase());
          if (!cust) continue;

          const existing = existingItemMap.get(`${cust.id}::${r.number}`);
          const itemPayload: any = {
            customer_id: cust.id,
            number: r.number,
            feature: r.feature || '',
            feedback: r.feedback,
            detail: r.detail || '',
            type: r.type,
            category: r.category,
            status: r.status,
            activity: r.activity,
            notes: r.notes || '',
            report_date: r.report_date ?? existing?.report_date ?? todayWIB(),
            estimated_date: r.estimated_date ?? null,
            completion_date: r.activity === 'Done' ? todayWIB() : null,
            needs_review: r.needs_review ?? false,
            image: r.image ?? null,
            deleted_at: null,
            version: existing ? (existing.version ?? 1) + 1 : 1,
            updated_at: nowIso,
            actor: access.actor,
          };
          if (existing?.id) itemPayload.id = existing.id;
          itemsToUpsert.push(itemPayload);
        }

        // Upsert in batches of 50
        for (let i = 0; i < itemsToUpsert.length; i += 50) {
          const batch = itemsToUpsert.slice(i, i + 50);
          const { error: upsertErr } = await db
            .from('feedback_items')
            .upsert(batch as any, { onConflict: 'customer_id,number' });
          if (upsertErr) {
            console.error('[Supabase Import Error]:', upsertErr);
          } else {
            count += batch.length;
          }
        }

        // Record history
        await db.from('feedback_history').insert({
          action: 'Imported Excel data',
          field: 'items',
          old_value: null,
          new_value: `${itemsToUpsert.length} feedback items imported`,
          actor: access.actor,
        });
      }
    } catch (sbErr) {
      console.warn('[Supabase import fallback to server store]:', sbErr);
    }

    // 2. Fallback / local sync to server store
    try {
      const result = await importServerItems(data.rows as any, access.actor);
      if (count === 0) {
        count = result.count;
        if (newPins.length === 0) newPins.push(...result.pins);
      }
    } catch {}

    return { count, pins: newPins };
  });

export const syncClientWorkspace = createServerFn({ method: 'POST' })
  .validator(v =>
    z
      .object({
        items: z.array(z.any()),
        customers: z.array(z.any()),
        history: z.array(z.any()),
      })
      .parse(v),
  )
  .handler(async ({ data }) => {
    try {
      const synced = await syncClientDataToServer({
        items: data.items,
        customers: data.customers,
        history: data.history,
      });

      // Mirror to Supabase
      try {
        const { supabaseAdmin: db, hasSupabaseAdmin } = await import('@/integrations/supabase/client.server');
        const { pinHash } = await import('./feedback-session.server');
        if (hasSupabaseAdmin()) {
          for (const c of data.customers) {
            await db.from('feedback_customers').upsert(
              {
                id: c.id,
                name: c.name,
                pin: c.pin || null,
                pin_hash: c.pin ? pinHash(c.pin) : null,
                active: c.active ?? true,
                pin_version: c.pin_version ?? 1,
              },
              { onConflict: 'name' },
            );
          }
          for (const i of data.items) {
            const { needs_review: _nr, image: _img, ...dbItem } = i;
            await db.from('feedback_items').upsert(
              {
                ...dbItem,
                report_date: i.report_date ?? null,
                actor: i.actor || 'Loop Team',
              },
              { onConflict: 'customer_id,number' },
            );
          }
        }
      } catch {}

      return { synced };
    } catch {
      return { synced: false };
    }
  });