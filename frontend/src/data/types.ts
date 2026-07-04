export interface AdminDashboard {
  total_properties: number;
  total_units: number;
  occupied_units: number;
  occupancy_rate: number;
  total_tenants: number;
  billed_this_month: number;
  collected_this_month: number;
  outstanding: number;
  overdue_count: number;
  open_work_orders: number;
  maintenance_spend_ytd: number;
}

export interface OverdueTenant {
  tenant_id: number;
  name: string;
  unit_label?: string | null;
  property_address?: string | null;
  amount: number;
  months_overdue: number;
}

export interface ManagerDashboard {
  due_this_month: number;
  collected_this_month: number;
  overdue_total: number;
  overdue: OverdueTenant[];
  work_orders_by_status: Record<string, number>;
  open_work_orders: number;
}

export interface MaintenanceDashboard {
  by_status: Record<string, number>;
  open_count: number;
  in_progress_count: number;
  completed_count: number;
}

export interface ChargeRow {
  id: number;
  tenant_id: number;
  tenant_name: string;
  unit_label?: string | null;
  property_address?: string | null;
  amount: number;
  period: string;
  due_date: string;
  paid_date?: string | null;
  status: string;
  method?: string | null;
  deposited: boolean;
  deposited_date?: string | null;
}

export interface Charge {
  id: number;
  amount: number;
  period: string;
  due_date: string;
  paid_date?: string | null;
  status: string;
  method?: string | null;
  deposited?: boolean;
  deposited_date?: string | null;
  tenant_id: number;
}

export interface MonthlyFinancials {
  period: string;
  due: number;
  collected: number;
  outstanding: number;
  cash_collected: number;
  cash_deposited: number;
  cash_spent_on_expenses: number;
  cash_on_hand: number;
  charge_count: number;
  paid_count: number;
  undeposited_count: number;
}

export interface Expense {
  id: number;
  description: string;
  amount: number;
  category: string;
  period: string;
  spent_date: string;
  paid_in_cash: boolean;
  property_id?: number | null;
  property_address?: string | null;
}

export const EXPENSE_CATEGORIES = [
  'maintenance',
  'utilities',
  'insurance',
  'taxes',
  'management',
  'general',
];

export interface WorkOrderMessage {
  id: number;
  author_id?: number | null;
  author_name: string;
  author_role: string;
  body: string;
  created_at: string;
}

export interface WorkOrder {
  id: number;
  property_id: number;
  property_address?: string | null;
  tenant_id?: number | null;
  tenant_name?: string | null;
  unit_label?: string | null;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  assigned_to?: number | null;
  assignee_name?: string | null;
  created_by?: number | null;
  cost?: number | null;
  paid_in_cash: boolean;
  scheduled_for?: string | null;
  completed_at?: string | null;
  created_at: string;
  messages: WorkOrderMessage[];
}

export interface Tenant {
  id: number;
  name: string;
  email: string;
  rent_amount: number;
  lease_start_date: string;
  lease_end_date: string;
  unit_label?: string | null;
  property_id: number;
  user_id?: number | null;
  payments: Charge[];
}

export interface Property {
  id: number;
  address: string;
  units: number;
  description?: string | null;
  owner_id: number;
  tenants: Tenant[];
}

export const WO_CATEGORIES = ['plumbing', 'electrical', 'hvac', 'appliance', 'structural', 'general'];
export const WO_PRIORITIES = ['low', 'medium', 'high', 'emergency'];
export const WO_STATUSES = ['open', 'assigned', 'in_progress', 'completed', 'cancelled'];
