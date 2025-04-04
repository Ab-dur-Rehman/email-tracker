# Email Tracker Deployment Guide

This guide will help you deploy the Email Tracker extension for free and use it with Gmail.

## Table of Contents

1. [Extension Deployment](#extension-deployment)
2. [Server Deployment](#server-deployment)
3. [Gmail Integration](#gmail-integration)
4. [Testing Your Setup](#testing-your-setup)
5. [Troubleshooting](#troubleshooting)

## Extension Deployment

### Option 1: Load as Developer Extension (Recommended for Testing)

1. Open Chrome or Edge browser
2. Navigate to `chrome://extensions` (Chrome) or `edge://extensions` (Edge)
3. Enable "Developer mode" using the toggle in the top-right corner
4. Click "Load unpacked" and select the `extension` folder from your project
5. The Email Tracker extension should now appear in your extensions list

### Option 2: Package for Chrome Web Store (For Distribution)

1. Zip the contents of the `extension` folder (not the folder itself)
2. Create a developer account at the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
3. Pay the one-time $5 registration fee
4. Click "New Item" and upload your zip file
5. Fill in the required information (name, description, screenshots, etc.)
6. Submit for review (this can take a few days)

## Server Deployment

### Option 1: Deploy to Render (Free Tier)

[Render](https://render.com/) offers a free tier for web services that's perfect for this project.

1. Sign up for a free Render account
2. Connect your GitHub/GitLab account or upload your code
3. Create a new Web Service
4. Select the `server` directory as your root directory
5. Set the build command: `npm install`
6. Set the start command: `node server.js`
7. Choose the free plan
8. Click "Create Web Service"

### Option 2: Deploy to Heroku (Free with Limitations)

1. Sign up for a [Heroku](https://www.heroku.com/) account
2. Install the [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)
3. Navigate to your server directory in the terminal
4. Run the following commands:

```bash
heroku login
git init
heroku create your-email-tracker-server
git add .
git commit -m "Initial commit"
git push heroku master
```

### Option 3: Deploy to Vercel (Free Tier)

1. Sign up for a [Vercel](https://vercel.com/) account
2. Install the Vercel CLI: `npm i -g vercel`
3. Navigate to your server directory in the terminal
4. Run `vercel` and follow the prompts
5. Choose the free plan when prompted

## Update Extension Configuration

After deploying your server, you need to update the extension to use your server URL:

1. Open `extension/background/service-worker.js`
2. Find the `CONFIG` object (around line 15)
3. Update the `API_ENDPOINT` to your deployed server URL:

```javascript
const CONFIG = {
  API_ENDPOINT: 'https://your-deployed-server-url.com', // Replace with your server URL
  TRACKING_PIXEL_PATH: '/pixel',
  LINK_TRACKING_PATH: '/link',
  SYNC_INTERVAL: 5 * 60 * 1000, // 5 minutes
};
```

4. Similarly, update the pixel URL in `extension/content/gmail-integration.js` (around line 260):

```javascript
const pixelUrl = `https://your-deployed-server-url.com/pixel/${trackingId}`;
```

5. And update the tracked URL in the same file (around line 285):

```javascript
const trackedUrl = `https://your-deployed-server-url.com/link/${trackingId}/${linkId}?url=${encodeURIComponent(originalUrl)}`;
```

6. Reload the extension in your browser

## Gmail Integration

The extension is already configured to work with Gmail through content scripts. Here's how to ensure it works properly:

1. Make sure the extension is installed and enabled in your browser
2. Log in to your Gmail account
3. The extension will automatically integrate with Gmail's compose window
4. When you compose a new email, the extension will insert a tracking pixel before sending

### Gmail Permissions

The extension requires certain permissions to work with Gmail:

- `*://mail.google.com/*` host permission (already in manifest.json)
- `storage` permission for saving settings
- `webNavigation` and `webRequest` for monitoring email-related activities

These permissions are already configured in the manifest.json file.

## Testing Your Setup

1. Open Gmail and compose a new email
2. Send the email to yourself or a test account
3. Open the received email
4. Check your extension's dashboard to verify that the open was tracked
5. Click any links in the email to verify click tracking

## Troubleshooting

### Extension Not Tracking Emails

1. Check that the extension is enabled
2. Verify that tracking is turned on in the extension popup
3. Ensure your server is running and accessible
4. Check the browser console for any error messages

### Server Connection Issues

1. Verify your server URL is correct in the extension configuration
2. Check if your free hosting service has gone to sleep (some free tiers sleep after inactivity)
3. Test your server endpoint directly by visiting `https://your-server-url.com/pixel/test`

### Gmail Integration Problems

1. Make sure you're using the web version of Gmail (not the mobile app)
2. Try disabling other Gmail-related extensions that might conflict
3. Check if Gmail's interface has changed, which might break the selectors

## Limitations of Free Hosting

- **Sleep/Idle Time**: Most free hosting services put your app to sleep after periods of inactivity
- **Limited Resources**: Free tiers often have CPU and memory constraints
- **Bandwidth Caps**: There may be monthly limits on data transfer
- **No Custom Domains**: You might be stuck with the hosting provider's subdomain

For a more reliable setup, consider upgrading to a paid tier once your tracking needs increase.

## Privacy and Legal Considerations

Before using email tracking in production:

1. Ensure compliance with privacy laws (GDPR, CCPA, etc.)
2. Consider adding a privacy policy
3. Be transparent with recipients about tracking

---

Happy tracking! If you encounter any issues, check the console logs or refer to the extension's source code for debugging.