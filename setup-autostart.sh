#!/data/data/com.termux/files/usr/bin/bash

# Setup Termux:Boot for JioTV

echo "Setting up JioTV Auto-Start..."

# Create the boot directory
mkdir -p ~/.termux/boot

# Create the boot script
cat << 'EOF' > ~/.termux/boot/start-jiotv.sh
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
cd ~/JioTv/node-server
# Run with max 128MB RAM and silence logs to save disk space
node --max-old-space-size=128 server.js > /dev/null 2>&1 &
EOF

# Make it executable
chmod +x ~/.termux/boot/start-jiotv.sh

echo "Done! The auto-start script has been created."
echo "Make sure you have installed the 'Termux:Boot' app and opened it at least once!"
