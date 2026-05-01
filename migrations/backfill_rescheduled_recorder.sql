-- ════════════════════════════════════════════════════════════════
-- BACKFILL: คืนค่า recorded_by ของคิว rescheduled_in
-- ────────────────────────────────────────────────────────────────
-- Bug: ก่อน PR #37 ทุกครั้งที่มีการเลื่อนคิว ระบบจะตั้ง recorded_by
--      เป็น user ที่กดเลื่อน (พนักงานหน้าร้าน) แทนที่จะคงเป็น
--      คนบันทึกคิวต้นทาง → ทำให้คอมมิชชั่นเพี้ยน
--
-- วิธีจับคู่: หา rescheduled (ต้นทาง) ที่
--   • phone เดียวกัน
--   • branch_id เดียวกัน
--   • procedure_id เดียวกัน
--   • created_at <= rescheduled_in.created_at (ต้นทางต้องเกิดก่อน)
-- แล้วเอาตัวที่ created_at ใกล้ที่สุด (อันล่าสุดก่อนหน้า)
-- ════════════════════════════════════════════════════════════════

-- ════════ STEP 1 — DRY RUN (ดูก่อนว่ากระทบกี่แถว, ใครเปลี่ยนเป็นใคร) ════════
WITH pairs AS (
  SELECT DISTINCT ON (ri.id)
    ri.id              AS rescheduled_in_id,
    ri.name            AS customer_name,
    ri.phone,
    ri.date            AS new_date,
    ri.created_at      AS new_created_at,
    ri.recorded_by     AS current_recorder,
    src.recorded_by    AS original_recorder,
    src.id             AS source_id
  FROM queues ri
  JOIN queues src
    ON src.status      = 'rescheduled'
   AND src.phone       = ri.phone
   AND src.branch_id   = ri.branch_id
   AND COALESCE(src.procedure_id::text, '') = COALESCE(ri.procedure_id::text, '')
   AND src.created_at <= ri.created_at
   AND src.id <> ri.id
  WHERE ri.status      = 'rescheduled_in'
    AND ri.created_at >= NOW() - INTERVAL '35 days'
  ORDER BY ri.id, src.created_at DESC
)
SELECT
  rescheduled_in_id,
  customer_name,
  phone,
  new_date,
  current_recorder  AS "เดิม (ผิด)",
  original_recorder AS "ต้องเป็น (ถูก)",
  CASE
    WHEN current_recorder IS DISTINCT FROM original_recorder THEN '⚠️ ต้องแก้'
    ELSE '✅ ถูกอยู่แล้ว'
  END AS action
FROM pairs
ORDER BY new_created_at DESC;


-- ════════ STEP 2 — UPDATE จริง (run หลังจากตรวจ STEP 1 แล้ว) ════════
-- คอมเมนต์ออกก่อน เพื่อกัน run พลาด — ลบ /* ... */ แล้วค่อย run
/*
WITH pairs AS (
  SELECT DISTINCT ON (ri.id)
    ri.id           AS rescheduled_in_id,
    src.recorded_by AS original_recorder
  FROM queues ri
  JOIN queues src
    ON src.status      = 'rescheduled'
   AND src.phone       = ri.phone
   AND src.branch_id   = ri.branch_id
   AND COALESCE(src.procedure_id::text, '') = COALESCE(ri.procedure_id::text, '')
   AND src.created_at <= ri.created_at
   AND src.id <> ri.id
  WHERE ri.status      = 'rescheduled_in'
    AND ri.created_at >= NOW() - INTERVAL '35 days'
  ORDER BY ri.id, src.created_at DESC
)
UPDATE queues q
SET    recorded_by = p.original_recorder
FROM   pairs p
WHERE  q.id = p.rescheduled_in_id
  AND  q.recorded_by IS DISTINCT FROM p.original_recorder
  AND  p.original_recorder IS NOT NULL
RETURNING q.id, q.name, q.phone, q.recorded_by;
*/
