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
  },
};
