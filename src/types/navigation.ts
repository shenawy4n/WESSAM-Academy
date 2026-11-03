/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LucideIcon } from 'lucide-react';

export type TeacherView =
  | 'dashboard'
  | 'students'
  | 'groups'
  | 'courses'
  | 'lessons'
  | 'video'
  | 'live-sessions'
  | 'attendance'
  | 'question-bank'
  | 'quizzes'
  | 'assignments'
  | 'submissions'
  | 'results'
  | 'analytics'
  | 'notifications'
  | 'settings';

export type StudentView =
  | 'home'
  | 'courses'
  | 'lessons'
  | 'live-sessions'
  | 'assignments'
  | 'quizzes'
  | 'results'
  | 'notifications'
  | 'profile';

export type ActiveAppView =
  | { portal: 'auth' }
  | { portal: 'teacher'; view: TeacherView }
  | { portal: 'student'; view: StudentView }
  | { portal: 'unauthorized' }
  | { portal: 'config-error' };

export interface NavItemConfig {
  id: string;
  labelKey: string;
  icon: LucideIcon;
  badge?: number;
}
