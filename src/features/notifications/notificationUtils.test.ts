/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  resolveCategoryLabel,
  resolveCategoryBadge,
  resolvePriorityLabel,
  resolvePriorityBadge,
  filterNotifications,
  computeUnreadCount,
  isScheduledReadyToPublish,
  buildIdempotencyKey,
  formatNotificationTime,
} from './notificationUtils';
import { AppNotification } from './types';

describe('notificationUtils - Category & Priority Resolution', () => {
  it('resolves localized labels for categories', () => {
    assert.strictEqual(resolveCategoryLabel('live_session', true), 'حصة مباشرة');
    assert.strictEqual(resolveCategoryLabel('live_session', false), 'Live Session');
    assert.strictEqual(resolveCategoryLabel('quiz_published', true), 'اختبار متاح');
    assert.strictEqual(resolveCategoryLabel('quiz_published', false), 'Assessment');
    assert.strictEqual(resolveCategoryLabel('new_lesson', true), 'درس جديد');
    assert.strictEqual(resolveCategoryLabel('new_lesson', false), 'New Lesson');
  });

  it('resolves badge color schemes for categories', () => {
    const liveBadge = resolveCategoryBadge('live_session');
    assert.ok(liveBadge.bg.includes('emerald'));

    const quizBadge = resolveCategoryBadge('quiz_published');
    assert.ok(quizBadge.bg.includes('amber'));

    const alertBadge = resolveCategoryBadge('account_alert');
    assert.ok(alertBadge.bg.includes('rose'));
  });

  it('resolves localized labels and styles for priority', () => {
    assert.strictEqual(resolvePriorityLabel('urgent', true), 'عاجل');
    assert.strictEqual(resolvePriorityLabel('urgent', false), 'Urgent');
    assert.strictEqual(resolvePriorityLabel('normal', true), 'عادي');

    const urgentBadge = resolvePriorityBadge('urgent');
    assert.ok(urgentBadge.bg.includes('red'));

    const normalBadge = resolvePriorityBadge('normal');
    assert.ok(normalBadge.bg.includes('slate'));
  });
});

describe('notificationUtils - Filtering & Unread Counts', () => {
  const sampleNotifications: AppNotification[] = [
    {
      id: '1',
      title: 'Math Live Session',
      titleArabic: 'حصة الرياضيات المباشرة',
      body: 'Starts in 10 minutes',
      bodyArabic: 'تبدأ بعد عشر دقائق',
      type: 'live_session',
      category: 'live_session',
      priority: 'urgent',
      createdAt: '2026-11-08T10:00:00Z',
      isRead: false,
    },
    {
      id: '2',
      title: 'Physics Quiz Results',
      titleArabic: 'نتائج اختبار الفيزياء',
      body: 'Grades released',
      bodyArabic: 'تم نشر الدرجات',
      type: 'grade',
      category: 'quiz_result',
      priority: 'normal',
      createdAt: '2026-11-08T09:00:00Z',
      isRead: true,
    },
    {
      id: '3',
      title: 'New Chemistry Lesson',
      titleArabic: 'درس كيمياء جديد',
      body: 'Watch video worksheet',
      bodyArabic: 'شاهد الشرح وحل الواجب',
      type: 'lesson',
      category: 'new_lesson',
      priority: 'important',
      createdAt: '2026-11-08T08:00:00Z',
      isRead: false,
    },
  ];

  it('computes unread counts accurately', () => {
    assert.strictEqual(computeUnreadCount(sampleNotifications), 2);
    assert.strictEqual(computeUnreadCount([]), 0);
  });

  it('filters by unread status', () => {
    const unread = filterNotifications(sampleNotifications, 'unread', 'all');
    assert.strictEqual(unread.length, 2);
    assert.ok(unread.every((n) => !n.isRead));

    const read = filterNotifications(sampleNotifications, 'read', 'all');
    assert.strictEqual(read.length, 1);
    assert.strictEqual(read[0].id, '2');
  });

  it('filters by category', () => {
    const quizOnly = filterNotifications(sampleNotifications, 'all', 'quiz_result');
    assert.strictEqual(quizOnly.length, 1);
    assert.strictEqual(quizOnly[0].id, '2');
  });

  it('filters by search query matching English and Arabic text', () => {
    const searchEng = filterNotifications(sampleNotifications, 'all', 'all', 'Physics');
    assert.strictEqual(searchEng.length, 1);
    assert.strictEqual(searchEng[0].id, '2');

    const searchAr = filterNotifications(sampleNotifications, 'all', 'all', 'كيمياء');
    assert.strictEqual(searchAr.length, 1);
    assert.strictEqual(searchAr[0].id, '3');
  });
});

describe('notificationUtils - Scheduling & Idempotency', () => {
  it('determines if a scheduled announcement is ready to publish', () => {
    const pastDate = new Date(Date.now() - 60000).toISOString();
    const futureDate = new Date(Date.now() + 600000).toISOString();

    assert.strictEqual(isScheduledReadyToPublish(pastDate), true);
    assert.strictEqual(isScheduledReadyToPublish(futureDate), false);
    assert.strictEqual(isScheduledReadyToPublish(null), false);
  });

  it('constructs deterministic idempotency keys', () => {
    assert.strictEqual(buildIdempotencyKey('quiz', 'abc-123'), 'quiz_abc-123');
    assert.strictEqual(buildIdempotencyKey('session', 'xyz', 1799999999), 'session_xyz_1799999999');
  });

  it('formats dates into Asia/Riyadh localized time string', () => {
    const utcIso = '2026-11-08T12:00:00Z'; // 15:00 in Riyadh (UTC+3)
    const formattedEn = formatNotificationTime(utcIso, false);
    assert.ok(formattedEn.includes('2026'));

    const formattedAr = formatNotificationTime(utcIso, true);
    assert.ok(formattedAr.length > 5);
  });
});
