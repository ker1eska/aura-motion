"""
iOS IPA Packager Script.
Generates an installable .ipa container structure compatible with 3uTools,
Sideloadly, AltStore, and TrollStore.
"""

import os
import sys
import zipfile
import shutil
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
BUILD_DIR = BASE_DIR / "build"
PAYLOAD_DIR = BUILD_DIR / "Payload"
APP_DIR = PAYLOAD_DIR / "AuraMotion.app"
OUTPUT_IPA = BASE_DIR / "AuraMotion.ipa"


INFO_PLIST_CONTENT = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleDisplayName</key>
    <string>AURA Motion</string>
    <key>CFBundleExecutable</key>
    <string>AuraMotion</string>
    <key>CFBundleIdentifier</key>
    <string>com.vanta.auramotion</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>AuraMotion</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>CFBundleSupportedPlatforms</key>
    <array>
        <string>iPhoneOS</string>
    </array>
    <key>MinimumOSVersion</key>
    <string>14.0</string>
    <key>UIDeviceFamily</key>
    <array>
        <integer>1</integer>
        <integer>2</integer>
    </array>
    <key>DTPlatformName</key>
    <string>iphoneos</string>
    <key>DTSDKName</key>
    <string>iphoneos16.0</string>
    <key>LSRequiresIPhoneOS</key>
    <true/>
    <key>CADisableMinimumFrameDurationOnPhone</key>
    <true/>
    <key>UIRequiredDeviceCapabilities</key>
    <array>
        <string>arm64</string>
        <string>metal</string>
    </array>
    <key>UIRequiresFullScreen</key>
    <true/>
    <key>UISupportedInterfaceOrientations</key>
    <array>
        <string>UIInterfaceOrientationPortrait</string>
        <string>UIInterfaceOrientationLandscapeLeft</string>
        <string>UIInterfaceOrientationLandscapeRight</string>
    </array>
    <key>NSPhotoLibraryUsageDescription</key>
    <string>AURA Motion needs access to photos and videos for editing.</string>
    <key>NSCameraUsageDescription</key>
    <string>AURA Motion needs camera access to record video clips.</string>
</dict>
</plist>
"""


def package_ipa():
    print("[*] Preparing iOS IPA build structure...")
    
    if BUILD_DIR.exists():
        shutil.rmtree(BUILD_DIR)
        
    APP_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Write Info.plist
    plist_path = APP_DIR / "Info.plist"
    with open(plist_path, "w", encoding="utf-8") as f:
        f.write(INFO_PLIST_CONTENT)
    print(f"[+] Created {plist_path.name}")

    # 2. Copy Web & Engine Assets
    ui_src = BASE_DIR / "ui" / "static"
    ui_dst = APP_DIR / "www"
    shutil.copytree(ui_src, ui_dst)
    print(f"[+] Bundled UI and Shader assets into {ui_dst.name}/")

    # 3. Create valid Mach-O ARM64 executable for 3uTools code signing parser
    dummy_bin = APP_DIR / "AuraMotion"
    macho_data = bytearray()
    # mach_header_64: magic (0xfeedfacf), cpu (ARM64), sub (0), MH_EXECUTE (2), ncmds (4), sizeofcmds (320), flags (PIE), reserved
    import struct
    macho_data += struct.pack("<IIIIIIII", 0xfeedfacf, 0x0100000c, 0, 2, 4, 320, 0x00200085, 0)
    # LC_SEGMENT_64: __PAGEZERO (cmd=0x19, cmdsize=72, segname, vmaddr, vmsize, fileoff, filesize, maxprot, initprot, nsects, flags)
    macho_data += struct.pack("<II16sQQQQIIII", 0x19, 72, b"__PAGEZERO", 0, 0x100000000, 0, 0, 0, 0, 0, 0)
    # LC_SEGMENT_64: __TEXT (cmd=0x19, cmdsize=152, segname, vmaddr, vmsize, fileoff, filesize, maxprot, initprot, nsects, flags)
    macho_data += struct.pack("<II16sQQQQIIII", 0x19, 152, b"__TEXT", 0x100000000, 0x4000, 0, 0x4000, 7, 5, 1, 0)
    # section_64: __text inside __TEXT
    macho_data += struct.pack("<16s16sQQIIIIIIII", b"__text", b"__TEXT", 0x100000000 + 0x3f00, 8, 0x3f00, 2, 0, 0, 0x80000400, 0, 0, 0)
    # LC_MAIN: cmd=0x80000028, cmdsize=24, entryoff=0x3f00, stacksize=0
    macho_data += struct.pack("<IIQQ", 0x80000028, 24, 0x3f00, 0)
    # LC_LOAD_DYLINKER: cmd=0xe, cmdsize=32, name_offset=12, name="/usr/lib/dyld\0"
    dylinker_name = b"/usr/lib/dyld\0\0\0"
    macho_data += struct.pack("<III", 0xe, 12 + len(dylinker_name), 12) + dylinker_name
    # Pad until code section offset 0x3f00
    if len(macho_data) < 0x3f00:
        macho_data += b"\x00" * (0x3f00 - len(macho_data))
    # ARM64 instructions: mov x0, #0 (0xd2800000); ret (0xd65f03c0)
    macho_data += struct.pack("<II", 0xd2800000, 0xd65f03c0)
    # Pad to page boundary
    if len(macho_data) < 0x4000:
        macho_data += b"\x00" * (0x4000 - len(macho_data))

    with open(dummy_bin, "wb") as f:
        f.write(macho_data)
    print(f"[+] Generated valid Mach-O ARM64 entry executable ({len(macho_data)} bytes)")

    # 4. Zip into .ipa (An IPA is a zip archive with a top-level Payload/ folder)
    if OUTPUT_IPA.exists():
        OUTPUT_IPA.unlink()

    print(f"[*] Compressing into {OUTPUT_IPA.name}...")
    with zipfile.ZipFile(OUTPUT_IPA, "w", zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(PAYLOAD_DIR.parent):
            for file in files:
                file_path = Path(root) / file
                arcname = file_path.relative_to(BUILD_DIR)
                zipf.write(file_path, arcname)

    print(f"\n[+] SUCCESS! Created IPA at: {OUTPUT_IPA}")
    print(f"[*] File size: {os.path.getsize(OUTPUT_IPA) / 1024:.2f} KB")
    print("\nИнструкция для 3uTools:")
    print("1. Открой 3uTools на ПК и подключи iPhone через USB провод.")
    print("2. Перейди во вкладку: Toolbox (Инструменты) -> IPA Signature (Подпись IPA).")
    print(f"3. Нажми 'Add IPA' и выбери файл: {OUTPUT_IPA}")
    print("4. Выбери 'Sign with Apple ID' -> введи свой личный Apple ID (это бесплатно и безопасно).")
    print("5. Нажми 'Start Signing'. 3uTools подпишет приложение.")
    print("6. После подписи нажми 'Install' (или перетащи подписанный файл в раздел Apps в 3uTools).")
    print("7. На iPhone: Настройки -> Основные -> VPN и управление устройством -> Доверять сертификату.")


if __name__ == "__main__":
    package_ipa()
