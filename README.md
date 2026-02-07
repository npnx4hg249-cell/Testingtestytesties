# Shifter for ICES - Intelligent Constraint-based Engineering Scheduler

A comprehensive shift planning application for engineering teams of 19-25 engineers. Built with Node.js/Express backend and React frontend.

**Version Format: YY.WW.D.HH.MM.X** (Year.Week.DayOfWeek.Hour.Minute.Revision)

## Table of Contents

- [Features](#features)
- [What's New](#whats-new)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Docker Deployment](#docker-deployment)
- [User Guide](#user-guide)
- [Security Features](#security-features)
- [Scheduling Rules](#scheduling-rules)
- [Shift Definitions](#shift-definitions)
- [German Holiday Support](#german-holiday-support)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Testing](#testing)
- [Admin Features](#admin-features)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

### Core Scheduling
- **Constraint-based schedule generation** using a constraint solver approach (not greedy heuristics)
- Support for multiple shift types: Early, Morning, Late, Night, Training
- **Weekend-specific shift preferences** (WeekendEarly, WeekendMorning, WeekendLate, WeekendNight)
- Different coverage requirements for weekdays vs weekends
- Core engineers and Floaters (max 2) with different scheduling rules
- Night shift continuity (2+ consecutive weeks)
- **Shift consistency rule**: Early/Morning stay together, Late stays consistent, Night stays 2+ weeks
- Adjacency rules to prevent invalid shift transitions
- **Shift count display** per day on schedule edit page

### Engineer Management
- Engineer profiles with Tier classification (T1, T2, T3)
- Shift preferences per engineer (weekday and weekend)
- **Availability view** for unavailability (sick leave, vacation, personal days)
- German state assignment for holiday calculation
- **Bulk import via CSV and Excel**
- **Export engineers to CSV/Excel**
- **Duplicate/copy engineer** for easy creation
- **In Training flag** - Engineers marked as "In Training" receive:
  - Training shift Monday-Friday
  - Automatic OFF on weekends
  - Purple highlighting (#e6cff2) in schedules
- **Password management** - Admin can reset passwords with generation and email

### Schedule Management
- **Schedule preview** (even for failed/incomplete generation)
- **Manual shift editing** with validation
- **Edit published schedules** - Make corrections after publishing
- **Delete unpublished schedules** - Remove draft schedules
- **24-month schedule archiving**
- **Engineer view** (3 months back for engineers, full access for admins)
- **Latest published schedule on Dashboard** - Quick preview of current shifts
- Email notifications on schedule publish

### Request System
- **15-day minimum lead time** for all scheduling requests
- Request types: Time Off, Shift Change, Preference Update
- Admin/Manager approval workflow with option cards
- Approved requests automatically applied to schedules

### Security Features
- **Strong password requirements**:
  - Minimum 10 characters
  - At least one special character
  - At least one number
  - No common dictionary words
- **Two-Factor Authentication (2FA)** with TOTP
- **Account lockout** after 4 failed login attempts
- **Auto sign-out** after 1 hour of inactivity
- **8-hour cookie lifetime**
- **Password change** in user profile
- **Admin notifications** for locked accounts on dashboard

### Admin Features
- **Version management** with new versioning schema (YY.WW.D.HH.MM.X)
- **Auto-update from GitHub** (works in Docker)
- **Update check scheduling** (hourly, 8-hourly, daily)
- **Admin can mark themselves as engineer** to participate in scheduling
- **SMTP settings configuration** in Admin panel
- **Create additional admin users**
- **User management** with notification preferences
- **Dark mode** per user preference

---

## What's New in v3.0

### Major Features - v3.0
1. **Modular Schedule Generation Engine** - Complete rewrite with pluggable architecture
2. **German Labor Law (ArbZG) Compliance** - Full Arbeitszeitgesetz compliance built-in
3. **Constraint Satisfaction Problem (CSP) Solver** - AC-3 arc consistency algorithm
4. **Enhanced Security** - JWT_SECRET required, rate limiting, security headers
5. **Unified User Model** - Single user system with role flags (Admin, Manager, Floater, Training)
6. **User Dashboard** - Self-service profile with 2FA, password change, preferences
7. **Strategy-Based Scheduling** - Night, Day, and Floater assignment strategies

### Scheduler Architecture (v2.0.0)
The schedule generation engine has been completely modularized:
- **Core**: CSP solver with AC-3 algorithm and MRV heuristic
- **Rules**: German labor law (ArbZG) compliance module
- **Strategies**: Night shift, Day shift, Floater assignment strategies
- **Constraints**: Modular constraint definitions (coverage, transitions, preferences)
- **Config**: Centralized configuration for shifts, coverage, and rules

### Security Enhancements
- **JWT_SECRET Required** - No fallback in production (must set environment variable)
- **Rate Limiting** - 100 requests/minute API, 10 login attempts per 15 minutes
- **Security Headers** - CSP, X-Frame-Options, HSTS, X-Content-Type-Options
- **HTTPS Enforcement** - Automatic redirect in production
- **Cryptographic Password Generation** - Uses `crypto.randomInt` for secure randomness
- **CORS Restrictions** - Configurable allowed origins

### Previous Features (v2.0)
1. Version Management with changelog
2. Auto-Update from GitHub
3. Excel Import/Export
4. Unavailability Calendar
5. Schedule Preview (even on failure)
6. 24-Month Archiving
7. Manual Shift Editing with validation
8. Admin-as-Engineer linking
9. Email Notifications
10. Engineer Schedule View
11. Shift Consistency Rules
12. Weekend Shift Preferences

---

## Quick Start

### Using Docker (Recommended)
```bash
docker-compose up -d
```
Open `http://localhost` in your browser.

### Local Development
```bash
./run.sh
```
Or manually:
```bash
npm install
cd client && npm install && cd ..
npm run dev
```

### Default Login Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@example.com | Admin123!@# |

**Note:** Password must meet strong password requirements (10+ chars, special char, number).

---

## Installation

### Prerequisites
- Node.js 18+
- npm 9+
- Docker & Docker Compose (for containerized deployment)

### Local Setup

```bash
# Clone the repository
git clone <repository-url>
cd shifter-for-ices

# Install server dependencies
npm install

# Install client dependencies
cd client && npm install && cd ..

# Seed test data (optional - creates 23 sample engineers)
node seed-test-data.js

# Start development servers
npm run dev
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both server and client in development mode |
| `npm run server` | Start only the API server with hot reload |
| `npm run client` | Start only the React client |
| `npm run build` | Build the client for production |
| `npm start` | Start the production server |
| `npm test` | Run tests |

---

## Docker Deployment

The application runs as two containers:
- **Web** (nginx) - Serves the React frontend on port 80
- **API** (Node.js) - Runs the backend API on port 3001

### Architecture
```
┌─────────────────┐         ┌─────────────────┐
│   Web (nginx)   │────────>│   API (Node)    │
│    Port 80      │  /api   │   Port 3001     │
└─────────────────┘         └─────────────────┘
        │                           │
   React SPA                   REST API
   Static files               JSON Storage
```

### Quick Start with Docker Compose
```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

The application will be available at `http://localhost`

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | API server port |
| `NODE_ENV` | production | Environment mode |
| `JWT_SECRET` | **REQUIRED** | Secret for JWT tokens (**required in production - no fallback!**) |
| `ALLOWED_ORIGINS` | localhost:3000,3001,5173 | Comma-separated list of allowed CORS origins |
| `SESSION_TIMEOUT` | 3600000 | Session timeout in ms (default: 1 hour) |
| `COOKIE_LIFETIME` | 28800000 | Cookie lifetime in ms (default: 8 hours) |
| `SMTP_HOST` | - | SMTP server for email notifications |
| `SMTP_PORT` | 587 | SMTP port |
| `SMTP_USER` | - | SMTP username |
| `SMTP_PASS` | - | SMTP password |
| `SMTP_FROM` | - | From email address |
| `SMTP_SECURE` | false | Use TLS |

**Security Note:** In production, the server will **fail to start** if `JWT_SECRET` is not set. Generate a strong secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Data Persistence
Data is stored in `/app/server/data/storage` inside the API container.

```bash
# Mount a host directory for data persistence
-v /path/on/host:/app/server/data/storage
```

**Note:** When using auto-update in Docker, user data is preserved because it's stored in a mounted volume.

---

## User Guide

### User Roles

| Role | Permissions |
|------|-------------|
| **Admin** | Full access: manage engineers, schedules, approve requests, system settings, auto-update, create admins, unlock accounts |
| **Manager** | Manage engineers, generate/publish schedules, approve/reject requests |
| **Engineer** | View schedules (3 months back), submit requests, update own preferences, change password |

### Workflow

1. **Setup Engineers** (Admin/Manager)
   - Add all team members with name, email, tier
   - Assign German state for holiday calculation
   - Set shift preferences (weekday AND weekend)
   - Designate floaters (max 2)
   - Mark engineers "In Training" if applicable
   - Import via CSV/Excel for bulk setup

2. **Mark Unavailability** (Admin/Manager/Engineer)
   - Use Availability view to mark sick/vacation days
   - Select date range and unavailability type
   - Future: Sync with SAP WFM

3. **Engineer Requests** (Engineers)
   - Submit time-off requests (minimum 15-day lead time)
   - Request shift changes
   - Update shift preferences

4. **Manager Review** (Manager/Admin)
   - Review pending requests as approval cards
   - Approve or reject with notes
   - Approved requests auto-apply to schedules

5. **Generate Schedule** (Manager/Admin)
   - Select target month
   - Run constraint solver
   - If failures occur:
     - View partial schedule preview
     - Choose recovery option OR
     - Edit manually
   - View shift counts per day

6. **Publish Schedule** (Manager/Admin)
   - Review generated schedule
   - Publish to make visible to all engineers
   - Email notifications sent automatically
   - Can edit published schedules if corrections needed

7. **View Schedule** (All Users)
   - Engineers see "My Schedule" with their shifts highlighted
   - Admins/Managers see full management view
   - Dashboard shows latest published schedule preview

---

## Security Features

### Strong Password Policy
Passwords must meet the following requirements:
- Minimum 10 characters
- At least one special character (!@#$%^&*_+-=, etc.)
- At least one number
- At least one uppercase letter
- At least one lowercase letter
- No common dictionary words (password, admin, user, etc.)
- No sequential characters (123, abc)
- No repeated characters (aaa)

### Two-Factor Authentication (2FA)
- TOTP-based authentication using apps like Google Authenticator
- Setup via Profile page
- Required on login after activation
- Can be disabled by admin if user loses access

### Account Lockout
- Account locks after 4 failed login attempts
- 30-minute lockout duration
- Locked accounts display notification to admins on Dashboard
- Admin can unlock accounts from the Dashboard
- Prevents brute-force password attacks

### Session Security
- Auto sign-out after 1 hour of inactivity
- Cookie lifetime of 8 hours
- JWT-based authentication
- Activity tracking resets timeout on user actions
- **JWT_SECRET required** - no fallback in production

### API Security
- **Rate Limiting**: 100 requests per minute per IP
- **Login Rate Limiting**: 10 attempts per 15 minutes
- **CORS**: Configurable allowed origins (restricted in production)
- **HTTPS Enforcement**: Automatic redirect in production

### Security Headers
All responses include security headers:
- `X-Frame-Options: DENY` - Prevents clickjacking
- `X-Content-Type-Options: nosniff` - Prevents MIME sniffing
- `X-XSS-Protection: 1; mode=block` - XSS filter
- `Content-Security-Policy` - Restricts resource loading
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` - Restricts browser features
- `Strict-Transport-Security` (production only) - Forces HTTPS

### Password Management
- Users can change their password in Profile
- Admins can reset engineer passwords
- **Cryptographically secure** password generation using `crypto.randomInt`
- Option to send new password via email

### Security Documentation
A comprehensive security audit report is available at `/docs/SECURITY_REPORT.md` documenting:
- All identified vulnerabilities and their severity
- Remediation steps taken
- Remaining recommendations

---

## Scheduling Rules

The scheduler implements German labor law (Arbeitszeitgesetz/ArbZG) compliance alongside operational constraints.

### German Labor Law (ArbZG) Compliance

The scheduler enforces the following legal requirements:

| Requirement | Law Reference | Implementation |
|-------------|---------------|----------------|
| Maximum daily hours | §3 ArbZG | 8 hours (10 with averaging) |
| Minimum rest between shifts | §5 ArbZG | 11 hours minimum |
| Maximum consecutive work days | §11 ArbZG | 6 days maximum |
| Weekly rest period | §11 ArbZG | 24 hours uninterrupted |
| Night work provisions | §6 ArbZG | Special handling for 23:00-06:00 |

### Hard Constraints (Zero Flexibility)

1. **Availability**
   - No engineer may be scheduled on an unavailable day
   - Unavailable days shown explicitly as "Unavailable"

2. **OFF Days**
   - Every core engineer: exactly 2 consecutive OFF days per Mon-Sun week
   - Unavailable days do NOT count as OFF
   - OFF days must be explicitly scheduled
   - Maximum 6 consecutive working days (§11 ArbZG)

3. **Rest Period (§5 ArbZG)**
   - Minimum 11 hours rest between shifts
   - Automatically prevents illegal shift transitions
   - Night → Early: Forbidden (only ~23.5 hours rest)
   - Night → Morning: Forbidden (only 2.5 hours rest)
   - Late → Early: Forbidden (only 7.5 hours rest)

4. **Weekly Workload** (Core Engineers)
   - No vacation in week → minimum 5 shifts
   - With vacation → 5-shift minimum suspended
   - Maximum 6 shifts (only for transitions)

5. **One Shift Per Day**
   - No engineer may work more than one shift per day

6. **Coverage Requirements**

   | Day Type | Early | Morning | Late | Night |
   |----------|-------|---------|------|-------|
   | Weekday | ≥3 | ≥3 | ≥3 | ≥2 (prefer 3) |
   | Weekend | ≥2 | ≥2 | ≥2 | ≥2 |

   *Core engineers must meet minimums before floaters are added*

7. **Floater Rules**
   - Maximum 2 floaters total
   - Maximum 2.5 shifts per week each
   - May NOT replace core minimum coverage
   - May NOT be scheduled on same shift as other floater
   - Exempt from night continuity rules

8. **Night Shift Continuity**
   - Night assignments must be in stable cohorts
   - Minimum 2 consecutive full weeks on nights
   - Prefer entire month when possible

9. **Adjacency Rules** (Forbidden Transitions per §5 ArbZG)
   - Night → Early (forbidden - insufficient rest)
   - Night → Morning (forbidden - insufficient rest)
   - Late → Early (forbidden - insufficient rest)
   - Early → Night (forbidden - insufficient rest)
   - Morning → Night (forbidden - insufficient rest)

9. **Training Engineers**
   - Engineers marked "In Training" receive:
     - Training shift Monday-Friday
     - OFF on Saturday and Sunday
     - Exempt from normal scheduling rules
     - Purple highlighting (#e6cff2) in views

### Soft Constraints (Preferences)

10. **Shift Consistency**
    - Early/Morning shifts stay together week-to-week
    - Late shifts stay consistent week-to-week
    - Night shifts stay consistent for 2+ weeks
    - Helps maintain work-life balance and sleep patterns

---

## Shift Definitions

### Weekday Shifts
| Shift | Start | End | Duration |
|-------|-------|-----|----------|
| Early | 07:00 | 15:30 | 8.5 hours |
| Morning | 10:00 | 18:30 | 8.5 hours |
| Late | 15:00 | 23:30 | 8.5 hours |
| Night | 23:00 | 07:30 | 8.5 hours |
| Training | 09:00 | 17:30 | 8.5 hours |

### Weekend Shifts
| Shift | Start | End | Duration |
|-------|-------|-----|----------|
| Early | 07:00 | 15:30 | 8.5 hours |
| Morning | 10:00 | 18:30 | 8.5 hours |
| Late | 15:00 | 22:30 | 7.5 hours |
| Night | 23:00 | 07:30 | 8.5 hours |

### Shift Preferences
Engineers can set separate preferences for weekday and weekend shifts:

**Weekday:** Early, Morning, Late, Night
**Weekend:** WeekendEarly, WeekendMorning, WeekendLate, WeekendNight

This allows, for example, an engineer to work Morning during the week but only Night on weekends.

---

## German Holiday Support

### Supported States (Bundesländer)

| Code | State |
|------|-------|
| BW | Baden-Württemberg |
| BY | Bavaria (Bayern) |
| BE | Berlin |
| BB | Brandenburg |
| HB | Bremen |
| HH | Hamburg |
| HE | Hesse (Hessen) |
| MV | Mecklenburg-Vorpommern |
| NI | Lower Saxony (Niedersachsen) |
| NW | North Rhine-Westphalia (Nordrhein-Westfalen) |
| RP | Rhineland-Palatinate (Rheinland-Pfalz) |
| SL | Saarland |
| SN | Saxony (Sachsen) |
| ST | Saxony-Anhalt (Sachsen-Anhalt) |
| SH | Schleswig-Holstein |
| TH | Thuringia (Thüringen) |

### Federal Holidays (All States)
- Neujahrstag (New Year's Day) - January 1
- Karfreitag (Good Friday) - Easter -2
- Ostersonntag (Easter Sunday)
- Ostermontag (Easter Monday)
- Tag der Arbeit (Labour Day) - May 1
- Christi Himmelfahrt (Ascension Day) - Easter +39
- Pfingstsonntag (Whit Sunday) - Easter +49
- Pfingstmontag (Whit Monday) - Easter +50
- Tag der Deutschen Einheit (German Unity Day) - October 3
- 1. Weihnachtsfeiertag (Christmas Day) - December 25
- 2. Weihnachtsfeiertag (St. Stephen's Day) - December 26

### State-Specific Holidays
- Heilige Drei Könige (Epiphany) - BW, BY, ST
- Internationaler Frauentag (Women's Day) - BE, MV
- Fronleichnam (Corpus Christi) - BW, BY, HE, NW, RP, SL
- Mariä Himmelfahrt (Assumption) - SL
- Weltkindertag (Children's Day) - TH
- Reformationstag (Reformation Day) - BB, HB, HH, MV, NI, SN, ST, SH, TH
- Allerheiligen (All Saints' Day) - BW, BY, NW, RP, SL
- Buß- und Bettag (Repentance Day) - SN

---

## API Reference

Base URL: `http://localhost:3001/api`

### System Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/system/version` | Get current version | No |
| GET | `/system/version/full` | Get version with changelog | Admin |
| GET | `/system/update-status` | Get update status | Admin |
| POST | `/system/check-update` | Check for updates | Admin |
| POST | `/system/configure-update-check` | Set check interval | Admin |
| POST | `/system/apply-update` | Apply available update | Admin |
| GET | `/system/settings` | Get system settings | Admin |
| PUT | `/system/settings` | Update settings | Admin |
| GET | `/system/email-config` | Get email config status | Admin |
| GET | `/system/smtp-settings` | Get SMTP settings | Admin |
| PUT | `/system/smtp-settings` | Update SMTP settings | Admin |
| GET | `/system/users` | List all users | Admin |
| PUT | `/system/users/:id/notifications` | Update email prefs | Yes |
| PUT | `/system/users/:id/engineer-link` | Link user to engineer | Admin |
| GET | `/system/locked-accounts` | Get locked accounts | Admin |
| POST | `/system/unlock-account/:userId` | Unlock user account | Admin |

### Authentication

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/auth/login` | Login with email/password | No |
| POST | `/auth/login/2fa` | Complete 2FA login | No |
| POST | `/auth/register` | Register new user | No |
| GET | `/auth/me` | Get current user info | Yes |
| POST | `/auth/change-password` | Change own password | Yes |
| POST | `/auth/2fa/setup` | Setup 2FA | Yes |
| POST | `/auth/2fa/verify` | Verify and enable 2FA | Yes |
| POST | `/auth/2fa/disable` | Disable 2FA | Yes |
| POST | `/auth/admin/create` | Create admin user | Admin |
| POST | `/auth/admin/reset-password` | Reset user password | Admin |

### Engineers

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/engineers` | List all engineers | Yes |
| GET | `/engineers/:id` | Get engineer by ID | Yes |
| POST | `/engineers` | Create engineer | Manager |
| PUT | `/engineers/:id` | Update engineer | Manager |
| DELETE | `/engineers/:id` | Deactivate engineer | Manager |
| POST | `/engineers/:id/duplicate` | Duplicate engineer | Manager |
| PUT | `/engineers/:id/preferences` | Update shift preferences | Yes* |
| PUT | `/engineers/:id/unavailable` | Update unavailable days | Yes* |
| GET | `/engineers/:id/availability` | Get availability page | Yes* |
| GET | `/engineers/:id/unavailable-dates` | Get unavailable dates (detailed) | Yes* |
| POST | `/engineers/:id/unavailable-dates` | Add unavailable dates | Yes* |
| DELETE | `/engineers/:id/unavailable-dates` | Remove unavailable dates | Yes* |
| GET | `/engineers/:id/holidays` | Get holidays for engineer | Yes |
| POST | `/engineers/:id/reset-password` | Reset engineer password | Admin |
| POST | `/engineers/:id/create-account` | Create user account for engineer | Admin |
| GET | `/engineers/states` | List German states | No |
| GET | `/engineers/check-email/:email` | Check email uniqueness | Manager |
| POST | `/engineers/bulk-upload` | Bulk upload from CSV | Manager |
| POST | `/engineers/bulk-upload-excel` | Bulk upload from Excel | Manager |
| GET | `/engineers/export/csv` | Export engineers as CSV | Manager |
| GET | `/engineers/export/excel` | Export engineers as Excel | Manager |
| GET | `/engineers/csv-template` | Download CSV template | No |
| GET | `/engineers/excel-template` | Download Excel template | No |
| GET | `/engineers/shift-options` | Get shift preference options | No |

*Engineers can access their own; managers can access any

### Schedules

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/schedules` | List all schedules | Yes |
| GET | `/schedules/:id` | Get schedule by ID | Yes |
| GET | `/schedules/month/:year/:month` | Get schedule for month | Yes |
| GET | `/schedules/engineer-view/:year/:month` | Engineer schedule view | Yes |
| GET | `/schedules/archived` | List archived schedules | Manager |
| GET | `/schedules/latest-published` | Get latest published schedule | Yes |
| POST | `/schedules/generate` | Generate new schedule | Manager |
| POST | `/schedules/generate-with-option` | Generate with recovery option | Manager |
| PUT | `/schedules/:id` | Update schedule (full data) | Manager |
| PUT | `/schedules/:id/shift` | Update single shift | Manager |
| POST | `/schedules/:id/publish` | Publish schedule | Manager |
| POST | `/schedules/:id/archive` | Archive schedule | Manager |
| DELETE | `/schedules/:id` | Delete unpublished schedule | Manager |
| GET | `/schedules/:id/export` | Export schedule data | Yes |
| GET | `/schedules/holidays/:year/:month` | Get holidays for month | Yes |

### Requests

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/requests` | List requests (filtered by role) | Yes |
| GET | `/requests/pending` | Get pending requests | Manager |
| GET | `/requests/:id` | Get request by ID | Yes |
| POST | `/requests` | Create scheduling request | Yes |
| POST | `/requests/:id/approve` | Approve request | Manager |
| POST | `/requests/:id/reject` | Reject request | Manager |
| DELETE | `/requests/:id` | Cancel pending request | Yes* |
| GET | `/requests/types/list` | Get request types | No |

*Only own pending requests

---

## Project Structure

```
shifter-for-ices/
├── server/
│   ├── index.js                 # Express server entry point
│   ├── routes/
│   │   ├── auth.js              # Authentication endpoints (2FA, password)
│   │   ├── engineers.js         # Engineer management
│   │   ├── schedules.js         # Schedule generation & management
│   │   ├── requests.js          # Request handling
│   │   └── system.js            # System/admin endpoints
│   ├── services/
│   │   ├── scheduler/           # Modular scheduling engine (v2.0)
│   │   │   ├── index.js         # Module entry point
│   │   │   ├── core/
│   │   │   │   ├── Scheduler.js         # Main orchestrator
│   │   │   │   └── ConstraintEngine.js  # CSP solver (AC-3)
│   │   │   ├── config/
│   │   │   │   └── defaults.js          # Shift/coverage configuration
│   │   │   ├── rules/
│   │   │   │   └── GermanLaborLaws.js   # ArbZG compliance
│   │   │   ├── constraints/
│   │   │   │   └── index.js             # Modular constraints
│   │   │   ├── strategies/
│   │   │   │   ├── NightShiftStrategy.js
│   │   │   │   ├── DayShiftStrategy.js
│   │   │   │   └── FloaterStrategy.js
│   │   │   └── utils/
│   │   │       └── DateUtils.js         # Date utilities
│   │   ├── constraintSolver.js  # Legacy (deprecated)
│   │   ├── germanHolidays.js    # Holiday calculations
│   │   └── emailService.js      # Email notifications
│   ├── middleware/
│   │   └── auth.js              # JWT auth, password validation, lockout
│   └── data/
│       ├── store.js             # JSON data store operations
│       └── storage/             # Persisted data (gitignored)
├── client/
│   ├── src/
│   │   ├── App.jsx              # Main React app (dark mode, session timeout)
│   │   ├── main.jsx             # React entry point
│   │   ├── styles.css           # Global styles
│   │   ├── pages/
│   │   │   ├── Login.jsx        # Login page (2FA support)
│   │   │   ├── Dashboard.jsx    # Dashboard (latest schedule, locked accounts)
│   │   │   ├── Engineers.jsx    # Engineer management (training, passwords)
│   │   │   ├── EngineerUnavailability.jsx # Availability view
│   │   │   ├── Schedules.jsx    # Schedule generation
│   │   │   ├── ScheduleView.jsx # Schedule grid view
│   │   │   ├── ScheduleEdit.jsx # Manual editing (shift counts)
│   │   │   ├── MySchedule.jsx   # Engineer schedule view
│   │   │   ├── Requests.jsx     # Admin request approval
│   │   │   ├── MyRequests.jsx   # Engineer request submission
│   │   │   ├── Profile.jsx      # Profile (2FA, password change, dark mode)
│   │   │   └── AdminSettings.jsx # Admin settings (SMTP)
│   │   └── services/
│   │       └── api.js           # API client
│   ├── index.html
│   ├── vite.config.js
│   ├── Dockerfile               # Client container (nginx)
│   └── nginx.conf               # Nginx configuration
├── version.json                 # Version information
├── Dockerfile                   # API server container
├── docker-compose.yml           # Multi-container setup
├── package.json
├── run.sh                       # Quick start script
├── seed-test-data.js            # Test data generator
└── test-scheduler.js            # Standalone scheduler test
```

---

## Admin Features

### Version Management

The Admin Settings page (`/admin`) shows:
- Current version number (format: YY.WW.D.HH.MM.X)
- Release date
- Full changelog

### Auto-Update

Shifter for ICES can update itself from GitHub:

1. Navigate to Admin Settings
2. Click "Check for Updates"
3. If an update is available, click "Apply Update"
4. Restart the application

**Note:** Auto-update works in both standalone and Docker deployments. User data is preserved because it's stored separately from the application code.

### Update Check Scheduling

Configure automatic update checks:
- **Every Hour**: For critical environments
- **Every 8 Hours**: Balanced approach
- **Daily**: Recommended for most deployments
- **Disabled**: Manual checks only

### SMTP Configuration

Configure email settings in Admin panel:
- SMTP Host and Port
- Username and Password
- From address
- TLS/SSL settings
- Test email functionality

### Email Notifications

When SMTP is configured:
- Engineers receive notifications when schedules are published
- Engineers receive notifications when their schedule changes
- Password reset emails for engineers
- Users can opt-out via their profile

### User Management

Admins can:
- Create additional admin users
- Reset user passwords
- Unlock locked accounts
- View failed login notifications

### Admin as Engineer

Admins/Managers can link their account to an engineer profile, allowing them to:
- Appear in shift schedules
- Submit their own time-off requests
- View their personal schedule

### Dark Mode

Users can enable dark mode:
- Toggle in Profile page
- Preference stored per user
- Persists across sessions

---

## Testing

### Test the Scheduler Directly
```bash
# Run standalone scheduler test (no server needed)
node test-scheduler.js
```

### Seed Test Data
```bash
# Populate database with sample engineers and users
node seed-test-data.js
```

### Test Credentials After Seeding

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@example.com | Admin123!@# |
| Manager | sophie.weber@example.com | Manager123!@# |
| Engineer | leon.fischer@example.com | Engineer123!@# |

**Note:** Passwords must meet strong password requirements.

---

## Troubleshooting

### Common Issues

**Port already in use**
```bash
lsof -i :3001
kill -9 <PID>
```

**Docker build fails**
```bash
docker system prune -a
docker-compose build --no-cache
```

**Schedule generation always fails**
- Ensure you have at least 10 active engineers
- Check that enough engineers can work Night shifts (minimum 2)
- Verify engineers have shift preferences set
- Review the error messages and use the preview feature
- Check for too many engineers marked as "In Training"

**Login issues**
- Default admin: `admin@example.com` / `Admin123!@#`
- Account may be locked after 4 failed attempts
- Check Dashboard for locked account notifications
- 2FA may be enabled - use authenticator app
- Session expires after 1 hour of inactivity

**Account locked**
- Admin can unlock from Dashboard
- Look for "Locked Accounts" alert
- Click "Unlock" button for affected user

**Email notifications not working**
- Configure SMTP settings in Admin panel
- Check SMTP credentials are correct
- Verify email spam folder
- Test email from Admin settings

**2FA issues**
- Ensure device time is synchronized
- Use a standard TOTP app (Google Authenticator, Authy)
- Admin can disable 2FA for a user if needed

### Logs

**Docker logs:**
```bash
docker-compose logs -f api
docker-compose logs -f web
```

---

## License

MIT License

Copyright (c) 2024-2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
