#!/bin/bash
# ============================================================
# HN Full Sync — Auto retry จนกว่าจะครบ
# รันสคริปต์นี้แค่ครั้งเดียว แล้วทิ้งไว้ได้เลย
# ============================================================

SCRIPT_DIR="/Users/korrakotsurapinit/ATG/Qlass/hn_sync"
LOG="/tmp/hn_full_sync.log"
MAX_RETRIES=50
RETRY_DELAY=10

echo "🔄 HN Full Sync — Auto retry mode"
echo "   Log: $LOG"
echo "   กด Ctrl+C เพื่อหยุด"
echo ""

attempt=1
while [ $attempt -le $MAX_RETRIES ]; do
    echo "━━━ Attempt $attempt / $MAX_RETRIES — $(date '+%H:%M:%S') ━━━"

    # รัน sync (--full จะ auto-resume ถ้ามี progress file)
    cd "$SCRIPT_DIR" && python3 -u sync.py --full 2>&1 | tee -a "$LOG"
    EXIT_CODE=$?

    # เช็คว่าเสร็จจริงมั้ย (progress file หายไป = เสร็จแล้ว)
    if [ $EXIT_CODE -eq 0 ] && [ ! -f "$SCRIPT_DIR/sync_progress.json" ]; then
        echo ""
        echo "✅ Full sync เสร็จสมบูรณ์! $(date '+%H:%M:%S')"
        osascript -e 'display notification "✅ HN Full Sync เสร็จแล้ว!" with title "HN Sync"' 2>/dev/null
        exit 0
    fi

    echo ""
    echo "⚠️  Sync หยุดกลางคัน (exit: $EXIT_CODE) — รอ ${RETRY_DELAY}s แล้ว resume..."
    sleep $RETRY_DELAY
    attempt=$((attempt + 1))
done

echo "❌ หยุดหลังจาก $MAX_RETRIES attempts"
