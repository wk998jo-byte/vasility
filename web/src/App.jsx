import React, { useState, useEffect, useRef } from 'react';
import { countSlaBreached } from './sla';
import { Scanner } from '@yudiel/react-qr-scanner';
import {
  Check, QrCode, Search, LayoutGrid, LogOut, Trash2, RotateCcw,
  X, Plus, Printer, Moon, Sun, Globe, ArrowRight, RefreshCw, Pencil, Users,
  Bell,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';

const API_BASE = (import.meta.env.DEV && window.location.port === '5173')
  ? 'http://localhost:8080/api'
  : '/api';

function parseIssuesResponse(data) {
  const list = Array.isArray(data) ? data : (data.issues || data.tickets || []);
  return list.map((item) => item.payload || item);
}

async function resolveQrToken(token) {
  const res = await fetch(`${API_BASE}/rooms/resolve?token=${encodeURIComponent(token)}`);
  if (!res.ok) return null;
  return res.json();
}

function extractTokenFromScan(scannedText) {
  try {
    const url = new URL(scannedText);
    const token = url.searchParams.get('token');
    if (token) return token.trim();
  } catch {
    /* raw token string */
  }
  return scannedText.trim();
}

function decodeJwtPayload(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(atob(base64).split('').map((c) => `%${(`00${c.charCodeAt(0).toString(16)}`).slice(-2)}`).join('')));
  } catch {
    return null;
  }
}

const BrandLogo = ({ className = 'h-10 w-auto object-contain', alt = 'Bin Quraya' }) => (
  <img src="/logo.png" alt={alt} className={className} />
);

const ISSUES = ['Broken / Not Working', 'Leaking', 'Electrical Issue', 'Needs Cleaning', 'Noise / Vibration', 'Missing Part', 'Other'];

const t = {
  en: {
    request: 'Request', track: 'Track', admin: 'Command Center', adminLogin: 'Admin Login',
    submit: 'Submit Request', scanning: 'Scanning...', scan: 'Scan QR',
    employeeId: 'Employee ID', name: 'Full Name', room: 'Select Location', asset: 'Select Asset',
    phoneNumber: 'Phone Number (optional)', emailAddress: 'Email (optional)',
    duplicateTicket: 'An active ticket already exists for this issue in this location.',
    issue: 'Issue Type', priority: 'Priority', notes: 'Additional Notes',
    low: 'Low', medium: 'Medium', high: 'High',
    statusNew: 'New', inProgress: 'In Progress', resolved: 'Resolved', closed: 'Closed', rejected: 'Rejected',
    total: 'Total Tickets', active: 'Active Issues', breached: 'SLA Breached', spend: 'Total Spend (SAR)',
    print: 'Print', assign: 'Assign Technician', cost: 'Cost (SAR)', parts: 'Parts Used',
    markResolved: 'Mark Resolved', markClosed: 'Close Ticket',
    search: 'Enter exact Ticket Number (e.g., SSC-2026-0001)',
    searchEmployeeId: 'Employee ID (Badge Number)',
    trackVerifyHint: 'For your privacy, enter both your Ticket Number and Employee ID to view status.',
    trackNotFound: 'No ticket found. Verify both your Ticket Number and Employee ID.',
    scanQrRequired: 'Please scan a valid Room QR Code to report an issue.',
    department: 'Department',
    filterStatus: 'Status', filterPriority: 'Priority', filterDepartment: 'Department', filterLocation: 'Location / Room',
    filterDateFrom: 'From', filterDateTo: 'To', applyFilters: 'Apply',
    rotateQr: 'Rotate QR',
    otherRequired: 'Notes are required when "Other" is selected.',
    scanCancel: 'Cancel Scan', scanNotFound: 'QR code does not match a known room.', scanError: 'Camera unavailable. Allow camera access or select the room manually.',
    scanSuccess: 'Room selected',
    loginTitle: 'Command Center', loginSubtitle: 'Authorized personnel only',
    username: 'Admin Username', password: 'Password', loginBtn: 'Access OS',
    logout: 'Logout',
    requestSubtitle: 'Submit a facility maintenance request.',
    trackSubtitle: 'Real-time status tracking for facility maintenance.',
    adminSubtitle: 'Facility operations dashboard',
    selectPlaceholder: '-- Select --',
    accept: 'Accept', reject: 'Reject', reopenNew: 'Reopen as New',
    deleteTicket: 'Delete Ticket', viewTrash: 'View Trash', hideTrash: 'Back to Tickets',
    deleteForever: 'Delete Forever', restore: 'Restore',
    manageLocations: 'Manage Locations', locationManager: 'Location Manager',
    addLocation: 'Add Location', addNewLocation: 'Add New Location',
    roomName: 'Room Name', floor: 'Floor', assetsComma: 'Assets (comma separated)',
    editRoom: 'Edit', saveChanges: 'Save Changes',
    manageStaff: 'Manage Staff', staffManager: 'Staff Manager',
    newStaffUser: 'New Username', staffPassword: 'Password', createStaff: 'Add Staff',
    deleteStaff: 'Remove', staffRole: 'Role',
    saveRoom: 'Save Room', cancel: 'Cancel',
    activeRooms: 'Active Rooms', deletedRooms: 'Deleted Rooms',
    workOrder: 'Work Order', ticketId: 'Ticket ID', location: 'Location',
    issueCol: 'Issue', statusCol: 'Status', actions: 'Actions',
    issuesByLocation: 'Issues by Location', statusOverview: 'Status Overview',
    rejectPrompt: 'Rejection reason (optional):',
    deleteTicketTrashConfirm: 'Move this ticket to trash?',
    deleteForeverConfirm: 'Permanently delete this ticket? This cannot be undone.',
    deleteRoomConfirm: 'Move this room to trash?',
    deleteRoomForeverConfirm: 'Permanently delete this room? This cannot be undone.',
    deleteRoomNamedConfirm: 'Move "{name}" to trash?',
    deleteRoomNamedForeverConfirm: 'Permanently delete "{name}"? This cannot be undone.',
    roomExists: 'A room with this name already exists.',
    invalidCredentials: 'Invalid credentials', backendError: 'Backend not reachable',
    submitSuccess: 'Request Submitted', submitError: 'Submission Failed',
    ticketCreated: 'Your ticket number is', tryAgain: 'Try Again', submitAnother: 'Submit Another',
    roomLocked: 'Room locked via QR scan',
    resolutionNotes: 'Resolution Notes', techSign: 'Technician Sign', adminSign: 'Admin Sign',
    auditTrail: 'Status History', reportedViaQr: 'Reported via QR',
    submitAssign: 'Submit & Assign', assignedTo: 'Assigned Technician', unassigned: 'Unassigned',
    myTickets: 'My Tickets', allTickets: 'All Tickets', assignedToYou: 'Assigned to you',
    discussion: 'Discussion', writeComment: 'Write a comment...', sendComment: 'Send Comment',
    sending: 'Sending...', noComments: 'No comments yet.', commentFailed: 'Failed to send comment.',
    uploadFixPhoto: 'Upload Fix Photo & Resolve', resolutionPhoto: 'Resolution Photo',
    uploading: 'Uploading...', photoRequired: 'Please choose a photo first.',
    uploadFailed: 'Photo upload failed.',
    updatesComments: 'Updates & Comments', proofTitle: 'Proof of Resolution / Fix Photo',
    noUpdates: 'No updates yet. Check back soon.',
    userNotes: 'User Notes / Description', noNotes: 'No description provided.',
    notifications: 'Notifications', noNotifications: 'No notifications yet.',
    reportDaily: 'Daily', reportWeekly: 'Weekly', reportMonthly: 'Monthly',
    reportTotal: 'Total Tickets', reportResolved: 'Resolved Tickets', reportCost: 'Total Cost (SAR)',
    reportDateCol: 'Date', reportLocationAsset: 'Location / Asset', reportAssignee: 'Assignee',
    reportGenerated: 'Generated', reportCompany: 'SSC Building Portal (Bin Quraya)',
    reportNoTickets: 'No tickets in this period.',
  },
  ar: {
    request: 'طلب صيانة', track: 'تتبع', admin: 'لوحة القيادة', adminLogin: 'دخول الإدارة',
    submit: 'إرسال الطلب', scanning: 'جاري المسح...', scan: 'مسح الباركود',
    employeeId: 'الرقم الوظيفي', name: 'الاسم الكامل', room: 'اختر الموقع', asset: 'اختر الأصل',
    phoneNumber: 'رقم الهاتف (اختياري)', emailAddress: 'البريد الإلكتروني (اختياري)',
    duplicateTicket: 'توجد تذكرة نشطة بالفعل لهذه المشكلة في هذا الموقع.',
    issue: 'نوع المشكلة', priority: 'الأولوية', notes: 'ملاحظات إضافية',
    low: 'منخفض', medium: 'متوسط', high: 'عالي',
    statusNew: 'جديد', inProgress: 'قيد التنفيذ', resolved: 'تم الحل', closed: 'مغلق', rejected: 'مرفوض',
    total: 'إجمالي التذاكر', active: 'الطلبات النشطة', breached: 'تجاوز الوقت', spend: 'إجمالي التكلفة (ريال)',
    print: 'طباعة', assign: 'تعيين فني', cost: 'التكلفة (ريال)', parts: 'القطع المستخدمة',
    markResolved: 'تم الحل', markClosed: 'إغلاق التذكرة',
    search: 'أدخل رقم التذكرة بالضبط (مثال: SSC-2026-0001)',
    searchEmployeeId: 'الرقم الوظيفي (رقم البطاقة)',
    trackVerifyHint: 'لحماية خصوصيتك، أدخل رقم التذكرة والرقم الوظيفي معاً لعرض الحالة.',
    trackNotFound: 'لم يتم العثور على تذكرة. تحقق من رقم التذكرة والرقم الوظيفي.',
    scanQrRequired: 'يرجى مسح رمز QR صالح للغرفة لتقديم بلاغ.',
    department: 'القسم',
    filterStatus: 'الحالة', filterPriority: 'الأولوية', filterDepartment: 'القسم', filterLocation: 'الموقع / الغرفة',
    filterDateFrom: 'من', filterDateTo: 'إلى', applyFilters: 'تطبيق',
    rotateQr: 'تدوير QR',
    otherRequired: 'الملاحظات مطلوبة عند اختيار "أخرى".',
    scanCancel: 'إلغاء المسح', scanNotFound: 'رمز QR لا يطابق أي موقع معروف.', scanError: 'الكاميرا غير متاحة. اسمح بالوصول أو اختر الموقع يدوياً.',
    scanSuccess: 'تم تحديد الموقع',
    loginTitle: 'لوحة القيادة', loginSubtitle: 'للموظفين المصرح لهم فقط',
    username: 'اسم المستخدم', password: 'كلمة المرور', loginBtn: 'دخول النظام',
    logout: 'تسجيل الخروج',
    requestSubtitle: 'قدّم طلب صيانة للمرافق.',
    trackSubtitle: 'تتبع حالة طلبات الصيانة في الوقت الفعلي.',
    adminSubtitle: 'لوحة عمليات المرافق',
    selectPlaceholder: '-- اختر --',
    accept: 'قبول', reject: 'رفض', reopenNew: 'إعادة فتح كجديد',
    deleteTicket: 'حذف التذكرة', viewTrash: 'عرض المحذوفات', hideTrash: 'العودة للتذاكر',
    deleteForever: 'حذف نهائي', restore: 'استعادة',
    manageLocations: 'إدارة المواقع', locationManager: 'مدير المواقع',
    addLocation: 'إضافة موقع', addNewLocation: 'إضافة موقع جديد',
    roomName: 'اسم الغرفة', floor: 'الطابق', assetsComma: 'الأصول (مفصولة بفاصلة)',
    editRoom: 'تعديل', saveChanges: 'حفظ التغييرات',
    manageStaff: 'إدارة الموظفين', staffManager: 'مدير الموظفين',
    newStaffUser: 'اسم المستخدم', staffPassword: 'كلمة المرور', createStaff: 'إضافة موظف',
    deleteStaff: 'إزالة', staffRole: 'الدور',
    saveRoom: 'حفظ الغرفة', cancel: 'إلغاء',
    activeRooms: 'الغرف النشطة', deletedRooms: 'الغرف المحذوفة',
    workOrder: 'أمر العمل', ticketId: 'رقم التذكرة', location: 'الموقع',
    issueCol: 'المشكلة', statusCol: 'الحالة', actions: 'إجراءات',
    issuesByLocation: 'المشاكل حسب الموقع', statusOverview: 'نظرة عامة على الحالة',
    rejectPrompt: 'سبب الرفض (اختياري):',
    deleteTicketTrashConfirm: 'نقل هذه التذكرة إلى المحذوفات؟',
    deleteForeverConfirm: 'حذف هذه التذكرة نهائياً؟ لا يمكن التراجع.',
    deleteRoomConfirm: 'نقل هذه الغرفة إلى المحذوفات؟',
    deleteRoomForeverConfirm: 'حذف هذه الغرفة نهائياً؟ لا يمكن التراجع.',
    deleteRoomNamedConfirm: 'نقل "{name}" إلى المحذوفات؟',
    deleteRoomNamedForeverConfirm: 'حذف "{name}" نهائياً؟ لا يمكن التراجع.',
    roomExists: 'يوجد موقع بهذا الاسم بالفعل.',
    invalidCredentials: 'بيانات الدخول غير صحيحة', backendError: 'تعذر الاتصال بالخادم',
    submitSuccess: 'تم إرسال الطلب', submitError: 'فشل الإرسال',
    ticketCreated: 'رقم التذكرة الخاص بك', tryAgain: 'حاول مرة أخرى', submitAnother: 'إرسال طلب آخر',
    roomLocked: 'تم قفل الموقع عبر مسح QR',
    resolutionNotes: 'ملاحظات الإغلاق', techSign: 'توقيع الفني', adminSign: 'توقيع المسؤول',
    auditTrail: 'سجل الحالة', reportedViaQr: 'تم الإبلاغ عبر QR',
    submitAssign: 'اعتماد وتعيين', assignedTo: 'الفني المعيّن', unassigned: 'غير معيّن',
    myTickets: 'تذاكري', allTickets: 'كل التذاكر', assignedToYou: 'معيّنة لك',
    discussion: 'المناقشة', writeComment: 'اكتب تعليقاً...', sendComment: 'إرسال التعليق',
    sending: 'جاري الإرسال...', noComments: 'لا توجد تعليقات بعد.', commentFailed: 'فشل إرسال التعليق.',
    uploadFixPhoto: 'رفع صورة الإصلاح وإغلاق البلاغ', resolutionPhoto: 'صورة الإصلاح',
    uploading: 'جاري الرفع...', photoRequired: 'يرجى اختيار صورة أولاً.',
    uploadFailed: 'فشل رفع الصورة.',
    updatesComments: 'التحديثات والتعليقات', proofTitle: 'إثبات الإصلاح / صورة الإنجاز',
    noUpdates: 'لا توجد تحديثات بعد. تحقق لاحقاً.',
    userNotes: 'ملاحظات المستخدم / الوصف', noNotes: 'لم يتم تقديم وصف.',
    notifications: 'الإشعارات', noNotifications: 'لا توجد إشعارات بعد.',
    reportDaily: 'يومي', reportWeekly: 'أسبوعي', reportMonthly: 'شهري',
    reportTotal: 'إجمالي التذاكر', reportResolved: 'التذاكر المحلولة', reportCost: 'التكلفة الإجمالية (ريال)',
    reportDateCol: 'التاريخ', reportLocationAsset: 'الموقع / الأصل', reportAssignee: 'الفني المسؤول',
    reportGenerated: 'تاريخ الإنشاء', reportCompany: 'بوابة مباني SSC (بن قرية)',
    reportNoTickets: 'لا توجد تذاكر في هذه الفترة.',
  },
};

function statusLabel(dict, status) {
  const map = {
    New: dict.statusNew,
    'In Progress': dict.inProgress,
    Resolved: dict.resolved,
    Closed: dict.closed,
    Rejected: dict.rejected,
    Pending: dict.statusNew,
    Completed: dict.resolved,
  };
  return map[status] || status;
}

function formatHistoryDate(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function statusBadgeClass(status) {
  if (status === 'Resolved' || status === 'Completed') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  if (status === 'In Progress') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  if (status === 'Rejected') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  if (status === 'Closed') return 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
  return 'bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-gray-300';
}

export default function App() {
  const [view, setView] = useState('request');
  const [lang, setLang] = useState('en');
  const [theme, setTheme] = useState('light');
  const [tickets, setTickets] = useState([]);
  const [adminToken, setAdminToken] = useState(localStorage.getItem('ssc_admin_token') || '');
  const [adminRole, setAdminRole] = useState(localStorage.getItem('ssc_admin_role') || '');
  const [focusTicketId, setFocusTicketId] = useState('');

  const tokenPayload = adminToken ? decodeJwtPayload(adminToken) : null;
  const adminUser = tokenPayload?.user || localStorage.getItem('ssc_admin_user') || '';

  const dict = t[lang];
  const fontClass = lang === 'ar' ? 'font-[Cairo]' : 'font-[Inter]';

  useEffect(() => {
    const tokenParam = new URLSearchParams(window.location.search).get('token');
    if (tokenParam) setView('request');
  }, []);

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang === 'ar' ? 'ar' : 'en';
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [lang, theme]);

  useEffect(() => {
    if (!adminToken) setTickets([]);
  }, [adminToken]);

  const handleLogout = () => {
    localStorage.removeItem('ssc_admin_token');
    localStorage.removeItem('ssc_admin_role');
    localStorage.removeItem('ssc_admin_user');
    setAdminToken('');
    setAdminRole('');
    setView('request');
  };

  return (
    <div className={`min-h-screen bg-white dark:bg-black text-black dark:text-white transition-colors duration-300 ${fontClass}`}>
      <nav className="fixed top-0 inset-x-0 z-40 bg-white/80 dark:bg-black/80 backdrop-blur-xl border-b border-gray-200 dark:border-zinc-800 print:hidden">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <button type="button" onClick={() => setView('request')} className="flex items-center gap-3">
            <BrandLogo className="h-14 w-auto drop-shadow-md object-contain" />
            <span className="font-extrabold tracking-tight text-lg hidden sm:inline">SSC<span className="opacity-50">.OS</span></span>
          </button>

          <div className="flex items-center gap-1 sm:gap-4">
            <NavBtn active={view === 'request'} onClick={() => setView('request')}>{dict.request}</NavBtn>
            <NavBtn active={view === 'track'} onClick={() => setView('track')}>{dict.track}</NavBtn>
            <NavBtn active={view === 'admin'} onClick={() => setView('admin')}>
              {adminToken ? dict.admin : dict.adminLogin}
            </NavBtn>
          </div>

          <div className="flex items-center gap-3">
            {adminToken && (
              <NotificationBell
                adminToken={adminToken}
                dict={dict}
                onOpenTicket={(ticketNumber) => {
                  setFocusTicketId(ticketNumber);
                  setView('admin');
                }}
              />
            )}
            {adminToken && (
              <button type="button" onClick={handleLogout} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-900 text-gray-500 hover:text-red-600 transition-colors" aria-label={dict.logout}>
                <LogOut size={18} />
              </button>
            )}
            <button type="button" onClick={() => setLang((l) => (l === 'en' ? 'ar' : 'en'))} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-900 transition-colors">
              <Globe size={18} />
            </button>
            <button type="button" onClick={() => setTheme((th) => (th === 'light' ? 'dark' : 'light'))} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-900 transition-colors">
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
        </div>
      </nav>

      <main className="pt-24 pb-12 px-6 max-w-7xl mx-auto min-h-[90vh]">
        {view === 'request' && <RequestForm dict={dict} lang={lang} />}
        {view === 'track' && <TrackingPortal dict={dict} />}
        {view === 'admin' && (
          adminToken
            ? (
              <AdminDashboard
                dict={dict}
                tickets={tickets}
                setTickets={setTickets}
                adminToken={adminToken}
                adminRole={adminRole}
                adminUser={adminUser}
                focusTicketId={focusTicketId}
                onFocusHandled={() => setFocusTicketId('')}
              />
            )
            : <AdminLogin dict={dict} setToken={setAdminToken} setRole={setAdminRole} />
        )}
      </main>
    </div>
  );
}

function NotificationBell({ adminToken, dict, onOpenTicket }) {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!adminToken) {
      setNotifications([]);
      return undefined;
    }
    let cancelled = false;
    const load = () => {
      fetch(`${API_BASE}/notifications`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('fetch failed'))))
        .then((data) => { if (!cancelled) setNotifications(data.notifications || []); })
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [adminToken]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const unread = notifications.filter((n) => !n.isRead).length;

  const handleNotificationClick = (n) => {
    if (!n.isRead) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      fetch(`${API_BASE}/notifications/${encodeURIComponent(n.id)}/read`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
      }).catch(() => {});
    }
    if (n.ticketNumber && onOpenTicket) {
      setOpen(false);
      onOpenTicket(n.ticketNumber);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-900 transition-colors"
        aria-label={dict.notifications}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -end-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white dark:border-black">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white dark:bg-black border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-2">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider px-3 py-2">{dict.notifications}</p>
          {notifications.length === 0 ? (
            <p className="text-sm text-gray-400 px-3 pb-3">{dict.noNotifications}</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleNotificationClick(n)}
                className={`w-full text-start px-3 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-900 transition-colors ${n.isRead ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start gap-2">
                  {!n.isRead && <span className="mt-1.5 w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-snug break-words">{n.message}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{formatHistoryDate(n.createdAt)}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function NavBtn({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick} className={`px-4 py-2 rounded-2xl text-sm font-semibold transition-all duration-300 active:scale-95 ${active ? 'bg-black text-white dark:bg-white dark:text-black' : 'text-gray-500 hover:text-black dark:hover:text-white'}`}>
      {children}
    </button>
  );
}

function AdminLogin({ setToken, setRole, dict }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass }),
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('ssc_admin_token', data.token);
        localStorage.setItem('ssc_admin_role', data.role || 'admin');
        localStorage.setItem('ssc_admin_user', decodeJwtPayload(data.token)?.user || '');
        setToken(data.token);
        setRole(data.role || 'admin');
      } else {
        alert(dict.invalidCredentials);
      }
    } catch {
      alert(dict.backendError);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-16 bg-white dark:bg-black p-8 rounded-[2rem] border border-gray-200 dark:border-zinc-800 shadow-sm">
      <div className="text-center mb-8">
        <BrandLogo className="h-24 w-auto mx-auto mb-4 drop-shadow-lg object-contain" />
        <h2 className="text-2xl font-extrabold tracking-tighter">{dict.loginTitle}</h2>
        <p className="text-gray-500 text-sm mt-1">{dict.loginSubtitle}</p>
      </div>
      <form onSubmit={handleLogin} className="space-y-4">
        <input type="text" placeholder={dict.username} required value={user} onChange={(e) => setUser(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" className="w-full border border-gray-200 dark:border-zinc-800 rounded-2xl px-5 py-4 bg-transparent focus:border-black dark:focus:border-white outline-none" />
        <input type="password" placeholder={dict.password} required value={pass} onChange={(e) => setPass(e.target.value)} className="w-full border border-gray-200 dark:border-zinc-800 rounded-2xl px-5 py-4 bg-transparent focus:border-black dark:focus:border-white outline-none" />
        <button type="submit" className="w-full bg-black text-white dark:bg-white dark:text-black font-bold py-4 rounded-2xl mt-4 hover:bg-gray-900 dark:hover:bg-gray-100 transition-colors">{dict.loginBtn}</button>
      </form>
    </div>
  );
}

function QRScannerModal({ onScan, onClose }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 print:hidden">
      <div className="bg-white dark:bg-black p-6 rounded-2xl w-full max-w-md shadow-2xl">
        <h3 className="text-xl font-extrabold mb-4 text-center">Scan Room QR</h3>
        <div className="w-full overflow-hidden rounded-xl border border-gray-200 dark:border-zinc-800 bg-black aspect-square flex items-center justify-center">
          <Scanner
            formats={['qr_code', 'micro_qr_code']}
            constraints={{ facingMode: { ideal: 'environment' } }}
            scanDelay={300}
            styles={{
              container: { width: '100%', height: '100%' },
              video: { width: '100%', height: '100%', objectFit: 'cover' },
            }}
            onScan={(detectedCodes) => {
              const text = detectedCodes[0]?.rawValue;
              if (text) onScan(text);
            }}
            onError={(error) => console.log(error?.message)}
          />
        </div>
        <button type="button" onClick={onClose} className="mt-6 w-full bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl font-bold transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

function RequestForm({ dict, lang }) {
  const [form, setForm] = useState({
    name: '', employeeId: '', phoneNumber: '', email: '', roomId: '', asset: '', issue: '', priority: '', notes: '',
  });
  const [qrToken, setQrToken] = useState('');
  const [resolvedRoomName, setResolvedRoomName] = useState('');
  const [departmentName, setDepartmentName] = useState('');
  const [assets, setAssets] = useState([]);
  const [hasValidToken, setHasValidToken] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successTicket, setSuccessTicket] = useState(null);

  const isOther = form.issue === 'Other';
  const isValid = hasValidToken && form.name && form.employeeId && form.roomId && form.asset
    && form.issue && form.priority && (!isOther || form.notes.trim() !== '');

  const applyResolvedRoom = (resolved, token) => {
    const { room } = resolved;
    const deptLabel = lang === 'ar'
      ? (room.department?.nameAr || room.department?.nameEn || '')
      : (room.department?.nameEn || '');
    setForm((prev) => ({ ...prev, roomId: room.id, asset: '' }));
    setResolvedRoomName(room.name);
    setDepartmentName(deptLabel);
    setAssets(resolved.assets || []);
    setQrToken(token);
    setHasValidToken(true);
  };

  const handleScanSuccess = async (scannedText) => {
    const token = extractTokenFromScan(scannedText);
    if (!token) {
      alert(dict.scanNotFound);
      setShowScanner(false);
      return;
    }
    try {
      const resolved = await resolveQrToken(token);
      if (!resolved) {
        alert(dict.scanNotFound);
      } else {
        applyResolvedRoom(resolved, token);
        alert(dict.scanSuccess);
      }
    } catch {
      alert(dict.backendError);
    }
    setShowScanner(false);
  };

  useEffect(() => {
    const tokenParam = new URLSearchParams(window.location.search).get('token');
    if (!tokenParam) return;
    resolveQrToken(tokenParam)
      .then((resolved) => { if (resolved) applyResolvedRoom(resolved, tokenParam); })
      .catch(console.error);
  }, [lang]);

  const submit = async (e) => {
    e.preventDefault();
    if (!isValid || submitting || !qrToken) return;

    setSubmitting(true);
    setSubmitError('');

    try {
      const res = await fetch(`${API_BASE}/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reporterName: form.name,
          employeeId: form.employeeId,
          assetName: form.asset,
          issueType: form.issue,
          priority: form.priority,
          description: form.notes,
          phone: form.phoneNumber,
          email: form.email,
          qrToken,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        setSubmitError(dict.duplicateTicket);
        return;
      }

      if (!res.ok) {
        setSubmitError(data.error || dict.submitError);
        return;
      }

      const ticket = data.issue;
      setSuccessTicket(ticket);
      setForm({ name: '', employeeId: '', phoneNumber: '', email: '', roomId: form.roomId, asset: '', issue: '', priority: '', notes: '' });
    } catch {
      setSubmitError(dict.backendError);
    } finally {
      setSubmitting(false);
    }
  };

  if (successTicket) {
    return (
      <div className="max-w-2xl mx-auto print:hidden text-center">
        <BrandLogo className="h-12 w-auto drop-shadow-sm object-contain mx-auto mb-4" />
        <div className="bg-white dark:bg-black border border-gray-200 dark:border-zinc-800 rounded-[2rem] p-10 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-6">
            <Check size={32} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-3xl font-extrabold tracking-tighter mb-2">{dict.submitSuccess}</h2>
          <p className="text-gray-500 mb-4">{dict.ticketCreated}</p>
          <p className="text-4xl font-mono font-extrabold mb-8">{successTicket.id}</p>
          <button type="button" onClick={() => setSuccessTicket(null)} className="w-full bg-black text-white dark:bg-white dark:text-black py-4 rounded-2xl font-extrabold hover:bg-gray-900 dark:hover:bg-gray-100 transition-colors">
            {dict.submitAnother}
          </button>
        </div>
      </div>
    );
  }

  if (!hasValidToken) {
    return (
      <div className="max-w-2xl mx-auto print:hidden text-center">
        <BrandLogo className="h-12 w-auto drop-shadow-sm object-contain mx-auto mb-6" />
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-[2rem] p-10">
          <QrCode size={48} className="mx-auto mb-4 text-amber-600" />
          <h2 className="text-2xl font-extrabold tracking-tighter mb-3">{dict.scanQrRequired}</h2>
          <button type="button" onClick={() => setShowScanner(true)} className="mt-6 bg-black text-white dark:bg-white dark:text-black px-8 py-4 rounded-2xl font-bold inline-flex items-center gap-2">
            <QrCode size={18} /> {dict.scan}
          </button>
        </div>
        {showScanner && <QRScannerModal onClose={() => setShowScanner(false)} onScan={handleScanSuccess} />}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto print:hidden">
      {showScanner && <QRScannerModal onClose={() => setShowScanner(false)} onScan={handleScanSuccess} />}
      <div className="mb-10 text-center">
        <BrandLogo className="h-12 w-auto drop-shadow-sm object-contain mx-auto mb-4" />
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tighter mb-3">{dict.request}</h1>
        <p className="text-gray-500 dark:text-gray-400">{dict.requestSubtitle}</p>
      </div>

      <form onSubmit={submit} className="bg-white dark:bg-black border border-gray-200 dark:border-zinc-800 rounded-[2rem] p-6 sm:p-10 shadow-sm space-y-6">
        {departmentName && (
          <div className="inline-flex items-center gap-2 bg-gray-100 dark:bg-zinc-900 px-4 py-2 rounded-full text-sm font-bold">
            <span className="text-gray-500">{dict.department}:</span> {departmentName}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Input label={dict.name} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label={dict.employeeId} value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Input label={dict.phoneNumber} type="tel" required={false} value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} />
          <Input label={dict.emailAddress} type="email" required={false} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>

        <hr className="border-gray-100 dark:border-zinc-900" />

        <div className="space-y-6 bg-gray-50 dark:bg-zinc-900/50 p-6 rounded-3xl border border-gray-100 dark:border-zinc-800/50">
          <div>
            <label className="text-sm font-bold text-gray-900 dark:text-gray-100 block mb-2">{dict.room}</label>
            <div className="w-full border border-gray-200 dark:border-zinc-800 rounded-2xl px-5 py-4 bg-gray-100 dark:bg-zinc-900 font-medium">
              {resolvedRoomName}
              <p className="text-xs text-gray-500 mt-1">{dict.roomLocked}</p>
            </div>
          </div>
          <div>
            <label className="text-sm font-bold text-gray-900 dark:text-gray-100 block mb-2">{dict.asset}</label>
            <Select value={form.asset} onChange={(e) => setForm({ ...form, asset: e.target.value })} options={assets} placeholder={dict.selectPlaceholder} />
          </div>
        </div>

        <div>
          <label className="text-sm font-bold text-gray-900 dark:text-gray-100 block mb-2">{dict.issue}</label>
          <Select disabled={!form.asset} value={form.issue} onChange={(e) => setForm({ ...form, issue: e.target.value })} options={ISSUES} placeholder={dict.selectPlaceholder} />
        </div>

        <div>
          <label className="text-sm font-bold text-gray-900 dark:text-gray-100 block mb-3">{dict.priority}</label>
          <div className="grid grid-cols-3 gap-3">
            <RadioCard label={dict.low} active={form.priority === 'Low'} onClick={() => setForm({ ...form, priority: 'Low' })} />
            <RadioCard label={dict.medium} active={form.priority === 'Medium'} onClick={() => setForm({ ...form, priority: 'Medium' })} />
            <RadioCard label={dict.high} active={form.priority === 'High'} onClick={() => setForm({ ...form, priority: 'High' })} />
          </div>
        </div>

        <div>
          <label className="text-sm font-bold text-gray-900 dark:text-gray-100 block mb-2">{dict.notes}</label>
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={250} rows={3} className={`w-full border rounded-2xl px-5 py-4 bg-transparent outline-none transition-all ${isOther && !form.notes ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200 dark:border-zinc-800 focus:border-black dark:focus:border-white'}`} />
          {isOther && !form.notes && <p className="text-red-500 text-xs mt-2 font-semibold" aria-live="polite">{dict.otherRequired}</p>}
        </div>

        {submitError && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-2xl p-4 text-red-700 dark:text-red-400 text-sm font-semibold">{submitError}</div>
        )}

        <button type="submit" disabled={!isValid || submitting} className="w-full bg-black text-white dark:bg-white dark:text-black py-4 rounded-2xl font-extrabold text-lg flex items-center justify-center gap-2 hover:bg-gray-900 dark:hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-[0.98]">
          {submitting ? dict.scanning : dict.submit} {!submitting && <ArrowRight size={20} className="rtl:rotate-180" />}
        </button>
      </form>
    </div>
  );
}

function Input({ label, value, onChange, type = 'text', required }) {
  return (
    <div>
      <label className="text-sm font-bold text-gray-900 dark:text-gray-100 block mb-2">{label}</label>
      <input type={type} required={required} value={value} onChange={onChange} className="w-full border border-gray-200 dark:border-zinc-800 rounded-2xl px-5 py-4 bg-transparent focus:border-black dark:focus:border-white focus:ring-1 focus:ring-black dark:focus:ring-white outline-none transition-all" />
    </div>
  );
}

function Select({ value, onChange, options, disabled, placeholder }) {
  return (
    <select disabled={disabled} value={value} onChange={onChange} className="w-full border border-gray-200 dark:border-zinc-800 rounded-2xl px-5 py-4 bg-transparent focus:border-black dark:focus:border-white outline-none appearance-none disabled:opacity-40 transition-all font-medium">
      <option value="" disabled>{placeholder}</option>
      {options.map((o) => <option key={o} value={o} className="text-black">{o}</option>)}
    </select>
  );
}

function RadioCard({ label, active, onClick }) {
  const activeClass = 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white';
  const inactiveClass = 'border-gray-200 text-gray-500 hover:border-gray-300 dark:border-zinc-800 dark:hover:border-zinc-700';

  return (
    <button type="button" onClick={onClick} className={`py-4 px-2 rounded-2xl border font-bold text-center transition-all active:scale-95 ${active ? activeClass : inactiveClass}`}>
      {label}
    </button>
  );
}

function TrackingPortal({ dict }) {
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [results, setResults] = useState([]);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const searchRequestIdRef = useRef(0);

  const canSearch = search.trim() && employeeId.trim();

  const runSearch = async () => {
    const ticketNumber = search.trim();
    const badgeId = employeeId.trim();
    if (!ticketNumber || !badgeId) return;
    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;
    setLoading(true);
    setSearched(true);
    setComments([]);
    try {
      const params = new URLSearchParams({
        ticketNumber,
        employeeId: badgeId,
      });
      const res = await fetch(`${API_BASE}/issues/track?${params}`);
      if (searchRequestIdRef.current !== requestId) return;
      if (res.ok) {
        const data = await res.json();
        if (searchRequestIdRef.current !== requestId) return;
        setResults(data.issue ? [data.issue] : []);
        if (data.issue) {
          try {
            const commentsRes = await fetch(
              `${API_BASE}/issues/${encodeURIComponent(data.issue.id)}/comments?employeeId=${encodeURIComponent(badgeId)}`,
            );
            if (searchRequestIdRef.current !== requestId) return;
            if (commentsRes.ok) {
              const commentsData = await commentsRes.json();
              if (searchRequestIdRef.current !== requestId) return;
              setComments(commentsData.comments || []);
            }
          } catch {
            /* comments are optional; ticket still displays */
          }
        }
      } else {
        setResults([]);
      }
    } catch {
      if (searchRequestIdRef.current === requestId) setResults([]);
    } finally {
      if (searchRequestIdRef.current === requestId) setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto print:hidden">
      <div className="text-center mb-10">
        <BrandLogo className="h-20 w-auto mx-auto mb-4 drop-shadow-lg object-contain" />
        <h2 className="text-3xl font-extrabold tracking-tighter mb-2">{dict.track}</h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm">{dict.trackSubtitle}</p>
        <p className="text-amber-700 dark:text-amber-400 text-sm font-semibold mt-3 max-w-md mx-auto">{dict.trackVerifyHint}</p>
      </div>
      <div className="space-y-4 mb-12">
        <div className="relative">
          <Search className="absolute start-6 top-1/2 -translate-y-1/2 text-gray-400" size={24} />
          <input
            type="text"
            placeholder={dict.search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSearch && !loading) runSearch(); }}
            className="w-full ps-16 pe-6 py-5 text-lg font-medium bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl outline-none focus:border-black dark:focus:border-white focus:ring-2 focus:ring-black/5 dark:focus:ring-white/5 transition-all shadow-sm"
          />
        </div>
        <input
          type="text"
          placeholder={dict.searchEmployeeId}
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && canSearch && !loading) runSearch(); }}
          className="w-full px-6 py-5 text-lg font-medium bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl outline-none focus:border-black dark:focus:border-white focus:ring-2 focus:ring-black/5 dark:focus:ring-white/5 transition-all shadow-sm"
        />
        <button
          type="button"
          onClick={runSearch}
          disabled={loading || !canSearch}
          className="w-full bg-black text-white dark:bg-white dark:text-black py-4 rounded-2xl text-base font-bold disabled:opacity-40 transition-colors"
        >
          {loading ? '...' : dict.track}
        </button>
      </div>

      <div className="space-y-6">
        {searched && !loading && results.length === 0 && (
          <p className="text-center text-gray-500">{dict.trackNotFound}</p>
        )}
        {results.map((ticket) => (
          <div key={ticket.id} className={`border rounded-[2rem] p-8 bg-white dark:bg-black shadow-sm ${ticket.status === 'Rejected' ? 'border-red-300 dark:border-red-900' : 'border-gray-200 dark:border-zinc-800'}`}>
            <div className="flex justify-between items-start mb-8">
              <div>
                <h3 className="text-2xl font-extrabold tracking-tight mb-1">{ticket.issue}</h3>
                <p className="text-gray-500">{ticket.room} — {ticket.asset}</p>
                {ticket.status === 'Rejected' && ticket.rejectionReason && (
                  <p className="text-sm text-red-600 dark:text-red-400 mt-2 font-medium">{ticket.rejectionReason}</p>
                )}
              </div>
              <span className={`font-mono font-bold px-3 py-1 rounded-lg ${ticket.status === 'Rejected' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'text-gray-400 bg-gray-100 dark:bg-zinc-900'}`}>
                {ticket.id}
              </span>
            </div>

            {ticket.status === 'Rejected' ? (
              <div className="flex items-center justify-center gap-6 py-2">
                <Step label={dict.statusNew} active done />
                <div className="h-0.5 w-12 sm:w-20 bg-red-200 dark:bg-red-900" />
                <Step label={dict.rejected} rejected />
              </div>
            ) : (
              <div className="relative flex justify-between items-center">
                <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 bg-gray-100 dark:bg-zinc-800 -z-10" />
                <Step label={dict.statusNew} active done={ticket.status !== 'New'} />
                <Step label={dict.inProgress} active={['In Progress', 'Resolved', 'Completed', 'Closed'].includes(ticket.status)} done={['Resolved', 'Completed', 'Closed'].includes(ticket.status)} />
                <Step label={dict.resolved} active={['Resolved', 'Completed', 'Closed'].includes(ticket.status)} done={['Completed', 'Closed'].includes(ticket.status)} />
              </div>
            )}

            {(ticket.status === 'Resolved' || ticket.status === 'Completed' || ticket.status === 'Closed') && ticket.resolutionImageUrl && (
              <div className="mt-10 border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-3xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                    <Check size={16} strokeWidth={3} />
                  </div>
                  <h4 className="font-extrabold tracking-tight">{dict.proofTitle}</h4>
                </div>
                <a href={ticket.resolutionImageUrl} target="_blank" rel="noreferrer" className="block">
                  <img
                    src={ticket.resolutionImageUrl}
                    alt={dict.proofTitle}
                    className="w-full rounded-2xl border border-emerald-200 dark:border-emerald-900 object-cover max-h-80 shadow-sm hover:opacity-95 transition-opacity"
                  />
                </a>
              </div>
            )}

            <div className="mt-10 pt-6 border-t border-gray-100 dark:border-zinc-800">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">{dict.updatesComments}</h4>
              {comments.length === 0 ? (
                <p className="text-sm text-gray-400">{dict.noUpdates}</p>
              ) : (
                <div className="space-y-3">
                  {comments.map((c) => (
                    <div key={c.id} className="bg-gray-50 dark:bg-zinc-900/50 rounded-2xl px-5 py-4">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-sm font-bold">{c.userName}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${c.role === 'admin' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400'}`}>
                          {c.role}
                        </span>
                        <span className="text-[11px] text-gray-400 ms-auto">{formatHistoryDate(c.createdAt)}</span>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{c.commentText}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Step({ label, active, done, rejected }) {
  if (rejected) {
    return (
      <div className="flex flex-col items-center gap-3 bg-white dark:bg-black px-2">
        <div className="w-10 h-10 rounded-full flex items-center justify-center border-2 bg-red-500 border-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.35)]">
          <X size={18} strokeWidth={3} />
        </div>
        <span className="text-xs font-bold text-red-600 dark:text-red-400">{label}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 bg-white dark:bg-black px-2">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${done ? 'bg-black border-black text-white dark:bg-white dark:border-white dark:text-black' : active ? 'border-black dark:border-white bg-white dark:bg-black text-black dark:text-white' : 'border-gray-200 dark:border-zinc-800 bg-white dark:bg-black text-gray-300'}`}>
        {done ? <Check size={16} strokeWidth={3} /> : <div className={`w-2.5 h-2.5 rounded-full ${active ? 'bg-black dark:bg-white' : 'bg-transparent'}`} />}
      </div>
      <span className={`text-xs font-bold ${active ? 'text-black dark:text-white' : 'text-gray-400'}`}>{label}</span>
    </div>
  );
}

function AdminDashboard({
  dict, tickets, setTickets, adminToken, adminRole, adminUser,
  focusTicketId, onFocusHandled,
}) {
  const isAdmin = adminRole === 'admin';
  const [printReportConfig, setPrintReportConfig] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const selectedTicketIdRef = useRef(null);
  selectedTicketIdRef.current = selectedTicket?.id || null;
  const [showMineOnly, setShowMineOnly] = useState(!isAdmin);
  const [pendingAssignee, setPendingAssignee] = useState('');
  const [comments, setComments] = useState([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [resolutionFile, setResolutionFile] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [showTicketTrash, setShowTicketTrash] = useState(false);
  const [showAddRoomForm, setShowAddRoomForm] = useState(false);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [editRoomName, setEditRoomName] = useState('');
  const [editRoomFloor, setEditRoomFloor] = useState('');
  const [allStaff, setAllStaff] = useState([]);
  const [newStaffUser, setNewStaffUser] = useState('');
  const [newStaffPass, setNewStaffPass] = useState('');
  const [adminRooms, setAdminRooms] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [facilityUsers, setFacilityUsers] = useState([]);
  const [ticketHistory, setTicketHistory] = useState([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomAssets, setNewRoomAssets] = useState('');
  const [newRoomDept, setNewRoomDept] = useState('');
  const [filters, setFilters] = useState({
    status: '', priority: '', departmentId: '', roomId: '', dateFrom: '', dateTo: '',
  });

  const baseUrl = import.meta.env.VITE_PUBLIC_BASE_URL || window.location.origin;

  const loadTickets = () => {
    const params = new URLSearchParams({ includeDeleted: 'true' });
    if (filters.status) params.set('status', filters.status);
    if (filters.priority) params.set('priority', filters.priority);
    if (filters.departmentId) params.set('department_id', filters.departmentId);
    if (filters.roomId) params.set('room_id', filters.roomId);
    if (filters.dateFrom) params.set('date_from', filters.dateFrom);
    if (filters.dateTo) params.set('date_to', filters.dateTo);
    fetch(`${API_BASE}/issues?${params}`, { headers: { Authorization: `Bearer ${adminToken}` } })
      .then((r) => r.json())
      .then((data) => setTickets(parseIssuesResponse(data)))
      .catch(console.error);
  };

  const loadStaff = () => {
    fetch(`${API_BASE}/users`, { headers: { Authorization: `Bearer ${adminToken}` } })
      .then((r) => r.json())
      .then((data) => setAllStaff(data.users || []))
      .catch(console.error);
  };

  const loadRooms = () => {
    fetch(`${API_BASE}/rooms/admin`, { headers: { Authorization: `Bearer ${adminToken}` } })
      .then((r) => r.json())
      .then((data) => setAdminRooms((data.rooms || []).filter((r) => r.isActive)))
      .catch(console.error);
  };

  useEffect(() => {
    loadTickets();
    loadRooms();
    fetch(`${API_BASE}/departments`)
      .then((r) => r.json())
      .then((data) => setDepartments(data.departments || []))
      .catch(console.error);
    fetch(`${API_BASE}/users?role=facility`, { headers: { Authorization: `Bearer ${adminToken}` } })
      .then((r) => r.json())
      .then((data) => setFacilityUsers(data.users || []))
      .catch(console.error);
  }, [adminToken]);

  useEffect(() => {
    if (!selectedTicket?.id || !adminToken) {
      setTicketHistory([]);
      return undefined;
    }
    let cancelled = false;
    fetch(`${API_BASE}/issues/${encodeURIComponent(selectedTicket.id)}/history`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setTicketHistory(data.history || []); })
      .catch(() => { if (!cancelled) setTicketHistory([]); });
    return () => { cancelled = true; };
  }, [selectedTicket?.id, adminToken]);

  useEffect(() => {
    setPendingAssignee(selectedTicket?.assignee || '');
    setCommentDraft('');
    setResolutionFile(null);
    if (!selectedTicket?.id || !adminToken) {
      setComments([]);
      return undefined;
    }
    let cancelled = false;
    fetch(`${API_BASE}/issues/${encodeURIComponent(selectedTicket.id)}/comments`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setComments(data.comments || []); })
      .catch(() => { if (!cancelled) setComments([]); });
    return () => { cancelled = true; };
  }, [selectedTicket?.id, adminToken]);

  useEffect(() => {
    if (!focusTicketId) return;
    const match = tickets.find((ticket) => ticket.id === focusTicketId && !ticket.isDeleted);
    if (match) {
      setShowTicketTrash(false);
      setSelectedTicket(match);
      onFocusHandled?.();
    }
  }, [focusTicketId, tickets]);

  const filterRoomOptions = filters.departmentId
    ? adminRooms.filter((r) => r.departmentId === filters.departmentId)
    : adminRooms;

  useEffect(() => {
    const onAfterPrint = () => setPrintReportConfig(null);
    window.addEventListener('afterprint', onAfterPrint);
    return () => window.removeEventListener('afterprint', onAfterPrint);
  }, []);

  const activeTickets = tickets.filter((t) => !t.isDeleted);
  const trashedTickets = tickets.filter((t) => t.isDeleted);
  const isMine = (ticket) => Boolean(adminUser) && (ticket.assignee || '') === adminUser;
  const myTickets = activeTickets.filter(isMine);
  const displayTickets = showTicketTrash
    ? trashedTickets
    : (!isAdmin && showMineOnly ? myTickets : activeTickets);

  const statusNew = activeTickets.filter((t) => t.status === 'New' || t.status === 'Pending').length;
  const inProgress = activeTickets.filter((t) => t.status === 'In Progress').length;
  const resolved = activeTickets.filter((t) => t.status === 'Resolved' || t.status === 'Completed').length;
  const totalSpend = activeTickets.reduce((acc, ticket) => acc + (Number(ticket.cost) || 0), 0);
  const slaBreached = countSlaBreached(activeTickets);

  const handlePrintReport = (type) => {
    const now = new Date();
    let from;
    if (type === 'daily') {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (type === 'weekly') {
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    const filteredTickets = activeTickets.filter((ticket) => {
      const created = new Date(ticket.createdAt);
      return !Number.isNaN(created.getTime()) && created >= from;
    });
    setSelectedTicket(null);
    setShowRoomModal(false);
    setPrintReportConfig({
      title: `${type.toUpperCase()} MAINTENANCE REPORT`,
      tickets: filteredTickets,
      date: now.toLocaleDateString(),
    });
    setTimeout(() => window.print(), 500);
  };

  const statusData = [
    { name: dict.statusNew, value: statusNew },
    { name: dict.inProgress, value: inProgress },
    { name: dict.resolved, value: resolved },
  ];

  const chartRoomData = Object.entries(
    activeTickets.reduce((acc, ticket) => { acc[ticket.room] = (acc[ticket.room] || 0) + 1; return acc; }, {}),
  ).map(([name, count]) => ({ name: `${name.substring(0, 10)}...`, count }));

  const updateTicket = async (id, updates) => {
    const current = tickets.find((ticket) => ticket.id === id);
    if (!current) return;

    const merged = { ...current, ...updates };
    setTickets((prev) => prev.map((ticket) => (ticket.id === id ? merged : ticket)));
    if (selectedTicket?.id === id) setSelectedTicket(merged);

    const payload = {
      status: merged.status,
      rejectionReason: merged.rejectionReason,
    };
    if (isAdmin) {
      payload.cost = merged.cost;
      payload.parts = merged.parts;
      payload.assignee = merged.assignee || '';
      payload.isDeleted = merged.isDeleted;
    }

    try {
      const res = await fetch(`${API_BASE}/issues/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.issue) {
          setTickets((prev) => prev.map((ticket) => (ticket.id === id ? data.issue : ticket)));
          if (selectedTicketIdRef.current === id) {
            setSelectedTicket(data.issue);
            fetch(`${API_BASE}/issues/${encodeURIComponent(id)}/history`, {
              headers: { Authorization: `Bearer ${adminToken}` },
            })
              .then((r) => r.json())
              .then((hist) => { if (selectedTicketIdRef.current === id) setTicketHistory(hist.history || []); })
              .catch(() => {});
          }
        }
      } else {
        setTickets((prev) => prev.map((ticket) => (ticket.id === id ? current : ticket)));
        if (selectedTicketIdRef.current === id) setSelectedTicket(current);
      }
    } catch (err) {
      console.error(err);
      setTickets((prev) => prev.map((ticket) => (ticket.id === id ? current : ticket)));
      if (selectedTicketIdRef.current === id) setSelectedTicket(current);
    }
  };

  const handleSubmitAssign = () => {
    if (!selectedTicket || !pendingAssignee) return;
    updateTicket(selectedTicket.id, { assignee: pendingAssignee, status: 'In Progress' });
  };

  const handleSendComment = async () => {
    const text = commentDraft.trim();
    if (!selectedTicket || !text || sendingComment) return;
    const ticketId = selectedTicket.id;
    setSendingComment(true);
    try {
      const res = await fetch(`${API_BASE}/issues/${encodeURIComponent(ticketId)}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ commentText: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.comment) {
        if (selectedTicketIdRef.current === ticketId) {
          setComments((prev) => [...prev, data.comment]);
          setCommentDraft('');
        }
      } else {
        alert(data.error || dict.commentFailed);
      }
    } catch {
      alert(dict.commentFailed);
    } finally {
      setSendingComment(false);
    }
  };

  const handleUploadResolution = async () => {
    if (!selectedTicket || uploadingPhoto) return;
    if (!resolutionFile) {
      alert(dict.photoRequired);
      return;
    }
    const ticketId = selectedTicket.id;
    setUploadingPhoto(true);
    try {
      const form = new FormData();
      form.append('image', resolutionFile);
      const res = await fetch(`${API_BASE}/issues/${encodeURIComponent(ticketId)}/resolution`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.issue) {
        setTickets((prev) => prev.map((ticket) => (ticket.id === data.issue.id ? data.issue : ticket)));
        if (selectedTicketIdRef.current === ticketId) {
          setSelectedTicket(data.issue);
          setResolutionFile(null);
          fetch(`${API_BASE}/issues/${encodeURIComponent(ticketId)}/history`, {
            headers: { Authorization: `Bearer ${adminToken}` },
          })
            .then((r) => r.json())
            .then((hist) => { if (selectedTicketIdRef.current === ticketId) setTicketHistory(hist.history || []); })
            .catch(() => {});
        }
      } else {
        alert(data.error || dict.uploadFailed);
      }
    } catch {
      alert(dict.uploadFailed);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleReject = (id) => {
    const reason = window.prompt(dict.rejectPrompt);
    if (reason === null) return;
    updateTicket(id, { status: 'Rejected', rejectionReason: reason || '' });
  };

  const handleDeleteTicket = (id) => {
    if (!window.confirm(dict.deleteTicketTrashConfirm)) return;
    updateTicket(id, { isDeleted: true });
    setSelectedTicket(null);
  };

  const handleRestoreTicket = (id) => {
    updateTicket(id, { isDeleted: false });
  };

  const handleDeleteTicketForever = async (id) => {
    if (!isAdmin) return;
    if (!window.confirm(dict.deleteForeverConfirm)) return;
    setTickets(tickets.filter((ticket) => ticket.id !== id));
    if (selectedTicket?.id === id) setSelectedTicket(null);
    try {
      await fetch(`${API_BASE}/issues/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleReopenTicket = (id) => {
    updateTicket(id, { status: 'New', rejectionReason: '' });
  };

  const handleSaveRoom = async (e) => {
    e.preventDefault();
    const name = newRoomName.trim();
    if (!name || !newRoomDept) return;
    const assets = newRoomAssets.split(',').map((s) => s.trim()).filter(Boolean);
    try {
      const res = await fetch(`${API_BASE}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ name, departmentId: newRoomDept, assets }),
      });
      if (res.ok) {
        setNewRoomName('');
        setNewRoomAssets('');
        setShowAddRoomForm(false);
        loadRooms();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || dict.roomExists);
      }
    } catch {
      alert(dict.backendError);
    }
  };

  const handleRotateQr = async (roomId) => {
    if (!isAdmin) return;
    if (!window.confirm('Regenerate QR token? Old printed codes will stop working.')) return;
    try {
      const res = await fetch(`${API_BASE}/rooms/${roomId}/qr/regenerate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAdminRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, token: data.token } : r)));
      }
    } catch {
      alert(dict.backendError);
    }
  };

  const openEditRoom = (room) => {
    setEditingRoom(room);
    setEditRoomName(room.name);
    setEditRoomFloor(room.floor || '');
  };

  const handleSaveRoomEdit = async (e) => {
    e.preventDefault();
    if (!editingRoom) return;
    const name = editRoomName.trim();
    if (!name) return;
    try {
      const res = await fetch(`${API_BASE}/rooms/${editingRoom.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ name, floor: editRoomFloor.trim() || null }),
      });
      if (res.ok) {
        const data = await res.json();
        setAdminRooms((prev) => prev.map((r) => (
          r.id === editingRoom.id ? { ...r, name: data.room.name, floor: data.room.floor } : r
        )));
        setEditingRoom(null);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || dict.backendError);
      }
    } catch {
      alert(dict.backendError);
    }
  };

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    const username = newStaffUser.trim();
    if (!username || !newStaffPass) return;
    try {
      const res = await fetch(`${API_BASE}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ username, password: newStaffPass, role: 'facility' }),
      });
      if (res.ok) {
        setNewStaffUser('');
        setNewStaffPass('');
        loadStaff();
        fetch(`${API_BASE}/users?role=facility`, { headers: { Authorization: `Bearer ${adminToken}` } })
          .then((r) => r.json())
          .then((data) => setFacilityUsers(data.users || []))
          .catch(console.error);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || dict.backendError);
      }
    } catch {
      alert(dict.backendError);
    }
  };

  const handleDeleteStaff = async (userId, username) => {
    if (!window.confirm(`Remove staff user "${username}"?`)) return;
    try {
      const res = await fetch(`${API_BASE}/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.ok) {
        loadStaff();
        setFacilityUsers((prev) => prev.filter((u) => u.id !== userId));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || dict.backendError);
      }
    } catch {
      alert(dict.backendError);
    }
  };

  const handleDeleteRoom = async (roomId, roomName) => {
    if (!isAdmin) return;
    if (!window.confirm(dict.deleteRoomNamedConfirm.replace('{name}', roomName))) return;
    try {
      const res = await fetch(`${API_BASE}/rooms/${roomId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.ok) {
        setAdminRooms((prev) => prev.filter((r) => r.id !== roomId));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || dict.backendError);
      }
    } catch {
      alert(dict.backendError);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap justify-between items-end gap-4 mb-8 print:hidden">
        <div className="flex items-center gap-4">
          <BrandLogo className="h-12 sm:h-16 w-auto drop-shadow-lg object-contain" />
          <div>
            <h1 className="text-4xl font-extrabold tracking-tighter">{dict.admin}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{dict.adminSubtitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
          <button
            type="button"
            onClick={() => setShowTicketTrash((v) => !v)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold transition-colors ${showTicketTrash ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-gray-100 hover:bg-gray-200 dark:bg-zinc-900 dark:hover:bg-zinc-800'}`}
          >
            <Trash2 size={18} /> {showTicketTrash ? dict.hideTrash : dict.viewTrash}
          </button>
          )}
          <button type="button" onClick={() => setShowRoomModal(true)} className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-black dark:text-white px-4 py-2.5 rounded-xl font-bold transition-colors">
            <LayoutGrid size={18} /> {dict.manageLocations}
          </button>
          {isAdmin && (
          <button type="button" onClick={() => { setShowStaffModal(true); loadStaff(); }} className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-black dark:text-white px-4 py-2.5 rounded-xl font-bold transition-colors">
            <Users size={18} /> {dict.manageStaff}
          </button>
          )}
          {isAdmin && (
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-zinc-900 rounded-xl p-1">
            {['daily', 'weekly', 'monthly'].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handlePrintReport(type)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-black hover:shadow-sm transition-all"
              >
                <Printer size={14} />
                {type === 'daily' ? dict.reportDaily : type === 'weekly' ? dict.reportWeekly : dict.reportMonthly}
              </button>
            ))}
          </div>
          )}
        </div>
      </div>

      {!showTicketTrash && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 print:hidden">
            <MetricCard label={dict.total} value={activeTickets.length} />
            <MetricCard label={dict.active} value={statusNew + inProgress} />
            <MetricCard label={dict.breached} value={slaBreached} />
            <MetricCard label={dict.spend} value={`SAR ${totalSpend.toLocaleString()}`} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 print:hidden">
            <div className="md:col-span-2 border border-gray-200 dark:border-zinc-800 bg-white dark:bg-black rounded-[2rem] p-6 h-72">
              <h3 className="font-bold mb-4">{dict.issuesByLocation}</h3>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRoomData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} />
                  <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }} />
                  <Bar dataKey="count" fill="currentColor" className="text-black dark:text-white" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="border border-gray-200 dark:border-zinc-800 bg-white dark:bg-black rounded-[2rem] p-6 h-72">
              <h3 className="font-bold mb-4">{dict.statusOverview}</h3>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                    <Cell fill="#000000" className="dark:fill-white" />
                    <Cell fill="#9ca3af" />
                    <Cell fill="#e5e7eb" className="dark:fill-zinc-800" />
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {!isAdmin && !showTicketTrash && (
        <div className="flex gap-2 mb-4 print:hidden">
          <button
            type="button"
            onClick={() => setShowMineOnly(true)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${showMineOnly ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-gray-100 dark:bg-zinc-900 text-gray-500'}`}
          >
            {dict.myTickets} ({myTickets.length})
          </button>
          <button
            type="button"
            onClick={() => setShowMineOnly(false)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${!showMineOnly ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-gray-100 dark:bg-zinc-900 text-gray-500'}`}
          >
            {dict.allTickets} ({activeTickets.length})
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-4 print:hidden">
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm font-medium bg-transparent">
          <option value="">{dict.filterStatus}</option>
          <option value="New">New</option>
          <option value="In Progress">In Progress</option>
          <option value="Resolved">Resolved</option>
          <option value="Closed">Closed</option>
          <option value="Rejected">Rejected</option>
        </select>
        <select value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })} className="border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm font-medium bg-transparent">
          <option value="">{dict.filterPriority}</option>
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
        </select>
        <select
          value={filters.departmentId}
          onChange={(e) => setFilters({ ...filters, departmentId: e.target.value, roomId: '' })}
          className="border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm font-medium bg-transparent"
        >
          <option value="">{dict.filterDepartment}</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name_en}</option>)}
        </select>
        <select
          value={filters.roomId}
          onChange={(e) => setFilters({ ...filters, roomId: e.target.value })}
          className="border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm font-medium bg-transparent max-w-[200px]"
        >
          <option value="">{dict.filterLocation}</option>
          {filterRoomOptions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} className="border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm bg-transparent" placeholder={dict.filterDateFrom} />
        <input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} className="border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm bg-transparent" placeholder={dict.filterDateTo} />
        <button type="button" onClick={loadTickets} className="bg-black text-white dark:bg-white dark:text-black px-5 py-2 rounded-xl text-sm font-bold">{dict.applyFilters}</button>
      </div>

      <div className="border border-gray-200 dark:border-zinc-800 bg-white dark:bg-black rounded-[2rem] overflow-hidden print:hidden">
        <table className="w-full text-start text-sm">
          <thead className="bg-gray-50 dark:bg-zinc-900/50">
            <tr>
              <th className="px-6 py-4 font-bold text-gray-500">{dict.ticketId}</th>
              <th className="px-6 py-4 font-bold text-gray-500">{dict.location}</th>
              <th className="px-6 py-4 font-bold text-gray-500">{dict.issueCol}</th>
              <th className="px-6 py-4 font-bold text-gray-500">{dict.statusCol}</th>
              {showTicketTrash && <th className="px-6 py-4 font-bold text-gray-500">{dict.actions}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
            {displayTickets.map((ticket) => (
              <tr key={ticket.id} onClick={() => !showTicketTrash && setSelectedTicket(ticket)} className={`${showTicketTrash ? '' : 'cursor-pointer'} hover:bg-gray-50 dark:hover:bg-zinc-900/50 transition-colors`}>
                <td className="px-6 py-4 font-mono font-bold">
                  {ticket.id}
                  {!isAdmin && isMine(ticket) && (
                    <span className="ms-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 align-middle">
                      {dict.assignedToYou}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 truncate max-w-[200px]">{ticket.room}</td>
                <td className="px-6 py-4 font-medium">{ticket.issue}</td>
                <td className="px-6 py-4">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${statusBadgeClass(ticket.status)}`}>
                    {statusLabel(dict, ticket.status)}
                  </span>
                </td>
                {showTicketTrash && (
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleRestoreTicket(ticket.id); }}
                        className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:text-emerald-700"
                      >
                        <RotateCcw size={14} /> {dict.restore}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDeleteTicketForever(ticket.id); }}
                        className="flex items-center gap-1.5 text-xs font-bold text-red-600 hover:text-red-700"
                      >
                        <Trash2 size={14} /> {dict.deleteForever}
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedTicket && !showTicketTrash && (
        <div className="fixed inset-0 z-50 flex justify-end rtl:justify-start">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm print:hidden" onClick={() => setSelectedTicket(null)} />
          <div className="w-full max-w-md bg-white dark:bg-black border-s border-gray-200 dark:border-zinc-800 h-full relative z-10 shadow-2xl p-8 overflow-y-auto">
            <button type="button" onClick={() => window.print()} className="absolute top-8 end-16 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-900 print:hidden" aria-label={dict.print}>
              <Printer size={20} />
            </button>
            <button type="button" onClick={() => setSelectedTicket(null)} className="absolute top-8 end-6 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-900 print:hidden" aria-label={dict.cancel}>
              <X size={20} />
            </button>

            <div className="mb-8">
              <BrandLogo className="h-10 w-auto object-contain mb-4 print:block" />
              <p className="text-sm font-bold text-gray-400 mb-1">{dict.workOrder}</p>
              <h2 className="text-3xl font-extrabold tracking-tighter">{selectedTicket.id}</h2>
              <p className="mt-4 font-medium">{selectedTicket.room} — {selectedTicket.asset}</p>
              <p className="text-gray-500 mt-1">{selectedTicket.issue}</p>
              <div className="mt-4 bg-gray-50 dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-3">
                <p className="text-xs font-bold text-gray-400 uppercase mb-1.5">{dict.userNotes}</p>
                <p className={`text-sm whitespace-pre-wrap ${selectedTicket.notes ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 italic'}`}>
                  {selectedTicket.notes || dict.noNotes}
                </p>
              </div>
              {selectedTicket.status === 'Rejected' && selectedTicket.rejectionReason && (
                <p className="text-sm text-red-600 dark:text-red-400 mt-2">{selectedTicket.rejectionReason}</p>
              )}
            </div>

            <div className="space-y-6 print:hidden">
              {isAdmin ? (
                <div>
                  <label className="text-xs font-bold text-gray-400 block mb-2 uppercase">{dict.assign}</label>
                  <select
                    value={pendingAssignee}
                    onChange={(e) => setPendingAssignee(e.target.value)}
                    className="w-full border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-3 bg-transparent outline-none"
                  >
                    <option value="">{dict.selectPlaceholder}</option>
                    {facilityUsers.map((user) => (
                      <option key={user.id} value={user.username}>{user.username}</option>
                    ))}
                  </select>
                  {pendingAssignee && pendingAssignee !== (selectedTicket.assignee || '') && (
                    <button
                      type="button"
                      onClick={handleSubmitAssign}
                      className="mt-3 w-full bg-black text-white dark:bg-white dark:text-black py-3 rounded-xl font-bold hover:opacity-90 transition-opacity"
                    >
                      {dict.submitAssign}
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  <label className="text-xs font-bold text-gray-400 block mb-2 uppercase">{dict.assignedTo}</label>
                  <p className="w-full border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-3 font-semibold">
                    {selectedTicket.assignee || dict.unassigned}
                  </p>
                </div>
              )}

              {isAdmin && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-400 block mb-2 uppercase">{dict.cost}</label>
                  <input type="number" value={selectedTicket.cost || ''} onChange={(e) => updateTicket(selectedTicket.id, { cost: e.target.value })} className="w-full border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-3 bg-transparent outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 block mb-2 uppercase">{dict.parts}</label>
                  <input type="text" value={selectedTicket.parts || ''} onChange={(e) => updateTicket(selectedTicket.id, { parts: e.target.value })} className="w-full border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-3 bg-transparent outline-none" />
                </div>
              </div>
              )}

              <div className="flex flex-wrap gap-2 pt-4">
                {isAdmin && (selectedTicket.status === 'New' || selectedTicket.status === 'Pending') && (
                  <>
                    <button type="button" onClick={() => updateTicket(selectedTicket.id, { status: 'In Progress' })} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold transition-colors">
                      {dict.accept}
                    </button>
                    <button type="button" onClick={() => handleReject(selectedTicket.id)} className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl font-bold transition-colors">
                      {dict.reject}
                    </button>
                  </>
                )}

                {!isAdmin && isMine(selectedTicket) && selectedTicket.status === 'Resolved' && (
                  <button type="button" onClick={() => updateTicket(selectedTicket.id, { status: 'Closed' })} className="flex-1 bg-zinc-700 hover:bg-zinc-800 text-white py-3 rounded-xl font-bold transition-colors">
                    {dict.markClosed}
                  </button>
                )}

                {isAdmin && selectedTicket.status === 'Rejected' && (
                  <button type="button" onClick={() => handleReopenTicket(selectedTicket.id)} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-3 rounded-xl font-bold transition-colors">
                    {dict.reopenNew}
                  </button>
                )}
              </div>

              {!isAdmin && isMine(selectedTicket) && selectedTicket.status === 'In Progress' && (
                <div className="border border-gray-200 dark:border-zinc-800 rounded-2xl p-4">
                  <label className="text-xs font-bold text-gray-400 block mb-3 uppercase">{dict.uploadFixPhoto}</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setResolutionFile(e.target.files?.[0] || null)}
                    className="w-full text-sm mb-3 file:me-3 file:px-4 file:py-2 file:rounded-xl file:border-0 file:bg-gray-100 dark:file:bg-zinc-900 file:font-bold file:text-sm dark:file:text-white"
                  />
                  <button
                    type="button"
                    onClick={handleUploadResolution}
                    disabled={uploadingPhoto || !resolutionFile}
                    className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    <Check size={18} /> {uploadingPhoto ? dict.uploading : dict.uploadFixPhoto}
                  </button>
                </div>
              )}

              {selectedTicket.resolutionImageUrl && (
                <div>
                  <label className="text-xs font-bold text-gray-400 block mb-2 uppercase">{dict.resolutionPhoto}</label>
                  <a href={selectedTicket.resolutionImageUrl} target="_blank" rel="noreferrer">
                    <img
                      src={selectedTicket.resolutionImageUrl}
                      alt={dict.resolutionPhoto}
                      className="w-full rounded-xl border border-gray-200 dark:border-zinc-800 object-cover max-h-64"
                    />
                  </a>
                </div>
              )}

              {isAdmin && (
              <button
                type="button"
                onClick={() => handleDeleteTicket(selectedTicket.id)}
                className="w-full flex items-center justify-center gap-2 border border-red-200 dark:border-red-900 text-red-600 hover:bg-red-50 dark:hover:bg-red-950 py-3 rounded-xl font-bold transition-colors"
              >
                <Trash2 size={18} /> {dict.deleteTicket}
              </button>
              )}
            </div>

            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-zinc-800 print:hidden">
              <h3 className="text-xs font-bold text-gray-400 uppercase mb-4">{dict.discussion}</h3>
              <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                {comments.length === 0 && (
                  <p className="text-sm text-gray-400">{dict.noComments}</p>
                )}
                {comments.map((c) => (
                  <div key={c.id} className="bg-gray-50 dark:bg-zinc-900/50 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold">{c.userName}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${c.role === 'admin' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400'}`}>
                        {c.role}
                      </span>
                      <span className="text-[11px] text-gray-400 ms-auto">{formatHistoryDate(c.createdAt)}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{c.commentText}</p>
                  </div>
                ))}
              </div>
              <textarea
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                placeholder={dict.writeComment}
                rows={3}
                maxLength={2000}
                className="w-full border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-3 bg-transparent outline-none focus:border-black dark:focus:border-white text-sm resize-none"
              />
              <button
                type="button"
                onClick={handleSendComment}
                disabled={sendingComment || !commentDraft.trim()}
                className="mt-2 w-full bg-black text-white dark:bg-white dark:text-black disabled:opacity-50 py-3 rounded-xl font-bold transition-opacity hover:opacity-90"
              >
                {sendingComment ? dict.sending : dict.sendComment}
              </button>
            </div>

            {ticketHistory.length > 0 && (
              <div className="mt-8 pt-6 border-t border-gray-200 dark:border-zinc-800 print:hidden">
                <h3 className="text-xs font-bold text-gray-400 uppercase mb-4">{dict.auditTrail}</h3>
                <ul className="space-y-3">
                  {ticketHistory.map((entry) => (
                    <li key={entry.id} className="text-sm border-s-2 border-gray-200 dark:border-zinc-700 ps-3">
                      <p className="font-semibold">
                        {entry.fromStatus ? `${entry.fromStatus} → ${entry.toStatus}` : entry.toStatus}
                      </p>
                      <p className="text-gray-500 text-xs mt-0.5">
                        {entry.changedBy} · {formatHistoryDate(entry.createdAt)}
                      </p>
                      {entry.note && (
                        <p className="text-gray-600 dark:text-gray-400 text-xs mt-1">{entry.note}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="hidden print:block mt-12 border-t border-black pt-8">
              <h3 className="font-bold text-lg mb-4">{dict.resolutionNotes}</h3>
              <div className="h-32 border-b border-dashed border-gray-400 mb-4" />
              <div className="h-32 border-b border-dashed border-gray-400 mb-4" />
              <div className="flex justify-between mt-12">
                <div>{dict.techSign}: ________________</div>
                <div>{dict.adminSign}: ________________</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showRoomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center print:bg-white">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm print:hidden" onClick={() => setShowRoomModal(false)} />
          <div className="w-full max-w-4xl bg-white dark:bg-black border border-gray-200 dark:border-zinc-800 rounded-[2rem] relative z-10 shadow-2xl p-8 max-h-[90vh] overflow-y-auto print:shadow-none print:border-none print:p-0">
            <div className="flex flex-wrap justify-between items-center gap-4 mb-8 print:hidden">
              <div className="flex items-center gap-4">
                <BrandLogo className="h-12 w-auto object-contain" />
                <h2 className="text-3xl font-extrabold tracking-tighter">{dict.locationManager}</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => window.print()} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-900" aria-label={dict.print}><Printer size={20} /></button>
                <button type="button" onClick={() => setShowRoomModal(false)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-900"><X size={20} /></button>
              </div>
            </div>

            <div className="hidden print:flex print:justify-center print:mb-8">
              <BrandLogo className="h-16 w-auto object-contain" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 print:grid-cols-3">
              {adminRooms.map((room) => (
                <div key={room.id} className="border border-gray-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col items-center text-center print:border-black print:break-inside-avoid">
                  {room.token && (
                    <QRCodeSVG
                      value={`${baseUrl}?token=${encodeURIComponent(room.token)}`}
                      size={100}
                      className="mb-4"
                    />
                  )}
                  <p className="font-bold text-sm tracking-tight mb-2">{room.name}</p>
                  {isAdmin && (
                    <div className="print:hidden flex flex-col gap-2 w-full">
                      <button type="button" onClick={() => openEditRoom(room)} className="text-xs font-bold flex items-center justify-center gap-1 text-gray-600 hover:text-black dark:hover:text-white">
                        <Pencil size={12} /> {dict.editRoom}
                      </button>
                      <button type="button" onClick={() => handleRotateQr(room.id)} className="text-xs font-bold flex items-center justify-center gap-1 text-gray-600 hover:text-black dark:hover:text-white">
                        <RefreshCw size={12} /> {dict.rotateQr}
                      </button>
                      <button type="button" onClick={() => handleDeleteRoom(room.id, room.name)} className="text-xs font-bold flex items-center justify-center gap-1 text-red-600 hover:text-red-700">
                        <Trash2 size={12} /> {dict.deleteTicket}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {isAdmin && (
              <button type="button" onClick={() => setShowAddRoomForm(true)} className="print:hidden border-2 border-dashed border-gray-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col items-center justify-center text-gray-400 hover:text-black dark:hover:text-white min-h-[180px]">
                <Plus size={32} className="mb-2" />
                <span className="font-bold text-sm">{dict.addLocation}</span>
              </button>
              )}
            </div>

            {showAddRoomForm && (
              <form onSubmit={handleSaveRoom} className="mt-8 p-6 border border-gray-200 dark:border-zinc-800 rounded-2xl space-y-4 print:hidden">
                <h3 className="font-bold text-lg">{dict.addNewLocation}</h3>
                <input value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} placeholder={dict.roomName} required className="w-full border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-3 bg-transparent outline-none" />
                <select value={newRoomDept} onChange={(e) => setNewRoomDept(e.target.value)} required className="w-full border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-3 bg-transparent outline-none">
                  <option value="">{dict.department}</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name_en}</option>)}
                </select>
                <textarea value={newRoomAssets} onChange={(e) => setNewRoomAssets(e.target.value)} placeholder={dict.assetsComma} rows={2} className="w-full border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-3 bg-transparent outline-none resize-none" />
                <div className="flex gap-2">
                  <button type="submit" className="bg-black text-white dark:bg-white dark:text-black px-6 py-2.5 rounded-xl font-bold">{dict.saveRoom}</button>
                  <button type="button" onClick={() => setShowAddRoomForm(false)} className="px-6 py-2.5 rounded-xl font-bold border border-gray-200 dark:border-zinc-800">{dict.cancel}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {editingRoom && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center print:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditingRoom(null)} />
          <form onSubmit={handleSaveRoomEdit} className="relative z-10 w-full max-w-md bg-white dark:bg-black border border-gray-200 dark:border-zinc-800 rounded-2xl p-8 shadow-2xl space-y-4">
            <h3 className="text-xl font-extrabold">{dict.editRoom}</h3>
            <input value={editRoomName} onChange={(e) => setEditRoomName(e.target.value)} placeholder={dict.roomName} required className="w-full border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-3 bg-transparent outline-none" />
            <input value={editRoomFloor} onChange={(e) => setEditRoomFloor(e.target.value)} placeholder={dict.floor} className="w-full border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-3 bg-transparent outline-none" />
            <div className="flex gap-2 pt-2">
              <button type="submit" className="flex-1 bg-black text-white dark:bg-white dark:text-black py-3 rounded-xl font-bold">{dict.saveChanges}</button>
              <button type="button" onClick={() => setEditingRoom(null)} className="px-6 py-3 rounded-xl font-bold border border-gray-200 dark:border-zinc-800">{dict.cancel}</button>
            </div>
          </form>
        </div>
      )}

      {showStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center print:hidden">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowStaffModal(false)} />
          <div className="w-full max-w-lg bg-white dark:bg-black border border-gray-200 dark:border-zinc-800 rounded-[2rem] relative z-10 shadow-2xl p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-extrabold">{dict.staffManager}</h2>
              <button type="button" onClick={() => setShowStaffModal(false)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-900"><X size={20} /></button>
            </div>
            <ul className="space-y-2 mb-6">
              {allStaff.map((user) => (
                <li key={user.id} className="flex items-center justify-between border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-3">
                  <div>
                    <p className="font-bold">{user.username}</p>
                    <p className="text-xs text-gray-500">{user.role}</p>
                  </div>
                  {user.role === 'facility' && (
                    <button type="button" onClick={() => handleDeleteStaff(user.id, user.username)} className="text-xs font-bold text-red-600 hover:text-red-700">
                      {dict.deleteStaff}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <form onSubmit={handleCreateStaff} className="space-y-3 border-t border-gray-200 dark:border-zinc-800 pt-6">
              <h3 className="font-bold">{dict.createStaff}</h3>
              <input value={newStaffUser} onChange={(e) => setNewStaffUser(e.target.value)} placeholder={dict.newStaffUser} required className="w-full border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-3 bg-transparent outline-none" />
              <input type="password" value={newStaffPass} onChange={(e) => setNewStaffPass(e.target.value)} placeholder={dict.staffPassword} required minLength={6} className="w-full border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-3 bg-transparent outline-none" />
              <button type="submit" className="w-full bg-black text-white dark:bg-white dark:text-black py-3 rounded-xl font-bold">{dict.createStaff}</button>
            </form>
          </div>
        </div>
      )}

      {printReportConfig && <PrintableReport config={printReportConfig} dict={dict} />}
    </div>
  );
}

function PrintableReport({ config, dict }) {
  const { title, tickets, date } = config;
  const resolvedCount = tickets.filter((t) => ['Resolved', 'Completed', 'Closed'].includes(t.status)).length;
  const totalCost = tickets.reduce((acc, t) => acc + (Number(t.cost) || 0), 0);

  return (
    <div className="hidden print:block absolute top-0 left-0 w-full bg-white text-black p-8 z-[9999]">
      <div className="flex items-center justify-between border-b-2 border-gray-800 pb-6 mb-6">
        <img src="/logo.png" alt="Logo" className="h-16 w-auto object-contain" />
        <div className="text-end">
          <p className="text-lg font-bold">{dict.reportCompany}</p>
          <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
          <p className="text-sm text-gray-700 mt-1">{dict.reportGenerated}: {date}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="border border-gray-800 rounded-lg p-4 text-center">
          <p className="text-xs font-bold uppercase tracking-wider">{dict.reportTotal}</p>
          <p className="text-3xl font-extrabold mt-1">{tickets.length}</p>
        </div>
        <div className="border border-gray-800 rounded-lg p-4 text-center">
          <p className="text-xs font-bold uppercase tracking-wider">{dict.reportResolved}</p>
          <p className="text-3xl font-extrabold mt-1">{resolvedCount}</p>
        </div>
        <div className="border border-gray-800 rounded-lg p-4 text-center">
          <p className="text-xs font-bold uppercase tracking-wider">{dict.reportCost}</p>
          <p className="text-3xl font-extrabold mt-1">{totalCost.toLocaleString()}</p>
        </div>
      </div>

      {tickets.length === 0 ? (
        <p className="text-sm text-gray-700">{dict.reportNoTickets}</p>
      ) : (
        <table className="w-full text-start text-sm border-collapse">
          <thead>
            <tr>
              <th className="border border-gray-800 px-3 py-2 font-bold text-start">{dict.ticketId}</th>
              <th className="border border-gray-800 px-3 py-2 font-bold">{dict.reportDateCol}</th>
              <th className="border border-gray-800 px-3 py-2 font-bold">{dict.reportLocationAsset}</th>
              <th className="border border-gray-800 px-3 py-2 font-bold">{dict.issueCol}</th>
              <th className="border border-gray-800 px-3 py-2 font-bold">{dict.reportAssignee}</th>
              <th className="border border-gray-800 px-3 py-2 font-bold">{dict.statusCol}</th>
              <th className="border border-gray-800 px-3 py-2 font-bold">{dict.cost}</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id} className="print:break-inside-avoid">
                <td className="border border-gray-800 px-3 py-2 font-mono">{t.id}</td>
                <td className="border border-gray-800 px-3 py-2">{new Date(t.createdAt).toLocaleDateString()}</td>
                <td className="border border-gray-800 px-3 py-2">{t.room}{t.asset ? ` / ${t.asset}` : ''}</td>
                <td className="border border-gray-800 px-3 py-2">{t.issue}</td>
                <td className="border border-gray-800 px-3 py-2">{t.assignee || '—'}</td>
                <td className="border border-gray-800 px-3 py-2">{t.status}</td>
                <td className="border border-gray-800 px-3 py-2">{Number(t.cost) ? Number(t.cost).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="text-xs text-gray-600 mt-8 pt-4 border-t border-gray-800">
        {dict.reportCompany} — {dict.reportGenerated}: {date}
      </p>
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="border border-gray-200 dark:border-zinc-800 bg-white dark:bg-black rounded-[2rem] p-6">
      <p className="text-sm font-bold text-gray-500 mb-2">{label}</p>
      <p className="text-4xl sm:text-5xl font-extrabold tracking-tighter">{value}</p>
    </div>
  );
}
