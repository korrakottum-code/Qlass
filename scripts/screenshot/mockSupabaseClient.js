// Supabase client จำลองสำหรับถ่ายภาพหน้าจอประกอบคู่มือ — ไม่ต่อเครือข่ายเลย
const chain = () => {
  const c = { data: [], error: null };
  const self = new Proxy(c, { get: (t, k) => (k in t ? t[k] : () => self), });
  return self;
};
export const supabase = {
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  removeChannel() {},
  functions: { invoke: async () => ({ data: null, error: new Error("mock: no server") }) },
  from: () => chain(),
  storage: { from: () => ({ upload: async () => ({ data: null, error: new Error("mock") }), getPublicUrl: () => ({ data: { publicUrl: "" } }), remove: async () => ({ error: null }) }) },
};
