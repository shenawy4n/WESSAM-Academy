/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ServiceError,
  classifyErrorCategory,
  isMissingSchemaFeatureError,
  toServiceError,
  requireSupabaseClient,
  requireAuthenticatedUser,
  formatServiceErrorForUi,
  getErrorMessage,
  logServiceError,
} from './serviceError';
import { setSupabaseClientForTesting } from '../supabase/client';

afterEach(() => {
  setSupabaseClientForTesting(null);
});

describe('serviceError', () => {
  describe('classifyErrorCategory', () => {
    it('classifies configuration errors', () => {
      assert.equal(
        classifyErrorCategory(new Error('Supabase client is not configured')),
        'CONFIGURATION_ERROR'
      );
      assert.throws(
        () => requireSupabaseClient({ service: 'test', operation: 'op' }, null),
        (err: unknown) =>
          err instanceof ServiceError && err.category === 'CONFIGURATION_ERROR'
      );
    });

    it('classifies network errors cleanly', () => {
      assert.equal(classifyErrorCategory(new TypeError('Failed to fetch')), 'NETWORK_ERROR');
      assert.equal(classifyErrorCategory({ status: 503, message: 'Service Unavailable' }), 'NETWORK_ERROR');
      assert.equal(classifyErrorCategory({ name: 'FunctionsFetchError', message: 'Edge fail' }), 'NETWORK_ERROR');
      assert.equal(classifyErrorCategory({ name: 'AbortError', message: 'Request timed out' }), 'NETWORK_ERROR');
    });

    it('classifies authentication errors cleanly', () => {
      assert.equal(classifyErrorCategory({ status: 401, message: 'Unauthorized' }), 'AUTHENTICATION_ERROR');
      assert.equal(classifyErrorCategory({ code: 'PGRST301', message: 'JWT expired' }), 'AUTHENTICATION_ERROR');
      assert.equal(classifyErrorCategory({ message: 'Auth session missing!' }), 'AUTHENTICATION_ERROR');
    });

    it('classifies authorization / RLS errors cleanly', () => {
      assert.equal(
        classifyErrorCategory({ code: '42501', message: 'permission denied for table courses' }),
        'AUTHORIZATION_ERROR'
      );
      assert.equal(
        classifyErrorCategory({ status: 403, message: 'new row violates row-level security policy' }),
        'AUTHORIZATION_ERROR'
      );
    });

    it('classifies verified schema errors cleanly including missing RPCs and Storage buckets', () => {
      assert.equal(
        classifyErrorCategory({
          code: 'PGRST200',
          message: "Could not find a relationship between 'assignments' and 'lesson_id' in the schema cache",
        }),
        'SCHEMA_ERROR'
      );
      assert.equal(
        classifyErrorCategory({
          code: 'PGRST202',
          message: 'Could not find the function public.get_my_message_conversations in the schema cache',
        }),
        'SCHEMA_ERROR'
      );
      assert.equal(
        classifyErrorCategory({ code: 'PGRST204', message: "Could not find the 'status' column of 'assignments'" }),
        'SCHEMA_ERROR'
      );
      assert.equal(
        classifyErrorCategory({ code: '42703', message: 'column a.teacher_id does not exist' }),
        'SCHEMA_ERROR'
      );
      assert.equal(
        classifyErrorCategory({ code: '42883', message: 'function public.missing_rpc() does not exist' }),
        'SCHEMA_ERROR'
      );
      assert.equal(
        classifyErrorCategory({ code: '42P01', message: 'relation "public.assignment_targets" does not exist' }),
        'SCHEMA_ERROR'
      );
      assert.equal(
        classifyErrorCategory({ status: 404, name: 'StorageApiError', message: 'Bucket not found' }),
        'SCHEMA_ERROR'
      );
    });

    it('classifies not found, validation, and database errors cleanly', () => {
      assert.equal(classifyErrorCategory({ code: 'PGRST116', message: '0 rows' }), 'NOT_FOUND');
      assert.equal(classifyErrorCategory({ status: 404, message: 'Object not found' }), 'NOT_FOUND');
      assert.equal(classifyErrorCategory({ status: 422, message: 'Unprocessable' }), 'VALIDATION_ERROR');
      assert.equal(
        classifyErrorCategory({ code: '23505', message: 'duplicate key value violates unique constraint' }),
        'DATABASE_ERROR'
      );
    });
  });

  describe('isMissingSchemaFeatureError', () => {
    it('returns true only for verified schema/relationship/RPC/bucket missing errors', () => {
      assert.equal(isMissingSchemaFeatureError({ code: 'PGRST200', message: 'Missing relationship' }), true);
      assert.equal(isMissingSchemaFeatureError({ code: 'PGRST202', message: 'Missing RPC' }), true);
      assert.equal(isMissingSchemaFeatureError({ code: 'PGRST204', message: 'Missing column' }), true);
      assert.equal(isMissingSchemaFeatureError({ code: 'PGRST205', message: 'Missing table' }), true);
      assert.equal(isMissingSchemaFeatureError({ code: '42703', message: 'column does not exist' }), true);
      assert.equal(isMissingSchemaFeatureError({ code: '42P01', message: 'relation does not exist' }), true);
      assert.equal(isMissingSchemaFeatureError({ code: '42883', message: 'function does not exist' }), true);
      assert.equal(isMissingSchemaFeatureError({ status: 404, message: 'Bucket not found' }), true);
    });

    it('strictly rejects RLS (42501), auth (401), forbidden (403), network, and timeout errors', () => {
      assert.equal(isMissingSchemaFeatureError({ code: '42501', message: 'permission denied' }), false);
      assert.equal(isMissingSchemaFeatureError({ status: 403, message: 'Forbidden' }), false);
      assert.equal(isMissingSchemaFeatureError({ status: 401, message: 'JWT expired' }), false);
      assert.equal(isMissingSchemaFeatureError(new TypeError('Failed to fetch')), false);
      assert.equal(isMissingSchemaFeatureError({ status: 504, message: 'Gateway timeout' }), false);
      assert.equal(isMissingSchemaFeatureError({ name: 'AbortError', message: 'Request timed out' }), false);
    });
  });

  describe('requireAuthenticatedUser', () => {
    it('throws AUTHENTICATION_ERROR when getUser returns null user or auth error', async () => {
      const noUserClient = {
        auth: {
          getUser: async () => ({ data: { user: null }, error: null }),
        },
      } as any;

      await assert.rejects(
        () => requireAuthenticatedUser(noUserClient, { service: 'authTest', operation: 'check' }),
        (err: unknown) => err instanceof ServiceError && err.category === 'AUTHENTICATION_ERROR'
      );

      const errClient = {
        auth: {
          getUser: async () => ({
            data: { user: null },
            error: { status: 401, message: 'JWT expired' },
          }),
        },
      } as any;

      await assert.rejects(
        () => requireAuthenticatedUser(errClient, { service: 'authTest', operation: 'check' }),
        (err: unknown) => err instanceof ServiceError && err.category === 'AUTHENTICATION_ERROR'
      );
    });
  });

  describe('formatServiceErrorForUi & secret redaction', () => {
    it('returns localized Arabic and English messages and preserves retry semantics', () => {
      const netErr = toServiceError(new TypeError('Failed to fetch'), {
        service: 'coursesService',
        operation: 'fetchTeacherCourses',
      });
      const arUi = formatServiceErrorForUi(netErr, true);
      const enUi = formatServiceErrorForUi(netErr, false);

      assert.equal(arUi.category, 'NETWORK_ERROR');
      assert.equal(arUi.canRetry, true);
      assert.ok(arUi.title.includes('تعذر الاتصال'));
      assert.equal(enUi.canRetry, true);
      assert.ok(enUi.title.includes('Network'));

      const authzUi = formatServiceErrorForUi({ code: '42501', message: 'permission denied' }, true);
      assert.equal(authzUi.category, 'AUTHORIZATION_ERROR');
      assert.equal(authzUi.canRetry, false);
      assert.ok(authzUi.title.includes('غير مصرح'));
    });

    it('redacts Bearer tokens, JWTs, API keys, and passwords from UI messages and diagnostic logs', () => {
      const sensitiveErr = new ServiceError({
        category: 'DATABASE_ERROR',
        message:
          'Request failed with Bearer super_secret_token_123 eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U apikey=sb_secret_xyz password=hunter2',
        service: 'test',
        operation: 'op',
        code: 'PGRST202',
      });

      const msgAr = getErrorMessage(sensitiveErr, true);
      const msgEn = getErrorMessage(sensitiveErr, false);

      for (const rendered of [msgAr, msgEn]) {
        assert.equal(rendered.includes('super_secret_token_123'), false);
        assert.equal(rendered.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), false);
        assert.equal(rendered.includes('sb_secret_xyz'), false);
        assert.equal(rendered.includes('hunter2'), false);
        assert.ok(rendered.includes('[REDACTED]'));
      }

      const logged: unknown[] = [];
      const originalError = console.error;
      console.error = (...args: unknown[]) => {
        logged.push(args);
      };
      try {
        logServiceError(sensitiveErr);
      } finally {
        console.error = originalError;
      }
      assert.equal(logged.length, 1);
      const payload = JSON.stringify(logged[0]);
      assert.equal(payload.includes('super_secret_token_123'), false);
      assert.equal(payload.includes('sb_secret_xyz'), false);
      assert.equal(payload.includes('hunter2'), false);
      assert.ok(payload.includes('PGRST202'));
    });
  });
});
