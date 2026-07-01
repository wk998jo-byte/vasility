/** SLA helper — tickets in New/Pending status older than 24 hours. */
export function countSlaBreached(tickets) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return tickets.filter((t) => {
    if (t.isDeleted) return false;
    const isOpen = t.status === 'New' || t.status === 'Pending';
    if (!isOpen) return false;
    const created = new Date(t.createdAt).getTime();
    return !Number.isNaN(created) && created < cutoff;
  }).length;
}
