export function buildRescheduledQueue(originalQueue, payload, createdAt) {
  if (!originalQueue || (payload.date === undefined && payload.timeBlock === undefined)) return null;
  const { id: _id, createdAt: _createdAt, status: _status, statusNote: _statusNote, statusUpdatedAt: _statusUpdatedAt, ...rest } = originalQueue;
  return {
    ...rest,
    date: payload.date || originalQueue.date,
    timeBlock: payload.timeBlock !== undefined ? payload.timeBlock : originalQueue.timeBlock,
    status: "rescheduled_in",
    statusNote: payload.statusNote || "",
    createdAt,
  };
}
