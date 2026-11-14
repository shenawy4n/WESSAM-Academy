/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SYSTEM_SETTINGS,
  StaffGovernanceDirectory,
  canModifyStaffRoleOrStatus,
  containsForbiddenSecretPayload,
  validateSettingPayload,
} from './settingsService';

test('containsForbiddenSecretPayload blocks secret keys, API tokens, and private keys', () => {
  assert.equal(containsForbiddenSecretPayload({ academy_name_en: 'WESSAM Academy' }), false);
  assert.equal(containsForbiddenSecretPayload({ api_key: '12345' }), true);
  assert.equal(containsForbiddenSecretPayload({ nested: { service_role_token: 'abc' } }), true);
  assert.equal(containsForbiddenSecretPayload({ note: 'sk_live_secretvalue' }), true);
  assert.equal(containsForbiddenSecretPayload({ note: 'eyJhbGciOiJIUzI1NiJ9.payload' }), true);
});

test('validateSettingPayload enforces Asia/Riyadh timezone, valid score bounds, and rejects secrets', () => {
  assert.equal(
    validateSettingPayload('academy_info', DEFAULT_SYSTEM_SETTINGS.academy_info),
    null
  );
  assert.ok(
    validateSettingPayload('academy_info', {
      ...DEFAULT_SYSTEM_SETTINGS.academy_info,
      timezone: 'UTC',
    })
  );
  assert.ok(
    validateSettingPayload('academic_settings', {
      ...DEFAULT_SYSTEM_SETTINGS.academic_settings,
      default_passing_score: 120,
    })
  );
  assert.ok(
    validateSettingPayload('platform_options', {
      ...DEFAULT_SYSTEM_SETTINGS.platform_options,
      webhook_secret: 'nope',
    })
  );
});

test('canModifyStaffRoleOrStatus prevents demoting or deactivating the last active super_admin', () => {
  const dirSingleAdmin: StaffGovernanceDirectory = {
    staffAccounts: [
      {
        id: 'admin-1',
        fullName: 'Wessam Draz',
        fullNameArabic: 'وسام دراز',
        role: 'super_admin',
        status: 'active',
        phone: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'teacher-1',
        fullName: 'Teacher A',
        fullNameArabic: 'المعلم أ',
        role: 'teacher',
        status: 'active',
        phone: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ],
    roleCounts: {
      activeSuperAdmins: 1,
      activeTeachers: 1,
      activeStudents: 10,
      inactiveOrSuspendedStudents: 0,
    },
  };

  const demoteLast = canModifyStaffRoleOrStatus(dirSingleAdmin, 'admin-1', 'teacher', 'active');
  assert.equal(demoteLast.allowed, false);

  const suspendLast = canModifyStaffRoleOrStatus(dirSingleAdmin, 'admin-1', 'super_admin', 'suspended');
  assert.equal(suspendLast.allowed, false);

  const promoteTeacher = canModifyStaffRoleOrStatus(dirSingleAdmin, 'teacher-1', 'super_admin', 'active');
  assert.equal(promoteTeacher.allowed, true);
});
