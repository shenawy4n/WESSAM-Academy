/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  CheckSquare,
  Clock,
  AlertTriangle,
  Download,
  FileText,
  User,
  CheckCircle2,
  RotateCcw,
  Eye,
  EyeOff,
  History,
  Lock,
  MessageSquare,
  Award,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import {
  AssignmentRecord,
  SubmissionRecord,
  GradingHistoryRecord,
  GradeSubmissionPayload,
} from './types';
import {
  formatAssignmentDateTime,
  formatFileSize,
  validateGradeInput,
} from './assignmentUtils';
import {
  fetchAssignmentSubmissions,
  gradeSubmission,
  fetchGradingHistory,
  getAssignmentFileSignedUrl,
} from './assignmentService';

interface GradingWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignment: AssignmentRecord;
  onGraded: () => void;
}

export const GradingWorkspaceModal: React.FC<GradingWorkspaceModalProps> = ({
  isOpen,
  onClose,
  assignment,
  onGraded,
}) => {
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'graded' | 'late'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Grading form states
  const [score, setScore] = useState<number>(0);
  const [feedback, setFeedback] = useState<string>('');
  const [privateNotes, setPrivateNotes] = useState<string>('');
  const [rubricScores, setRubricScores] = useState<Record<string, number>>({});
  const [releaseGrade, setReleaseGrade] = useState<boolean>(true);
  const [savingGrade, setSavingGrade] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Grading history log
  const [history, setHistory] = useState<GradingHistoryRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Load submissions
  const loadSubmissions = async () => {
    try {
      setLoading(true);
      const data = await fetchAssignmentSubmissions(assignment.id);
      setSubmissions(data);
      if (data.length > 0 && !selectedSubmissionId) {
        setSelectedSubmissionId(data[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load submissions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSubmissions();
    }
  }, [isOpen, assignment.id]);

  const selectedSubmission = submissions.find((s) => s.id === selectedSubmissionId);

  // Sync grading form when selected submission changes
  useEffect(() => {
    if (selectedSubmission) {
      setScore(selectedSubmission.score !== null && selectedSubmission.score !== undefined ? selectedSubmission.score : 0);
      setFeedback(selectedSubmission.teacherFeedback || '');
      setPrivateNotes(selectedSubmission.privateTeacherNotes || '');
      setRubricScores(selectedSubmission.rubricScores || {});
      setReleaseGrade(selectedSubmission.isGradeReleased ?? true);
      setStatusMessage(null);

      // Fetch history
      let isMounted = true;
      async function loadHistory() {
        try {
          setLoadingHistory(true);
          const hist = await fetchGradingHistory(selectedSubmission!.id);
          if (isMounted) setHistory(hist);
        } catch (err) {
          console.error('Failed to load history:', err);
        } finally {
          if (isMounted) setLoadingHistory(false);
        }
      }
      loadHistory();
      return () => {
        isMounted = false;
      };
    }
  }, [selectedSubmissionId]);

  if (!isOpen) return null;

  // Filtered submissions
  const filteredSubmissions = submissions.filter((s) => {
    if (filter === 'pending' && (s.status === 'graded' || (s.score !== null && s.score !== undefined))) return false;
    if (filter === 'graded' && s.status !== 'graded' && s.score === null) return false;
    if (filter === 'late' && !s.isLate) return false;

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const name = (s.student?.fullNameArabic || s.student?.fullName || '').toLowerCase();
      const num = (s.student?.studentNumber || '').toLowerCase();
      return name.includes(term) || num.includes(term);
    }
    return true;
  });

  // Handle file download
  const handleDownloadFile = async (filePath: string) => {
    try {
      const signedUrl = await getAssignmentFileSignedUrl(filePath);
      window.open(signedUrl, '_blank');
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'فشل تحميل الملف' });
    }
  };

  // Handle grade submission
  const handleSaveGrade = async (actionType: 'grade' | 'return_for_revision') => {
    if (!selectedSubmission) return;

    if (actionType === 'grade') {
      const valid = validateGradeInput(score, assignment.maxScore);
      if (!valid.isValid) {
        setStatusMessage({ type: 'error', text: valid.error || 'الدرجة غير صالحة' });
        return;
      }
    }

    try {
      setSavingGrade(true);
      setStatusMessage(null);

      const payload: GradeSubmissionPayload = {
        submissionId: selectedSubmission.id,
        score: actionType === 'return_for_revision' ? 0 : score,
        feedback,
        privateNotes,
        rubricScores,
        releaseGrade,
        actionType,
      };

      await gradeSubmission(payload);
      setStatusMessage({
        type: 'success',
        text: actionType === 'return_for_revision' ? 'تمت إعادة الواجب للطالب للمراجعة والتعديل' : 'تم حفظ واعتماد الدرجة بنجاح',
      });

      // Reload submissions and history
      await loadSubmissions();
      const updatedHist = await fetchGradingHistory(selectedSubmission.id);
      setHistory(updatedHist);
      onGraded();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'فشل حفظ التقييم' });
    } finally {
      setSavingGrade(false);
    }
  };

  // Rubric score updater
  const handleRubricScoreChange = (critId: string, val: number, maxPoints: number) => {
    const clamped = Math.max(0, Math.min(val, maxPoints));
    const newRubric = { ...rubricScores, [critId]: clamped };
    setRubricScores(newRubric);

    // Auto sum rubric scores into total score
    const total = Object.values(newRubric).reduce((a, b) => a + b, 0);
    setScore(total);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-slate-900/60 backdrop-blur-xs">
      <div
        dir="rtl"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden"
      >
        {/* Workspace Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  مكتب تصحيح ومراجعة الواجب: {assignment.titleArabic || assignment.title}
                </h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 font-bold">
                  الدرجة العظمى: {assignment.maxScore}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                فحص إجابات وملفات الطلاب، رصد الدرجات، الملاحظات الفردية، وتوثيق سجل التقييم
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

        {/* Workspace Body: Split view */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* LEFT/RIGHT SIDEBAR: Submissions List */}
          <div className="w-full md:w-80 border-b md:border-b-0 md:border-l border-slate-200 bg-slate-50 flex flex-col">
            {/* Search and Filters */}
            <div className="p-3 border-b border-slate-200 space-y-2">
              <input
                type="text"
                placeholder="بحث باسم الطالب أو رقمه..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              />

              <div className="flex gap-1 text-[11px] font-bold">
                <button
                  onClick={() => setFilter('all')}
                  className={`flex-1 py-1 rounded-lg transition-colors ${
                    filter === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  الكل ({submissions.length})
                </button>
                <button
                  onClick={() => setFilter('pending')}
                  className={`flex-1 py-1 rounded-lg transition-colors ${
                    filter === 'pending' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  للتصحيح ({submissions.filter((s) => s.score === null).length})
                </button>
                <button
                  onClick={() => setFilter('graded')}
                  className={`flex-1 py-1 rounded-lg transition-colors ${
                    filter === 'graded' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  مصحح ({submissions.filter((s) => s.score !== null).length})
                </button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-200">
              {loading ? (
                <div className="p-6 text-center text-xs text-slate-400">جارٍ جلب إجابات الطلاب...</div>
              ) : filteredSubmissions.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">لا توجد تسليمات تطابق الفلتر</div>
              ) : (
                filteredSubmissions.map((sub) => {
                  const isSelected = sub.id === selectedSubmissionId;
                  const isGraded = sub.score !== null && sub.score !== undefined;
                  return (
                    <div
                      key={sub.id}
                      onClick={() => setSelectedSubmissionId(sub.id)}
                      className={`p-3.5 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-indigo-50/80 border-r-4 border-indigo-600'
                          : 'hover:bg-slate-100/80'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">
                          {sub.student?.fullNameArabic || sub.student?.fullName || 'طالب مجهول'}
                        </span>
                        {isGraded ? (
                          <span className="text-[11px] font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                            {sub.score}/{assignment.maxScore}
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">
                            بانتظار الرصد
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                        <span>المحاولة #{sub.attemptNumber}</span>
                        <span>•</span>
                        {sub.isLate && (
                          <span className="text-rose-600 font-bold flex items-center gap-0.5">
                            <Clock className="w-3 h-3" /> متأخر
                          </span>
                        )}
                        <span>{sub.student?.studentNumber || ''}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* MAIN PANEL: Inspection & Grading Form */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {!selectedSubmission ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                <FileText className="w-12 h-12 text-slate-300 mb-2" />
                <span>يرجى اختيار تسليم طالب من القائمة الجانبية للمراجعة والتصحيح</span>
              </div>
            ) : (
              <>
                {/* Submission Header Card */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        {selectedSubmission.student?.fullNameArabic || selectedSubmission.student?.fullName}
                      </h3>
                      <p className="text-xs text-slate-500">
                        الرقم الأكاديمي: {selectedSubmission.student?.studentNumber || 'غير محدد'} • المجموعة: {selectedSubmission.student?.groupName || 'عام'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700">
                      المحاولة {selectedSubmission.attemptNumber} من {assignment.maxAttempts}
                    </span>
                    {selectedSubmission.isLate ? (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> تسليم متأخر
                      </span>
                    ) : (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> في الموعد
                      </span>
                    )}
                  </div>
                </div>

                {/* Submission Date */}
                <div className="text-xs text-slate-500 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>تاريخ ووقت الرفع: {formatAssignmentDateTime(selectedSubmission.submittedAt)}</span>
                </div>

                {/* Student's Content / Essay */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-800">إجابة الطالب النصية / المقال:</h4>
                  {selectedSubmission.content ? (
                    <div className="p-4 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 leading-relaxed whitespace-pre-wrap font-sans">
                      {selectedSubmission.content}
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-xs text-slate-400 italic">
                      لم يتم إدخال إجابة نصية (تم الاعتماد على الملفات المرفقة فقط)
                    </div>
                  )}
                </div>

                {/* Student Comment */}
                {selectedSubmission.studentComment && (
                  <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2">
                    <MessageSquare className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-bold">ملاحظة مرسلة من الطالب: </span>
                      <span>{selectedSubmission.studentComment}</span>
                    </div>
                  </div>
                )}

                {/* Student Attachments */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-800">
                    الملفات المرفوعة من الطالب ({selectedSubmission.attachments.length}):
                  </h4>
                  {selectedSubmission.attachments.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">لا توجد ملفات مرفقة مع هذا التسليم.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {selectedSubmission.attachments.map((file, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl"
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                            <div className="truncate">
                              <p className="text-xs font-bold text-slate-800 truncate">{file.name}</p>
                              <p className="text-[10px] text-slate-400">{formatFileSize(file.size)}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDownloadFile(file.path)}
                            className="p-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>تحميل</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* GRADING FORM */}
                <div className="p-5 bg-indigo-50/50 border border-indigo-200 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between border-b border-indigo-200/60 pb-3">
                    <div className="flex items-center gap-2">
                      <Award className="w-5 h-5 text-indigo-700" />
                      <h4 className="text-sm font-bold text-indigo-950">رصد الدرجة والملاحظات التعليمية</h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-slate-700 cursor-pointer flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={releaseGrade}
                          onChange={(e) => setReleaseGrade(e.target.checked)}
                          className="w-4 h-4 text-indigo-600 rounded-sm"
                        />
                        <span>إعلان الدرجة للطالب فوراً (Release Grade)</span>
                      </label>
                    </div>
                  </div>

                  {/* Rubric Evaluation (if available) */}
                  {assignment.rubric && assignment.rubric.length > 0 && (
                    <div className="space-y-3 bg-white p-4 rounded-xl border border-indigo-100">
                      <h5 className="text-xs font-bold text-slate-800">سلم معايير التقييم (Rubric Breakdown):</h5>
                      <div className="space-y-2">
                        {assignment.rubric.map((crit) => (
                          <div key={crit.id} className="flex items-center justify-between gap-4 text-xs py-1.5 border-b border-slate-100 last:border-0">
                            <div>
                              <p className="font-bold text-slate-800">{crit.titleArabic || crit.title}</p>
                              {crit.description && <p className="text-[11px] text-slate-400">{crit.description}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                max={crit.maxPoints}
                                value={rubricScores[crit.id] ?? 0}
                                onChange={(e) =>
                                  handleRubricScoreChange(crit.id, parseInt(e.target.value) || 0, crit.maxPoints)
                                }
                                className="w-20 px-2 py-1 text-center font-bold border border-slate-300 rounded-lg text-xs"
                              />
                              <span className="text-slate-500 font-semibold">/ {crit.maxPoints}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Total Score Field */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-800 mb-1">
                        الدرجة الإجمالية المرصودة <span className="text-rose-500">*</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max={assignment.maxScore}
                          value={score}
                          onChange={(e) => setScore(parseFloat(e.target.value) || 0)}
                          className="w-32 px-3 py-2 text-base font-extrabold border border-indigo-300 rounded-xl focus:ring-2 focus:ring-indigo-500 bg-white"
                        />
                        <span className="text-sm font-bold text-slate-600">من أصل {assignment.maxScore} درجة</span>
                      </div>
                    </div>

                    {selectedSubmission.isLate && assignment.latePenaltyPercentage > 0 && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                        <span className="font-bold">ملاحظة خصم التأخير: </span>
                        <span>
                          نسبة الخصم المقررة هي {assignment.latePenaltyPercentage}% (يمكنك تطبيقها يدوياً في الدرجة أعلاه).
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Student Feedback */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      الملاحظات والتوجيهات التعليمية للطالب (تظهر للطالب):
                    </label>
                    <textarea
                      rows={3}
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder="أحسنت في استخدام الروابط المنطقية، لكن احرص على مراجعة تصريف الأفعال الشاذة..."
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                    />
                  </div>

                  {/* Private Teacher Notes */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5 text-slate-500" />
                      <span>ملاحظات سرية للمعلم (خاصة فقط ولا تظهر للطالب أبداً):</span>
                    </label>
                    <textarea
                      rows={2}
                      value={privateNotes}
                      onChange={(e) => setPrivateNotes(e.target.value)}
                      placeholder="ملاحظات حول مستوى الطالب، تطور مهاراته، أو تنبيهات إدارية..."
                      className="w-full px-3 py-2 text-xs bg-amber-50/50 border border-amber-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                    />
                  </div>

                  {/* Status Banner */}
                  {statusMessage && (
                    <div
                      className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                        statusMessage.type === 'success'
                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                          : 'bg-rose-100 text-rose-900 border border-rose-200'
                      }`}
                    >
                      {statusMessage.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                      )}
                      <span>{statusMessage.text}</span>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <button
                      type="button"
                      disabled={savingGrade}
                      onClick={() => handleSaveGrade('return_for_revision')}
                      className="px-4 py-2 bg-amber-100 text-amber-900 hover:bg-amber-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>إعادة للطالب للمراجعة (طلب محاولة جديدة)</span>
                    </button>

                    <button
                      type="button"
                      disabled={savingGrade}
                      onClick={() => handleSaveGrade('grade')}
                      className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>اعتماد وحفظ الدرجة</span>
                    </button>
                  </div>
                </div>

                {/* AUDIT LOG: History of Grading Actions */}
                <div className="space-y-3 pt-4 border-t border-slate-200">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    <History className="w-4 h-4 text-slate-500" />
                    <span>سجل التدقيق والتعديل على التقييم (Audit Trail):</span>
                  </div>

                  {loadingHistory ? (
                    <p className="text-xs text-slate-400">جارٍ تحميل السجل...</p>
                  ) : history.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">لا توجد عمليات تدقيق مسجلة حتى الآن.</p>
                  ) : (
                    <div className="space-y-2">
                      {history.map((log) => (
                        <div
                          key={log.id}
                          className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800">{log.graderName}</span>
                            <span className="text-[11px] text-slate-400">
                              {formatAssignmentDateTime(log.createdAt)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-slate-600 text-[11px]">
                            <span>
                              النوع: {log.actionType === 'grade' ? 'رصد درجة' : log.actionType === 'return_for_revision' ? 'إعادة للمراجعة' : log.actionType}
                            </span>
                            <span>•</span>
                            <span>
                              الدرجة: {log.previousScore !== null ? `${log.previousScore} ➔ ` : ''}
                              <strong className="text-indigo-700">{log.newScore}</strong>
                            </span>
                            <span>•</span>
                            <span>
                              {log.isGradeReleased ? 'معلنة للطالب' : 'محجوبة مؤقتاً'}
                            </span>
                          </div>
                          {log.newFeedback && (
                            <p className="text-slate-500 text-[11px] italic bg-white p-2 rounded-lg border border-slate-100">
                              "{log.newFeedback}"
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
