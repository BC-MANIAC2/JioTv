#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
#   JioTV SD Card File Transfer Helper
#   Run this to copy JioTv files from SD card to PHP root
# ============================================================

DEST="$HOME/jiotv"
mkdir -p "$DEST"

echo "🔍 Searching for JioTv files on your phone..."

FOUND=0

# Common locations where user might have saved the files
SEARCH_PATHS=(
    "/sdcard/JioTv"
    "/sdcard/Download/JioTv"
    "/sdcard/Downloads/JioTv"
    "/sdcard/JioTv-main"
    "/sdcard/Download/JioTv-main"
    "/sdcard/Downloads/JioTv-main"
    "/storage/emulated/0/JioTv"
    "/storage/emulated/0/Download/JioTv"
    "/storage/emulated/0/Downloads/JioTv"
)

for PATH_CHECK in "${SEARCH_PATHS[@]}"; do
    if [ -d "$PATH_CHECK" ]; then
        echo "✅ Found at: $PATH_CHECK"
        cp -r "$PATH_CHECK/." "$DEST/"
        FOUND=1
        break
    fi
done

if [ "$FOUND" -eq 0 ]; then
    echo "⚠ Not found automatically."
    echo ""
    echo "Please manually copy your files:"
    echo "  cp -r /sdcard/YOUR_JIOTV_FOLDER/. ~/jiotv/"
    echo ""
    echo "Or extract the ZIP:"
    echo "  unzip /sdcard/Download/JioTv-main.zip -d ~/jiotv/"
else
    echo ""
    echo "✅ Files copied to $DEST"
    echo ""
    ls "$DEST"
fi
