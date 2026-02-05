# ICES-Shifter - Intelligent Constraint-based Engineering Scheduler

A comprehensive shift planning application for engineering teams of 19-25 engineers. Built with Node.js/Express backend and React frontend.

**Version 2.0.0**

## Table of Contents

- [Features](#features)
- [What's New in v2.0](#whats-new-in-v20)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Docker Deployment](#docker-deployment)
- [User Guide](#user-guide)
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
- Support for multiple shift types: Early, Morning, Late, Night
- **Weekend-specific shift preferences** (WeekendEarly, WeekendMorning, WeekendLate, WeekendNight)
- Different coverage requirements for weekdays vs weekends
- Core engineers and Floaters (max 2) with different scheduling rules
- Night shift continuity (2+ consecutive weeks)
- **Shift consistency rule**: Early/Morning stay together, Late stays consistent, Night stays 2+ weeks
- Adjacency rules to prevent invalid shift transitions

### Engineer Management
- Engineer profiles with Tier classification (T1, T2, T3)
- Shift preferences per engineer (weekday and weekend)
- **Calendar view for unavailability** (sick leave, vacation, personal days)
- German state assignment for holiday calculation
- **Bulk import via CSV and Excel**
- **Export engineers to CSV/Excel**
- **Duplicate/copy engineer** for easy creation

### Schedule Management
- **Schedule preview** (even for failed/incomplete generation)
- **Manual shift editing** with validation
- **24-month schedule archiving**
- **Engineer view** (3 months back for engineers, full access for admins)
- Email notifications on schedule publish

### Request System
- **15-day minimum lead time** for all scheduling requests
- Request types: Time Off, Shift Change, Preference Update
- Admin/Manager approval workflow with option cards
- Approved requests automatically applied to schedules

### Schedule Generation Failures
When the constraint solver cannot satisfy all rules, the system provides:
- Detailed error messages explaining conflicts
- **At least 3 recovery options**
- **Partial schedule preview** for review
- **Direct link to manual editing**

### Admin Features
- **Version management with semantic versioning**
- **Auto-update from GitHub** (works in Docker)
- **Update check scheduling** (hourly, 8-hourly, daily)
- **Admin can mark themselves as engineer** to participate in scheduling
- **Email notification configuration**
- **User management** with notification preferences

---

## What's New in v2.0

### Major Features
1. **Renamed to ICES-Shifter** (Intelligent Constraint-based Engineering Scheduler)
2. **Version Management** - Semantic versioning with changelog
3. **Auto-Update from GitHub** - Check and apply updates from within the admin portal
4. **Excel Import/Export** - Support for .xlsx files in addition to CSV
5. **Unavailability Calendar** - Visual calendar to mark sick/vacation days (SAP-ready)
6. **Schedule Preview** - View partial schedules even when generation fails
7. **24-Month Archiving** - Historical schedule storage with role-based access
8. **Manual Shift Editing** - Edit individual shifts with validation
9. **Admin-as-Engineer** - Link admin/manager accounts to engineer profiles
10. **Email Notifications** - Notify users when schedules change
11. **Engineer Schedule View** - Engineers can view their schedules directly
12. **Shift Consistency Rule** - Maintains shift type consistency week-to-week
13. **Weekend Shift Preferences** - Separate preferences for weekend shifts

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
| Admin | admin@example.com | admin123 |

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
cd ices-shifter

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
│   Web (nginx)   │────────▶│   API (Node)    │
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
| `JWT_SECRET` | (default) | Secret for JWT tokens (**change in production!**) |
| `SMTP_HOST` | - | SMTP server for email notifications |
| `SMTP_PORT` | 587 | SMTP port |
| `SMTP_USER` | - | SMTP username |
| `SMTP_PASS` | - | SMTP password |
| `SMTP_FROM` | - | From email address |
| `SMTP_SECURE` | false | Use TLS |

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
| **Admin** | Full access: manage engineers, schedules, approve requests, system settings, auto-update |
| **Manager** | Manage engineers, generate/publish schedules, approve/reject requests |
| **Engineer** | View schedules (3 months back), submit requests, update own preferences |

### Workflow

1. **Setup Engineers** (Admin/Manager)
   - Add all team members with name, email, tier
   - Assign German state for holiday calculation
   - Set shift preferences (weekday AND weekend)
   - Designate floaters (max 2)
   - Import via CSV/Excel for bulk setup

2. **Mark Unavailability** (Admin/Manager/Engineer)
   - Use calendar view to mark sick/vacation days
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

6. **Publish Schedule** (Manager/Admin)
   - Review generated schedule
   - Publish to make visible to all engineers
   - Email notifications sent automatically

7. **View Schedule** (All Users)
   - Engineers see "My Schedule" with their shifts highlighted
   - Admins/Managers see full management view

---

## Scheduling Rules

### Hard Constraints (Zero Flexibility)

1. **Availability**
   - No engineer may be scheduled on an unavailable day
   - Unavailable days shown explicitly as "Unavailable"

2. **OFF Days**
   - Every core engineer: exactly 2 OFF days per Mon-Sun week
   - Unavailable days do NOT count as OFF
   - OFF days must be explicitly scheduled

3. **Weekly Workload** (Core Engineers)
   - No vacation in week → minimum 5 shifts
   - With vacation → 5-shift minimum suspended
   - Maximum 6 shifts (only for transitions)
   - Maximum 5 consecutive working days

4. **One Shift Per Day**
   - No engineer may work more than one shift per day

5. **Coverage Requirements**

   | Day Type | Early | Morning | Late | Night |
   |----------|-------|---------|------|-------|
   | Weekday | ≥3 | ≥3 | ≥3 | ≥2 (prefer 3) |
   | Weekend | ≥2 | ≥2 | ≥2 | ≥2 |

   *Core engineers must meet minimums before floaters are added*

6. **Floater Rules**
   - Maximum 2 floaters total
   - Maximum 2.5 shifts per week each
   - May NOT replace core minimum coverage
   - May NOT be scheduled on same shift as other floater
   - Exempt from night continuity rules

7. **Night Shift Continuity**
   - Night assignments must be in stable cohorts
   - Minimum 2 consecutive full weeks on nights
   - Prefer entire month when possible

8. **Adjacency Rules** (Forbidden Transitions)
   - Night → Early (forbidden)
   - Night → Morning (forbidden)
   - Early → Night (forbidden)
   - Morning → Night (forbidden)

### Soft Constraints (Preferences)

9. **Shift Consistency** (NEW in v2.0)
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

### System Endpoints (NEW in v2.0)

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
| GET | `/system/users` | List all users | Admin |
| PUT | `/system/users/:id/notifications` | Update email prefs | Yes |
| PUT | `/system/users/:id/engineer-link` | Link user to engineer | Admin |

### Authentication

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/auth/login` | Login with email/password | No |
| POST | `/auth/register` | Register new user | No |
| GET | `/auth/me` | Get current user info | Yes |
| POST | `/auth/change-password` | Change password | Yes |

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
| GET | `/engineers/:id/unavailable-dates` | Get unavailable dates (detailed) | Yes* |
| POST | `/engineers/:id/unavailable-dates` | Add unavailable dates | Yes* |
| DELETE | `/engineers/:id/unavailable-dates` | Remove unavailable dates | Yes* |
| GET | `/engineers/:id/holidays` | Get holidays for engineer | Yes |
| GET | `/engineers/states` | List German states | No |
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
| POST | `/schedules/generate` | Generate new schedule | Manager |
| POST | `/schedules/generate-with-option` | Generate with recovery option | Manager |
| PUT | `/schedules/:id` | Update schedule (full data) | Manager |
| PUT | `/schedules/:id/shift` | Update single shift | Manager |
| POST | `/schedules/:id/publish` | Publish schedule | Manager |
| POST | `/schedules/:id/archive` | Archive schedule | Manager |
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
ices-shifter/
├── server/
│   ├── index.js                 # Express server entry point
│   ├── routes/
│   │   ├── auth.js              # Authentication endpoints
│   │   ├── engineers.js         # Engineer management
│   │   ├── schedules.js         # Schedule generation & management
│   │   ├── requests.js          # Request handling
│   │   └── system.js            # System/admin endpoints (NEW)
│   ├── services/
│   │   ├── constraintSolver.js  # Core scheduling algorithm
│   │   ├── germanHolidays.js    # Holiday calculations
│   │   └── emailService.js      # Email notifications (NEW)
│   ├── middleware/
│   │   └── auth.js              # JWT authentication middleware
│   └── data/
│       ├── store.js             # JSON data store operations
│       └── storage/             # Persisted data (gitignored)
├── client/
│   ├── src/
│   │   ├── App.jsx              # Main React app with routing
│   │   ├── main.jsx             # React entry point
│   │   ├── styles.css           # Global styles
│   │   ├── pages/
│   │   │   ├── Login.jsx        # Login page
│   │   │   ├── Dashboard.jsx    # Admin dashboard
│   │   │   ├── Engineers.jsx    # Engineer management
│   │   │   ├── EngineerUnavailability.jsx # Unavailability calendar (NEW)
│   │   │   ├── Schedules.jsx    # Schedule generation
│   │   │   ├── ScheduleView.jsx # Schedule grid view
│   │   │   ├── ScheduleEdit.jsx # Manual schedule editing (NEW)
│   │   │   ├── MySchedule.jsx   # Engineer schedule view (NEW)
│   │   │   ├── Requests.jsx     # Admin request approval
│   │   │   ├── MyRequests.jsx   # Engineer request submission
│   │   │   ├── Profile.jsx      # User profile & preferences
│   │   │   └── AdminSettings.jsx # Admin settings (NEW)
│   │   └── services/
│   │       └── api.js           # API client
│   ├── index.html
│   ├── vite.config.js
│   ├── Dockerfile               # Client container (nginx)
│   └── nginx.conf               # Nginx configuration
├── version.json                 # Version information (NEW)
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
- Current version number
- Release date
- Full changelog

### Auto-Update

ICES-Shifter can update itself from GitHub:

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

### Email Notifications

When configured (via SMTP environment variables):
- Engineers receive notifications when schedules are published
- Engineers receive notifications when their schedule changes
- Users can opt-out via their profile

### Admin as Engineer

Admins/Managers can link their account to an engineer profile, allowing them to:
- Appear in shift schedules
- Submit their own time-off requests
- View their personal schedule

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
| Admin | admin@example.com | admin123 |
| Manager | sophie.weber@example.com | manager123 |
| Engineer | leon.fischer@example.com | password123 |

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

**Login issues**
- Default admin: `admin@example.com` / `admin123`
- JWT tokens expire after 24 hours
- Clear browser localStorage and try again

**Email notifications not working**
- Check SMTP environment variables are set
- Verify SMTP credentials are correct
- Check email spam folder

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
