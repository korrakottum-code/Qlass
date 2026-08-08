import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { PROCEDURE_CATEGORIES, ROLES } from "./utils/constants";
import { getEmptyBookingForm, getTodayStr, formatThaiDate, canViewAllBranches, filterByUserBranch, blockToTime, isRoomRangeClosed } from "./utils/helpers";
import {
  getAllStaff, getAllBranches, getAllProcedures, getAllPromos, getAllRooms, getAllRoomSchedules, getAllQueues,
  createBranch, updateBranch, deleteBranch as deleteBranchDB,
  createProcedure, updateProcedure, deleteProcedure as deleteProcedureDB,
  createPromo, updatePromo, deletePromo as deletePromoDB,
  createRoom, updateRoom, deleteRoom as deleteRoomDB,
  createRoomSchedule, updateRoomSchedule, deleteRoomSchedule as deleteRoomScheduleDB,
  createStaff, updateStaff, deleteStaff as deleteStaffDB,
  createQueue, updateQueue, updateQueueStatus as updateQueueStatusDB, deleteQueue as deleteQueueDB,
  getAllCategories, createCategory as createCategoryDB, deleteCategory as deleteCategoryDB,
  fetchTickets, createTicketDB, updateTicketDB, deleteTicketDB,
  createActivityLog, fetchActivityLogs,
  mapQueueRow, fetchQueuesForRoomDate
} from "./utils/supabaseService";
import { supabase } from "./utils/supabaseClient";
import { learnFromCorrection } from "./utils/smartParser";
import { checkFreshRoomBookingConflict } from "./utils/bookingConflict";
import { shouldUseServerQueueCreate, createQueueOnServer } from "./utils/serverQueueCreate";
import { extractQueueCreateErrorCode, queueCreateErrorMessage } from "./utils/queueCreateGate";
import { fetchAuthenticatedStaff, fetchLoginDirectory, getReleaseStatus, getServerSessionToken, loginWithPin, restoreServerSession, revokeServerSession, useServerSession, flushClientDiagnostics } from "./utils/sessionAuth";
import { recordClientDiagnostic } from "./utils/clientDiagnostics";
import { controlledRefreshEnabled, getControlledRefreshStatus, serverDiagnosticsEnabled, flushClientDiagnostics as flushDiagnostics } from "./utils/clientObservability";
import { reconcileRealtimeQueue } from "./utils/realtimeQueueState";
import { buildRescheduledQueue } from "./utils/rescheduleQueue";

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
import WaitingQueuePage from "./pages/WaitingQueuePage";
import BranchesPage from "./pages/BranchesPage";
import ProceduresPage from "./pages/ProceduresPage";
import PromosPage from "./pages/PromosPage";
import RoomsPage from "./pages/RoomsPage";
import RoomSchedulePage from "./pages/RoomSchedulePage";
import SummaryPage from "./pages/SummaryPage";
import TimelinePage from "./pages/TimelinePage";
import StaffPage from "./pages/StaffPage";
import CommissionPage from "./pages/CommissionPage";
import ExportPage from "./pages/ExportPage";
import TicketPage from "./pages/TicketPage";
import ActivityLogPage from "./pages/ActivityLogPage";
import CeoDashboardPage from "./pages/CeoDashboardPage";

export default function App() {

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
    if (useServerSession) return null;
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
    try { localStorage.setItem("qlass_page", p); } catch { }
    setPage(p);
  }, []);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDataReady, setIsDataReady] = useState(false);
  const [supabaseError, setSupabaseError] = useState(null);
  const [refreshRequired, setRefreshRequired] = useState(false);

  // ─── Booking form ───
  const [form, setForm] = useState(getEmptyBookingForm);
  const [editingQueueId, setEditingQueueId] = useState(null);

  // ─── Smart parser learning ───
  const [parseHints, setParseHints] = useState({ branchAliases: {}, procedureAliases: {} });
  const [lastParseSnapshot, setLastParseSnapshot] = useState(null);

  // ─── Load data from Supabase on initial mount ───
  useEffect(() => {
    async function loadFromSupabase() {
      // Phase 1: Load staff only (fast, small table) — unblocks login screen
      const staffLoadStartedAt = performance.now();
      try {
        setIsLoading(true);
        let staffData;
        if (useServerSession) {
          const token = localStorage.getItem("qlass_session");
          if (token) {
            try {
              const { user } = await restoreServerSession(token);
              staffData = await fetchAuthenticatedStaff(token);
              setCurrentUser(user);
            } catch {
              localStorage.removeItem("qlass_session");
              localStorage.removeItem("qlass_user");
              setCurrentUser(null);
              staffData = await fetchLoginDirectory();
            }
          } else {
            staffData = await fetchLoginDirectory();
          }
        } else {
          staffData = await getAllStaff();
        }
        setStaff(staffData || []);
        recordClientDiagnostic("initial_load", { stage: "staff", outcome: "succeeded", durationMs: performance.now() - staffLoadStartedAt });
      } catch (error) {
        console.error('Error loading staff from Supabase:', error);
        setSupabaseError(error.message);
        recordClientDiagnostic("initial_load", { stage: "staff", outcome: "failed", durationMs: performance.now() - staffLoadStartedAt, error });
      } finally {
        setIsLoading(false);
      }

      // Phase 2a: Load core data + RECENT queues (~30 days) — light & fast, makes app usable quickly
      const coreLoadStartedAt = performance.now();
      try {
        const since = new Date();
        since.setDate(since.getDate() - 30);
        const sinceDate = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-${String(since.getDate()).padStart(2, "0")}`;

        const [branchData, procedureData, promoData, roomData, scheduleData, recentQueues, categoryData, ticketData] = await Promise.all([
          getAllBranches(),
          getAllProcedures(),
          getAllPromos(),
          getAllRooms(),
          getAllRoomSchedules(),
          getAllQueues({ sinceDate }),
          getAllCategories().catch(() => null),
          fetchTickets().catch(() => null),
        ]);
        setBranches(branchData || []);
        setProcedures(procedureData || []);
        setPromos(promoData || []);
        setRooms(roomData || []);
        setRoomSchedules(scheduleData || []);
        setQueues(recentQueues || []);
        if (categoryData && categoryData.length > 0) {
          setCategories(categoryData);
        }
        if (ticketData) {
          setTickets(ticketData);
        }
        setIsDataReady(true);
        recordClientDiagnostic("initial_load", { stage: "core", outcome: "succeeded", durationMs: performance.now() - coreLoadStartedAt });
      } catch (error) {
        console.error('Error loading core data from Supabase:', error);
        setIsDataReady(true);
        recordClientDiagnostic("initial_load", { stage: "core", outcome: "failed", durationMs: performance.now() - coreLoadStartedAt, error });
      }

      // Phase 2b: Load FULL queue history in background, merge in (Export/Commission need old data)
      const historyLoadStartedAt = performance.now();
      try {
        const allQueues = await getAllQueues();
        setQueues((prev) => {
          const byId = new Map(allQueues.map((q) => [q.id, q]));
          // keep any realtime updates that arrived for recent queues
          for (const q of prev) byId.set(q.id, q);
          return Array.from(byId.values());
        });
        recordClientDiagnostic("initial_load", { stage: "history", outcome: "succeeded", durationMs: performance.now() - historyLoadStartedAt });
      } catch (error) {
        console.error('Error loading full queue history from Supabase:', error);
        recordClientDiagnostic("initial_load", { stage: "history", outcome: "failed", durationMs: performance.now() - historyLoadStartedAt, error });
      }
    }
    loadFromSupabase();
  }, []);

  // Goal 11D stays inert unless both browser build flags are explicitly enabled.
  // The server independently keeps both capabilities disabled by default.
  useEffect(() => {
    if (!useServerSession || !currentUser?.id || (!serverDiagnosticsEnabled && !controlledRefreshEnabled)) return undefined;
    let disposed = false;
    const checkOperationalStatus = async () => {
      const token = getServerSessionToken();
      if (!token) return;
      if (serverDiagnosticsEnabled) {
        try {
          await flushDiagnostics({ flushClientDiagnostics }, token);
        } catch {
          // Local diagnostics stay buffered and retry later. Never interrupt work.
        }
      }
      if (controlledRefreshEnabled) {
        try {
          const status = await getControlledRefreshStatus({ getReleaseStatus }, token);
          if (!disposed) setRefreshRequired(status.refreshRequired === true);
        } catch {
          // A failed check must not force users to refresh or log out.
        }
      }
    };
    checkOperationalStatus();
    const interval = window.setInterval(checkOperationalStatus, 5 * 60 * 1000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [currentUser?.id]);

  // ─── Realtime subscription for queues ───
  useEffect(() => {
    const channel = supabase
      .channel("queues-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "queues" }, (payload) => {
        try {
          const newQueue = mapQueueRow(payload.new);
          setQueues((prev) => reconcileRealtimeQueue(prev, "INSERT", newQueue));
        } catch (e) { console.error("realtime INSERT error", e); }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "queues" }, (payload) => {
        try {
          const updated = mapQueueRow(payload.new);
          setQueues((prev) => reconcileRealtimeQueue(prev, "UPDATE", updated));
        } catch (e) { console.error("realtime UPDATE error", e); }
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "queues" }, (payload) => {
        try {
          setQueues((prev) => reconcileRealtimeQueue(prev, "DELETE", payload.old));
        } catch (e) { console.error("realtime DELETE error", e); }
      })
      .subscribe((status) => {
        console.log("[Realtime] status:", status);
        recordClientDiagnostic("realtime_status", { status });
        if (status === "CHANNEL_ERROR") {
          console.warn("Realtime channel error — falling back to manual fetch");
        }
      });

    return () => { supabase.removeChannel(channel); };
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

  const filteredRoomSchedules = useMemo(() => {
    const allowedRoomIds = new Set(filteredRooms.map((r) => r.id));
    return roomSchedules.filter((s) => allowedRoomIds.has(s.roomId));
  }, [roomSchedules, filteredRooms]);

  const filteredBranches = useMemo(() => {
    if (!currentUser) return [];
    if (canViewAllBranches(currentUser)) return branches;
    return branches.filter(b => b.id === currentUser.branchId);
  }, [branches, currentUser]);

  // ─── Hash-based navigation ───
  useEffect(() => {
    function handleHash() {
      const hash = window.location.hash.replace("#", "");
      if (hash && currentUser) {
        const allowed = ROLES.find((r) => r.value === currentUser.role)?.pages || [];
        if (allowed.includes(hash)) {
          navigateTo(hash);
        }
      }
    }
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, [currentUser, navigateTo]);

  // ─── Redirect if current page not allowed ───
  useEffect(() => {
    if (!currentUser) return;
    if (allowedPages.length > 0 && !allowedPages.includes(page)) {
      const target = allowedPages[0] || "queue-table";
      try { localStorage.setItem("qlass_page", target); } catch { }
      setPage(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  async function handleLogin(user, pin) {
    const authenticated = useServerSession ? await loginWithPin(user.id, pin) : { user };
    const verifiedUser = authenticated.user;
    // เก็บเฉพาะข้อมูลที่จำเป็น ไม่เก็บ PIN
    const safeUser = {
      id: verifiedUser.id,
      name: verifiedUser.name,
      nickname: verifiedUser.nickname,
      phone: verifiedUser.phone || "",
      branchId: verifiedUser.branchId,
      role: verifiedUser.role,
      active: verifiedUser.active,
      commissionRates: verifiedUser.commissionRates,
    };
    if (useServerSession) {
      const token = authenticated.session.token;
      try {
        const authenticatedStaff = await fetchAuthenticatedStaff(token);
        setStaff(authenticatedStaff);
        localStorage.setItem("qlass_session", token);
      } catch (error) {
        revokeServerSession(token);
        throw error;
      }
    }
    setCurrentUser(safeUser);
    localStorage.setItem('qlass_user', JSON.stringify(safeUser));
    const pages = ROLES.find((r) => r.value === verifiedUser.role)?.pages || [];
    navigateTo(pages[0] || "queue-table");
    showToast("success", `ยินดีต้อนรับ ${verifiedUser.nickname || verifiedUser.name} 👋`);
  }

  function handleLogout() {
    if (useServerSession) revokeServerSession(localStorage.getItem("qlass_session"));
    setCurrentUser(null);
    localStorage.removeItem('qlass_user');
    localStorage.removeItem("qlass_session");
    setModal(null);
    if (useServerSession) {
      setStaff((currentStaff) => currentStaff
        .filter((member) => member.active)
        .map(({ id, name, nickname, branchId, role, active }) => ({ id, name, nickname, branchId, role, active })));
      fetchLoginDirectory().then(setStaff).catch((error) => {
        console.error("Error restoring login directory:", error);
      });
    }
  }

  // ═══════ BOOKING ACTIONS ═══════
  // Goal 13: one request ID per logical booking attempt. Kept across transport
  // retries so create_queue_v1 stays idempotent; cleared on success or after a
  // server business rejection (nothing was written — the next attempt is new).
  const serverQueueRequestIdRef = useRef(null);

  const handleBookingSubmit = useCallback(async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      showToast("error", "กรุณากรอกชื่อและเบอร์โทร");
      return;
    }
    if (!form.branchId) {
      showToast("error", "กรุณาเลือกสาขา");
      return;
    }

    // ─── ตรวจสอบวันย้อนหลัง ───
    if (!editingQueueId && form.date < getTodayStr()) {
      showToast("error", "❌ ไม่สามารถบันทึกคิวย้อนหลังได้");
      return;
    }

    // ─── ตรวจสอบห้องปิดรับคิว ───
    if (form.roomId && form.date) {
      const roomObj = rooms.find((r) => r.id === form.roomId);
      const proc = procedures.find((p) => p.id === form.procedureId);
      const dur = form.durationBlocks ?? proc?.blocks ?? 1;

      const isClosed = form.timeBlock !== null
        ? isRoomRangeClosed(roomSchedules, form.roomId, form.date, form.timeBlock, dur, roomObj)
        : roomSchedules.some((s) => s.roomId === form.roomId && (s.date === form.date || s.date === "") && !s.available && !s.noteOnly && s.startBlock === null);

      if (isClosed) {
        showToast("error", "❌ ห้องนี้ปิดรับคิวหรือปิดให้บริการในเวลาที่เลือก ไม่สามารถลงคิวได้");
        return;
      }
    }

    // ─── ตรวจสอบคิวซ้ำ (เบอร์ + วันที่ + หัตถการเดิม) ───
    if (!editingQueueId) {
      const duplicate = queues.find((q) =>
        q.phone.trim() === form.phone.trim() &&
        q.date === form.date &&
        (form.procedureId ? q.procedureId === form.procedureId : true)
      );
      if (duplicate) {
        showToast("error", `⚠️ ${duplicate.name} (${duplicate.phone}) มีคิววันนี้แล้ว (${duplicate.timeBlock !== null ? blockToTime(duplicate.timeBlock) : "ไม่ระบุเวลา"}) — ถ้าต้องการบันทึกจริง กรุณาตรวจสอบก่อน`);
        return;
      }
    }

    // ─── ตรวจสอบเวลาชนกัน (ดึงจาก DB สด ป้องกัน race condition หลายเครื่อง) ───
    if (form.timeBlock !== null && form.roomId && form.procedureId) {
      const proc = procedures.find((p) => p.id === form.procedureId);
      const dur = form.durationBlocks ?? proc?.blocks ?? 0;
      // ดึงคิวห้องนี้ วันนี้ จาก DB สด ไม่ใช้ state (กัน 2 คนจองห้องเดียวกันพร้อมกัน)
      const roomCheck = await checkFreshRoomBookingConflict({
        fetchQueues: fetchQueuesForRoomDate,
        roomId: form.roomId,
        date: form.date,
        procedures,
        startBlock: form.timeBlock,
        durationBlocks: dur,
        excludeQueueId: editingQueueId,
      });
      if (!roomCheck.ok) {
        console.error("Fresh room conflict check failed:", roomCheck.error);
        showToast("error", "ตรวจสอบเวลาห้องไม่สำเร็จ ข้อมูลยังไม่ถูกบันทึก กรุณาลองอีกครั้ง");
        return false;
      }

      const conflict = roomCheck.conflict;

      if (conflict) {
        const cProc = procedures.find(p => p.id === conflict.procedureId);
        const cDur = conflict.durationBlocks ?? cProc?.blocks ?? 0;
        showToast("error", `เวลาชนกับคิวของ ${conflict.name} (${blockToTime(conflict.timeBlock)}–${blockToTime(conflict.timeBlock + cDur)})`);
        return;
      }
    }

    recordClientDiagnostic("write_outcome", { outcome: "started" });
    const useServerCreate = !editingQueueId && shouldUseServerQueueCreate(currentUser, form);
    try {
      if (editingQueueId) {
        await updateQueue(editingQueueId, form);
        showToast("success", "แก้ไขคิวเรียบร้อย");
        setEditingQueueId(null);
      } else {
        let newQueue;
        if (useServerCreate) {
          if (!serverQueueRequestIdRef.current) serverQueueRequestIdRef.current = crypto.randomUUID();
          newQueue = await createQueueOnServer({ requestId: serverQueueRequestIdRef.current, form });
          serverQueueRequestIdRef.current = null;
        } else {
          newQueue = await createQueue({
            ...form,
            createdAt: getTodayStr(),
            recordedBy: currentUser?.id || null,
          });
        }
        // อัปเดต state ทันที ไม่รอ Realtime (ป้องกันคิวไม่ขึ้นถ้า Realtime ช้า)
        if (newQueue) {
          setQueues((prev) => prev.some((q) => q.id === newQueue.id) ? prev : [...prev, newQueue]);
        }
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
      recordClientDiagnostic("write_outcome", { outcome: "succeeded" });
      return true;
    } catch (error) {
      console.error("Booking save failed:", error);
      recordClientDiagnostic("write_outcome", { outcome: "failed", error });
      // Goal 13: after a server business rejection there is NO fallback to the
      // direct insert path. The server wrote nothing; show the reason and keep
      // the draft. A transport failure keeps the request ID so retrying the
      // same attempt cannot create a duplicate queue.
      const serverCode = useServerCreate ? await extractQueueCreateErrorCode(error) : null;
      if (serverCode) {
        serverQueueRequestIdRef.current = null;
        showToast("error", queueCreateErrorMessage(serverCode));
      } else {
        showToast("error", "บันทึกคิวไม่สำเร็จ ข้อมูลในฟอร์มยังอยู่ครบ กรุณาลองอีกครั้ง");
      }
      return false;
    }
  }, [form, editingQueueId, showToast, queues, procedures, parseHints, lastParseSnapshot, branches, promos, rooms, currentUser]);

  const editQueue = useCallback((q) => {
    setForm({ ...q });
    setEditingQueueId(q.id);
    navigateTo("booking");
  }, [navigateTo]);

  const deleteQueue = useCallback(async (id, queueSnapshot) => {
    await deleteQueueDB(id);
    if (queueSnapshot) {
      await createActivityLog({
        action: "delete_queue",
        targetType: "queue",
        targetId: id,
        detail: JSON.stringify({
          name: queueSnapshot.name,
          phone: queueSnapshot.phone,
          date: queueSnapshot.date,
          timeBlock: queueSnapshot.timeBlock,
          roomId: queueSnapshot.roomId,
          procedureId: queueSnapshot.procedureId,
        }),
        performedBy: currentUser?.id || null,
        performedByName: currentUser?.nickname || currentUser?.name || null,
      });
    }
    showToast("success", "ลบคิวแล้ว");
  }, [showToast, currentUser]);

  const updateQueueStatus = useCallback(async (id, payload) => {
    recordClientDiagnostic("write_outcome", { outcome: "started" });
    try {
      if (payload.status === "rescheduled") {
        // คิวเดิม: เปลี่ยนแค่ status + statusNote ไม่แตะ date/timeBlock
        await updateQueueStatusDB(id, {
          status: "rescheduled",
          statusNote: payload.statusNote || "",
        });

        // สร้างคิวใหม่ที่วันใหม่ สถานะ rescheduled_in
        const orig = queues.find((q) => q.id === id);
        const rescheduledQueue = buildRescheduledQueue(orig, payload, getTodayStr());
        if (rescheduledQueue) await createQueue(rescheduledQueue);
      } else {
        await updateQueueStatusDB(id, payload);
      }

      setModal(null);
      const st = payload.status;
      const labels = { confirmed: "ยืนยันแล้ว ✅", rescheduled: "เลื่อนออก 📤", rescheduled_in: "เลื่อนมา (ใหม่) �", no_show: "บันทึก: ไม่มาตามนัด 🚫", cancelled: "ยกเลิกแล้ว ❌", done: "เสร็จสิ้น 🎉", follow1: "บันทึก: โทรตาม ×1", follow2: "บันทึก: โทรตาม ×2", follow3: "บันทึก: โทรตาม ×3 📞" };
      showToast("success", labels[st] || "อัปเดตสถานะแล้ว");
      recordClientDiagnostic("write_outcome", { outcome: "succeeded" });
    } catch (error) {
      recordClientDiagnostic("write_outcome", { outcome: "failed", error });
      throw error;
    }
  }, [showToast, queues, currentUser]);

  // ═══════ CRUD HELPERS ═══════
  const saveBranch = useCallback(async (data) => {
    if (data.id) {
      const updated = await updateBranch(data.id, data);
      setBranches(prev => prev.map(b => b.id === data.id ? updated : b));
    } else {
      const created = await createBranch(data);
      setBranches(prev => [...prev, created]);
    }
    setModal(null);
    showToast("success", "บันทึกสาขาเรียบร้อย");
  }, [showToast]);

  const saveProcedure = useCallback(async (data) => {
    if (data.id) {
      const updated = await updateProcedure(data.id, data);
      setProcedures(prev => prev.map(p => p.id === data.id ? updated : p));
    } else {
      const created = await createProcedure(data);
      setProcedures(prev => [...prev, created]);
    }
    setModal(null);
    showToast("success", "บันทึกหัตถการเรียบร้อย");
  }, [showToast]);

  const savePromo = useCallback(async (data) => {
    if (data.id) {
      const updated = await updatePromo(data.id, data);
      setPromos(prev => prev.map(p => p.id === data.id ? updated : p));
    } else {
      const created = await createPromo(data);
      setPromos(prev => [...prev, created]);
    }
    setModal(null);
    showToast("success", "บันทึกโปรเรียบร้อย");
  }, [showToast]);

  const reorderPromo = useCallback(async (promoId, direction) => {
    const idx = promos.findIndex((p) => p.id === promoId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= promos.length) return;

    // Swap in a local copy
    const reordered = [...promos];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];

    // Optimistic UI — assign sort_order = position index immediately
    setPromos(reordered.map((p, i) => ({ ...p, sortOrder: i })));

    // Collect items whose sort_order needs updating in DB
    // First time: all 252 items (lazy init), subsequent swaps: only 2 items
    const updateFns = [];
    for (let i = 0; i < reordered.length; i++) {
      if (reordered[i].sortOrder !== i) {
        const item = reordered[i];
        const newOrder = i;
        updateFns.push(() => updatePromo(item.id, { sortOrder: newOrder }));
      }
    }

    // Batch in chunks to avoid overwhelming the API
    const CHUNK = 50;
    for (let i = 0; i < updateFns.length; i += CHUNK) {
      await Promise.all(updateFns.slice(i, i + CHUNK).map((fn) => fn()));
    }
  }, [promos]);

  const reorderRoom = useCallback(async (roomId, direction) => {
    // หา branch ของห้องนี้ แล้ว reorder เฉพาะห้องใน branch เดียวกัน
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return;
    const branchRooms = rooms.filter((r) => r.branchId === room.branchId);
    const idx = branchRooms.findIndex((r) => r.id === roomId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= branchRooms.length) return;

    // Swap in a local copy
    const reordered = [...branchRooms];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];

    // Optimistic UI — update sort_order for all rooms (keep other branches' rooms intact)
    const otherRooms = rooms.filter((r) => r.branchId !== room.branchId);
    const updatedBranchRooms = reordered.map((r, i) => ({ ...r, sortOrder: i }));
    setRooms([...otherRooms, ...updatedBranchRooms].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || 0));

    // Persist to DB — only items whose sort_order changed
    const updateFns = [];
    for (let i = 0; i < reordered.length; i++) {
      if (reordered[i].sortOrder !== i) {
        const item = reordered[i];
        const newOrder = i;
        updateFns.push(() => updateRoom(item.id, { sortOrder: newOrder }));
      }
    }
    const CHUNK = 50;
    for (let i = 0; i < updateFns.length; i += CHUNK) {
      await Promise.all(updateFns.slice(i, i + CHUNK).map((fn) => fn()));
    }
  }, [rooms]);

  const quickAddPromo = useCallback(async (data) => {
    const newPromo = await createPromo(data);
    setPromos(prev => [...prev, newPromo]);
    showToast("success", `เพิ่มโปร "${newPromo.name}" แล้ว`);
    return newPromo;
  }, [showToast]);

  const saveRoom = useCallback(async (data) => {
    if (data.bulk) {
      // Bulk mode: สร้างห้องหลายสาขาพร้อมกัน
      const created = [];
      for (const item of data.items) {
        created.push(await createRoom(item));
      }
      setRooms(prev => [...prev, ...created]);
      setModal(null);
      showToast("success", `สร้าง ${data.items.length} ห้องเรียบร้อย 🚀`);
    } else if (data.id) {
      const updated = await updateRoom(data.id, data);
      setRooms(prev => prev.map(r => r.id === data.id ? updated : r));
      setModal(null);
      showToast("success", "บันทึกห้องเรียบร้อย");
    } else {
      const created = await createRoom(data);
      setRooms(prev => [...prev, created]);
      setModal(null);
      showToast("success", "บันทึกห้องเรียบร้อย");
    }
  }, [showToast]);

  const saveRoomSchedule = useCallback(async (data) => {
    if (data.id) {
      const { roomIds, dates, ...rest } = data;
      const sharedDate = dates?.[0] ?? rest.date ?? "";
      const updated = await updateRoomSchedule(data.id, { ...rest, roomId: roomIds[0], date: sharedDate });
      setRoomSchedules(prev => prev.map(s => s.id === data.id ? updated : s));
      const newItems = [];
      for (const roomId of roomIds.slice(1)) {
        newItems.push(await createRoomSchedule({ ...rest, roomId, date: sharedDate }));
      }
      if (newItems.length > 0) setRoomSchedules(prev => [...prev, ...newItems]);
      showToast("success", newItems.length > 0 ? `แก้ไขตารางเรียบร้อย (+${newItems.length} ห้องใหม่)` : "แก้ไขตารางเรียบร้อย");
    } else {
      const { roomIds, dates, ...rest } = data;
      const newItems = [];
      for (const roomId of roomIds) {
        for (const date of (dates || [""])) {
          newItems.push(await createRoomSchedule({ ...rest, roomId, date }));
        }
      }
      setRoomSchedules(prev => [...prev, ...newItems]);
      showToast("success", `เพิ่มตาราง ${newItems.length} รายการเรียบร้อย 🗓️`);
    }
    setModal(null);
  }, [showToast]);

  const saveStaff = useCallback(async (data) => {
    if (data.id) {
      const updated = await updateStaff(data.id, data);
      setStaff(prev => prev.map(s => s.id === data.id ? updated : s));
      // อัปเดต currentUser ถ้าแก้ไขตัวเอง (ไม่เก็บ PIN)
      if (currentUser?.id === data.id) {
        const { pin: _pin, ...safeData } = data;
        setCurrentUser(safeData);
        localStorage.setItem('qlass_user', JSON.stringify(safeData));
      }
    } else {
      const created = await createStaff(data);
      setStaff(prev => [...prev, created]);
    }
    setModal(null);
    showToast("success", "บันทึกข้อมูลพนักงานเรียบร้อย");
  }, [showToast, currentUser]);

  // ─── Delete helpers ───
  const deleteBranch = useCallback(async (id) => {
    await deleteBranchDB(id);
    setBranches(prev => prev.filter(b => b.id !== id));
    showToast("success", "ลบสาขาแล้ว");
  }, [showToast]);

  const deleteProcedure = useCallback(async (id) => {
    await deleteProcedureDB(id);
    setProcedures(prev => prev.filter(p => p.id !== id));
    showToast("success", "ลบหัตถการแล้ว");
  }, [showToast]);

  const addCategory = useCallback(async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (categories.includes(trimmed)) return;
    try {
      const created = await createCategoryDB(trimmed);
      setCategories(prev => prev.includes(created) ? prev : [...prev, created]);
    } catch {
      // Fallback: just add locally
      setCategories((prev) => prev.includes(trimmed) ? prev : [...prev, trimmed]);
    }
  }, [categories]);

  const deleteCategory = useCallback(async (name) => {
    try {
      await deleteCategoryDB(name);
    } catch { /* ignore */ }
    setCategories(prev => prev.filter(c => c !== name));
    showToast("success", `ลบหมวด "${name}" แล้ว`);
  }, [showToast]);

  const deletePromo = useCallback(async (id) => {
    await deletePromoDB(id);
    setPromos(prev => prev.filter(p => p.id !== id));
    showToast("success", "ลบโปรแล้ว");
  }, [showToast]);

  const deleteRoom = useCallback(async (id) => {
    await deleteRoomDB(id);
    setRooms(prev => prev.filter(r => r.id !== id));
    showToast("success", "ลบห้องแล้ว");
  }, [showToast]);

  const deleteRoomSchedule = useCallback(async (id) => {
    await deleteRoomScheduleDB(id);
    setRoomSchedules(prev => prev.filter(s => s.id !== id));
    showToast("success", "ลบตารางแล้ว");
  }, [showToast]);

  const deleteStaff = useCallback(async (id) => {
    await deleteStaffDB(id);
    setStaff(prev => prev.filter(s => s.id !== id));
    showToast("success", "ลบพนักงานแล้ว");
  }, [showToast]);

  const toggleStaffActive = useCallback(async (id) => {
    const staffMember = staff.find(s => s.id === id);
    if (staffMember) {
      const updated = await updateStaff(id, { ...staffMember, active: !staffMember.active });
      setStaff(prev => prev.map(s => s.id === id ? updated : s));
    }
  }, [staff]);

  // ═══════ TICKET ACTIONS ═══════
  const createTicket = useCallback(async (ticketData, _images) => {
    try {
      const newTicket = await createTicketDB(ticketData);
      setTickets(prev => [newTicket, ...prev]);
      showToast("success", "ส่งคำร้องเรียบร้อย");
      return true;
    } catch (err) {
      console.error("Create ticket error:", err);
      showToast("error", "ไม่สามารถสร้างคำร้องได้ ข้อมูลในฟอร์มยังอยู่ครบ กรุณาลองอีกครั้ง");
      return false;
    }
  }, [showToast]);

  const updateTicket = useCallback(async (id, updates) => {
    try {
      const updated = await updateTicketDB(id, updates);
      setTickets(prev => prev.map(t => t.id === id ? updated : t));
      showToast("success", "อัปเดตสถานะแล้ว");
      return true;
    } catch (err) {
      console.error("Update ticket error:", err);
      showToast("error", "ไม่สามารถอัปเดตได้");
      return false;
    }
  }, [showToast]);

  const deleteTicket = useCallback(async (id) => {
    try {
      await deleteTicketDB(id);
      setTickets(prev => prev.filter(t => t.id !== id));
      showToast("success", "ลบคำร้องแล้ว");
      return true;
    } catch (err) {
      console.error("Delete ticket error:", err);
      showToast("error", "ไม่สามารถลบได้");
      return false;
    }
  }, [showToast]);

  // ═══════ RENDER ═══════

  // login แล้ว แต่ข้อมูลเบื้องหลัง (queues ฯลฯ) ยังโหลดไม่เสร็จ → แสดง loading กันเห็นข้อมูลว่าง
  if (currentUser && !isDataReady) {
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
    return <LoginScreen staff={staff} onLogin={handleLogin} supabaseError={supabaseError} serverSessionEnabled={useServerSession} />;
  }

  return (
    <div className="app">
      <Sidebar
        currentPage={page}
        onNavigate={navigateTo}
        branchCount={filteredBranches.length}
        queueCount={filteredQueues.filter(q => q.date?.startsWith(new Date().toISOString().slice(0, 7)) && ["new", "old"].includes(q.customerType)).length}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      <div className="main">
        <div className="main-shell">
          {refreshRequired && (
            <div role="status" style={{
              margin: "10px 14px 0", padding: "10px 14px", borderRadius: 8,
              background: "#fff4d6", border: "1px solid #f1c75b", color: "#6b4e00",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            }}>
              <span>มีเวอร์ชันใหม่เพื่อความเข้ากันได้ของระบบ กรุณารีเฟรชเมื่อสะดวก</span>
              <button type="button" onClick={() => window.location.reload()} style={{
                border: 0, borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontWeight: 600,
                background: "#c95e38", color: "#fff",
              }}>รีเฟรชตอนนี้</button>
            </div>
          )}
          <TopBar page={page} isEditing={!!editingQueueId} supabaseError={supabaseError} />

          <div className="content">
            {page === "ceo-dashboard" && (
              <CeoDashboardPage
                queues={filteredQueues}
                allQueues={queues}
                branches={branches}
                rooms={rooms}
                procedures={procedures}
                promos={promos}
                staff={staff}
                currentUser={currentUser}
              />
            )}

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
                roomSchedules={filteredRoomSchedules}
                queues={filteredQueues}
                onSubmit={handleBookingSubmit}
                onQuickAddPromo={quickAddPromo}
                parseHints={parseHints || { branchAliases: {}, procedureAliases: {}, promoAliases: {}, roomAliases: {}, procedureToRoom: {} }}
                onSmartApply={(fields, rawText) => {
                  setForm((f) => ({ ...f, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null && v !== "")) }));
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
                    showToast("success", `🚀 สร้าง ${created} คิวเรียบร้อย!`);
                  }
                }}
                todayStats={todayStats}
                currentUser={currentUser}
                showToast={showToast}
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
                roomSchedules={filteredRoomSchedules}
                onEdit={editQueue}
                onDelete={deleteQueue}
                onUpdateStatus={(q) => setModal({ type: "status", data: q })}
              />
            )}

            {page === "waiting-queue" && (
              <WaitingQueuePage
                queues={filteredQueues}
                branches={filteredBranches}
                procedures={procedures}
                staff={staff}
                onCallIn={editQueue}
                onUpdateStatus={(q) => setModal({ type: "status", data: q })}
                onDelete={deleteQueue}
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
                onReorder={reorderPromo}
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
                onReorder={reorderRoom}
              />
            )}

            {page === "timeline" && (
              <TimelinePage
                queues={filteredQueues}
                branches={filteredBranches}
                rooms={filteredRooms}
                procedures={procedures}
                promos={promos}
                roomSchedules={filteredRoomSchedules}
                currentUser={currentUser}
                showToast={showToast}
                onSubmitBooking={async (bookingForm) => {
                  // room schedule closure check
                  if (bookingForm.roomId && bookingForm.date) {
                    const roomObj = rooms.find((r) => r.id === bookingForm.roomId);
                    const proc = procedures.find((p) => p.id === bookingForm.procedureId);
                    const dur = bookingForm.durationBlocks ?? proc?.blocks ?? 1;

                    const isClosed = bookingForm.timeBlock !== null
                      ? isRoomRangeClosed(roomSchedules, bookingForm.roomId, bookingForm.date, bookingForm.timeBlock, dur, roomObj)
                      : roomSchedules.some((s) => s.roomId === bookingForm.roomId && (s.date === bookingForm.date || s.date === "") && !s.available && !s.noteOnly && s.startBlock === null);

                    if (isClosed) {
                      showToast("error", "❌ ห้องนี้ปิดรับคิวหรือปิดให้บริการในเวลาที่เลือก ไม่สามารถลงคิวได้");
                      return false;
                    }
                  }

                  // duplicate check
                  const dup = queues.find((q) =>
                    q.phone.trim() === bookingForm.phone.trim() &&
                    q.date === bookingForm.date &&
                    (bookingForm.procedureId ? q.procedureId === bookingForm.procedureId : true)
                  );
                  if (dup) {
                    showToast("error", `⚠️ ${dup.name} (${dup.phone}) มีคิววันนี้แล้ว (${dup.timeBlock !== null ? blockToTime(dup.timeBlock) : "ไม่ระบุเวลา"})`);
                    return false;
                  }
                  // conflict check — ดึงจาก DB สด ป้องกัน race condition หลายเครื่อง
                  if (bookingForm.timeBlock !== null && bookingForm.roomId && bookingForm.procedureId) {
                    const proc = procedures.find((p) => p.id === bookingForm.procedureId);
                    const dur = bookingForm.durationBlocks ?? proc?.blocks ?? 0;

                    // ดึงคิวห้องนี้ วันนี้ จาก DB สด
                    const roomCheck = await checkFreshRoomBookingConflict({
                      fetchQueues: fetchQueuesForRoomDate,
                      roomId: bookingForm.roomId,
                      date: bookingForm.date,
                      procedures,
                      startBlock: bookingForm.timeBlock,
                      durationBlocks: dur,
                    });
                    if (!roomCheck.ok) {
                      console.error("Timeline fresh room conflict check failed:", roomCheck.error);
                      showToast("error", "ตรวจสอบเวลาห้องไม่สำเร็จ ข้อมูลยังไม่ถูกบันทึก กรุณาลองอีกครั้ง");
                      return false;
                    }

                    const conflict = roomCheck.conflict;
                    if (conflict) {
                      const cProc = procedures.find((p) => p.id === conflict.procedureId);
                      const cDur = conflict.durationBlocks ?? cProc?.blocks ?? 0;
                      showToast("error", `เวลาชนกับคิวของ ${conflict.name} (${blockToTime(conflict.timeBlock)}–${blockToTime(conflict.timeBlock + cDur)})`);
                      return false;
                    }
                  }
                  try {
                    // บันทึกลง Supabase และอัปเดต state ทันที ไม่รอ Realtime
                    const newQueue = await createQueue({ ...bookingForm, recordedBy: currentUser?.id || null });
                    if (newQueue) {
                      setQueues((prev) => prev.some((q) => q.id === newQueue.id) ? prev : [...prev, newQueue]);
                    }
                    showToast("success", "บันทึกคิวเรียบร้อย ✓");
                    return true;
                  } catch (error) {
                    console.error("Timeline booking save failed:", error);
                    showToast("error", "บันทึกคิวไม่สำเร็จ ข้อมูลในฟอร์มยังอยู่ครบ กรุณาลองอีกครั้ง");
                    return false;
                  }
                }}
                onEditQueue={(q) => { editQueue(q); }}
              />
            )}

            {page === "summary" && (
              <SummaryPage
                queues={filteredQueues}
                allQueues={queues}
                branches={filteredBranches}
                allBranches={branches}
                rooms={filteredRooms}
                procedures={procedures}
                promos={promos}
                staff={staff}
                currentUser={currentUser}
              />
            )}

            {page === "room-schedule" && (
              <RoomSchedulePage
                roomSchedules={filteredRoomSchedules}
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
                roomSchedules={filteredRoomSchedules}
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

            {page === "activity-log" && (
              <ActivityLogPage
                rooms={rooms}
                procedures={procedures}
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
            <StatusModal data={modal.data} queue={modal.data} procedures={procedures} queues={queues} onSave={updateQueueStatus} onClose={() => setModal(null)} />
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
