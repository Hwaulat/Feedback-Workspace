import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = 'https://wzqhxwaawzlfzqjwqcvn.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!key) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(url, key);

function pinHash(pin: string) {
  const secret = process.env['PIN_HASH_SECRET'] || 'feedback-default-dev-pin-hash-secret-at-least-32-bytes!';
  return crypto.createHmac('sha256', secret).update(pin).digest('hex');
}

async function migrate() {
  console.log('--- Starting Migration from workspace.json to Supabase Cloud ---');
  const workspacePath = path.resolve(process.cwd(), 'data/workspace.json');
  if (!fs.existsSync(workspacePath)) {
    console.log('workspace.json not found, skipping.');
    return;
  }

  const raw = fs.readFileSync(workspacePath, 'utf8');
  const store = JSON.parse(raw);
  const customers = store.customers || [];
  const items = store.items || [];
  console.log(`Found in workspace.json: ${customers.length} customers, ${items.length} items.`);

  // 1. Sync Customers
  const customerIdMap = new Map<string, string>(); // oldId -> newId

  for (const c of customers) {
    const pin = c.pin || String(crypto.randomInt(100000, 999999));
    const hash = c.pin_hash || pinHash(pin);

    // Check if customer exists by name
    const { data: existing } = await sb
      .from('feedback_customers')
      .select('id, name')
      .ilike('name', c.name.trim())
      .maybeSingle();

    if (existing) {
      customerIdMap.set(c.id, existing.id);
      await sb
        .from('feedback_customers')
        .update({
          pin,
          pin_hash: hash,
          active: c.active ?? true,
          pin_version: c.pin_version ?? 1,
        })
        .eq('id', existing.id);
      console.log(`Customer updated: ${c.name} (${existing.id})`);
    } else {
      const { data: inserted, error: insertErr } = await sb
        .from('feedback_customers')
        .insert({
          id: c.id,
          name: c.name.trim(),
          pin,
          pin_hash: hash,
          active: c.active ?? true,
          pin_version: c.pin_version ?? 1,
          created_at: c.created_at || new Date().toISOString(),
        })
        .select()
        .single();

      if (inserted) {
        customerIdMap.set(c.id, inserted.id);
        console.log(`Customer inserted: ${c.name} (${inserted.id})`);
      } else {
        console.error(`Failed to insert customer ${c.name}:`, insertErr);
      }
    }
  }

  // 2. Sync Items
  console.log(`Upserting ${items.length} items to Supabase...`);
  const itemsToInsert = [];
  for (const item of items) {
    const customerId = customerIdMap.get(item.customer_id) || item.customer_id;
    // Verify customerId exists in map
    if (!customerId) continue;

    itemsToInsert.push({
      id: item.id || crypto.randomUUID(),
      customer_id: customerId,
      number: item.number,
      feature: item.feature || '',
      feedback: item.feedback,
      detail: item.detail || '',
      type: item.type,
      category: item.category,
      status: item.status,
      activity: (item.activity === 'Pending' ? 'Not started' : item.activity),
      notes: item.notes || '',
      report_date: item.report_date || new Date().toISOString().slice(0, 10),
      estimated_date: item.estimated_date || null,
      completion_date: item.completion_date || null,
      needs_review: item.needs_review ?? false,
      image: item.image || null,
      deleted_at: item.deleted_at || null,
      version: item.version ?? 1,
      actor: item.actor || 'Loop Team',
      updated_at: item.updated_at || new Date().toISOString(),
    });
  }

  // Upsert in batches of 50
  for (let i = 0; i < itemsToInsert.length; i += 50) {
    const batch = itemsToInsert.slice(i, i + 50);
    const { error: upsertErr } = await sb
      .from('feedback_items')
      .upsert(batch, { onConflict: 'customer_id,number' });
    if (upsertErr) {
      console.error('Item batch error:', upsertErr);
    } else {
      console.log(`Upserted items batch ${i + 1} - ${i + batch.length}`);
    }
  }

  // Check counts
  const { count: custCount } = await sb.from('feedback_customers').select('*', { count: 'exact', head: true });
  const { count: itemCount } = await sb.from('feedback_items').select('*', { count: 'exact', head: true });
  console.log(`\n--- Migration Complete ---`);
  console.log(`Supabase Customers Count: ${custCount}`);
  console.log(`Supabase Items Count: ${itemCount}`);
}

migrate().catch(console.error);
