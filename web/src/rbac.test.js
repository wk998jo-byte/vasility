import { describe, it, expect } from 'vitest';
import { getWhatsAppTargetsForCamp, campsMatch } from '../../server/users-data.js';

describe('WhatsApp RBAC', () => {
  it('campsMatch treats MGS and MGS Camp as equal', () => {
    expect(campsMatch('MGS Camp', 'MGS')).toBe(true);
    expect(campsMatch('Dhahran Camp', 'MGS Camp')).toBe(false);
  });

  it('MGS ticket notifies main admins and MGS sub-admins only', () => {
    const targets = getWhatsAppTargetsForCamp('MGS Camp');
    const phones = targets.map((t) => t.username);

    expect(phones).toContain('m.irfan');
    expect(phones).toContain('abdulaziz.bq');
    expect(phones).toContain('ansar.basha');
    expect(phones).not.toContain('jack.dhahran');
    expect(phones).not.toContain('saroj.chettri');
    expect(phones).not.toContain('muzammil.khurais');
  });

  it('Dhahran ticket excludes MGS sub-admin', () => {
    const targets = getWhatsAppTargetsForCamp('Dhahran Camp');
    const phones = targets.map((t) => t.username);

    expect(phones).toContain('jack.dhahran');
    expect(phones).toContain('saroj.chettri');
    expect(phones).not.toContain('ansar.basha');
    expect(phones).not.toContain('muzammil.khurais');
  });
});
