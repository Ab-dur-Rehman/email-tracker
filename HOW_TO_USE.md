# Email Tracker - How to Use

## Gmail Integration

The Email Tracker extension automatically integrates with Gmail. Here's how to use it:

### Getting Started

1. **Install the Extension**: Make sure the extension is properly installed in your browser.

2. **Visit Gmail**: Go to [Gmail](https://mail.google.com) in your browser.

3. **Connect Gmail**: Click the Email Tracker toolbar icon, then click **Connect** under Gmail Account. This uses Chrome's Google sign-in flow.

4. **Automatic Integration**: After connection, the extension automatically integrates with Gmail.

> Developer note: before Gmail connection works, replace the placeholder `oauth2.client_id` in `extension/manifest.json` with a Google Cloud OAuth client ID for this Chrome extension.

### Multiple Gmail Accounts

Open every Gmail account you want to track in Chrome first, for example:

```text
https://mail.google.com/mail/u/0
https://mail.google.com/mail/u/1
```

Then open the extension popup and use:

- **Connect Google Account**: connects the current Chrome/Google identity account through OAuth.
- **Add Current Gmail Tab**: adds the currently active Gmail tab.
- **Scan Open Gmail Tabs**: finds and adds all open Gmail tabs.

After adding accounts, reload Gmail tabs once so the content script can attach to each account's compose window.

### Composing Tracked Emails

1. **Compose a New Email**: Click on the "Compose" button in Gmail.

2. **Check Tracking Status**: Look for the tracking indicator in the compose window toolbar:
   - **Green "Tracking ON"**: Your email will be tracked when sent
   - **Red "Tracking OFF"**: Tracking is disabled

3. **Toggle Tracking**: Click on the tracking indicator to turn tracking on or off for the current email.

4. **Send Your Email**: When you send an email with tracking enabled, a tracking pixel is automatically inserted.

### Viewing Tracking Data

1. **Extension Popup**: Click on the Email Tracker icon in your browser toolbar to see recent tracking activity.

2. **Dashboard**: For detailed analytics, click "Full Dashboard" in the popup to open the tracking dashboard.

3. **Email Details**: In the dashboard, click on any email to see detailed information about opens and link clicks.

### Troubleshooting

If tracking doesn't seem to be working:

1. **Check Extension Status**: Make sure the extension is enabled in your browser.

2. **Verify Tracking Setting**: Check that tracking is enabled in both the extension popup and options page.

3. **Look for Visual Indicator**: When composing an email in Gmail, you should see the tracking indicator in the toolbar.

4. **Refresh Gmail**: Sometimes you may need to refresh Gmail for the extension to properly integrate.

5. **Check Browser Permissions**: Ensure the extension has permission to access Gmail.

## Settings and Configuration

To access settings:

1. Click on the Email Tracker icon in your browser toolbar.
2. Click on the gear icon or "Settings" link.
3. Alternatively, go to the dashboard and click "Settings" in the footer.

Key settings include:

- **Enable Email Tracking**: Master toggle for all tracking functionality
- **Automatic Tracking**: Add tracking to all outgoing emails automatically
- **Track Link Clicks**: Enable/disable tracking of link clicks in emails
- **Notification Settings**: Configure how you're notified of email opens and link clicks

## Production Caveats

Email open tracking is based on a remote image loading. It can be blocked by mail clients, inflated by security scanners, or proxied by providers like Gmail and Apple Mail. Treat opens as a signal, not a guaranteed human read receipt.

The tracking backend must be deployed on a public HTTPS URL because recipients load the tracking image from outside your browser. The extension currently points to:

```text
https://email-tracker-virid.vercel.app
```

If you deploy your own backend, update `window.CONFIG.API_ENDPOINT` in `extension/content/shared-config.js` and `CONFIG.API_ENDPOINT` in `extension/background/service-worker.js`, then reload the extension. For reliable production tracking, replace the server's in-memory storage with a database; serverless memory can reset between requests.

### Backend Database Setup

The backend now supports Postgres persistence through `DATABASE_URL`.

1. Create a hosted Postgres database, for example Vercel Postgres, Neon, Supabase, or Railway.
2. Copy its connection string.
3. Set this environment variable on your backend deployment:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
```

4. Redeploy the backend.
5. Check:

```text
https://YOUR_BACKEND_DOMAIN/health
```

Expected response:

```json
{
  "success": true,
  "storage": "postgres"
}
```

If `DATABASE_URL` is not set, the backend falls back to memory mode for local development, but open events may disappear on serverless deployments.

## Engagement Status Model

The app now reports confidence-based engagement states instead of claiming a guaranteed human read:

- **Sent**: no tracking signal has been recorded yet.
- **Image Loaded**: the hidden tracking image loaded, but this may be a mail client, proxy, or scanner.
- **Likely Opened**: the image-load signal looks more like a normal open.
- **Possible Bot/Proxy**: timing or user-agent signals look automated.
- **Likely Human Engaged**: a tracked link click or stronger engagement signal was recorded.

Use **Likely Human Engaged** as the strongest signal. A true “read by human” state requires an explicit human action such as a reply, confirmation click, form submission, booking, or approval.
