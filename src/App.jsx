import { useState, useEffect, useMemo, useCallback } from "react";
import { PROCEDURE_CATEGORIES, ROLES } from "./utils/constants";
import { getEmptyBookingForm, getTodayStr, formatThaiDate, canViewAllBranches, filterByUserBranch } from "./utils/helpers";
import { 
  getAllStaff, getAllBranches, getAllProcedures, getAllPromos, getAllRooms, getAllRoomSchedules, getAllQueues,
  createBranch, updateBranch, deleteBranch as deleteBranchDB,
  createProcedure, updateProcedure, deleteProcedure as deleteProcedureDB,
  createPromo, updatePromo, deletePromo as deletePromoDB,
  createRoom, updateRoom, deleteRoom as deleteRoomDB,
  createRoomSchedule, updateRoomSchedule, deleteRoomSchedule as deleteRoomScheduleDB,
  createStaff, updateStaff, deleteStaff as deleteStaffDB,
  createQueue, updateQueue, deleteQueue as deleteQueueDB,
  getAllCategories, createCategory as createCategoryDB, deleteCategory as deleteCategoryDB,
  fetchTickets, createTicketDB, updateTicketDB, deleteTicketDB
} from "./utils/supabaseService";
import { learnFromCorrection } from "./utils/smartParser";

import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import Toast from "./components/Toast";
import Modal from "./components/Modal";
import LoginScreen from "./components/LoginScreen";
import LoadingScreen from "./components/LoadingScreen";

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

export default function App() {
  // Simple test render
  console.log('App component rendering...');
  
  // ─── Master data from Supabase only ───
  const [branches, setBranches] = useState([]);
  const [procedures, setProcedures] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [promos, setPromos] = useState([]);
  const [roomSchedules, setRoomSchedules] = useState([]);
  const [queues, setQueues] = useState([]);
  const [categories, setCategories] = useState(PROCEDURE_CATEGORIES);
  const [staff, setStaff] = useState([]);
  const [tickets, setTickets] = useState([]);

  // ─── Auth (persist across refresh) ───
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('qlass_user');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  // ─── UI state ───
  const [page, setPage] = useState(() => {
    try { return localStorage.getItem("qlass_page") || "booking"; } catch { return "booking"; }
  });
  const navigateTo = useCallback((p) => {
    try { localStorage.setItem("qlass_page", p); } catch {}
    setPage(p);
  }, []);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [supabaseError, setSupabaseError] = useState(null);

  // ─── Booking form ───
  const [form, setForm] = useState(getEmptyBookingForm);
  const [editingQueueId, setEditingQueueId] = useState(null);

  // ─── Smart parser learning ───
  const [parseHints, setParseHints] = useState({ branchAliases: {}, procedureAliases: {} });
  const [lastParseSnapshot, setLastParseSnapshot] = useState(null);

  // ─── Load data from Supabase on initial mount ───
  useEffect(() => {
    async function loadFromSupabase() {
      try {
        setIsLoading(true);
        const [staffData, branchData, procedureData, promoData, roomData, scheduleData, queueData, categoryData, ticketData] = await Promise.all([
          getAllStaff(),
          getAllBranches(),
          getAllProcedures(),
          getAllPromos(),
          getAllRooms(),
          getAllRoomSchedules(),
          getAllQueues(),
          getAllCategories().catch(() => null),
          fetchTickets().catch(() => null),
        ]);
        
        setStaff(staffData || []);
        setBranches(branchData || []);
        setProcedures(procedureData || []);
        setPromos(promoData || []);
        setRooms(roomData || []);
        setRoomSchedules(scheduleData || []);
        setQueues(queueData || []);
        if (categoryData && categoryData.length > 0) {
          setCategories(categoryData);
        }
        if (ticketData) {
          setTickets(ticketData);
        }
      } catch (error) {
        console.error('Error loading from Supabase:', error);
        setSupabaseError(error.message);
      } finally {
        setIsLoading(false);
      }
    }
    loadFromSupabase();
  }, []);

  // Note: All data is now stored in Supabase only, no localStorage

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
    if (currentUser && allowedPages.length > 0 && !allowedPages.includes(page)) {
      const target = allowedPages[0] || "queue-table";
      try { localStorage.setItem("qlass_page", target); } catch {}
      setPage(target);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, allowedPages]);

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
    localStorage.setItem('qlass_user', JSON.stringify(user));
    const pages = ROLES.find((r) => r.value === user.role)?.pages || [];
    navigateTo(pages[0] || "queue-table");
    showToast("success", `ยินดีต้อนรับ ${user.nickname || user.name} 👋`);
  }

  function handleLogout() {
    setCurrentUser(null);
    localStorage.removeItem('qlass_user');
    setModal(null);
  }

  // ═══════ BOOKING ACTIONS ═══════
  const handleBookingSubmit = useCallback(async () => {
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
      await updateQueue(editingQueueId, form);
      const updatedQueues = await getAllQueues();
      setQueues(updatedQueues || []);
      showToast("success", "แก้ไขคิวเรียบร้อย");
      setEditingQueueId(null);
    } else {
      await createQueue({
        ...form,
        createdAt: getTodayStr(),
        recordedBy: currentUser?.id || null,
      });
      const updatedQueues = await getAllQueues();
      setQueues(updatedQueues || []);
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
    navigateTo("booking");
  }, [navigateTo]);

  const deleteQueue = useCallback(async (id) => {
    await deleteQueueDB(id);
    const updatedQueues = await getAllQueues();
    setQueues(updatedQueues || []);
    showToast("success", "ลบคิวแล้ว");
  }, [showToast]);

  const updateQueueStatus = useCallback(async (id, payload) => {
    await updateQueue(id, { ...payload, statusUpdatedAt: getTodayStr() });
    const updatedQueues = await getAllQueues();
    setQueues(updatedQueues || []);
    setModal(null);
    const st = payload.status;
    const labels = { confirmed:"ยืนยันแล้ว ✅", rescheduled:"เลื่อนนัดแล้ว 📅", no_show:"บันทึก: ไม่มาตามนัด 🚫", cancelled:"ยกเลิกแล้ว ❌", done:"เสร็จสิ้น 🎉", follow1:"บันทึก: โทรตาม ×1", follow2:"บันทึก: โทรตาม ×2", follow3:"บันทึก: โทรตาม ×3 📞" };
    showToast("success", labels[st] || "อัปเดตสถานะแล้ว");
  }, [showToast]);

  // ═══════ CRUD HELPERS ═══════
  const saveBranch = useCallback(async (data) => {
    if (data.id) {
      await updateBranch(data.id, data);
    } else {
      await createBranch(data);
    }
    const updatedBranches = await getAllBranches();
    setBranches(updatedBranches || []);
    setModal(null);
    showToast("success", "บันทึกสาขาเรียบร้อย");
  }, [showToast]);

  const saveProcedure = useCallback(async (data) => {
    if (data.id) {
      await updateProcedure(data.id, data);
    } else {
      await createProcedure(data);
    }
    const updatedProcedures = await getAllProcedures();
    setProcedures(updatedProcedures || []);
    setModal(null);
    showToast("success", "บันทึกหัตถการเรียบร้อย");
  }, [showToast]);

  const savePromo = useCallback(async (data) => {
    if (data.id) {
      await updatePromo(data.id, data);
    } else {
      await createPromo(data);
    }
    const updatedPromos = await getAllPromos();
    setPromos(updatedPromos || []);
    setModal(null);
    showToast("success", "บันทึกโปรเรียบร้อย");
  }, [showToast]);

  const quickAddPromo = useCallback(async (data) => {
    const newPromo = await createPromo(data);
    const updatedPromos = await getAllPromos();
    setPromos(updatedPromos || []);
    showToast("success", `เพิ่มโปร "${newPromo.name}" แล้ว`);
    return newPromo;
  }, [showToast]);

  const saveRoom = useCallback(async (data) => {
    if (data.bulk) {
      // Bulk mode: สร้างห้องหลายสาขาพร้อมกัน
      for (const item of data.items) {
        await createRoom(item);
      }
      const updatedRooms = await getAllRooms();
      setRooms(updatedRooms || []);
      setModal(null);
      showToast("success", `สร้าง ${data.items.length} ห้องเรียบร้อย 🚀`);
    } else if (data.id) {
      await updateRoom(data.id, data);
      const updatedRooms = await getAllRooms();
      setRooms(updatedRooms || []);
      setModal(null);
      showToast("success", "บันทึกห้องเรียบร้อย");
    } else {
      await createRoom(data);
      const updatedRooms = await getAllRooms();
      setRooms(updatedRooms || []);
      setModal(null);
      showToast("success", "บันทึกห้องเรียบร้อย");
    }
  }, [showToast]);

  const saveRoomSchedule = useCallback(async (data) => {
    if (data.id) {
      const { roomIds, dates, ...rest } = data;
      const updated = { ...rest, roomId: roomIds[0], date: dates?.[0] ?? rest.date ?? "" };
      await updateRoomSchedule(data.id, updated);
      showToast("success", "แก้ไขตารางเรียบร้อย");
    } else {
      const { roomIds, dates, ...rest } = data;
      let created = 0;
      for (const roomId of roomIds) {
        for (const date of (dates || [""])) {
          await createRoomSchedule({ ...rest, roomId, date });
          created++;
        }
      }
      showToast("success", `เพิ่มตาราง ${created} รายการเรียบร้อย 🗓️`);
    }
    const updatedSchedules = await getAllRoomSchedules();
    setRoomSchedules(updatedSchedules || []);
    setModal(null);
  }, [showToast]);

  const saveStaff = useCallback(async (data) => {
    if (data.id) {
      await updateStaff(data.id, data);
      // อัปเดต currentUser ถ้าแก้ไขตัวเอง
      if (currentUser?.id === data.id) setCurrentUser(data);
    } else {
      await createStaff(data);
    }
    const updatedStaff = await getAllStaff();
    setStaff(updatedStaff || []);
    setModal(null);
    showToast("success", "บันทึกข้อมูลพนักงานเรียบร้อย");
  }, [showToast, currentUser]);

  // ─── Delete helpers ───
  const deleteBranch = useCallback(async (id) => {
    await deleteBranchDB(id);
    const updatedBranches = await getAllBranches();
    setBranches(updatedBranches || []);
    showToast("success", "ลบสาขาแล้ว");
  }, [showToast]);

  const deleteProcedure = useCallback(async (id) => {
    await deleteProcedureDB(id);
    const updatedProcedures = await getAllProcedures();
    setProcedures(updatedProcedures || []);
    showToast("success", "ลบหัตถการแล้ว");
  }, [showToast]);

  const addCategory = useCallback(async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (categories.includes(trimmed)) return;
    try {
      await createCategoryDB(trimmed);
      const updated = await getAllCategories();
      setCategories(updated || [...categories, trimmed]);
    } catch {
      // Fallback: just add locally
      setCategories((prev) => prev.includes(trimmed) ? prev : [...prev, trimmed]);
    }
  }, [categories]);

  const deleteCategory = useCallback(async (name) => {
    try {
      await deleteCategoryDB(name);
      const updated = await getAllCategories();
      setCategories(updated || categories.filter((c) => c !== name));
    } catch {
      setCategories((prev) => prev.filter((c) => c !== name));
    }
    showToast("success", `ลบหมวด "${name}" แล้ว`);
  }, [showToast, categories]);

  const deletePromo = useCallback(async (id) => {
    await deletePromoDB(id);
    const updatedPromos = await getAllPromos();
    setPromos(updatedPromos || []);
    showToast("success", "ลบโปรแล้ว");
  }, [showToast]);

  const deleteRoom = useCallback(async (id) => {
    await deleteRoomDB(id);
    const updatedRooms = await getAllRooms();
    setRooms(updatedRooms || []);
    showToast("success", "ลบห้องแล้ว");
  }, [showToast]);

  const deleteRoomSchedule = useCallback(async (id) => {
    await deleteRoomScheduleDB(id);
    const updatedSchedules = await getAllRoomSchedules();
    setRoomSchedules(updatedSchedules || []);
    showToast("success", "ลบตารางแล้ว");
  }, [showToast]);

  const deleteStaff = useCallback(async (id) => {
    await deleteStaffDB(id);
    const updatedStaff = await getAllStaff();
    setStaff(updatedStaff || []);
    showToast("success", "ลบพนักงานแล้ว");
  }, [showToast]);

  const toggleStaffActive = useCallback(async (id) => {
    const staffMember = staff.find(s => s.id === id);
    if (staffMember) {
      await updateStaff(id, { ...staffMember, active: !staffMember.active });
      const updatedStaff = await getAllStaff();
      setStaff(updatedStaff || []);
    }
  }, [staff]);

  // ═══════ TICKET ACTIONS ═══════
  const createTicket = useCallback(async (ticketData, images) => {
    try {
      const newTicket = await createTicketDB(ticketData);
      const updated = await fetchTickets();
      setTickets(updated || []);
      showToast("success", "ส่งคำร้องเรียบร้อย");
    } catch (err) {
      console.error("Create ticket error:", err);
      showToast("error", "ไม่สามารถสร้างคำร้องได้");
    }
  }, [showToast]);

  const updateTicket = useCallback(async (id, updates) => {
    try {
      await updateTicketDB(id, updates);
      const updated = await fetchTickets();
      setTickets(updated || []);
      showToast("success", "อัปเดตสถานะแล้ว");
    } catch (err) {
      console.error("Update ticket error:", err);
      showToast("error", "ไม่สามารถอัปเดตได้");
    }
  }, [showToast]);

  const deleteTicket = useCallback(async (id) => {
    try {
      await deleteTicketDB(id);
      const updated = await fetchTickets();
      setTickets(updated || []);
      showToast("success", "ลบคำร้องแล้ว");
    } catch (err) {
      console.error("Delete ticket error:", err);
      showToast("error", "ไม่สามารถลบได้");
    }
  }, [showToast]);

  // ═══════ RENDER ═══════

  // ยังโหลดข้อมูลอยู่ (และยังไม่มี currentUser จาก localStorage) → แสดง loading แทน
  if (isLoading && !currentUser) {
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 16, color: "#fff",
      }}>
        <div style={{ fontSize: 40 }}>⏳</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>กำลังโหลดข้อมูล...</div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen staff={staff} onLogin={handleLogin} supabaseError={supabaseError} />;
  }

  return (
    <div className="app">
      <Sidebar
        currentPage={page}
        onNavigate={navigateTo}
        branchCount={filteredBranches.length}
        queueCount={filteredQueues.length}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      <div className="main">
        <div className="main-shell">
          <TopBar page={page} isEditing={!!editingQueueId} supabaseError={supabaseError} />

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
                onBulkBooking={async (allFields) => {
                  let created = 0;
                  for (const fields of allFields) {
                    if (!fields.name && !fields.phone) continue;
                    try {
                      await createQueue({
                        name: fields.name || "",
                        phone: fields.phone || "",
                        branchId: fields.branchId || "",
                        roomId: fields.roomId || "",
                        procedureId: fields.procedureId || "",
                        promoId: fields.promoId || "",
                        price: fields.price || "",
                        note: fields.note || "",
                        customerType: fields.customerType || "new",
                        date: fields.date || getTodayStr(),
                        timeBlock: fields.timeBlock ?? null,
                        status: "waiting",
                        statusNote: "",
                        createdAt: getTodayStr(),
                        recordedBy: currentUser?.id || null,
                      });
                      created++;
                    } catch (err) {
                      console.error("Bulk booking error:", err);
                    }
                  }
                  if (created > 0) {
                    const updatedQueues = await getAllQueues();
                    setQueues(updatedQueues || []);
                    showToast("success", `🚀 สร้าง ${created} คิวเรียบร้อย!`);
                  }
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
                onBulkAdd={() => setModal({ type: "room", data: null, bulkMode: true })}
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
                roomSchedules={roomSchedules}
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
            <RoomModal data={modal.data} branches={filteredBranches} rooms={filteredRooms} defaultBranchId={modal.defaultBranchId} bulkMode={modal.bulkMode} onSave={saveRoom} onClose={() => setModal(null)} />
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
