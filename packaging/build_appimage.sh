#!/usr/bin/env bash
# Baut aus der PyInstaller-Ausgabe ein AppImage, das WebKitGTK samt GTK und
# allen Abhaengigkeiten selbst mitbringt (laeuft im CI auf Ubuntu 22.04).
#
#   packaging/build_appimage.sh <PyInstaller-Ordner> <Ziel.AppImage>
#
# Warum so umstaendlich?
# - Das .tar.gz nutzt das WebKitGTK des Zielsystems. Neuere Systeme bringen
#   Bibliotheken mit, die eine neuere libstdc++ brauchen als die von 22.04.
# - WebKitGTK startet Hilfsprozesse (WebKitWebProcess, WebKitNetworkProcess)
#   ueber einen fest einkompilierten Pfad unter /usr/lib/... . Wie bei Tauri
#   wird in libwebkit2gtk "/usr" durch das gleich lange "././" ersetzt; AppRun
#   wechselt nach $APPDIR/usr, so zeigen die Pfade ins AppImage.
# - libstdc++/libgcc_s kommen NICHT mit (AppImage-Excludelist): die des
#   Zielsystems sind immer mindestens so neu wie die von 22.04, und die
#   Grafiktreiber des Zielsystems (Mesa) brauchen die neue.
set -euo pipefail

SRC="$(realpath "$1")"
OUT="$(realpath -m "$2")"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$ROOT/build/appimage"
APPDIR="$WORK/AppDir"
TRIPLET="x86_64-linux-gnu"
WEBKIT_HELPERS="/usr/lib/$TRIPLET/webkit2gtk-4.1"

export ARCH=x86_64
export APPIMAGE_EXTRACT_AND_RUN=1   # Runner haben kein FUSE

rm -rf "$WORK"
mkdir -p "$WORK/tools" "$APPDIR/usr/lib/$TRIPLET"

echo "== Werkzeuge laden"
cd "$WORK/tools"
curl -fsSLo linuxdeploy https://github.com/linuxdeploy/linuxdeploy/releases/download/continuous/linuxdeploy-x86_64.AppImage
curl -fsSLo linuxdeploy-plugin-gtk.sh https://raw.githubusercontent.com/linuxdeploy/linuxdeploy-plugin-gtk/master/linuxdeploy-plugin-gtk.sh
curl -fsSLo appimagetool https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage
chmod +x linuxdeploy linuxdeploy-plugin-gtk.sh appimagetool
export PATH="$WORK/tools:$PATH"
cd "$ROOT"

echo "== App und WebKit-Hilfsprozesse in das AppDir"
cp -a "$SRC" "$APPDIR/usr/lib/ibd-editor"
find "$APPDIR/usr/lib/ibd-editor" \( -name 'libstdc++.so*' -o -name 'libgcc_s.so*' \) -print -delete
cp -a "$WEBKIT_HELPERS" "$APPDIR/usr/lib/$TRIPLET/"

echo "== Abhaengigkeiten einsammeln (linuxdeploy + GTK-Plugin)"
DEPLOY_GTK_VERSION=3 linuxdeploy --appdir "$APPDIR" \
    --library "/usr/lib/$TRIPLET/libwebkit2gtk-4.1.so.0" \
    --library "/usr/lib/$TRIPLET/libjavascriptcoregtk-4.1.so.0" \
    --deploy-deps-only "$APPDIR/usr/lib/$TRIPLET/webkit2gtk-4.1" \
    --deploy-deps-only "$APPDIR/usr/lib/$TRIPLET/webkit2gtk-4.1/injected-bundle" \
    --plugin gtk

echo "== Hilfsprozess-Pfade in libwebkit2gtk relativ machen"
mapfile -t WEBKIT_LIBS < <(find "$APPDIR/usr/lib" -maxdepth 1 -type f -name 'libwebkit2gtk-4.1.so*')
[ "${#WEBKIT_LIBS[@]}" -gt 0 ] || { echo "libwebkit2gtk nicht im AppDir"; exit 1; }
sed -i -e 's|/usr|././|g' "${WEBKIT_LIBS[@]}"
grep -q "././/lib/$TRIPLET/webkit2gtk-4.1" "${WEBKIT_LIBS[@]}" \
    || { echo "Pfad der WebKit-Hilfsprozesse nicht gefunden"; exit 1; }

echo "== AppRun, Desktop-Datei, Icon"
cat > "$APPDIR/AppRun" <<'EOF'
#!/usr/bin/env bash
HERE="$(dirname "$(readlink -f "$0")")"
export APPDIR="${APPDIR:-$HERE}"
for hook in "$APPDIR"/apprun-hooks/*.sh; do
    [ -f "$hook" ] && . "$hook"
done
export LD_LIBRARY_PATH="$APPDIR/usr/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
# Medien braucht der Editor nicht; GStreamer-Plugins des Systems passen
# nicht zur mitgebrachten GStreamer-Version.
export GST_PLUGIN_SYSTEM_PATH_1_0=""
export GST_REGISTRY_1_0="${XDG_CACHE_HOME:-$HOME/.cache}/ibd-editor/gstreamer-registry.bin"
# DMA-BUF-Renderer fuehrt mit manchen Treibern zu leeren Fenstern
export WEBKIT_DISABLE_DMABUF_RENDERER="${WEBKIT_DISABLE_DMABUF_RENDERER:-1}"
# libwebkit2gtk sucht ihre Hilfsprozesse unter ././lib/... (s. build_appimage.sh)
cd "$APPDIR/usr" || exit 1
exec "$APPDIR/usr/lib/ibd-editor/IBD-Editor" "$@"
EOF
chmod +x "$APPDIR/AppRun"

cat > "$APPDIR/ibd-editor.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=IBD Editor
Comment=Informations-Blockdiagramme erstellen
Exec=IBD-Editor
Icon=ibd-editor
Categories=Education;Development;
Terminal=false
EOF
cp assets/icon.png "$APPDIR/ibd-editor.png"
ln -sf ibd-editor.png "$APPDIR/.DirIcon"

echo "== AppImage packen"
mkdir -p "$(dirname "$OUT")"
appimagetool --no-appstream "$APPDIR" "$OUT"
ls -lh "$OUT"
