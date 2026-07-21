import React, { useState, useEffect, useRef } from 'react';
import { countSlaBreached } from './sla';
import { Scanner } from '@yudiel/react-qr-scanner';
import {
  Check, QrCode, Search, LayoutGrid, LogOut, Trash2, RotateCcw,
  X, Plus, Printer, Moon, Sun, Globe, ArrowRight, RefreshCw, Pencil, Users,
  Bell, Camera, ImagePlus,
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

// Compresses an image client-side before upload: resizes to max 1280px on the
// longest side and re-encodes as JPEG (quality 0.72). Keeps uploads small.
async function compressImage(file, maxDim = 1280, quality = 0.72) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Invalid image'));
      el.src = objectUrl;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('Compression failed');
    // If compression somehow made it bigger (tiny files), keep the original.
    return blob.size < file.size ? blob : file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
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

const MGS_FLOORS = new Set(['A Block', 'B Block', 'C Block', 'Mess Hall', 'Gym Hall']);

const COUNTRY_CODES = [
  { code: '+966', flag: '🇸🇦' },
  { code: '+971', flag: '🇦🇪' },
  { code: '+965', flag: '🇰🇼' },
  { code: '+973', flag: '🇧🇭' },
  { code: '+968', flag: '🇴🇲' },
  { code: '+974', flag: '🇶🇦' },
  { code: '+20', flag: '🇪🇬' },
  { code: '+962', flag: '🇯🇴' },
  { code: '+91', flag: '🇮🇳' },
  { code: '+92', flag: '🇵🇰' },
  { code: '+63', flag: '🇵🇭' },
  { code: '+880', flag: '🇧🇩' },
];

const t = {
  en: {
    request: 'Request', track: 'Track', admin: 'Command Center', adminLogin: 'Admin Login',
    submit: 'Submit Request', scanning: 'Scanning...', scan: 'Scan QR',
    employeeId: 'Employee ID', name: 'Full Name', room: 'Select Location', asset: 'Select Asset',
    phoneNumber: 'Phone Number', emailAddress: 'Email',
    phoneRequired: 'Phone number is required so we can notify you on WhatsApp.',
    duplicateTicket: 'An active ticket already exists for this issue in this location.',
    issue: 'Issue Type', priority: 'Priority', notes: 'Additional Notes',
    low: 'Low', medium: 'Medium', high: 'High',
    statusNew: 'New', inProgress: 'In Progress', resolved: 'Resolved', closed: 'Closed', rejected: 'Rejected',
    total: 'Total Tickets', active: 'Active Issues', breached: 'SLA Breached', spend: 'Total Spend (SAR)',
    print: 'Print', assign: 'Assign Technician', cost: 'Total Cost (SAR)', parts: 'Parts Used',
    unitPrice: 'Unit Price (SAR)', units: 'Units',
    reporterInfo: 'Reporter Details', reporterPhone: 'Phone Number', reporterEmail: 'Email', reportedAt: 'Reported At',
    reporterPhoto: 'Photo Attached by Reporter', emailRequired: 'Email is required.',
    markResolved: 'Mark Resolved', markClosed: 'Close Ticket',
    search: 'Enter exact Ticket Number (e.g., FMC-2026-0001)',
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
    deleteLocation: 'Delete Location',
    facilityDepartment: 'Facility Department',
    dhahranRooms: 'Dhahran Rooms', mgsRooms: 'MGS Rooms',
    filterSite: 'All Sites', site: 'Site (e.g. Dhahran, MGS)', roomsSuffix: 'Rooms',
    manageLocations: 'Manage Locations', locationManager: 'Location Manager',
    addLocation: 'Add Location', addNewLocation: 'Add New Location',
    roomName: 'Room Name', floor: 'Floor', assetsComma: 'Assets (comma separated)',
    editRoom: 'Edit', saveChanges: 'Save Changes',
    manageStaff: 'Manage Staff', staffManager: 'Staff Manager',
    newStaffUser: 'New Username', staffPassword: 'Password', createStaff: 'Add Staff',
    deleteStaff: 'Remove', staffRole: 'Role',
    staffFullName: 'Full Name', staffPhone: 'Phone (WhatsApp)', staffEmail: 'Email',
    staffSite: 'Site',
    role_admin: 'Main Admin', role_site_admin: 'Site Admin', role_sub_admin: 'Sub Admin',
    role_facility: 'Facility Staff', role_viewer: 'Viewer',
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
    uploadFixPhoto: 'Upload Fix Photo & Resolve',
    uploading: 'Uploading...', photoRequired: 'Please choose a photo first.',
    uploadFailed: 'Photo upload failed.',
    issuePhoto: 'Issue Photo (optional)', takePhoto: 'Take Photo', choosePhoto: 'Choose from Gallery',
    removePhoto: 'Remove photo', photoUploadNote: 'The photo helps the technician understand the issue faster.',
    photoTooLarge: 'Photo is too large. Please choose a smaller one.',
    photoUploadWarn: 'Your ticket was created, but the photo could not be uploaded.',
    updatesComments: 'Updates & Comments',
    technicianFixPhoto: 'Technician Fix Photo', internalOnly: 'Internal — not visible to the requester.',
    noUpdates: 'No updates yet. Check back soon.',
    userNotes: 'User Notes / Description', noNotes: 'No description provided.',
    notifications: 'Notifications', noNotifications: 'No notifications yet.',
    reportDaily: 'Daily', reportWeekly: 'Weekly', reportMonthly: 'Monthly',
    reportTotal: 'Total Tickets', reportResolved: 'Resolved Tickets', reportCost: 'Total Cost (SAR)',
    reportDateCol: 'Date', reportLocationAsset: 'Location / Asset', reportAssignee: 'Assignee',
    reportGenerated: 'Generated', reportCompany: 'Facility Maintenance Center — FMC (Bin Quraya)',
    reportNoTickets: 'No tickets in this period.',
  },
  ar: {
    request: 'طلب صيانة', track: 'تتبع', admin: 'لوحة القيادة', adminLogin: 'دخول الإدارة',
    submit: 'إرسال الطلب', scanning: 'جاري المسح...', scan: 'مسح الباركود',
    employeeId: 'الرقم الوظيفي', name: 'الاسم الكامل', room: 'اختر الموقع', asset: 'اختر الأصل',
    phoneNumber: 'رقم الهاتف', emailAddress: 'البريد الإلكتروني',
    phoneRequired: 'رقم الهاتف مطلوب حتى نتمكن من إشعارك عبر واتساب.',
    duplicateTicket: 'توجد تذكرة نشطة بالفعل لهذه المشكلة في هذا الموقع.',
    issue: 'نوع المشكلة', priority: 'الأولوية', notes: 'ملاحظات إضافية',
    low: 'منخفض', medium: 'متوسط', high: 'عالي',
    statusNew: 'جديد', inProgress: 'قيد التنفيذ', resolved: 'تم الحل', closed: 'مغلق', rejected: 'مرفوض',
    total: 'إجمالي التذاكر', active: 'الطلبات النشطة', breached: 'تجاوز الوقت', spend: 'إجمالي التكلفة (ريال)',
    print: 'طباعة', assign: 'تعيين فني', cost: 'التكلفة الإجمالية (ريال)', parts: 'القطع المستخدمة',
    unitPrice: 'سعر الوحدة (ريال)', units: 'عدد الوحدات',
    reporterInfo: 'بيانات مقدم البلاغ', reporterPhone: 'رقم الجوال', reporterEmail: 'البريد الإلكتروني', reportedAt: 'تاريخ البلاغ',
    reporterPhoto: 'الصورة المرفقة من مقدم البلاغ', emailRequired: 'البريد الإلكتروني مطلوب.',
    markResolved: 'تم الحل', markClosed: 'إغلاق التذكرة',
    search: 'أدخل رقم التذكرة بالضبط (مثال: FMC-2026-0001)',
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
    deleteLocation: 'حذف الموقع',
    facilityDepartment: 'إدارة المرافق',
    dhahranRooms: 'غرف الظهران', mgsRooms: 'غرف MGS',
    filterSite: 'كل المواقع', site: 'الموقع (مثال: الظهران، MGS)', roomsSuffix: 'غرف',
    manageLocations: 'إدارة المواقع', locationManager: 'مدير المواقع',
    addLocation: 'إضافة موقع', addNewLocation: 'إضافة موقع جديد',
    roomName: 'اسم الغرفة', floor: 'الطابق', assetsComma: 'الأصول (مفصولة بفاصلة)',
    editRoom: 'تعديل', saveChanges: 'حفظ التغييرات',
    manageStaff: 'إدارة الموظفين', staffManager: 'مدير الموظفين',
    newStaffUser: 'اسم المستخدم', staffPassword: 'كلمة المرور', createStaff: 'إضافة موظف',
    deleteStaff: 'إزالة', staffRole: 'الدور',
    staffFullName: 'الاسم الكامل', staffPhone: 'رقم الجوال (واتساب)', staffEmail: 'البريد الإلكتروني',
    staffSite: 'الموقع',
    role_admin: 'مدير رئيسي', role_site_admin: 'مدير موقع', role_sub_admin: 'مدير فرعي',
    role_facility: 'موظف صيانة', role_viewer: 'مشاهد',
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
    uploadFixPhoto: 'رفع صورة الإصلاح وإغلاق البلاغ',
    uploading: 'جاري الرفع...', photoRequired: 'يرجى اختيار صورة أولاً.',
    uploadFailed: 'فشل رفع الصورة.',
    issuePhoto: 'صورة المشكلة (اختياري)', takePhoto: 'التقاط صورة', choosePhoto: 'اختيار من الاستوديو',
    removePhoto: 'إزالة الصورة', photoUploadNote: 'الصورة تساعد الفني على فهم المشكلة بشكل أسرع.',
    photoTooLarge: 'الصورة كبيرة جداً. يرجى اختيار صورة أصغر.',
    photoUploadWarn: 'تم إنشاء التذكرة، لكن تعذّر رفع الصورة.',
    updatesComments: 'التحديثات والتعليقات',
    technicianFixPhoto: 'صورة الإصلاح من الفني', internalOnly: 'داخلي — غير مرئي لمقدم الطلب.',
    noUpdates: 'لا توجد تحديثات بعد. تحقق لاحقاً.',
    userNotes: 'ملاحظات المستخدم / الوصف', noNotes: 'لم يتم تقديم وصف.',
    notifications: 'الإشعارات', noNotifications: 'لا توجد إشعارات بعد.',
    reportDaily: 'يومي', reportWeekly: 'أسبوعي', reportMonthly: 'شهري',
    reportTotal: 'إجمالي التذاكر', reportResolved: 'التذاكر المحلولة', reportCost: 'التكلفة الإجمالية (ريال)',
    reportDateCol: 'التاريخ', reportLocationAsset: 'الموقع / الأصل', reportAssignee: 'الفني المسؤول',
    reportGenerated: 'تاريخ الإنشاء', reportCompany: 'مركز صيانة المرافق FMC (بن قرية)',
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
  const [adminSite, setAdminSite] = useState(localStorage.getItem('ssc_admin_site') || '');
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
    localStorage.removeItem('ssc_admin_site');
    localStorage.removeItem('ssc_admin_user');
    setAdminToken('');
    setAdminRole('');
    setView('request');
  };

  return (
    <div className={`min-h-[100dvh] bg-industrial-50 dark:bg-industrial-950 text-industrial-950 dark:text-industrial-50 transition-colors duration-300 ${fontClass}`}>
      <nav className="fixed top-0 inset-x-0 z-40 bg-white/80 dark:bg-industrial-950/80 backdrop-blur-xl border-b border-industrial-200/50 dark:border-industrial-800/50 shadow-sm print:hidden">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <button type="button" onClick={() => setView('request')} className="flex items-center gap-4 group">
            <div className="bg-white dark:bg-industrial-900 p-2 rounded-xl shadow-premium group-hover:scale-105 transition-transform duration-300">
              <BrandLogo className="h-10 w-auto object-contain" />
            </div>
            <div className="flex flex-col items-start hidden sm:flex">
              <span className="font-extrabold tracking-tight text-xl leading-none text-industrial-900 dark:text-white">FMC</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-accent-600 dark:text-accent-500">Bin Quraya</span>
            </div>
          </button>

          <div className="flex items-center bg-industrial-100/50 dark:bg-industrial-900/50 p-1.5 rounded-2xl border border-industrial-200/50 dark:border-industrial-800/50">
            <NavBtn active={view === 'request'} onClick={() => setView('request')}>{dict.request}</NavBtn>
            <NavBtn active={view === 'track'} onClick={() => setView('track')}>{dict.track}</NavBtn>
            <NavBtn active={view === 'admin'} onClick={() => setView('admin')}>
              {adminToken ? dict.admin : dict.adminLogin}
            </NavBtn>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
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
              <button type="button" onClick={handleLogout} className="p-2.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/30 text-industrial-500 hover:text-red-600 transition-colors" aria-label={dict.logout}>
                <LogOut size={18} />
              </button>
            )}
            <div className="w-px h-6 bg-industrial-200 dark:bg-industrial-800 mx-1 hidden sm:block" />
            <button type="button" onClick={() => setLang((l) => (l === 'en' ? 'ar' : 'en'))} className="p-2.5 rounded-xl hover:bg-industrial-100 dark:hover:bg-industrial-900 transition-colors text-industrial-600 dark:text-industrial-400">
              <Globe size={18} />
            </button>
            <button type="button" onClick={() => setTheme((th) => (th === 'light' ? 'dark' : 'light'))} className="p-2.5 rounded-xl hover:bg-industrial-100 dark:hover:bg-industrial-900 transition-colors text-industrial-600 dark:text-industrial-400">
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
        </div>
      </nav>

      <main className="pt-28 pb-12 px-4 sm:px-6 max-w-7xl mx-auto min-h-[90vh] animate-fade-in">
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
                adminSite={adminSite}
                adminUser={adminUser}
                focusTicketId={focusTicketId}
                onFocusHandled={() => setFocusTicketId('')}
              />
            )
            : <AdminLogin dict={dict} setToken={setAdminToken} setRole={setAdminRole} setSite={setAdminSite} />
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
        className="relative p-2.5 rounded-xl hover:bg-white/50 dark:hover:bg-industrial-800/50 transition-colors text-industrial-600 dark:text-industrial-400 group"
        aria-label={dict.notifications}
      >
        <Bell size={18} className="group-hover:text-industrial-900 dark:group-hover:text-white transition-colors" />
        {unread > 0 && (
          <span className="absolute -top-1 -end-1 min-w-[20px] h-[20px] px-1 rounded-full bg-accent-500 text-white text-[10px] font-extrabold flex items-center justify-center border-2 border-white dark:border-industrial-950 shadow-sm">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 mt-3 w-80 max-h-96 overflow-y-auto glass-panel rounded-2xl p-2 animate-fade-in origin-top-right">
          <p className="text-[10px] font-extrabold text-industrial-400 uppercase tracking-widest px-3 py-2">{dict.notifications}</p>
          {notifications.length === 0 ? (
            <p className="text-sm text-industrial-400 px-3 pb-3 font-medium">{dict.noNotifications}</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleNotificationClick(n)}
                className={`w-full text-start px-3 py-3 rounded-xl hover:bg-industrial-50 dark:hover:bg-industrial-900/50 transition-colors group ${n.isRead ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start gap-3">
                  {!n.isRead && <span className="mt-1.5 w-2 h-2 rounded-full bg-accent-500 shrink-0 shadow-[0_0_8px_rgba(249,140,7,0.5)]" />}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-snug break-words text-industrial-900 dark:text-industrial-50 group-hover:text-accent-600 dark:group-hover:text-accent-400 transition-colors">{n.message}</p>
                    <p className="text-[10px] font-mono text-industrial-400 mt-1">{formatHistoryDate(n.createdAt)}</p>
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
    <button type="button" onClick={onClick} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${active ? 'bg-white dark:bg-industrial-800 text-accent-600 dark:text-accent-400 shadow-sm' : 'text-industrial-600 dark:text-industrial-400 hover:text-industrial-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-industrial-800/50'}`}>
      {children}
    </button>
  );
}

function AdminLogin({ setToken, setRole, setSite, dict }) {
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
        localStorage.setItem('ssc_admin_site', data.site || '');
        localStorage.setItem('ssc_admin_user', decodeJwtPayload(data.token)?.user || '');
        setToken(data.token);
        setRole(data.role || 'admin');
        setSite(data.site || '');
      } else {
        alert(dict.invalidCredentials);
      }
    } catch {
      alert(dict.backendError);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-12 lg:mt-24 glass-panel p-8 sm:p-10 rounded-[2.5rem] animate-slide-up relative overflow-hidden">
      <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-accent-400 to-accent-600" />
      <div className="text-center mb-10">
        <div className="bg-white dark:bg-industrial-900 w-20 h-20 mx-auto rounded-2xl shadow-premium flex items-center justify-center mb-6">
          <BrandLogo className="h-12 w-auto object-contain" />
        </div>
        <h2 className="text-3xl font-extrabold tracking-tighter text-industrial-900 dark:text-white">{dict.loginTitle}</h2>
        <p className="text-industrial-500 text-sm mt-2 font-medium">{dict.loginSubtitle}</p>
      </div>
      <form onSubmit={handleLogin} className="space-y-5">
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-industrial-500 uppercase tracking-wider ms-1">{dict.username}</label>
          <input type="text" placeholder={dict.username} required value={user} onChange={(e) => setUser(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" className="w-full border border-industrial-200 dark:border-industrial-800 rounded-2xl px-5 py-4 bg-white/50 dark:bg-industrial-900/50 focus:border-accent-500 dark:focus:border-accent-400 outline-none focus:ring-4 focus:ring-accent-500/10 transition-all font-medium" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-industrial-500 uppercase tracking-wider ms-1">{dict.password}</label>
          <input type="password" placeholder={dict.password} required value={pass} onChange={(e) => setPass(e.target.value)} className="w-full border border-industrial-200 dark:border-industrial-800 rounded-2xl px-5 py-4 bg-white/50 dark:bg-industrial-900/50 focus:border-accent-500 dark:focus:border-accent-400 outline-none focus:ring-4 focus:ring-accent-500/10 transition-all font-medium" />
        </div>
        <button type="submit" className="w-full bg-industrial-900 text-white dark:bg-white dark:text-industrial-900 font-bold py-4 rounded-2xl mt-8 hover:bg-accent-600 dark:hover:bg-accent-500 hover:text-white transition-all duration-300 shadow-premium hover:shadow-premium-hover hover:-translate-y-0.5">{dict.loginBtn}</button>
      </form>
    </div>
  );
}

function QRScannerModal({ onScan, onClose }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 print:hidden">
      <div className="bg-white dark:bg-industrial-950 p-6 rounded-2xl w-full max-w-md shadow-2xl">
        <h3 className="text-xl font-extrabold mb-4 text-center">Scan Room QR</h3>
        <div className="w-full overflow-hidden rounded-xl border border-industrial-200 dark:border-industrial-800 bg-black aspect-square flex items-center justify-center">
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
    name: '', employeeId: '', countryCode: '+966', phoneNumber: '', email: '', roomId: '', asset: '', issue: '', priority: '', notes: '',
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
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [photoWarning, setPhotoWarning] = useState('');
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const photoSelectionRef = useRef(0);

  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const handlePhotoSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const selectionId = ++photoSelectionRef.current;
    try {
      const compressed = await compressImage(file);
      if (selectionId !== photoSelectionRef.current) return;
      if (compressed.size > 5 * 1024 * 1024) {
        alert(dict.photoTooLarge);
        return;
      }
      setPhotoFile(compressed);
      setPhotoPreview(URL.createObjectURL(compressed));
    } catch {
      if (selectionId === photoSelectionRef.current) alert(dict.uploadFailed);
    }
  };

  const clearPhoto = () => {
    photoSelectionRef.current += 1;
    setPhotoFile(null);
    setPhotoPreview('');
  };

  const isOther = form.issue === 'Other';
  const isValid = hasValidToken && form.name && form.employeeId && form.phoneNumber.trim() !== ''
    && form.roomId && form.asset
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

    // Strip separators and any leading zeros so "+966" + "0501234567" → "+966501234567"
    const localDigits = form.phoneNumber.replace(/\D/g, '').replace(/^0+/, '');
    const fullPhone = form.countryCode + localDigits;

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
          phone: fullPhone,
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

      let photoFailed = false;
      if (photoFile && ticket?.id) {
        try {
          const photoForm = new FormData();
          photoForm.append('image', photoFile, 'issue-photo.jpg');
          photoForm.append('qrToken', qrToken);
          const upRes = await fetch(`${API_BASE}/issues/${encodeURIComponent(ticket.id)}/attachments`, {
            method: 'POST',
            body: photoForm,
          });
          if (!upRes.ok) photoFailed = true;
        } catch {
          // Ticket is already created — photo upload failure should not block success.
          photoFailed = true;
        }
      }

      setPhotoWarning(photoFailed ? dict.photoUploadWarn : '');
      setSuccessTicket(ticket);
      clearPhoto();
      setForm({ name: '', employeeId: '', countryCode: '+966', phoneNumber: '', email: '', roomId: form.roomId, asset: '', issue: '', priority: '', notes: '' });
    } catch {
      setSubmitError(dict.backendError);
    } finally {
      setSubmitting(false);
    }
  };

  if (successTicket) {
    return (
      <div className="max-w-2xl mx-auto print:hidden text-center animate-fade-in">
        <BrandLogo className="h-14 w-auto drop-shadow-sm object-contain mx-auto mb-8" />
        <div className="glass-panel p-10 sm:p-12 relative overflow-hidden rounded-[2.5rem]">
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-emerald-400 to-emerald-600" />
          <div className="w-20 h-20 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-8 shadow-sm">
            <Check size={40} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tighter mb-3 text-industrial-900 dark:text-white">{dict.submitSuccess}</h2>
          <p className="text-industrial-500 dark:text-industrial-400 mb-6 font-medium text-lg">{dict.ticketCreated}</p>
          <div className="bg-industrial-50 dark:bg-industrial-900/50 py-6 px-8 rounded-2xl border border-industrial-100 dark:border-industrial-800 mb-8 inline-block">
            <p className="text-5xl font-mono font-extrabold text-industrial-900 dark:text-white tracking-tight">{successTicket.id}</p>
          </div>
          {photoWarning && (
            <div className="bg-accent-50 dark:bg-accent-950/30 border border-accent-200 dark:border-accent-900 rounded-2xl p-4 text-accent-700 dark:text-accent-400 text-sm font-bold mb-8">{photoWarning}</div>
          )}
          <button type="button" onClick={() => setSuccessTicket(null)} className="w-full bg-industrial-900 text-white dark:bg-white dark:text-industrial-900 py-4 rounded-2xl font-extrabold text-lg transition-all shadow-premium hover:shadow-premium-hover hover:-translate-y-0.5">
            {dict.submitAnother}
          </button>
        </div>
      </div>
    );
  }

  if (!hasValidToken) {
    return (
      <div className="max-w-2xl mx-auto print:hidden text-center animate-fade-in">
        <BrandLogo className="h-14 w-auto drop-shadow-sm object-contain mx-auto mb-8" />
        <div className="glass-panel p-10 sm:p-12 relative overflow-hidden rounded-[2.5rem]">
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-accent-400 to-accent-600" />
          <div className="w-24 h-24 rounded-3xl bg-accent-100/50 dark:bg-accent-900/30 flex items-center justify-center mx-auto mb-8 shadow-sm">
            <QrCode size={48} className="text-accent-600 dark:text-accent-500" />
          </div>
          <h2 className="text-3xl font-extrabold tracking-tighter mb-4 text-industrial-900 dark:text-white">{dict.scanQrRequired}</h2>
          <button type="button" onClick={() => setShowScanner(true)} className="mt-6 w-full sm:w-auto bg-industrial-900 text-white dark:bg-white dark:text-industrial-900 px-10 py-5 rounded-2xl font-extrabold text-lg inline-flex items-center justify-center gap-3 transition-all shadow-premium hover:shadow-premium-hover hover:-translate-y-0.5">
            <QrCode size={24} /> {dict.scan}
          </button>
        </div>
        {showScanner && <QRScannerModal onClose={() => setShowScanner(false)} onScan={handleScanSuccess} />}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto print:hidden animate-fade-in">
      {showScanner && <QRScannerModal onClose={() => setShowScanner(false)} onScan={handleScanSuccess} />}
      <div className="mb-12 text-center">
        <div className="bg-white dark:bg-industrial-900 w-20 h-20 mx-auto rounded-2xl shadow-premium flex items-center justify-center mb-6">
          <BrandLogo className="h-12 w-auto object-contain" />
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tighter mb-3 text-industrial-900 dark:text-white">{dict.request}</h1>
        <p className="text-industrial-500 dark:text-industrial-400 font-medium">{dict.requestSubtitle}</p>
      </div>

      <form onSubmit={submit} className="glass-panel rounded-[2.5rem] p-6 sm:p-12 space-y-8 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-industrial-900 to-industrial-700 dark:from-white dark:to-industrial-200" />

        {departmentName && (
          <div className="inline-flex items-center gap-2 bg-industrial-100 dark:bg-industrial-900 px-4 py-2 rounded-full text-sm font-bold">
            <span className="text-industrial-500 dark:text-industrial-400">{dict.department}:</span> {departmentName}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Input label={dict.name} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label={dict.employeeId} value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="text-sm font-bold text-industrial-900 dark:text-industrial-50 block mb-2">{dict.phoneNumber}</label>
            <div className="flex gap-2" dir="ltr">
              <select
                value={form.countryCode}
                onChange={(e) => setForm({ ...form, countryCode: e.target.value })}
                className="border border-industrial-200 dark:border-industrial-800 rounded-2xl px-3 py-4 bg-transparent focus:border-industrial-900 dark:focus:border-industrial-50 outline-none appearance-none transition-all font-medium shrink-0"
              >
                {COUNTRY_CODES.map((c) => <option key={c.code} value={c.code} className="text-black">{c.flag} {c.code}</option>)}
              </select>
              <input
                type="tel"
                required
                inputMode="numeric"
                placeholder="5X XXX XXXX"
                value={form.phoneNumber}
                onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                className="w-full border border-industrial-200 dark:border-industrial-800 rounded-2xl px-5 py-4 bg-transparent focus:border-industrial-900 dark:focus:border-industrial-50 focus:ring-1 focus:ring-accent-500/20 outline-none transition-all"
              />
            </div>
            <p className="text-xs text-industrial-500 dark:text-industrial-400 mt-2">{dict.phoneRequired}</p>
          </div>
          <Input label={dict.emailAddress} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>

        <hr className="border-gray-100 dark:border-zinc-900" />

        <div className="space-y-6 bg-industrial-50 dark:bg-industrial-900/50 p-6 rounded-3xl border border-industrial-100 dark:border-industrial-800/50">
          <div>
            <label className="text-sm font-bold text-industrial-900 dark:text-industrial-50 block mb-2">{dict.room}</label>
            <div className="w-full border border-industrial-200 dark:border-industrial-800 rounded-2xl px-5 py-4 bg-industrial-100 dark:bg-industrial-900 font-medium">
              {resolvedRoomName}
              <p className="text-xs text-industrial-500 dark:text-industrial-400 mt-1">{dict.roomLocked}</p>
            </div>
          </div>
          <div>
            <label className="text-sm font-bold text-industrial-900 dark:text-industrial-50 block mb-2">{dict.asset}</label>
            <Select value={form.asset} onChange={(e) => setForm({ ...form, asset: e.target.value })} options={assets} placeholder={dict.selectPlaceholder} />
          </div>
        </div>

        <div>
          <label className="text-sm font-bold text-industrial-900 dark:text-industrial-50 block mb-2">{dict.issue}</label>
          <Select disabled={!form.asset} value={form.issue} onChange={(e) => setForm({ ...form, issue: e.target.value })} options={ISSUES} placeholder={dict.selectPlaceholder} />
        </div>

        <div>
          <label className="text-sm font-bold text-industrial-900 dark:text-industrial-50 block mb-3">{dict.priority}</label>
          <div className="grid grid-cols-3 gap-3">
            <RadioCard label={dict.low} active={form.priority === 'Low'} onClick={() => setForm({ ...form, priority: 'Low' })} />
            <RadioCard label={dict.medium} active={form.priority === 'Medium'} onClick={() => setForm({ ...form, priority: 'Medium' })} />
            <RadioCard label={dict.high} active={form.priority === 'High'} onClick={() => setForm({ ...form, priority: 'High' })} />
          </div>
        </div>

        <div>
          <label className="text-sm font-bold text-industrial-900 dark:text-industrial-50 block mb-2">{dict.notes}</label>
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={250} rows={3} className={`w-full border rounded-2xl px-5 py-4 bg-transparent outline-none transition-all ${isOther && !form.notes ? 'border-red-500 ring-1 ring-red-500' : 'border-industrial-200 dark:border-industrial-800 focus:border-industrial-900 dark:focus:border-industrial-50'}`} />
          {isOther && !form.notes && <p className="text-red-500 text-xs mt-2 font-semibold" aria-live="polite">{dict.otherRequired}</p>}
        </div>

        <div>
          <label className="text-sm font-bold text-industrial-900 dark:text-industrial-50 block mb-2">{dict.issuePhoto}</label>
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoSelected} className="hidden" />
          <input ref={galleryInputRef} type="file" accept="image/*" onChange={handlePhotoSelected} className="hidden" />
          {photoPreview ? (
            <div className="relative rounded-2xl overflow-hidden border border-industrial-200 dark:border-industrial-800">
              <img src={photoPreview} alt={dict.issuePhoto} className="w-full max-h-64 object-cover" />
              <button
                type="button"
                onClick={clearPhoto}
                className="absolute top-3 end-3 bg-black/70 text-white rounded-full p-2 hover:bg-black transition-colors"
                aria-label={dict.removePhoto}
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="border border-industrial-200 dark:border-industrial-800 rounded-2xl px-4 py-4 font-bold text-sm flex items-center justify-center gap-2 hover:border-black dark:hover:border-white transition-colors"
              >
                <Camera size={18} /> {dict.takePhoto}
              </button>
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="border border-industrial-200 dark:border-industrial-800 rounded-2xl px-4 py-4 font-bold text-sm flex items-center justify-center gap-2 hover:border-black dark:hover:border-white transition-colors"
              >
                <ImagePlus size={18} /> {dict.choosePhoto}
              </button>
            </div>
          )}
          <p className="text-xs text-industrial-500 dark:text-industrial-400 mt-2">{dict.photoUploadNote}</p>
        </div>

        {submitError && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-2xl p-4 text-red-700 dark:text-red-400 text-sm font-semibold">{submitError}</div>
        )}

        <button type="submit" disabled={!isValid || submitting} className="w-full bg-industrial-900 text-white dark:bg-industrial-50 dark:text-industrial-900 hover:bg-industrial-800 dark:hover:bg-industrial-200 py-4 rounded-2xl font-extrabold text-lg flex items-center justify-center gap-2 hover:bg-gray-900 dark:hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-[0.98]">
          {submitting ? dict.scanning : dict.submit} {!submitting && <ArrowRight size={20} className="rtl:rotate-180" />}
        </button>
      </form>
    </div>
  );
}

function Input({ label, value, onChange, type = 'text', required }) {
  return (
    <div>
      <label className="text-xs font-extrabold text-industrial-500 dark:text-industrial-400 block mb-2 uppercase tracking-widest">{label}</label>
      <input type={type} required={required} value={value} onChange={onChange} className="w-full border border-industrial-200 dark:border-industrial-800 rounded-2xl px-5 py-4 bg-white/50 dark:bg-industrial-900/50 backdrop-blur-xl focus:border-accent-500 dark:focus:border-accent-400 outline-none transition-all shadow-sm focus:ring-4 focus:ring-accent-500/10 font-bold text-industrial-900 dark:text-white" />
    </div>
  );
}

function Select({ value, onChange, options, disabled, placeholder }) {
  return (
    <select disabled={disabled} value={value} onChange={onChange} className="w-full border border-industrial-200 dark:border-industrial-800 rounded-2xl px-5 py-4 bg-white/50 dark:bg-industrial-900/50 backdrop-blur-xl focus:border-accent-500 dark:focus:border-accent-400 outline-none appearance-none disabled:opacity-40 transition-all font-bold shadow-sm focus:ring-4 focus:ring-accent-500/10 text-industrial-900 dark:text-white">
      <option value="" disabled>{placeholder}</option>
      {options.map((o) => <option key={o} value={o} className="text-industrial-900">{o}</option>)}
    </select>
  );
}

function RadioCard({ label, active, onClick }) {
  const activeClass = 'bg-accent-500 text-white border-accent-500 shadow-[0_0_20px_rgba(249,140,7,0.3)] ring-2 ring-accent-500/20';
  const inactiveClass = 'border-industrial-200 bg-white/50 dark:bg-industrial-900/50 dark:border-industrial-800 text-industrial-500 dark:text-industrial-400 hover:border-industrial-300 dark:hover:border-industrial-700 hover:bg-white dark:hover:bg-industrial-800';

  return (
    <button type="button" onClick={onClick} className={`py-4 px-2 rounded-2xl border font-extrabold text-sm text-center transition-all shadow-sm active:scale-[0.98] ${active ? activeClass : inactiveClass}`}>
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
        <div className="bg-white dark:bg-industrial-900 w-20 h-20 mx-auto rounded-2xl shadow-premium flex items-center justify-center mb-6">
          <BrandLogo className="h-12 w-auto object-contain" />
        </div>
        <h2 className="text-3xl font-extrabold tracking-tighter mb-2 text-industrial-900 dark:text-white">{dict.track}</h2>
        <p className="text-industrial-500 dark:text-industrial-400 text-sm font-medium">{dict.trackSubtitle}</p>
        <p className="text-accent-600 dark:text-accent-500 text-sm font-bold mt-4 max-w-md mx-auto">{dict.trackVerifyHint}</p>
      </div>
      <div className="space-y-4 mb-12">
        <div className="relative group">
          <Search className="absolute start-6 top-1/2 -translate-y-1/2 text-industrial-400 group-focus-within:text-accent-500 transition-colors" size={24} />
          <input
            type="text"
            placeholder={dict.search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSearch && !loading) runSearch(); }}
            className="w-full ps-16 pe-6 py-5 text-lg font-bold bg-white/80 dark:bg-industrial-900/80 border border-industrial-200 dark:border-industrial-800 rounded-3xl outline-none focus:border-accent-500 dark:focus:border-accent-400 focus:ring-4 focus:ring-accent-500/10 transition-all shadow-sm backdrop-blur-xl"
          />
        </div>
        <input
          type="text"
          placeholder={dict.searchEmployeeId}
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && canSearch && !loading) runSearch(); }}
          className="w-full px-6 py-5 text-lg font-bold bg-white/80 dark:bg-industrial-900/80 border border-industrial-200 dark:border-industrial-800 rounded-3xl outline-none focus:border-accent-500 dark:focus:border-accent-400 focus:ring-4 focus:ring-accent-500/10 transition-all shadow-sm backdrop-blur-xl"
        />
        <button
          type="button"
          onClick={runSearch}
          disabled={loading || !canSearch}
          className="w-full bg-industrial-900 text-white dark:bg-white dark:text-industrial-900 py-4 rounded-2xl text-lg font-extrabold disabled:opacity-40 transition-all hover:bg-accent-600 dark:hover:bg-accent-500 hover:text-white shadow-premium hover:-translate-y-0.5"
        >
          {loading ? '...' : dict.track}
        </button>
      </div>

      <div className="space-y-6">
        {searched && !loading && results.length === 0 && (
          <p className="text-center text-industrial-500 dark:text-industrial-400 font-medium">{dict.trackNotFound}</p>
        )}
        {results.map((ticket) => (
          <div key={ticket.id} className={`glass-panel rounded-[2rem] p-8 ${ticket.status === 'Rejected' ? 'border-red-300 dark:border-red-900' : ''}`}>
            <div className="flex justify-between items-start mb-8">
              <div>
                <h3 className="text-2xl font-extrabold tracking-tight mb-1 text-industrial-900 dark:text-white">{ticket.issue}</h3>
                <p className="text-industrial-500 dark:text-industrial-400 font-medium">{ticket.room} — {ticket.asset}</p>
                {ticket.status === 'Rejected' && ticket.rejectionReason && (
                  <p className="text-sm text-red-600 dark:text-red-400 mt-2 font-bold">{ticket.rejectionReason}</p>
                )}
              </div>
              <span className={`font-mono font-bold px-3 py-1 rounded-lg shadow-sm ${ticket.status === 'Rejected' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'text-industrial-600 bg-industrial-100 dark:bg-industrial-900 dark:text-industrial-300'}`}>
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
                <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 bg-industrial-100 dark:bg-industrial-800 -z-10" />
                <Step label={dict.statusNew} active done={ticket.status !== 'New'} />
                <Step label={dict.inProgress} active={['In Progress', 'Resolved', 'Completed', 'Closed'].includes(ticket.status)} done={['Resolved', 'Completed', 'Closed'].includes(ticket.status)} />
                <Step label={dict.resolved} active={['Resolved', 'Completed', 'Closed'].includes(ticket.status)} done={['Completed', 'Closed'].includes(ticket.status)} />
              </div>
            )}

            <div className="mt-10 pt-6 border-t border-industrial-100 dark:border-industrial-800">
              <h4 className="text-xs font-bold text-industrial-400 uppercase tracking-wider mb-4">{dict.updatesComments}</h4>
              {comments.length === 0 ? (
                <p className="text-sm text-industrial-400 font-medium">{dict.noUpdates}</p>
              ) : (
                <div className="space-y-3">
                  {comments.map((c) => (
                    <div key={c.id} className="bg-industrial-50 dark:bg-industrial-900/50 rounded-2xl px-5 py-4 border border-industrial-100 dark:border-industrial-800/50">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-sm font-bold text-industrial-900 dark:text-white">{c.userName}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase shadow-sm ${c.role === 'admin' ? 'bg-accent-500 text-white' : 'bg-industrial-200 text-industrial-800 dark:bg-industrial-800 dark:text-industrial-300'}`}>
                          {c.role}
                        </span>
                        <span className="text-[11px] font-mono text-industrial-400 ms-auto">{formatHistoryDate(c.createdAt)}</span>
                      </div>
                      <p className="text-sm text-industrial-700 dark:text-industrial-300 whitespace-pre-wrap font-medium">{c.commentText}</p>
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
      <div className="flex flex-col items-center gap-3 bg-white dark:bg-industrial-950 px-2">
        <div className="w-10 h-10 rounded-full flex items-center justify-center border-2 bg-red-500 border-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.35)]">
          <X size={18} strokeWidth={3} />
        </div>
        <span className="text-xs font-bold text-red-600 dark:text-red-400">{label}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 bg-white dark:bg-industrial-950 px-2">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${done ? 'bg-black border-black text-white dark:bg-white dark:border-white dark:text-black' : active ? 'border-industrial-900 dark:border-industrial-50 bg-white dark:bg-industrial-950 text-industrial-900 dark:text-industrial-50' : 'border-industrial-200 dark:border-industrial-800 bg-white dark:bg-industrial-950 text-gray-300'}`}>
        {done ? <Check size={16} strokeWidth={3} /> : <div className={`w-2.5 h-2.5 rounded-full ${active ? 'bg-industrial-900 dark:bg-industrial-50' : 'bg-transparent'}`} />}
      </div>
      <span className={`text-xs font-bold ${active ? 'text-industrial-900 dark:text-industrial-50' : 'text-industrial-400'}`}>{label}</span>
    </div>
  );
}

function AdminDashboard({
  dict, tickets, setTickets, adminToken, adminRole, adminSite, adminUser,
  focusTicketId, onFocusHandled,
}) {
  // Role tiers: 'admin' = main admin (all sites), 'site_admin' = admin of one
  // site, 'sub_admin' = limited admin of one site (tickets only).
  const isMainAdmin = adminRole === 'admin';
  const isManager = adminRole === 'admin' || adminRole === 'site_admin';
  const isAdmin = isManager || adminRole === 'sub_admin';
  const isSiteScoped = adminRole === 'site_admin' || adminRole === 'sub_admin';
  const isViewer = adminRole === 'viewer';
  const [printReportConfig, setPrintReportConfig] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const selectedTicketIdRef = useRef(null);
  selectedTicketIdRef.current = selectedTicket?.id || null;
  const [showMineOnly, setShowMineOnly] = useState(!isAdmin && !isViewer);
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
  const [editRoomSite, setEditRoomSite] = useState('');
  const [allStaff, setAllStaff] = useState([]);
  const [newStaffUser, setNewStaffUser] = useState('');
  const [newStaffPass, setNewStaffPass] = useState('');
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('facility');
  const [newStaffSite, setNewStaffSite] = useState('');
  const [adminRooms, setAdminRooms] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [facilityUsers, setFacilityUsers] = useState([]);
  const [ticketHistory, setTicketHistory] = useState([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomAssets, setNewRoomAssets] = useState('');
  const [newRoomDept, setNewRoomDept] = useState('');
  const [newRoomSite, setNewRoomSite] = useState('');
  const [filters, setFilters] = useState({
    status: '', priority: '', departmentId: '', roomId: '', site: '', dateFrom: '', dateTo: '',
  });

  const baseUrl = import.meta.env.VITE_PUBLIC_BASE_URL || window.location.origin;

  const loadTickets = () => {
    const params = new URLSearchParams({ includeDeleted: 'true' });
    if (filters.status) params.set('status', filters.status);
    if (filters.priority) params.set('priority', filters.priority);
    if (filters.departmentId) params.set('department_id', filters.departmentId);
    if (filters.roomId) params.set('room_id', filters.roomId);
    if (filters.site) params.set('site', filters.site);
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

  const roomSite = (r) => r.site || (MGS_FLOORS.has(r.floor) ? 'MGS' : 'Dhahran');
  const siteOptions = [...new Set(adminRooms.map(roomSite))].sort();

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
      payload.unitPrice = merged.unitPrice;
      payload.units = merged.units;
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
    if (!isManager) return;
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
        body: JSON.stringify({ name, departmentId: newRoomDept, assets, site: newRoomSite.trim() || undefined }),
      });
      if (res.ok) {
        setNewRoomName('');
        setNewRoomAssets('');
        setNewRoomSite('');
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
    if (!isManager) return;
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
    setEditRoomSite(room.site || (MGS_FLOORS.has(room.floor) ? 'MGS' : 'Dhahran'));
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
        body: JSON.stringify({ name, floor: editRoomFloor.trim() || null, site: editRoomSite.trim() || null }),
      });
      if (res.ok) {
        const data = await res.json();
        setAdminRooms((prev) => prev.map((r) => (
          r.id === editingRoom.id ? { ...r, name: data.room.name, floor: data.room.floor, site: data.room.site } : r
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
    const role = newStaffRole || 'facility';
    const needsSite = role === 'site_admin' || role === 'sub_admin' || role === 'facility';
    const site = isSiteScoped ? adminSite : (needsSite ? (newStaffSite.trim() || 'Dhahran') : undefined);
    try {
      const res = await fetch(`${API_BASE}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          username,
          password: newStaffPass,
          role,
          site,
          fullName: newStaffName.trim(),
          phone: newStaffPhone.trim(),
          email: newStaffEmail.trim(),
        }),
      });
      if (res.ok) {
        setNewStaffUser('');
        setNewStaffPass('');
        setNewStaffName('');
        setNewStaffPhone('');
        setNewStaffEmail('');
        setNewStaffRole('facility');
        setNewStaffSite('');
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
    if (!isManager) return;
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
            <p className="text-sm text-industrial-500 dark:text-industrial-400 mt-1">{dict.adminSubtitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isManager && (
          <button
            type="button"
            onClick={() => setShowTicketTrash((v) => !v)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold transition-colors ${showTicketTrash ? 'bg-industrial-900 text-white dark:bg-industrial-50 dark:text-industrial-900 hover:bg-industrial-800 dark:hover:bg-industrial-200' : 'bg-gray-100 hover:bg-gray-200 dark:bg-zinc-900 dark:hover:bg-zinc-800'}`}
          >
            <Trash2 size={18} /> {showTicketTrash ? dict.hideTrash : dict.viewTrash}
          </button>
          )}
          {isManager && (
          <button type="button" onClick={() => setShowRoomModal(true)} className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-industrial-900 dark:text-industrial-50 px-4 py-2.5 rounded-xl font-bold transition-colors">
            <LayoutGrid size={18} /> {dict.manageLocations}
          </button>
          )}
          {isManager && (
          <button type="button" onClick={() => { setShowStaffModal(true); loadStaff(); }} className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-industrial-900 dark:text-industrial-50 px-4 py-2.5 rounded-xl font-bold transition-colors">
            <Users size={18} /> {dict.manageStaff}
          </button>
          )}
          {isAdmin && (
          <div className="flex items-center gap-1 bg-industrial-100 dark:bg-industrial-900 rounded-xl p-1">
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 print:hidden">
            <div className="md:col-span-2 glass-panel rounded-[2.5rem] p-6 sm:p-8 h-[22rem]">
              <h3 className="font-extrabold text-xl tracking-tight mb-6 text-industrial-900 dark:text-white">{dict.issuesByLocation}</h3>
              <ResponsiveContainer width="100%" height="85%">
                <BarChart data={chartRoomData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'currentColor' }} className="text-industrial-400" />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'currentColor' }} className="text-industrial-400" />
                  <Tooltip cursor={{ fill: 'rgba(255, 170, 26, 0.1)' }} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 40px -10px rgba(0,0,0,0.15)', background: 'var(--bg-main)', color: 'var(--text-main)', fontWeight: 'bold' }} />
                  <Bar dataKey="count" fill="currentColor" className="text-industrial-900 dark:text-white hover:opacity-80 transition-opacity" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="glass-panel rounded-[2.5rem] p-6 sm:p-8 h-[22rem]">
              <h3 className="font-extrabold text-xl tracking-tight mb-6 text-industrial-900 dark:text-white">{dict.statusOverview}</h3>
              <ResponsiveContainer width="100%" height="85%">
                <PieChart>
                  <Pie data={statusData} innerRadius={70} outerRadius={100} paddingAngle={8} dataKey="value" stroke="none">
                    <Cell fill="#f98c07" className="drop-shadow-sm" />
                    <Cell fill="#46628c" className="drop-shadow-sm" />
                    <Cell fill="#1d2537" className="dark:fill-white drop-shadow-sm" />
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 40px -10px rgba(0,0,0,0.15)', background: 'var(--bg-main)', color: 'var(--text-main)', fontWeight: 'bold' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {!isAdmin && !isViewer && !showTicketTrash && (
        <div className="flex gap-2 mb-4 print:hidden">
          <button
            type="button"
            onClick={() => setShowMineOnly(true)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${showMineOnly ? 'bg-industrial-900 text-white dark:bg-industrial-50 dark:text-industrial-900 hover:bg-industrial-800 dark:hover:bg-industrial-200' : 'bg-industrial-100 dark:bg-industrial-900 text-industrial-500 dark:text-industrial-400'}`}
          >
            {dict.myTickets} ({myTickets.length})
          </button>
          <button
            type="button"
            onClick={() => setShowMineOnly(false)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${!showMineOnly ? 'bg-industrial-900 text-white dark:bg-industrial-50 dark:text-industrial-900 hover:bg-industrial-800 dark:hover:bg-industrial-200' : 'bg-industrial-100 dark:bg-industrial-900 text-industrial-500 dark:text-industrial-400'}`}
          >
            {dict.allTickets} ({activeTickets.length})
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-6 print:hidden">
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="border border-industrial-200 dark:border-industrial-800 rounded-2xl px-5 py-3 text-sm font-bold bg-white/50 dark:bg-industrial-900/50 backdrop-blur-xl focus:border-accent-500 outline-none transition-all shadow-sm">
          <option value="">{dict.filterStatus}</option>
          <option value="New">New</option>
          <option value="In Progress">In Progress</option>
          <option value="Resolved">Resolved</option>
          <option value="Closed">Closed</option>
          <option value="Rejected">Rejected</option>
        </select>
        <select value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })} className="border border-industrial-200 dark:border-industrial-800 rounded-2xl px-5 py-3 text-sm font-bold bg-white/50 dark:bg-industrial-900/50 backdrop-blur-xl focus:border-accent-500 outline-none transition-all shadow-sm">
          <option value="">{dict.filterPriority}</option>
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
        </select>
        <select
          value={filters.departmentId}
          onChange={(e) => setFilters({ ...filters, departmentId: e.target.value, roomId: '' })}
          className="border border-industrial-200 dark:border-industrial-800 rounded-2xl px-5 py-3 text-sm font-bold bg-white/50 dark:bg-industrial-900/50 backdrop-blur-xl focus:border-accent-500 outline-none transition-all shadow-sm"
        >
          <option value="">{dict.filterDepartment}</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name_en}</option>)}
        </select>
        <select
          value={filters.roomId}
          onChange={(e) => setFilters({ ...filters, roomId: e.target.value })}
          className="border border-industrial-200 dark:border-industrial-800 rounded-2xl px-5 py-3 text-sm font-bold bg-white/50 dark:bg-industrial-900/50 backdrop-blur-xl focus:border-accent-500 outline-none transition-all shadow-sm max-w-[200px]"
        >
          <option value="">{dict.filterLocation}</option>
          {filterRoomOptions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        {!isSiteScoped && (
        <select
          value={filters.site}
          onChange={(e) => setFilters({ ...filters, site: e.target.value })}
          className="border border-industrial-200 dark:border-industrial-800 rounded-2xl px-5 py-3 text-sm font-bold bg-white/50 dark:bg-industrial-900/50 backdrop-blur-xl focus:border-accent-500 outline-none transition-all shadow-sm"
        >
          <option value="">{dict.filterSite}</option>
          {siteOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        )}
        <input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} className="border border-industrial-200 dark:border-industrial-800 rounded-2xl px-5 py-3 text-sm font-bold bg-white/50 dark:bg-industrial-900/50 backdrop-blur-xl focus:border-accent-500 outline-none transition-all shadow-sm" placeholder={dict.filterDateFrom} />
        <input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} className="border border-industrial-200 dark:border-industrial-800 rounded-2xl px-5 py-3 text-sm font-bold bg-white/50 dark:bg-industrial-900/50 backdrop-blur-xl focus:border-accent-500 outline-none transition-all shadow-sm" placeholder={dict.filterDateTo} />
        <button type="button" onClick={loadTickets} className="bg-industrial-900 text-white dark:bg-white dark:text-industrial-900 hover:bg-accent-600 dark:hover:bg-accent-500 hover:text-white px-6 py-3 rounded-2xl text-sm font-extrabold shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">{dict.applyFilters}</button>
      </div>

      <div className="glass-panel rounded-[2.5rem] overflow-hidden print:hidden mb-8">
        <div className="overflow-x-auto">
        <table className="w-full text-start text-sm whitespace-nowrap">
          <thead className="bg-industrial-100/50 dark:bg-industrial-900/30 border-b border-industrial-200/50 dark:border-industrial-800/50">
            <tr>
              <th className="px-8 py-5 text-[10px] uppercase tracking-widest font-extrabold text-industrial-500 dark:text-industrial-400">{dict.ticketId}</th>
              <th className="px-8 py-5 text-[10px] uppercase tracking-widest font-extrabold text-industrial-500 dark:text-industrial-400">{dict.location}</th>
              <th className="px-8 py-5 text-[10px] uppercase tracking-widest font-extrabold text-industrial-500 dark:text-industrial-400">{dict.issueCol}</th>
              <th className="px-8 py-5 text-[10px] uppercase tracking-widest font-extrabold text-industrial-500 dark:text-industrial-400">{dict.statusCol}</th>
              {showTicketTrash && <th className="px-8 py-5 text-[10px] uppercase tracking-widest font-extrabold text-industrial-500 dark:text-industrial-400">{dict.actions}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-industrial-100 dark:divide-industrial-800/50">
            {displayTickets.map((ticket) => (
              <tr key={ticket.id} onClick={() => !showTicketTrash && setSelectedTicket(ticket)} className={`${showTicketTrash ? '' : 'cursor-pointer'} hover:bg-industrial-50/80 dark:hover:bg-industrial-900/30 transition-colors group`}>
                <td className="px-8 py-5 font-mono font-extrabold text-industrial-900 dark:text-white group-hover:text-accent-600 dark:group-hover:text-accent-400 transition-colors">
                  {ticket.id}
                  {!isAdmin && isMine(ticket) && (
                    <span className="ms-3 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400 align-middle">
                      {dict.assignedToYou}
                    </span>
                  )}
                </td>
                <td className="px-8 py-5 truncate max-w-[200px] font-bold text-industrial-700 dark:text-industrial-300">{ticket.room}</td>
                <td className="px-8 py-5 font-extrabold text-industrial-900 dark:text-white">{ticket.issue}</td>
                <td className="px-8 py-5">
                  <span className={`px-3 py-1 rounded-xl text-[11px] font-extrabold uppercase tracking-widest ${statusBadgeClass(ticket.status)}`}>
                    {statusLabel(dict, ticket.status)}
                  </span>
                </td>
                {showTicketTrash && (
                  <td className="px-8 py-5">
                    <div className="flex flex-wrap items-center gap-4">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleRestoreTicket(ticket.id); }}
                        className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:underline"
                      >
                        <RotateCcw size={14} /> {dict.restore}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDeleteTicketForever(ticket.id); }}
                        className="flex items-center gap-1.5 text-xs font-bold text-red-600 hover:text-red-700 hover:underline"
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
      </div>

      {selectedTicket && !showTicketTrash && (
        <div className="fixed inset-0 z-50 flex justify-end rtl:justify-start">
          <div className="absolute inset-0 bg-industrial-950/40 dark:bg-black/60 backdrop-blur-sm print:hidden" onClick={() => setSelectedTicket(null)} />
          <div className="w-full max-w-md bg-white dark:bg-industrial-950 border-s border-industrial-200 dark:border-industrial-800 h-full relative z-10 shadow-[0_0_40px_rgba(0,0,0,0.1)] p-8 overflow-y-auto transform transition-transform">
            <button type="button" onClick={() => window.print()} className="absolute top-8 end-16 p-2 rounded-xl hover:bg-industrial-50 dark:hover:bg-industrial-900/50 text-industrial-500 hover:text-industrial-900 dark:hover:text-white transition-colors print:hidden" aria-label={dict.print}>
              <Printer size={20} />
            </button>
            <button type="button" onClick={() => setSelectedTicket(null)} className="absolute top-8 end-6 p-2 rounded-xl hover:bg-industrial-50 dark:hover:bg-industrial-900/50 text-industrial-500 hover:text-industrial-900 dark:hover:text-white transition-colors print:hidden" aria-label={dict.cancel}>
              <X size={20} />
            </button>

            <div className="mb-8 mt-4">
              <BrandLogo className="h-10 w-auto object-contain mb-6 print:block" />
              <p className="text-[10px] font-extrabold text-industrial-400 uppercase tracking-widest mb-2">{dict.workOrder}</p>
              <h2 className="text-4xl font-mono font-extrabold tracking-tight text-industrial-900 dark:text-white">{selectedTicket.id}</h2>
              <p className="mt-4 font-bold text-lg text-industrial-800 dark:text-industrial-200">{selectedTicket.room} <span className="text-industrial-400">—</span> {selectedTicket.asset}</p>
              <p className="text-industrial-500 dark:text-industrial-400 mt-2 font-medium">{selectedTicket.issue}</p>
              
              <div className="mt-6 bg-industrial-50 dark:bg-industrial-900/30 border border-industrial-200 dark:border-industrial-800/50 rounded-2xl px-5 py-4 shadow-sm">
                <p className="text-[10px] font-extrabold text-industrial-400 uppercase tracking-widest mb-2">{dict.userNotes}</p>
                <p className={`text-sm whitespace-pre-wrap font-medium leading-relaxed ${selectedTicket.notes ? 'text-industrial-700 dark:text-industrial-300' : 'text-industrial-400 italic'}`}>
                  {selectedTicket.notes || dict.noNotes}
                </p>
              </div>
              {selectedTicket.status === 'Rejected' && selectedTicket.rejectionReason && (
                <div className="mt-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-2xl px-5 py-4">
                  <p className="text-[10px] font-extrabold text-red-600/70 dark:text-red-400/70 uppercase tracking-widest mb-2">{dict.reject}</p>
                  <p className="text-sm text-red-700 dark:text-red-400 font-bold">{selectedTicket.rejectionReason}</p>
                </div>
              )}
              {(isAdmin || isViewer || adminRole === 'facility') && (
                <div className="mt-4 bg-industrial-50 dark:bg-industrial-900/30 border border-industrial-200 dark:border-industrial-800/50 rounded-2xl p-5 shadow-sm">
                  <p className="text-[10px] font-extrabold text-industrial-400 uppercase tracking-widest mb-4">{dict.reporterInfo}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                    <div>
                      <p className="text-[10px] font-bold text-industrial-400 uppercase tracking-wider mb-1">{dict.name}</p>
                      <p className="font-extrabold text-industrial-900 dark:text-white">{selectedTicket.name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-industrial-400 uppercase tracking-wider mb-1">{dict.searchEmployeeId}</p>
                      <p className="font-extrabold text-industrial-900 dark:text-white">{selectedTicket.employeeId || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-industrial-400 uppercase tracking-wider mb-1">{dict.reporterPhone}</p>
                      {selectedTicket.phone ? (
                        <a href={`tel:${selectedTicket.phone}`} className="font-extrabold text-accent-600 hover:text-accent-700 dark:text-accent-500 dark:hover:text-accent-400 underline decoration-accent-500/30 hover:decoration-accent-500" dir="ltr">{selectedTicket.phone}</a>
                      ) : <p className="font-extrabold text-industrial-900 dark:text-white">—</p>}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-industrial-400 uppercase tracking-wider mb-1">{dict.reporterEmail}</p>
                      {selectedTicket.email ? (
                        <a href={`mailto:${selectedTicket.email}`} className="font-extrabold text-accent-600 hover:text-accent-700 dark:text-accent-500 dark:hover:text-accent-400 underline decoration-accent-500/30 hover:decoration-accent-500 break-all" dir="ltr">{selectedTicket.email}</a>
                      ) : <p className="font-extrabold text-industrial-900 dark:text-white">—</p>}
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-[10px] font-bold text-industrial-400 uppercase tracking-wider mb-1">{dict.reportedAt}</p>
                      <p className="font-extrabold text-industrial-900 dark:text-white">{selectedTicket.createdAt ? new Date(selectedTicket.createdAt).toLocaleString() : '—'}</p>
                    </div>
                  </div>
                  {selectedTicket.imageUrl && (
                    <div className="mt-5">
                      <p className="text-[10px] font-bold text-industrial-400 uppercase tracking-wider mb-2">{dict.reporterPhoto}</p>
                      <a href={selectedTicket.imageUrl} target="_blank" rel="noreferrer" className="block relative group overflow-hidden rounded-xl border border-industrial-200 dark:border-industrial-800">
                        <img
                          src={selectedTicket.imageUrl}
                          alt={dict.reporterPhoto}
                          className="w-full object-cover max-h-72 group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-6 print:hidden">
              {isAdmin ? (
                <div>
                  <label className="text-[10px] font-extrabold text-industrial-400 block mb-2 uppercase tracking-widest">{dict.assign}</label>
                  <select
                    value={pendingAssignee}
                    onChange={(e) => setPendingAssignee(e.target.value)}
                    className="w-full border border-industrial-200 dark:border-industrial-800 rounded-2xl px-5 py-4 bg-white/50 dark:bg-industrial-900/50 backdrop-blur-xl focus:border-accent-500 outline-none transition-all shadow-sm font-bold"
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
                      className="mt-3 w-full bg-industrial-900 text-white dark:bg-white dark:text-industrial-900 py-4 rounded-2xl font-extrabold shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                    >
                      {dict.submitAssign}
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  <label className="text-[10px] font-extrabold text-industrial-400 block mb-2 uppercase tracking-widest">{dict.assignedTo}</label>
                  <div className="w-full border border-industrial-200 dark:border-industrial-800 rounded-2xl px-5 py-4 font-extrabold bg-industrial-50 dark:bg-industrial-900/30">
                    {selectedTicket.assignee || dict.unassigned}
                  </div>
                </div>
              )}

              {isAdmin && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-extrabold text-industrial-400 block mb-2 uppercase tracking-widest">{dict.unitPrice}</label>
                  <input type="number" min="0" step="any" value={selectedTicket.unitPrice || ''} onChange={(e) => updateTicket(selectedTicket.id, { unitPrice: e.target.value })} className="w-full border border-industrial-200 dark:border-industrial-800 rounded-2xl px-5 py-4 bg-white/50 dark:bg-industrial-900/50 backdrop-blur-xl focus:border-accent-500 outline-none transition-all shadow-sm font-bold" />
                </div>
                <div>
                  <label className="text-[10px] font-extrabold text-industrial-400 block mb-2 uppercase tracking-widest">{dict.units}</label>
                  <input type="number" min="1" step="1" value={selectedTicket.units || ''} onChange={(e) => updateTicket(selectedTicket.id, { units: e.target.value })} className="w-full border border-industrial-200 dark:border-industrial-800 rounded-2xl px-5 py-4 bg-white/50 dark:bg-industrial-900/50 backdrop-blur-xl focus:border-accent-500 outline-none transition-all shadow-sm font-bold" />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-extrabold text-industrial-400 block mb-2 uppercase tracking-widest">{dict.cost}</label>
                  <div className="w-full border border-industrial-200 dark:border-industrial-800 rounded-2xl px-5 py-4 font-extrabold text-lg bg-industrial-50 dark:bg-industrial-900/30 flex justify-between items-center">
                    <span className="text-industrial-500">SAR</span>
                    <span>{((Number(selectedTicket.unitPrice) || 0) * (Number(selectedTicket.units) || 1)).toLocaleString()}</span>
                  </div>
                </div>
              </div>
              )}

              <div className="flex flex-col gap-3 pt-4">
                {isAdmin && (selectedTicket.status === 'New' || selectedTicket.status === 'Pending') && (
                  <div className="flex gap-3">
                    <button type="button" onClick={() => updateTicket(selectedTicket.id, { status: 'In Progress' })} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-4 rounded-2xl font-extrabold transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5">
                      {dict.accept}
                    </button>
                    <button type="button" onClick={() => handleReject(selectedTicket.id)} className="flex-1 bg-red-500 hover:bg-red-600 text-white py-4 rounded-2xl font-extrabold transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5">
                      {dict.reject}
                    </button>
                  </div>
                )}

                {!isAdmin && !isViewer && isMine(selectedTicket) && selectedTicket.status === 'Resolved' && (
                  <button type="button" onClick={() => updateTicket(selectedTicket.id, { status: 'Closed' })} className="w-full bg-industrial-900 dark:bg-white text-white dark:text-industrial-900 hover:bg-industrial-800 dark:hover:bg-industrial-100 py-4 rounded-2xl font-extrabold transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5">
                    {dict.markClosed}
                  </button>
                )}

                {isAdmin && selectedTicket.status === 'Rejected' && (
                  <button type="button" onClick={() => handleReopenTicket(selectedTicket.id)} className="w-full bg-accent-500 hover:bg-accent-600 text-white py-4 rounded-2xl font-extrabold transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5">
                    {dict.reopenNew}
                  </button>
                )}
              </div>

              {!isAdmin && !isViewer && isMine(selectedTicket) && selectedTicket.status === 'In Progress' && (
                <div className="glass-panel border-accent-200 dark:border-accent-900/50 rounded-[2rem] p-6 shadow-sm">
                  <label className="text-[10px] font-extrabold text-industrial-400 block mb-4 uppercase tracking-widest">{dict.uploadFixPhoto}</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setResolutionFile(e.target.files?.[0] || null)}
                    className="w-full text-sm mb-4 file:me-4 file:px-6 file:py-3 file:rounded-xl file:border-0 file:bg-industrial-100 dark:file:bg-industrial-800 file:font-extrabold file:text-sm file:text-industrial-900 dark:file:text-white hover:file:bg-industrial-200 dark:hover:file:bg-industrial-700 transition-colors cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={handleUploadResolution}
                    disabled={uploadingPhoto || !resolutionFile}
                    className="w-full bg-accent-500 hover:bg-accent-600 disabled:bg-industrial-200 dark:disabled:bg-industrial-800 disabled:text-industrial-400 text-white py-4 rounded-2xl font-extrabold transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow-md disabled:shadow-none hover:-translate-y-0.5 disabled:translate-y-0"
                  >
                    <Check size={20} /> {uploadingPhoto ? dict.uploading : dict.uploadFixPhoto}
                  </button>
                </div>
              )}

              {selectedTicket.resolutionImageUrl && (
                <div className="bg-emerald-50/80 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-[2rem] p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm">
                      <Check size={16} strokeWidth={3} />
                    </div>
                    <label className="text-[10px] font-extrabold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">{dict.technicianFixPhoto}</label>
                  </div>
                  <a href={selectedTicket.resolutionImageUrl} target="_blank" rel="noreferrer" className="block relative group overflow-hidden rounded-xl border border-emerald-200 dark:border-emerald-800/50">
                    <img
                      src={selectedTicket.resolutionImageUrl}
                      alt={dict.technicianFixPhoto}
                      className="w-full object-cover max-h-72 group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                  </a>
                  <p className="text-[10px] font-bold text-emerald-600/70 dark:text-emerald-500/70 mt-3 uppercase tracking-wider">{dict.internalOnly}</p>
                </div>
              )}

              {isManager && (
              <button
                type="button"
                onClick={() => handleDeleteTicket(selectedTicket.id)}
                className="w-full flex items-center justify-center gap-2 border-2 border-red-200 dark:border-red-900/50 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 py-4 rounded-2xl font-extrabold transition-colors mt-8"
              >
                <Trash2 size={18} /> {dict.deleteTicket}
              </button>
              )}
            </div>

            <div className="mt-10 pt-8 border-t border-industrial-200 dark:border-industrial-800 print:hidden">
              <h3 className="text-[10px] font-extrabold text-industrial-400 uppercase tracking-widest mb-6">{dict.discussion}</h3>
              <div className="space-y-4 mb-6 max-h-[300px] overflow-y-auto pe-2 custom-scrollbar">
                {comments.length === 0 && (
                  <div className="text-center py-6 bg-industrial-50 dark:bg-industrial-900/30 rounded-2xl border border-dashed border-industrial-200 dark:border-industrial-800">
                    <p className="text-sm font-medium text-industrial-400">{dict.noComments}</p>
                  </div>
                )}
                {comments.map((c) => (
                  <div key={c.id} className="bg-white dark:bg-industrial-900/50 border border-industrial-100 dark:border-industrial-800/50 shadow-sm rounded-2xl px-5 py-4">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-sm font-extrabold text-industrial-900 dark:text-white">{c.userName}</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-widest ${c.role === 'admin' ? 'bg-industrial-900 text-white dark:bg-industrial-50 dark:text-industrial-900' : 'bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400'}`}>
                        {c.role}
                      </span>
                      <span className="text-[10px] font-mono text-industrial-400 ms-auto">{formatHistoryDate(c.createdAt)}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap font-medium text-industrial-700 dark:text-industrial-300 leading-relaxed">{c.commentText}</p>
                  </div>
                ))}
              </div>
              {!isViewer && (
                <div className="relative">
                  <textarea
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder={dict.writeComment}
                    rows={3}
                    maxLength={2000}
                    className="w-full border border-industrial-200 dark:border-industrial-800 rounded-2xl px-5 py-4 bg-white/50 dark:bg-industrial-900/50 backdrop-blur-xl outline-none focus:border-accent-500 dark:focus:border-accent-400 focus:ring-4 focus:ring-accent-500/10 text-sm font-medium resize-none shadow-sm transition-all pb-14"
                  />
                  <div className="absolute bottom-3 end-3 flex items-center justify-between start-4">
                    <span className="text-[10px] font-bold text-industrial-400">{commentDraft.length}/2000</span>
                    <button
                      type="button"
                      onClick={handleSendComment}
                      disabled={sendingComment || !commentDraft.trim()}
                      className="bg-industrial-900 text-white dark:bg-white dark:text-industrial-900 disabled:opacity-30 disabled:hover:scale-100 px-5 py-2 rounded-xl font-extrabold text-sm transition-all hover:-translate-y-0.5 active:scale-[0.98] shadow-sm flex items-center gap-2"
                    >
                      {sendingComment ? dict.sending : dict.sendComment}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {ticketHistory.length > 0 && (
              <div className="mt-10 pt-8 border-t border-industrial-200 dark:border-industrial-800 print:hidden">
                <h3 className="text-[10px] font-extrabold text-industrial-400 uppercase tracking-widest mb-6">{dict.auditTrail}</h3>
                <div className="space-y-0 relative before:absolute before:inset-0 before:ms-[11px] rtl:before:me-[11px] before:-translate-x-px before:w-0.5 before:bg-industrial-200 dark:before:bg-industrial-800">
                  {ticketHistory.map((entry, idx) => (
                    <div key={entry.id} className="relative ps-8 rtl:pe-8 py-3">
                      <div className="absolute start-0 rtl:end-0 top-4 w-6 h-6 -translate-x-1/2 rtl:translate-x-1/2 rounded-full bg-white dark:bg-industrial-950 border-4 border-industrial-200 dark:border-industrial-800 z-10" />
                      <div className="bg-industrial-50 dark:bg-industrial-900/30 rounded-2xl px-5 py-4 border border-industrial-100 dark:border-industrial-800/50">
                        <p className="font-extrabold text-sm text-industrial-900 dark:text-white">
                          {entry.fromStatus ? (
                            <span className="flex items-center gap-2">
                              <span className="text-industrial-500 dark:text-industrial-400 line-through">{entry.fromStatus}</span>
                              <ArrowRight size={14} className="rtl:rotate-180 text-industrial-400" />
                              <span>{entry.toStatus}</span>
                            </span>
                          ) : entry.toStatus}
                        </p>
                        <p className="text-industrial-500 dark:text-industrial-400 text-[11px] font-medium mt-1.5 flex items-center gap-2">
                          <span className="font-bold">{entry.changedBy}</span>
                          <span className="w-1 h-1 rounded-full bg-industrial-300 dark:bg-industrial-700" />
                          <span className="font-mono">{formatHistoryDate(entry.createdAt)}</span>
                        </p>
                        {entry.note && (
                          <p className="text-industrial-600 dark:text-industrial-300 text-sm mt-3 font-medium bg-white dark:bg-industrial-950 p-3 rounded-xl border border-industrial-200 dark:border-industrial-800">{entry.note}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="hidden print:block mt-16 border-t-2 border-black pt-8">
              <h3 className="font-extrabold text-xl tracking-tight mb-8 uppercase">{dict.resolutionNotes}</h3>
              <div className="h-32 border-b border-dashed border-gray-400 mb-8" />
              <div className="h-32 border-b border-dashed border-gray-400 mb-12" />
              <div className="flex justify-between mt-16 text-lg font-bold">
                <div>{dict.techSign}: <span className="inline-block w-64 border-b border-black ms-2"></span></div>
                <div>{dict.adminSign}: <span className="inline-block w-64 border-b border-black ms-2"></span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showRoomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center print:static print:block print:bg-white">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm print:hidden" onClick={() => setShowRoomModal(false)} />
          <div className="w-full max-w-4xl bg-white dark:bg-industrial-950 border border-industrial-200 dark:border-industrial-800 rounded-[2rem] relative z-10 shadow-2xl p-8 max-h-[90vh] overflow-y-auto print:max-h-none print:max-w-none print:overflow-visible print:shadow-none print:border-none print:p-0">
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

            {[...new Set(['Dhahran', ...adminRooms.map(roomSite)])].map((siteName) => ({
              key: siteName,
              label: siteName === 'Dhahran' ? dict.dhahranRooms : siteName === 'MGS' ? dict.mgsRooms : `${siteName} ${dict.roomsSuffix}`,
              rooms: adminRooms
                .filter((r) => roomSite(r) === siteName)
                .slice()
                .sort((a, b) => (a.floor || '').localeCompare(b.floor || '') || a.name.localeCompare(b.name, undefined, { numeric: true })),
            })).filter((section) => section.rooms.length > 0 || section.key === 'Dhahran').map((section) => (
            <div key={section.key} className="mb-10 print:mb-0">
            <h3 className="text-xl font-extrabold tracking-tight mb-4 pb-2 border-b border-industrial-200 dark:border-industrial-800 print:text-black print:border-black print:mt-6 print:break-after-avoid">{section.label}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 print:block print:gap-0">
              {section.rooms.map((room) => (
                <div key={room.id} className="border border-industrial-200 dark:border-industrial-800 rounded-2xl p-6 flex flex-col items-center text-center print:inline-flex print:w-[30%] print:align-top print:m-[1.5%] print:border-black print:break-inside-avoid">
                  <BrandLogo className="h-10 w-auto object-contain mb-2 print:h-12" />
                  <p className="text-xs font-bold uppercase tracking-wider text-industrial-500 dark:text-industrial-400 mb-4 print:text-black">{dict.facilityDepartment}</p>
                  {room.token && (
                    <QRCodeSVG
                      value={`${baseUrl}?token=${encodeURIComponent(room.token)}`}
                      size={100}
                      className="mb-4"
                    />
                  )}
                  <p className="font-bold text-sm tracking-tight mb-2">{room.name}</p>
                  {isManager && (
                    <div className="print:hidden flex flex-col gap-2 w-full">
                      <button type="button" onClick={() => openEditRoom(room)} className="text-xs font-bold flex items-center justify-center gap-1 text-gray-600 hover:text-black dark:hover:text-white">
                        <Pencil size={12} /> {dict.editRoom}
                      </button>
                      <button type="button" onClick={() => handleRotateQr(room.id)} className="text-xs font-bold flex items-center justify-center gap-1 text-gray-600 hover:text-black dark:hover:text-white">
                        <RefreshCw size={12} /> {dict.rotateQr}
                      </button>
                      <button type="button" onClick={() => handleDeleteRoom(room.id, room.name)} className="text-xs font-bold flex items-center justify-center gap-1 text-red-600 hover:text-red-700">
                        <Trash2 size={12} /> {dict.deleteLocation}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {isManager && (isMainAdmin || section.key === adminSite) && (
              <button type="button" onClick={() => setShowAddRoomForm(true)} className="print:hidden border-2 border-dashed border-industrial-200 dark:border-industrial-800 rounded-2xl p-6 flex flex-col items-center justify-center text-industrial-400 hover:text-black dark:hover:text-white min-h-[180px]">
                <Plus size={32} className="mb-2" />
                <span className="font-bold text-sm">{dict.addLocation}</span>
              </button>
              )}
            </div>
            </div>
            ))}

            {showAddRoomForm && (
              <form onSubmit={handleSaveRoom} className="mt-8 p-6 border border-industrial-200 dark:border-industrial-800 rounded-2xl space-y-4 print:hidden">
                <h3 className="font-bold text-lg">{dict.addNewLocation}</h3>
                <input value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} placeholder={dict.roomName} required className="w-full border border-industrial-200 dark:border-industrial-800 rounded-xl px-4 py-3 bg-transparent outline-none" />
                <select value={newRoomDept} onChange={(e) => setNewRoomDept(e.target.value)} required className="w-full border border-industrial-200 dark:border-industrial-800 rounded-xl px-4 py-3 bg-transparent outline-none">
                  <option value="">{dict.department}</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name_en}</option>)}
                </select>
                <input value={newRoomSite} onChange={(e) => setNewRoomSite(e.target.value)} placeholder={dict.site} list="site-options" className="w-full border border-industrial-200 dark:border-industrial-800 rounded-xl px-4 py-3 bg-transparent outline-none" />
                <datalist id="site-options">
                  {siteOptions.map((s) => <option key={s} value={s} />)}
                </datalist>
                <textarea value={newRoomAssets} onChange={(e) => setNewRoomAssets(e.target.value)} placeholder={dict.assetsComma} rows={2} className="w-full border border-industrial-200 dark:border-industrial-800 rounded-xl px-4 py-3 bg-transparent outline-none resize-none" />
                <div className="flex gap-2">
                  <button type="submit" className="bg-industrial-900 text-white dark:bg-industrial-50 dark:text-industrial-900 hover:bg-industrial-800 dark:hover:bg-industrial-200 px-6 py-2.5 rounded-xl font-bold">{dict.saveRoom}</button>
                  <button type="button" onClick={() => setShowAddRoomForm(false)} className="px-6 py-2.5 rounded-xl font-bold border border-industrial-200 dark:border-industrial-800">{dict.cancel}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {editingRoom && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center print:hidden p-4">
          <div className="absolute inset-0 bg-industrial-950/40 dark:bg-black/60 backdrop-blur-sm" onClick={() => setEditingRoom(null)} />
          <form onSubmit={handleSaveRoomEdit} className="relative z-10 w-full max-w-md bg-white dark:bg-industrial-950 border border-industrial-200 dark:border-industrial-800 rounded-[2.5rem] p-8 shadow-[0_0_60px_rgba(0,0,0,0.1)] space-y-6 animate-fade-in overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-accent-400 to-accent-600" />
            <h3 className="text-2xl font-extrabold tracking-tight text-industrial-900 dark:text-white mb-2">{dict.editRoom}</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-extrabold text-industrial-400 uppercase tracking-widest mb-2 block">{dict.roomName}</label>
                <input value={editRoomName} onChange={(e) => setEditRoomName(e.target.value)} placeholder={dict.roomName} required className="w-full border border-industrial-200 dark:border-industrial-800 rounded-2xl px-5 py-4 bg-white/50 dark:bg-industrial-900/50 backdrop-blur-xl outline-none focus:border-accent-500 focus:ring-4 focus:ring-accent-500/10 transition-all font-bold shadow-sm text-industrial-900 dark:text-white" />
              </div>
              <div>
                <label className="text-[10px] font-extrabold text-industrial-400 uppercase tracking-widest mb-2 block">{dict.floor}</label>
                <input value={editRoomFloor} onChange={(e) => setEditRoomFloor(e.target.value)} placeholder={dict.floor} className="w-full border border-industrial-200 dark:border-industrial-800 rounded-2xl px-5 py-4 bg-white/50 dark:bg-industrial-900/50 backdrop-blur-xl outline-none focus:border-accent-500 focus:ring-4 focus:ring-accent-500/10 transition-all font-bold shadow-sm text-industrial-900 dark:text-white" />
              </div>
              <div>
                <label className="text-[10px] font-extrabold text-industrial-400 uppercase tracking-widest mb-2 block">{dict.site}</label>
                <input value={editRoomSite} onChange={(e) => setEditRoomSite(e.target.value)} placeholder={dict.site} list="site-options-edit" className="w-full border border-industrial-200 dark:border-industrial-800 rounded-2xl px-5 py-4 bg-white/50 dark:bg-industrial-900/50 backdrop-blur-xl outline-none focus:border-accent-500 focus:ring-4 focus:ring-accent-500/10 transition-all font-bold shadow-sm text-industrial-900 dark:text-white" />
              </div>
              <datalist id="site-options-edit">
                {siteOptions.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" className="flex-1 bg-industrial-900 text-white dark:bg-white dark:text-industrial-900 hover:bg-industrial-800 dark:hover:bg-industrial-100 py-4 rounded-2xl font-extrabold transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]">{dict.saveChanges}</button>
              <button type="button" onClick={() => setEditingRoom(null)} className="flex-1 py-4 rounded-2xl font-extrabold border-2 border-industrial-200 dark:border-industrial-800 hover:bg-industrial-50 dark:hover:bg-industrial-900/50 text-industrial-700 dark:text-industrial-300 transition-all active:scale-[0.98]">{dict.cancel}</button>
            </div>
          </form>
        </div>
      )}

        <div className="fixed inset-0 z-50 flex items-center justify-center print:hidden p-4">
          <div className="absolute inset-0 bg-industrial-950/40 dark:bg-black/60 backdrop-blur-sm" onClick={() => setShowStaffModal(false)} />
          <div className="w-full max-w-lg bg-white dark:bg-industrial-950 border border-industrial-200 dark:border-industrial-800 rounded-[2.5rem] relative z-10 shadow-[0_0_60px_rgba(0,0,0,0.1)] p-8 sm:p-10 max-h-[90vh] overflow-y-auto animate-fade-in custom-scrollbar">
            <div className="flex justify-between items-center mb-8 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-industrial-50 dark:bg-industrial-900/50 flex items-center justify-center shadow-sm">
                  <Users size={24} className="text-industrial-700 dark:text-industrial-300" />
                </div>
                <h2 className="text-2xl font-extrabold tracking-tight text-industrial-900 dark:text-white">{dict.staffManager}</h2>
              </div>
              <button type="button" onClick={() => setShowStaffModal(false)} className="p-3 rounded-2xl bg-industrial-50 dark:bg-industrial-900/50 hover:bg-industrial-100 dark:hover:bg-industrial-900 text-industrial-700 dark:text-industrial-300 transition-colors shadow-sm"><X size={20} /></button>
            </div>
            <ul className="space-y-3 mb-8">
              {allStaff.map((user) => (
                <li key={user.id} className="flex items-center justify-between gap-4 border border-industrial-200 dark:border-industrial-800 rounded-2xl px-5 py-4 glass-panel shadow-sm hover:shadow-md transition-shadow">
                  <div className="min-w-0">
                    <p className="font-extrabold truncate text-industrial-900 dark:text-white">
                      {user.full_name || user.username}
                      {user.full_name && <span className="text-industrial-400 font-bold"> · {user.username}</span>}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className="px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase tracking-widest bg-industrial-100 text-industrial-700 dark:bg-industrial-900/50 dark:text-industrial-300">
                        {dict[`role_${user.role}`] || user.role}
                      </span>
                      {user.site && user.site !== 'all' && (
                        <span className="px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase tracking-widest bg-accent-50 text-accent-700 dark:bg-accent-950/30 dark:text-accent-400">
                          {user.site}
                        </span>
                      )}
                    </div>
                    {(user.phone || user.email) && (
                      <p className="text-[11px] font-bold text-industrial-500 dark:text-industrial-400 mt-2 truncate flex items-center gap-1">
                        {[user.phone, user.email].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  {user.username !== adminUser
                    && (isMainAdmin
                      ? user.role !== 'admin'
                      : ['sub_admin', 'facility'].includes(user.role)) && (
                    <button type="button" onClick={() => handleDeleteStaff(user.id, user.username)} className="w-10 h-10 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/20 dark:hover:bg-red-900/30 dark:text-red-400 flex items-center justify-center shrink-0 transition-colors" aria-label={dict.deleteStaff}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <form onSubmit={handleCreateStaff} className="space-y-4 pt-8 relative before:absolute before:inset-x-[-40px] before:top-0 before:border-t before:border-industrial-200 dark:before:border-industrial-800">
              <h3 className="font-extrabold text-lg text-industrial-900 dark:text-white mb-2">{dict.createStaff}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input value={newStaffName} onChange={(e) => setNewStaffName(e.target.value)} placeholder={dict.staffFullName} required className="w-full border border-industrial-200 dark:border-industrial-800 rounded-2xl px-5 py-4 bg-white/50 dark:bg-industrial-900/50 backdrop-blur-xl outline-none focus:border-accent-500 focus:ring-4 focus:ring-accent-500/10 transition-all font-bold shadow-sm text-industrial-900 dark:text-white" />
                <input value={newStaffUser} onChange={(e) => setNewStaffUser(e.target.value)} placeholder={dict.newStaffUser} required className="w-full border border-industrial-200 dark:border-industrial-800 rounded-2xl px-5 py-4 bg-white/50 dark:bg-industrial-900/50 backdrop-blur-xl outline-none focus:border-accent-500 focus:ring-4 focus:ring-accent-500/10 transition-all font-bold shadow-sm text-industrial-900 dark:text-white" />
                <input type="password" value={newStaffPass} onChange={(e) => setNewStaffPass(e.target.value)} placeholder={dict.staffPassword} required minLength={6} className="w-full border border-industrial-200 dark:border-industrial-800 rounded-2xl px-5 py-4 bg-white/50 dark:bg-industrial-900/50 backdrop-blur-xl outline-none focus:border-accent-500 focus:ring-4 focus:ring-accent-500/10 transition-all font-bold shadow-sm text-industrial-900 dark:text-white md:col-span-2" />
                <input type="tel" value={newStaffPhone} onChange={(e) => setNewStaffPhone(e.target.value)} placeholder={dict.staffPhone} required className="w-full border border-industrial-200 dark:border-industrial-800 rounded-2xl px-5 py-4 bg-white/50 dark:bg-industrial-900/50 backdrop-blur-xl outline-none focus:border-accent-500 focus:ring-4 focus:ring-accent-500/10 transition-all font-bold shadow-sm text-industrial-900 dark:text-white" dir="ltr" />
                <input type="email" value={newStaffEmail} onChange={(e) => setNewStaffEmail(e.target.value)} placeholder={dict.staffEmail} required className="w-full border border-industrial-200 dark:border-industrial-800 rounded-2xl px-5 py-4 bg-white/50 dark:bg-industrial-900/50 backdrop-blur-xl outline-none focus:border-accent-500 focus:ring-4 focus:ring-accent-500/10 transition-all font-bold shadow-sm text-industrial-900 dark:text-white" dir="ltr" />
                <select value={newStaffRole} onChange={(e) => setNewStaffRole(e.target.value)} className="w-full border border-industrial-200 dark:border-industrial-800 rounded-2xl px-5 py-4 bg-white/50 dark:bg-industrial-900/50 backdrop-blur-xl outline-none focus:border-accent-500 focus:ring-4 focus:ring-accent-500/10 transition-all font-bold shadow-sm text-industrial-900 dark:text-white appearance-none">
                  {(isMainAdmin ? ['facility', 'sub_admin', 'site_admin', 'admin'] : ['facility', 'sub_admin']).map((r) => (
                    <option key={r} value={r} className="text-industrial-900">{dict[`role_${r}`] || r}</option>
                  ))}
                </select>
                {isMainAdmin && newStaffRole !== 'admin' && (
                  <select value={newStaffSite} onChange={(e) => setNewStaffSite(e.target.value)} className="w-full border border-industrial-200 dark:border-industrial-800 rounded-2xl px-5 py-4 bg-white/50 dark:bg-industrial-900/50 backdrop-blur-xl outline-none focus:border-accent-500 focus:ring-4 focus:ring-accent-500/10 transition-all font-bold shadow-sm text-industrial-900 dark:text-white appearance-none">
                    <option value="" className="text-industrial-900">{dict.staffSite}</option>
                    {siteOptions.map((s) => <option key={s} value={s} className="text-industrial-900">{s}</option>)}
                  </select>
                )}
              </div>
              <button type="submit" className="w-full bg-industrial-900 text-white dark:bg-white dark:text-industrial-900 py-4 rounded-2xl font-extrabold shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 active:scale-[0.98] mt-2">{dict.createStaff}</button>
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
      <div className="flex items-center justify-between border-b-4 border-black pb-6 mb-8">
        <BrandLogo className="h-16 w-auto object-contain" />
        <div className="text-end">
          <p className="text-xl font-extrabold uppercase tracking-widest">{dict.reportCompany}</p>
          <h1 className="text-3xl font-black tracking-tighter mt-1">{title}</h1>
          <p className="text-sm font-bold text-gray-600 mt-2">{dict.reportGenerated}: {date}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-10">
        <div className="border-2 border-black rounded-2xl p-6 text-center">
          <p className="text-xs font-extrabold uppercase tracking-widest text-gray-600 mb-2">{dict.reportTotal}</p>
          <p className="text-4xl font-black tracking-tighter">{tickets.length}</p>
        </div>
        <div className="border-2 border-black rounded-2xl p-6 text-center">
          <p className="text-xs font-extrabold uppercase tracking-widest text-gray-600 mb-2">{dict.reportResolved}</p>
          <p className="text-4xl font-black tracking-tighter">{resolvedCount}</p>
        </div>
        <div className="border-2 border-black rounded-2xl p-6 text-center">
          <p className="text-xs font-extrabold uppercase tracking-widest text-gray-600 mb-2">{dict.reportCost}</p>
          <p className="text-4xl font-black tracking-tighter">{totalCost.toLocaleString()}</p>
        </div>
      </div>

      {tickets.length === 0 ? (
        <p className="text-sm font-bold text-gray-500 text-center py-10 border-2 border-dashed border-gray-300 rounded-2xl">{dict.reportNoTickets}</p>
      ) : (
        <table className="w-full text-start text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border-2 border-black px-4 py-3 font-extrabold text-start uppercase tracking-wider text-[10px]">{dict.ticketId}</th>
              <th className="border-2 border-black px-4 py-3 font-extrabold text-start uppercase tracking-wider text-[10px]">{dict.reportDateCol}</th>
              <th className="border-2 border-black px-4 py-3 font-extrabold text-start uppercase tracking-wider text-[10px]">{dict.reportLocationAsset}</th>
              <th className="border-2 border-black px-4 py-3 font-extrabold text-start uppercase tracking-wider text-[10px]">{dict.issueCol}</th>
              <th className="border-2 border-black px-4 py-3 font-extrabold text-start uppercase tracking-wider text-[10px]">{dict.reportAssignee}</th>
              <th className="border-2 border-black px-4 py-3 font-extrabold text-start uppercase tracking-wider text-[10px]">{dict.statusCol}</th>
              <th className="border-2 border-black px-4 py-3 font-extrabold text-start uppercase tracking-wider text-[10px]">{dict.cost}</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id} className="print:break-inside-avoid">
                <td className="border-2 border-black px-4 py-3 font-mono font-bold">{t.id}</td>
                <td className="border-2 border-black px-4 py-3 font-bold">{new Date(t.createdAt).toLocaleDateString()}</td>
                <td className="border-2 border-black px-4 py-3 font-bold">{t.room}{t.asset ? ` / ${t.asset}` : ''}</td>
                <td className="border-2 border-black px-4 py-3 font-bold">{t.issue}</td>
                <td className="border-2 border-black px-4 py-3 font-bold">{t.assignee || '—'}</td>
                <td className="border-2 border-black px-4 py-3 font-bold">{t.status}</td>
                <td className="border-2 border-black px-4 py-3 font-bold">{Number(t.cost) ? Number(t.cost).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="text-[10px] font-bold text-gray-500 mt-12 pt-6 border-t-2 border-black text-center uppercase tracking-widest">
        {dict.reportCompany} — {dict.reportGenerated}: {date}
      </p>
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="glass-panel p-6 sm:p-8 rounded-[2rem] card-hover relative overflow-hidden group">
      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-accent-400/0 via-accent-500/0 to-accent-600/0 group-hover:from-accent-400 group-hover:via-accent-500 group-hover:to-accent-600 transition-all duration-500" />
      <p className="text-xs font-extrabold text-industrial-500 dark:text-industrial-400 mb-2 uppercase tracking-widest">{label}</p>
      <p className="text-4xl sm:text-5xl font-extrabold tracking-tighter text-industrial-900 dark:text-white">{value}</p>
    </div>
  );
}
