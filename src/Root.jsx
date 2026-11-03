import { Suspense, lazy, useEffect, useState } from "react";
import App from "./App.jsx";
import { isPublicBookingHash } from "./utils/publicBooking";

// หน้าลูกค้าจองเอง (/#book) ไม่ต้องล็อกอินและไม่โหลดข้อมูลของพนักงาน — แยกออกจาก App ตั้งแต่ต้นทาง
const PublicBookingPage = lazy(() => import("./pages/PublicBookingPage.jsx"));

export default function Root() {
  const [isBooking, setIsBooking] = useState(() => isPublicBookingHash(window.location.hash));

  // วางลิงก์ #book ในแท็บที่เปิดระบบอยู่ (เปลี่ยนแค่ hash ไม่โหลดหน้าใหม่) ต้องสลับไปหน้าลูกค้าด้วย — และกลับกัน
  useEffect(() => {
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
