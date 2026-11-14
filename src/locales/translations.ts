/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Language = 'ar' | 'en';
export type Direction = 'rtl' | 'ltr';

export interface Translations {
  common: {
    brandName: string;
    brandNameSubtitle: string;
    teacherName: string;
    teacherTitle: string;
    loading: string;
    save: string;
    cancel: string;
    delete: string;
    edit: string;
    create: string;
    search: string;
    filter: string;
    all: string;
    active: string;
    inactive: string;
    suspended: string;
    status: string;
    actions: string;
    viewDetails: string;
    noDataFound: string;
    refresh: string;
    back: string;
    next: string;
    submit: string;
    close: string;
    logout: string;
    login: string;
    profile: string;
    timezoneNotice: string;
    saudiArabia: string;
  };
  auth: {
    title: string;
    subtitle: string;
    teacherLoginTab: string;
    studentLoginTab: string;
    emailLabel: string;
    emailPlaceholder: string;
    usernameLabel: string;
    usernamePlaceholder: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    signInButton: string;
    signingIn: string;
    studentNotice: string;
    teacherNotice: string;
    invalidCredentials: string;
    sessionExpired: string;
    unauthorizedTitle: string;
    unauthorizedMessage: string;
    returnToLogin: string;
  };
  navigation: {
    dashboard: string;
    students: string;
    groups: string;
    courses: string;
    lessons: string;
    videoLibrary: string;
    liveClasses: string;
    attendance: string;
    questionBank: string;
    quizzesExams: string;
    assignments: string;
    submissionsGrading: string;
    results: string;
    analytics: string;
    studentMessages: string;
    messageTeacher: string;
    notifications: string;
    settings: string;
    home: string;
    myCourses: string;
    myProfile: string;
  };
  teacherDashboard: {
    title: string;
    welcomeMessage: string;
    totalStudents: string;
    activeStudents: string;
    totalGroups: string;
    activeCourses: string;
    upcomingLiveClasses: string;
    pendingReviews: string;
    recentActivity: string;
    quickActions: string;
    newStudentAction: string;
    newGroupAction: string;
    newCourseAction: string;
    scheduleLiveAction: string;
    emptyMetricsTitle: string;
    emptyMetricsDesc: string;
    noUpcomingClasses: string;
    noPendingAssignments: string;
    noRecentActivity: string;
  };
  studentDashboard: {
    title: string;
    welcomeMessage: string;
    enrolledCourses: string;
    progressOverview: string;
    upcomingLiveClasses: string;
    pendingAssignments: string;
    recentResults: string;
    recentNotifications: string;
    noEnrolledCourses: string;
    noUpcomingClasses: string;
    noPendingAssignments: string;
    noRecentResults: string;
    continueLearning: string;
  };
  configError: {
    title: string;
    subtitle: string;
    explanation: string;
    step1Title: string;
    step1Desc: string;
    step2Title: string;
    step2Desc: string;
    step3Title: string;
    step3Desc: string;
    envVarsNeeded: string;
    retryButton: string;
  };
  students: {
    title: string;
    subtitle: string;
    registerStudent: string;
    editStudent: string;
    studentDetails: string;
    resetPassword: string;
    changeStatus: string;
    searchPlaceholder: string;
    allStatuses: string;
    allGroups: string;
    totalStudents: string;
    activeStudents: string;
    inactiveStudents: string;
    suspendedStudents: string;
    colStudent: string;
    colStudentNumber: string;
    colUsername: string;
    colGroup: string;
    colStatus: string;
    colEnrolledAt: string;
    colPhone: string;
    colActions: string;
    noStudentsFound: string;
    noStudentsSubtitle: string;
    tabPersonal: string;
    tabAcademic: string;
    tabGroups: string;
    tabActivity: string;
    formFullName: string;
    formFullNameArabic: string;
    formUsername: string;
    formPassword: string;
    formStudentNumber: string;
    formPhone: string;
    formPrimaryGroup: string;
    formNotes: string;
    formOptional: string;
    submitting: string;
    updating: string;
    statusChangeTitle: string;
    statusChangeDesc: string;
    statusChangeReason: string;
    resetPasswordTitle: string;
    resetPasswordDesc: string;
    newPasswordLabel: string;
    confirmPasswordLabel: string;
    passwordMismatch: string;
    passwordSuccess: string;
    statusSuccess: string;
    enrollSuccess: string;
    noGroupsAssigned: string;
    activityEmptyTitle: string;
    activityEmptyDesc: string;
  };
  groups: {
    title: string;
    subtitle: string;
    createGroup: string;
    editGroup: string;
    groupDetails: string;
    searchPlaceholder: string;
    allYears: string;
    allStatuses: string;
    totalGroups: string;
    activeGroups: string;
    totalEnrolled: string;
    avgCapacity: string;
    colGroupName: string;
    colAcademicYear: string;
    colCapacity: string;
    colStatus: string;
    colCreatedAt: string;
    colActions: string;
    noGroupsFound: string;
    noGroupsSubtitle: string;
    formNameEn: string;
    formNameAr: string;
    formYear: string;
    formMaxCapacity: string;
    formDescription: string;
    formIsActive: string;
    rosterTitle: string;
    assignedCoursesTitle: string;
    enrollStudentBtn: string;
    transferStudentBtn: string;
    removeFromGroupBtn: string;
    confirmRemoveTitle: string;
    confirmRemoveDesc: string;
    enrollModalTitle: string;
    selectStudentLabel: string;
    setAsPrimaryLabel: string;
    transferModalTitle: string;
    targetGroupLabel: string;
    noStudentsInGroup: string;
    noCoursesAssigned: string;
    capacityLimitReached: string;
    archiveGroup: string;
    restoreGroup: string;
    archived: string;
    archiveModalTitle: string;
    archiveModalSubtitle: string;
    archiveReasonLabel: string;
    archiveReasonPlaceholder: string;
    archiveWarning: string;
    archiveSuccess: string;
    restoreSuccess: string;
    archivedBadge: string;
    cannotArchiveInactive: string;
    cannotEnrollArchived: string;
  };
  courses: {
    title: string;
    subtitle: string;
    createCourse: string;
    editCourse: string;
    deleteCourse: string;
    deleteCourseConfirm: string;
    courseDetails: string;
    searchPlaceholder: string;
    allStatuses: string;
    published: string;
    draft: string;
    allLevels: string;
    beginner: string;
    intermediate: string;
    advanced: string;
    level: string;
    titleEn: string;
    titleAr: string;
    descEn: string;
    descAr: string;
    coverImageUrl: string;
    publishCourse: string;
    unpublishCourse: string;
    publishedStatus: string;
    draftStatus: string;
    totalCourses: string;
    units: string;
    lessons: string;
    assignedCohorts: string;
    noCoursesFound: string;
    noCoursesSubtitle: string;
    manageCurriculum: string;
    manageAssignments: string;
    courseSettings: string;
    addUnit: string;
    editUnit: string;
    deleteUnit: string;
    deleteUnitConfirm: string;
    unitTitleEn: string;
    unitTitleAr: string;
    moveUp: string;
    moveDown: string;
    addLesson: string;
    editLesson: string;
    deleteLesson: string;
    deleteLessonConfirm: string;
    lessonTitleEn: string;
    lessonTitleAr: string;
    lessonDescription: string;
    durationMinutes: string;
    videoUrl: string;
    videoUrlHelp: string;
    isPublishedLabel: string;
    resources: string;
    addResource: string;
    resourceTitle: string;
    resourceTitleAr: string;
    resourceFileUrl: string;
    deleteResource: string;
    downloadResource: string;
    noResources: string;
    assignToGroup: string;
    removeFromGroup: string;
    assignedGroupsTitle: string;
    noGroupsAssigned: string;
    noGroupsAssignedDesc: string;
    selectGroupToAssign: string;
    confirmRemoveGroup: string;
    enrolledStudentsCount: string;
    myCourses: string;
    myCoursesSubtitle: string;
    courseProgress: string;
    continueLearning: string;
    startLearning: string;
    completed: string;
    markCompleted: string;
    markIncomplete: string;
    nextLesson: string;
    previousLesson: string;
    backToCourse: string;
    backToCourses: string;
    videoPlayer: string;
    openInNewTab: string;
    noCoursesAssignedStudent: string;
    noCoursesAssignedStudentDesc: string;
    lessonCompletedSuccess: string;
  };
}

export const translations: Record<Language, Translations> = {
  ar: {
    common: {
      brandName: 'أكاديمية الوسام التعليمية',
      brandNameSubtitle: 'WESSAM Academy',
      teacherName: 'أ. وسام إبراهيم دراز',
      teacherTitle: 'المشرف العام ومعلم اللغة الإنجليزية',
      loading: 'جاري التحميل...',
      save: 'حفظ',
      cancel: 'إلغاء',
      delete: 'حذف',
      edit: 'تعديل',
      create: 'إنشاء جديد',
      search: 'بحث...',
      filter: 'تصفية',
      all: 'الكل',
      active: 'نشط',
      inactive: 'غير نشط',
      suspended: 'موقوف',
      status: 'الحالة',
      actions: 'الإجراءات',
      viewDetails: 'عرض التفاصيل',
      noDataFound: 'لا توجد بيانات متاحة حالياً',
      refresh: 'تحديث',
      back: 'رجوع',
      next: 'التالي',
      submit: 'إرسال',
      close: 'إغلاق',
      logout: 'تسجيل الخروج',
      login: 'تسجيل الدخول',
      profile: 'الملف الشخصي',
      timezoneNotice: 'توقيت مكة المكرمة (Asia/Riyadh)',
      saudiArabia: 'المملكة العربية السعودية',
    },
    auth: {
      title: 'بوابة أكاديمية الوسام التعليمية',
      subtitle: 'منصة تعليمية متكاملة لتعليم اللغة الإنجليزية تحت إشراف أ. وسام إبراهيم دراز',
      teacherLoginTab: 'دخول المعلم / الإدارة',
      studentLoginTab: 'دخول الطالب',
      emailLabel: 'البريد الإلكتروني للمعلم',
      emailPlaceholder: 'teacher@wessam-academy.edu.sa',
      usernameLabel: 'اسم المستخدم للطالب',
      usernamePlaceholder: 'اسم المستخدم المسجل في الأكاديمية',
      passwordLabel: 'كلمة المرور',
      passwordPlaceholder: '••••••••••••',
      signInButton: 'تسجيل الدخول',
      signingIn: 'جاري التحقق والاتصال...',
      studentNotice: 'يتم تسليم بيانات تسجيل دخول الطلاب مباشرة من خلال إدارة الأكاديمية أو الأستاذ وسام.',
      teacherNotice: 'بوابة الإدارة المعتمدة المخصصة لإدارة الدورات، الفصول المباشرة، الاختبارات والطلاب.',
      invalidCredentials: 'بيانات الدخول غير صحيحة أو الحساب غير مفعل.',
      sessionExpired: 'انتهت الجلسة الحالية، يرجى إعادة تسجيل الدخول.',
      unauthorizedTitle: 'غير مصرح بالدخول',
      unauthorizedMessage: 'ليس لديك الصلاحيات الكافية للوصول إلى هذه الصفحة أو المصدر المطلوب.',
      returnToLogin: 'العودة لصفحة تسجيل الدخول',
    },
    navigation: {
      dashboard: 'لوحة التحكم',
      students: 'الطلاب',
      groups: 'المجموعات الدراسية',
      courses: 'المقررات التعليمية',
      lessons: 'الدروس والوحدات',
      videoLibrary: 'مكتبة الفيديو',
      liveClasses: 'الحصص المباشرة',
      attendance: 'سجل الحضور',
      questionBank: 'بنك الأسئلة',
      quizzesExams: 'الاختبارات والتقييمات',
      assignments: 'الواجبات والتكاليف',
      submissionsGrading: 'التصحيح والتقييم',
      results: 'السجل الأكاديمي',
      analytics: 'مؤشرات الأداء',
      studentMessages: 'رسائل الطلاب',
      messageTeacher: 'مراسلة المدرس',
      notifications: 'الإشعارات',
      settings: 'إعدادات النظام',
      home: 'الرئيسية',
      myCourses: 'دوراتي التعليمية',
      myProfile: 'ملفي الشخصي',
    },
    teacherDashboard: {
      title: 'لوحة تحكم الأكاديمية',
      welcomeMessage: 'مرحباً بك أستاذ وسام إبراهيم دراز في المنصة التعليمية',
      totalStudents: 'إجمالي الطلاب',
      activeStudents: 'الطلاب المنتظمون',
      totalGroups: 'المجموعات الدراسية',
      activeCourses: 'الدورات الفعالة',
      upcomingLiveClasses: 'الحصص المباشرة القادمة',
      pendingReviews: 'واجبات قيد التصحيح',
      recentActivity: 'آخر النشاطات الأكاديمية',
      quickActions: 'إجراءات سريعة',
      newStudentAction: 'إضافة طالب جديد',
      newGroupAction: 'إنشاء مجموعة جديدة',
      newCourseAction: 'إضافة مقرر دراسي',
      scheduleLiveAction: 'جدولة حصة مباشرة',
      emptyMetricsTitle: 'قاعدة البيانات جاهزة للاستقبال',
      emptyMetricsDesc: 'لم يتم تسجيل بيانات أو مجموعات طلابية بعد. ستظهر الإحصائيات الحقيقية فور الربط وإدخال البيانات.',
      noUpcomingClasses: 'لا توجد حصص مباشرة مجدولة اليوم',
      noPendingAssignments: 'تم تصحيح كافة الواجبات المسلمة',
      noRecentActivity: 'سيبدأ سجل النشاطات الأكاديمية بالظهور فور تفاعل الطلاب',
    },
    studentDashboard: {
      title: 'بوابة الطالب الأكاديمية',
      welcomeMessage: 'أهلاً بك في مسيرتك لتعلم اللغة الإنجليزية مع أستاذ وسام',
      enrolledCourses: 'الدورات المسجل بها',
      progressOverview: 'نسبة الإنجاز العام',
      upcomingLiveClasses: 'الحصص المباشرة القادمة',
      pendingAssignments: 'الواجبات المطلوبة',
      recentResults: 'آخر نتائج التقييمات',
      recentNotifications: 'الإشعارات الأخيرة',
      noEnrolledCourses: 'لم يتم إدراجك في دورات تعليمية بعد، تواصل مع الأستاذ لتفعيل مجموعتك.',
      noUpcomingClasses: 'لا توجد حصص مباشرة مجدولة في الوقت الحالي.',
      noPendingAssignments: 'رائع! لا توجد تكاليف متأخرة أو واجبات معلقة.',
      noRecentResults: 'ستظهر درجاتك فور تصحيح الاختبارات والواجبات.',
      continueLearning: 'متابعة التعلم',
    },
    configError: {
      title: 'مطلوب إعداد الاتصال بقاعدة بيانات Supabase',
      subtitle: 'المنصة مبنية بمعايير أمان إنتاجية وتتطلب مفاتيح الوصول العامة المعتمدة لتشغيل الواجهة',
      explanation: 'تعمل منصة WESSAM Academy على خوادم PostgreSQL وقواعد بيانات Supabase المؤمنة بواسطة RLS. لتشغيل التطبيق والتحقق من الهويات، يجب توفير المتغيرات البيئية العامة للعميل.',
      step1Title: 'المتغير الأول: رابط المشروع (Project URL)',
      step1Desc: 'VITE_SUPABASE_URL — الرابط الخاص بمشروع Supabase الخاص بك.',
      step2Title: 'المتغير الثاني: المفتاح العام للمشروع (Anon / Publishable Key)',
      step2Desc: 'VITE_SUPABASE_PUBLISHABLE_KEY — مفتاح الوصول العام للعميل المصرح بالقراءة والكتابة المقيدة بسياسات RLS. (تنبيه أمني: مفاتيح الخدمة السرية SUPABASE_SECRET_KEY تُحفظ فقط في إعدادات Edge Functions بالسيرفر ولا تُوضع هنا).',
      step3Title: 'التأكد من تشغيل المشروع',
      step3Desc: 'بعد ضبط المتغيرين في ملف .env أو إعدادات النشر، انقر فوق زر إعادة التحقق للاتصال المباشر.',
      envVarsNeeded: 'المتغيرات البيئية المطلوبة للواجهة الأمامية',
      retryButton: 'إعادة محاولة الاتصال والتحقق',
    },
    students: {
      title: 'إدارة شؤون الطلاب',
      subtitle: 'سجلات الطلاب، بيانات الحسابات، وتوزيع المجموعات الأكاديمية',
      registerStudent: 'تسجيل طالب جديد',
      editStudent: 'تعديل بيانات الطالب',
      studentDetails: 'الملف الأكاديمي للطالب',
      resetPassword: 'إعادة ضبط كلمة المرور',
      changeStatus: 'تغيير حالة الحساب',
      searchPlaceholder: 'البحث بالاسم، اسم المستخدم، أو الرقم الأكاديمي...',
      allStatuses: 'جميع الحالات',
      allGroups: 'جميع المجموعات',
      totalStudents: 'إجمالي الطلاب',
      activeStudents: 'الطلاب النشطون',
      inactiveStudents: 'الطلاب غير النشطين',
      suspendedStudents: 'الطلاب الموقوفون',
      colStudent: 'اسم الطالب',
      colStudentNumber: 'الرقم الأكاديمي',
      colUsername: 'اسم المستخدم',
      colGroup: 'المجموعة الأساسية',
      colStatus: 'الحالة',
      colEnrolledAt: 'تاريخ الالتحاق',
      colPhone: 'رقم الهاتف',
      colActions: 'الإجراءات',
      noStudentsFound: 'لا يوجد طلاب مطابقون لمعايير البحث',
      noStudentsSubtitle: 'ابدأ بتسجيل طلاب جدد في الأكاديمية لإنشاء سجلاتهم وتوزيعهم على المجموعات.',
      tabPersonal: 'البيانات الشخصية',
      tabAcademic: 'البيانات الأكاديمية',
      tabGroups: 'المجموعات الدراسية',
      tabActivity: 'النشاط الأكاديمي',
      formFullName: 'الاسم الكامل (بالإنجليزية)',
      formFullNameArabic: 'الاسم الكامل (بالعربية)',
      formUsername: 'اسم المستخدم للولوج',
      formPassword: 'كلمة المرور الأولية',
      formStudentNumber: 'الرقم الأكاديمي (اختياري)',
      formPhone: 'رقم الهاتف / الواتساب (اختياري)',
      formPrimaryGroup: 'المجموعة الدراسية الأساسية',
      formNotes: 'ملاحظات إدارية وأكاديمية',
      formOptional: 'اختياري',
      submitting: 'جاري إنشاء الحساب الآمن...',
      updating: 'جاري الحفظ والتحقق...',
      statusChangeTitle: 'تأكيد تغيير حالة حساب الطالب',
      statusChangeDesc: 'سيتم تطبيق الحالة فوراً على جلسات الطالب وقواعد بيانات الأكاديمية.',
      statusChangeReason: 'سبب التغيير (اختياري للتوثيق في سجل العمليات):',
      resetPasswordTitle: 'إعادة ضبط كلمة مرور الطالب بأمان',
      resetPasswordDesc: 'يتم تشفير كلمة المرور وتحديثها مباشرة عبر خادم الأكاديمية الآمن.',
      newPasswordLabel: 'كلمة المرور الجديدة (8 أحرف على الأقل)',
      confirmPasswordLabel: 'تأكيد كلمة المرور الجديدة',
      passwordMismatch: 'كلمتا المرور غير متطابقتين',
      passwordSuccess: 'تم تحديث كلمة مرور الطالب بنجاح',
      statusSuccess: 'تم تحديث حالة حساب الطالب بنجاح',
      enrollSuccess: 'تم تسجيل الطالب في المجموعة بنجاح',
      noGroupsAssigned: 'الطالب غير مسجل في أي مجموعة دراسية حالياً.',
      activityEmptyTitle: 'السجل الأكاديمي قيد المزامنة',
      activityEmptyDesc: 'ستظهر هنا الاختبارات المكتملة، التكاليف المصححة، وسجلات الحضور فور بدئها في المراحل القادمة.',
    },
    groups: {
      title: 'إدارة المجموعات الدراسية',
      subtitle: 'تنظيم الفصول، متابعة الطاقة الاستيعابية، وتوزيع المقررات',
      createGroup: 'إنشاء مجموعة جديدة',
      editGroup: 'تعديل بيانات المجموعة',
      groupDetails: 'تفاصيل المجموعة والطلاب',
      searchPlaceholder: 'البحث باسم المجموعة أو العام الدراسي...',
      allYears: 'جميع الأعوام الدراسية',
      allStatuses: 'جميع الحالات',
      totalGroups: 'إجمالي المجموعات',
      activeGroups: 'المجموعات النشطة',
      totalEnrolled: 'إجمالي المقيدين',
      avgCapacity: 'متوسط الإشغال',
      colGroupName: 'اسم المجموعة',
      colAcademicYear: 'العام الدراسي',
      colCapacity: 'الإشغال والقدرة',
      colStatus: 'الحالة',
      colCreatedAt: 'تاريخ الإنشاء',
      colActions: 'الإجراءات',
      noGroupsFound: 'لا توجد مجموعات مطابقة لمعايير البحث',
      noGroupsSubtitle: 'أنشئ أول مجموعة دراسية للبدء في تنظيم الفصول الدراسية وتسكين الطلاب.',
      formNameEn: 'اسم المجموعة (بالإنجليزية)',
      formNameAr: 'اسم المجموعة (بالعربية)',
      formYear: 'العام الدراسي',
      formMaxCapacity: 'الحد الأقصى للطلاب',
      formDescription: 'وصف المجموعة والأهداف',
      formIsActive: 'المجموعة نشطة وجاهزة للتسكين',
      rosterTitle: 'قائمة الطلاب المقيدين في المجموعة',
      assignedCoursesTitle: 'المقررات الدراسية المخصصة للمجموعة',
      enrollStudentBtn: 'إضافة طالب إلى المجموعة',
      transferStudentBtn: 'نقل إلى مجموعة أخرى',
      removeFromGroupBtn: 'إلغاء قيد الطالب من المجموعة',
      confirmRemoveTitle: 'تأكيد إلغاء القيد من المجموعة',
      confirmRemoveDesc: 'سيتم إزالة الطالب من هذه المجموعة فقط دون المساس بحسابه أو سجلاته الأكاديمية السابقة.',
      enrollModalTitle: 'تسكين طالب في هذه المجموعة',
      selectStudentLabel: 'اختر الطالب للتسكين',
      setAsPrimaryLabel: 'تعيين هذه المجموعة كمجموعة أساسية للطالب',
      transferModalTitle: 'نقل الطالب إلى مجموعة أخرى',
      targetGroupLabel: 'المجموعة الدراسية الوجهة',
      noStudentsInGroup: 'لا يوجد طلاب مسجلون في هذه المجموعة حالياً.',
      noCoursesAssigned: 'لم يتم ربط مقررات دراسية بهذه المجموعة بعد.',
      capacityLimitReached: 'تم بلوغ الحد الأقصى للطاقة الاستيعابية لهذه المجموعة.',
      archiveGroup: 'أرشفة المجموعة الدراسية',
      restoreGroup: 'استعادة المجموعة المؤرشفة',
      archived: 'المؤرشفة',
      archiveModalTitle: 'تأكيد أرشفة المجموعة الدراسية بأمان',
      archiveModalSubtitle: 'الأرشفة الآمنة تحافظ على سجلات الطلاب والجلسات والتكاليف دون حذف أي بيانات',
      archiveReasonLabel: 'سبب الأرشفة (مطلوب للتوثيق الإداري)',
      archiveReasonPlaceholder: 'اكتب سبب أرشفة المجموعة (مثال: انتهاء الفصل الدراسي، دمج الفصول)...',
      archiveWarning: 'تنبيه: أرشفة المجموعة ستمنع تسكين طلاب جدد فيها أو النقل إليها. تظل جميع سجلات الحضور والتكاليف والجلسات المباشرة محفوظة بالكامل ويمكن استعادتها لاحقاً.',
      archiveSuccess: 'تمت أرشفة المجموعة الدراسية بنجاح مع الحفاظ على كافة السجلات',
      restoreSuccess: 'تمت استعادة المجموعة الدراسية بنجاح وأصبحت نشطة مجدداً',
      archivedBadge: 'مؤرشفة',
      cannotArchiveInactive: 'لا يمكن أرشفة مجموعة غير نشطة. يجب أن تكون المجموعة نشطة أولاً.',
      cannotEnrollArchived: 'لا يمكن تسكين طلاب في مجموعة مؤرشفة.',
    },
    courses: {
      title: 'إدارة المقررات والمناهج الدراسية',
      subtitle: 'تصميم وبناء مناهج اللغة الإنجليزية، تنظيم الوحدات والدروس، وتوزيعها على المجموعات الدراسية',
      createCourse: 'إنشاء مقرر دراسي جديد',
      editCourse: 'تعديل بيانات المقرر',
      deleteCourse: 'حذف المقرر',
      deleteCourseConfirm: 'هل أنت متأكد من حذف هذا المقرر الدراسي؟ سيؤدي ذلك لحذف وحداته ودروسه التابعة.',
      courseDetails: 'تفاصيل المقرر ومساحة العمل',
      searchPlaceholder: 'البحث باسم المقرر أو الوصف...',
      allStatuses: 'كافة الحالات',
      published: 'منشور',
      draft: 'مسودة',
      allLevels: 'كافة المستويات',
      beginner: 'مبتدئ (Beginner / A1-A2)',
      intermediate: 'متوسط (Intermediate / B1-B2)',
      advanced: 'متقدم (Advanced / C1-C2)',
      level: 'المستوى التعليمي',
      titleEn: 'اسم المقرر بالإنجليزية',
      titleAr: 'اسم المقرر بالعربية',
      descEn: 'وصف المقرر بالإنجليزية',
      descAr: 'وصف المقرر بالعربية',
      coverImageUrl: 'رابط صورة الغلاف (اختياري)',
      publishCourse: 'نشر المقرر للطلاب',
      unpublishCourse: 'تحويل المقرر إلى مسودة',
      publishedStatus: 'منشور ومتاح للمجموعات',
      draftStatus: 'مسودة قيد الإعداد',
      totalCourses: 'إجمالي المقررات',
      units: 'الوحدات الدراسية',
      lessons: 'الدروس والشروحات',
      assignedCohorts: 'المجموعات المسند إليها',
      noCoursesFound: 'لم يتم العثور على أي مقررات دراسية',
      noCoursesSubtitle: 'يمكنك البدء بإنشاء أول مقرر دراسي وإضافة وحدات الدروس لطلاب الأكاديمية.',
      manageCurriculum: 'بناء المنهج والوحدات',
      manageAssignments: 'تسكين المجموعات الدراسية',
      courseSettings: 'بيانات وإعدادات المقرر',
      addUnit: 'إضافة وحدة دراسية جديدة',
      editUnit: 'تعديل اسم الوحدة',
      deleteUnit: 'حذف الوحدة',
      deleteUnitConfirm: 'هل أنت متأكد من حذف هذه الوحدة الدراسية وكافة الدروس المندرجة تحتها؟',
      unitTitleEn: 'عنوان الوحدة بالإنجليزية',
      unitTitleAr: 'عنوان الوحدة بالعربية',
      moveUp: 'تحريك لأعلى',
      moveDown: 'تحريك لأسفل',
      addLesson: 'إضافة درس جديد',
      editLesson: 'تعديل بيانات الدرس',
      deleteLesson: 'حذف الدرس',
      deleteLessonConfirm: 'هل أنت متأكد من حذف هذا الدرس وملفاته المرفقة؟',
      lessonTitleEn: 'عنوان الدرس بالإنجليزية',
      lessonTitleAr: 'عنوان الدرس بالعربية',
      lessonDescription: 'وصف وشرح الدرس',
      durationMinutes: 'المدة المقدرة (بالدقائق)',
      videoUrl: 'رابط الفيديو التعليمي (YouTube أو Vimeo)',
      videoUrlHelp: 'يدعم روابط يوتيوب وفيميو الآمنة HTTPS فقط لتشغيلها بسلاسة داخل المشغل الآمن.',
      isPublishedLabel: 'نشر الدرس للطلاب المسجلين',
      resources: 'المذكرات والملفات المرفقة',
      addResource: 'إرفاق ملف تعليمي جديد',
      resourceTitle: 'اسم المرفق بالإنجليزية',
      resourceTitleAr: 'اسم المرفق بالعربية',
      resourceFileUrl: 'رابط تحميل الملف (HTTPS)',
      deleteResource: 'حذف المرفق',
      downloadResource: 'تحميل المذكرة',
      noResources: 'لا توجد مذكرات أو ملفات مرفقة لهذا الدرس بعد.',
      assignToGroup: 'إسناد المقرر لمجموعة دراسية',
      removeFromGroup: 'إلغاء إسناد المقرر',
      assignedGroupsTitle: 'المجموعات الدراسية المسند إليها هذا المقرر',
      noGroupsAssigned: 'لم يتم إسناد هذا المقرر إلى أي مجموعة دراسية بعد.',
      noGroupsAssignedDesc: 'اختر مجموعة دراسية من القائمة لإتاحة محتوى المنهج لطلابها فوراً.',
      selectGroupToAssign: 'اختر المجموعة الدراسية للإسناد',
      confirmRemoveGroup: 'هل أنت متأكد من إلغاء إسناد المقرر لهذه المجموعة الدراسية؟',
      enrolledStudentsCount: 'طالب ملتحق',
      myCourses: 'مقرراتي الدراسية',
      myCoursesSubtitle: 'استعرض المناهج المعتمدة لمجموعتك وتابع تقدمك التعليمي مع الأستاذ وسام',
      courseProgress: 'نسبة الإنجاز',
      continueLearning: 'متابعة التعلم',
      startLearning: 'بدء دراسة المقرر',
      completed: 'مكتمل',
      markCompleted: 'تحديد كدرس مكتمل',
      markIncomplete: 'إلغاء تحديد الاكتمال',
      nextLesson: 'الدرس التالي',
      previousLesson: 'الدرس السابق',
      backToCourse: 'العودة للمقرر',
      backToCourses: 'العودة لقائمة المقررات',
      videoPlayer: 'المشغل التعليمي',
      openInNewTab: 'فتح في نافذة جديدة',
      noCoursesAssignedStudent: 'لا توجد مقررات دراسية متاحة حالياً',
      noCoursesAssignedStudentDesc: 'سيقوم الأستاذ وسام بإسناد المناهج الدراسية لمجموعتك فور بدء الخطة التدريبية.',
      lessonCompletedSuccess: 'أحسنت! تم توثيق إنجازك لهذا الدرس بنجاح في سجلك الأكاديمي.',
    },
  },
  en: {
    common: {
      brandName: 'WESSAM Academy',
      brandNameSubtitle: 'أكاديمية الوسام التعليمية',
      teacherName: 'Mr. Wessam Ibrahim Draz',
      teacherTitle: 'Head Academic Director & English Educator',
      loading: 'Loading...',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      create: 'Create New',
      search: 'Search...',
      filter: 'Filter',
      all: 'All',
      active: 'Active',
      inactive: 'Inactive',
      suspended: 'Suspended',
      status: 'Status',
      actions: 'Actions',
      viewDetails: 'View Details',
      noDataFound: 'No records currently available',
      refresh: 'Refresh',
      back: 'Back',
      next: 'Next',
      submit: 'Submit',
      close: 'Close',
      logout: 'Sign Out',
      login: 'Sign In',
      profile: 'Profile',
      timezoneNotice: 'Makkah Time (Asia/Riyadh)',
      saudiArabia: 'Saudi Arabia',
    },
    auth: {
      title: 'WESSAM Academy Learning Portal',
      subtitle: 'Integrated English learning platform led by Mr. Wessam Ibrahim Draz',
      teacherLoginTab: 'Teacher / Admin Access',
      studentLoginTab: 'Student Access',
      emailLabel: 'Teacher Email Address',
      emailPlaceholder: 'teacher@wessam-academy.edu.sa',
      usernameLabel: 'Student Username',
      usernamePlaceholder: 'Registered academy username',
      passwordLabel: 'Password',
      passwordPlaceholder: '••••••••••••',
      signInButton: 'Sign In',
      signingIn: 'Authenticating & Connecting...',
      studentNotice: 'Student login credentials are provided directly by WESSAM Academy administration.',
      teacherNotice: 'Official teacher administration portal for managing courses, live sessions, exams, and students.',
      invalidCredentials: 'The entered credentials are incorrect or the account is inactive.',
      sessionExpired: 'Your session has expired. Please sign in again.',
      unauthorizedTitle: 'Access Unauthorized',
      unauthorizedMessage: 'You do not have the required permissions to view this resource.',
      returnToLogin: 'Back to Sign In',
    },
    navigation: {
      dashboard: 'Dashboard',
      students: 'Students',
      groups: 'Student Groups',
      courses: 'Courses',
      lessons: 'Lessons & Units',
      videoLibrary: 'Video Library',
      liveClasses: 'Live Classes',
      attendance: 'Attendance',
      questionBank: 'Question Bank',
      quizzesExams: 'Quizzes & Exams',
      assignments: 'Assignments',
      submissionsGrading: 'Submissions & Grading',
      results: 'Academic Results',
      analytics: 'Analytics',
      studentMessages: 'Student Messages',
      messageTeacher: 'Message Teacher',
      notifications: 'Notifications',
      settings: 'Settings',
      home: 'Home',
      myCourses: 'My Courses',
      myProfile: 'My Profile',
    },
    teacherDashboard: {
      title: 'Academy Management Dashboard',
      welcomeMessage: 'Welcome Mr. Wessam Ibrahim Draz to your learning management console',
      totalStudents: 'Total Students',
      activeStudents: 'Active Students',
      totalGroups: 'Academic Groups',
      activeCourses: 'Active Courses',
      upcomingLiveClasses: 'Upcoming Live Classes',
      pendingReviews: 'Pending Assignment Reviews',
      recentActivity: 'Recent Academic Activity',
      quickActions: 'Quick Actions',
      newStudentAction: 'Register Student',
      newGroupAction: 'Create Group',
      newCourseAction: 'Add Course',
      scheduleLiveAction: 'Schedule Live Class',
      emptyMetricsTitle: 'Database Ready for Intake',
      emptyMetricsDesc: 'No students or academic groups have been registered yet. Live database statistics will display upon record creation.',
      noUpcomingClasses: 'No live sessions scheduled for today',
      noPendingAssignments: 'All submitted assignments have been evaluated',
      noRecentActivity: 'Student academic event logs will appear as activities commence',
    },
    studentDashboard: {
      title: 'Student Learning Portal',
      welcomeMessage: 'Welcome to your English learning journey with Mr. Wessam',
      enrolledCourses: 'Enrolled Courses',
      progressOverview: 'Overall Progress',
      upcomingLiveClasses: 'Upcoming Live Classes',
      pendingAssignments: 'Pending Assignments',
      recentResults: 'Recent Assessment Results',
      recentNotifications: 'Recent Notifications',
      noEnrolledCourses: 'You are not currently enrolled in any courses. Contact your teacher to confirm your group enrollment.',
      noUpcomingClasses: 'No upcoming live sessions scheduled at this time.',
      noPendingAssignments: 'All caught up! No pending assignments.',
      noRecentResults: 'Your grades and feedback will appear here once reviewed.',
      continueLearning: 'Continue Learning',
    },
    configError: {
      title: 'Supabase Database Configuration Required',
      subtitle: 'The platform enforces strict enterprise security and requires authentic project connection keys',
      explanation: 'WESSAM Academy is architected on PostgreSQL with Supabase Row Level Security (RLS). To authenticate identities and access data, please configure the required frontend environment variables.',
      step1Title: 'First Variable: Project URL',
      step1Desc: 'VITE_SUPABASE_URL — The URL for your Supabase project instance.',
      step2Title: 'Second Variable: Anon / Publishable Key',
      step2Desc: 'VITE_SUPABASE_PUBLISHABLE_KEY — Client API key governed by Row Level Security. (Security Notice: Backend secret keys belong strictly in Supabase Edge Functions secrets and must NEVER be placed in frontend environment files).',
      step3Title: 'Environment Verification',
      step3Desc: 'After configuring the two client variables in your .env file or deployment settings, click Verify Connection.',
      envVarsNeeded: 'Required Frontend Environment Variables',
      retryButton: 'Verify Connection & Reload',
    },
    students: {
      title: 'Student Directory & Management',
      subtitle: 'Student records, secure account credentials, and academic group cohorts',
      registerStudent: 'Register New Student',
      editStudent: 'Edit Student Details',
      studentDetails: 'Student Academic Profile',
      resetPassword: 'Reset Password',
      changeStatus: 'Change Account Status',
      searchPlaceholder: 'Search by student name, username, or student number...',
      allStatuses: 'All Statuses',
      allGroups: 'All Groups',
      totalStudents: 'Total Students',
      activeStudents: 'Active Students',
      inactiveStudents: 'Inactive Students',
      suspendedStudents: 'Suspended Students',
      colStudent: 'Student Name',
      colStudentNumber: 'Student ID',
      colUsername: 'Username',
      colGroup: 'Primary Group',
      colStatus: 'Status',
      colEnrolledAt: 'Enrolled Date',
      colPhone: 'Phone',
      colActions: 'Actions',
      noStudentsFound: 'No students matching the criteria found',
      noStudentsSubtitle: 'Begin by registering new academy students to populate cohorts and transcripts.',
      tabPersonal: 'Personal Info',
      tabAcademic: 'Academic Info',
      tabGroups: 'Group Memberships',
      tabActivity: 'Academic Activity',
      formFullName: 'Full Name (English)',
      formFullNameArabic: 'Full Name (Arabic)',
      formUsername: 'Login Username',
      formPassword: 'Initial Password',
      formStudentNumber: 'Student Number (Optional)',
      formPhone: 'Phone / WhatsApp (Optional)',
      formPrimaryGroup: 'Primary Academic Group',
      formNotes: 'Administrative & Academic Notes',
      formOptional: 'Optional',
      submitting: 'Provisioning secure identity...',
      updating: 'Saving and validating...',
      statusChangeTitle: 'Confirm Account Status Change',
      statusChangeDesc: 'Status modifications are applied immediately to student sessions and database access.',
      statusChangeReason: 'Reason for status update (logged in audit trail):',
      resetPasswordTitle: 'Secure Student Password Reset',
      resetPasswordDesc: 'Passwords are encrypted and updated directly through the academy server engine.',
      newPasswordLabel: 'New Password (Min 8 characters)',
      confirmPasswordLabel: 'Confirm New Password',
      passwordMismatch: 'Passwords do not match',
      passwordSuccess: 'Student password successfully updated',
      statusSuccess: 'Student account status successfully updated',
      enrollSuccess: 'Student successfully enrolled into group',
      noGroupsAssigned: 'Student is not currently enrolled in any academic groups.',
      activityEmptyTitle: 'Academic Transcript Syncing',
      activityEmptyDesc: 'Completed quizzes, evaluated submissions, and live attendance records will appear here as coursework begins.',
    },
    groups: {
      title: 'Academic Group Management',
      subtitle: 'Cohort management, capacity monitoring, and course assignments',
      createGroup: 'Create New Group',
      editGroup: 'Edit Group Information',
      groupDetails: 'Group Details & Roster',
      searchPlaceholder: 'Search by group name or academic year...',
      allYears: 'All Academic Years',
      allStatuses: 'All Statuses',
      totalGroups: 'Total Groups',
      activeGroups: 'Active Groups',
      totalEnrolled: 'Total Enrolled',
      avgCapacity: 'Average Utilization',
      colGroupName: 'Group Name',
      colAcademicYear: 'Academic Year',
      colCapacity: 'Capacity & Enrollment',
      colStatus: 'Status',
      colCreatedAt: 'Created At',
      colActions: 'Actions',
      noGroupsFound: 'No academic groups found matching query',
      noGroupsSubtitle: 'Create your first academic group to begin cohort organization and student enrollment.',
      formNameEn: 'Group Name (English)',
      formNameAr: 'Group Name (Arabic)',
      formYear: 'Academic Year',
      formMaxCapacity: 'Maximum Student Capacity',
      formDescription: 'Description & Learning Objectives',
      formIsActive: 'Group is active and open for enrollment',
      rosterTitle: 'Enrolled Student Roster',
      assignedCoursesTitle: 'Assigned Curriculum & Courses',
      enrollStudentBtn: 'Enroll Student into Group',
      transferStudentBtn: 'Transfer Student to Another Group',
      removeFromGroupBtn: 'Remove Student from Group',
      confirmRemoveTitle: 'Confirm Removal from Group',
      confirmRemoveDesc: 'The student will only be removed from this specific group. Their academy account and historical records are preserved.',
      enrollModalTitle: 'Enroll Student in this Group',
      selectStudentLabel: 'Select Student to Enroll',
      setAsPrimaryLabel: 'Set this group as the student primary group',
      transferModalTitle: 'Transfer Student between Groups',
      targetGroupLabel: 'Destination Academic Group',
      noStudentsInGroup: 'No students are currently enrolled in this group.',
      noCoursesAssigned: 'No courses have been linked to this group yet.',
      capacityLimitReached: 'This group has reached its maximum student capacity.',
      archiveGroup: 'Archive Academic Group',
      restoreGroup: 'Restore Archived Group',
      archived: 'Archived',
      archiveModalTitle: 'Confirm Safe Group Archiving',
      archiveModalSubtitle: 'Soft archiving preserves all historical student records, attendance, and assignments without deletion',
      archiveReasonLabel: 'Archive Reason (Required for administrative audit)',
      archiveReasonPlaceholder: 'State reason for archiving (e.g. term completion, cohort merge)...',
      archiveWarning: 'Notice: Archiving this group will prevent new student enrollments and transfers in. All student attendance records, assignments, and live sessions are fully preserved and the group can be restored anytime.',
      archiveSuccess: 'Group successfully archived with all historical records preserved',
      restoreSuccess: 'Group successfully restored and reactivated for coursework',
      archivedBadge: 'Archived',
      cannotArchiveInactive: 'Cannot archive an inactive group. The group must be active before archiving.',
      cannotEnrollArchived: 'Cannot enroll students into an archived group.',
    },
    courses: {
      title: 'Courses & Curriculum Management',
      subtitle: 'Design English curricula, organize structured units and lessons, and assign them to student groups',
      createCourse: 'Create New Course',
      editCourse: 'Edit Course Details',
      deleteCourse: 'Delete Course',
      deleteCourseConfirm: 'Are you sure you want to delete this course? All associated units and lessons will be removed.',
      courseDetails: 'Course Details & Workspace',
      searchPlaceholder: 'Search by course title or description...',
      allStatuses: 'All Statuses',
      published: 'Published',
      draft: 'Draft',
      allLevels: 'All Levels',
      beginner: 'Beginner (A1-A2)',
      intermediate: 'Intermediate (B1-B2)',
      advanced: 'Advanced (C1-C2)',
      level: 'Proficiency Level',
      titleEn: 'Course Title (English)',
      titleAr: 'Course Title (Arabic)',
      descEn: 'Description (English)',
      descAr: 'Description (Arabic)',
      coverImageUrl: 'Cover Image URL (Optional)',
      publishCourse: 'Publish to Students',
      unpublishCourse: 'Revert to Draft',
      publishedStatus: 'Published & Active',
      draftStatus: 'Draft in Progress',
      totalCourses: 'Total Courses',
      units: 'Units',
      lessons: 'Lessons',
      assignedCohorts: 'Assigned Groups',
      noCoursesFound: 'No courses found',
      noCoursesSubtitle: 'Start by creating your first English course and adding curriculum units.',
      manageCurriculum: 'Curriculum & Units',
      manageAssignments: 'Group Assignments',
      courseSettings: 'Course Settings',
      addUnit: 'Add New Unit',
      editUnit: 'Edit Unit Title',
      deleteUnit: 'Delete Unit',
      deleteUnitConfirm: 'Are you sure you want to delete this unit and all of its lessons?',
      unitTitleEn: 'Unit Title (English)',
      unitTitleAr: 'Unit Title (Arabic)',
      moveUp: 'Move Up',
      moveDown: 'Move Down',
      addLesson: 'Add New Lesson',
      editLesson: 'Edit Lesson Details',
      deleteLesson: 'Delete Lesson',
      deleteLessonConfirm: 'Are you sure you want to delete this lesson and its attached resources?',
      lessonTitleEn: 'Lesson Title (English)',
      lessonTitleAr: 'Lesson Title (Arabic)',
      lessonDescription: 'Lesson Outline & Description',
      durationMinutes: 'Estimated Duration (Minutes)',
      videoUrl: 'Video Lecture URL (YouTube or Vimeo)',
      videoUrlHelp: 'Supports secure HTTPS YouTube and Vimeo links for safe embedded playback.',
      isPublishedLabel: 'Publish Lesson for Students',
      resources: 'Handouts & Lesson Files',
      addResource: 'Attach Learning File',
      resourceTitle: 'Resource Title (English)',
      resourceTitleAr: 'Resource Title (Arabic)',
      resourceFileUrl: 'Downloadable File URL (HTTPS)',
      deleteResource: 'Remove File',
      downloadResource: 'Download Handout',
      noResources: 'No attached worksheets or files for this lesson yet.',
      assignToGroup: 'Assign Course to Group',
      removeFromGroup: 'Remove Assignment',
      assignedGroupsTitle: 'Student Groups Assigned to this Course',
      noGroupsAssigned: 'This course has not been assigned to any student group yet.',
      noGroupsAssignedDesc: 'Select an active group below to grant its enrolled students instant access.',
      selectGroupToAssign: 'Select Academic Group to Assign',
      confirmRemoveGroup: 'Are you sure you want to remove this course from the selected group?',
      enrolledStudentsCount: 'Enrolled Students',
      myCourses: 'My Courses',
      myCoursesSubtitle: 'Explore approved English curricula for your group and track your learning progress',
      courseProgress: 'Course Progress',
      continueLearning: 'Continue Learning',
      startLearning: 'Start Course',
      completed: 'Completed',
      markCompleted: 'Mark as Completed',
      markIncomplete: 'Mark as Incomplete',
      nextLesson: 'Next Lesson',
      previousLesson: 'Previous Lesson',
      backToCourse: 'Back to Course',
      backToCourses: 'Back to All Courses',
      videoPlayer: 'Lesson Player',
      openInNewTab: 'Open in New Window',
      noCoursesAssignedStudent: 'No courses currently available',
      noCoursesAssignedStudentDesc: 'Your teacher will assign learning tracks to your cohort soon.',
      lessonCompletedSuccess: 'Well done! Lesson completion recorded in your academic record.',
    },
  },
};
