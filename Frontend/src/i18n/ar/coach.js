/** Arabic strings for the coach area, keyed by the English source text. */
const AR = {
  // Status values (lower-case raw values shown as text)
  'active': 'نشط',
  'expired': 'منتهي',
  'frozen': 'مجمّد',
  'pending': 'قيد الانتظار',
  'interested': 'مهتم',
  'guest': 'زائر',
  'PT Status': 'حالة التدريب الشخصي',
  'Assign': 'إسناد',
  'transferred': 'محوّل',
  'not interested': 'غير مهتم',
  'all': 'الكل',

  // Check-in
  'Check-In': 'تسجيل الحضور',
  'Find Member': 'البحث عن عضو',
  'System ID, Member ID, or phone…': 'رقم النظام أو رقم العضو أو الهاتف…',
  'Accepts system ID, member ID, or phone number. Camera scan checks in a PT session.': 'يقبل رقم النظام أو رقم العضو أو رقم الهاتف. مسح الكاميرا يسجّل جلسة تدريب شخصي.',
  'No coach': 'بدون مدرب',
  'Number of Sessions': 'عدد الجلسات',
  'Number of sessions must be a positive whole number': 'يجب أن يكون عدد الجلسات عددًا صحيحًا موجبًا',
  'Check In {count} Session(s)': 'تسجيل حضور {count} جلسة',
  'Check In 1 Session': 'تسجيل حضور جلسة واحدة',
  'No sessions remaining': 'لا توجد جلسات متبقية',
  'Status: {status}': 'الحالة: {status}',
  "Today's PT Sessions": 'جلسات التدريب الشخصي اليوم',
  'No sessions checked today': 'لا توجد جلسات مسجّلة اليوم',
  'Check in a member using search or Open Camera': 'سجّل حضور عضو باستخدام البحث أو فتح الكاميرا',

  // Dashboard
  'Coach Dashboard': 'لوحة تحكم المدرب',
  'Failed to load data': 'تعذر تحميل البيانات',
  'My Members': 'أعضائي',
  'My Members ({count})': 'أعضائي ({count})',
  'View all': 'عرض الكل',
  'No members assigned': 'لا يوجد أعضاء مسندون',
  'Members will appear here once assigned': 'سيظهر الأعضاء هنا بعد إسنادهم',
  'Session Check-in': 'تسجيل حضور الجلسات',
  'Used Sessions': 'الجلسات المستخدمة',
  'Interested': 'مهتم',

  // Members
  'Transferred ({count})': 'محوّلون ({count})',
  'Interested ({count})': 'مهتمون ({count})',
  'No members match': 'لا يوجد أعضاء مطابقون',
  'Sessions': 'الجلسات',

  // Coach profile
  'Can request to be assigned to members': 'يمكنه طلب إسناد أعضاء إليه',
  'Can request to take over members from other coaches': 'يمكنه طلب تسلّم أعضاء من مدربين آخرين',
  'Coach Profile': 'ملف المدرب',
  'Control what {name} is allowed to do. Changes take effect immediately.': 'تحكّم فيما يُسمح لـ {name} بفعله. تُطبَّق التغييرات فورًا.',

  // Create coach account
  'Manage Coaches': 'إدارة المدربين',
  'Coach account created!': 'تم إنشاء حساب المدرب',
  'Choose whether this coach can view data for all branches or only selected ones.': 'حدد ما إذا كان بإمكان هذا المدرب عرض بيانات كل الفروع أو فروع محددة فقط.',

  // Coach team
  'Failed to load coach data': 'تعذر تحميل بيانات المدربين',
  'Total Coaches': 'إجمالي المدربين',
  'No coaches found': 'لم يتم العثور على مدربين',
  'PT Left': 'متبقي التدريب',
  '{used} / {total} ({pct}% used)': '{used} / {total} (استُخدم {pct}%)',

  // Coach transfer
  'Coach Transfer': 'تحويل المدربين',
  '— Choose coach —': '— اختر المدرب —',
  '— Select coach —': '— اختر المدرب —',
  '{count} member(s) selected': 'تم تحديد {count} عضو',
  'Assign Selected ({count})': 'إسناد المحدد ({count})',
  'All members ({count})': 'كل الأعضاء ({count})',
  'Filter members by coach': 'تصفية الأعضاء حسب المدرب',
  'Bulk assign coach': 'إسناد مدرب جماعيًا',
  'Bulk Assign:': 'إسناد جماعي:',
  'Bulk transfer failed': 'تعذر التحويل الجماعي',
  'Clear ({count})': 'مسح ({count})',
  'Switch': 'تبديل',
  'Prev': 'السابق',
  'Confirm': 'تأكيد',
  'Select a coach': 'اختر مدربًا',
  'Select Coach': 'اختر المدرب',
  'Selected first {count} member(s)': 'تم تحديد أول {count} عضو',
  'Selected last {count} member(s)': 'تم تحديد آخر {count} عضو',
  'Assigned {count} member(s) to coach': 'تم إسناد {count} عضو إلى المدرب',
  'Coach updated': 'تم تحديث المدرب',
  'Failed': 'فشلت العملية',
  'Sessions Left': 'الجلسات المتبقية',
  '{from}–{to} of {total}': '{from}–{to} من {total}',
  'Switch Coach — {name}': 'تبديل المدرب — {name}',
  'Assign Coach — {name}': 'إسناد مدرب — {name}',
  'Transfer from {name} to another coach.': 'تحويل من {name} إلى مدرب آخر.',
  'current coach': 'المدرب الحالي',
  'Assign a coach to this member.': 'أسند مدربًا لهذا العضو.',

  // Transfers
  "Today's Transfers": 'تحويلات اليوم',
  'Failed to load transfers': 'تعذر تحميل التحويلات',
  'All Coach Transfers Today ({count})': 'كل تحويلات المدربين اليوم ({count})',
  'Members Transferred to You Today ({count})': 'الأعضاء المحوّلون إليك اليوم ({count})',
  'No transfers today': 'لا توجد تحويلات اليوم',
  'All coach transfers for today will appear here': 'ستظهر هنا كل تحويلات المدربين لهذا اليوم',
  'Members assigned to you today will appear here': 'سيظهر هنا الأعضاء المسندون إليك اليوم',

  // Shared fragments
  'Coach: {name}': 'المدرب: {name}',
  'by {name}': 'بواسطة {name}',
  '{count} left': 'متبقي {count}',
  'Joined {date}': 'انضم في {date}',
};

export default AR;
