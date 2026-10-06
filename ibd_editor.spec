# PyInstaller-Spezifikation fuer den IBD Editor (Desktop-Huelle um web/static).
# Aufruf:  pyinstaller ibd_editor.spec
import os
import sys

block_cipher = None

# Die komplette Web-Oberflaeche wird mitgepackt (ohne den Ordner downloads/).
datas = []
for name in os.listdir(os.path.join("web", "static")):
    full = os.path.join("web", "static", name)
    if os.path.isfile(full) and name != ".htaccess":
        datas.append((full, "static"))

# pywebview laedt WebKit2 erst zur Laufzeit; PyInstaller hat dafuer keinen
# Hook und packt die Typelibs nicht mit. Der Runtime-Hook von PyInstaller
# setzt GI_TYPELIB_PATH aber ausschliesslich auf den eigenen Ordner – ohne
# diese Dateien heisst es dann "Namespace WebKit2 not available".
if sys.platform.startswith("linux"):
    import glob
    for typelib in ("WebKit2-4.1", "JavaScriptCore-4.1", "Soup-3.0"):
        found = glob.glob(f"/usr/lib/*/girepository-1.0/{typelib}.typelib") + glob.glob(f"/usr/lib*/girepository-1.0/{typelib}.typelib")
        if not found:
            raise SystemExit(f"{typelib}.typelib fehlt (Paket gir1.2-webkit2-4.1 installieren)")
        datas.append((found[0], "gi_typelibs"))

_default_icon = "assets/icon.icns" if sys.platform == "darwin" else "assets/icon.ico"
APP_ICON = os.environ.get("IBD_ICON") or (_default_icon if os.path.isfile(_default_icon) else None)

a = Analysis(
    ["desktop/ibd_desktop.py"],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=[],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    cipher=block_cipher,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="IBD-Editor",
    debug=False,
    strip=False,
    upx=False,
    console=False,
    icon=APP_ICON,
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name="IBD-Editor")

if sys.platform == "darwin":
    app = BUNDLE(
        coll,
        name="IBD-Editor.app",
        icon=APP_ICON,
        bundle_identifier="de.gdg-stuttgart.ibdeditor",
        info_plist={
            "CFBundleName": "IBD Editor",
            "CFBundleDisplayName": "IBD Editor",
            "CFBundleShortVersionString": "1.0.0",
            "NSHighResolutionCapable": True,
        },
    )
