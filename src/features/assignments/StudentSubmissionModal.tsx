/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  X,
  FileText,
  Calendar,
  Clock,
  UploadCloud,
  Trash2,
  Download,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Award,
  Send,
  MessageSquare,
  Lock,
} from 'lucide-react';
import {
  AssignmentRecord,
  SubmissionRecord,
  AssignmentAttachment,
} from './types';
import {
  formatAssignmentDateTime,
  formatFileSize,
  getAssignmentDeadlineStatus,
  ALLOWED_FILE_EXTENSIONS,
} from './assignmentUtils';
import {
  submitAssignment,
  uploadAssignmentFile,
  getAssignmentFileSignedUrl,
} from './assignmentService';

interface StudentSubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignment: AssignmentRecord;
  submissions: SubmissionRecord[];
  onSubmitted: () => void;
}

export const StudentSubmissionModal: React.FC<StudentSubmissionModalProps> = ({
  isOpen,
  onClose,
  assignment,
  submissions,
  onSubmitted,
}) => {
  const latestSubmission = submissions && submissions.length > 0 ? submissions[0] : null;
  const attemptsCount = submissions ? submissions.length : 0;
  const canAttemptMore = attemptsCount < assignment.maxAttempts;

  // Deadline calculation
  const deadlineStatus = getAssignmentDeadlineStatus(
    assignment.dueDate,
    assignment.cutoffDate,
    assignment.allowLateSubmissions
  );

  const isClosed = deadlineStatus.isPastCutoff;

  // Form states
  const [content, setContent] = useState('');
  const [studentComment, setStudentComment] = useState('');
  const [attachments, setAttachments] = useState<AssignmentAttachment[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // If already graded and released, or waiting
  const isGradedAndReleased = latestSubmission?.isGradeReleased && latestSubmission?.score !== null && latestSubmission?.score !== undefined;
  const isReturnedForRevision = latestSubmission?.status === 'returned_for_revision';

  if (!isOpen) return null;

  // File upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_FILE_EXTENSIONS.includes(ext)) {
      setErrorMessage(`صيغة الملف غير مدعومة (.${ext}). يرجى رفع ملف صالح (PDF, Word, Images, etc.)`);
      return;
    }

    try {
      setUploadingFile(true);
      setErrorMessage(null);
      const uploaded = await uploadAssignmentFile(
        file,
        'submissions',
        assignment.id
      );
      setAttachments((prev) => [...prev, uploaded]);
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل رفع الملف');
    } finally {
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDownloadTeacherAttachment = async (path: string) => {
    try {
      const url = await getAssignmentFileSignedUrl(path);
      window.open(url, '_blank');
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل تحميل الملف');
    }
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    // Verify submission has either content or attachments
    if (!content.trim() && attachments.length === 0) {
      setErrorMessage('يرجى كتابة إجابة نصية أو إرفاق ملف للحل قبل الضغط على تسليم');
      return;
    }

    try {
      setSubmitting(true);
      await submitAssignment({
        assignmentId: assignment.id,
        content: content.trim() ? content : undefined,
        attachments,
        studentComment: studentComment.trim() ? studentComment : undefined,
      });

      setSuccessMessage('تم تسليم الواجب بنجاح!');
      setTimeout(() => {
        onSubmitted();
        onClose();
      }, 1000);
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل تسليم الواجب');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-slate-900/60 backdrop-blur-xs">
      <div
        dir="rtl"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {assignment.titleArabic || assignment.title}
              </h2>
              <p className="text-xs text-slate-500">
                {assignment.course?.titleArabic || assignment.course?.title} • الدرجة القصوى: {assignment.maxScore}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Status & Deadline Banner */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-semibold text-slate-700">
                آخر موعد للتسليم: {formatAssignmentDateTime(assignment.dueDate)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${deadlineStatus.badgeColor}`}>
                {deadlineStatus.labelAr}
              </span>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700">
                محاولة {attemptsCount} من {assignment.maxAttempts}
              </span>
            </div>
          </div>

          {/* Teacher Instructions */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-800">تعليمات وتوجيهات الواجب:</h4>
            {assignment.instructionsArabic && (
              <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                {assignment.instructionsArabic}
              </div>
            )}
            {assignment.instructions && (
              <div
                dir="ltr"
                className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 leading-relaxed whitespace-pre-wrap font-sans"
              >
                {assignment.instructions}
              </div>
            )}
          </div>

          {/* Teacher Attachments (Reference materials) */}
          {assignment.attachments && assignment.attachments.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-800">مرفقات المعلم ونماذج التوجيه:</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {assignment.attachments.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-xl"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                      <span className="text-xs font-bold text-slate-700 truncate">{file.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDownloadTeacherAttachment(file.path)}
                      className="p-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>تحميل</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rubric display */}
          {assignment.rubric && assignment.rubric.length > 0 && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <h4 className="text-xs font-bold text-slate-800">سلم معايير التقييم (Rubric):</h4>
              <div className="divide-y divide-slate-200 text-xs">
                {assignment.rubric.map((crit) => (
                  <div key={crit.id} className="py-1.5 flex justify-between items-center">
                    <div>
                      <span className="font-bold text-slate-700">{crit.titleArabic || crit.title}</span>
                      {crit.description && <p className="text-[11px] text-slate-500">{crit.description}</p>}
                    </div>
                    <span className="font-bold text-blue-700">{crit.maxPoints} درجة</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PREVIOUS SUBMISSION / GRADED RESULT INSPECTOR */}
          {latestSubmission && (
            <div className="p-5 bg-indigo-50/70 border border-indigo-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-950 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-indigo-700" />
                  <span>آخر تسليم لك (المحاولة #{latestSubmission.attemptNumber})</span>
                </span>
                <span className="text-[11px] text-slate-500">
                  {formatAssignmentDateTime(latestSubmission.submittedAt)}
                </span>
              </div>

              {/* Grade display */}
              {isGradedAndReleased ? (
                <div className="p-4 bg-white border border-emerald-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">الدرجة المعتمدة:</span>
                    <span className="text-lg font-extrabold text-emerald-700">
                      {latestSubmission.score} / {assignment.maxScore} درجة
                    </span>
                  </div>

                  {latestSubmission.teacherFeedback && (
                    <div className="p-3 bg-emerald-50 rounded-lg text-xs text-emerald-950">
                      <p className="font-bold text-emerald-900 mb-1">ملاحظات الأستاذ:</p>
                      <p className="whitespace-pre-wrap">{latestSubmission.teacherFeedback}</p>
                    </div>
                  )}
                </div>
              ) : isReturnedForRevision ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-xs text-amber-950">
                  <div className="flex items-center gap-2 font-bold text-amber-900">
                    <RotateCcw className="w-4 h-4 text-amber-700" />
                    <span>طلب المعلم إعادة المحاولة وتعديل الحل:</span>
                  </div>
                  {latestSubmission.teacherFeedback && (
                    <p className="p-2.5 bg-white rounded-lg border border-amber-100 italic">
                      "{latestSubmission.teacherFeedback}"
                    </p>
                  )}
                </div>
              ) : (
                <div className="p-3 bg-white border border-indigo-100 rounded-xl text-xs text-indigo-800 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-600" />
                  <span>تم استلام إجابتك بنجاح وهي بانتظار مراجعة وتصحيح المعلم.</span>
                </div>
              )}
            </div>
          )}

          {/* SUBMISSION FORM (Active if attempts remaining and not closed) */}
          {(!latestSubmission || isReturnedForRevision || canAttemptMore) && !isClosed && (
            <form onSubmit={handleSubmit} className="space-y-4 pt-2 border-t border-slate-200">
              <h4 className="text-xs font-bold text-slate-900">
                {latestSubmission ? 'رفع محاولة جديدة معدلة:' : 'تقديم الحل والتسليم:'}
              </h4>

              {/* Text answer */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  الإجابة النصية أو المقال:
                </label>
                <textarea
                  rows={5}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="اكتب إجابتك أو مقالك هنا بشكل مباشر..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              {/* File upload */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  رفع ملفات الحل (PDF, Word, صور):
                </label>
                <div className="p-4 border-2 border-dashed border-slate-300 hover:border-blue-400 bg-slate-50 rounded-xl text-center relative transition-colors">
                  <UploadCloud className="w-6 h-6 text-blue-600 mx-auto mb-1" />
                  <p className="text-xs font-bold text-slate-700">اضغط لاختيار ملف الحل أو اسحبه هنا</p>
                  <p className="text-[10px] text-slate-400">الحد الأقصى: 50MB</p>
                  <input
                    type="file"
                    onChange={handleFileUpload}
                    disabled={uploadingFile}
                    className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  />
                </div>

                {uploadingFile && (
                  <p className="text-xs text-blue-600 font-bold mt-2">جارٍ رفع الملف بأمان...</p>
                )}

                {/* Attached files list */}
                {attachments.length > 0 && (
                  <div className="space-y-2 mt-3">
                    {attachments.map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-xl text-xs"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <FileText className="w-4 h-4 text-blue-600" />
                          <span className="font-bold text-slate-800 truncate">{file.name}</span>
                          <span className="text-slate-400 text-[10px]">({formatFileSize(file.size)})</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(idx)}
                          className="p-1 text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Student comment for teacher */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ملاحظة إضافية للمعلم (اختياري):
                </label>
                <input
                  type="text"
                  value={studentComment}
                  onChange={(e) => setStudentComment(e.target.value)}
                  placeholder="مثال: قمت بالتركيز على التعبيرات الاصطلاحية في الفقرة الثالثة..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              {/* Error & Success alerts */}
              {errorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {successMessage && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2 font-bold">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{successMessage}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{submitting ? 'جارٍ تسليم الواجب...' : 'تسليم الحل الآن'}</span>
              </button>
            </form>
          )}

          {isClosed && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
              <Lock className="w-4 h-4 text-rose-600 shrink-0" />
              <span>انتهت المهلة المحددة لهذا الواجب تماماً ولا يُقبل أي تسليم إضافي.</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 flex justify-end bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-200 transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
