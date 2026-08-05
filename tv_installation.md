# JioTV Proxy - TV Installation Guide (Xiaomi Magic 4K QLED)

This guide will walk you through setting up and running your custom Node.js JioTV Proxy natively on your Xiaomi Magic 4K QLED TV. By running the server on your TV's localhost, you bypass all datacenter blocks and get instant access to DRM channels!

## Prerequisites
Before you begin on the TV, ensure you have pushed your latest code to your GitHub repository so the TV can download it.

## Step 1: Install Termux on your Xiaomi TV
The Google Play Store on Android TVs does not natively show Termux. We will use the "Downloader" app to install it.

1. Turn on your Xiaomi TV and open the **Google Play Store**.
2. Search for and install an app called **Downloader** (by AFTVnews).
3. Open Downloader. It will ask for storage permissions; click **Allow**.
4. In the URL bar of Downloader, type this exact URL to download the Termux APK from F-Droid:
   https://f-droid.org/repo/com.termux_118.apk
5. Click **Go**. Once it finishes downloading, click **Install**.
   *Note: Your TV may ask you to "Allow installing unknown apps" for Downloader. If so, go to Settings, enable it, and press back to install.*

## Step 2: Set Up Remote Typing
Typing Linux commands using the Xiaomi TV remote is extremely tedious. 
1. Install the **Google TV** app on your smartphone (available for Android and iOS).
2. Pair the app with your Xiaomi TV on the same Wi-Fi network.
3. You can now use your smartphone's keyboard to effortlessly copy and paste commands into the Termux terminal on your TV! *(Alternatively, you can plug a USB mouse and keyboard into the back of your TV).*

## Step 3: Install Node.js & Git
1. Open the **Termux** app on your TV.
2. Use your phone's remote keyboard to type and run the following command to update the system and install Node.js:
   `ash
   pkg update -y && pkg install nodejs git -y
   `

## Step 4: Download Your Code
Now, we will download the code you pushed to GitHub directly onto the TV.
1. In Termux, type the following (replace with your actual GitHub username):
   `ash
   git clone https://github.com/your-username/JioTv.git
   `
2. Once the download is complete, navigate into the server folder:
   `ash
   cd JioTv/node-server
   `

## Step 5: Start the Server!
1. Install the required dependencies:
   `ash
   npm install
   `
2. Start the proxy server:
   `ash
   node server.js
   `
   *You should see "Server running on port 3000" on your TV screen.*

## Step 6: Login and Watch
1. Your proxy is now running on your TV's local network! 
2. Open a web browser on your TV (like JioPages or TV Bro) or any browser on your computer connected to the same Wi-Fi.
3. Go to: http://localhost:3000 (if using a TV browser) or http://<YOUR_TVS_IP_ADDRESS>:3000 (if using your computer).
4. Click **Login with Jio**, enter your number, and verify the OTP.
5. **Enjoy your Premium HD & DRM channels without ever needing your PC again!**

> **Tip:** You can press the "Home" button on your Xiaomi remote to exit Termux while the server continues running in the background. If you restart the TV, you will just need to open Termux and type cd JioTv/node-server && node server.js to start it again.