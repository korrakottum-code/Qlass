#!/bin/bash

# QLASS HN Cookie Refresh
# Double-click this file on a trusted Mac. It refreshes the same validated
# Pro Clinic cookie in both GitHub Actions and the production Supabase project.

set -u
set -o pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

REPO="korrakottum-code/Qlass"
PROJECT_REF="hjuvtsjjtucdirlkdgwa"
SECRET_NAME="PROCLINIC_COOKIES_B64"
PROCLINIC_API="https://proclinicth.com/admin/api/customer"
QLASS_URL="https://qlass-gray.vercel.app/"
WORK_DIR="$HOME/.qlass-hn-refresh"
VENV_DIR="$WORK_DIR/venv"
COOKIE_FILE="$WORK_DIR/cookies.json"
SECRET_ENV_FILE="$WORK_DIR/secret.env"
DRY_RUN="${QLASS_HN_REFRESH_DRY_RUN:-0}"
COOKIE_SOURCE="${QLASS_HN_COOKIE_SOURCE:-}"

mkdir -p "$WORK_DIR"
chmod 700 "$WORK_DIR"

cleanup() {
  rm -f "$SECRET_ENV_FILE"
}
trap cleanup EXIT INT TERM

notify() {
  /usr/bin/osascript -e "display notification \"$1\" with title \"QLASS HN Refresh\"" >/dev/null 2>&1 || true
}

dialog() {
  /usr/bin/osascript -e "display alert \"$1\" message \"$2\"" >/dev/null 2>&1 || true
}

fail() {
  echo ""
  echo "❌ $1"
  notify "ไม่สำเร็จ: $1"
  dialog "รีเฟรช HN ไม่สำเร็จ" "$1\n\nยังไม่มีการเปลี่ยนข้อมูลลูกค้า กรุณาดูรายละเอียดในหน้าต่าง Terminal"
  echo ""
  read -r -p "กด Enter เพื่อปิดหน้าต่าง..." _
  exit 1
}

run_or_fail() {
  local message="$1"
  shift
  "$@" || fail "$message"
}

install_with_brew() {
  local command_name="$1"
  shift
  if command -v "$command_name" >/dev/null 2>&1; then
    return 0
  fi
  if ! command -v brew >/dev/null 2>&1; then
    open "https://brew.sh" >/dev/null 2>&1 || true
    fail "เครื่องนี้ยังไม่มี Homebrew กรุณาติดตั้งจากหน้าเว็บที่เปิดขึ้น แล้วดับเบิลคลิกไฟล์นี้อีกครั้ง"
  fi
  echo "กำลังติดตั้ง $command_name ครั้งแรก..."
  run_or_fail "ติดตั้ง $command_name ไม่สำเร็จ" brew install "$@"
}

echo "========================================"
echo "🔄 QLASS — Refresh HN Cookies"
echo "========================================"
echo "ระบบจะตรวจ Cookie ก่อน และจะไม่แก้ข้อมูลลูกค้า"
echo ""

install_with_brew python3 python
install_with_brew gh gh
install_with_brew supabase supabase/tap/supabase

if [ ! -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
  fail "ไม่พบ Google Chrome ในโฟลเดอร์ Applications"
fi

echo "1/7 เตรียมเครื่องมือสำหรับอ่าน Cookie..."
if [ ! -x "$VENV_DIR/bin/python" ]; then
  run_or_fail "สร้าง Python environment ไม่สำเร็จ" python3 -m venv "$VENV_DIR"
fi
if ! "$VENV_DIR/bin/python" -c 'import browser_cookie3, curl_cffi' >/dev/null 2>&1; then
  run_or_fail "ติดตั้งตัวอ่าน Cookie ไม่สำเร็จ" \
    "$VENV_DIR/bin/python" -m pip install --quiet \
    'browser-cookie3==0.20.1' 'curl-cffi==0.13.0'
fi

echo "2/7 ตรวจ GitHub..."
if [ "$DRY_RUN" = "1" ]; then
  echo "🧪 Dry run: ตรวจพบ GitHub CLI แล้ว"
else
  if ! gh auth status --hostname github.com >/dev/null 2>&1; then
    echo "ต้อง Login GitHub ครั้งแรก กรุณาทำตามหน้าเว็บที่กำลังเปิด..."
    run_or_fail "Login GitHub ไม่สำเร็จ" gh auth login --hostname github.com --git-protocol https --web
  fi
  run_or_fail "บัญชี GitHub ไม่มีสิทธิ์เข้าถึง repo Qlass" \
    gh secret list --repo "$REPO" --app actions >/dev/null
fi

echo "3/7 ตรวจ Supabase..."
if [ "$DRY_RUN" = "1" ]; then
  echo "🧪 Dry run: ตรวจพบ Supabase CLI แล้ว"
else
  if ! supabase projects list --output-format json >/dev/null 2>&1; then
    echo "ต้อง Login Supabase ครั้งแรก กรุณาทำตามข้อความบนหน้าจอ..."
    run_or_fail "Login Supabase ไม่สำเร็จ" supabase login
  fi
  run_or_fail "บัญชี Supabase ไม่มีสิทธิ์เข้าถึงโปรเจกต์ QLASS" \
    supabase secrets list --project-ref "$PROJECT_REF" --output-format json >/dev/null
fi

echo "4/7 ดึง Cookie จาก Chrome..."
if [ -n "$COOKIE_SOURCE" ]; then
  run_or_fail "ไม่พบไฟล์ Cookie สำหรับการทดสอบ" test -f "$COOKIE_SOURCE"
  run_or_fail "คัดลอกไฟล์ Cookie สำหรับการทดสอบไม่สำเร็จ" cp "$COOKIE_SOURCE" "$COOKIE_FILE"
else
  echo "กำลังปิด Chrome ชั่วคราวเพื่ออ่าน Cookie ให้ครบ..."
  /usr/bin/osascript -e 'tell application "Google Chrome" to quit' >/dev/null 2>&1 || true
  sleep 3
  COOKIE_FILE="$COOKIE_FILE" "$VENV_DIR/bin/python" <<'PY' || fail "ดึง Cookie ไม่สำเร็จ กรุณา Login proclinicth.com ใน Chrome แล้วลองอีกครั้ง"
import json
import os
import browser_cookie3

output = os.environ["COOKIE_FILE"]
jar = browser_cookie3.chrome(domain_name="proclinicth.com")
cookies = []
for cookie in jar:
    cookies.append({
        "name": cookie.name,
        "value": cookie.value,
        "domain": cookie.domain if cookie.domain.startswith(".") else f".{cookie.domain}",
        "path": cookie.path or "/",
        "expires": cookie.expires or -1,
        "secure": bool(cookie.secure),
        "httpOnly": False,
        "sameSite": "Lax",
    })

required = {"XSRF-TOKEN", "laravel_session"}
names = {cookie["name"] for cookie in cookies}
if not cookies or not required.issubset(names):
    raise SystemExit("required Pro Clinic cookies not found")

with open(output, "w", encoding="utf-8") as handle:
    json.dump(cookies, handle, ensure_ascii=False)
os.chmod(output, 0o600)
print(f"✅ พบ Cookie {len(cookies)} รายการ")
PY
fi
chmod 600 "$COOKIE_FILE"

echo "5/7 ทดสอบ Cookie กับ Pro Clinic ก่อนเปลี่ยน Secret..."
COOKIE_FILE="$COOKIE_FILE" PROCLINIC_API="$PROCLINIC_API" \
  "$VENV_DIR/bin/python" <<'PY' || fail "Cookie ใช้งานไม่ได้ กรุณาเปิด Chrome, Login Pro Clinic แล้วดับเบิลคลิกใหม่"
import json
import os
import urllib.parse
from curl_cffi.requests import Session

with open(os.environ["COOKIE_FILE"], encoding="utf-8") as handle:
    cookies = json.load(handle)
cookie_dict = {item["name"]: item["value"] for item in cookies}
xsrf = urllib.parse.unquote(cookie_dict.get("XSRF-TOKEN", ""))

with Session(impersonate="chrome124") as session:
    response = session.get(
        os.environ["PROCLINIC_API"],
        params={"page": 1},
        cookies=cookie_dict,
        headers={
            "Accept": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "X-XSRF-TOKEN": xsrf,
            "Referer": "https://proclinicth.com/admin/customer",
        },
        timeout=20,
    )
if response.status_code != 200 or '"data"' not in response.text:
    raise SystemExit(f"Pro Clinic returned HTTP {response.status_code}")
print("✅ Cookie ใช้งานได้")
PY

echo "6/7 อัปเดต Secret ให้ realtime และระบบ sync..."
COOKIE_B64=$(
  COOKIE_FILE="$COOKIE_FILE" "$VENV_DIR/bin/python" - <<'PY'
import base64
import os
with open(os.environ["COOKIE_FILE"], "rb") as handle:
    print(base64.b64encode(handle.read()).decode("ascii"))
PY
) || fail "แปลง Cookie ไม่สำเร็จ"

if [ -z "$COOKIE_B64" ]; then
  fail "Cookie ที่แปลงแล้วเป็นค่าว่าง"
fi

if [ "$DRY_RUN" = "1" ]; then
  echo "🧪 Dry run: ข้ามการอัปเดต GitHub และ Supabase"
else
  umask 077
  printf '%s=%s\n' "$SECRET_NAME" "$COOKIE_B64" > "$SECRET_ENV_FILE"

  # Supabase goes first. If it fails, GitHub remains unchanged. The tested
  # cookie never replaces either secret before this point.
  run_or_fail "อัปเดต Supabase Secret ไม่สำเร็จ — GitHub ยังไม่ถูกเปลี่ยน" \
    supabase secrets set --project-ref "$PROJECT_REF" --env-file "$SECRET_ENV_FILE"

  if ! printf '%s' "$COOKIE_B64" | gh secret set "$SECRET_NAME" --repo "$REPO" --app actions; then
    fail "Supabase อัปเดตแล้ว แต่ GitHub Secret ไม่สำเร็จ กรุณาดับเบิลคลิกซ้ำได้อย่างปลอดภัย"
  fi
fi

unset COOKIE_B64
rm -f "$SECRET_ENV_FILE"

echo "7/7 ตรวจยืนยันชื่อ Secret ทั้งสองระบบ..."
if [ "$DRY_RUN" != "1" ]; then
  supabase secrets list --project-ref "$PROJECT_REF" --output-format json | grep -q "$SECRET_NAME" \
    || fail "ไม่พบ Secret หลังอัปเดต Supabase"
  gh secret list --repo "$REPO" --app actions | grep -q "^${SECRET_NAME}" \
    || fail "ไม่พบ Secret หลังอัปเดต GitHub"
fi

echo ""
echo "✅ เสร็จแล้ว"
if [ "$DRY_RUN" = "1" ]; then
  echo "🧪 Dry run ผ่าน — ไม่มี Secret ใดถูกเปลี่ยน"
  exit 0
fi
echo "   • HN realtime: อัปเดต Supabase แล้ว"
echo "   • HN Full/Daily Sync: อัปเดต GitHub แล้ว"
echo "   • ไม่มีการแก้ไขหรือลบข้อมูลลูกค้า"
notify "สำเร็จ — อัปเดต HN Cookie ทั้งสองระบบแล้ว"
dialog "รีเฟรช HN สำเร็จ" "อัปเดต Cookie ให้ทั้ง HN realtime และ HN sync แล้ว\nไม่มีการแก้ไขหรือลบข้อมูลลูกค้า"
open "$QLASS_URL" >/dev/null 2>&1 || true
echo ""
read -r -p "กด Enter เพื่อปิดหน้าต่าง..." _
