/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { getSupabaseClient } from '../supabase/client';

export type ServiceErrorCategory =
  | 'CONFIGURATION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'NETWORK_ERROR'
  | 'DATABASE_ERROR'
  | 'SCHEMA_ERROR'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'UNKNOWN_ERROR';

export interface ServiceErrorContext {
  service: string;
  operation: string;
  fallbackMessage?: string;
}

export interface ServiceErrorOptions {
  category: ServiceErrorCategory;
  message: string;
  service: string;
  operation: string;
  code?: string;
  status?: number;
  details?: string;
  hint?: string;
  isRetryable?: boolean;
  originalError?: unknown;
}

export class ServiceError extends Error {
  readonly category: ServiceErrorCategory;
  readonly service: string;
  readonly operation: string;
  readonly code?: string;
  readonly status?: number;
  readonly details?: string;
  readonly hint?: string;
  readonly isRetryable: boolean;
  readonly originalError?: unknown;

  constructor(options: ServiceErrorOptions) {
    super(options.message);
    this.name = 'ServiceError';
    this.category = options.category;
    this.service = options.service;
    this.operation = options.operation;
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
    this.hint = options.hint;
    this.isRetryable = options.isRetryable ?? options.category === 'NETWORK_ERROR';
    this.originalError = options.originalError;
  }
}

export interface FormattedUiError {
  category: ServiceErrorCategory;
  title: string;
  message: string;
  canRetry: boolean;
}

function extractRawErrorInfo(err: unknown): {
  message: string;
  code?: string;
  status?: number;
  details?: string;
  hint?: string;
  name?: string;
} {
  if (!err) {
    return { message: '' };
  }
  if (typeof err === 'string') {
    return { message: err };
  }
  if (typeof err === 'object') {
    const record = err as Record<string, unknown>;
    const rawCode = record.code ?? record.error_code;
    const rawStatus = record.status ?? record.statusCode;
    return {
      message: typeof record.message === 'string' ? record.message : String(record.error_description || ''),
      code: rawCode !== undefined && rawCode !== null ? String(rawCode) : undefined,
      status: typeof rawStatus === 'number' ? rawStatus : Number(rawStatus) || undefined,
      details: typeof record.details === 'string' ? record.details : undefined,
      hint: typeof record.hint === 'string' ? record.hint : undefined,
      name: typeof record.name === 'string' ? record.name : undefined,
    };
  }
  return { message: String(err) };
}

const VERIFIED_SCHEMA_CODES = new Set([
  'PGRST200',
  'PGRST202',
  'PGRST204',
  'PGRST205',
  '42703',
  '42P01',
  '42883',
]);

const AUTH_CODES = new Set([
  'PGRST301',
  'invalid_jwt',
  'bad_jwt',
  'session_not_found',
  'refresh_token_not_found',
  'no_authorization',
]);

const AUTHORIZATION_CODES = new Set(['42501', 'insufficient_privilege']);

const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNRESET',
  'EAI_AGAIN',
  'FETCH_ERROR',
]);

const SCHEMA_MESSAGE_PATTERNS: RegExp[] = [
  /could not find a relationship between/i,
  /could not find the ['"]?[^'"]+['"]? column of ['"]?[^'"]+['"]?/i,
  /could not find the function public\./i,
  /could not find the function /i,
  /could not find the table ['"]?[^'"]+['"]? in the schema cache/i,
  /column ["']?[\w.]+["']? does not exist/i,
  /relation ["']?[\w.]+["']? does not exist/i,
  /function [\w.]+(?:\([^)]*\))? does not exist/i,
  /in the schema cache/i,
  /\bbucket not found\b/i,
  /storage bucket .*not found/i,
];

const NETWORK_MESSAGE_PATTERNS: RegExp[] = [
  /failed to fetch/i,
  /networkerror/i,
  /network request failed/i,
  /fetch failed/i,
  /load failed/i,
  /timed out/i,
  /timeout/i,
  /econnrefused/i,
  /enotfound/i,
  /offline/i,
  /connection refused/i,
  /service unavailable/i,
  /bad gateway/i,
  /gateway timeout/i,
  /functionsfetcherror/i,
  /failed to send a request to the edge function/i,
];

const AUTH_MESSAGE_PATTERNS: RegExp[] = [
  /jwt expired/i,
  /invalid jwt/i,
  /auth session missing/i,
  /not authenticated/i,
  /authentication required/i,
  /session.*expired/i,
  /missing authorization/i,
  /invalid login credentials/i,
];

const AUTHORIZATION_MESSAGE_PATTERNS: RegExp[] = [
  /violates row-level security/i,
  /row-level security policy/i,
  /permission denied/i,
  /insufficient privilege/i,
  /forbidden/i,
  /access denied/i,
  /not authorized/i,
  /not permitted/i,
];

export function isNetworkErrorRaw(err: unknown): boolean {
  if (err instanceof ServiceError) {
    return err.category === 'NETWORK_ERROR';
  }
  const info = extractRawErrorInfo(err);
  if (info.name === 'AbortError' || info.name === 'FunctionsFetchError') {
    return true;
  }
  if (info.code && NETWORK_CODES.has(info.code)) {
    return true;
  }
  if (info.status !== undefined && [0, 502, 503, 504].includes(info.status)) {
    return true;
  }
  const combined = `${info.message} ${info.details || ''}`;
  return NETWORK_MESSAGE_PATTERNS.some((pattern) => pattern.test(combined));
}

export function isAuthorizationErrorRaw(err: unknown): boolean {
  if (err instanceof ServiceError) {
    return err.category === 'AUTHORIZATION_ERROR';
  }
  const info = extractRawErrorInfo(err);
  if (info.code && AUTHORIZATION_CODES.has(info.code)) {
    return true;
  }
  if (info.status === 403) {
    return true;
  }
  const combined = `${info.message} ${info.details || ''} ${info.hint || ''}`;
  return AUTHORIZATION_MESSAGE_PATTERNS.some((pattern) => pattern.test(combined));
}

export function isAuthenticationErrorRaw(err: unknown): boolean {
  if (err instanceof ServiceError) {
    return err.category === 'AUTHENTICATION_ERROR';
  }
  const info = extractRawErrorInfo(err);
  if (info.code && AUTH_CODES.has(info.code)) {
    return true;
  }
  if (info.status === 401) {
    return true;
  }
  const combined = `${info.message} ${info.details || ''}`;
  return AUTH_MESSAGE_PATTERNS.some((pattern) => pattern.test(combined));
}

/**
 * Checks strictly for verified missing schema / relationship / RPC cache errors.
 * Explicitly rejects network, authentication, authorization/RLS, and timeout errors.
 */
export function isMissingSchemaFeatureError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof ServiceError) {
    return err.category === 'SCHEMA_ERROR';
  }
  if (isNetworkErrorRaw(err) || isAuthenticationErrorRaw(err) || isAuthorizationErrorRaw(err)) {
    return false;
  }
  const info = extractRawErrorInfo(err);
  if (info.code && VERIFIED_SCHEMA_CODES.has(info.code.toUpperCase())) {
    return true;
  }
  const combined = `${info.message} ${info.details || ''} ${info.hint || ''}`;
  return SCHEMA_MESSAGE_PATTERNS.some((pattern) => pattern.test(combined));
}

export function classifyErrorCategory(err: unknown): ServiceErrorCategory {
  if (err instanceof ServiceError) {
    return err.category;
  }

  const info = extractRawErrorInfo(err);

  if (isNetworkErrorRaw(err)) {
    return 'NETWORK_ERROR';
  }
  if (isAuthenticationErrorRaw(err)) {
    return 'AUTHENTICATION_ERROR';
  }
  if (isAuthorizationErrorRaw(err)) {
    return 'AUTHORIZATION_ERROR';
  }
  if (isMissingSchemaFeatureError(err)) {
    return 'SCHEMA_ERROR';
  }
  if (info.code === 'PGRST116' || info.status === 404) {
    return 'NOT_FOUND';
  }
  if (info.status === 400 || info.status === 422) {
    return 'VALIDATION_ERROR';
  }
  if (
    info.code &&
    (/^(22|23|42|P0|XX)/.test(info.code) || info.code.startsWith('PGRST'))
  ) {
    return 'DATABASE_ERROR';
  }
  if (
    /supabase client is not configured|missing supabase|vite_supabase/i.test(info.message)
  ) {
    return 'CONFIGURATION_ERROR';
  }
  if (/duplicate key|foreign key|check constraint|null value in column/i.test(info.message)) {
    return 'DATABASE_ERROR';
  }
  if (info.details || info.hint) {
    return 'DATABASE_ERROR';
  }

  return 'UNKNOWN_ERROR';
}

export function logServiceError(serviceErr: ServiceError): void {
  if (typeof console === 'undefined' || typeof console.error !== 'function') {
    return;
  }
  console.error('[ServiceError]', {
    service: serviceErr.service,
    operation: serviceErr.operation,
    category: serviceErr.category,
    code: serviceErr.code,
    status: serviceErr.status,
    message: sanitizeUiDetail(serviceErr.message),
    details: serviceErr.details ? sanitizeUiDetail(serviceErr.details) : undefined,
    hint: serviceErr.hint ? sanitizeUiDetail(serviceErr.hint) : undefined,
  });
}

export function toServiceError(err: unknown, context: ServiceErrorContext): ServiceError {
  if (err instanceof ServiceError) {
    return err;
  }

  const info = extractRawErrorInfo(err);
  const category = classifyErrorCategory(err);
  const message =
    info.message.trim() ||
    context.fallbackMessage ||
    `Operation ${context.service}.${context.operation} failed`;

  return new ServiceError({
    category,
    message,
    service: context.service,
    operation: context.operation,
    code: info.code,
    status: info.status,
    details: info.details,
    hint: info.hint,
    isRetryable: category === 'NETWORK_ERROR',
    originalError: err,
  });
}

export function throwServiceError(err: unknown, context: ServiceErrorContext): never {
  throw toServiceError(err, context);
}

export function requireSupabaseClient(
  context: { service: string; operation: string },
  clientOverride?: SupabaseClient | null
): SupabaseClient {
  const client = clientOverride !== undefined ? clientOverride : getSupabaseClient();
  if (!client) {
    throw new ServiceError({
      category: 'CONFIGURATION_ERROR',
      message: 'Supabase client is not configured. Please check environment configuration.',
      service: context.service,
      operation: context.operation,
      code: 'SUPABASE_NOT_CONFIGURED',
      isRetryable: false,
    });
  }
  return client;
}

export async function requireAuthenticatedUser(
  client: SupabaseClient,
  context: { service: string; operation: string }
): Promise<User> {
  let userRes: { data: { user: User | null }; error: unknown };
  try {
    userRes = await client.auth.getUser();
  } catch (err) {
    throw toServiceError(err, {
      ...context,
      fallbackMessage: 'Failed to verify authentication session.',
    });
  }

  if (userRes.error) {
    const errObj = toServiceError(userRes.error, context);
    if (errObj.category === 'UNKNOWN_ERROR') {
      throw new ServiceError({
        category: 'AUTHENTICATION_ERROR',
        message: errObj.message || 'Authentication session verification failed.',
        service: context.service,
        operation: context.operation,
        code: errObj.code,
        status: errObj.status,
        originalError: userRes.error,
      });
    }
    throw errObj;
  }

  if (!userRes.data?.user) {
    throw new ServiceError({
      category: 'AUTHENTICATION_ERROR',
      message: 'Authentication required. Please sign in and try again.',
      service: context.service,
      operation: context.operation,
      code: 'UNAUTHENTICATED',
      status: 401,
    });
  }

  return userRes.data.user;
}

function sanitizeUiDetail(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, '[REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g, '[REDACTED]')
    .replace(/(apikey|api_key|secret|password|token)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .trim();
}

export function formatServiceErrorForUi(
  err: unknown,
  isRtl = true,
  fallbackMessage?: string
): FormattedUiError {
  const serviceErr =
    err instanceof ServiceError
      ? err
      : toServiceError(err, {
          service: 'app',
          operation: 'request',
          fallbackMessage,
        });

  switch (serviceErr.category) {
    case 'CONFIGURATION_ERROR':
      return {
        category: serviceErr.category,
        title: isRtl ? 'إعدادات النظام غير مكتملة' : 'Backend Configuration Missing',
        message: isRtl
          ? 'الاتصال بخدمة قاعدة البيانات غير مهيأ حالياً. يرجى مراجعة متغيرات البيئة وإعادة المحاولة.'
          : 'The database backend is not configured. Please verify environment configuration and try again.',
        canRetry: false,
      };

    case 'AUTHENTICATION_ERROR':
      return {
        category: serviceErr.category,
        title: isRtl ? 'يلزم إعادة تسجيل الدخول' : 'Authentication Required',
        message: isRtl
          ? 'انتهت صلاحية الجلسة أو لم يتم التحقق من الهوية. يرجى تسجيل الدخول مرة أخرى.'
          : 'Your session has expired or could not be verified. Please sign in again.',
        canRetry: true,
      };

    case 'AUTHORIZATION_ERROR':
      return {
        category: serviceErr.category,
        title: isRtl ? 'غير مصرح بالوصول' : 'Permission Denied',
        message: isRtl
          ? 'ليس لديك الصلاحيات اللازمة لعرض هذه البيانات أو تنفيذ هذا الإجراء.'
          : 'You do not have permission to view this resource or perform this action.',
        canRetry: false,
      };

    case 'NETWORK_ERROR':
      return {
        category: serviceErr.category,
        title: isRtl ? 'تعذر الاتصال بالخادم' : 'Network Connection Error',
        message: isRtl
          ? 'تعذر الوصول إلى الخادم. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.'
          : 'Unable to reach the server. Please check your internet connection and retry.',
        canRetry: true,
      };

    case 'SCHEMA_ERROR':
      return {
        category: serviceErr.category,
        title: isRtl ? 'عدم تطابق في بنية قاعدة البيانات' : 'Database Schema Mismatch',
        message: isRtl
          ? 'تعذر إتمام الطلب بسبب نقص في بنية قاعدة البيانات أو تحديث غير مطبق في الخادم.'
          : 'A required database table, column, or RPC function is unavailable on the backend.',
        canRetry: true,
      };

    case 'NOT_FOUND':
      return {
        category: serviceErr.category,
        title: isRtl ? 'العنصر غير موجود' : 'Record Not Found',
        message: isRtl
          ? 'لم يتم العثور على السجل المطلوب أو تم حذفه.'
          : 'The requested record could not be found or is no longer available.',
        canRetry: false,
      };

    case 'VALIDATION_ERROR': {
      const safeDetail = sanitizeUiDetail(serviceErr.message);
      return {
        category: serviceErr.category,
        title: isRtl ? 'بيانات غير صالحة' : 'Invalid Input',
        message:
          safeDetail ||
          (isRtl ? 'يرجى التحقق من الحقول المدخلة والمحاولة مرة أخرى.' : 'Please verify your input and try again.'),
        canRetry: false,
      };
    }

    case 'DATABASE_ERROR': {
      const safeDetail = sanitizeUiDetail(serviceErr.message);
      return {
        category: serviceErr.category,
        title: isRtl ? 'خطأ في قاعدة البيانات' : 'Database Error',
        message:
          safeDetail ||
          (isRtl ? 'تعذر إتمام العملية على قاعدة البيانات. يرجى المحاولة لاحقاً.' : 'Failed to process database operation.'),
        canRetry: true,
      };
    }

    default: {
      const safeDetail = sanitizeUiDetail(serviceErr.message);
      return {
        category: serviceErr.category,
        title: isRtl ? 'حدث خطأ غير متوقع' : 'Unexpected Error',
        message:
          safeDetail ||
          fallbackMessage ||
          (isRtl ? 'تعذر إتمام العملية المطلوبة. يرجى المحاولة مرة أخرى.' : 'Unable to complete request. Please try again.'),
        canRetry: true,
      };
    }
  }
}

export function getErrorMessage(err: unknown, isRtl = true, fallback?: string): string {
  return formatServiceErrorForUi(err, isRtl, fallback).message;
}
