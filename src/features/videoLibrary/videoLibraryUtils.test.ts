/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isCompletionEligible,
  calculateProgressPercentage,
  formatDuration,
  detectVideoProvider,
  validateVideoInputs,
  validateResourceType,
  canTransitionStatus,
  filterVideos,
} from './videoLibraryUtils';
import { VideoAssetRecord } from './types';

test('videoLibraryUtils - Completion Thresholds (Server & Client Logic)', async (t) => {
  await t.test('rejects premature completion when video just opened (< 85%)', () => {
    // 30 seconds into a 300-second video is 10%
    assert.strictEqual(isCompletionEligible(30, 300), false);
    // 200 seconds into a 300-second video is 66.7%
    assert.strictEqual(isCompletionEligible(200, 300), false);
    // 254 seconds into 300s is 84.6%
    assert.strictEqual(isCompletionEligible(254, 300), false);
  });

  await t.test('approves completion when position reaches >= 85% of duration', () => {
    // Exactly 85% of 300 is 255
    assert.strictEqual(isCompletionEligible(255, 300), true);
    // 280 of 300 is 93.3%
    assert.strictEqual(isCompletionEligible(280, 300), true);
    // End of video
    assert.strictEqual(isCompletionEligible(300, 300), true);
  });

  await t.test('approves completion when within 5 seconds of the end for long videos', () => {
    // 596 of 600 (within 5 seconds)
    assert.strictEqual(isCompletionEligible(596, 600), true);
  });

  await t.test('handles 0 or invalid duration gracefully', () => {
    assert.strictEqual(isCompletionEligible(0, 0), false);
    assert.strictEqual(isCompletionEligible(100, 0), false);
    assert.strictEqual(isCompletionEligible(100, -50), false);
  });
});

test('videoLibraryUtils - Progress Percentage and Formatting', async (t) => {
  await t.test('calculates correct rounded percentage clamped 0 to 100', () => {
    assert.strictEqual(calculateProgressPercentage(0, 300), 0);
    assert.strictEqual(calculateProgressPercentage(150, 300), 50);
    assert.strictEqual(calculateProgressPercentage(255, 300), 85);
    assert.strictEqual(calculateProgressPercentage(350, 300), 100);
    assert.strictEqual(calculateProgressPercentage(50, 0), 0);
  });

  await t.test('formats duration correctly to MM:SS and HH:MM:SS', () => {
    assert.strictEqual(formatDuration(0), '00:00');
    assert.strictEqual(formatDuration(45), '00:45');
    assert.strictEqual(formatDuration(125), '02:05');
    assert.strictEqual(formatDuration(3600), '01:00:00');
    assert.strictEqual(formatDuration(3665), '01:01:05');
  });

  await t.test('detects provider from legitimate URL', () => {
    assert.strictEqual(detectVideoProvider('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'youtube');
    assert.strictEqual(detectVideoProvider('https://vimeo.com/76979871'), 'vimeo');
    assert.strictEqual(detectVideoProvider('https://wessam-academy.sa/video.mp4'), 'custom');
  });
});

test('videoLibraryUtils - Video Input & Resource Validations', async (t) => {
  await t.test('validates required bilingual titles and safe video URLs', () => {
    const valid = validateVideoInputs({
      title: 'Speaking Fluency',
      titleArabic: 'الطلاقة اللفظية',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      durationSeconds: 300,
    });
    assert.strictEqual(valid.isValid, true);
    assert.strictEqual(Object.keys(valid.errors).length, 0);

    const missingTitle = validateVideoInputs({
      title: '',
      titleArabic: '',
      videoUrl: 'https://malicious-site.example/video',
      durationSeconds: -10,
    });
    assert.strictEqual(missingTitle.isValid, false);
    assert.ok(missingTitle.errors.title);
    assert.ok(missingTitle.errors.titleArabic);
    assert.ok(missingTitle.errors.videoUrl);
    assert.ok(missingTitle.errors.durationSeconds);
  });

  await t.test('validates resource types and matching extensions', () => {
    assert.strictEqual(validateResourceType('pdf', 'pdf'), true);
    assert.strictEqual(validateResourceType('worksheet', 'docx'), true);
    assert.strictEqual(validateResourceType('image', 'png'), true);
    assert.strictEqual(validateResourceType('image', 'exe'), false);
    assert.strictEqual(validateResourceType('invalid_type', 'pdf'), false);
  });

  await t.test('verifies lifecycle status transitions', () => {
    assert.strictEqual(canTransitionStatus('draft', 'published'), true);
    assert.strictEqual(canTransitionStatus('published', 'archived'), true);
    assert.strictEqual(canTransitionStatus('archived', 'published'), true);
  });
});

test('videoLibraryUtils - Video Collection Filtering', async (t) => {
  const mockVideos: VideoAssetRecord[] = [
    {
      id: 'v1',
      title: 'Grammar Foundations',
      titleArabic: 'أساسيات القواعد',
      description: 'Present perfect and past simple',
      descriptionArabic: 'المضارع التام والماضي البسيط',
      videoSource: 'youtube',
      courseId: 'course-1',
      unitId: 'unit-1',
      durationSeconds: 300,
      orderIndex: 1,
      status: 'published',
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
      progress: {
        id: 'p1',
        studentId: 's1',
        videoId: 'v1',
        lastPositionSeconds: 270,
        maxPositionSeconds: 270,
        durationSeconds: 300,
        isCompleted: true,
        lastWatchedAt: '2026-11-02T00:00:00Z',
      },
    },
    {
      id: 'v2',
      title: 'Vocabulary Masterclass',
      titleArabic: 'دورة المفردات المتقدمة',
      description: 'Academic word list',
      descriptionArabic: 'قائمة الكلمات الأكاديمية',
      videoSource: 'vimeo',
      courseId: 'course-1',
      unitId: 'unit-2',
      durationSeconds: 400,
      orderIndex: 2,
      status: 'published',
      createdAt: '2026-11-02T00:00:00Z',
      updatedAt: '2026-11-02T00:00:00Z',
      progress: {
        id: 'p2',
        studentId: 's1',
        videoId: 'v2',
        lastPositionSeconds: 100,
        maxPositionSeconds: 100,
        durationSeconds: 400,
        isCompleted: false,
        lastWatchedAt: '2026-11-03T00:00:00Z',
      },
    },
    {
      id: 'v3',
      title: 'Draft Reading Strategy',
      titleArabic: 'استراتيجيات القراءة مسودة',
      videoSource: 'youtube',
      courseId: 'course-2',
      durationSeconds: 500,
      orderIndex: 1,
      status: 'draft',
      createdAt: '2026-11-03T00:00:00Z',
      updatedAt: '2026-11-03T00:00:00Z',
      progress: null,
    },
  ];

  await t.test('filters by search query matching Arabic or English text', () => {
    const resEn = filterVideos(mockVideos, { searchQuery: 'grammar' });
    assert.strictEqual(resEn.length, 1);
    assert.strictEqual(resEn[0].id, 'v1');

    const resAr = filterVideos(mockVideos, { searchQuery: 'المفردات' });
    assert.strictEqual(resAr.length, 1);
    assert.strictEqual(resAr[0].id, 'v2');
  });

  await t.test('filters by course and status', () => {
    const course1Pub = filterVideos(mockVideos, { courseId: 'course-1', status: 'published' });
    assert.strictEqual(course1Pub.length, 2);

    const drafts = filterVideos(mockVideos, { status: 'draft' });
    assert.strictEqual(drafts.length, 1);
    assert.strictEqual(drafts[0].id, 'v3');
  });

  await t.test('filters by student progress state (completed, in_progress, unwatched)', () => {
    const completed = filterVideos(mockVideos, { progressState: 'completed' });
    assert.strictEqual(completed.length, 1);
    assert.strictEqual(completed[0].id, 'v1');

    const inProgress = filterVideos(mockVideos, { progressState: 'in_progress' });
    assert.strictEqual(inProgress.length, 1);
    assert.strictEqual(inProgress[0].id, 'v2');

    const unwatched = filterVideos(mockVideos, { progressState: 'unwatched' });
    assert.strictEqual(unwatched.length, 1);
    assert.strictEqual(unwatched[0].id, 'v3');
  });
});
