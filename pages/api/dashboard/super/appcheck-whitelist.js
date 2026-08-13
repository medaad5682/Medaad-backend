import { supabase } from '../../../../lib/supabaseClient';
import { requireSuperAdmin } from '../../../../lib/dashboardHelper';
import { invalidateAppCheckWhitelistCache } from '../../../../lib/appCheckWhitelist';

export default async function handler(req, res) {
  // 1. حماية المسار: تأكد أن من يطلب هذا الـ API هو السوبر أدمن فقط
  const authResult = await requireSuperAdmin(req, res);
  if (authResult.error) return;

  // ==========================================================
  // 🟢 GET: جلب كل عناصر القائمة البيضاء
  // ==========================================================
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('app_check_whitelist')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return res.status(200).json({ items: data || [] });
    } catch (err) {
      console.error('AppCheck Whitelist Get Error:', err);
      return res.status(500).json({ error: 'فشل جلب القائمة البيضاء' });
    }
  }

  // ==========================================================
  // 🟠 POST: تنفيذ الإجراءات (إضافة / تفعيل-تعطيل / حذف)
  // ==========================================================
  if (req.method === 'POST') {
    const { action, payload } = req.body;

    try {
      // 1. إضافة عنصر جديد إلى القائمة البيضاء
      if (action === 'add') {
        const rawInput = (payload?.value || '').trim();
        const note = (payload?.note || '').trim() || null;
        let label = (payload?.label || '').trim() || null;

        if (!rawInput) {
          return res.status(400).json({ error: 'يجب إدخال معرّف المستخدم (user_id) أو اسم المستخدم أو رقم الهاتف أو البريد الإلكتروني' });
        }

        // 🆕 =========================================================
        // 🆕 استخراج user_id تلقائياً من المُدخل مهما كانت صيغته:
        // 🆕 - إذا كان رقماً صحيحاً: نتحقق أولاً إن كان user_id، وإلا نجرّبه كرقم هاتف.
        // 🆕 - إذا كان يحتوي على @: نبحث عنه كبريد إلكتروني في جدول users.
        // 🆕 - غير ذلك (نص): نبحث عنه كاسم مستخدم في جدول users.
        // 🆕 في كل الحالات نستخرج id الحقيقي تلقائياً ونخزّنه بدل القيمة المُدخلة.
        // 🆕 =========================================================
        let resolvedUserId = null;
        let matchedUser = null;

        const isNumericId = /^\d+$/.test(rawInput);
        const isEmail = rawInput.includes('@');

        if (isNumericId) {
          const { data: byId } = await supabase
            .from('users')
            .select('id, username, phone, email')
            .eq('id', rawInput)
            .maybeSingle();

          if (byId) {
            matchedUser = byId;
          } else {
            const { data: byPhone } = await supabase
              .from('users')
              .select('id, username, phone, email')
              .eq('phone', rawInput)
              .maybeSingle();
            matchedUser = byPhone || null;
          }
        } else if (isEmail) {
          const { data: byEmail } = await supabase
            .from('users')
            .select('id, username, phone, email')
            .eq('email', rawInput.trim().toLowerCase())
            .maybeSingle();
          matchedUser = byEmail || null;
        } else {
          const { data: byUsername } = await supabase
            .from('users')
            .select('id, username, phone, email')
            .eq('username', rawInput)
            .maybeSingle();
          matchedUser = byUsername || null;
        }

        if (matchedUser) {
          resolvedUserId = String(matchedUser.id);
          if (!label) label = matchedUser.username || null;
        }

        // القيمة التي سنخزنها: user_id الحقيقي إذا وجدنا المستخدم في قاعدة البيانات،
        // وإلا نخزّن المُدخل كما هو كحل احتياطي (مثلاً إذا لم يُطابق أي مستخدم بعد).
        const valueToStore = resolvedUserId || rawInput;

        const { error } = await supabase.from('app_check_whitelist').insert({
          value: valueToStore,
          label,
          note,
          is_active: true,
        });

        if (error) {
          if (error.code === '23505') {
            return res.status(400).json({ error: 'هذا المعرّف موجود بالفعل في القائمة البيضاء' });
          }
          throw error;
        }

        invalidateAppCheckWhitelistCache();

        const successMessage = resolvedUserId
          ? `✅ تم العثور على المستخدم "${matchedUser.username}" وإضافته للقائمة البيضاء بمعرّف (user_id: ${resolvedUserId})`
          : '⚠️ لم يتم العثور على مستخدم مطابق بقاعدة البيانات، تمت إضافة القيمة المُدخلة كما هي كحل احتياطي';

        return res.status(200).json({ success: true, message: successMessage, resolvedUserId });
      }

      // 2. تفعيل / تعطيل عنصر
      if (action === 'toggle') {
        const { error } = await supabase
          .from('app_check_whitelist')
          .update({ is_active: payload.is_active })
          .eq('id', payload.id);

        if (error) throw error;

        invalidateAppCheckWhitelistCache();
        return res.status(200).json({
          success: true,
          message: payload.is_active ? '🟢 تم تفعيل العنصر' : '🔴 تم تعطيل العنصر',
        });
      }

      // 3. حذف عنصر نهائياً
      if (action === 'delete') {
        const { error } = await supabase.from('app_check_whitelist').delete().eq('id', payload.id);
        if (error) throw error;

        invalidateAppCheckWhitelistCache();
        return res.status(200).json({ success: true, message: '🗑️ تم الحذف من القائمة البيضاء' });
      }

      return res.status(400).json({ error: 'إجراء غير معروف' });
    } catch (err) {
      console.error('AppCheck Whitelist Admin Error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
