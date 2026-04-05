import { formatThaiDate, getTodayStr } from "../utils/helpers";

const PAGE_TITLES = {
  booking: "📝 บันทึกคิว",
  "booking-edit": "✏️ แก้ไขคิว",
  "queue-table": "📋 ตารางคิว",
  branches: "🏢 จัดการสาขา",
  procedures: "💉 จัดการหัตถการ",
  promos: "🏷️ จัดการโปร/แพ็กเกจ",
  rooms: "🚪 จัดการห้องหัตถการ",
  "room-schedule": "📅 ตารางห้อง/เครื่อง",
  summary: "📊 สรุปประจำวัน",
  commission: "💰 ค่าคอมมิชชั่น",
  staff: "👥 จัดการพนักงาน",
};

export default function TopBar({ page, isEditing }) {
  const titleKey = page === "booking" && isEditing ? "booking-edit" : page;
  return (
    <div className="top-bar">
      <h2>{PAGE_TITLES[titleKey] || page}</h2>
      <div className="top-bar-right">
        <span style={{ fontSize: 12, color: "var(--text3)" }}>
          {formatThaiDate(getTodayStr())}
        </span>
      </div>
    </div>
  );
}
