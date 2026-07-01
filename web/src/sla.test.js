import { describe, it, expect } from 'vitest';
import { countSlaBreached } from './sla';

describe('countSlaBreached', () => {
  it('counts New tickets older than 24 hours', () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const recent = new Date().toISOString();
    const tickets = [
      { status: 'New', createdAt: old, isDeleted: false },
      { status: 'New', createdAt: recent, isDeleted: false },
      { status: 'In Progress', createdAt: old, isDeleted: false },
      { status: 'Resolved', createdAt: old, isDeleted: false },
    ];
    expect(countSlaBreached(tickets)).toBe(1);
  });
});
