"""
export_chrome_cookies.py
ดึง cookies ของ proclinicth.com จาก Chrome ที่ login อยู่แล้ว
แล้วบันทึกเป็น cookies.json สำหรับ sync.py
"""
import json, os, sys

try:
    import browser_cookie3
except ImportError:
    print("ติดตั้ง browser_cookie3 ก่อน...")
    os.system(f"{sys.executable} -m pip install browser-cookie3 --quiet")
    import browser_cookie3

print("ดึง cookies จาก Chrome สำหรับ proclinicth.com ...")
try:
    cj = browser_cookie3.chrome(domain_name="proclinicth.com")
    cookies = []
    for c in cj:
        cookies.append({
            "name": c.name,
            "value": c.value,
            "domain": c.domain if c.domain.startswith(".") else f".{c.domain}",
            "path": c.path or "/",
            "expires": c.expires or -1,
            "secure": bool(c.secure),
            "httpOnly": False,
            "sameSite": "Lax",
        })

    if not cookies:
        print("❌ ไม่พบ cookie ของ proclinicth.com ใน Chrome")
        print("   กรุณา login ที่ https://proclinicth.com ใน Chrome ก่อน แล้วรันใหม่")
        sys.exit(1)

    out = os.path.join(os.path.dirname(__file__), "cookies.json")
    with open(out, "w") as f:
        json.dump(cookies, f, indent=2)

    print(f"✅ บันทึก {len(cookies)} cookies → {out}")
    print("\nขั้นตอนต่อไป:")
    print("  1. รัน: python3 sync.py  (จะใช้ cookies ที่เพิ่งดึงมา)")
    print("  2. ถ้า sync สำเร็จ — encode cookies เป็น base64 แล้วอัปเดต GitHub Secret")
    print("     python3 -c \"import base64,json; print(base64.b64encode(open('cookies.json','rb').read()).decode())\"")

except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)
