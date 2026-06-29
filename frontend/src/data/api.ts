/** Domain API helpers built on the shared axios instance. */
import api from '../api';
import type {
  AdminDashboard,
  Charge,
  ChargeRow,
  ManagerDashboard,
  MaintenanceDashboard,
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
export const getMyCharges = () => api.get<Charge[]>('/tenants/me/charges').then((r) => r.data);

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
  patch: { status?: string; assigned_to?: number; priority?: string; cost?: number; scheduled_for?: string },
) => api.patch<WorkOrder>(`/work-orders/${id}`, patch).then((r) => r.data);
export const addWorkOrderMessage = (id: number, body: string) =>
  api.post<WorkOrderMessage>(`/work-orders/${id}/messages`, { body }).then((r) => r.data);

// --- People (admin) ---
export interface AdminUserRow {
  id: number;
  email: string;
  role: string;
  display_name: string | null;
  is_active: boolean;
  totp_enabled: boolean;
  permissions: string[];
}
export const listUsers = () => api.get<AdminUserRow[]>('/auth/users').then((r) => r.data);
export const createUser = (body: { email: string; role: string; display_name?: string }) =>
  api.post<{ user: AdminUserRow; generated_otp: string }>('/auth/users', body).then((r) => r.data);

// --- maintenance staff (manager-accessible, for assignment dropdowns) ---
export interface MaintenanceStaff {
  id: number;
  name: string;
  email: string;
}
export const getMaintenanceStaff = () =>
  api.get<MaintenanceStaff[]>('/work-orders/staff/maintenance').then((r) => r.data);
