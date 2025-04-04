# Email Tracker Deployment Summary

This is a quick reference guide for deploying your Email Tracker extension. For detailed instructions, please refer to the full DEPLOYMENT_GUIDE.md file.

## Quick Start Guide

### Extension Deployment

1. **Developer Mode (Quick Testing)**
   - Go to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked" → select `extension` folder

2. **Chrome Web Store (Distribution)**
   - Zip the `extension` folder contents
   - Upload to Chrome Web Store Developer Dashboard

### Server Deployment Options (Free)

1. **Render**
   - Sign up at [render.com](https://render.com/)
   - Create a Web Service pointing to your `server` directory
   - Build command: `npm install`
   - Start command: `node server.js`

2. **Vercel**
   - Sign up at [vercel.com](https://vercel.com/)
   - Install CLI: `npm i -g vercel`
   - Run `vercel` in server directory

3. **Heroku**
   - Create account at [heroku.com](https://heroku.com/)
   - Deploy using Heroku CLI

### Update Extension Configuration

After deploying your server:

1. Update `API_ENDPOINT` in `background/service-worker.js`
2. Update pixel and link URLs in `content/gmail-integration.js`
3. Reload the extension

### Gmail Integration

- Extension automatically integrates with Gmail compose window
- No additional configuration needed for Gmail

### Testing

1. Send a test email to yourself
2. Open the email and check your extension dashboard
3. Verify tracking is working

Refer to the full deployment guide for troubleshooting and detailed instructions.