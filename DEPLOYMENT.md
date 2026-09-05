# 🚀 Production Deployment Guide: Sabjies Fresh Grocery
### Render (Backend) + Netlify (Frontend) + Supabase (PostgreSQL Database) + GitHub

This application is architected for seamless production deployment across **Render**, **Netlify**, and **Supabase** via **GitHub**.

---

## 1. 📦 GitHub Setup
1. Initialize git and commit your files:
   ```bash
   git init
   git add .
   git commit -m "Production ready Sabjies Fresh Grocery application"
   git branch -M main
   git remote add origin https://github.com/<YOUR_USERNAME>/<YOUR_REPO_NAME>.git
   git push -u origin main
   ```
2. The included `.github/workflows/ci.yml` will automatically verify your build on every push.

---

## 2. 🗄️ Supabase Database Setup
1. Go to [https://supabase.com](https://supabase.com) and sign in.
2. Create a new project (e.g. `sabjies-db`).
3. In the left sidebar, click **SQL Editor** ➔ **New Query**.
4. Open the included `supabase-schema.sql` file, copy its entire contents, paste it into the SQL Editor, and click **Run**.
   - This creates all 16 normalized tables, default categories, and disables RLS for API service access.
5. In the left sidebar, click **Project Settings** ➔ **API**:
   - Copy **Project URL** (e.g., `https://xyzcompany.supabase.co`).
   - Copy **anon / public key**.
   - Copy **service_role key** (keep this secret; only used on Render backend).

---

## 3. 🖥️ Render Deployment (Backend Web Service)
Your backend runs at: `https://sabjis-farm-fresh-delivery.onrender.com`

### Method A: Connect via GitHub
1. Go to [https://dashboard.render.com](https://dashboard.render.com).
2. Click **New +** ➔ **Web Service** ➔ Select your GitHub repository.
3. Configure the following settings:
   - **Name:** `sabjis-farm-fresh-delivery`
   - **Region:** Singapore (or closest to your customers)
   - **Runtime:** `Node`
   - **Branch:** `main`
   - **Build Command:** `npm run build`
   - **Start Command:** `npm start` *(or `node dist/server.cjs`)*
4. Under **Environment Variables**, add:
   | Key | Value |
   | :--- | :--- |
   | `NODE_ENV` | `production` |
   | `PORT` | `3000` |
   | `SUPABASE_URL` | `https://your-project.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | `your-service-role-key` |
   | `SUPABASE_ANON_KEY` | `your-anon-key` |
   | `GEMINI_API_KEY` | *(your Gemini API key, if using AI features)* |
   | `RAZORPAY_KEY_ID` | *(your Razorpay Key ID, if using online payments)* |
   | `RAZORPAY_KEY_SECRET` | *(your Razorpay Secret)* |
   | `ADMIN_NAME` | `Faizan Shaikh` |
   | `ADMIN_EMAIL` | `faizanshaikh786511@gmail.com` |
5. Click **Create Web Service**.
6. Once deployed, verify your backend is active:
   `https://sabjis-farm-fresh-delivery.onrender.com/api/health`

---

## 4. 🌐 Netlify Deployment (Frontend SPA)
Netlify hosts your high-performance frontend and automatically forwards `/api/*` requests to your Render backend via `netlify.toml` and `public/_redirects`.

1. Go to [https://app.netlify.com](https://app.netlify.com).
2. Click **Add new site** ➔ **Import an existing project** ➔ Choose **GitHub**.
3. Select your repository.
4. Configure Build settings:
   - **Base directory:** *(leave blank)*
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
5. Under **Site configuration** ➔ **Environment variables**, optionally add:
   | Key | Value |
   | :--- | :--- |
   | `VITE_API_URL` | `https://sabjis-farm-fresh-delivery.onrender.com` |
   | `VITE_SUPABASE_URL` | `https://your-project.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | `your-anon-key` |
6. Click **Deploy Site**.

*Note: Thanks to `netlify.toml` and `public/_redirects`, Netlify transparently proxies all `/api/*` calls directly to `https://sabjis-farm-fresh-delivery.onrender.com/api/:splat` with zero CORS issues and zero HTML-SPA response loops.*
