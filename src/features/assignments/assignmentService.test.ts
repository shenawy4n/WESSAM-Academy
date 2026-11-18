/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { setSupabaseClientForTesting } from '../../lib/supabase/client';
import { ServiceError } from '../../lib/errors/serviceError';
import {
  ASSIGNMENT_STORAGE_BUCKET,
  buildAssignmentStoragePath,
  uploadAssignmentFile,
  getAssignmentFileSignedUrl,
} from './assignmentService';

const ASSIGN_ID = '11111111-1111-4111-8111-111111111111';
const STUDENT_ID = '22222222-2222-4222-8222-222222222222';
const TEACHER_ID = '33333333-3333-4333-8333-333333333333';

function createMockFile(name: string, content = 'hello world', type = 'application/pdf'): File {
  return new File([content], name, { type });
}

function createStorageMockClient(options?: {
  userId?: string | null;
  uploadError?: unknown;
  signedUrl?: string;
  signedUrlError?: unknown;
}) {
  const calls: { bucket?: string; path?: string; signedPath?: string } = {};

  const client = {
    auth: {
      getUser: async () => ({
        data: { user: options?.userId ? { id: options.userId } : null },
        error: null,
      }),
    },
    storage: {
      from: (bucket: string) => {
        calls.bucket = bucket;
        return {
          upload: async (path: string) => {
            calls.path = path;
            return {
              data: options?.uploadError ? null : { path },
              error: options?.uploadError ?? null,
            };
          },
          createSignedUrl: async (path: string) => {
            calls.signedPath = path;
            return {
              data: options?.signedUrlError
                ? null
                : { signedUrl: options?.signedUrl ?? `https://storage.local/signed/${path}` },
              error: options?.signedUrlError ?? null,
            };
          },
        };
      },
    },
  } as unknown as SupabaseClient;

  return { client, calls };
}

afterEach(() => {
  setSupabaseClientForTesting(undefined);
});

describe('Assignment Storage Privacy Path Alignment (Migration 30)', () => {
  it('buildAssignmentStoragePath builds scoped submissions path and rejects /me/ or non-UUIDs', () => {
    const path = buildAssignmentStoragePath({
      folder: 'submissions',
      fileName: 'homework final.pdf',
      contextId: ASSIGN_ID,
      studentId: STUDENT_ID,
      timestamp: 1700000000000,
    });
    assert.equal(path, `submissions/${ASSIGN_ID}/${STUDENT_ID}/1700000000000_homework_final.pdf`);

    assert.throws(
      () =>
        buildAssignmentStoragePath({
          folder: 'submissions',
          fileName: 'work.pdf',
          contextId: ASSIGN_ID,
          studentId: 'me',
        }),
      (err: unknown) => err instanceof ServiceError && err.category === 'VALIDATION_ERROR'
    );

    assert.throws(
      () =>
        buildAssignmentStoragePath({
          folder: 'submissions',
          fileName: 'work.pdf',
          contextId: 'not-a-uuid',
          studentId: STUDENT_ID,
        }),
      (err: unknown) => err instanceof ServiceError && err.category === 'VALIDATION_ERROR'
    );
  });

  it('buildAssignmentStoragePath formats assignment and teacher-scoped draft attachment paths and strips traversal dots', () => {
    const assignPath = buildAssignmentStoragePath({
      folder: 'attachments',
      fileName: '../lesson..notes.pdf',
      contextId: ASSIGN_ID,
      timestamp: 1700000000001,
    });
    assert.equal(assignPath, `attachments/${ASSIGN_ID}/1700000000001___lesson_notes.pdf`);
    assert.equal(assignPath.includes('..'), false);

    const draftPath = buildAssignmentStoragePath({
      folder: 'attachments',
      fileName: 'rubric.pdf',
      contextId: 'draft',
      uploaderId: TEACHER_ID,
      timestamp: 1700000000002,
    });
    assert.equal(draftPath, `attachments/drafts/${TEACHER_ID}/1700000000002_rubric.pdf`);

    assert.throws(
      () =>
        buildAssignmentStoragePath({
          folder: 'attachments',
          fileName: 'rubric.pdf',
          contextId: 'draft',
        }),
      (err: unknown) => err instanceof ServiceError && err.category === 'VALIDATION_ERROR'
    );
  });

  it('uploadAssignmentFile resolves authenticated student UUID when studentId is omitted (never /me/)', async () => {
    const mock = createStorageMockClient({ userId: STUDENT_ID });
    setSupabaseClientForTesting(mock.client);

    const result = await uploadAssignmentFile(
      createMockFile('solution.pdf'),
      'submissions',
      ASSIGN_ID
    );

    assert.equal(mock.calls.bucket, ASSIGNMENT_STORAGE_BUCKET);
    assert.ok(result.path.startsWith(`submissions/${ASSIGN_ID}/${STUDENT_ID}/`));
    assert.equal(result.path.includes('/me/'), false);
    assert.equal(result.path, mock.calls.path);
  });

  it('uploadAssignmentFile uploads unsaved draft attachments under attachments/drafts/<teacher_uuid>/', async () => {
    const mock = createStorageMockClient({ userId: TEACHER_ID });
    setSupabaseClientForTesting(mock.client);

    const result = await uploadAssignmentFile(
      createMockFile('worksheet.pdf'),
      'attachments',
      'draft'
    );

    assert.equal(mock.calls.bucket, ASSIGNMENT_STORAGE_BUCKET);
    assert.ok(result.path.startsWith(`attachments/drafts/${TEACHER_ID}/`));
    assert.equal(result.path, mock.calls.path);
  });

  it('uploadAssignmentFile rejects unauthenticated callers and preserves Storage RLS errors as AUTHORIZATION_ERROR', async () => {
    const unauthMock = createStorageMockClient({ userId: null });
    setSupabaseClientForTesting(unauthMock.client);

    await assert.rejects(
      () => uploadAssignmentFile(createMockFile('solution.pdf'), 'submissions', ASSIGN_ID),
      (err: unknown) => err instanceof ServiceError && err.category === 'AUTHENTICATION_ERROR'
    );

    const deniedMock = createStorageMockClient({
      userId: STUDENT_ID,
      uploadError: {
        name: 'StorageApiError',
        status: 403,
        message: 'new row violates row-level security policy',
      },
    });
    setSupabaseClientForTesting(deniedMock.client);

    await assert.rejects(
      () => uploadAssignmentFile(createMockFile('solution.pdf'), 'submissions', ASSIGN_ID),
      (err: unknown) => err instanceof ServiceError && err.category === 'AUTHORIZATION_ERROR'
    );
  });

  it('getAssignmentFileSignedUrl requests signed download URL for private assignment-files bucket', async () => {
    const path = `submissions/${ASSIGN_ID}/${STUDENT_ID}/1700000000000_solution.pdf`;
    const mock = createStorageMockClient({
      userId: STUDENT_ID,
      signedUrl: `https://example.supabase.co/storage/v1/object/sign/assignment-files/${path}?token=abc`,
    });
    setSupabaseClientForTesting(mock.client);

    const signedUrl = await getAssignmentFileSignedUrl(path, 1800);
    assert.equal(mock.calls.bucket, ASSIGNMENT_STORAGE_BUCKET);
    assert.equal(mock.calls.signedPath, path);
    assert.ok(signedUrl.includes('token=abc'));
  });
});
