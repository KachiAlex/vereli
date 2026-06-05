/* In-memory store for demo purposes.
   In production, swap this for a real database (e.g., Vercel Postgres, Supabase, MongoDB Atlas). */

export const db = {
  clients: [
    {
      id: 1,
      name: 'Meridian Advisory',
      contact: 'Sarah Okafor',
      email: 'sarah@meridian.ng',
      status: 'active',
      portal: { on: true, url: 'https://vereli.kite.space/portal/meridian' },
      createdAt: '2025-03-12T10:00:00Z',
    },
    {
      id: 2,
      name: 'Nova Digital',
      contact: 'Chidi Nwosu',
      email: 'chidi@novadigital.ng',
      status: 'active',
      portal: { on: false },
      createdAt: '2025-04-01T14:30:00Z',
    },
    {
      id: 3,
      name: 'Lumina Studio',
      contact: 'Amara Bello',
      email: 'amara@luminastudio.ng',
      status: 'inactive',
      portal: { on: false },
      createdAt: '2025-01-20T09:15:00Z',
    },
  ],
  projects: [
    {
      id: 101,
      clientId: 1,
      name: 'Q3 Strategy Review',
      status: 'in_progress',
      budget: 2500000,
      tasksTotal: 8,
      tasksPending: 3,
      createdAt: '2025-05-01T08:00:00Z',
    },
    {
      id: 102,
      clientId: 2,
      name: 'Website Redesign',
      status: 'pending',
      budget: 1800000,
      tasksTotal: 12,
      tasksPending: 12,
      createdAt: '2025-05-10T11:00:00Z',
    },
    {
      id: 103,
      clientId: 1,
      name: 'Brand Audit',
      status: 'completed',
      budget: 900000,
      tasksTotal: 5,
      tasksPending: 0,
      createdAt: '2025-02-15T09:00:00Z',
    },
  ],
  invoices: [
    {
      id: 201,
      clientId: 1,
      projectId: 103,
      amount: 900000,
      currency: 'NGN',
      status: 'paid',
      dueDate: '2025-03-15T00:00:00Z',
      createdAt: '2025-02-20T10:00:00Z',
    },
    {
      id: 202,
      clientId: 2,
      projectId: 102,
      amount: 900000,
      currency: 'NGN',
      status: 'pending',
      dueDate: '2025-06-15T00:00:00Z',
      createdAt: '2025-05-12T14:00:00Z',
    },
  ],
};

let nextId = {
  clients: 4,
  projects: 104,
  invoices: 203,
};

export function createRecord(table, data) {
  const record = { id: nextId[table]++, ...data, createdAt: new Date().toISOString() };
  db[table].push(record);
  return record;
}
