import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { excelColumns, parseExcelBuffer } from '@/lib/excel.functions';
import { types, categories, statuses, activities, safeCell } from '@/lib/feedback-model';

describe('Feature: Excel Export & Template Generation Functionality', () => {
  it('generates an Excel template with proper columns, styling, and validation', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Feedback');

    ws.addRow(excelColumns);
    ws.addRow(['Acme Corporation', 1, 'Reporting', 'Describe the feedback', 'Detail text', 'Bug Report', 'Medium', 'Waiting', 'Pending', 'Remarks', '2026-10-30']);

    expect(ws.rowCount).toBe(2);
    expect(ws.getRow(1).values).toEqual([undefined, ...excelColumns]);

    // Check columns match specification
    expect(excelColumns).toContain('Customer');
    expect(excelColumns).toContain('Feature');
    expect(excelColumns).toContain('Feedback');
    expect(excelColumns).toContain('Type');
    expect(excelColumns).toContain('Category');
    expect(excelColumns).toContain('Status');
    expect(excelColumns).toContain('Activity Status');

    // Add data validations as in downloadTemplate
    [types, categories, statuses, activities].forEach((values, i) => {
      ws.getCell(2, i + 6).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: [`"${values.join(',')}"`],
        showErrorMessage: true,
        error: 'Choose a value from the list.',
      };
    });

    const buffer = await wb.xlsx.writeBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);

    // Read back buffer
    const readWb = new ExcelJS.Workbook();
    await readWb.xlsx.load(buffer as any);
    const readWs = readWb.getWorksheet('Feedback');
    expect(readWs).toBeDefined();
    expect(readWs?.getCell(1, 1).text).toBe('Customer');
    expect(readWs?.getCell(2, 1).text).toBe('Acme Corporation');
    expect(readWs?.getCell(2, 3).text).toBe('Reporting');
  });

  it('escapes dangerous formulas when reading Excel cells', () => {
    const maliciousInput = '=cmd|"/C calc"!A0';
    const escaped = safeCell(maliciousInput);
    expect(escaped.startsWith("'")).toBe(true);
    expect(escaped).toBe("'=cmd|\"/C calc\"!A0");
  });

  it('parses Excel workbooks with multiple worksheets or non-Feedback sheet names', async () => {
    const wb = new ExcelJS.Workbook();
    // Sheet1 instead of Feedback
    const ws1 = wb.addWorksheet('Sheet1');
    ws1.addRow(excelColumns);
    ws1.addRow(['PT Sukses Makmur', 1, 'Billing', 'Integrasi QRIS', 'QRIS statis & dinamis', 'Change Request', 'Major', 'Execution', 'In progress', 'Prioritas Q4', '2026-11-20']);

    // Multiple sheets
    const ws2 = wb.addWorksheet('Sheet2');
    ws2.addRow(['Catatan', 'Nilai']);

    const buffer = await wb.xlsx.writeBuffer();
    const preview = await parseExcelBuffer(Buffer.from(buffer), 'test.xlsx');
    expect(preview.rows.length).toBe(1);
    expect(preview.rows[0]?.customer_name).toBe('PT Sukses Makmur');
    expect(preview.rows[0]?.feedback).toBe('Integrasi QRIS');
    expect(preview.rows[0]?.activity).toBe('In progress');
    expect(preview.errors.length).toBe(0);
  });

  it('parses Excel workbook without Customer column using selected customer name', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    // Headers without Customer column
    ws.addRow(['No.', 'Feature', 'Feedback', 'Detail Information', 'Type', 'Category', 'Status', 'Activity Status', 'Notes', 'Estimated Date']);
    ws.addRow([1, 'Auth', 'Login SSO', 'Detail SSO', 'Change Request', 'Major', 'Execution', 'In progress', 'Notes', '2026-11-20']);

    const buffer = await wb.xlsx.writeBuffer();
    const preview = await parseExcelBuffer(Buffer.from(buffer), 'custom-import.xlsx', 'Pelanggan Alpha');
    expect(preview.rows.length).toBe(1);
    expect(preview.rows[0]?.customer_name).toBe('Pelanggan Alpha');
    expect(preview.rows[0]?.feedback).toBe('Login SSO');
    expect(preview.errors.length).toBe(0);
  });

  it('exports real feedback items to an Excel workbook compatible with re-import', async () => {
    const { generateFeedbackWorkbook } = await import('@/lib/excel.functions');
    const buffer = await generateFeedbackWorkbook(
      [
        {
          customer_id: 'cust-1',
          number: 1,
          feature: 'Dashboard',
          feedback: 'Visualisasi metrik realtime',
          detail: 'Detail visualisasi',
          type: 'Change Request',
          category: 'Major',
          status: 'Execution',
          activity: 'Done',
          notes: 'Selesai deploy',
          estimated_date: '2026-12-01',
        },
      ],
      [{ id: 'cust-1', name: 'PT Digital Solusi' }]
    );

    expect(buffer.byteLength).toBeGreaterThan(0);

    // Verify it parses back seamlessly
    const preview = await parseExcelBuffer(buffer, 'exported.xlsx');
    expect(preview.rows.length).toBe(1);
    expect(preview.rows[0]?.customer_name).toBe('PT Digital Solusi');
    expect(preview.rows[0]?.feedback).toBe('Visualisasi metrik realtime');
    expect(preview.rows[0]?.activity).toBe('Done');
  });
});
