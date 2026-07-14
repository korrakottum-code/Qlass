export function findRoomBookingConflict({
  queues,
  procedures,
  startBlock,
  durationBlocks,
  excludeQueueId = null,
}) {
  const endA = startBlock + durationBlocks;

  return queues.find((queue) => {
    if (queue.id === excludeQueueId || queue.timeBlock === null) return false;

    const procedure = procedures.find((item) => item.id === queue.procedureId);
    const duration = queue.durationBlocks ?? procedure?.blocks ?? 1;
    const endB = queue.timeBlock + duration;
    return startBlock < endB && queue.timeBlock < endA;
  }) || null;
}

// Never substitute cached queues when this check cannot read the latest room
// state. The caller must stop the write and leave its draft visible for retry.
export async function checkFreshRoomBookingConflict({
  fetchQueues,
  roomId,
  date,
  procedures,
  startBlock,
  durationBlocks,
  excludeQueueId = null,
}) {
  try {
    const queues = await fetchQueues(roomId, date);
    return {
      ok: true,
      conflict: findRoomBookingConflict({
        queues,
        procedures,
        startBlock,
        durationBlocks,
        excludeQueueId,
      }),
    };
  } catch (error) {
    return { ok: false, reason: "fresh-check-failed", error };
  }
}
