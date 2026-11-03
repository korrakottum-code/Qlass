import { Suspense, lazy, useEffect, useState } from "react";
import App from "./App.jsx";
import { isBookingHost, isPublicBookingHash } from "./utils/publicBooking";

// หน้าลูกค้าจองเอง (/#book) ไม่ต้องล็อกอินและไม่โหลดข้อมูลของพนักงาน — แยกออกจาก App ตั้งแต่ต้นทาง
const PublicBookingPage = lazy(() => import("./pages/PublicBookingPage.jsx"));

// ที่อยู่สำหรับลูกค้า = หน้าจองเสมอ ไม่ว่า hash อะไร (ไม่มีทางเข้าหน้าล็อกอินพนักงานจากที่อยู่นี้)
const bookingOnly = isBookingHost(window.location.hostname);

export default function Root() {
  const [isBooking, setIsBooking] = useState(() => bookingOnly || isPublicBookingHash(window.location.hash));

  // วางลิงก์ #book ในแท็บที่เปิดระบบอยู่ (เปลี่ยนแค่ hash ไม่โหลดหน้าใหม่) ต้องสลับไปหน้าลูกค้าด้วย — และกลับกัน
  useEffect(() => {
    if (bookingOnly) return undefined;
    const onHash = () => setIsBooking(isPublicBookingHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (isBooking) {
    return (
      <Suspense fallback={null}>
        <PublicBookingPage />
      </Suspense>
    );
  }
  return <App />;
}
