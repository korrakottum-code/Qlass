export function reconcileRealtimeQueue(queues, event, queue) {
  if (!queue?.id) return queues;
  if (event === "DELETE") return queues.filter((item) => item.id !== queue.id);

  const exists = queues.some((item) => item.id === queue.id);
  if (event === "INSERT") return exists ? queues : [...queues, queue];
  if (event === "UPDATE") return exists
    ? queues.map((item) => item.id === queue.id ? queue : item)
    : [...queues, queue];
  return queues;
}
