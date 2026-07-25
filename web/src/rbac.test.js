import { describe, it, expect } from 'vitest';
import { getWhatsAppTargetsForCamp, campsMatch } from '../../server/users-data.js';

describe('WhatsApp RBAC', () => {
  it('keeps MGS BQ and MGS PMT as separate sites', () => {
    expect(campsMatch('MGS BQ', 'MGS BQ')).toBe(true);
    expect(campsMatch('MGS BQ', 'MGS PMT')).toBe(false);
    expect(campsMatch('Madina Camp 1 BQ', 'Madina Camp 1 PMT')).toBe(false);
    expect(campsMatch('MGS Camp', 'MGS BQ')).toBe(true); // legacy combined → BQ
    expect(campsMatch('Dhahran Camp', 'MGS BQ')).toBe(false);
  });

  it('MGS BQ ticket notifies main admins and MGS BQ sub-admins only', () => {
    const targets = getWhatsAppTargetsForCamp('MGS BQ');
    const phones = targets.map((t) => t.username);

    expect(phones).toContain('m.irfan');
    expect(phones).toContain('abdulaziz.bq');
    expect(phones).toContain('ansar.basha');
    expect(phones).not.toContain('jack.dhahran');
    expect(phones).not.toContain('saroj.chettri');
    expect(phones).not.toContain('muzammil.khurais');
  });

  it('MGS PMT ticket notifies Saroj, not Ansar', () => {
    const targets = getWhatsAppTargetsForCamp('MGS PMT');
    const phones = targets.map((t) => t.username);

    expect(phones).toContain('m.irfan');
    expect(phones).toContain('saroj.chettri');
    expect(phones).not.toContain('ansar.basha');
  });

  it('Dhahran ticket excludes MGS sub-admin', () => {
    const targets = getWhatsAppTargetsForCamp('Dhahran Camp');
    const phones = targets.map((t) => t.username);

    expect(phones).toContain('jack.dhahran');
    expect(phones).toContain('jose.mathew');
    expect(phones).toContain('hassan.ahmouda');
    expect(phones).not.toContain('ansar.basha');
    expect(phones).not.toContain('saroj.chettri');
    expect(phones).not.toContain('muzammil.khurais');
  });

  it('Madina Camp 1 BQ notifies Shakir', () => {
    const targets = getWhatsAppTargetsForCamp('Madina Camp 1 BQ');
    const phones = targets.map((t) => t.username);
    expect(phones).toContain('shakir.sabir');
    expect(phones).not.toContain('aftab.ansari');
  });
});
