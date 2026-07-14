import { useCallback, useRef, useState } from "react";

export function createSubmissionGuard() {
  let locked = false;

  return {
    async run(action) {
      if (locked) return { started: false };

      locked = true;
      try {
        return { started: true, result: await action() };
      } finally {
        locked = false;
      }
    },
  };
}

// React state alone updates after the current event finishes. The ref closes
// that small window so a double-click can never start a second write.
export function useSubmissionLock() {
  const guardRef = useRef(null);
  if (!guardRef.current) guardRef.current = createSubmissionGuard();
  const [isSaving, setIsSaving] = useState(false);

  const run = useCallback(async (action) => {
    return guardRef.current.run(async () => {
      setIsSaving(true);
      try {
        return await action();
      } finally {
        setIsSaving(false);
      }
    });
  }, []);

  return { isSaving, run };
}
