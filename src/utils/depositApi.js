// ทางเข้าเดียวที่หน้า "ลูกค้าโอนแล้ว รอจองคิว" ใช้เรียกเซิร์ฟเวอร์ — โหมดเดโมคู่มือ (scripts/screenshot) สลับไฟล์นี้เป็นตัวจำลองในหน่วยความจำ
import { getServerSessionToken, useServerSession, listDeposits, createDeposit, linkDepositQueue, cancelDeposit, fetchDepositSlipUrl, fetchDepositStats } from "./sessionAuth";

export const depositsAvailable = useServerSession;
export { getServerSessionToken, listDeposits, createDeposit, linkDepositQueue, cancelDeposit, fetchDepositSlipUrl, fetchDepositStats };
