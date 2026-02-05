# CC Shifter - Shift Planning Application

A comprehensive shift planning application for engineering teams of 19-25 engineers. Built with Node.js/Express backend and React frontend.

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

### German Holiday Support
- All 16 German federal states (Bundesländer)
- Federal holidays applicable to all engineers
- State-specific holidays based on engineer location
- Automatic holiday calculation for any year

### Request System
- **15-day minimum lead time** for all scheduling requests
- Request types:
  - Time Off requests
  - Shift Change requests
  - Preference Update requests
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

## Scheduling Rules (Hard Constraints)

1. **Availability**: No engineer scheduled on unavailable days
2. **OFF Days**: Exactly 2 OFF days per Mon-Sun week (core engineers)
3. **Weekly Workload**:
   - 5 shifts/week minimum (if no vacation)
   - Max 6 shifts only for transitions
   - Max 5 consecutive working days
4. **One Shift Per Day**: No double-booking
5. **Coverage Requirements**:
   - Weekdays: Early ≥3, Morning ≥3, Late ≥3, Night ≥2 (core engineers)
   - Weekends: All shifts ≥2 (core engineers)
6. **Floater Rules**:
   - Max 2.5 shifts/week
   - Cannot replace core minimums
   - Both floaters cannot be on same shift
7. **Night Shift Continuity**: 2+ consecutive weeks
8. **Adjacency Rules**: No Night→Early/Morning, no Early/Morning→Night

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
# Install server dependencies
npm install

# Install client dependencies
cd client && npm install && cd ..
```

### Running the Application

**Development mode** (server + client with hot reload):
```bash
npm run dev
```

**Production mode**:
```bash
# Build client
npm run build

# Start server
npm start
```

The server runs on `http://localhost:3001` and the client on `http://localhost:3000` (dev mode).

### Default Admin Credentials
```
Email: admin@example.com
Password: admin123
```

## API Documentation

Visit `http://localhost:3001/api` for full API documentation.

### Key Endpoints

**Authentication**
- `POST /api/auth/login` - Login
- `POST /api/auth/register` - Register new user
- `GET /api/auth/me` - Get current user

**Engineers**
- `GET /api/engineers` - List engineers
- `POST /api/engineers` - Create engineer (manager)
- `PUT /api/engineers/:id/preferences` - Update preferences
- `GET /api/engineers/:id/holidays` - Get holidays for engineer

**Schedules**
- `POST /api/schedules/generate` - Generate schedule
- `POST /api/schedules/generate-with-option` - Generate with recovery option
- `POST /api/schedules/:id/publish` - Publish schedule
- `GET /api/schedules/:id/export` - Export schedule data

**Requests**
- `POST /api/requests` - Create scheduling request
- `GET /api/requests/pending` - Get pending requests (manager)
- `POST /api/requests/:id/approve` - Approve request
- `POST /api/requests/:id/reject` - Reject request

## Project Structure

```
cc-shifter/
├── server/
│   ├── index.js              # Express server entry
│   ├── routes/
│   │   ├── auth.js           # Authentication routes
│   │   ├── engineers.js      # Engineer management
│   │   ├── schedules.js      # Schedule generation
│   │   └── requests.js       # Request handling
│   ├── services/
│   │   ├── constraintSolver.js  # Core scheduling engine
│   │   └── germanHolidays.js    # Holiday calculations
│   ├── middleware/
│   │   └── auth.js           # JWT authentication
│   └── data/
│       └── store.js          # JSON data store
├── client/
│   ├── src/
│   │   ├── App.jsx           # Main React app
│   │   ├── pages/            # Page components
│   │   ├── services/
│   │   │   └── api.js        # API client
│   │   └── styles.css        # Global styles
│   └── index.html
└── package.json
```

## Color Coding

### Tiers
- T1: `#d5a6bd` (pink)
- T2: `#b6d7a7` (light green)
- T3: `#b7e1cd` (mint)

### Shifts
- Early: `#f1c232` (gold)
- Morning: `#ffff00` (yellow)
- Late: `#6fa8dc` (blue, white text)
- Night: `#1155cc` (dark blue, white text)
- OFF: `#5a3286` (purple, white text)
- Unavailable: `#b6d7a8` (green)

## Workflow

1. **Setup Engineers**: Add all team members with their tier, preferences, and German state
2. **Engineer Requests**: Engineers submit time-off or preference change requests (15-day lead time)
3. **Manager Review**: Approve or reject requests via admin interface
4. **Generate Schedule**: Run the constraint solver for the target month
5. **Handle Failures**: If generation fails, choose a recovery option or manually edit
6. **Publish**: Make the schedule visible to all engineers

## License

MIT
