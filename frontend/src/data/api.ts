/** Domain API helpers built on the shared axios instance. */
import api from '../api';
import type {
  AdminDashboard,
  Charge,
  ChargeRow,
  Expense,
  ManagerDashboard,
  MaintenanceDashboard,
  MonthlyFinancials,
  Property,
  Tenant,
  WorkOrder,
  WorkOrderMessage,
} from './types';

// --- Dashboards ---
export const getAdminDashboard = () => api.get<AdminDashboard>('/dashboard/admin').then((r) => r.data);
export const getManagerDashboard = () => api.get<ManagerDashboard>('/dashboard/manager').then((r) => r.data);
export const getMaintenanceDashboard = () =>
  api.get<MaintenanceDashboard>('/dashboard/maintenance').then((r) => r.data);

// --- Rent ---
export const getCharges = (params?: { status?: string; period?: string }) =>
  api.get<ChargeRow[]>('/rent/charges', { params }).then((r) => r.data);
export const getOverdue = () => api.get<ChargeRow[]>('/rent/overdue').then((r) => r.data);
export const recordPayment = (chargeId: number, method = 'cash') =>
  api.post<Charge>(`/charges/${chargeId}/pay`, { method }).then((r) => r.data);
export const setDeposited = (chargeId: number, deposited: boolean) =>
  api.patch<Charge>(`/charges/${chargeId}/deposit`, { deposited }).then((r) => r.data);
export const getMyCharges = () => api.get<Charge[]>('/tenants/me/charges').then((r) => r.data);

// --- Finance (manager monthly rollups + expenses) ---
export const getMonthlyFinancials = (months = 6) =>
  api.get<MonthlyFinancials[]>('/finance/monthly', { params: { months } }).then((r) => r.data);
export const listExpenses = (period?: string) =>
  api.get<Expense[]>('/finance/expenses', { params: period ? { period } : {} }).then((r) => r.data);
export const createExpense = (body: {
  description: string;
  amount: number;
  category: string;
  period: string;
  spent_date?: string;
  paid_in_cash: boolean;
  property_id?: number | null;
}) => api.post<Expense>('/finance/expenses', body).then((r) => r.data);
export const deleteExpense = (id: number) => api.delete(`/finance/expenses/${id}`).then((r) => r.data);

// --- Invoices (PDF download) ---
type InvoiceKind = 'auto' | 'early' | 'late' | 'paid';

/** Fetch an invoice PDF as a blob and trigger a browser download. */
async function downloadPdf(url: string, kind: InvoiceKind): Promise<void> {
  try {
    const res = await api.get(url, { params: { kind }, responseType: 'blob' });
    const disposition: string = res.headers['content-disposition'] ?? '';
    const match = disposition.match(/filename="?([^"]+)"?/);
    const filename = match?.[1] ?? 'invoice.pdf';
    const objectUrl = window.URL.createObjectURL(res.data as Blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Defer revoke so Firefox/Safari don't cancel the in-flight download.
    setTimeout(() => window.URL.revokeObjectURL(objectUrl), 0);
  } catch {
    // 401 is already handled by the axios interceptor (redirect to login).
    window.alert('Sorry — the invoice could not be generated. Please try again.');
  }
}

export const downloadInvoice = (chargeId: number, kind: InvoiceKind = 'auto') =>
  downloadPdf(`/charges/${chargeId}/invoice.pdf`, kind);
export const downloadMyInvoice = (chargeId: number, kind: InvoiceKind = 'auto') =>
  downloadPdf(`/tenants/me/charges/${chargeId}/invoice.pdf`, kind);

// --- Properties & tenants ---
export const getProperties = () => api.get<Property[]>('/properties/').then((r) => r.data);
export const getTenants = () => api.get<Tenant[]>('/tenants/').then((r) => r.data);
export const getMyLease = () => api.get<Tenant>('/tenants/me').then((r) => r.data);

// --- Work orders ---
export const listWorkOrders = (statusFilter?: string) =>
  api
    .get<WorkOrder[]>('/work-orders', { params: statusFilter ? { status_filter: statusFilter } : {} })
    .then((r) => r.data);
export const getWorkOrder = (id: number) => api.get<WorkOrder>(`/work-orders/${id}`).then((r) => r.data);
export const createWorkOrder = (body: {
  property_id: number;
  tenant_id?: number | null;
  unit_label?: string | null;
  title: string;
  description: string;
  category: string;
  priority?: string;
}) => api.post<WorkOrder>('/work-orders', body).then((r) => r.data);
export const updateWorkOrder = (
  id: number,
  patch: {
    status?: string;
    assigned_to?: number;
    priority?: string;
    cost?: number;
    paid_in_cash?: boolean;
    scheduled_for?: string;
  },
) => api.patch<WorkOrder>(`/work-orders/${id}`, patch).then((r) => r.data);
export const addWorkOrderMessage = (id: number, body: string) =>
  api.post<WorkOrderMessage>(`/work-orders/${id}/messages`, { body }).then((r) => r.data);

// --- People (admin) ---
export interface AdminUserRow {
  id: number;
  email: string;
  role: string;
  display_name: string | null;
  phone?: string | null;
  is_active: boolean;
  totp_enabled: boolean;
  permissions: string[];
  roles: { id: number; name: string }[];
}
export const listUsers = () => api.get<AdminUserRow[]>('/auth/users').then((r) => r.data);
export const createUser = (body: {
  email: string;
  role: string;
  display_name?: string;
  phone?: string;
}) => api.post<{ user: AdminUserRow; generated_otp: string }>('/auth/users', body).then((r) => r.data);

// --- RBAC: roles & permissions (admin) ---
/** A fine-grained authorization that can be granted to a role. */
export interface PermissionRow {
  id: number;
  name: string;
  description: string | null;
}
/** A role plus the authorizations currently granted to it. */
export interface RoleRow {
  id: number;
  name: string;
  description: string | null;
  is_system: boolean;
  permissions: string[];
  user_count: number;
}
export const listPermissions = () => api.get<PermissionRow[]>('/auth/permissions').then((r) => r.data);
export const listRoles = () => api.get<RoleRow[]>('/auth/roles').then((r) => r.data);
/** Replace a role's authorizations — omitted names are revoked from every holder. */
export const setRolePermissions = (roleId: number, permissions: string[]) =>
  api.put<RoleRow>(`/auth/roles/${roleId}/permissions`, { permissions }).then((r) => r.data);
/** Replace the roles assigned to a user (the coarse role follows automatically). */
export const setUserRoles = (userId: number, roles: string[]) =>
  api.put<AdminUserRow>(`/auth/users/${userId}/roles`, { roles }).then((r) => r.data);

// --- maintenance staff (manager-accessible, for assignment dropdowns) ---
export interface MaintenanceStaff {
  id: number;
  name: string;
  email: string;
}
export const getMaintenanceStaff = () =>
  api.get<MaintenanceStaff[]>('/work-orders/staff/maintenance').then((r) => r.data);
