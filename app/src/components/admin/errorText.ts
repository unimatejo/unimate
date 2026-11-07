import { t } from '@/lib/i18n';

/** How much an error needs the owner: fix it, keep an eye on it, or nothing to do (it passes by itself). */
export type Weight = 'fix' | 'watch' | 'fine';
export type Explained = { title: string; what: string; weight: Weight };

type Rule = [RegExp, (m: RegExpMatchArray) => Explained];

/**
 * The errors phones send are technical English. Each known kind gets a plain Arabic name, what it means for the
 * student, and whether anything needs doing. The original text stays one tap away for fixing.
 */
const RULES: Rule[] = [
  [/Loading module .* failed|Requiring unknown module|Unexpected (keyword|token) 'export'|ChunkLoadError/i, () => ({
    title: t('صفحة من نسخة قديمة لم تُحمَّل'),
    what: t('كان التطبيق مفتوحًا عند الطالب أثناء نشر تحديث، فطلب ملفًا لم يعد موجودًا. يُحل تلقائيًا عند إعادة فتح التطبيق.'),
    weight: 'fine' })],
  [/JWT expired|PGRST303/i, () => ({
    title: t('انتهت جلسة الدخول'), what: t('بقي التطبيق مفتوحًا طويلًا فانتهت صلاحية الجلسة، ويجددها التطبيق تلقائيًا.'), weight: 'fine' })],
  [/permission denied for (function|table) (\w+)/i, (m) => ({
    title: t('رفض الخادم طلبًا'), what: t('طلب التطبيق «{0}» دون صلاحية. إن تكرر فهو خلل يحتاج إصلاحًا.', [m[2]]), weight: 'fix' })],
  [/PGRST2\d\d|Could not embed|column .* does not exist|relation .* does not exist/i, () => ({
    title: t('طلب بيانات غير صحيح'), what: t('طلبت إحدى الشاشات بيانات بطريقة لا يفهمها الخادم، فلم تظهر. يحتاج إصلاحًا في الكود.'), weight: 'fix' })],
  [/Cannot read propert|undefined is not an object|is not a function|is not defined|Maximum update depth|Rendered (more|fewer) hooks/i, () => ({
    title: t('خلل برمجي في شاشة'), what: t('توقف جزء من الشاشة عن العمل بسبب خطأ في الكود. يحتاج إصلاحًا.'), weight: 'fix' })],
  [/cannot add .*callbacks for realtime|subscribe\(\)/i, () => ({
    title: t('اتصال مباشر مكرر'), what: t('حاولت شاشة فتح اتصال التحديث المباشر مرتين. لا يراه الطالب، لكن يحسن إصلاحه.'), weight: 'watch' })],
  [/play\(\) failed because the user didn't interact|NotAllowedError/i, () => ({
    title: t('منع المتصفح تشغيل الصوت تلقائيًا'), what: t('المتصفح لا يشغّل الصوت قبل أول لمسة من الطالب. سلوك طبيعي.'), weight: 'fine' })],
  [/Failed to load the image|image.*(failed|error)/i, () => ({
    title: t('تعذّر تحميل صورة'), what: t('لم تُحمَّل صورة، غالبًا بسبب ضعف الإنترنت أو حذف الصورة.'), weight: 'fine' })],
  [/operation was aborted|AbortError|Network request failed|Failed to fetch|NetworkError|timed? ?out|Load failed/i, () => ({
    title: t('انقطع الاتصال'), what: t('ضعف الإنترنت عند الطالب أوقف طلبًا قبل اكتماله.'), weight: 'fine' })],
  [/video-compress/i, () => ({
    title: t('ضغط الفيديو استغرق وقتًا طويلًا'), what: t('هاتف الطالب بطيء في ضغط الفيديو، فرُفع الفيديو دون ضغط.'), weight: 'watch' })],
  [/not available on web/i, () => ({
    title: t('ميزة غير متاحة في المتصفح'), what: t('طُلبت ميزة تعمل على الهاتف فقط داخل المتصفح.'), weight: 'watch' })],
  [/already running/i, () => ({ title: t('عملية بدأت مرتين'), what: t('ضُغط زر مرتين بسرعة. لا يؤثر على الطالب.'), weight: 'fine' })],
  [/^P0001 · blocked/, () => ({ title: t('طلب محظور'), what: t('رفض الخادم إجراءً لأن أحد الطرفين حظر الآخر.'), weight: 'fine' })],
  [/^\[object Object\]$/, () => ({ title: t('خطأ دون وصف'), what: t('وصل خطأ دون تفاصيل. إن تكرر فراجع الشاشة التي ظهر فيها.'), weight: 'watch' })],
];

export function explain(message: string): Explained {
  for (const [re, f] of RULES) { const m = message.match(re); if (m) return f(m); }
  // a message the student saw in Arabic already says what happened
  if (/[؀-ۿ]/.test(message)) return { title: message.slice(0, 80), what: t('رسالة ظهرت للطالب كما هي.'), weight: 'watch' };
  return { title: t('خطأ غير معروف'), what: t('خطأ لم يُصنَّف بعد. التفاصيل التقنية أدناه.'), weight: 'watch' };
}

/** Errors that are the same problem (the file names and numbers in them aside) count as one. */
export const errorKey = (message: string) => message.replace(/[0-9a-f]{8,}|\d+/gi, '#').replace(/https?:\/\/\S+/g, 'url').slice(0, 120);
