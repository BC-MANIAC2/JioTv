# The Ultimate Step-by-Step JioTV Proxy Installation Guide
**(Specifically for Xiaomi Magic 4K QLED Android TV)**

*Note: This guide is written for absolute beginners. You do not need to know any programming. Just read each step carefully and follow along!*

---

## 📺 Step 1: Prepare Your TV
First, we need to install an app on your TV that lets us download files from the internet.

1. Turn on your Xiaomi TV and take your TV remote.
2. Go to the **Google Play Store** (usually on the Home Screen or in the 'Apps' tab).
3. Go to the Search icon (the magnifying glass) at the top.
4. Search for an app called **Downloader** (it has an orange icon and says "by AFTVnews").
5. Click **Install** and wait for it to finish.
6. Click **Open** to launch the Downloader app. 
7. A prompt will appear asking to allow access to photos, media, and files. Click **Allow**.

## 📱 Step 2: Prepare Your Smartphone (The "Magic Keyboard")
Typing long commands with a TV remote is painful. We will turn your smartphone into a wireless keyboard for your TV!

1. Take your smartphone (Android or iPhone). Make sure it is connected to the **exact same Wi-Fi network** as your TV.
2. Open the App Store or Play Store on your phone.
3. Search for and install the **Google TV** app.
4. Open the Google TV app. Near the bottom right, tap the **"TV Remote"** button.
5. It will scan for your TV. Tap on your Xiaomi TV's name when it appears.
6. A code will pop up on your TV screen. Type that code into your phone to pair them.
7. Excellent! Keep the app open. You can now use your phone's keyboard to type on the TV!

## 📥 Step 3: Install Termux on Your TV
Termux is a "terminal" app where our server will live. It's not in the regular Play Store, so we will download it using Downloader.

1. Grab your TV remote and look at the **Downloader** app that is currently open on your TV.
2. You will see a box that says `Enter a URL or Search Term`. Click on it.
3. Use your **Google TV phone app** to type exactly this (all lowercase, no spaces):
   `https://f-droid.org/repo/com.termux_118.apk`
4. Press **Go** or **Enter**. 
5. A loading bar will appear as it downloads the file. 
6. Once downloaded, a popup will appear. Click **Install**.
   *(Note: If your TV says "For your security, your TV is not allowed to install unknown apps", click **Settings**, find **Downloader** in the list, and turn the switch **ON**. Then press the Back button on your remote and click Install again).*
7. Once installed, click **Open**. You will see a scary-looking black screen with white text. Don't worry, this is Termux!

## 🪄 Step 4: The Magic Commands
We are now going to tell Termux to download and run our JioTV server. 

Look at your phone (the Google TV app). You will use it to type these magic words into the black screen on your TV. **Press Enter (the return key on your phone keyboard) after every single line!**

**Command 1: Install the required software tools**
*Type this exactly as shown and press Enter:*
```bash
pkg update -y && pkg install nodejs git -y
```
*(Wait 1-2 minutes for this to finish. You will see lots of text scrolling by. It's done when the scrolling stops and you see a `$` symbol).*

**Command 2: Download your custom JioTV code**
*Type this exactly as shown and press Enter:*
```bash
git clone https://github.com/BC-MANIAC2/JioTv.git
```
*(This downloads the code from your GitHub repository directly to the TV!)*

**Command 3: Go into the server folder**
*Type this and press Enter:*
```bash
cd JioTv/node-server
```

**Command 4: Install the final pieces**
*Type this and press Enter:*
```bash
npm install
```
*(Wait a few seconds for it to finish).*

**Command 5: Turn on the Server!**
*Type this and press Enter:*
```bash
node server.js
```
*(If you see the text "Server running on port 3000" appear, **YOU DID IT!** The hardest part is over).*

---

## 🍿 Step 5: Login and Watch!
Your server is now permanently running in the background of your TV. 

1. Press the **Home** button on your TV remote to leave the black screen. (The server will stay running secretly in the background!).
2. Go back to the **Google Play Store** on your TV.
3. Search for and install a TV web browser (we recommend **JioPages** or **TV Bro**).
4. Open the browser and go to the URL bar.
5. Type in exactly this address and press Go:
   `http://localhost:3000`
6. You will see the beautiful JioTV Proxy website! 
7. Click the **"Login with Jio"** button in the top right corner.
8. Enter your Jio phone number that has the Rs. 55 plan activated, and enter the OTP you receive on your phone.
9. **You are done!** Click on Asianet Movies HD or any other channel and enjoy crystal clear, uninterrupted streaming directly on your TV.

> **💡 Pro Tip for the Future:**
> If you ever restart your TV or turn it off at the wall plug, the server will stop. To start it again, just open the **Termux** app on your TV and type this single command:
> `cd JioTv/node-server && node server.js`