export function filterQueuesForExport(queues, { startDate, endDate, branchId = "all", includeCourse = true, onlyDone = false } = {}) {
  return queues.filter((queue) => {
    if (!queue.date) return false;
    if (startDate && queue.date < startDate) return false;
    if (endDate && queue.date > endDate) return false;
    if (branchId !== "all" && queue.branchId !== branchId) return false;
    if (!includeCourse && queue.customerType === "course") return false;
    if (onlyDone && queue.status !== "done") return false;
    return true;
  });
}
