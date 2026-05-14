# Deployment & Security Guide

## 1. Environment Variables (.env)
You will need to configure environment variables for both Backend and Frontend.

**Backend (`backend/.env`)**
```env
PORT=5000
NODE_ENV=production
MONGO_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/vseries?retryWrites=true&w=majority
JWT_SECRET=your_super_secret_key_at_least_32_characters
CORS_ORIGINS=https://your-frontend-domain.vercel.app,https://www.yourdomain.com
ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD=use_a_strong_password_at_least_12_characters
TRUST_PROXY=1
ANALYTICS_TIME_ZONE=Asia/Bangkok
```

**Frontend (`frontend/.env.local` / Vercel Environment Variables)**
```env
NEXT_PUBLIC_API_URL=https://your-backend-domain.onrender.com/api
NEXT_PUBLIC_SITE_URL=https://your-frontend-domain.vercel.app
JWT_SECRET=the_same_secret_as_backend_JWT_SECRET
```

`JWT_SECRET` on the frontend is server-only and must not use the `NEXT_PUBLIC_` prefix. It is required so Next.js middleware can verify the admin JWT before allowing access to `/admin`.

Admin API requests from the browser are proxied through the frontend at `/api/backend/*`. This lets the HttpOnly admin cookie live on the Vercel frontend domain while the proxy forwards requests to the Render backend configured by `NEXT_PUBLIC_API_URL`. Admin mutation requests also include a CSRF token from the frontend cookie `admin_csrf`, which is verified against the JWT claim on the backend.

## 2. Pre-deployment Checklist
Run these checks before deploying changes.

**All checks from project root (recommended on Windows)**
```bat
.\predeploy.cmd
```

This runs the backend env check, backend tests, frontend env check, frontend lint, and frontend production build. Do not deploy if any step fails.

**Backend**
```bash
cd backend
npm run check:env
npm test
```

**Frontend**
```bash
cd frontend
npm run check:env
npm run lint
npm run build
```

If admin authentication or cookie settings changed, log out and log in again after deployment so the browser receives a fresh `admin_token` and `admin_csrf` pair.

## 3. GitHub Actions CI
Both repositories have CI workflows on `main`.

**Backend CI**
- Runs `npm ci`
- Runs `npm run check:env`
- Runs `npm test`

**Frontend CI**
- Runs `npm ci`
- Runs `npm run check:env`
- Runs `npm run lint`
- Runs `npm run build`

After pushing, check GitHub Actions before deploying. If either workflow is red, fix that repo before deploying.

## 4. Deploy Flow
1. Run `.\predeploy.cmd` from the project root.
2. Commit and push the changed repo or repos.
3. Confirm GitHub Actions are green.
4. Deploy backend on Render if backend changed.
5. Deploy frontend on Vercel if frontend changed.
6. After deploy, run the smoke tests below.

## 5. Production Smoke Tests
After deployment, verify these paths on the production domain:

- Frontend home page loads and shows series.
- `/category/all` loads and shows series.
- A sample `/series/<slug>` page loads.
- A sample `/watch/<slug>/<episode>` page plays the video, including `.m3u8` HLS links.
- Admin login works.
- Admin create/edit episode can save `Video URL`.
- Backend `/api/health` returns `{ "status": "ok" }`.

## 6. Rollback Notes
If a deploy is broken:

**Frontend rollback**
1. In Vercel, redeploy the last known good deployment, or revert the last frontend commit and push.
2. Confirm GitHub Actions are green.
3. Smoke test home, category, watch, and admin edit episode.

**Backend rollback**
1. In Render, redeploy the last known good backend deployment, or revert the last backend commit and push.
2. Confirm GitHub Actions are green.
3. Smoke test `/api/health`, public series API, admin login, and admin create/edit routes.

Keep `url-series` separate. The main app should only store video URLs and play them; media encoding remains outside this deployment flow.

## 7. Database: MongoDB Atlas
1. Sign up/Log in to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Create a new Cluster (Free tier is sufficient for starting).
3. Under **Database Access**, create a user with a strong password.
4. Under **Network Access**, add `0.0.0.0/0` to allow connections from anywhere (Render's IPs are dynamic).
5. Get your Connection String and put it in your Backend's `MONGO_URI`.

## 8. Backend Deployment: Render
1. Create an account on [Render](https://render.com/).
2. Click **New > Web Service**.
3. Connect your GitHub repository containing this project.
4. Settings:
   - Root Directory: `backend`
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Go to **Environment** tab and add the environment variables defined above.
6. Before deploying locally, run `npm run check:env` and `npm test` from the `backend` directory.
7. Deploy! Render will give you a URL like `https://your-backend-app.onrender.com`.
8. Create or update the admin user from the backend directory with `npm run seed:admin`. This command does not clear series or episode data.

## 9. Frontend Deployment: Vercel
1. Create an account on [Vercel](https://vercel.com/).
2. Click **Add New Project**.
3. Connect your GitHub repository.
4. Vercel automatically detects Next.js. Make sure the Root Directory is set to `frontend` if Vercel doesn't auto-detect it.
5. Go to **Environment Variables** and add `NEXT_PUBLIC_API_URL` pointing to your Render backend URL.
6. Before deploying locally, run `npm run check:env`, `npm run lint`, and `npm run build` from the `frontend` directory.
7. Click **Deploy**. Vercel will give you a fast, CDN-cached domain.

## 10. Security & Maintenance Recommendations
- **Rotate Secrets**: Regularly update your `JWT_SECRET`.
- **Environment Validation**: The backend validates required production settings at startup. `MONGO_URI`, `JWT_SECRET`, and `CORS_ORIGINS` must be set, and production `JWT_SECRET` must be at least 32 characters.
- **CORS Protection**: Ensure `CORS_ORIGINS` on the backend contains only trusted frontend URLs, separated by commas. Do not use `*` in production.
- **Proxy IP Handling**: Keep `TRUST_PROXY=1` on Render so login lockouts and visitor analytics use the real client IP from proxy headers.
- **Admin Cookie & CSRF**: The admin JWT is stored in an HttpOnly `SameSite=Lax` cookie and verified by the Next.js frontend middleware. Browser admin requests should use the built-in `/api/backend/*` proxy so the cookie is stored on the Vercel frontend domain even when the backend is hosted on Render. Admin POST/PUT/DELETE requests must include the `X-CSRF-Token` header automatically added by `adminFetch`. Existing admin sessions may need to log in again after security changes.
- **Rate Limiting**: The backend already includes `express-rate-limit`. Adjust the window limits based on actual user traffic.
- **Analytics Time Zone**: Daily visitor and view stats use `ANALYTICS_TIME_ZONE`, defaulting to `Asia/Bangkok`.
- **Admin Passwords**: Never store plain-text passwords. The system uses `bcrypt`. Ensure the first admin user is seeded with a strong, hashed password.
- **Seeder Safety**: `npm run seed:admin` creates or updates only the admin user and refuses weak/default passwords. Content deletion requires explicit commands: `npm run seed:clear-content` or `npm run seed:clear-admins`.
- **Log Monitoring**: Use Render's log streams. If the app is under attack (Spam, Brute Force), the logs will indicate IP spikes hitting rate limits.
- **Caching**: Next.js automatically caches pages and image resources. Ensure image URLs (like Cloudinary or S3) are configured in `next.config.ts` if using the native `<Image>` component for external URLs. Currently, standard `<img>` tags are used for unrestricted external domains, but Next.js `<Image>` provides better optimization.
