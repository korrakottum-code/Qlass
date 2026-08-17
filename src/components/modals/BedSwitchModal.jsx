import { useState } from "react";
import { ModalHeader, ModalBody, ModalFooter } from "../Modal";
import { blockToTime, formatThaiDate } from "../../utils/helpers";
import { BED_SWITCH_DEFAULT_NOTE, summarizeQueueList } from "../../utils/bedSwitch";

/**
 * ยืนยันปิด/เปิดเตียงรายวัน — เปิดจากปุ่มบนหัวคอลัมน์ Timeline
 *
 * bedState มาจาก getBedSwitchState (คำนวณสดใน App.jsx ตอน render):
 *   open             → โหมดปิด: โชว์คิวที่จองอยู่ (ถ้ามี) + ช่องหมายเหตุ → ยืนยันปิด
 *   closed_by_switch → โหมดเปิดคืน
 *   closed_by_hand   → ไม่ควรมาถึงนี่ (ปุ่มถูก disable) แต่กันไว้: บอกให้ไปเปิดที่หน้าตารางห้อง
 *
 * ทำไมโชว์คิวก่อนปิด: ระบบเดิมยอมให้ปิดเตียงทับคิวเงียบ ๆ (พบ 15 คิวข้างหน้านั่งอยู่บนเตียง
 * ที่ปิดทั้งวันไปแล้ว) เจ้าของเคาะว่าให้ปิดได้แต่ต้องเห็นรายชื่อก่อน คิวไม่ถูกย้าย หน้าร้านจัดการเอง
 */
export default function BedSwitchModal({ room, date, bedState, queuesOnBed = [], onSave, onClose }) {
  const [note, setNote] = useState(BED_SWITCH_DEFAULT_NOTE);
  const isOpening = bedState === "closed_by_switch";
  const isHand = bedState === "closed_by_hand";
  const { shown, hiddenCount } = summarizeQueueList(queuesOnBed, 8);

  return (
    <>
      <ModalHeader
        title={isOpening ? `🔓 เปิดเตียง ${room.name} คืน` : `⛔ ปิดเตียง ${room.name}`}
        onClose={onClose}
      />
      <ModalBody>
        <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 12 }}>
          📅 {formatThaiDate(date)} — มีผลเฉพาะวันนี้เท่านั้น
        </div>

        {isHand && (
          <div style={{
            padding: "10px 12px", borderRadius: "var(--radius-sm)",
            border: "1.5px solid var(--amber)", background: "rgba(217,119,6,0.10)",
            fontSize: 13, color: "var(--amber)", fontWeight: 600, lineHeight: 1.6,
          }}>
            เตียงนี้ถูกปิดไว้จากหน้า "ตารางห้อง/เครื่อง" — เปิดคืนได้ที่หน้านั้น
            <div style={{ fontWeight: 400, marginTop: 2 }}>ปุ่มนี้ลบเฉพาะรายการที่ตัวเองสร้าง จะได้ไม่ไปแตะของที่คนอื่นตั้งใจกรอกไว้</div>
          </div>
        )}

        {isOpening && (
          <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            เตียงจะกลับมารับคิวได้ตามเวลาปกติ
            <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>
              ลบเฉพาะรายการปิดที่สร้างจากปุ่มนี้ — รายการอื่นในตารางห้อง/เครื่องไม่ถูกแตะ
            </div>
          </div>
        )}

        {!isOpening && !isHand && (
          <>
            {queuesOnBed.length > 0 ? (
              <div style={{
                padding: "10px 12px", borderRadius: "var(--radius-sm)", marginBottom: 12,
                border: "1.5px solid var(--amber)", background: "rgba(217,119,6,0.10)",
                fontSize: 13, lineHeight: 1.6,
              }}>
                <div style={{ fontWeight: 700, color: "var(--amber)" }}>
                  ⚠️ มีคิวจองอยู่ {queuesOnBed.length} คิวบนเตียงนี้
                </div>
                <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 6 }}>
                  จะยังปิดเตียงได้ แต่คิวเหล่านี้<strong>ไม่ถูกย้ายหรือยกเลิก</strong> — กรุณาโทรแจ้ง/ย้ายเอง
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
                  {shown.map((q) => (
                    <li key={q.id}>
                      <span style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>
                        {q.timeBlock !== null && q.timeBlock !== undefined ? blockToTime(q.timeBlock) : "--:--"}
                      </span>
                      {" · "}{q.name || "—"}
                    </li>
                  ))}
                  {hiddenCount > 0 && (
                    <li style={{ color: "var(--text3)", listStyle: "none", marginLeft: -18 }}>…และอีก {hiddenCount} คิว</li>
                  )}
                </ul>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "var(--green)", fontWeight: 600, marginBottom: 12 }}>
                ✓ ไม่มีคิวจองอยู่บนเตียงนี้
              </div>
            )}

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">หมายเหตุ (โชว์บนหัวคอลัมน์ Timeline)</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={BED_SWITCH_DEFAULT_NOTE}
              />
            </div>
          </>
        )}
      </ModalBody>
      <ModalFooter
        onClose={onClose}
        onSave={() => onSave({ note })}
        saveLabel={isOpening ? "🔓 เปิดเตียงคืน" : "⛔ ยืนยันปิดเตียง"}
        disabled={isHand}
      />
    </>
  );
}
