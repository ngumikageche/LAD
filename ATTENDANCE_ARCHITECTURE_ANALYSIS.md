# ATTENDANCE SYSTEM MVP - PHASE 1: ARCHITECTURE ANALYSIS

**Date:** May 13, 2026  
**Status:** Architecture Analysis Complete

---

## 1. EXISTING STACK ANALYSIS

### Backend Framework
- **Framework:** Flask 3.1.0
- **ORM:** SQLAlchemy 2.0.36 with Flask-SQLAlchemy 3.1.1
- **Database:** PostgreSQL via psycopg (v3.2.3)
- **Migration Tool:** Flask-Migrate 4.0.7 (Alembic)
- **Authentication:** Custom JWT using itsdangerous.URLSafeTimedSerializer
- **CORS:** Flask-CORS 4.0.1 (configured for multiple origins)
- **Caching:** Flask-Caching (SimpleCache)

### Frontend Framework
- **Framework:** React 19.2.4 with TypeScript
- **Build Tool:** Vite 8.0.1
- **Styling:** Tailwind CSS 4.2.2
- **Routing:** React Router v7.14.0
- **HTTP Client:** Axios 1.14.0
- **Charting:** Recharts 3.8.1 (for analytics)
- **Icons:** Lucide React 1.7.0
- **Animation:** Framer Motion 12.38.0

### Database ORM Pattern
- **Primary Keys:** UUID (PostgreSQL UUID type)
- **Soft Delete:** All models inherit BaseModel with deleted_at field
- **Timestamps:** created_at, updated_at (server defaults)
- **Relationships:** SQLAlchemy relationships with back_populates
- **Inheritance:** All models inherit from BaseModel with audit trail

### Authentication Flow
```
User Login → JWT Token Generation (URLSafeTimedSerializer)
         ↓
Token Payload includes: id, name, email, role_id, permissions
         ↓
User Type Determined: admin, trainer, or student
         ↓
ProtectedRoute/UserTypeRoute guards frontend routes
         ↓
Trainer/Student IDs stored in token payload for relationship tracking
```

### API Pattern
- **Prefix Convention:** `/api/v1/{resource_type}`
- **Permission Model:** Decorator-based (`@trainer_required("permission.action")`)
- **Response Format:** JSON with status codes
- **Error Handling:** Custom error handlers for ValueError, HTTPException
- **Blueprint Organization:** Modular routes by entity (auth, courses, trainers, etc.)

---

## 2. EXISTING MODELS & RELATIONSHIPS

### Core User Model
```
User (1) ──many──> Student (1)
      │              └── enrollments
      │              └── attendance
      │              └── scores
      │
      └──many──> Trainer (1)
                  └── trainer_subjects
                  └── courses_taught
                  └── lesson_plans
                  └── staff_attendance
```

### Course & Subject Hierarchy
```
Course (1) ──many──> Module
       │       ├── students (many)
       │       └── subjects (many)
       │
       ├── Enrollment (1) ──many──> Score
       │
       └── TrainerCourse (links Course to Trainer)
```

### Existing Attendance Model
```python
class Attendance(BaseModel):
    __tablename__ = 'attendance'
    student_id: UUID (FK: students.id)
    module_id: UUID (FK: modules.id)
    date: Date
    status: String(16)  # e.g., present/absent
```

**LIMITATION:** Current attendance is module-based, not session-based. No real-time tracking, QR codes, or GPS validation.

### Existing Staff Attendance Model
```python
class StaffAttendance(BaseModel):
    __tablename__ = 'staff_attendance'
    trainer_id: UUID (FK: trainers.id)
    term_id: UUID (FK: terms.id)
    date: Date
    status: String
```

---

## 3. EXISTING MODULES & STRUCTURE

### Backend Routes Structure
- `/api/v1/trainer` - Trainer portal (subjects, students, dashboard)
- `/api/v1/student` - Student portal 
- `/api/v1/courses` - Course management
- `/api/v1/modules` - Module management
- `/api/v1/scores` - Score management
- `/api/v1/auth` - Authentication
- `/api/v1/admin/*` - Admin management endpoints

### Frontend Page Structure
```
pages/
├── TrainerDashboardPage.tsx
├── TrainerReportsPage.tsx
├── TrainerStudentProfilePage.tsx
├── TrainerAttendancePage.tsx (EXISTS - basic attendance)
│
├── StudentDashboardPage.tsx
├── StudentSubjectsPage.tsx
├── StudentMarksPage.tsx
└── AttendanceReportPage.tsx (EXISTS - report view)
```

### Frontend Component Structure
```
components/
├── layout/DashboardLayout.tsx (main wrapper)
├── forms/ (form components)
├── tables/ (data tables)
├── charts/ (analytics charts)
├── ui/ (basic UI components)
└── trainer/ (trainer-specific components)
```

---

## 4. MISSING DEPENDENCIES FOR ATTENDANCE MVP

### Backend Requirements
```
qrcode==7.4.2            # QR code generation
Pillow==10.1.0           # Image manipulation for QR
python-socketio==5.10.0  # WebSocket support (optional, for real-time)
geopy==2.3.0             # GPS distance calculation (Haversine)
```

### Frontend Requirements
```
html5-qrcode              # QR code scanner
react-qr-code             # QR display component
```

### Optional (for production scaling)
```
redis==5.0.0             # Session caching
channels==4.0.0          # Django Channels alternative for Flask
```

---

## 5. RECOMMENDED INTEGRATION POINTS

### Backend Integration
1. **New Blueprint:** `/api/v1/attendance` 
   - Session management
   - Student check-in
   - Real-time updates

2. **New Services:** `/services/attendance.py`
   - QR token generation
   - GPS validation
   - Session lifecycle
   - Duplicate prevention

3. **New Validators:** `/validators/attendance.py`
   - GPS radius validation
   - Enrollment verification
   - Session state validation

4. **Extension:** Trainer model relationships
   ```python
   attendance_sessions = relationship("AttendanceSession", back_populates="trainer")
   ```

### Frontend Integration
1. **New Module:** `/src/modules/attendance/`
   - Lecturer components
   - Student components
   - Hooks for QR scanning
   - Services for API calls

2. **New Routes:**
   - `/trainer/attendance` → Start/manage sessions
   - `/trainer/attendance/:sessionId/live` → Live monitoring
   - `/student/attendance/join` → Student QR scanner

3. **Reuse:**
   - DashboardLayout (navigation)
   - Common modal patterns
   - Tailwind theme system
   - Lucide icons
   - Recharts for analytics

---

## 6. DATABASE RELATIONSHIP MAP

### New Tables Required

#### attendance_sessions
```
PK: id (UUID)
├── trainer_id (FK: trainers.id)
├── course_id (FK: courses.id)
├── module_id (FK: modules.id) [OPTIONAL - for module-based attendance]
├── current_token (String unique) [Rotating QR token]
├── session_code (String unique) [Manual entry fallback]
├── qr_seed (String) [Base for token generation]
├── latitude (Float) [Trainer location]
├── longitude (Float) [Trainer location]
├── allowed_radius_meters (Integer) [Default: 100]
├── started_at (DateTime)
├── expires_at (DateTime)
├── status (String enum: active/ended)
├── regeneration_interval (Integer seconds: 20-30)
├── created_at, updated_at, deleted_at (audit)
└── Indexes: current_token, session_code, status, trainer_id
```

#### attendance_records
```
PK: id (UUID)
├── attendance_session_id (FK: attendance_sessions.id)
├── student_id (FK: students.id)
├── latitude (Float) [Student location]
├── longitude (Float) [Student location]
├── checked_in_at (DateTime)
├── device_hash (String) [Device fingerprint]
├── browser_info (String) [User-Agent]
├── ip_address (String) [IP for fraud detection]
├── status (String: success/failed_gps/failed_duplicate)
├── created_at, updated_at, deleted_at (audit)
└── Indexes: student_id, attendance_session_id
    UNIQUE CONSTRAINT: (attendance_session_id, student_id)
```

#### attendance_token_history (OPTIONAL)
```
PK: id (UUID)
├── attendance_session_id (FK: attendance_sessions.id)
├── token (String)
├── token_hash (String) [Hashed for comparison]
├── expires_at (DateTime)
├── created_at (DateTime)
└── Indexes: attendance_session_id, token_hash
```

### Relationship Diagram
```
Trainer (1) ──many──> AttendanceSession
              └── Student (many-to-many through AttendanceRecord)

Course (1) ──many──> AttendanceSession
               └── Enrollment ──> AttendanceRecord

Module (1) ──many──> AttendanceSession (optional)

Student (1) ──many──> AttendanceRecord
    └── enrolled in Course
    └── enrolled in Module
```

---

## 7. EXISTING REUSABLE COMPONENTS

### Backend Patterns
- **Permission Decorator:** `@trainer_required("permission")`  → Reusable for attendance endpoints
- **UUID Parsing:** `parse_uuid()` utility → Use for attendance IDs
- **Soft Delete Pattern:** All models inherit BaseModel → Attendance models use same
- **Error Handlers:** Custom HTTP exception handlers → Extend for attendance errors
- **Response Payload Functions:** `user_payload()`, `student_payload()` → Create `attendance_payload()`

### Frontend Patterns
- **Protected Routes:** `<ProtectedRoute>`, `<UserTypeRoute>` → Wrap attendance pages
- **Modal System:** Existing modal components → Use for QR display
- **Table Component:** Existing tables with pagination → Attendance records table
- **Cards/Sections:** Reusable card layouts → Attendance status cards
- **Icon System:** Lucide React icons → GPS, QR, check icons
- **Color Theme:** Tailwind theme with predefined colors → Use theme colors
- **Loading States:** Existing spinners/skeletons → Use for QR generation

### Hooks to Create
```typescript
useAttendanceSession()      // Manage current session state
useQRScanner()              // Handle QR scanning
useGPSLocation()            // Get user GPS coordinates
useAttendanceRecords()      // Fetch attendance data
```

---

## 8. REFACTOR OPPORTUNITIES

### Immediate
1. **Extract Trainer Portal Services** into `/services/trainer_portal_service.py`
   - Reduces code duplication across routes
   - Easier to mock for tests

2. **Create Attendance Module Base Models**
   - Extend BaseModel with audit fields
   - Pre-create migration

3. **Consolidate Permission Checks**
   - Create permission registry
   - Reduce decorator duplication

### Future
1. **WebSocket Architecture** for real-time updates
   - Could use python-socketio + Redis
   - Or GraphQL subscriptions

2. **Event-Driven Attendance**
   - Publish events on check-in
   - Subscribe to real-time updates

3. **Biometric Integration**
   - Face recognition
   - Fingerprint (future phase)

---

## 9. SECURITY CONSIDERATIONS

### Token Regeneration
- QR token must regenerate every 20-30 seconds
- Old tokens MUST be invalidated immediately
- Token hash stored, not plaintext

### GPS Validation
- Haversine formula for distance calculation
- Flag submissions > allowed radius
- Log suspicious patterns

### Duplicate Prevention
- Unique constraint on (session_id, student_id)
- Rate limit check-in attempts
- Device fingerprinting for fraud detection

### Session Lifecycle
- Auto-expire based on timeout
- Lecturer can end session
- Prevent check-in after session end

---

## 10. IMPLEMENTATION ROADMAP

### Phase 2: Database Design (This Session)
- [ ] Create migration file
- [ ] Define AttendanceSession model
- [ ] Define AttendanceRecord model
- [ ] Define AttendanceTokenHistory model

### Phase 3: Backend Service Layer
- [ ] QR token generation service
- [ ] GPS validation service
- [ ] Session management service
- [ ] Duplicate prevention service

### Phase 4: Backend API Endpoints
- [ ] POST /api/v1/attendance/sessions (create)
- [ ] GET /api/v1/attendance/sessions/{id} (get active)
- [ ] POST /api/v1/attendance/sessions/{id}/end (stop)
- [ ] POST /api/v1/attendance/checkin (student submit)
- [ ] GET /api/v1/attendance/sessions/{id}/records (live count)
- [ ] GET /api/v1/attendance/records (student history)

### Phase 5: Frontend Components
- [ ] Lecturer: Session creation modal
- [ ] Lecturer: QR display page with countdown
- [ ] Lecturer: Live attendance table
- [ ] Student: QR scanner component
- [ ] Student: Manual code entry fallback
- [ ] Student: GPS permission prompt
- [ ] Student: Check-in confirmation

### Phase 6: Real-Time Features
- [ ] WebSocket for live updates (or polling)
- [ ] Attendance count update
- [ ] QR token regeneration indicator

### Phase 7: Security & Polish
- [ ] Rate limiting
- [ ] Device fingerprinting
- [ ] Error handling
- [ ] Loading states
- [ ] Mobile optimization

---

## 11. KEY METRICS FOR MVP SUCCESS

- [ ] QR generates in < 100ms
- [ ] Token regenerates every 20-30s (configurable)
- [ ] GPS validation completes in < 500ms
- [ ] Real-time updates within 1-2 seconds
- [ ] Mobile camera scanner works on Android 8+
- [ ] Session active for trainer configurable (30-120 min)
- [ ] Duplicate prevention works 100%
- [ ] Zero false GPS rejections at < 100m radius

---

## 12. NEXT STEPS

✅ **Phase 1 Complete:** Architecture analysis done

**Ready for:** Phase 2 - Database Design & Migrations

**Dependencies to Install:**
```bash
pip install qrcode[pil] geopy python-socketio
npm install html5-qrcode react-qr-code
```

**Files to Create:**
- [ ] Backend models: `app/models/attendance_session.py`, `app/models/attendance_record.py`
- [ ] Backend services: `app/services/attendance_service.py`
- [ ] Backend validators: `app/validators/attendance_validators.py`
- [ ] Backend routes: `app/routes/attendance.py`
- [ ] Frontend module: `src/modules/attendance/`

---

**Analysis Complete** → Ready to proceed to Phase 2: Database Design
