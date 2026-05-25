import type { ParsedCsvRow, ParseCsvResult } from './csvImportTypes';

const C24_HEADERS = [
  'Transaktionstyp',
  'Buchungsdatum',
  'Karteneinsatz',
  'Betrag',
  'Zahlungsempfänger',
  'IBAN',
  'BIC',
  'Verwendungszweck',
  'Beschreibung',
  'Kontonummer',
  'Kontoname',
  'Kategorie',
  'Unterkategorie',
  'Bargeldabhebung',
] as const;

function detectDelimiter(firstLine: string): ';' | ',' {
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return semicolons >= commas ? ';' : ',';
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseGermanAmount(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s/g, '');
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

function parseGermanDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const day = m[1].padStart(2, '0');
  const month = m[2].padStart(2, '0');
  const year = m[3];
  return `${year}-${month}-${day}`;
}

function emptyToNull(s: string): string | null {
  const t = s.trim();
  return t.length === 0 ? null : t;
}

function decodeCsvText(bytes: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (!utf8.includes('\uFFFD')) return utf8.replace(/^\uFEFF/, '');
  return new TextDecoder('iso-8859-1').decode(bytes).replace(/^\uFEFF/, '');
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase();
}

function validateHeaders(headers: string[]): boolean {
  if (headers.length < C24_HEADERS.length) return false;
  for (let i = 0; i < C24_HEADERS.length; i++) {
    if (normalizeHeader(headers[i]) !== normalizeHeader(C24_HEADERS[i])) return false;
  }
  return true;
}

export function parseC24Csv(content: string): ParseCsvResult {
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) {
    return { ok: false, error: 'The file is empty or has no transaction rows.' };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headerFields = parseCsvLine(lines[0], delimiter);

  if (!validateHeaders(headerFields)) {
    return {
      ok: false,
      error:
        'Unrecognized CSV format. Expected C24 Bank columns (Transaktionstyp, Buchungsdatum, Betrag, Kontoname, …).',
    };
  }

  const rows: ParsedCsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i], delimiter);
    if (fields.every(f => f.trim() === '')) continue;

    const amount = parseGermanAmount(fields[3] ?? '');
    const bookingDate = parseGermanDate(fields[1] ?? '');

    if (amount === null) {
      return { ok: false, error: `Row ${i + 1}: could not parse amount "${fields[3]}".` };
    }
    if (!bookingDate) {
      return { ok: false, error: `Row ${i + 1}: could not parse date "${fields[1]}". Use DD.MM.YYYY.` };
    }

    const cardRaw = fields[2] ?? '';
    const cardDate = cardRaw.trim() ? parseGermanDate(cardRaw) : null;

    rows.push({
      rowIndex: i,
      type: fields[0]?.trim() ?? '',
      bookingDate,
      cardDate,
      amount,
      payee: fields[4]?.trim() ?? '',
      iban: emptyToNull(fields[5] ?? ''),
      bic: emptyToNull(fields[6] ?? ''),
      reference: emptyToNull(fields[7] ?? ''),
      description: emptyToNull(fields[8] ?? ''),
      accountNumber: fields[9]?.trim() ?? '',
      accountName: fields[10]?.trim() ?? '',
      category: emptyToNull(fields[11] ?? ''),
      subcategory: emptyToNull(fields[12] ?? ''),
      cashWithdrawal: emptyToNull(fields[13] ?? ''),
    });
  }

  if (rows.length === 0) {
    return { ok: false, error: 'No transaction rows found after the header.' };
  }

  return { ok: true, rows, delimiter };
}

export async function parseC24CsvFile(file: File): Promise<ParseCsvResult> {
  const buffer = await file.arrayBuffer();
  const text = decodeCsvText(buffer);
  return parseC24Csv(text);
}

export function filterRowsByMonth(
  rows: ParsedCsvRow[],
  month: string,
): ParsedCsvRow[] {
  return rows.filter(r => r.bookingDate.startsWith(month));
}

export function uniqueKontonamen(rows: ParsedCsvRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.accountName) set.add(r.accountName);
  }
  return [...set].sort();
}

export function filterRowsByDateRange(
  rows: ParsedCsvRow[],
  startIso: string,
  endIso: string,
): ParsedCsvRow[] {
  return rows.filter(r => r.bookingDate >= startIso && r.bookingDate <= endIso);
}
