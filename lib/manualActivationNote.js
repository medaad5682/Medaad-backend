// ============================================================
// 📝 ملاحظة المدرس عند التفعيل اليدوي (تُضاف لخانة subscription_requests.user_note)
// ============================================================
export const MAX_TEACHER_NOTE_LENGTH = 200;

export function buildManualActivationNote(baseText, teacherNote) {
  const note = String(teacherNote ?? '')
    .replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TEACHER_NOTE_LENGTH);
  return note ? `${baseText}\nملاحظة المدرس: ${note}` : baseText;
}
