import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import {
  itemSchema,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  types,
  categories,
  statuses,
  activities,
  todayWIB,
  safeCell,
  type ItemInput,
} from './feedback-model';

export const excelColumns = [
  'Customer',
  'No.',
  'Feature',
  'Feedback',
  'Detail Information',
  'Type',
  'Category',
  'Status',
  'Activity Status',
  'Notes from Ragdalion',
  'Report Date',
  'Estimated Completion Date',
];

export type ImportPreview = {
  rows: (ItemInput & {
    customer_name: string;
    is_update: boolean;
    expected_version: number | null;
  })[];
  errors: { row: number; reason: string }[];
  file_name: string;
  digest: string;
  newCustomers: string[];
};

const fileSchema = z.object({
  name: z.string().max(200).regex(/\.xlsx$/i),
  base64: z.string().max(Math.ceil((MAX_IMPORT_BYTES * 4) / 3) + 4),
  customer_name: z.string().optional(),
});

export const downloadTemplate = createServerFn({ method: 'GET' }).handler(async () => {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Feedback');
  ws.addRow(excelColumns);
  ws.addRow([
    'Customer name',
    1,
    'Reporting',
    'Describe the feedback',
    'Optional background or reproduction steps',
    'Bug Report',
    'Medium',
    'Waiting',
    'Not started',
    'Optional notes',
    '2026-11-01',
  ]);
  ws.columns.forEach(c => {
    c.width = 24;
  });
  ws.getRow(1).font = { bold: true, name: 'Arial', color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF02A9EA' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  [types, categories, statuses, activities].forEach((values, i) => {
    for (let r = 2; r <= 5001; r++) {
      ws.getCell(r, i + 6).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: [`"${values.join(',')}"`],
        showErrorMessage: true,
        error: 'Choose a valid option from the dropdown.',
      };
    }
  });

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer).toString('base64');
});

export type ExportFeedbackItem = {
  customer_id: string;
  number: number;
  feature?: string | null | undefined;
  feedback: string;
  detail?: string | null | undefined;
  type: string;
  category: string;
  status: string;
  activity: string;
  notes?: string | null | undefined;
  estimated_date?: string | null | undefined;
};

export async function generateFeedbackWorkbook(
  items: ExportFeedbackItem[],
  customers: Array<{ id: string; name: string }>
): Promise<Buffer> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Feedback');
  ws.addRow(excelColumns);

  const custMap = new Map<string, string>();
  customers.forEach(c => custMap.set(c.id, c.name));

  const sorted = [...items].sort((a, b) => {
    const cA = custMap.get(a.customer_id) ?? '';
    const cB = custMap.get(b.customer_id) ?? '';
    if (cA !== cB) return cA.localeCompare(cB);
    return a.number - b.number;
  });

  for (const item of sorted) {
    const customerName = custMap.get(item.customer_id) || 'General';
    ws.addRow([
      safeCell(customerName),
      item.number,
      safeCell(item.feature || ''),
      safeCell(item.feedback),
      safeCell(item.detail || ''),
      item.type,
      item.category,
      item.status,
      item.activity,
      safeCell(item.notes || ''),
      item.estimated_date || '',
    ]);
  }

  ws.columns.forEach(c => {
    c.width = 24;
  });
  ws.getRow(1).font = { bold: true, name: 'Arial', color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF02A9EA' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const maxRow = Math.max(sorted.length + 1, 5001);
  [types, categories, statuses, activities].forEach((values, i) => {
    for (let r = 2; r <= maxRow; r++) {
      ws.getCell(r, i + 6).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: [`"${values.join(',')}"`],
        showErrorMessage: true,
        error: 'Choose a valid option from the dropdown.',
      };
    }
  });

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export const exportFeedback = createServerFn({ method: 'POST' })
  .validator(
    v =>
      z
        .object({
          items: z.array(
            z.object({
              customer_id: z.string(),
              number: z.number(),
              feature: z.string().optional().nullable().default(''),
              feedback: z.string(),
              detail: z.string().optional().nullable().default(''),
              type: z.string(),
              category: z.string(),
              status: z.string(),
              activity: z.string(),
              notes: z.string().optional().nullable().default(''),
              estimated_date: z.string().nullable().optional(),
            })
          ),
          customers: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
            })
          ),
        })
        .parse(v)
  )
  .handler(async ({ data }) => {
    const { requireAccess } = await import('./feedback-session.server');
    await requireAccess();
    const buffer = await generateFeedbackWorkbook(data.items, data.customers);
    return buffer.toString('base64');
  });

function normalizeType(val: string): 'Bug Report' | 'Change Request' | 'Complaint' {
  const s = val.toLowerCase().trim();
  if (s.includes('change') || s.includes('request') || s.includes('permintaan') || s.includes('fitur')) return 'Change Request';
  if (s.includes('complaint') || s.includes('keluhan') || s.includes('komplain')) return 'Complaint';
  return 'Bug Report';
}

function normalizeCategory(val: string): 'Minor' | 'Medium' | 'Major' {
  const s = val.toLowerCase().trim();
  if (s.includes('major') || s.includes('tinggi') || s.includes('high') || s.includes('kritis') || s.includes('critical')) return 'Major';
  if (s.includes('minor') || s.includes('rendah') || s.includes('low')) return 'Minor';
  return 'Medium';
}

function normalizeStatus(val: string): 'Execution' | 'Waiting' | 'Execution by notes' {
  const s = val.toLowerCase().trim();
  if (s.includes('note') || s.includes('catatan')) return 'Execution by notes';
  if (s.includes('wait') || s.includes('tunggu') || s.includes('pending') || s.includes('antri')) return 'Waiting';
  return 'Execution';
}

function normalizeActivity(val: string): 'Done' | 'In progress' | 'Not started' {
  const s = val.toLowerCase().trim();
  if (s.includes('done') || s.includes('selesai') || s.includes('complete') || s.includes('tuntas')) return 'Done';
  if (s.includes('progress') || s.includes('jalan') || s.includes('proses') || s.includes('dikerjakan')) return 'In progress';
  return 'Not started';
}

function normalizeDate(cell: any): string | null {
  if (!cell) return null;
  if (cell.value instanceof Date) {
    return cell.value.toISOString().slice(0, 10);
  }
  const text = (cell.text || String(cell.value || '')).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parts = text.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    } else if (parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  const parsed = Date.parse(text);
  if (!isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }
  return null;
}

export async function parseExcelBuffer(
  buffer: Buffer,
  fileName: string,
  defaultCustomerName?: string
): Promise<ImportPreview> {
  if (buffer.byteLength > MAX_IMPORT_BYTES) throw new Error('Excel file must not exceed 10 MB.');
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new Error('Invalid file format. Please upload an Excel spreadsheet (.xlsx).');

  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as never);
  } catch {
    throw new Error('Unable to read Excel workbook. Ensure the file is a valid .xlsx spreadsheet.');
  }

  // Flexible sheet selection: prefer sheet named 'Feedback' (case-insensitive), or fallback to the first worksheet
  const targetSheet =
    wb.worksheets.find(s => s.name.trim().toLowerCase() === 'feedback') ||
    wb.worksheets[0];

  if (!targetSheet) throw new Error('Excel file does not contain any worksheets.');
  const ws = targetSheet;

  if (ws.rowCount - 1 > MAX_IMPORT_ROWS) throw new Error(`Maximum ${MAX_IMPORT_ROWS.toLocaleString()} feedback rows per workbook.`);

  // Detect header row (scanning rows 1 to 5)
  let headerRow = 1;
  for (let r = 1; r <= Math.min(5, ws.rowCount); r++) {
    const row = ws.getRow(r);
    let rowStr = '';
    row.eachCell({ includeEmpty: false }, cell => {
      rowStr += ' ' + cell.text.toLowerCase();
    });
    if (rowStr.includes('customer') || rowStr.includes('feedback') || rowStr.includes('pelanggan')) {
      headerRow = r;
      break;
    }
  }

  const colMap = {
    customer: -1,
    number: -1,
    feature: -1,
    feedback: -1,
    detail: -1,
    type: -1,
    category: -1,
    status: -1,
    activity: -1,
    notes: -1,
    estimated_date: -1,
  };

  const hRow = ws.getRow(headerRow);
  for (let c = 1; c <= ws.columnCount; c++) {
    const val = hRow.getCell(c).text.trim().toLowerCase();
    if (!val) continue;
    if (colMap.customer === -1 && (val.includes('customer') || val.includes('pelanggan') || val.includes('client') || val.includes('klien'))) colMap.customer = c;
    else if (colMap.number === -1 && (val === 'no' || val === 'no.' || val === 'nomor' || val === 'number')) colMap.number = c;
    else if (colMap.feature === -1 && (val.includes('feature') || val.includes('fitur') || val.includes('modul') || val.includes('menu'))) colMap.feature = c;
    else if (colMap.feedback === -1 && (val.includes('feedback') || val.includes('masukan') || val.includes('isu') || val.includes('issue') || val.includes('judul') || val.includes('title') || val.includes('deskripsi'))) colMap.feedback = c;
    else if (colMap.detail === -1 && (val.includes('detail') || val.includes('rincian') || val.includes('keterangan'))) colMap.detail = c;
    else if (colMap.type === -1 && (val.includes('type') || val.includes('tipe') || val.includes('jenis'))) colMap.type = c;
    else if (colMap.category === -1 && (val.includes('category') || val.includes('kategori') || val.includes('prioritas') || val.includes('priority'))) colMap.category = c;
    else if (colMap.status === -1 && val.includes('status') && !val.includes('activity') && !val.includes('aktivitas')) colMap.status = c;
    else if (colMap.activity === -1 && (val.includes('activity') || val.includes('aktivitas') || val.includes('progres') || val.includes('progress'))) colMap.activity = c;
    else if (colMap.notes === -1 && (val.includes('note') || val.includes('catatan') || val.includes('remark') || val.includes('ragdalion'))) colMap.notes = c;
    else if (colMap.estimated_date === -1 && (val.includes('estimate') || val.includes('target') || val.includes('estimasi') || val.includes('due') || val.includes('deadline') || val.includes('tanggal') || val.includes('date'))) colMap.estimated_date = c;
  }

  // If column number was not explicitly named, default based on presence of customer column
  if (colMap.number === -1) {
    colMap.number = colMap.customer === 1 ? 2 : 1;
  }
  if (colMap.feature === -1) {
    colMap.feature = colMap.customer === -1 ? 2 : 3;
  }
  if (colMap.feedback === -1) {
    colMap.feedback = colMap.customer === -1 ? 3 : 4;
  }

  const cellText = (r: number, c: number) => {
    if (c <= 0) return '';
    const cell = ws.getCell(r, c);
    if (cell.type === ExcelJS.ValueType.Formula) {
      return String(cell.result ?? cell.text ?? '').trim();
    }
    return cell.text ? cell.text.trim() : String(cell.value ?? '').trim();
  };

  const customerMap = new Map<string, string>();
  const existing = new Map<string, number>();
  try {
    const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
    const { data: customers } = await db.from('feedback_customers').select('id,name');
    customers?.forEach(c => customerMap.set(c.name, c.id));
    for (const c of customers ?? []) {
      const { data: items } = await db.from('feedback_items').select('number,version').eq('customer_id', c.id).limit(5000);
      items?.forEach(item => existing.set(`${c.id}:${item.number}`, item.version));
    }
  } catch {}

  let digest = '';
  try {
    if (globalThis.crypto?.subtle) {
      const hash = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(buffer));
      digest = Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    } else {
      digest = `${buffer.byteLength}-${Date.now()}`;
    }
  } catch {
    digest = `${buffer.byteLength}-${Date.now()}`;
  }

  const result: ImportPreview = {
    rows: [],
    errors: [],
    file_name: fileName,
    digest,
    newCustomers: [],
  };
  const seen = new Set<string>();

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (!row.hasValues) continue;
    try {
      const customerFromCell = colMap.customer !== -1 ? cellText(r, colMap.customer) : '';
      const name = customerFromCell || defaultCustomerName || 'Customer';
      if (!name) continue;
      if (name.length > 150) throw new Error('Customer name must be at most 150 characters.');

      const rawNumber = Number(cellText(r, colMap.number));
      const number = !isNaN(rawNumber) && rawNumber > 0 ? rawNumber : (r - headerRow);
      const key = `${name.toLowerCase()}:${number}`;
      if (seen.has(key)) throw new Error(`Duplicate Customer "${name}" + No. ${number} in this workbook.`);
      seen.add(key);

      const date = normalizeDate(ws.getCell(r, colMap.estimated_date));
      const rawType = cellText(r, colMap.type);
      const rawCat = cellText(r, colMap.category);
      const rawStatus = cellText(r, colMap.status);
      const rawAct = cellText(r, colMap.activity);

      const type = normalizeType(rawType);
      const category = normalizeCategory(rawCat);
      const status = normalizeStatus(rawStatus);
      const activity = normalizeActivity(rawAct);

      const feedbackText = cellText(r, colMap.feedback) || cellText(r, colMap.feature) || `Feedback #${number}`;
      const id = customerMap.get(name) ?? '00000000-0000-4000-8000-000000000000';

      const item = itemSchema.parse({
        customer_id: id,
        number,
        feature: cellText(r, colMap.feature),
        feedback: feedbackText,
        detail: cellText(r, colMap.detail),
        type,
        category,
        status,
        activity,
        notes: cellText(r, colMap.notes),
        estimated_date: date,
      });

      const version = existing.get(`${id}:${number}`) ?? null;
      result.rows.push({
        ...item,
        customer_name: name,
        is_update: version !== null,
        expected_version: version,
      });

      if (!customerMap.has(name) && !result.newCustomers.includes(name)) {
        result.newCustomers.push(name);
      }
    } catch (e) {
      result.errors.push({
        row: r,
        reason: e instanceof z.ZodError ? e.issues.map(x => `${x.path.join('.')}: ${x.message}`).join(';') : e instanceof Error ? e.message : 'Unreadable row',
      });
    }
  }

  if (result.rows.length === 0 && result.errors.length === 0) {
    throw new Error('No feedback data found in this Excel workbook. Ensure data rows begin after the header row.');
  }

  return result;
}

export const previewImport = createServerFn({ method: 'POST' })
  .validator(v => fileSchema.parse(v))
  .handler(async ({ data }): Promise<ImportPreview> => {
    const { requireAccess } = await import('./feedback-session.server');
    await requireAccess(true);
    const buffer = Buffer.from(data.base64, 'base64');
    return parseExcelBuffer(buffer, data.name, data.customer_name);
  });

const importRowSchema = itemSchema.extend({
  customer_name: z.string().trim().min(1).max(150),
  is_update: z.boolean(),
  expected_version: z.number().int().nullable(),
});

export const commitImport = createServerFn({ method: 'POST' })
  .validator(
    v =>
      z
        .object({
          rows: z.array(importRowSchema).min(1).max(MAX_IMPORT_ROWS),
          file_name: z.string().max(200),
          digest: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .parse(v)
  )
  .handler(async ({ data }) => {
    const { importFeedback } = await import('./feedback.functions');
    return await importFeedback({ data: { rows: data.rows as any } });
  });

export { safeCell };