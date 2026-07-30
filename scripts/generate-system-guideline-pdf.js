/**
 * FMC System User Guideline — English + Arabic + Urdu
 * Output: FMC-System-Guideline.pdf
 *
 * Run: node scripts/generate-system-guideline-pdf.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';
import ArabicReshaper from 'arabic-persian-reshaper';
import { getEmbeddingLevels, getReorderedString } from 'bidi-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outPath = path.join(root, 'FMC-System-Guideline.pdf');
const fontRegular = path.join(__dirname, 'fonts', 'NotoNaskhArabic-Regular.ttf');
const fontBold = path.join(__dirname, 'fonts', 'NotoNaskhArabic-Bold.ttf');

if (!fs.existsSync(fontRegular) || !fs.existsSync(fontBold)) {
  console.error('Missing Arabic fonts in scripts/fonts/. Re-download Noto Naskh Arabic.');
  process.exit(1);
}

const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 50, bottom: 55, left: 50, right: 50 },
  info: {
    Title: 'FMC System Guideline — EN / AR / UR',
    Author: 'Bin Qurai'ah — Facility Maintenance Center',
    Subject: 'User and admin operating guideline (trilingual)',
  },
});

doc.pipe(fs.createWriteStream(outPath));
doc.registerFont('Naskh', fontRegular);
doc.registerFont('Naskh-Bold', fontBold);

const C = {
  primary: '#111111',
  muted: '#444444',
  brand: '#b91c1c',
  line: '#dddddd',
  soft: '#f8fafc',
};

function shapeRtl(text) {
  const reshaped = ArabicReshaper.ArabicShaper.convertArabic(String(text || ''));
  try {
    const levels = getEmbeddingLevels(reshaped);
    return getReorderedString(reshaped, levels);
  } catch {
    return reshaped;
  }
}

function ensureSpace(h = 56) {
  if (doc.y > 842 - 55 - h) doc.addPage();
}

function rule() {
  doc.strokeColor(C.line).lineWidth(0.8).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.4);
}

function cover() {
  doc.moveDown(4);
  doc.font('Helvetica-Bold').fontSize(26).fillColor(C.primary)
    .text('Facility Maintenance Center', { align: 'center' });
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(18).fillColor(C.brand)
    .text('FMC', { align: 'center' });
  doc.moveDown(0.6);
  doc.font('Helvetica').fontSize(13).fillColor(C.muted)
    .text('System User Guideline', { align: 'center' });
  doc.moveDown(0.4);
  doc.font('Naskh-Bold').fontSize(14).fillColor(C.primary)
    .text(shapeRtl('دليل استخدام النظام'), { align: 'center' });
  doc.moveDown(0.25);
  doc.font('Naskh-Bold').fontSize(13).fillColor(C.primary)
    .text(shapeRtl('نظام کے استعمال کی ہدایات'), { align: 'center' });
  doc.moveDown(1.2);
  doc.font('Helvetica').fontSize(10).fillColor(C.muted)
    .text('English  ·  العربية  ·  اردو', { align: 'center' });
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(10).fillColor(C.muted)
    .text('Bin Qurai'ah Construction', { align: 'center' });
  doc.moveDown(0.2);
  doc.text(`Generated: ${new Date().toISOString().slice(0, 10)}`, { align: 'center' });
  doc.moveDown(2);
  const y = doc.y;
  doc.roundedRect(90, y, 415, 70, 10).fillAndStroke(C.soft, C.line);
  doc.fillColor(C.primary).font('Helvetica').fontSize(9)
    .text(
      'Scan a room QR → report an issue → track ticket status.\nAdmins manage tickets, staff, locations, and costs.',
      105,
      y + 18,
      { width: 385, align: 'center', lineGap: 3 },
    );
}

function sectionTitleEn(text) {
  ensureSpace(40);
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(16).fillColor(C.primary).text(text);
  doc.moveDown(0.15);
  rule();
}

function sectionTitleRtl(text) {
  ensureSpace(40);
  doc.moveDown(0.3);
  doc.font('Naskh-Bold').fontSize(15).fillColor(C.primary)
    .text(shapeRtl(text), { align: 'right' });
  doc.moveDown(0.15);
  rule();
}

function h2En(text) {
  ensureSpace(28);
  doc.moveDown(0.2);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(C.primary).text(text);
  doc.moveDown(0.12);
}

function h2Rtl(text) {
  ensureSpace(28);
  doc.moveDown(0.2);
  doc.font('Naskh-Bold').fontSize(11).fillColor(C.primary)
    .text(shapeRtl(text), { align: 'right' });
  doc.moveDown(0.12);
}

function pEn(text) {
  ensureSpace(20);
  doc.font('Helvetica').fontSize(9.5).fillColor(C.muted).text(text, { lineGap: 2.5 });
  doc.moveDown(0.12);
}

function pRtl(text) {
  ensureSpace(20);
  doc.font('Naskh').fontSize(10).fillColor(C.muted)
    .text(shapeRtl(text), { align: 'right', lineGap: 3 });
  doc.moveDown(0.12);
}

function bulletEn(text) {
  ensureSpace(16);
  doc.font('Helvetica').fontSize(9.5).fillColor(C.muted)
    .text(`•  ${text}`, { indent: 8, lineGap: 2 });
}

function bulletRtl(text) {
  ensureSpace(16);
  doc.font('Naskh').fontSize(10).fillColor(C.muted)
    .text(shapeRtl(`•  ${text}`), { align: 'right', lineGap: 2.5 });
}

function langBanner(en, ar, ur) {
  ensureSpace(36);
  const y = doc.y;
  doc.roundedRect(50, y, 495, 28, 6).fillAndStroke('#fef2f2', C.line);
  doc.fillColor(C.brand).font('Helvetica-Bold').fontSize(11)
    .text(en, 60, y + 8, { width: 200 });
  doc.font('Naskh-Bold').fontSize(11).fillColor(C.brand)
    .text(shapeRtl(`${ur}  |  ${ar}`), 260, y + 7, { width: 275, align: 'right' });
  doc.y = y + 36;
}

// ─── Cover ───────────────────────────────────────────────────────────────────
cover();

// ═══════════════════════════════════════════════════════════════════════════
doc.addPage();
langBanner('ENGLISH', 'العربية', 'اردو');
sectionTitleEn('1. English — System Guideline');

h2En('1.1 What is FMC?');
pEn('Facility Maintenance Center (FMC) is Bin Qurai'ah’s system for reporting and managing facility issues by scanning a room QR code. Ticket numbers use the FMC- prefix (example: FMC-2026-0001).');

h2En('1.2 Who uses the system?');
bulletEn('Reporter (any employee): scans QR and submits a maintenance request.');
bulletEn('Main Admin: full access to all sites, users, rooms, tickets, and costs.');
bulletEn('Site / Sub Admin (In-Charge): manages tickets for assigned camp(s); receives alerts for new tickets on their site.');
bulletEn('Facility staff: works assigned tickets.');
bulletEn('Viewer: read-only access where granted.');

h2En('1.3 How to report an issue (QR → Form)');
bulletEn('Scan the room QR with your phone camera, or open the app and use Scan.');
bulletEn('The form opens only for a valid room QR (location is locked to that room).');
bulletEn('Enter: Full name, Employee ID, phone (required for WhatsApp), asset, issue type, priority (Low / Medium / High), notes.');
bulletEn('Optional: attach a photo.');
bulletEn('Submit. You receive a ticket number — keep it for tracking.');
bulletEn('Already-printed text stickers: open the FMC website → Scan (in-app). Do not reprint unless you need camera deep-links.');

h2En('1.4 How to track a ticket');
bulletEn('Open Track.');
bulletEn('Enter Ticket Number and Employee ID together (privacy check).');
bulletEn('View status: New → In Progress → Resolved → Closed (or Rejected).');

h2En('1.5 Admin / Sub-Admin dashboard');
bulletEn('Login from Command Center with your username and password.');
bulletEn('Ticket list shows Priority so urgent work is visible immediately.');
bulletEn('Open a ticket to assign a technician, update status, add parts/units, and set Total Cost (SAR).');
bulletEn('Cost can be added or updated even after the ticket is Closed.');
bulletEn('Deleted/inactive users do not appear in the Assign Technician list.');
bulletEn('SLA Breached = tickets still New/Pending older than 24 hours.');

h2En('1.6 Staff Manager');
bulletEn('Create users with role and one or more sites (multi-location access).');
bulletEn('Set full name, phone, and email so WhatsApp alerts can reach Sub Admins / In-Charge.');
bulletEn('Deleting a user deactivates them — they leave the assignment list.');

h2En('1.7 Locations & QR codes');
bulletEn('Location Manager shows camps/sites and room QR stickers.');
bulletEn('Printed QR tokens must not be changed — existing stickers stay valid.');
bulletEn('Add Location opens a form to create a new room with department, site, and assets.');

h2En('1.8 Notifications');
bulletEn('New ticket: WhatsApp + in-app alert to main admins and the site Sub Admin / In-Charge.');
bulletEn('Reporter may receive WhatsApp when the ticket is Resolved/Closed (when Twilio templates are configured).');

h2En('1.9 Quick checklist for testers');
bulletEn('QR opens the report form for MGS BQ, Madina PMT/BQ, Dhahran, and other camps.');
bulletEn('Sub Admin gets notified for their site’s new tickets.');
bulletEn('Create user with multiple sites.');
bulletEn('Deleted user missing from Assign list.');
bulletEn('Edit cost on a Closed ticket.');
bulletEn('Priority column visible on ticket table.');

// ═══════════════════════════════════════════════════════════════════════════
doc.addPage();
langBanner('العربية', 'ENGLISH', 'اردو');
sectionTitleRtl('٢. العربية — دليل استخدام النظام');

h2Rtl('٢.١ ما هو نظام FMC؟');
pRtl('مركز صيانة المرافق (FMC) هو نظام بن قريعة للإبلاغ عن أعطال المرافق وإدارتها عبر مسح رمز QR للغرفة. أرقام التذاكر تبدأ بـ FMC- (مثال: FMC-2026-0001).');

h2Rtl('٢.٢ من يستخدم النظام؟');
bulletRtl('مقدّم البلاغ (أي موظف): يمسح QR ويقدّم طلب صيانة.');
bulletRtl('المسؤول الرئيسي (Admin): صلاحية كاملة على كل المواقع والمستخدمين والغرف والتذاكر والتكاليف.');
bulletRtl('مسؤول الموقع / Sub Admin (المكلّف): يدير تذاكر موقعه ويستلم تنبيهات التذاكر الجديدة.');
bulletRtl('موظف الصيانة (Facility): ينفّذ التذاكر المعيّنة له.');
bulletRtl('عارض (Viewer): صلاحية قراءة فقط عند منحها.');

h2Rtl('٢.٣ كيفية تقديم بلاغ (QR ← النموذج)');
bulletRtl('امسح QR الغرفة بكاميرا الجوال، أو افتح الموقع واختر Scan.');
bulletRtl('النموذج يفتح فقط لرمز غرفة صالح (الموقع مربوط بتلك الغرفة).');
bulletRtl('أدخل: الاسم، الرقم الوظيفي، الجوال (مطلوب للواتساب)، الأصل، نوع العطل، الأولوية، الملاحظات.');
bulletRtl('اختياري: إرفاق صورة.');
bulletRtl('أرسل الطلب واحفظ رقم التذكرة للمتابعة.');
bulletRtl('الملصقات النصية القديمة: افتح الموقع ← Scan من داخل التطبيق. لا تعِد الطباعة إلا إذا احتجت فتح الكاميرا مباشرة.');

h2Rtl('٢.٤ متابعة التذكرة');
bulletRtl('افتح تبويب التتبع (Track).');
bulletRtl('أدخل رقم التذكرة والرقم الوظيفي معاً.');
bulletRtl('شاهد الحالة: جديد ← قيد التنفيذ ← تم الحل ← مغلق (أو مرفوض).');

h2Rtl('٢.٥ لوحة المسؤول');
bulletRtl('سجّل الدخول من Command Center.');
bulletRtl('جدول التذاكر يعرض عمود الأولوية فوراً.');
bulletRtl('افتح التذكرة لتعيين فني وتحديث الحالة وإضافة القطع والتكلفة.');
bulletRtl('يمكن إضافة/تعديل التكلفة حتى بعد إغلاق التذكرة.');
bulletRtl('المستخدمون المحذوفون لا يظهرون في قائمة التعيين.');
bulletRtl('تجاوز الوقت (SLA Breached): تذاكر جديدة/معلقة مضى عليها أكثر من ٢٤ ساعة.');

h2Rtl('٢.٦ إدارة الموظفين');
bulletRtl('إنشاء مستخدم مع دور وموقع واحد أو عدة مواقع.');
bulletRtl('أدخل الاسم والجوال والبريد لتصل تنبيهات الواتساب للمسؤولين.');
bulletRtl('حذف المستخدم يعطّله ويزيله من قائمة التعيين.');

h2Rtl('٢.٧ المواقع ورموز QR');
bulletRtl('مدير المواقع يعرض المخيمات وملصقات QR.');
bulletRtl('لا تغيّر توكنات QR المطبوعة — الملصقات الحالية تبقى صالحة.');
bulletRtl('إضافة موقع جديد عبر النموذج (اسم الغرفة، القسم، الموقع، الأصول).');

h2Rtl('٢.٨ الإشعارات');
bulletRtl('تذكرة جديدة: واتساب + إشعار داخل النظام للمسؤولين ومسؤول الموقع.');
bulletRtl('قد يصل واتساب لمقدّم البلاغ عند الحل/الإغلاق عند تفعيل قوالب Twilio.');

h2Rtl('٢.٩ قائمة تحقق سريعة');
bulletRtl('QR يفتح النموذج لـ MGS BQ ومادينا والمواقع الأخرى.');
bulletRtl('Sub Admin يستلم إشعار موقعه.');
bulletRtl('إنشاء مستخدم بعدة مواقع.');
bulletRtl('المحذوف لا يظهر في التعيين.');
bulletRtl('تعديل التكلفة بعد الإغلاق.');
bulletRtl('عمود الأولوية ظاهر في الجدول.');

// ═══════════════════════════════════════════════════════════════════════════
doc.addPage();
langBanner('اردو', 'العربية', 'ENGLISH');
sectionTitleRtl('۳. اردو — سسٹم گائیڈ لائن');

h2Rtl('۳.۱ FMC کیا ہے؟');
pRtl('Facility Maintenance Center (FMC) بن قریعہ کا سسٹم ہے جو کمرے کے QR کوڈ اسکین کر کے سہولت کی خرابی رپورٹ اور مینج کرتا ہے۔ ٹکٹ نمبر FMC- سے شروع ہوتے ہیں (مثال: FMC-2026-0001)۔');

h2Rtl('۳.۲ کون استعمال کرتا ہے؟');
bulletRtl('رپورٹر (کوئی بھی ملازم): QR اسکین کر کے درخواست جمع کراتا ہے۔');
bulletRtl('مین ایڈمن: تمام سائٹس، یوزرز، کمروں اور ٹکٹس پر مکمل کنٹرول۔');
bulletRtl('سائٹ / سب ایڈمن (انچارج): اپنی کیمپ کی ٹکٹس سنبھالتا ہے اور نئی ٹکٹ کی اطلاع وصول کرتا ہے۔');
bulletRtl('فیسلٹی سٹاف: تفویض شدہ ٹکٹس پر کام کرتا ہے۔');
bulletRtl('ویوور: صرف دیکھنے کی اجازت جہاں دی گئی ہو۔');

h2Rtl('۳.۳ خرابی کیسے رپورٹ کریں (QR ← فارم)');
bulletRtl('فون کیمرے سے کمرے کا QR اسکین کریں، یا ایپ کھول کر Scan استعمال کریں۔');
bulletRtl('فارم صرف درست روم QR پر کھلتا ہے (لوکیشن اس کمرے سے منسلک ہوتی ہے)۔');
bulletRtl('نام، ایمپلائی آئی ڈی، فون (واٹس ایپ کے لیے ضروری)، اثاثہ، مسئلہ، ترجیح، نوٹس درج کریں۔');
bulletRtl('اختیاری: تصویر لگائیں۔');
bulletRtl('جمع کروائیں اور ٹکٹ نمبر محفوظ رکھیں۔');
bulletRtl('پرانی ٹیکسٹ سٹیکرز: ویب سائٹ کھولیں ← اندرونِ ایپ Scan۔ جب تک کیمرہ لنک نہ چاہیے دوبارہ پرنٹ نہ کریں۔');

h2Rtl('۳.۴ ٹکٹ ٹریک کریں');
bulletRtl('Track کھولیں۔');
bulletRtl('ٹکٹ نمبر اور ایمپلائی آئی ڈی دونوں درج کریں۔');
bulletRtl('اسٹیٹس دیکھیں: New → In Progress → Resolved → Closed۔');

h2Rtl('۳.۵ ایڈمن ڈیش بورڈ');
bulletRtl('Command Center سے لاگ اِن کریں۔');
bulletRtl('ٹکٹ فہرست میں Priority کالم فوراً نظر آتا ہے۔');
bulletRtl('ٹکٹ کھول کر ٹیکنیشن تفویض، اسٹیٹس، پارٹس اور لاگت اپڈیٹ کریں۔');
bulletRtl('Closed ہونے کے بعد بھی لاگت ایڈ/اپڈیٹ کی جا سکتی ہے۔');
bulletRtl('ڈیلیٹڈ/غیر فعال یوزر Assign فہرست میں نہیں آتے۔');
bulletRtl('SLA Breached: New/Pending ٹکٹس جن پر ۲۴ گھنٹے سے زیادہ گزر چکے ہوں۔');

h2Rtl('۳.۶ سٹاف مینیجر');
bulletRtl('نیا یوزر بنائیں: رول اور ایک یا زیادہ سائٹس۔');
bulletRtl('نام، فون، ای میل درج کریں تاکہ واٹس ایپ الرٹس پہنچ سکیں۔');
bulletRtl('یوزر ڈیلیٹ کرنے سے وہ Assign فہرست سے ہٹ جاتا ہے۔');

h2Rtl('۳.۷ مقامات اور QR');
bulletRtl('Location Manager میں کیمپس اور QR سٹیکرز دکھائی دیتی ہیں۔');
bulletRtl('پرنٹ شدہ QR ٹوکن تبدیل نہ کریں — پرانی سٹیکرز درست رہیں گی۔');
bulletRtl('Add Location سے نیا کمرہ، ڈیپارٹمنٹ، سائٹ اور اثاثے شامل کریں۔');

h2Rtl('۳.۸ نوٹیفکیشنز');
bulletRtl('نئی ٹکٹ: مین ایڈمنز اور متعلقہ سب ایڈمن کو واٹس ایپ + اِن اپ الرٹ۔');
bulletRtl('حل/بند ہونے پر رپورٹر کو واٹس ایپ مل سکتا ہے (Twilio ٹیمپلیٹس فعال ہوں تو)۔');

h2Rtl('۳.۹ ٹیسٹ چیک لسٹ');
bulletRtl('MGS BQ، مدینہ اور دیگر کیمپس کا QR فارم کھولے۔');
bulletRtl('سب ایڈمن کو اپنی سائٹ کی اطلاع ملے۔');
bulletRtl('ملٹی سائٹ یوزر بنانا ممکن ہو۔');
bulletRtl('ڈیلیٹڈ یوزر Assign میں نہ ہو۔');
bulletRtl('Closed ٹکٹ پر لاگت اپڈیٹ ہو۔');
bulletRtl('Priority کالم نظر آئے۔');

// ─── Footer note ─────────────────────────────────────────────────────────────
doc.addPage();
sectionTitleEn('Support & notes');
pEn('Brand: Facility Maintenance Center (FMC) — Bin Qurai'ah.');
pEn('Do not regenerate or rewrite printed QR tokens; legacy stickers remain supported via in-app Scan and token resolve.');
pEn('For WhatsApp delivery, user phone numbers and Twilio Content templates must be configured.');
doc.moveDown(0.8);
pRtl('العلامة: مركز صيانة المرافق (FMC) — بن قريعة. لا تُغيّر توكنات QR المطبوعة.');
doc.moveDown(0.4);
pRtl('برانڈ: Facility Maintenance Center (FMC) — بن قریعہ۔ پرنٹ شدہ QR ٹوکن تبدیل نہ کریں۔');

doc.end();
console.log(`Wrote ${outPath}`);
