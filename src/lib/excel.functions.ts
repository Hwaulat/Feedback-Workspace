import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { requireAccess, freshPin } from './feedback-session.server';
import { itemSchema, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, types, categories, statuses, activities, safeCell, type ItemInput } from './feedback-model';

export const excelColumns = ['Customer','No.','Feature','Feedback','Detail Information','Type','Category','Status','Activity Status','Notes/Remarks','Estimated Completion Date'];
export type ImportPreview = { rows: (ItemInput & {customer_name:string;is_update:boolean;expected_version:number|null})[]; errors:{row:number;reason:string}[]; file_name:string; digest:string; newCustomers:string[] };
const fileSchema=z.object({name:z.string().max(200).regex(/\.xlsx$/i),base64:z.string().max(Math.ceil(MAX_IMPORT_BYTES*4/3)+4)});
export const downloadTemplate=createServerFn({method:'GET'}).handler(async()=>{
  await requireAccess(true); const {default:ExcelJS}=await import('exceljs'); const wb=new ExcelJS.Workbook();const ws=wb.addWorksheet('Feedback');
  ws.addRow(excelColumns);ws.addRow(['Customer name',1,'Reporting','Describe the feedback','','Bug Report','Medium','Waiting','Pending','','']);
  ws.columns.forEach(c=>{c.width=24;});ws.getRow(1).font={bold:true,name:'Arial',color:{argb:'FFFFFFFF'}};ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF25272B'}};ws.views=[{state:'frozen',ySplit:1}];
  [types,categories,statuses,activities].forEach((values,i)=>{ for(let r=2;r<=5001;r++)ws.getCell(r,i+6).dataValidation={type:'list',allowBlank:false,formulae:[`"${values.join(',')}"`],showErrorMessage:true,error:'Choose a value from the list.'}; });
  const buffer=await wb.xlsx.writeBuffer();return Buffer.from(buffer).toString('base64');
});
export const previewImport=createServerFn({method:'POST'}).inputValidator(v=>fileSchema.parse(v)).handler(async({data}):Promise<ImportPreview>=>{
  await requireAccess(true);const buffer=Buffer.from(data.base64,'base64');if(buffer.byteLength>MAX_IMPORT_BYTES)throw new Error('Excel files must be 10 MB or smaller.');
  if(buffer[0]!==0x50||buffer[1]!==0x4b)throw new Error('This is not a valid Excel workbook.');
  const {default:ExcelJS}=await import('exceljs');const wb=new ExcelJS.Workbook();try{await wb.xlsx.load(buffer as never);}catch{throw new Error('This workbook could not be read. Please use the template.');}
  const firstSheet = wb.worksheets[0];
  if (!firstSheet || wb.worksheets.length !== 1 || firstSheet.name !== 'Feedback') throw new Error('Use one worksheet named Feedback.');
  const ws = firstSheet;
  if (ws.rowCount - 1 > MAX_IMPORT_ROWS) throw new Error('A workbook can contain up to 5,000 feedback rows.');
  const cellText = (r: number, c: number) => { const cell = ws.getCell(r, c); if (cell.type === ExcelJS.ValueType.Formula) throw new Error('Formulas are not allowed.'); return cell.text.trim(); };
  if (excelColumns.some((v, i) => ws.getCell(1, i + 1).text !== v)) throw new Error('The column headers do not match the template.');
  const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server'); const { data: customers, error } = await db.from('feedback_customers').select('id,name'); if (error) throw new Error('Customers could not be loaded.');
  const customerMap = new Map((customers ?? []).map(c => [c.name, c.id]));
  const existing = new Map<string, number>(); for (const c of customers ?? []) { const { data: items, error: readError } = await db.from('feedback_items').select('number,version').eq('customer_id', c.id).limit(5000); if (readError) throw new Error('Existing feedback could not be checked.'); items?.forEach(item => existing.set(`${c.id}:${item.number}`, item.version)); }
  const result: ImportPreview = { rows: [], errors: [], file_name: data.name, digest: createHash('sha256').update(buffer).digest('hex'), newCustomers: [] }; const seen = new Set<string>();
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (!row.hasValues) continue;
    try {
      const name = cellText(r, 1); if (!name || name.length > 150) throw new Error('Customer name is required (maximum 150 characters).'); const number = Number(cellText(r, 2)); const key = `${name}:${number}`; if (seen.has(key)) throw new Error('Duplicate Customer + No. in this workbook.'); seen.add(key);
      const dateCell = ws.getCell(r, 11); const date = dateCell.value instanceof Date ? dateCell.value.toISOString().slice(0, 10) : cellText(r, 11) || null;
      const id = customerMap.get(name) ?? '00000000-0000-4000-8000-000000000000';
      const item = itemSchema.parse({ customer_id: id, number, feature: cellText(r, 3), feedback: cellText(r, 4), detail: cellText(r, 5), type: cellText(r, 6), category: cellText(r, 7), status: cellText(r, 8), activity: cellText(r, 9), notes: cellText(r, 10), estimated_date: date });
      const version = existing.get(`${id}:${number}`) ?? null; result.rows.push({ ...item, customer_name: name, is_update: version !== null, expected_version: version }); if (!customerMap.has(name) && !result.newCustomers.includes(name)) result.newCustomers.push(name);
    } catch (e) { result.errors.push({ row: r, reason: e instanceof z.ZodError ? e.issues.map(x => `${x.path.join('.')}: ${x.message}`).join(';') : e instanceof Error ? e.message : 'Unreadable row' }); }
  }
  return result;
});
const importRowSchema = itemSchema.extend({ customer_name: z.string().trim().min(1).max(150), is_update: z.boolean(), expected_version: z.number().int().nullable() });
export const commitImport = createServerFn({ method: 'POST' }).inputValidator(v => z.object({ rows: z.array(importRowSchema).min(1).max(MAX_IMPORT_ROWS), file_name: z.string().max(200), digest: z.string().regex(/^[a-f0-9]{64}$/) }).parse(v)).handler(async ({ data }) => {
  const access = await requireAccess(true); const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
  const names = [...new Set(data.rows.map(r => r.customer_name))]; const pins: { name: string; pin: string }[] = []; const newCustomers: { name: string; hash: string }[] = [];
  const { data: customers, error } = await db.from('feedback_customers').select('name').in('name', names); if (error) throw new Error('Customers could not be loaded.');
  for (const name of names) { if (!customers?.some(c => c.name === name)) { const p = await freshPin(); pins.push({ name, pin: p.pin }); newCustomers.push({ name, hash: p.hash }); } }
  const { error: importError } = await (db.rpc as any)('feedback_commit_import', { batch_digest: data.digest, batch_name: data.file_name, batch_actor: access.actor, batch_rows: data.rows, new_customers: newCustomers });
  if (importError) throw new Error(importError.message.includes('already imported') ? 'This workbook has already been imported.' : importError.message.includes('conflict') ? 'Feedback changed after the preview. Upload the workbook again.' : 'Import failed. No changes were saved.');
  return { count: data.rows.length, pins };
});
export {safeCell};