/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setSupabaseClientForTesting } from '../../lib/supabase/client';
import { ServiceError } from '../../lib/errors/serviceError';
import { messagingService } from './messagingService';
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_MESSAGE_ATTACHMENT_SIZE_BYTES,
  MAX_MESSAGE_BODY_LENGTH,
  buildSafeStorageObjectPath,
  isSafeStorageObjectPath,
  parseMessageActionUrl,
  sanitizeStorageFileName,
  validateMessageAttachment,
  validateMessageDraft,
} from './messageValidation';

function createMockFile(name: string, contentBytes: Uint8Array, mimeType: string): File {
  const blob = new Blob([contentBytes as unknown as BlobPart], { type: mimeType });
  return Object.assign(blob, {
    name,
    lastModified: Date.now(),
    webkitRelativePath: '',
  }) as unknown as File;
}

function createMessagingMockClient(options?: {
  user?: { id: string } | null;
  uploadError?: any;
  uploadFailAtIndex?: number;
  rpcHandler?: (fnName: string, params?: any) => { data: any; error: any } | Promise<{ data: any; error: any }>;
  signedUrlRes?: { data: { signedUrl: string } | null; error: any };
}) {
  const uploadedObjects: string[] = [];
  const removedBatches: string[][] = [];
  const rpcCalls: Array<{ fnName: string; params: any }> = [];
  const channels: any[] = [];
  let uploadCounter = 0;

  const client: any = {
    auth: {
      getUser: async () => ({
        data: { user: options?.user !== undefined ? options.user : { id: '11111111-1111-4111-8111-111111111111' } },
        error: null,
      }),
    },
    storage: {
      from() {
        return {
          async upload(path: string) {
            const idx = uploadCounter;
            uploadCounter += 1;
            if (options?.uploadFailAtIndex !== undefined && idx === options.uploadFailAtIndex) {
              return { data: null, error: options.uploadError || { message: 'Storage upload failed', status: 500 } };
            }
            if (options?.uploadFailAtIndex === undefined && options?.uploadError) {
              return { data: null, error: options.uploadError };
            }
            uploadedObjects.push(path);
            return { data: { path }, error: null };
          },
          async remove(paths: string[]) {
            removedBatches.push(paths);
            return { data: paths, error: null };
          },
          async createSignedUrl(path: string) {
            if (options?.signedUrlRes) {
              return options.signedUrlRes;
            }
            return { data: { signedUrl: `https://example.supabase.co/storage/v1/object/sign/message-attachments/${path}?token=abc` }, error: null };
          },
        };
      },
    },
    async rpc(fnName: string, params?: any) {
      rpcCalls.push({ fnName, params });
      if (options?.rpcHandler) {
        return options.rpcHandler(fnName, params);
      }
      return { data: [], error: null };
    },
    getChannels() {
      return channels;
    },
    channel(topic: string) {
      const ch: any = {
        topic: `realtime:${topic}`,
        calls: [],
        subscribed: false,
        on(type: string, filter: any) {
          if (ch.subscribed) {
            throw new Error(`cannot add postgres_changes callbacks for ${ch.topic} after subscribe().`);
          }
          ch.calls.push(`on:${type}:${filter.table}:${filter.filter || '*'}`);
          return ch;
        },
        subscribe() {
          ch.calls.push('subscribe');
          ch.subscribed = true;
          return ch;
        },
      };
      channels.push(ch);
      return ch;
    },
    async removeChannel(ch: any) {
      const idx = channels.indexOf(ch);
      if (idx >= 0) channels.splice(idx, 1);
      return 'ok';
    },
  };

  return {
    client,
    uploadedObjects,
    removedBatches,
    rpcCalls,
    channels,
  };
}

afterEach(() => {
  setSupabaseClientForTesting(null);
});

describe('messageValidation - File Security, Size, MIME & Path Safety', () => {
  it('1. Rejects empty, oversized, and dangerous executable/HTML/SVG files', () => {
    const empty = validateMessageAttachment({ name: 'notes.pdf', size: 0, type: 'application/pdf' });
    assert.equal(empty.valid, false);

    const oversized = validateMessageAttachment({
      name: 'lecture.pdf',
      size: MAX_MESSAGE_ATTACHMENT_SIZE_BYTES + 1,
      type: 'application/pdf',
    });
    assert.equal(oversized.valid, false);

    const exe = validateMessageAttachment({
      name: 'trojan.exe',
      size: 1024,
      type: 'application/x-msdownload',
    });
    assert.equal(exe.valid, false);

    const svg = validateMessageAttachment({
      name: 'diagram.svg',
      size: 512,
      type: 'image/svg+xml',
    });
    assert.equal(svg.valid, false);

    const html = validateMessageAttachment({
      name: 'payload.html',
      size: 512,
      type: 'text/html',
    });
    assert.equal(html.valid, false);
  });

  it('2. Detects spoofed MIME/extension mismatches and dangerous magic bytes', () => {
    // Disguised PE executable renamed to .pdf
    const mzBytes = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);
    const fakePdfExe = validateMessageAttachment(
      { name: 'worksheet.pdf', size: 400, type: 'application/pdf' },
      mzBytes
    );
    assert.equal(fakePdfExe.valid, false);

    // HTML/script disguised inside .txt file
    const scriptBytes = new TextEncoder().encode('<script>alert(1)</script>');
    const fakeTxt = validateMessageAttachment(
      { name: 'homework.txt', size: scriptBytes.length, type: 'text/plain' },
      scriptBytes
    );
    assert.equal(fakeTxt.valid, false);

    // Extension vs MIME mismatch (.png with application/pdf MIME)
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const mismatch = validateMessageAttachment(
      { name: 'chart.png', size: 2048, type: 'application/pdf' },
      pngBytes
    );
    assert.equal(mismatch.valid, false);

    // Valid PDF passes
    const validPdfBytes = new TextEncoder().encode('%PDF-1.7\n1 0 obj');
    const validPdf = validateMessageAttachment(
      { name: 'Reading Assignment.pdf', size: 2048, type: 'application/pdf' },
      validPdfBytes
    );
    assert.equal(validPdf.valid, true);
    assert.equal(validPdf.extension, 'pdf');
    assert.equal(validPdf.mimeType, 'application/pdf');
    assert.equal(validPdf.sanitizedName, 'Reading_Assignment.pdf');

    // Valid PNG passes
    const validPng = validateMessageAttachment(
      { name: 'diagram.png', size: 2048, type: 'image/png' },
      pngBytes
    );
    assert.equal(validPng.valid, true);
  });

  it('3. Validates message draft rules and safe storage object paths', () => {
    assert.equal(validateMessageDraft('   ', 0).valid, false);
    assert.equal(validateMessageDraft('', 1).valid, true);
    assert.equal(validateMessageDraft('a'.repeat(MAX_MESSAGE_BODY_LENGTH + 1), 0).valid, false);
    assert.equal(validateMessageDraft('ok', MAX_ATTACHMENTS_PER_MESSAGE + 1).valid, false);

    const convId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const safePath = buildSafeStorageObjectPath(convId, userId, '../../secret report.pdf', 'abc12345');

    assert.equal(safePath.startsWith(`${convId}/${userId}/`), true);
    assert.equal(safePath.includes('..'), false);
    assert.equal(isSafeStorageObjectPath(safePath), true);
    assert.equal(isSafeStorageObjectPath(`../${userId}/hack.pdf`), false);
    assert.equal(isSafeStorageObjectPath(`/${convId}/${userId}/hack.pdf`), false);
    assert.equal(sanitizeStorageFileName('..\\..\\evil?.pdf'), 'evil.pdf');

    assert.equal(
      parseMessageActionUrl(`/messages/${convId}`),
      convId
    );
    assert.equal(parseMessageActionUrl('/courses/123'), null);
  });
});

describe('messagingService - Truthful Errors, Storage Rollback & Realtime', () => {
  const convId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const userId = '11111111-1111-4111-8111-111111111111';

  it('4. Aborts BEFORE upload or RPC when an attachment fails validation', async () => {
    const mock = createMessagingMockClient({ user: { id: userId } });
    setSupabaseClientForTesting(mock.client);

    const badFile = createMockFile(
      'malware.exe',
      new Uint8Array([0x4d, 0x5a, 0x90, 0x00]),
      'application/x-msdownload'
    );

    await assert.rejects(
      () =>
        messagingService.sendMessage({
          conversationId: convId,
          body: 'See attached',
          files: [badFile],
        }),
      (err: unknown) => err instanceof ServiceError && err.category === 'VALIDATION_ERROR'
    );

    assert.equal(mock.uploadedObjects.length, 0);
    assert.equal(mock.rpcCalls.length, 0);
  });

  it('5. Rolls back uploaded attachments and skips send_direct_message when second file upload fails', async () => {
    const mock = createMessagingMockClient({
      user: { id: userId },
      uploadFailAtIndex: 1,
      uploadError: { message: 'Bucket quota failure', status: 500 },
    });
    setSupabaseClientForTesting(mock.client);

    const pdf1 = createMockFile(
      'first.pdf',
      new TextEncoder().encode('%PDF-1.4\nhello'),
      'application/pdf'
    );
    const pdf2 = createMockFile(
      'second.pdf',
      new TextEncoder().encode('%PDF-1.4\nworld'),
      'application/pdf'
    );

    await assert.rejects(
      () =>
        messagingService.sendMessage({
          conversationId: convId,
          body: 'Two files',
          files: [pdf1, pdf2],
        }),
      (err: unknown) => err instanceof ServiceError
    );

    // First uploaded file was cleaned up, and send_direct_message RPC was never called (no orphan notification)
    assert.equal(mock.uploadedObjects.length, 1);
    assert.equal(mock.removedBatches.length, 1);
    assert.deepEqual(mock.removedBatches[0], [mock.uploadedObjects[0]]);
    assert.equal(mock.rpcCalls.length, 0);
  });

  it('6. Rolls back all uploaded attachments if send_direct_message RPC fails authorization/DB check', async () => {
    const mock = createMessagingMockClient({
      user: { id: userId },
      rpcHandler: () => ({
        data: null,
        error: { code: '42501', message: 'Forbidden: Messaging relationship is not authorized' },
      }),
    });
    setSupabaseClientForTesting(mock.client);

    const pngFile = createMockFile(
      'homework.png',
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      'image/png'
    );

    await assert.rejects(
      () =>
        messagingService.sendMessage({
          conversationId: convId,
          body: 'Homework image',
          files: [pngFile],
        }),
      (err: unknown) => err instanceof ServiceError && err.category === 'AUTHORIZATION_ERROR'
    );

    assert.equal(mock.uploadedObjects.length, 1);
    assert.equal(mock.removedBatches.length, 1);
    assert.deepEqual(mock.removedBatches[0], mock.uploadedObjects);
  });

  it('7. Succeeds and maps returned DirectMessage + attachment metadata cleanly', async () => {
    const mock = createMessagingMockClient({
      user: { id: userId },
      rpcHandler: (fnName, params) => {
        assert.equal(fnName, 'send_direct_message');
        assert.equal(params.p_conversation_id, convId);
        assert.equal(params.p_attachments.length, 1);
        return {
          data: {
            id: 'msg-1',
            conversation_id: convId,
            sender_id: userId,
            recipient_id: '22222222-2222-4222-8222-222222222222',
            body: 'Question on lesson 3',
            has_attachments: true,
            client_message_id: params.p_client_message_id,
            is_read: false,
            read_at: null,
            created_at: '2026-11-13T10:15:00Z',
            sender_name: 'Student One',
            sender_name_arabic: 'طالب ١',
            attachments: [
              {
                id: 'att-1',
                message_id: 'msg-1',
                conversation_id: convId,
                uploader_id: userId,
                storage_bucket: 'message-attachments',
                storage_path: params.p_attachments[0].storage_path,
                file_name: 'notes.pdf',
                file_size_bytes: 15,
                mime_type: 'application/pdf',
                file_extension: 'pdf',
                created_at: '2026-11-13T10:15:00Z',
              },
            ],
          },
          error: null,
        };
      },
    });
    setSupabaseClientForTesting(mock.client);

    const pdf = createMockFile('notes.pdf', new TextEncoder().encode('%PDF-1.7\nnotes'), 'application/pdf');
    const saved = await messagingService.sendMessage({
      conversationId: convId,
      body: 'Question on lesson 3',
      files: [pdf],
    });

    assert.equal(saved.id, 'msg-1');
    assert.equal(saved.attachments.length, 1);
    assert.equal(saved.attachments[0].fileName, 'notes.pdf');
    assert.equal(mock.removedBatches.length, 0);
  });

  it('8. Throws truthful ServiceError on unauthorized conversation access and blocks unsafe storage paths', async () => {
    const mock = createMessagingMockClient({
      rpcHandler: () => ({
        data: null,
        error: { code: '42501', message: 'Forbidden: You are not a participant in this conversation' },
      }),
    });
    setSupabaseClientForTesting(mock.client);

    await assert.rejects(
      () => messagingService.fetchMessages(convId),
      (err: unknown) => err instanceof ServiceError && err.category === 'AUTHORIZATION_ERROR'
    );

    await assert.rejects(
      () => messagingService.getAttachmentSignedUrl('../other-conv/secret.pdf'),
      (err: unknown) => err instanceof ServiceError && err.category === 'VALIDATION_ERROR'
    );

    const signed = await messagingService.getAttachmentSignedUrl(
      `${convId}/${userId}/170000_notes.pdf`
    );
    assert.ok(signed.includes('token=abc'));
  });

  it('9. Subscribes to realtime messages with both recipient and sender filters registered BEFORE subscribe()', () => {
    const mock = createMessagingMockClient();
    setSupabaseClientForTesting(mock.client);

    const unsub = messagingService.subscribeToMessages(userId, () => {});
    assert.equal(mock.channels.length, 1);
    assert.deepEqual(mock.channels[0].calls, [
      `on:postgres_changes:messages:recipient_id=eq.${userId}`,
      `on:postgres_changes:messages:sender_id=eq.${userId}`,
      'subscribe',
    ]);

    unsub();
    assert.equal(mock.channels.length, 0);
  });

  it('10. Student loads empty conversation list and empty authorized teachers without throwing schema or database errors', async () => {
    const mock = createMessagingMockClient({
      user: { id: userId },
      rpcHandler: () => ({ data: [], error: null }),
    });
    setSupabaseClientForTesting(mock.client);

    const [convs, teachers] = await Promise.all([
      messagingService.fetchConversations(),
      messagingService.fetchAuthorizedTeachers(),
    ]);

    assert.deepEqual(convs, []);
    assert.deepEqual(teachers, []);
    assert.deepEqual(
      mock.rpcCalls.map((c) => c.fnName),
      ['get_my_message_conversations', 'get_authorized_messaging_teachers']
    );
  });

  it('11. Student sends text-only message and teacher receives, marks read, and replies cleanly', async () => {
    const teacherId = '22222222-2222-4222-8222-222222222222';
    let activeUserId = userId;
    const mock = createMessagingMockClient({
      rpcHandler: (fnName, params) => {
        if (fnName === 'send_direct_message') {
          return {
            data: {
              id: activeUserId === userId ? 'msg-student-1' : 'msg-teacher-1',
              conversation_id: params.p_conversation_id,
              sender_id: activeUserId,
              recipient_id: activeUserId === userId ? teacherId : userId,
              body: params.p_body,
              has_attachments: false,
              client_message_id: params.p_client_message_id,
              is_read: false,
              read_at: null,
              created_at: '2026-11-14T10:00:00Z',
              sender_name: activeUserId === userId ? 'Student One' : 'Teacher One',
              sender_name_arabic: activeUserId === userId ? 'طالب ١' : 'معلم ١',
              attachments: [],
            },
            error: null,
          };
        }
        if (fnName === 'get_conversation_messages') {
          return {
            data: [
              {
                id: 'msg-student-1',
                conversation_id: convId,
                sender_id: userId,
                recipient_id: teacherId,
                body: 'Assalamu Alaikum teacher',
                has_attachments: false,
                client_message_id: 'cid-1',
                is_read: false,
                read_at: null,
                created_at: '2026-11-14T10:00:00Z',
                sender_name: 'Student One',
                sender_name_arabic: 'طالب ١',
                attachments: [],
              },
            ],
            error: null,
          };
        }
        if (fnName === 'mark_conversation_messages_read') {
          return { data: 1, error: null };
        }
        return { data: [], error: null };
      },
    });
    mock.client.auth.getUser = async () => ({
      data: { user: { id: activeUserId } },
      error: null,
    });
    setSupabaseClientForTesting(mock.client);

    // Student sends text message
    const studentMsg = await messagingService.sendMessage({
      conversationId: convId,
      body: 'Assalamu Alaikum teacher',
    });
    assert.equal(studentMsg.id, 'msg-student-1');
    assert.equal(studentMsg.senderId, userId);
    assert.equal(studentMsg.hasAttachments, false);

    // Teacher receives, marks read, and replies
    activeUserId = teacherId;
    const inboxMsgs = await messagingService.fetchMessages(convId);
    assert.equal(inboxMsgs.length, 1);
    assert.equal(inboxMsgs[0].body, 'Assalamu Alaikum teacher');

    const marked = await messagingService.markConversationRead(convId);
    assert.equal(marked, 1);

    const teacherReply = await messagingService.sendMessage({
      conversationId: convId,
      body: 'Wa Alaikum Assalam, welcome!',
    });
    assert.equal(teacherReply.id, 'msg-teacher-1');
    assert.equal(teacherReply.senderId, teacherId);
    assert.equal(teacherReply.recipientId, userId);
  });

  it('12. Preserves exact SCHEMA_ERROR classification for PGRST202 missing RPC, 42703 missing column, and 42P01 missing relation', async () => {
    const schemaCases = [
      {
        code: 'PGRST202',
        status: 404,
        message: 'Could not find the function public.get_my_message_conversations in the schema cache',
      },
      {
        code: '42703',
        status: 400,
        message: 'column a.teacher_id does not exist',
      },
      {
        code: '42P01',
        status: 400,
        message: 'relation "public.assignment_targets" does not exist',
      },
    ];

    for (const pgError of schemaCases) {
      const mock = createMessagingMockClient({
        rpcHandler: () => ({ data: null, error: pgError }),
      });
      setSupabaseClientForTesting(mock.client);

      await assert.rejects(
        () => messagingService.fetchConversations(),
        (err: unknown) =>
          err instanceof ServiceError &&
          err.category === 'SCHEMA_ERROR' &&
          err.code === pgError.code
      );
    }
  });

  it('13. Distinguishes missing Storage bucket (SCHEMA_ERROR) from Storage RLS denial (AUTHORIZATION_ERROR)', async () => {
    const missingBucketMock = createMessagingMockClient({
      user: { id: userId },
      uploadError: { name: 'StorageApiError', status: 404, message: 'Bucket not found' },
    });
    setSupabaseClientForTesting(missingBucketMock.client);

    const pdf = createMockFile('hw.pdf', new TextEncoder().encode('%PDF-1.7\nok'), 'application/pdf');
    await assert.rejects(
      () => messagingService.sendMessage({ conversationId: convId, body: 'file', files: [pdf] }),
      (err: unknown) => err instanceof ServiceError && err.category === 'SCHEMA_ERROR'
    );

    const rlsDeniedMock = createMessagingMockClient({
      user: { id: userId },
      uploadError: {
        name: 'StorageApiError',
        status: 403,
        message: 'new row violates row-level security policy',
      },
    });
    setSupabaseClientForTesting(rlsDeniedMock.client);

    await assert.rejects(
      () => messagingService.sendMessage({ conversationId: convId, body: 'file', files: [pdf] }),
      (err: unknown) => err instanceof ServiceError && err.category === 'AUTHORIZATION_ERROR'
    );
  });

  it('14. Throws DATABASE_ERROR when getOrCreateConversation or send_direct_message unexpectedly returns null data', async () => {
    const mock = createMessagingMockClient({
      user: { id: userId },
      rpcHandler: () => ({ data: null, error: null }),
    });
    setSupabaseClientForTesting(mock.client);

    await assert.rejects(
      () => messagingService.getOrCreateConversation({ teacherId: '22222222-2222-4222-8222-222222222222' }),
      (err: unknown) => err instanceof ServiceError && err.category === 'DATABASE_ERROR'
    );

    await assert.rejects(
      () => messagingService.sendMessage({ conversationId: convId, body: 'Hello' }),
      (err: unknown) => err instanceof ServiceError && err.category === 'DATABASE_ERROR'
    );
  });
});
