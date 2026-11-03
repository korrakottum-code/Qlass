import { Suspense, lazy } from "react";
import App from "./App.jsx";
import { isPublicBookingHash } from "./utils/publicBooking";

// หน้าลูกค้าจองเอง (/#book) ไม่ต้องล็อกอินและไม่โหลดข้อมูลของพนักงาน — แยกออกจาก App ตั้งแต่ต้นทาง
const PublicBookingPage = lazy(() => import("./pages/PublicBookingPage.jsx"));

export default function Root() {
  if (isPublicBookingHash(window.location.hash)) {
    return (
      <Suspense fallback={null}>
        <PublicBookingPage />
      </Suspense>
    );
  }
  return <App />;
}
