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
    },
  },
};
