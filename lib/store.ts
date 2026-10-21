import { createContext, useContext } from 'react';

// Authentication State
export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
}

export interface User {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  status: 'active' | 'inactive' | 'suspended' | 'deleted';
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  roles: Role[];
  createdAt: Date;
}

export interface Role {
  id: string;
  name: string;
  permissions: string[];
}

// Data Flow State
export interface DataFlowState {
  flows: DataFlow[];
  currentFlow: DataFlow | null;
  loading: boolean;
  error: string | null;
  filters: DataFlowFilters;
}

export interface DataFlow {
  id: string;
  name: string;
  description: string;
  sourceType: string;
  destinationType: string;
  sourceConfig: Record<string, any>;
  destinationConfig: Record<string, any>;
  encryptionEnabled: boolean;
  status: 'draft' | 'active' | 'paused' | 'archived';
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DataFlowFilters {
  status?: string;
  sourceType?: string;
  destinationType?: string;
  searchTerm?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// Audit Log State
export interface AuditLogState {
  logs: AuditLog[];
  loading: boolean;
  error: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
  filters: AuditLogFilters;
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  changes: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  status: 'success' | 'failure' | 'pending';
  errorMessage?: string;
  timestamp: Date;
}

export interface AuditLogFilters {
  action?: string;
  resourceType?: string;
  status?: string;
  startDate?: Date;
  endDate?: Date;
  userId?: string;
}

// UI State
export interface UIState {
  sidebarOpen: boolean;
  theme: 'light' | 'dark' | 'auto';
  notifications: Notification[];
  modals: Record<string, boolean>;
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
  createdAt: Date;
}

// Global App State
export interface AppState {
  auth: AuthState;
  dataFlows: DataFlowState;
  auditLogs: AuditLogState;
  ui: UIState;
}

// Action Types
export enum AuthActionType {
  LOGIN_START = 'AUTH/LOGIN_START',
  LOGIN_SUCCESS = 'AUTH/LOGIN_SUCCESS',
  LOGIN_FAILURE = 'AUTH/LOGIN_FAILURE',
  LOGOUT = 'AUTH/LOGOUT',
  SET_USER = 'AUTH/SET_USER',
  SET_TOKEN = 'AUTH/SET_TOKEN',
  REFRESH_TOKEN = 'AUTH/REFRESH_TOKEN',
}

export enum DataFlowActionType {
  FETCH_FLOWS_START = 'DATA_FLOW/FETCH_START',
  FETCH_FLOWS_SUCCESS = 'DATA_FLOW/FETCH_SUCCESS',
  FETCH_FLOWS_FAILURE = 'DATA_FLOW/FETCH_FAILURE',
  SET_CURRENT_FLOW = 'DATA_FLOW/SET_CURRENT',
  CREATE_FLOW = 'DATA_FLOW/CREATE',
  UPDATE_FLOW = 'DATA_FLOW/UPDATE',
  DELETE_FLOW = 'DATA_FLOW/DELETE',
  SET_FILTERS = 'DATA_FLOW/SET_FILTERS',
}

export enum AuditLogActionType {
  FETCH_LOGS_START = 'AUDIT_LOG/FETCH_START',
  FETCH_LOGS_SUCCESS = 'AUDIT_LOG/FETCH_SUCCESS',
  FETCH_LOGS_FAILURE = 'AUDIT_LOG/FETCH_FAILURE',
  SET_FILTERS = 'AUDIT_LOG/SET_FILTERS',
  SET_PAGINATION = 'AUDIT_LOG/SET_PAGINATION',
}

export enum UIActionType {
  TOGGLE_SIDEBAR = 'UI/TOGGLE_SIDEBAR',
  SET_THEME = 'UI/SET_THEME',
  ADD_NOTIFICATION = 'UI/ADD_NOTIFICATION',
  REMOVE_NOTIFICATION = 'UI/REMOVE_NOTIFICATION',
  OPEN_MODAL = 'UI/OPEN_MODAL',
  CLOSE_MODAL = 'UI/CLOSE_MODAL',
}

// Store Context
export const AppStateContext = createContext<AppState | undefined>(undefined);

export const useAppState = () => {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within AppStateProvider');
  }
  return context;
};
