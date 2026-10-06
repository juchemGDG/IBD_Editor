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
