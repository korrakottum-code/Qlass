// มูลค่าโปรที่จอง (no imports — node-testable directly)

export function buildPromoPriceIndex(promos) {
  const index = {};
  (promos || []).forEach((p) => {
    if (p?.id) index[p.id] = Number(p.price) || 0;
  });
  return index;
}

/**
 * มูลค่าโปรที่จองของคิวหนึ่งใบ: ใช้ราคาที่บันทึกในคิวก่อน
 * ถ้าคิวไม่มีราคา (เช่น คิวเก่าที่ราคาถูกล้างโดยบั๊กก่อน Goal 9)
 * ให้ใช้ราคาปัจจุบันของโปรที่จองแทน — เป็นค่าประเมิน ไม่ใช่ราคาที่บันทึกจริง
 */
export function queueBookedValue(queue, promoPriceIndex) {
  const recorded = Number(queue?.price);
  if (queue?.price !== "" && queue?.price != null && Number.isFinite(recorded)) {
    return recorded;
  }
  return (promoPriceIndex && promoPriceIndex[queue?.promoId]) || 0;
}
