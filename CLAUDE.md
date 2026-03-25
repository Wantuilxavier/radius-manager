# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FreeRADIUS Web Management System — a REST API backend (Node.js/Express) + vanilla JS SPA frontend for managing WiFi authentication via FreeRADIUS and MariaDB.

## Commands

### Backend (run from `backend/`)
```bash
npm run dev          # Development with nodemon auto-reload
npm start            # Production (node server.js)
npm run pm2:start    # Start with PM2 (production)
npm run pm2:restart  # Restart PM2 process
npm run pm2:logs     # View PM2 logs
```

### No build step for frontend
The frontend is pure HTML/CSS/JS — edit files directly in `frontend/`, no bundler or transpiler.

### No test suite
There is no test framework configured in this project.

## Architecture

### Request Flow
```
Browser SPA → Nginx (reverse proxy :80) → Express API (:3000) → MariaDB
                                        → FreeRADIUS (1812/1813 UDP)
```

### Backend (`backend/`)
- **`server.js`** — Express app entry point: registers middleware (helmet, cors, morgan, rate-limiting) and mounts all route modules
- **`db/connection.js`** — mysql2/promise connection pool (10 connections max); all database access goes through this pool
- **`middleware/auth.js`** — JWT validation + role/permission checks; all protected routes use this
- **`routes/`** — one file per resource (`users`, `groups`, `nas`, `devices`, `departments`, `dashboard`, `settings`, `auth`); each file handles full CRUD with raw SQL queries

### Frontend (`frontend/`)
- Single `index.html` with all modals and an SVG icon sprite; no routing library
- **`js/app.js`** — SPA router, navigation state, login/logout; this is the entry point
- **`js/utils.js`** — shared `apiFetch()` wrapper (adds JWT header, handles 401), toast notifications, modal helpers
- One JS module per backend resource (users, devices, departments, nas, groups-sessions, settings, export-pdf)
- **`css/style.css`** — CSS custom properties for dark/light themes; all theming is done through these tokens

### Database
Raw SQL only (no ORM). Two layers of tables:
1. **FreeRADIUS native**: `radcheck`, `radreply`, `radusergroup`, `radgroupcheck`, `radgroupreply`, `radacct`, `nas`, `radpostauth` — must follow FreeRADIUS schema conventions
2. **Custom extensions**: `admin_users`, `admin_permissions`, `vlan_profiles`, `user_profiles`, `departments`, `system_settings`, `device_profiles`, `audit_log`, `schema_migrations`

Schema lives in `database/schema.sql`; incremental changes go in `database/migrations/`.

### Authentication & Permissions
- JWT stored in `localStorage`; token passed as `Authorization: Bearer <token>` on every API call
- Admin roles: `superadmin` (full access) vs `admin` (permission-matrix controlled)
- Permissions stored in `admin_permissions` table as `(admin_id, resource, action)` pairs
- `middleware/auth.js` `checkPermission(resource, action)` is used to guard individual routes

### Key Data Relationships
- A RADIUS user's VLAN is assigned by putting them in a group (`radusergroup`) whose `radgroupreply` contains 802.1Q tunnel attributes
- Simultaneous connection limit is stored in both `user_profiles.simultaneous_connections` and `radcheck` (`Simultaneous-Use` attribute) — keep both in sync when updating
- All admin actions must be written to `audit_log` — see existing routes for the pattern

## Environment
Copy `backend/.env.example` to `backend/.env` and fill in DB credentials and a strong `JWT_SECRET` (≥64 chars). Default first-login credentials: `admin` / `Admin@123`.
