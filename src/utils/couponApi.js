// ทางเข้าเดียวที่หน้าคูปองใช้เรียกเซิร์ฟเวอร์ — โหมดเดโมคู่มือ (scripts/screenshot) สลับไฟล์นี้เป็นตัวจำลองในหน่วยความจำ
// เพื่อดูหน้าจอบนเครื่องโดยไม่ต่อ Supabase จริง
import { getServerSessionToken, useServerSession, lookupCoupon, listCoupons, listCouponBatches, redeemCoupon, revertCouponRedemption, cancelCoupon, generateCoupons, fetchCouponCounters, cancelCouponBatch } from "./sessionAuth";

export const couponsAvailable = useServerSession;
export { getServerSessionToken, lookupCoupon, listCoupons, listCouponBatches, redeemCoupon, revertCouponRedemption, cancelCoupon, generateCoupons, fetchCouponCounters, cancelCouponBatch };
