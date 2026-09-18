import { supabase } from './supabaseClient';

// ============================================================
// 💰 Teacher billing helper (Multi-Method Teacher Billing)
// ============================================================
// Single source of truth for "how much does the platform take from this
// teacher's sales". Every report endpoint (finance overview, single-teacher
// report, teacher-facing earnings widgets) should call
// computeTeacherBilling() instead of re-implementing the math or calling
// the old opaque `get_teacher_revenue` / `get_teacher_actual_revenue` RPCs
// directly — those RPCs only knew about the old flat-percentage model.
//
// A teacher's `teachers.billing_method` decides which of the 3 methods is
// used for that teacher's ENTIRE requested date range (no versioning —
// see README note in the plan if that's ever needed):
//
//   percentage    -> platform_fee = sum(actual_paid_price ?? total_price)
//                    over approved requests * effective percentage
//                    (teachers.custom_percentage, else the global
//                    app_settings.platform_percentage)
//
//   new_student   -> platform_fee = (# approved requests whose student was
//                    NEW to this teacher at the time of that request)
//                    * teachers.new_student_price
//                    "New" is checked against a per-teacher lookback window
//                    (teachers.new_student_lookback_mode): 'forever' (default)
//                    checks all history, 'since_date' only counts prior
//                    approved requests on/after new_student_lookback_since —
//                    so the super admin can decide, per teacher, whether an
//                    old subscriber from before a chosen date should count
//                    as a "new" student again.
//
//   course_price  -> platform_fee = sum, over every item in every approved
//                    request, of that item's `report_price` (subject
//                    override -> course fallback -> 0/unpriced)
//
// In every case: platform_fee is subtracted from the actual amount
// collected to get the teacher's net_profit — this mirrors how the old
// percentage-only math worked, so the finance dashboard's existing
// "platform fee / net profit" columns keep meaning the same thing for all
// three methods (see the "one assumption to confirm" note in the plan;
// flip the subtraction here in ONE place if that assumption turns out to
// be wrong instead of touching every consumer).
// ============================================================

const VALID_BILLING_METHODS = ['percentage', 'new_student', 'course_price'];

// ------------------------------------------------------------
// Small money/amount helpers
// ------------------------------------------------------------

// A request's "actual" amount is the admin-edited actual_paid_price when
// set, else falls back to the originally requested total_price.
function actualAmountOf(request) {
  const val = request?.actual_paid_price;
  if (val === null || val === undefined) return Number(request?.total_price) || 0;
  return Number(val) || 0;
}

function originalAmountOf(request) {
  return Number(request?.total_price) || 0;
}

// ------------------------------------------------------------
// Global % (existing logic, moved here so it's read from one place)
// ------------------------------------------------------------

/**
 * @returns {Promise<number>} platform percentage as a 0-1 fraction (e.g. 0.10 for 10%)
 */
export async function getGlobalPlatformPercentage() {
  let percentage = 0.10; // default 10%

  const { data: settingsData } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'platform_percentage')
    .maybeSingle();

  if (settingsData && settingsData.value) {
    const val = parseFloat(settingsData.value);
    if (!isNaN(val)) {
      // نفس المنطق القديم: لو الرقم أكبر من 1 (مثل 15) نقسمه على 100
      percentage = val > 1 ? val / 100 : val;
    }
  }

  return percentage;
}

/**
 * Resolve the % that should apply to a teacher on billing_method='percentage':
 * their own custom_percentage override if set, else a caller-supplied
 * fallback (avoids re-querying app_settings once per teacher when a caller
 * already fetched it — see finance.js), else the global setting.
 * @param {{ custom_percentage?: number|null }} teacher
 * @param {number|null} [fallbackGlobalPercentage] - already-resolved global
 *   percentage (0-1 fraction) to use instead of querying app_settings again.
 * @returns {Promise<number>} 0-1 fraction
 */
export async function resolveEffectivePercentage(teacher, fallbackGlobalPercentage = null) {
  if (teacher && teacher.custom_percentage !== null && teacher.custom_percentage !== undefined) {
    const custom = Number(teacher.custom_percentage);
    if (Number.isFinite(custom)) {
      // custom_percentage is stored 0-100 (validated at write time), not 0-1
      return custom / 100;
    }
  }
  if (fallbackGlobalPercentage !== null && fallbackGlobalPercentage !== undefined) {
    return fallbackGlobalPercentage;
  }
  return await getGlobalPlatformPercentage();
}

// ------------------------------------------------------------
// "New student" check (billing_method = 'new_student')
// ------------------------------------------------------------

/**
 * Was this student NEW to this teacher as of `beforeTimestamp`?
 * "New" = no earlier APPROVED request from the same student with the same
 * teacher. Always evaluated against the request's OWN created_at (passed
 * in as beforeTimestamp) rather than "now", so re-running a report for a
 * past period gives the same answer even after later subscriptions happen.
 *
 * Matches students by user_username (always present & unique), not
 * user_id, since user_id can be null until a request is approved.
 *
 * By default this looks back through ALL history (teacher's
 * new_student_lookback_mode='forever'). If the teacher is configured with
 * new_student_lookback_mode='since_date', pass that cutoff as
 * `lookbackSince` — approved requests strictly before it are ignored, so a
 * student whose only prior subscription predates the cutoff is counted as
 * new again.
 *
 * @param {string} userUsername
 * @param {number|string} teacherId - teacher_profile_id / teachers.id
 * @param {string} beforeTimestamp - ISO timestamp, exclusive upper bound
 * @param {string|null} [lookbackSince] - ISO date/timestamp, inclusive lower
 *   bound for what counts as a "prior" request. null/undefined = no lower
 *   bound (look back forever), matching the original behavior.
 * @returns {Promise<boolean>}
 */
export async function isNewStudentForTeacher(userUsername, teacherId, beforeTimestamp, lookbackSince = null) {
  if (!userUsername || !teacherId || !beforeTimestamp) return true;

  let query = supabase
    .from('subscription_requests')
    .select('id', { count: 'exact', head: true })
    .eq('teacher_id', teacherId)
    .eq('user_username', userUsername)
    .eq('status', 'approved')
    .lt('created_at', beforeTimestamp);

  if (lookbackSince) {
    query = query.gte('created_at', lookbackSince);
  }

  const { count, error } = await query;

  if (error) {
    console.error('⚠️ [teacherBillingHelper] isNewStudentForTeacher failed:', error.message);
    // Fail safe: don't silently under-charge/over-charge on an error —
    // treat as "not new" so it doesn't inflate the new-student count.
    return false;
  }

  return (count || 0) === 0;
}

/**
 * Batched version of isNewStudentForTeacher(): resolves is_new_student for
 * EVERY approved request of a teacher in one range with a SINGLE round-trip
 * (via the get_new_student_flags SQL RPC — see get_new_student_flags.sql),
 * instead of one query per request. Same semantics as the per-request
 * version above; prefer this in computeTeacherBilling() and anywhere else
 * that needs the flag for a batch of requests.
 *
 * @param {number|string} teacherId
 * @param {string|null} startDate - ISO timestamp (inclusive), or null
 * @param {string|null} endDate - ISO timestamp (inclusive), or null
 * @param {string|null} [lookbackSince] - see isNewStudentForTeacher
 * @returns {Promise<Map<number|string, boolean>>} request_id -> is_new_student
 */
export async function getNewStudentFlagsBatch(teacherId, startDate, endDate, lookbackSince = null) {
  const { data, error } = await supabase.rpc('get_new_student_flags', {
    p_teacher_id: teacherId,
    p_start_date: startDate,
    p_end_date: endDate,
    p_lookback_since: lookbackSince,
  });

  if (error) {
    console.error('⚠️ [teacherBillingHelper] getNewStudentFlagsBatch failed:', error.message);
    // Fail safe, same stance as the single-request version: on error,
    // don't silently inflate the new-student count.
    return new Map();
  }

  // Normalize keys to strings: PostgREST always serializes the RPC's
  // declared `bigint` return column as a JSON string, but a plain
  // `.select('*')` on the table may return request.id as a JS number
  // (if the column is int4) — without this, Map lookups by numeric id
  // would silently miss every row and default every request to "not new".
  return new Map((data || []).map(row => [String(row.request_id), row.is_new_student]));
}

// Valid values for teachers.new_student_lookback_mode.
const VALID_LOOKBACK_MODES = ['forever', 'since_date'];

/**
 * Resolve the effective lower bound to pass as `lookbackSince` to
 * isNewStudentForTeacher(), based on a teacher's lookback configuration.
 * @param {{ new_student_lookback_mode?: string, new_student_lookback_since?: string|null }} teacher
 * @returns {string|null} ISO date, or null when mode is 'forever' (or unset)
 */
export function resolveNewStudentLookbackSince(teacher) {
  if (teacher?.new_student_lookback_mode === 'since_date' && teacher?.new_student_lookback_since) {
    return teacher.new_student_lookback_since;
  }
  return null;
}

// ------------------------------------------------------------
// Report-price lookup (billing_method = 'course_price')
// ------------------------------------------------------------

/**
 * Batch-fetch report_price for a set of courses/subjects and return a
 * small resolver so each requested_data item's price can be looked up:
 * subject-level override -> parent course's price -> null (unpriced).
 *
 * @param {Array<number|string>} courseIds
 * @param {Array<number|string>} subjectIds
 * @returns {Promise<{
 *   resolvePrice: (item: {type: 'course'|'subject', id: number|string}) => number|null,
 *   courseReportPrice: Map<any, number|null>,
 *   subjectMeta: Map<any, { report_price: number|null, course_id: any }>
 * }>}
 */
export async function getReportPriceMap(courseIds = [], subjectIds = []) {
  const uniqueCourseIds = [...new Set(courseIds.filter(id => id !== null && id !== undefined))];
  const uniqueSubjectIds = [...new Set(subjectIds.filter(id => id !== null && id !== undefined))];

  // 1) Fetch subjects first. We need their parent course_id even when that
  //    course was never itself requested as a 'course' line item (e.g. a
  //    subject-only activation) — otherwise the course-price fallback below
  //    has no price to fall back to and wrongly reports "unpriced".
  const { data: subjects, error: subjectsError } = uniqueSubjectIds.length
    ? await supabase.from('subjects').select('id, course_id, report_price').in('id', uniqueSubjectIds)
    : { data: [] };
  if (subjectsError) throw subjectsError;

  const subjectParentCourseIds = (subjects || [])
    .map(s => s.course_id)
    .filter(id => id !== null && id !== undefined);

  // 2) Fetch report_price for every course we might need: the ones directly
  //    requested, PLUS every parent course of a requested subject.
  const allCourseIdsToFetch = [...new Set([...uniqueCourseIds, ...subjectParentCourseIds])];

  const { data: courses, error: coursesError } = allCourseIdsToFetch.length
    ? await supabase.from('courses').select('id, report_price').in('id', allCourseIdsToFetch)
    : { data: [] };
  if (coursesError) throw coursesError;

  const courseReportPrice = new Map((courses || []).map(c => [c.id, c.report_price ?? null]));
  const subjectMeta = new Map((subjects || []).map(s => [s.id, { report_price: s.report_price ?? null, course_id: s.course_id }]));

  function resolvePrice(item) {
    if (!item) return null;

    if (item.type === 'course') {
      return courseReportPrice.has(item.id) ? courseReportPrice.get(item.id) : null;
    }

    if (item.type === 'subject') {
      const meta = subjectMeta.get(item.id);
      if (!meta) return null;
      if (meta.report_price !== null && meta.report_price !== undefined) return meta.report_price;
      // لا يوجد سعر خاص بالمادة -> نرجع لسعر الكورس الأب (إن وجد)
      return courseReportPrice.has(meta.course_id) ? courseReportPrice.get(meta.course_id) : null;
    }

    return null;
  }

  return { resolvePrice, courseReportPrice, subjectMeta };
}

/**
 * Batch-fetch the LIVE report_price for a set of course_packages, keyed by
 * package id. Used only as a fallback in computeTeacherBilling() for
 * package requested_data items that have no `report_price` snapshot on
 * them (older rows logged before grantHelper.js started snapshotting the
 * applied price — see lib/grantHelper.js). Every new package activation
 * already carries its own snapshot, so this is normally an empty/no-op
 * lookup.
 *
 * @param {Array<number|string>} packageIds
 * @returns {Promise<Map<any, number|null>>} package id -> report_price
 */
export async function getPackageReportPriceMap(packageIds = []) {
  const uniqueIds = [...new Set(packageIds.filter(id => id !== null && id !== undefined))];
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('course_packages')
    .select('id, report_price')
    .in('id', uniqueIds);
  if (error) throw error;

  return new Map((data || []).map(p => [p.id, p.report_price ?? null]));
}

// ------------------------------------------------------------
// Main entry point
// ------------------------------------------------------------

function emptyBillingResult(billingMethod = 'percentage') {
  return {
    requests: [],
    original_amount: 0,
    actual_amount: 0,
    platform_fee: 0,
    net_profit: 0,
    billing_method: billingMethod,
    meta: { approved_count: 0, rejected_count: 0 },
  };
}

/**
 * Compute a teacher's billing for a date range, using whichever
 * billing_method that teacher is currently set to.
 *
 * @param {number|string} teacherProfileId - teachers.id (aka teacher_profile_id on users, teacher_id on subscription_requests)
 * @param {string|null} [startDate] - ISO timestamp (inclusive). Pass an
 *   already-timezone-resolved UTC boundary, same as callers currently pass
 *   to the old RPCs (see getUtcBoundary() in finance.js/teacher-report.js).
 * @param {string|null} [endDate] - ISO timestamp (inclusive)
 * @param {object} [options]
 * @param {object} [options.preloadedTeacher] - teacher config row already
 *   fetched by the caller (same columns as the internal query below) — skips
 *   the per-teacher 'teachers' query. Used by finance.js to fetch all
 *   teachers' configs in ONE query instead of one per teacher.
 * @param {Array<object>} [options.preloadedRequests] - this teacher's
 *   approved+rejected subscription_requests rows, already fetched by the
 *   caller — skips the per-teacher 'subscription_requests' query. Used by
 *   finance.js to fetch all teachers' requests in ONE query, grouped by
 *   teacher_id.
 * @param {number|null} [options.globalPercentage] - already-resolved global
 *   platform percentage (0-1 fraction) — skips the per-teacher app_settings
 *   re-fetch inside resolveEffectivePercentage() for teachers without a
 *   custom_percentage.
 * @returns {Promise<{
 *   requests: Array<object>,
 *   original_amount: number,
 *   actual_amount: number,
 *   platform_fee: number,
 *   net_profit: number,
 *   billing_method: string,
 *   meta: object
 * }>}
 */
export async function computeTeacherBilling(teacherProfileId, startDate = null, endDate = null, options = {}) {
  if (!teacherProfileId) return emptyBillingResult();

  // 1) Load the teacher's billing configuration — reuse a preloaded row
  //    when the caller already fetched it in bulk.
  let teacher = options.preloadedTeacher;
  if (!teacher) {
    const { data, error: teacherError } = await supabase
      .from('teachers')
      .select('id, billing_method, custom_percentage, new_student_price, new_student_lookback_mode, new_student_lookback_since')
      .eq('id', teacherProfileId)
      .maybeSingle();
    if (teacherError) throw teacherError;
    teacher = data;
  }

  const billingMethod = VALID_BILLING_METHODS.includes(teacher?.billing_method)
    ? teacher.billing_method
    : 'percentage';

  // 2) Load approved + rejected requests in range — reuse preloaded rows
  //    when the caller already fetched them in bulk (rejected kept only for
  //    counts).
  let requests = options.preloadedRequests;
  if (!requests) {
    let query = supabase
      .from('subscription_requests')
      .select('*')
      .eq('teacher_id', teacherProfileId)
      .in('status', ['approved', 'rejected'])
      .order('created_at', { ascending: false });

    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);

    const { data, error: requestsError } = await query;
    if (requestsError) throw requestsError;
    requests = data || [];
  }

  const approvedRequests = requests.filter(r => r.status === 'approved');
  const rejectedCount = requests.length - approvedRequests.length;

  // "Sales" totals are computed the same way regardless of billing method —
  // only how the platform_fee is derived from them changes below.
  const originalAmount = approvedRequests.reduce((sum, r) => sum + originalAmountOf(r), 0);
  const actualAmount = approvedRequests.reduce((sum, r) => sum + actualAmountOf(r), 0);

  let platformFee = 0;
  let meta = { approved_count: approvedRequests.length, rejected_count: rejectedCount };

  if (billingMethod === 'new_student') {
    // ----- Method 2: fixed fee per NEW student -----
    const newStudentPrice = Number(teacher?.new_student_price) || 0;
    const lookbackMode = teacher?.new_student_lookback_mode === 'since_date' ? 'since_date' : 'forever';
    const lookbackSince = resolveNewStudentLookbackSince(teacher);

    // Single round-trip for the whole batch instead of one query per
    // approved request (see get_new_student_flags.sql).
    const flags = await getNewStudentFlagsBatch(teacherProfileId, startDate, endDate, lookbackSince);

    let newStudentCount = 0;
    const perRequest = approvedRequests.map(request => {
      const isNew = flags.get(String(request.id)) ?? false;
      if (isNew) newStudentCount += 1;
      return { request_id: request.id, is_new_student: isNew };
    });

    platformFee = newStudentCount * newStudentPrice;
    meta = {
      ...meta,
      new_student_price: newStudentPrice,
      new_student_count: newStudentCount,
      new_student_lookback_mode: lookbackMode,
      new_student_lookback_since: lookbackSince,
      per_request: perRequest,
    };
  } else if (billingMethod === 'course_price') {
    // ----- Method 3: fixed report price per requested item -----
    // A 'package' item (see lib/grantHelper.js) is billed as ONE line at
    // its own (possibly partial-ownership-discounted) report_price — it is
    // never expanded into its member courses here, or its courses' prices
    // would be counted a second time on top of the package's own price.
    const allItems = approvedRequests.flatMap(r => r.requested_data || []);
    const courseIds = allItems.filter(i => i.type === 'course').map(i => i.id);
    const subjectIds = allItems.filter(i => i.type === 'subject').map(i => i.id);
    const packageIds = allItems
      .filter(i => i.type === 'package' && (i.report_price === null || i.report_price === undefined))
      .map(i => i.id);

    const { resolvePrice } = await getReportPriceMap(courseIds, subjectIds);
    // Only queried for package items missing their own snapshot (see above).
    const packageLivePrice = await getPackageReportPriceMap(packageIds);

    let unpricedItemsCount = 0;
    let coursesFee = 0;
    let packagesFee = 0;
    let packagesCount = 0;
    const perRequest = approvedRequests.map(request => {
      const items = (request.requested_data || []).map(item => {
        let appliedPrice;
        if (item.type === 'package') {
          appliedPrice = (item.report_price !== null && item.report_price !== undefined)
            ? Number(item.report_price)
            : (packageLivePrice.has(item.id) ? packageLivePrice.get(item.id) : null);
          if (appliedPrice !== null && appliedPrice !== undefined) {
            packagesFee += appliedPrice;
            packagesCount += 1;
          }
        } else {
          appliedPrice = resolvePrice(item);
          if (appliedPrice !== null && appliedPrice !== undefined) {
            coursesFee += appliedPrice;
          }
        }
        if (appliedPrice === null || appliedPrice === undefined) unpricedItemsCount += 1;
        const priceToApply = appliedPrice || 0;
        platformFee += priceToApply;
        return { id: item.id, type: item.type, title: item.title, applied_report_price: appliedPrice };
      });
      return { request_id: request.id, items };
    });

    meta = {
      ...meta,
      unpriced_items_count: unpricedItemsCount,
      courses_fee: coursesFee,
      packages_fee: packagesFee,
      packages_count: packagesCount,
      per_request: perRequest,
    };
  } else {
    // ----- Method 1 (default): flat/custom percentage -----
    const effectivePercentage = await resolveEffectivePercentage(teacher, options.globalPercentage);
    platformFee = actualAmount * effectivePercentage;
    meta = { ...meta, effective_percentage: effectivePercentage };
  }

  const netProfit = actualAmount - platformFee;

  return {
    requests: requests || [],
    original_amount: originalAmount,
    actual_amount: actualAmount,
    platform_fee: platformFee,
    net_profit: netProfit,
    billing_method: billingMethod,
    meta,
  };
}

export { VALID_BILLING_METHODS };
