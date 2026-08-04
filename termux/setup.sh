#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
#   JioTV Termux Auto-Setup Script
#   Free | Indian IP | 24/7 | Auto-sends URL to friend
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

clear
echo -e "${CYAN}${BOLD}"
echo "  +------------------------------------------+"
echo "  |     JioTV Auto-Hosting Setup             |"
echo "  |  Auto-sends URL to friend via Telegram   |"
echo "  +------------------------------------------+"
echo -e "${NC}"
sleep 1

# Step 1: Update packages
echo -e "${YELLOW}[1/8] Updating Termux packages...${NC}"
pkg update -y && pkg upgrade -y
echo -e "${GREEN}Done${NC}\n"

# Step 2: Install tools
echo -e "${YELLOW}[2/8] Installing php, wget, curl, qrencode, termux-api...${NC}"
pkg install -y php wget curl qrencode termux-api iproute2
echo -e "${GREEN}Done${NC}\n"

# Step 3: Download cloudflared
echo -e "${YELLOW}[3/8] Downloading Cloudflare Tunnel...${NC}"
ARCH=$(uname -m)
if [ "$ARCH" = "aarch64" ]; then
    CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
elif [ "$ARCH" = "armv7l" ]; then
    CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm"
else
    CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
fi
wget -q --show-progress -O "$PREFIX/bin/cloudflared" "$CF_URL"
chmod +x "$PREFIX/bin/cloudflared"
echo -e "${GREEN}cloudflared ready${NC}\n"

# Step 4: Setup web root and copy JioTv files
echo -e "${YELLOW}[4/8] Setting up JioTV web root...${NC}"
JIOTV_DIR="$HOME/jiotv"
mkdir -p "$JIOTV_DIR"

FOUND=0
for SEARCH in "/sdcard/JioTv" "/sdcard/Download/JioTv" "/sdcard/Downloads/JioTv" \
              "/sdcard/JioTv-main" "/sdcard/Download/JioTv-main" "/storage/emulated/0/JioTv"; do
    if [ -d "$SEARCH" ]; then
        echo "  Copying from: $SEARCH"
        cp -r "$SEARCH/." "$JIOTV_DIR/"
        FOUND=1
        echo -e "${GREEN}  Files copied${NC}"
        break
    fi
done
[ "$FOUND" -eq 0 ] && echo -e "${YELLOW}  JioTv files not found. Copy them to ~/jiotv/ manually.${NC}"
echo ""

# Step 5: Configure Telegram notifications
echo -e "${YELLOW}[5/8] Setting up Telegram notifications for your friend...${NC}"
CONFIG_FILE="$HOME/.jiotv_config"

echo ""
echo -e "${CYAN}Your friend needs to receive the JioTV URL on Telegram."
echo "This requires a free Telegram Bot (created by you in 1 minute)."
echo ""
echo "Steps to get your Bot Token:"
echo "  1. Open Telegram -> search @BotFather"
echo "  2. Send: /newbot"
echo "  3. Give it any name (e.g. MyJioTV)"
echo "  4. BotFather gives you a token like: 7123456789:AAFxxx..."
echo ""
echo -e "Enter your Telegram Bot Token (or press ENTER to skip):${NC}"
read -r BOT_TOKEN

if [ -n "$BOT_TOKEN" ]; then
    echo ""
    echo -e "${CYAN}Now enter your friend's Telegram Chat ID."
    echo "Your friend should open Telegram -> search @userinfobot -> tap START."
    echo "It will reply with their Chat ID (a number like 987654321)."
    echo ""
    echo -e "Enter your friend's Telegram Chat ID:${NC}"
    read -r CHAT_ID

    if [ -n "$CHAT_ID" ]; then
        # Verify the token works
        echo -e "${YELLOW}Verifying Telegram bot...${NC}"
        TEST=$(curl -sf "https://api.telegram.org/bot${BOT_TOKEN}/getMe" 2>/dev/null)
        if echo "$TEST" | grep -q '"ok":true'; then
            BOT_NAME=$(echo "$TEST" | grep -oP '"username":"\K[^"]+')
            echo -e "${GREEN}Bot verified! Bot: @${BOT_NAME}${NC}"
            # Save config
            cat > "$CONFIG_FILE" << CONF
TELEGRAM_BOT_TOKEN="${BOT_TOKEN}"
TELEGRAM_CHAT_ID="${CHAT_ID}"
CONF
            chmod 600 "$CONFIG_FILE"
            echo -e "${GREEN}Config saved to $CONFIG_FILE${NC}\n"

            # Test send
            echo -e "${YELLOW}Sending test message to your friend...${NC}"
            curl -sf "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
                -d "chat_id=${CHAT_ID}" \
                -d "text=JioTV bot connected! Your friend will send you the streaming URL here when the server starts." \
                -d "parse_mode=HTML" > /dev/null
            echo -e "${GREEN}Test message sent! Ask your friend to check Telegram.${NC}\n"
        else
            echo -e "${RED}Bot token invalid. Skipping Telegram setup.${NC}"
            echo "You can set it up later by editing: $CONFIG_FILE"
        fi
    else
        echo -e "${YELLOW}Skipped Telegram setup.${NC}"
    fi
else
    echo -e "${YELLOW}Skipped Telegram setup. You can add it later by editing $CONFIG_FILE${NC}"
    echo ""
fi

# Step 6: Create the main start script
echo -e "${YELLOW}[6/8] Creating start script...${NC}"
cat > "$HOME/start-jiotv.sh" << 'STARTSCRIPT'
#!/data/data/com.termux/files/usr/bin/bash
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

CONFIG_FILE="$HOME/.jiotv_config"
JIOTV_DIR="$HOME/jiotv"
PHP_PORT=8080
LOG_CF="$HOME/.cloudflared.log"
LOG_PHP="$HOME/.php-server.log"
PID_CF="$HOME/.cloudflared.pid"
PID_PHP="$HOME/.php-server.pid"

# Load config
[ -f "$CONFIG_FILE" ] && source "$CONFIG_FILE"

# Wakelock
termux-wake-lock 2>/dev/null
echo -e "${GREEN}Wakelock acquired${NC}"

# Kill old processes
[ -f "$PID_PHP" ] && kill "$(cat "$PID_PHP")" 2>/dev/null
[ -f "$PID_CF"  ] && kill "$(cat "$PID_CF")"  2>/dev/null
rm -f "$LOG_CF" "$LOG_PHP" "$HOME/.jiotv_url" "$HOME/.jiotv_local_url"

clear
echo -e "${CYAN}${BOLD}"
echo "  +------------------------------------------+"
echo "  |   JioTV Server Starting...               |"
echo "  +------------------------------------------+"
echo -e "${NC}"

# Detect local IP
LOCAL_IP=$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K[\d.]+')
[ -z "$LOCAL_IP" ] && LOCAL_IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet )[\d.]+')
[ -z "$LOCAL_IP" ] && LOCAL_IP=$(ip -4 addr 2>/dev/null | grep -oP '(?<=inet )[\d.]+' | grep -v '^127\.' | head -1)

# Start PHP server
echo -e "${YELLOW}Starting PHP server on port $PHP_PORT...${NC}"
php -S "0.0.0.0:$PHP_PORT" -t "$JIOTV_DIR" >> "$LOG_PHP" 2>&1 &
echo $! > "$PID_PHP"
sleep 2

if kill -0 "$(cat "$PID_PHP")" 2>/dev/null; then
    echo -e "${GREEN}PHP server running${NC}"
else
    echo -e "${RED}PHP server failed! See: $LOG_PHP${NC}"
    exit 1
fi

# Start Cloudflare tunnel
echo -e "${YELLOW}Starting Cloudflare Tunnel...${NC}"
cloudflared tunnel --url "http://localhost:$PHP_PORT" \
    --no-autoupdate \
    --loglevel warn \
    >> "$LOG_CF" 2>&1 &
echo $! > "$PID_CF"

# Wait for public URL
echo -ne "${YELLOW}Getting public URL"
for i in $(seq 1 40); do
    echo -n "."
    URL=$(grep -oP 'https://[a-zA-Z0-9\-]+\.trycloudflare\.com' "$LOG_CF" 2>/dev/null | tail -1)
    [ -n "$URL" ] && break
    sleep 2
done
echo ""

[ -n "$URL" ]       && echo "$URL" > "$HOME/.jiotv_url"
[ -n "$LOCAL_IP" ]  && echo "http://${LOCAL_IP}:${PHP_PORT}" > "$HOME/.jiotv_local_url"

# Display
echo ""
echo -e "${GREEN}${BOLD}+============================================================+${NC}"
echo -e "${GREEN}${BOLD}|  JioTV is LIVE!                                            |${NC}"
echo -e "${GREEN}${BOLD}+============================================================+${NC}"
echo ""

if [ -n "$LOCAL_IP" ]; then
    echo -e "${YELLOW}  [LOCAL - Same WiFi as you]:${NC}"
    echo -e "${CYAN}  http://${LOCAL_IP}:${PHP_PORT}/jitendraunatti.php${NC}"
    echo ""
fi

if [ -n "$URL" ]; then
    echo -e "${YELLOW}  [PUBLIC - Friend's TV / Anywhere]:${NC}"
    echo -e "${CYAN}  ${URL}/jitendraunatti.php${NC}"
    echo ""
    echo -e "${YELLOW}  Playlist URL (TiviMate / OTT Navigator):${NC}"
    echo -e "${CYAN}  ${URL}/playlist.php${NC}"
    echo ""
fi
echo -e "${GREEN}${BOLD}+============================================================+${NC}"
echo ""

# Show QR code for friend to scan
if [ -n "$URL" ] && command -v qrencode &>/dev/null; then
    echo -e "${YELLOW}  QR Code (friend can scan with TV or phone camera):${NC}"
    qrencode -t UTF8 "${URL}/jitendraunatti.php"
    echo ""
fi

# Send to friend via Telegram
if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ] && [ -n "$URL" ]; then
    echo -e "${YELLOW}  Sending URL to friend via Telegram...${NC}"

    MSG="JioTV is LIVE!

Open this link in your TV browser:
${URL}/jitendraunatti.php

Playlist (for TiviMate / OTT Navigator):
${URL}/playlist.php

Login with your Jio number and OTP."

    RESULT=$(curl -sf "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
        --data-urlencode "text=${MSG}" \
        -d "parse_mode=HTML" 2>/dev/null)

    if echo "$RESULT" | grep -q '"ok":true'; then
        echo -e "${GREEN}  URL sent to your friend on Telegram!${NC}"
    else
        echo -e "${RED}  Telegram send failed. Check your bot token and chat ID.${NC}"
    fi
    echo ""
fi

# Phone notification
if [ -n "$URL" ]; then
    termux-notification \
        --title "JioTV LIVE - Sent to Friend!" \
        --content "$URL" \
        --id 42 \
        --priority high \
        --button1 "Copy Public URL" \
        --button1-action "termux-clipboard-set ${URL}/jitendraunatti.php" \
        2>/dev/null
fi

echo -e "${YELLOW}  Press Ctrl+C to stop the server${NC}"
echo ""

# Keep alive — re-notify if URL changes
while true; do
    NEW_URL=$(grep -oP 'https://[a-zA-Z0-9\-]+\.trycloudflare\.com' "$LOG_CF" 2>/dev/null | tail -1)
    if [ -n "$NEW_URL" ] && [ "$NEW_URL" != "$URL" ]; then
        URL="$NEW_URL"
        echo "$URL" > "$HOME/.jiotv_url"
        echo -e "${CYAN}[URL Changed] Sending new URL to friend...${NC}"

        if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
            MSG2="JioTV URL updated!

New link: ${URL}/jitendraunatti.php
Playlist: ${URL}/playlist.php"

            curl -sf "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
                --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
                --data-urlencode "text=${MSG2}" > /dev/null 2>&1
            echo -e "${GREEN}Friend notified with new URL.${NC}"
        fi
    fi
    sleep 15
done
STARTSCRIPT
chmod +x "$HOME/start-jiotv.sh"
echo -e "${GREEN}Start script ready${NC}\n"

# Step 7: Stop script + URL helper
echo -e "${YELLOW}[7/8] Creating stop and helper scripts...${NC}"

cat > "$HOME/stop-jiotv.sh" << 'STOP'
#!/data/data/com.termux/files/usr/bin/bash
echo "Stopping JioTV..."
[ -f "$HOME/.php-server.pid" ]   && kill "$(cat "$HOME/.php-server.pid")"   2>/dev/null && echo "PHP server stopped"
[ -f "$HOME/.cloudflared.pid" ]  && kill "$(cat "$HOME/.cloudflared.pid")"  2>/dev/null && echo "Tunnel stopped"
termux-wake-unlock 2>/dev/null
rm -f "$HOME/.php-server.pid" "$HOME/.cloudflared.pid" "$HOME/.jiotv_url" "$HOME/.jiotv_local_url"
termux-notification-remove 42 2>/dev/null
echo "Done."
STOP
chmod +x "$HOME/stop-jiotv.sh"

cat > "$HOME/jiotv-url.sh" << 'URLCHECK'
#!/data/data/com.termux/files/usr/bin/bash
CONFIG_FILE="$HOME/.jiotv_config"
[ -f "$CONFIG_FILE" ] && source "$CONFIG_FILE"

echo ""
if [ -f "$HOME/.jiotv_url" ]; then
    URL=$(cat "$HOME/.jiotv_url")
    echo "  [PUBLIC - Friend's TV]:"
    echo "  $URL/jitendraunatti.php"
    echo ""
    echo "  Playlist: $URL/playlist.php"
    termux-clipboard-set "$URL/jitendraunatti.php" 2>/dev/null && echo "  (Copied to clipboard)"

    # Re-send to Telegram on demand
    if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
        echo ""
        echo -n "  Resend URL to friend on Telegram? (y/n): "
        read -r RESEND
        if [ "$RESEND" = "y" ]; then
            curl -sf "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
                --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
                --data-urlencode "text=JioTV link: ${URL}/jitendraunatti.php" > /dev/null 2>&1
            echo "  Sent!"
        fi
    fi
else
    echo "  JioTV not running. Start with: ~/start-jiotv.sh"
fi
echo ""
URLCHECK
chmod +x "$HOME/jiotv-url.sh"

# Telegram config update script
cat > "$HOME/jiotv-setup-telegram.sh" << 'TGSETUP'
#!/data/data/com.termux/files/usr/bin/bash
CONFIG_FILE="$HOME/.jiotv_config"
echo ""
echo "Telegram Bot Setup"
echo "------------------"
echo "1. Open Telegram -> @BotFather -> /newbot -> get token"
echo "2. Friend opens @userinfobot -> gets their Chat ID"
echo ""
echo -n "Enter Bot Token: "
read -r BOT_TOKEN
echo -n "Enter Friend's Chat ID: "
read -r CHAT_ID

cat > "$CONFIG_FILE" << CONF
TELEGRAM_BOT_TOKEN="${BOT_TOKEN}"
TELEGRAM_CHAT_ID="${CHAT_ID}"
CONF
chmod 600 "$CONFIG_FILE"

# Test
TEST=$(curl -sf "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${CHAT_ID}" \
    --data-urlencode "text=JioTV bot connected! You will receive the JioTV URL here." 2>/dev/null)

if echo "$TEST" | grep -q '"ok":true'; then
    echo ""
    echo "Success! Test message sent to friend."
else
    echo ""
    echo "Failed. Check your token and chat ID."
fi
TGSETUP
chmod +x "$HOME/jiotv-setup-telegram.sh"

echo -e "${GREEN}Scripts created${NC}\n"

# Step 8: Boot auto-start
echo -e "${YELLOW}[8/8] Setting up auto-start on reboot...${NC}"
mkdir -p "$HOME/.termux/boot"
cat > "$HOME/.termux/boot/jiotv-autostart.sh" << 'BOOT'
#!/data/data/com.termux/files/usr/bin/bash
sleep 20
termux-wake-lock
"$HOME/start-jiotv.sh" >> "$HOME/.boot.log" 2>&1 &
BOOT
chmod +x "$HOME/.termux/boot/jiotv-autostart.sh"
echo -e "${GREEN}Auto-start installed${NC}\n"

# Done
echo ""
echo -e "${GREEN}${BOLD}"
echo "+=========================================================+"
echo "  SETUP COMPLETE!"
echo "+---------------------------------------------------------+"
echo ""
echo "  FILES:    ~/jiotv/"
echo "  START:    ~/start-jiotv.sh"
echo "  STOP:     ~/stop-jiotv.sh"
echo "  GET URL:  ~/jiotv-url.sh"
echo "  TELEGRAM: ~/jiotv-setup-telegram.sh  (if skipped above)"
echo ""
echo "  When you start the server:"
echo "  -> Public URL is printed"
echo "  -> QR code is shown"
echo "  -> URL auto-sent to friend on Telegram"
echo ""
echo "+=========================================================+"
echo -e "${NC}"
