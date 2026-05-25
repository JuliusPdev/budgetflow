import { describe, expect, it } from 'vitest';
import { filterRowsByMonth, parseC24Csv, uniqueKontonamen } from './csvParser';

const FIXTURE = `Transaktionstyp;Buchungsdatum;Karteneinsatz;Betrag;Zahlungsempfänger;IBAN;BIC;Verwendungszweck;Beschreibung;Kontonummer;Kontoname;Kategorie;Unterkategorie;Bargeldabhebung
Gutschrift;01.05.2026;;3500,00;Arbeitgeber GmbH;DE1234567890;COBADEFFXXX;Gehalt Mai;;123456;C24 Pluskonto;Einkommen;;
Pocket-Umbuchung;02.05.2026;;-325,00;;;;Umbuchung Sparkonto;;123456;C24 Pluskonto;Sparen;;
Pocket-Umbuchung;02.05.2026;;325,00;;;;Umbuchung Sparkonto;;789012;Sparkonto;Sparen;;
Online-Kartenzahlung;05.05.2026;04.05.2026;-42,50;REWE;DE9876543210;;;;123456;Essen;Lebensmittel;;
Online-Kartenzahlung;12.05.2026;11.05.2026;-89,00;DB Fernverkehr;;;;;123456;Reisen;Reisen;;
Lastschrift;15.05.2026;;-49,99;Spotify AB;;;;;123456;VERTRÄGE;Unterhaltung;;
Überweisung;20.05.2026;;-120,00;Landlord;;;;;123456;C24 Pluskonto;Wohnen;;`;

describe('parseC24Csv', () => {
  it('parses the C24 fixture', () => {
    const result = parseC24Csv(FIXTURE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.delimiter).toBe(';');
    expect(result.rows.length).toBe(7);
    expect(result.rows[0].amount).toBe(3500);
    expect(result.rows[0].bookingDate).toBe('2026-05-01');
    expect(result.rows[3].amount).toBe(-42.5);
    expect(result.rows[3].accountName).toBe('Essen');
  });

  it('rejects invalid headers', () => {
    const result = parseC24Csv('foo;bar\n1;2');
    expect(result.ok).toBe(false);
  });

  it('filters by month', () => {
    const parsed = parseC24Csv(FIXTURE);
    if (!parsed.ok) throw new Error('parse failed');
    const may = filterRowsByMonth(parsed.rows, '2026-05');
    expect(may.length).toBe(7);
    const april = filterRowsByMonth(parsed.rows, '2026-04');
    expect(april.length).toBe(0);
  });

  it('lists unique kontonamen', () => {
    const parsed = parseC24Csv(FIXTURE);
    if (!parsed.ok) throw new Error('parse failed');
    const names = uniqueKontonamen(parsed.rows);
    expect(names).toContain('Essen');
    expect(names).toContain('C24 Pluskonto');
  });
});
