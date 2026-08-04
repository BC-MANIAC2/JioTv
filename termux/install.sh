#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
#   JioTV Quick Install — Run this ONE command in Termux:
#   curl -sL https://raw.githubusercontent.com/BC-MANIAC2/JioTv/main/termux/setup.sh | bash
# ============================================================
# This is the ENTRY POINT — downloads setup.sh and runs it
# Usage inside Termux: bash <(curl -sL YOUR_RAW_URL/termux/setup.sh)
exec bash -c "$(curl -fsSL https://raw.githubusercontent.com/Jitendraunatti/JioTv/main/termux/setup.sh)"
