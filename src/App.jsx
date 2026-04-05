import { useState, useMemo, useEffect, useCallback } from "react";
import {
  initBranches, initProcedures, initRooms, initPromos, initRoomSchedules, initStaff,
  PROCEDURE_CATEGORIES, ROLES,
} from "./utils/constants";
import { genId, getTodayStr, getEmptyBookingForm, blockToTime, filterByUserBranch, canViewAllBranches } from "./utils/helpers";
import { learnFromCorrection } from "./utils/smartParser";

import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import Toast from "./components/Toast";
import Modal from "./components/Modal";
import LoginScreen from "./components/LoginScreen";

import BranchModal from "./components/modals/BranchModal";
import ProcedureModal from "./components/modals/ProcedureModal";
import PromoModal from "./components/modals/PromoModal";
import RoomModal from "./components/modals/RoomModal";
import ScheduleModal from "./components/modals/ScheduleModal";
import StatusModal from "./components/modals/StatusModal";
import StaffModal from "./components/modals/StaffModal";

import BookingPage from "./pages/BookingPage";
import QueueTablePage from "./pages/QueueTablePage";
import BranchesPage from "./pages/BranchesPage";
import ProceduresPage from "./pages/ProceduresPage";
import PromosPage from "./pages/PromosPage";
import RoomsPage from "./pages/RoomsPage";
import RoomSchedulePage from "./pages/RoomSchedulePage";
import SummaryPage from "./pages/SummaryPage";
import StaffPage from "./pages/StaffPage";
import CommissionPage from "./pages/CommissionPage";
import ExportPage from "./pages/ExportPage";
import TicketPage from "./pages/TicketPage";

// ─── Helper: Load from localStorage with fallback ───
function loadFromStorage(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch (e) {
    console.error(`Error loading ${key} from localStorage:`, e);
    return fallback;
  }
}

export default function App() {
  // ─── Master data with localStorage persistence ───
  const [branches, setBranches] = useState(() => loadFromStorage('qlass_branches', initBranches));
  const [procedures, setProcedures] = useState(() => loadFromStorage('qlass_procedures', initProcedures));
  const [rooms, setRooms] = useState(() => loadFromStorage('qlass_rooms', initRooms));
  const [promos, setPromos] = useState(() => loadFromStorage('qlass_promos', initPromos));
  const [roomSchedules, setRoomSchedules] = useState(() => loadFromStorage('qlass_roomSchedules', initRoomSchedules));
  const [queues, setQueues] = useState(() => loadFromStorage('qlass_queues', []));
  const [categories, setCategories] = useState(() => loadFromStorage('qlass_categories', PROCEDURE_CATEGORIES));
  const [staff, setStaff] = useState(() => loadFromStorage('qlass_staff', initStaff));
  const [tickets, setTickets] = useState(() => loadFromStorage('qlass_tickets', []));

  // ─── Auth ───
  const [currentUser, setCurrentUser] = useState(null);

  // ─── UI state ───
  const [page, setPage] = useState("booking");
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);

  // ─── Booking form ───
  const [form, setForm] = useState(getEmptyBookingForm);
  const [editingQueueId, setEditingQueueId] = useState(null);

  // ─── Smart parser learning ───
  const [parseHints, setParseHints] = useState({ branchAliases: {}, procedureAliases: {} });
  const [lastParseSnapshot, setLastParseSnapshot] = useState(null);

  // ─── Persist data to localStorage whenever it changes ───
  useEffect(() => {
    localStorage.setItem('qlass_branches', JSON.stringify(branches));
  }, [branches]);

  useEffect(() => {
    localStorage.setItem('qlass_procedures', JSON.stringify(procedures));
  }, [procedures]);

  useEffect(() => {
    localStorage.setItem('qlass_rooms', JSON.stringify(rooms));
  }, [rooms]);

  useEffect(() => {
    localStorage.setItem('qlass_promos', JSON.stringify(promos));
  }, [promos]);

  useEffect(() => {
    localStorage.setItem('qlass_roomSchedules', JSON.stringify(roomSchedules));
  }, [roomSchedules]);

  useEffect(() => {
    localStorage.setItem('qlass_queues', JSON.stringify(queues));
  }, [queues]);

  useEffect(() => {
    localStorage.setItem('qlass_categories', JSON.stringify(categories));
  }, [categories]);

  useEffect(() => {
    localStorage.setItem('qlass_staff', JSON.stringify(staff));
  }, [staff]);

  useEffect(() => {
    localStorage.setItem('qlass_tickets', JSON.stringify(tickets));
  }, [tickets]);

  // ─── Computed: allowed pages for currentUser ───
  const allowedPages = useMemo(() => {
    if (!currentUser) return [];
    return ROLES.find((r) => r.value === currentUser.role)?.pages || [];
  }, [currentUser]);

  // ─── Computed: filtered data by branch ───
  const filteredQueues = useMemo(() => {
    return filterByUserBranch(queues, currentUser, "branchId");
  }, [queues, currentUser]);

  const filteredRooms = useMemo(() => {
    return filterByUserBranch(rooms, currentUser, "branchId");
  }, [rooms, currentUser]);

  const filteredBranches = useMemo(() => {
    if (!currentUser) return [];
    if (canViewAllBranches(currentUser)) return branches;
    return branches.filter(b => b.id === currentUser.branchId);
  }, [branches, currentUser]);

  // ─── Redirect if current page not allowed ───
  useEffect(() => {
    if (currentUser && !allowedPages.includes(page)) {
      setPage(allowedPages[0] || "queue-table");
    }
  }, [currentUser, allowedPages, page]);

  // ─── Toast auto-dismiss ───
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 2500);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const showToast = useCallback((type, msg) => setToast({ type, msg }), []);

  // ─── Today stats ───
  const todayStats = useMemo(() => {
    const today = filteredQueues.filter((q) => q.date === getTodayStr());
    return {
      total: today.length,
      new: today.filter((q) => q.customerType === "new").length,
      old: today.filter((q) => q.customerType === "old").length,
      course: today.filter((q) => q.customerType === "course").length,
    };
  }, [filteredQueues]);

  // ─── Login / Logout ───
  function handleLogin(user) {
    setCurrentUser(user);
    const pages = ROLES.find((r) => r.value === user.role)?.pages || [];
    setPage(pages[0] || "queue-table");
    showToast("success", `ยินดีต้อนรับ ${user.nickname || user.name} 👋`);
  }

  function handleLogout() {
    setCurrentUser(null);
    setModal(null);
  }

  // ═══════ BOOKING ACTIONS ═══════
  const handleBookingSubmit = useCallback(() => {
    if (!form.name.trim() || !form.phone.trim()) {
      showToast("error", "กรุณากรอกชื่อและเบอร์โทร");
      return;
    }
    if (!form.branchId) {
      showToast("error", "กรุณาเลือกสาขา");
      return;
    }

    // ─── ตรวจสอบเวลาชนกัน ───
    if (form.timeBlock !== null && form.roomId && form.procedureId) {
      const proc = procedures.find((p) => p.id === form.procedureId);
      const dur = proc?.blocks || 0;
      const startA = form.timeBlock;
      const endA = startA + dur;

      const conflict = queues.find((q) => {
        if (q.id === editingQueueId) return false;
        if (q.roomId !== form.roomId) return false;
        if (q.date !== form.date) return false;
        if (q.timeBlock === null) return false;
        const qProc = procedures.find((p) => p.id === q.procedureId);
        const qDur = qProc?.blocks || 1;
        const startB = q.timeBlock;
        const endB = startB + qDur;
        return startA < endB && startB < endA;
      });

      if (conflict) {
        showToast("error", `เวลาชนกับคิวของ ${conflict.name} (${blockToTime(conflict.timeBlock)}–${blockToTime(conflict.timeBlock + (procedures.find(p => p.id === conflict.procedureId)?.blocks || 0))})`);
        return;
      }
    }

    if (editingQueueId) {
      setQueues((prev) => prev.map((q) => (q.id === editingQueueId ? { ...form, id: editingQueueId } : q)));
      showToast("success", "แก้ไขคิวเรียบร้อย");
      setEditingQueueId(null);
    } else {
      setQueues((prev) => [...prev, {
        ...form,
        id: genId("Q"),
        createdAt: getTodayStr(),
        recordedBy: currentUser?.id || null,
      }]);
      showToast("success", "บันทึกคิวเรียบร้อย ✓");
    }

    if (lastParseSnapshot) {
      const updated = learnFromCorrection(
        parseHints, lastParseSnapshot.rawText,
        lastParseSnapshot.fields, form,
        { branches, procedures, promos, rooms }
      );
      setParseHints(updated);
      setLastParseSnapshot(null);
    }
    setForm(getEmptyBookingForm());
  }, [form, editingQueueId, showToast, queues, procedures, parseHints, lastParseSnapshot, branches, promos, rooms, currentUser]);

  const editQueue = useCallback((q) => {
    setForm({ ...q });
    setEditingQueueId(q.id);
    setPage("booking");
  }, []);

  const deleteQueue = useCallback((id) => {
    setQueues((prev) => prev.filter((q) => q.id !== id));
    showToast("success", "ลบคิวแล้ว");
  }, [showToast]);

  const updateQueueStatus = useCallback((id, payload) => {
    setQueues((prev) => prev.map((q) =>
      q.id === id ? { ...q, ...payload, statusUpdatedAt: getTodayStr() } : q
    ));
    setModal(null);
    const st = payload.status;
    const labels = { confirmed:"ยืนยันแล้ว ✅", rescheduled:"เลื่อนนัดแล้ว 📅", no_show:"บันทึก: ไม่มาตามนัด 🚫", cancelled:"ยกเลิกแล้ว ❌", done:"เสร็จสิ้น 🎉", follow1:"บันทึก: โทรตาม ×1", follow2:"บันทึก: โทรตาม ×2", follow3:"บันทึก: โทรตาม ×3 📞" };
    showToast("success", labels[st] || "อัปเดตสถานะแล้ว");
  }, [showToast]);

  // ═══════ CRUD HELPERS ═══════
  const saveBranch = useCallback((data) => {
    if (data.id) {
      setBranches((prev) => prev.map((b) => (b.id === data.id ? data : b)));
    } else {
      setBranches((prev) => [...prev, { ...data, id: genId("b") }]);
    }
    setModal(null);
    showToast("success", "บันทึกสาขาเรียบร้อย");
  }, [showToast]);

  const saveProcedure = useCallback((data) => {
    if (data.id) {
      setProcedures((prev) => prev.map((p) => (p.id === data.id ? data : p)));
    } else {
      setProcedures((prev) => [...prev, { ...data, id: genId("p") }]);
    }
    setModal(null);
    showToast("success", "บันทึกหัตถการเรียบร้อย");
  }, [showToast]);

  const savePromo = useCallback((data) => {
    if (data.id) {
      setPromos((prev) => prev.map((p) => (p.id === data.id ? data : p)));
    } else {
      setPromos((prev) => [...prev, { ...data, id: genId("pr") }]);
    }
    setModal(null);
    showToast("success", "บันทึกโปรเรียบร้อย");
  }, [showToast]);

  const quickAddPromo = useCallback((data) => {
    const newPromo = { ...data, id: genId("pr") };
    setPromos((prev) => [...prev, newPromo]);
    showToast("success", `เพิ่มโปร "${newPromo.name}" แล้ว`);
    return newPromo;
  }, [showToast]);

  const saveRoom = useCallback((data) => {
    if (data.id) {
      setRooms((prev) => prev.map((r) => (r.id === data.id ? data : r)));
    } else {
      setRooms((prev) => [...prev, { ...data, id: genId("r") }]);
    }
    setModal(null);
    showToast("success", "บันทึกห้องเรียบร้อย");
  }, [showToast]);

  const saveRoomSchedule = useCallback((data) => {
    if (data.id) {
      const { roomIds, ...rest } = data;
      const updated = { ...rest, roomId: roomIds[0] };
      setRoomSchedules((prev) => prev.map((s) => (s.id === data.id ? updated : s)));
      showToast("success", "แก้ไขตารางเรียบร้อย");
    } else {
      const { roomIds, ...rest } = data;
      const newSchedules = roomIds.map((roomId) => ({ ...rest, roomId, id: genId("rs") }));
      setRoomSchedules((prev) => [...prev, ...newSchedules]);
      showToast("success", `เพิ่มตาราง ${roomIds.length} ห้องเรียบร้อย`);
    }
    setModal(null);
  }, [showToast]);

  const saveStaff = useCallback((data) => {
    if (data.id) {
      setStaff((prev) => prev.map((s) => (s.id === data.id ? data : s)));
      // อัปเดต currentUser ถ้าแก้ไขตัวเอง
      if (currentUser?.id === data.id) setCurrentUser(data);
    } else {
      setStaff((prev) => [...prev, { ...data, id: genId("s") }]);
    }
    setModal(null);
    showToast("success", "บันทึกข้อมูลพนักงานเรียบร้อย");
  }, [showToast, currentUser]);

  // ─── Delete helpers ───
  const deleteBranch = useCallback((id) => {
    setBranches((prev) => prev.filter((x) => x.id !== id));
    showToast("success", "ลบสาขาแล้ว");
  }, [showToast]);

  const deleteProcedure = useCallback((id) => {
    setProcedures((prev) => prev.filter((x) => x.id !== id));
    showToast("success", "ลบหัตถการแล้ว");
  }, [showToast]);

  const addCategory = useCallback((name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCategories((prev) => prev.includes(trimmed) ? prev : [...prev, trimmed]);
  }, []);

  const deleteCategory = useCallback((name) => {
    setCategories((prev) => prev.filter((c) => c !== name));
    setProcedures((prev) => prev.map((p) => p.category === name ? { ...p, category: "" } : p));
    showToast("success", `ลบหมวด "${name}" แล้ว`);
  }, [showToast]);

  const deletePromo = useCallback((id) => {
    setPromos((prev) => prev.filter((x) => x.id !== id));
    showToast("success", "ลบโปรแล้ว");
  }, [showToast]);

  const deleteRoom = useCallback((id) => {
    setRooms((prev) => prev.filter((x) => x.id !== id));
    showToast("success", "ลบห้องแล้ว");
  }, [showToast]);

  const deleteRoomSchedule = useCallback((id) => {
    setRoomSchedules((prev) => prev.filter((x) => x.id !== id));
    showToast("success", "ลบตารางแล้ว");
  }, [showToast]);

  const deleteStaff = useCallback((id) => {
    setStaff((prev) => prev.filter((x) => x.id !== id));
    showToast("success", "ลบพนักงานแล้ว");
  }, [showToast]);

  const toggleStaffActive = useCallback((id) => {
    setStaff((prev) => prev.map((s) => s.id === id ? { ...s, active: !s.active } : s));
  }, []);

  // ═══════ TICKET ACTIONS ═══════
  const createTicket = useCallback(async (ticketData, images) => {
    const newTicket = {
      ...ticketData,
      id: genId("T"),
      imageUrls: [],
      status: "open",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setTickets((prev) => [newTicket, ...prev]);
    showToast("success", "ส่งคำร้องเรียบร้อย");
  }, [showToast]);

  const updateTicket = useCallback((id, updates) => {
    setTickets((prev) => prev.map((t) => 
      t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
    ));
    showToast("success", "อัปเดตสถานะแล้ว");
  }, [showToast]);

  const deleteTicket = useCallback((id) => {
    setTickets((prev) => prev.filter((t) => t.id !== id));
    showToast("success", "ลบคำร้องแล้ว");
  }, [showToast]);

  // ═══════ RENDER ═══════

  // Show login screen if not logged in
  if (!currentUser) {
    return <LoginScreen staff={staff} onLogin={handleLogin} />;
  }

  return (
    <div className="app">
      <Sidebar
        currentPage={page}
        onNavigate={setPage}
        branchCount={filteredBranches.length}
        queueCount={filteredQueues.length}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      <div className="main">
        <TopBar page={page} isEditing={!!editingQueueId} />

        <div className="content">
          {page === "booking" && (
            <BookingPage
              form={form}
              setForm={setForm}
              editingQueueId={editingQueueId}
              setEditingQueueId={setEditingQueueId}
              branches={filteredBranches}
              rooms={filteredRooms}
              procedures={procedures}
              promos={promos}
              roomSchedules={roomSchedules}
              queues={filteredQueues}
              onSubmit={handleBookingSubmit}
              onQuickAddPromo={quickAddPromo}
              parseHints={parseHints || { branchAliases: {}, procedureAliases: {}, promoAliases: {}, roomAliases: {}, procedureToRoom: {} }}
              onSmartApply={(fields, rawText) => {
                setForm((f) => ({ ...f, ...Object.fromEntries(Object.entries(fields).filter(([,v]) => v !== undefined && v !== null && v !== "")) }));
                setLastParseSnapshot({ rawText, fields });
              }}
              todayStats={todayStats}
              currentUser={currentUser}
            />
          )}

          {page === "queue-table" && (
            <QueueTablePage
              queues={filteredQueues}
              branches={filteredBranches}
              rooms={filteredRooms}
              procedures={procedures}
              promos={promos}
              staff={staff}
              onEdit={editQueue}
              onDelete={deleteQueue}
              onUpdateStatus={(q) => setModal({ type: "status", data: q })}
            />
          )}

          {page === "branches" && (
            <BranchesPage
              branches={branches}
              rooms={rooms}
              onAdd={() => setModal({ type: "branch", data: null })}
              onEdit={(b) => setModal({ type: "branch", data: b })}
              onDelete={deleteBranch}
            />
          )}

          {page === "procedures" && (
            <ProceduresPage
              procedures={procedures}
              categories={categories}
              onAdd={() => setModal({ type: "procedure", data: null })}
              onEdit={(p) => setModal({ type: "procedure", data: p })}
              onDelete={deleteProcedure}
              onAddCategory={addCategory}
              onDeleteCategory={deleteCategory}
            />
          )}

          {page === "promos" && (
            <PromosPage
              promos={promos}
              procedures={procedures}
              onAdd={() => setModal({ type: "promo", data: null })}
              onEdit={(p) => setModal({ type: "promo", data: p })}
              onDelete={deletePromo}
            />
          )}

          {page === "rooms" && (
            <RoomsPage
              branches={filteredBranches}
              rooms={filteredRooms}
              onAdd={(branchId) => setModal({ type: "room", data: null, defaultBranchId: branchId })}
              onEdit={(r) => setModal({ type: "room", data: r })}
              onDelete={deleteRoom}
            />
          )}

          {page === "summary" && (
            <SummaryPage
              queues={filteredQueues}
              branches={filteredBranches}
              rooms={filteredRooms}
              procedures={procedures}
              promos={promos}
            />
          )}

          {page === "room-schedule" && (
            <RoomSchedulePage
              roomSchedules={roomSchedules}
              rooms={filteredRooms}
              branches={filteredBranches}
              onAdd={() => setModal({ type: "schedule", data: null })}
              onEdit={(s) => setModal({ type: "schedule", data: s })}
              onDelete={deleteRoomSchedule}
            />
          )}

          {page === "staff" && (
            <StaffPage
              staff={staff}
              branches={branches}
              onAdd={() => setModal({ type: "staff", data: null })}
              onEdit={(s) => setModal({ type: "staff", data: s })}
              onToggleActive={toggleStaffActive}
              onDelete={deleteStaff}
            />
          )}

          {page === "commission" && (
            <CommissionPage
              queues={filteredQueues}
              staff={staff}
              branches={filteredBranches}
              procedures={procedures}
              promos={promos}
            />
          )}

          {page === "export" && (
            <ExportPage
              queues={filteredQueues}
              branches={filteredBranches}
              rooms={filteredRooms}
              procedures={procedures}
              promos={promos}
              staff={staff}
            />
          )}

          {page === "tickets" && (
            <TicketPage
              tickets={tickets}
              branches={filteredBranches}
              staff={staff}
              currentUser={currentUser}
              onCreateTicket={createTicket}
              onUpdateTicket={updateTicket}
              onDeleteTicket={deleteTicket}
            />
          )}
        </div>
      </div>

      {/* ═══════ MODALS ═══════ */}
      {modal && (
        <Modal onClose={() => setModal(null)}>
          {modal.type === "branch" && (
            <BranchModal data={modal.data} onSave={saveBranch} onClose={() => setModal(null)} />
          )}
          {modal.type === "procedure" && (
            <ProcedureModal data={modal.data} categories={categories} onSave={saveProcedure} onClose={() => setModal(null)} />
          )}
          {modal.type === "promo" && (
            <PromoModal data={modal.data} procedures={procedures} onSave={savePromo} onClose={() => setModal(null)} />
          )}
          {modal.type === "room" && (
            <RoomModal data={modal.data} branches={filteredBranches} rooms={filteredRooms} defaultBranchId={modal.defaultBranchId} onSave={saveRoom} onClose={() => setModal(null)} />
          )}
          {modal.type === "schedule" && (
            <ScheduleModal data={modal.data} rooms={filteredRooms} branches={filteredBranches} onSave={saveRoomSchedule} onClose={() => setModal(null)} />
          )}
          {modal.type === "status" && (
            <StatusModal data={modal.data} queue={modal.data} procedures={procedures} onSave={updateQueueStatus} onClose={() => setModal(null)} />
          )}
          {modal.type === "staff" && (
            <StaffModal data={modal.data} branches={branches} onSave={saveStaff} onClose={() => setModal(null)} />
          )}
        </Modal>
      )}

      <Toast toast={toast} />
    </div>
  );
}
