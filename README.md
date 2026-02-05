# CC Shifter - Shift Planning Application

A comprehensive shift planning application for engineering teams of 19-25 engineers. Built with Node.js/Express backend and React frontend.

## Table of Contents

- [Features](#features)
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
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

### Core Scheduling
- **Constraint-based schedule generation** using a constraint solver approach (not greedy heuristics)
- Support for multiple shift types: Early, Morning, Late, Night
- Different coverage requirements for weekdays vs weekends
- Core engineers and Floaters (max 2) with different scheduling rules
- Night shift continuity (2+ consecutive weeks)
- Adjacency rules to prevent invalid shift transitions

### Engineer Management
- Engineer profiles with Tier classification (T1, T2, T3)
- Shift preferences per engineer
- Unavailability/vacation tracking
- German state assignment for holiday calculation

### Request System
- **15-day minimum lead time** for all scheduling requests
- Request types: Time Off, Shift Change, Preference Update
- Admin/Manager approval workflow with option cards
- Approved requests automatically applied to schedules

### Schedule Generation Failures
When the constraint solver cannot satisfy all rules, the system provides:
- Detailed error messages explaining conflicts
- **At least 3 recovery options**, such as:
  - Relax coverage requirements
  - Increase floater availability
  - Flexible OFF days
  - Manual schedule adjustment

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
cd cc-shifter

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

### Build and Run Manually
```bash
# Build images
docker build -t cc-shifter-api .
docker build -t cc-shifter-web ./client

# Create network
docker network create cc-shifter-net

# Run API
docker run -d \
  --name cc-shifter-api \
  --network cc-shifter-net \
  -v cc-shifter-data:/app/server/data/storage \
  -e JWT_SECRET=your-secret-key \
  cc-shifter-api

# Run Web
docker run -d \
  --name cc-shifter-web \
  --network cc-shifter-net \
  -p 80:80 \
  cc-shifter-web
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | API server port |
| `NODE_ENV` | production | Environment mode |
| `JWT_SECRET` | (default) | Secret for JWT tokens (**change in production!**) |

### Data Persistence
Data is stored in `/app/server/data/storage` inside the API container.

```bash
# Mount a host directory for data persistence
-v /path/on/host:/app/server/data/storage
```

---

## User Guide

### User Roles

| Role | Permissions |
|------|-------------|
| **Admin** | Full access: manage engineers, schedules, approve requests, system settings |
| **Manager** | Manage engineers, generate/publish schedules, approve/reject requests |
| **Engineer** | View schedules, submit requests, update own preferences |

### Workflow

1. **Setup Engineers** (Admin/Manager)
   - Add all team members with name, email, tier
   - Assign German state for holiday calculation
   - Set shift preferences (which shifts they can work)
   - Designate floaters (max 2)

2. **Engineer Requests** (Engineers)
   - Submit time-off requests (minimum 15-day lead time)
   - Request shift changes
   - Update shift preferences

3. **Manager Review** (Manager/Admin)
   - Review pending requests as approval cards
   - Approve or reject with notes
   - Approved requests auto-apply to schedules

4. **Generate Schedule** (Manager/Admin)
   - Select target month
   - Run constraint solver
   - If failures occur, choose recovery option or edit manually

5. **Publish Schedule** (Manager/Admin)
   - Review generated schedule
   - Publish to make visible to all engineers

### Color Coding

#### Engineer Tiers
| Tier | Color | Hex |
|------|-------|-----|
| T1 | Pink | `#d5a6bd` |
| T2 | Light Green | `#b6d7a7` |
| T3 | Mint | `#b7e1cd` |

#### Shifts
| Shift | Color | Hex | Text |
|-------|-------|-----|------|
| Early | Gold | `#f1c232` | Black |
| Morning | Yellow | `#ffff00` | Black |
| Late | Blue | `#6fa8dc` | White |
| Night | Dark Blue | `#1155cc` | White |
| OFF | Purple | `#5a3286` | White |
| Unavailable | Green | `#b6d7a8` | Black |

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
   - Night → Early ❌
   - Night → Morning ❌
   - Early → Night ❌
   - Morning → Night ❌

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

### Authentication

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/auth/login` | Login with email/password | No |
| POST | `/auth/register` | Register new user | No |
| GET | `/auth/me` | Get current user info | Yes |
| POST | `/auth/change-password` | Change password | Yes |

**Login Request:**
```json
{
  "email": "admin@example.com",
  "password": "admin123"
}
```

**Login Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "admin@example.com",
    "name": "Admin",
    "role": "admin"
  }
}
```

### Engineers

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/engineers` | List all engineers | Yes |
| GET | `/engineers/:id` | Get engineer by ID | Yes |
| POST | `/engineers` | Create engineer | Manager |
| PUT | `/engineers/:id` | Update engineer | Manager |
| DELETE | `/engineers/:id` | Deactivate engineer | Manager |
| PUT | `/engineers/:id/preferences` | Update shift preferences | Yes* |
| PUT | `/engineers/:id/unavailable` | Update unavailable days | Yes* |
| GET | `/engineers/:id/holidays` | Get holidays for engineer | Yes |
| GET | `/engineers/states` | List German states | No |

*Engineers can update their own; managers can update any

**Create Engineer Request:**
```json
{
  "name": "Max Mueller",
  "email": "max.mueller@example.com",
  "tier": "T2",
  "isFloater": false,
  "state": "BY",
  "preferences": ["Early", "Morning", "Late"]
}
```

### Schedules

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/schedules` | List all schedules | Yes |
| GET | `/schedules/:id` | Get schedule by ID | Yes |
| GET | `/schedules/month/:year/:month` | Get schedule for month | Yes |
| POST | `/schedules/generate` | Generate new schedule | Manager |
| POST | `/schedules/generate-with-option` | Generate with recovery option | Manager |
| PUT | `/schedules/:id` | Update schedule (manual edit) | Manager |
| POST | `/schedules/:id/publish` | Publish schedule | Manager |
| GET | `/schedules/:id/export` | Export schedule data | Yes |
| GET | `/schedules/holidays/:year/:month` | Get holidays for month | Yes |

**Generate Schedule Request:**
```json
{
  "year": 2024,
  "month": 3
}
```

**Generate Schedule Response (Success):**
```json
{
  "success": true,
  "schedule": { "id": "...", "month": "2024-03", "data": {...} },
  "warnings": [],
  "stats": {...}
}
```

**Generate Schedule Response (Failure):**
```json
{
  "success": false,
  "errors": [
    { "type": "coverage_failure", "message": "..." }
  ],
  "options": [
    { "id": "relax_coverage", "title": "Relax Coverage Requirements", ... },
    { "id": "increase_floater_hours", "title": "Increase Floater Availability", ... },
    { "id": "manual_edit", "title": "Manual Schedule Adjustment", ... }
  ],
  "canManualEdit": true
}
```

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

**Create Time Off Request:**
```json
{
  "type": "time_off",
  "dates": ["2024-04-15", "2024-04-16", "2024-04-17"],
  "reason": "Family vacation"
}
```

**Create Shift Change Request:**
```json
{
  "type": "shift_change",
  "dates": ["2024-04-20"],
  "details": {
    "currentShift": "Early",
    "requestedShift": "Late"
  },
  "reason": "Doctor appointment in the morning"
}
```

---

## Project Structure

```
cc-shifter/
├── server/
│   ├── index.js                 # Express server entry point
│   ├── routes/
│   │   ├── auth.js              # Authentication endpoints
│   │   ├── engineers.js         # Engineer management
│   │   ├── schedules.js         # Schedule generation & management
│   │   └── requests.js          # Request handling
│   ├── services/
│   │   ├── constraintSolver.js  # Core scheduling algorithm
│   │   └── germanHolidays.js    # Holiday calculations
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
│   │   │   ├── Schedules.jsx    # Schedule generation
│   │   │   ├── ScheduleView.jsx # Schedule grid view
│   │   │   ├── Requests.jsx     # Admin request approval
│   │   │   ├── MyRequests.jsx   # Engineer request submission
│   │   │   └── Profile.jsx      # User profile & preferences
│   │   └── services/
│   │       └── api.js           # API client
│   ├── index.html
│   ├── vite.config.js
│   ├── Dockerfile               # Client container (nginx)
│   └── nginx.conf               # Nginx configuration
├── Dockerfile                   # API server container
├── docker-compose.yml           # Multi-container setup
├── package.json
├── run.sh                       # Quick start script
├── seed-test-data.js            # Test data generator
└── test-scheduler.js            # Standalone scheduler test
```

---

## Testing

### Test the Scheduler Directly
```bash
# Run standalone scheduler test (no server needed)
node test-scheduler.js
```

This creates 23 sample engineers and attempts to generate a schedule, printing results to the console.

### Seed Test Data
```bash
# Populate database with sample engineers and users
node seed-test-data.js
```

Creates:
- 23 engineers (2 floaters, 21 core)
- Admin, manager, and engineer user accounts
- Sample shift preferences and state assignments

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
# Find process using port 3001
lsof -i :3001
# Kill it
kill -9 <PID>
```

**Docker build fails**
```bash
# Clean Docker cache
docker system prune -a
# Rebuild
docker-compose build --no-cache
```

**Schedule generation always fails**
- Ensure you have at least 10 active engineers
- Check that enough engineers can work Night shifts (minimum 2)
- Verify engineers have shift preferences set
- Review the error messages for specific constraint violations

**Login issues**
- Default admin: `admin@example.com` / `admin123`
- JWT tokens expire after 24 hours
- Clear browser localStorage and try again

**Data not persisting (Docker)**
```bash
# Check volume
docker volume ls
# Inspect volume
docker volume inspect cc-shifter-data
```

### Logs

**Docker logs:**
```bash
docker-compose logs -f api
docker-compose logs -f web
```

**Development logs:**
Server logs appear in the terminal running `npm run dev`

---

## License

MIT License

Copyright (c) 2024

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
