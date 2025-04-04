# Deploying Email Tracker on Vercel

This guide provides detailed step-by-step instructions for deploying the Email Tracker server component on Vercel's free tier.

## Prerequisites

- [Node.js](https://nodejs.org/) installed on your computer (version 14 or higher)
- [Git](https://git-scm.com/) installed on your computer
- A [GitHub](https://github.com/) account (recommended for easier deployment)
- A [Vercel](https://vercel.com/) account (free tier is sufficient)

## Step 1: Prepare Your Server Code

### Option A: If You're Using GitHub

1. Create a new GitHub repository for your project
2. Push your email tracker code to the repository
3. Make sure your server code is in the `server` directory

### Option B: If You're Deploying Directly

1. Make sure your server code is ready in the `server` directory
2. No additional preparation needed

## Step 2: Create a Vercel Account

1. Go to [Vercel's website](https://vercel.com/)
2. Click "Sign Up"
3. You can sign up with GitHub, GitLab, Bitbucket, or email
4. Complete the registration process

## Step 3: Prepare Your Server for Vercel

Vercel requires a specific project structure. Let's make sure your server is ready:

1. Navigate to your server directory:
   ```bash
   cd server
   ```

2. Create a `vercel.json` file in the server directory with the following content:
   ```json
   {
     "version": 2,
     "builds": [
       { "src": "server.js", "use": "@vercel/node" }
     ],
     "routes": [
       { "src": "/(.*)", "dest": "/server.js" }
     ]
   }
   ```

   This configuration tells Vercel how to build and route requests to your application.

## Step 4: Deploy to Vercel

### Option A: Deploy via Vercel CLI (Command Line)

1. Install the Vercel CLI globally:
   ```bash
   npm install -g vercel
   ```

2. Navigate to your server directory if you're not already there:
   ```bash
   cd server
   ```

3. Run the deployment command:
   ```bash
   vercel
   ```

4. If this is your first time using Vercel CLI, you'll be prompted to log in. Follow the instructions to complete the login process.

5. Answer the deployment questions:
   - Set up and deploy? **Yes**
   - Which scope? **Select your account**
   - Link to existing project? **No**
   - What's your project name? **email-tracker-server** (or any name you prefer)
   - In which directory is your code located? **./** (current directory)
   - Want to override settings? **No**

6. Wait for the deployment to complete. Vercel will provide you with deployment URLs:
   - Production URL (e.g., `https://email-tracker-server.vercel.app`)
   - You'll need this URL for configuring your extension

### Option B: Deploy via GitHub Integration (Recommended)

1. Log in to your [Vercel dashboard](https://vercel.com/dashboard)

2. Click "Add New" → "Project"

3. Import your GitHub repository:
   - Connect your GitHub account if you haven't already
   - Select the repository containing your email tracker code

4. Configure your project:
   - Framework Preset: **Other**
   - Root Directory: **server** (important: select the server directory)
   - Build Command: Leave as default or set to `npm install`
   - Output Directory: Leave empty
   - Install Command: Leave as default (`npm install`)

5. Click "Deploy"

6. Wait for the deployment to complete. Vercel will provide you with a production URL (e.g., `https://email-tracker-server.vercel.app`)

## Step 5: Update Your Extension Configuration

Now that your server is deployed, you need to update your extension to use the new server URL:

1. Open `extension/background/service-worker.js`

2. Find the `CONFIG` object (around line 15) and update the `API_ENDPOINT`:
   ```javascript
   const CONFIG = {
     API_ENDPOINT: 'https://your-vercel-deployment-url.vercel.app', // Replace with your Vercel URL
     TRACKING_PIXEL_PATH: '/pixel',
     LINK_TRACKING_PATH: '/link',
     SYNC_INTERVAL: 5 * 60 * 1000, // 5 minutes
   };
   ```

3. Similarly, update the pixel URL in `extension/content/gmail-integration.js` (around line 260):
   ```javascript
   const pixelUrl = `https://your-vercel-deployment-url.vercel.app/pixel/${trackingId}`;
   ```

4. And update the tracked URL in the same file (around line 285):
   ```javascript
   const trackedUrl = `https://your-vercel-deployment-url.vercel.app/link/${trackingId}/${linkId}?url=${encodeURIComponent(originalUrl)}`;
   ```

5. Reload your extension in the browser

## Step 6: Verify Your Deployment

1. Test your deployment by visiting your Vercel URL in a browser
   - Example: `https://your-vercel-deployment-url.vercel.app`
   - You should see a response (might be an error page, but that's expected since we're not accessing a specific endpoint)

2. Test a tracking pixel by visiting:
   - `https://your-vercel-deployment-url.vercel.app/pixel/test`
   - This should return a 1x1 transparent pixel

3. Send a test email with tracking enabled and verify that opens and clicks are being tracked

## Troubleshooting

### Deployment Fails

1. Check your `vercel.json` configuration
2. Ensure your `package.json` has the correct dependencies
3. Look at the build logs in your Vercel dashboard for specific errors

### API Endpoints Not Working

1. Make sure your routes in `vercel.json` are correctly configured
2. Check that your server code is properly handling the routes
3. Verify that your extension is using the correct URL

### Cold Starts

Vercel's free tier puts your serverless functions to sleep after periods of inactivity. This means the first request after inactivity might be slow. This is normal behavior for the free tier.

## Benefits of Vercel Deployment

- **Free Tier**: Generous free tier suitable for personal projects
- **No Server Management**: Fully managed infrastructure
- **Global CDN**: Fast response times worldwide
- **HTTPS by Default**: Secure connections out of the box
- **Easy Updates**: Simple redeployment process

## Limitations of Vercel Free Tier

- **Serverless Functions**: 10-second execution limit
- **Cold Starts**: Functions sleep after inactivity
- **Bandwidth**: Limited to 100GB per month
- **Build Minutes**: Limited to 6,000 minutes per month

---

Congratulations! Your Email Tracker server is now deployed on Vercel, and your extension should be properly configured to use it.