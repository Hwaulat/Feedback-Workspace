import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import {
  itemSchema,
  PIN_PATTERN,
  SESSION_SECONDS,
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

      // 1. Check server-store customers
      const store = await readServerStore();
      let cust = store.customers.find(c => c.pin === data.passcode || c.pin_hash === hash);

      // 2. Check Supabase customers
      if (!cust) {
        try {
          const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
          const { data: sbCust } = await db
            .from('feedback_customers')
            .select('*')
            .or(`pin.eq.${data.passcode},pin_hash.eq.${hash}`)
            .eq('active', true)
            .maybeSingle();
          if (sbCust) {
            cust = sbCust as any;
            // Cache to server store
            await syncClientDataToServer({
              customers: [sbCust as any],
              items: [],
              history: [],
            });
          }
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

      const workspace = await getServerWorkspace(access);

      // If local server-store has no items, check if Supabase has items
      if (workspace.items.length === 0 && workspace.customers.length === 0) {
        try {
          const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
          const [cq, iq, hq] = await Promise.all([
            db.from('feedback_customers').select('*').order('name'),
            db.from('feedback_items').select('*').order('number'),
            db.from('feedback_history').select('*').order('created_at', { ascending: false }).limit(100),
          ]);
          if ((cq.data && cq.data.length > 0) || (iq.data && iq.data.length > 0)) {
            await syncClientDataToServer({
              customers: (cq.data ?? []) as any,
              items: (iq.data ?? []) as any,
              history: (hq.data ?? []) as any,
            });
            return await getServerWorkspace(access);
          }
        } catch {}
      }

      return workspace;
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

    const saved = await saveServerItem(
      data.item,
      access.actor,
      data.id,
      data.version,
      access.role === 'customer',
    );

    // Try mirroring to Supabase if configured
    try {
      const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
      const { needs_review: _nr, image: _img, ...dbItem } = data.item;
      if (data.id) {
        await db
          .from('feedback_items')
          .update({
            ...dbItem,
            report_date: data.item.report_date ?? saved.report_date ?? null,
            actor: access.actor,
          })
          .eq('id', data.id);
      } else {
        await db.from('feedback_items').insert({
          ...dbItem,
          id: saved.id,
          report_date: saved.report_date ?? null,
          actor: access.actor,
        });
      }
    } catch {}

    return { ok: true, item: saved };
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
    const access = await requireAccess(true);

    await deleteServerItem(data.id, data.version, data.restore, access.actor);

    // Try Supabase mirror
    try {
      const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
      await db
        .from('feedback_items')
        .update({
          deleted_at: data.restore ? null : new Date().toISOString(),
          actor: access.actor,
        })
        .eq('id', data.id);
    } catch {}

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

    const result = await manageServerCustomer(data.action, data.name, data.id, access.actor);

    // Try Supabase mirror
    try {
      const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
      if (data.action === 'create' && result.pin) {
        await db.from('feedback_customers').insert({
          name: data.name.trim(),
          pin: result.pin,
          pin_hash: pinHash(result.pin),
          active: true,
          pin_version: 1,
        });
      } else if (data.action === 'regenerate' && data.id && result.pin) {
        await db
          .from('feedback_customers')
          .update({
            pin: result.pin,
            pin_hash: pinHash(result.pin),
          })
          .eq('id', data.id);
      } else if (data.action === 'toggle' && data.id) {
        const { data: current } = await db.from('feedback_customers').select('active').eq('id', data.id).single();
        if (current) {
          await db.from('feedback_customers').update({ active: !current.active }).eq('id', data.id);
        }
      } else if (data.action === 'delete' && data.id) {
        await db.from('feedback_customers').delete().eq('id', data.id);
      }
    } catch {}

    return { pin: result.pin ?? null };
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

    const result = await importServerItems(data.rows as any, access.actor);

    // Try Supabase mirror
    try {
      const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
      // Upsert customers
      for (const p of result.pins) {
        await db.from('feedback_customers').upsert(
          {
            name: p.name,
            pin: p.pin,
            pin_hash: pinHash(p.pin),
            active: true,
          },
          { onConflict: 'name' },
        );
      }
      // Upsert items
      const store = await readServerStore();
      for (const item of store.items) {
        const { needs_review: _nr, image: _img, ...dbItem } = item;
        await db.from('feedback_items').upsert(
          {
            ...dbItem,
            report_date: item.report_date ?? null,
            actor: access.actor,
          },
          { onConflict: 'customer_id,number' },
        );
      }
    } catch {}

    return result;
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
        const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
        const { pinHash } = await import('./feedback-session.server');
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
      } catch {}

      return { synced };
    } catch {
      return { synced: false };
    }
  });