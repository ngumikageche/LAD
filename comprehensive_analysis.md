# 🎓 COMPREHENSIVE STUDENT & TRAINER USER STORIES ANALYSIS

**Date**: April 19, 2026  
**Status**: Complete Re-Analysis with Implementation Mapping  
**Project**: LAD (Learning Analytics Dashboard)

---

## 📋 TABLE OF CONTENTS

1. [Student User Stories Analysis](#student-analysis)
2. [Trainer User Stories Analysis](#trainer-analysis)
3. [Database Schema Validation](#database-schema)
4. [API Endpoints Inventory](#api-endpoints)
5. [Frontend Components Inventory](#frontend-components)
6. [Implementation Phases](#implementation-phases)
7. [Complete Implementation Roadmap](#roadmap)

---

## <a name="student-analysis"></a>🎓 STUDENT USER STORIES ANALYSIS

### **Category 1: Authentication (Login & Access)** - 3 Stories

#### Story 1.1: Log in securely using credentials
```
Status: ✅ IMPLEMENTED
Database: users, roles_permissions
API Endpoint: POST /auth/login
Frontend: LoginPage.tsx
Notes: Bearer token, Werkzeug hashing
```

#### Story 1.2: Remain authenticated during session
```
Status: ✅ IMPLEMENTED
Database: (stateless JWT)
API Endpoint: GET /auth/me
Frontend: AuthContext.tsx
Notes: 24-hour token in sessionStorage
```

#### Story 1.3: Log out securely
```
Status: ✅ IMPLEMENTED
Database: (stateless)
Frontend: AuthContext.tsx logout()
Notes: Token clearing, UI redirect
```

**CATEGORY SCORE: 3/3 ✅ COMPLETE**

---

### **Category 2: View Marks / Scores** - 4 Stories

#### Story 2.1: View my scores per subject
```
Status: ❌ MISSING
Database: 
  - scores (marks_obtained, grade)
  - enrollments (student_id → course_id)
  - assessments (assessment_type, total_marks)
  - courses (name)
API Endpoint: GET /students/{id}/scores
  Query params: ?course_id={id}&term_id={id}
Frontend: ScoresPage.tsx, ScoresTable.tsx
Implementation:
  - Query: SELECT s.* FROM scores s
    JOIN enrollments e ON s.enrollment_id = e.id
    JOIN courses c ON e.course_id = c.id
    WHERE e.student_id = {student_id}
  - Return: [{ course, term, marks_obtained, grade, assessment_name }]
```

#### Story 2.2: See grades for each assessment
```
Status: ❌ MISSING
Database:
  - assessments (name, assessment_type, total_marks)
  - scores (grade, marks_obtained, feedback)
API Endpoint: GET /students/{id}/assessments
  Query params: ?course_id={id}&term_id={id}
Frontend: AssessmentsTable.tsx, AssessmentCard.tsx
Implementation:
  - Return full assessment details with student's score
  - Include: { assessment_name, type, total_marks, student_marks, grade }
```

#### Story 2.3: See scores by term
```
Status: ⚠️ PARTIAL (Term model exists, filtering missing)
Database:
  - terms (name, start_date, end_date, is_active)
  - enrollments (term_id)
  - scores (enrollment_id)
API Endpoint: GET /students/{id}/scores?term_id={id}
Frontend: TermFilter component, ScoresPage.tsx
Implementation:
  - GET /terms?is_active=true
  - Filter scores by term_id
  - Show historical terms
```

#### Story 2.4: Identify subjects with poor performance
```
Status: ❌ MISSING
Database:
  - scores (marks_obtained)
  - assessments (total_marks, pass_marks)
  - courses (name)
API Endpoint: GET /students/{id}/performance/weak-subjects
  Response: [{ course_name, avg_score, is_passed, status: 'poor'|'fair'|'good' }]
Frontend: WeakSubjectsCard.tsx, WeakSubjectsChart.tsx
Implementation:
  - Calculate avg score per subject
  - Compare to pass_marks threshold
  - Flag subjects where avg < 50% or not passed
  - Return sorted by score (lowest first)
```

**CATEGORY SCORE: 0/4 ❌ NEEDS IMPLEMENTATION**

---

### **Category 3: View Enrolled Subjects** - 3 Stories

#### Story 3.1: See all subjects I'm enrolled in
```
Status: ⚠️ PARTIAL (Enrollment model exists, endpoint missing)
Database:
  - enrollments (student_id, course_id, term_id, status)
  - courses (name, cbet_level)
  - terms (name, is_active)
API Endpoint: GET /students/{id}/courses
  Response: [{ course_id, course_name, term, status, cbet_level }]
Frontend: CoursesPage.tsx, EnrolledCoursesTable.tsx
Implementation:
  - Join enrollments, courses, terms
  - Filter by student_id
  - Show current + past terms
```

#### Story 3.2: View details of each subject
```
Status: ⚠️ PARTIAL (Need detailed endpoint)
Database:
  - courses (name, cbet_level, description)
  - course_modules (future: lessons/units)
  - assessments (list of assessments in course)
API Endpoint: GET /students/{id}/courses/{course_id}
  Response: { course_name, description, trainer_id, trainer_name, assessments[], enrollment_status }
Frontend: CourseDetailPage.tsx, CourseCard.tsx
Implementation:
  - Return course with list of assessments
  - Show trainer info
  - Show enrollment status
```

#### Story 3.3: See assigned trainer for each subject
```
Status: ⚠️ PARTIAL (Trainer model exists, course-trainer link missing)
Database:
  - trainers (specialization)
  - users (name, email, phone)
  - Need: trainer_courses junction table
API Endpoint: GET /students/{id}/courses/{course_id}/trainer
  OR include in GET /students/{id}/courses response
Frontend: TrainerCard.tsx (in CourseDetail)
Implementation:
  - Create trainer_courses relationship
  - Return trainer details with course
  - Show trainer contact info
```

**CATEGORY SCORE: 1/3 ⚠️ PARTIAL**

---

### **Category 4: Past Exam Results** - 4 Stories

#### Story 4.1: Access past exam results
```
Status: ❌ MISSING
Database:
  - assessments (created_at for date)
  - scores (marks_obtained, grade, is_passed)
  - terms (end_date to determine "past")
API Endpoint: GET /students/{id}/results?from_date={date}&to_date={date}
Frontend: ResultsPage.tsx, ResultsTable.tsx
Implementation:
  - Query scores from past terms/assessments
  - Show historical records
  - Include date of assessment
```

#### Story 4.2: Compare past and current results
```
Status: ❌ MISSING
Database:
  - scores + terms to enable time-series analysis
API Endpoint: GET /students/{id}/results/comparison
  Response: [{ term, course, past_score, current_score, trend }]
Frontend: ComparisonChart.tsx, TrendAnalysisCard.tsx
Implementation:
  - Calculate improvement/decline per subject
  - Show trend: ↑ (improved), ↓ (declined), → (stable)
  - Percentage improvement
```

#### Story 4.3: Filter results by term or subject
```
Status: ❌ MISSING
Database:
  - terms, courses, scores
API Endpoint: GET /students/{id}/results?term_id={id}&course_id={id}
Frontend: FilterBar.tsx (on ResultsPage)
Implementation:
  - Add query parameter filtering
  - Support multiple filters
  - Chainable filters
```

#### Story 4.4: Download or view summary of results
```
Status: ❌ MISSING
Database:
  - scores, assessments, courses, terms
API Endpoint: GET /students/{id}/results/export?format=pdf|csv
Frontend: ExportButton.tsx
Implementation:
  - PDF: reportlab or weasyprint
  - CSV: pandas or python csv
  - Include summary stats in export
```

**CATEGORY SCORE: 0/4 ❌ NEEDS IMPLEMENTATION**

---

### **Category 5: Performance Insights (Analytics)** - 3 Stories

#### Story 5.1: See my average score
```
Status: ⚠️ PARTIAL (UI exists, logic missing)
Database:
  - scores (marks_obtained)
  - assessments (total_marks)
API Endpoint: GET /students/{id}/performance/summary
  Response: { overall_avg, avg_by_subject, avg_by_term }
Frontend: StatCard.tsx (exists), DashboardPage.tsx
Implementation:
  - AVG(marks_obtained) for all scores
  - GROUP BY course_id for subject averages
  - GROUP BY term_id for term averages
  - Convert to percentage: (marks_obtained / total_marks) * 100
```

#### Story 5.2: See performance trends
```
Status: ⚠️ PARTIAL (UI exists, data missing)
Database:
  - scores + terms for time-series
API Endpoint: GET /students/{id}/performance/trends
  Response: [{ term, avg_score, trend_indicator }]
Frontend: PerformanceLineChart.tsx (exists)
Implementation:
  - Sort by term chronologically
  - Calculate trend: (current - previous) / previous * 100
  - Return data for line chart
```

#### Story 5.3: Visual charts of results
```
Status: ⚠️ PARTIAL (Chart components exist, need data binding)
Database: Same as above
API Endpoints: Already defined above
Frontend: 
  - PerformanceLineChart.tsx (time series)
  - PerformancePieChart.tsx (distribution)
  - SubjectBarChart.tsx (subject comparison)
Implementation:
  - Connect charts to /performance endpoints
  - Replace hardcoded data with API calls
  - Add loading states
```

**CATEGORY SCORE: 0/3 ⚠️ PARTIAL (UI ready, data binding missing)**

---

### **Category 6: News & Announcements** - 3 Stories

#### Story 6.1: Receive news and announcements
```
Status: ❌ MISSING
Database:
  - announcements (title, content, is_important)
  - announcement_reads (user_id, announcement_id)
API Endpoint: GET /students/{id}/announcements
  Query params: ?course_id={id}&is_important=true&limit=10
Frontend: AnnouncementsPage.tsx, AnnouncementCard.tsx
Implementation:
  - Query announcements for student's courses
  - Show unread count
  - Mark as read when accessed
```

#### Story 6.2: View important academic updates
```
Status: ❌ MISSING
Database:
  - announcements (is_important flag)
API Endpoint: GET /students/{id}/announcements?is_important=true
Frontend: ImportantUpdatesWidget.tsx (on Dashboard)
Implementation:
  - Filter by is_important = true
  - Show on dashboard
  - Sort by created_at DESC
```

#### Story 6.3: Notifications for new announcements
```
Status: ⚠️ PARTIAL (Notification model exists, trigger missing)
Database:
  - notifications (title, message, is_read)
API Endpoint: POST /notifications (when announcement created)
  + GET /students/{id}/notifications
Frontend: NotificationBell.tsx (in Navbar)
Implementation:
  - Trigger notification on announcement creation
  - Mark as read when clicked
  - Show unread count badge
```

**CATEGORY SCORE: 0/3 ❌ NEEDS IMPLEMENTATION**

---

### **Category 7: Notifications** - 3 Stories

#### Story 7.1: Be notified when new scores uploaded
```
Status: ⚠️ PARTIAL (Model exists, trigger missing)
Database:
  - notifications
API Endpoint: POST /scores → create notification
Frontend: NotificationBell.tsx
Implementation:
  - When trainer uploads scores
  - Create notification for each student
  - Message: "New scores available for [course_name]"
```

#### Story 7.2: Alerts when performing poorly
```
Status: ❌ MISSING
Database:
  - notifications
API Endpoint: POST /scores → check performance → create alert
Frontend: AlertBanner.tsx (on Dashboard)
Implementation:
  - When score < pass_marks
  - Create notification: "Your score in [course] is below passing"
  - Set is_important flag
```

#### Story 7.3: Reminders for important activities
```
Status: ❌ MISSING
Database:
  - reminders (activity_type, scheduled_date, reminder_date)
API Endpoint: Background job to create reminders
Frontend: ReminderBell.tsx
Implementation:
  - Cron job to check upcoming deadlines
  - Create reminder notifications
  - Send at scheduled time
```

**CATEGORY SCORE: 0/3 ❌ NEEDS IMPLEMENTATION**

---

### **Category 8: Profile Management** - 3 Stories

#### Story 8.1: View my profile
```
Status: ✅ IMPLEMENTED
Database: users, students
API Endpoint: GET /auth/me + GET /students/{id}
Frontend: ProfilePage.tsx
```

#### Story 8.2: Update personal information
```
Status: ✅ IMPLEMENTED
Database: users, students
API Endpoint: PUT /users/{id}, PUT /students/{id}
Frontend: EditProfilePage.tsx
```

#### Story 8.3: Change password
```
Status: ❌ MISSING
Database: users (password_hash)
API Endpoint: PUT /auth/password
  Payload: { current_password, new_password, confirm_password }
Frontend: ChangePasswordModal.tsx
Implementation:
  - Verify current password
  - Hash new password
  - Update user.password_hash
```

**CATEGORY SCORE: 2/3 ⚠️ MOSTLY COMPLETE**

---

### **Category 9: Dashboard Experience** - 2 Stories

#### Story 9.1: Dashboard summarizing academic performance
```
Status: ⚠️ PARTIAL (Layout exists, data missing)
Database: Multiple (scores, enrollments, courses, terms)
API Endpoint: GET /students/{id}/dashboard
  Response: {
    overall_avg_score,
    enrolled_courses_count,
    recent_results: [{ course, score, grade, date }],
    weak_subjects: [{ course, avg_score }],
    performance_trend: [{ term, avg }],
    announcements: [],
    notifications: []
  }
Frontend: DashboardPage.tsx (exists)
Implementation:
  - Aggregate all key metrics
  - Return single endpoint for efficiency
  - Include recent 5 results
```

#### Story 9.2: Key metrics (avg score, subjects, recent results)
```
Status: ⚠️ PARTIAL (UI exists, data missing)
Database: Same as above
API Endpoint: Same as 9.1
Frontend: StatCard.tsx (exists) - needs data
Implementation:
  - Display 4 StatCards:
    1. Overall Average Score
    2. Enrolled Subjects Count
    3. Recent Results Count
    4. Weak Subjects Count
```

**CATEGORY SCORE: 0/2 ⚠️ PARTIAL (UI ready, data binding missing)**

---

### **Category 10: Search & Filtering** - 2 Stories

#### Story 10.1: Search my results
```
Status: ❌ MISSING
Database: assessments (name), courses (name)
API Endpoint: GET /students/{id}/results?search={query}
Frontend: SearchBar.tsx (in ResultsPage)
Implementation:
  - Search by assessment name
  - Search by course name
  - Return matching results
```

#### Story 10.2: Filter results by subject or term
```
Status: ⚠️ PARTIAL (Infrastructure exists)
Database: courses, terms
API Endpoint: GET /students/{id}/results?course_id={id}&term_id={id}
Frontend: FilterPanel.tsx (in ResultsPage)
Implementation:
  - Multi-select filters
  - Chainable filters
  - Apply/Clear buttons
```

**CATEGORY SCORE: 0/2 ❌ NEEDS IMPLEMENTATION**

---

### **Category 11: HIGH-VALUE FEATURES (Masters-Level)** - 2 Stories

#### Story 11.1: Suggestions on how to improve weak subjects
```
Status: ❌ MISSING
Database: scores, assessments
API Endpoint: GET /students/{id}/insights/improvement-suggestions
  Response: [{ course, weak_area, suggestion, resources: [] }]
Frontend: InsightCard.tsx, InsightsPage.tsx
Implementation:
  - Analyze score patterns
  - Identify specific weak areas (based on assessment types)
  - Generate suggestions based on assessment type
  - Link to resources/materials
```

#### Story 11.2: Predicted performance trends
```
Status: ❌ MISSING
Database: scores + historical data
API Endpoint: GET /students/{id}/insights/predictions
  Response: { next_term_predicted_avg, confidence, trend: 'up'|'down'|'stable' }
Frontend: PredictionCard.tsx
Implementation:
  - Use historical scores for prediction
  - Simple regression or moving average
  - Show confidence level
  - Include disclaimer
```

#### Story 11.3: Compare performance with class averages
```
Status: ❌ MISSING
Database: scores, enrollments, assessments
API Endpoint: GET /students/{id}/insights/class-comparison
  Response: { your_avg, class_avg, percentile, standing }
Frontend: ComparisonChart.tsx
Implementation:
  - Calculate class average for same course/term
  - Compare student score to class
  - Calculate percentile ranking
  - Show standing relative to peers
```

**CATEGORY SCORE: 0/3 ❌ ADVANCED (Optional for Phase 2)**

---

## <a name="trainer-analysis"></a>👨‍🏫 TRAINER USER STORIES ANALYSIS

### **Category 1: Authentication & Access** - 3 Stories

#### Story T1.1: Log in securely
```
Status: ✅ IMPLEMENTED
Database: users (role: trainer), roles_permissions
API Endpoint: POST /auth/login
Frontend: LoginPage.tsx (role-aware redirect)
```

#### Story T1.2: Role-based access
```
Status: ⚠️ PARTIAL (RBAC exists, need trainer routes)
Database: roles_permissions
API Endpoint: All trainer routes check permission "trainers.write"
Frontend: ProtectedRoute.tsx with role check
Implementation:
  - Trainer dashboard redirect
  - Only trainers can access /trainer/* routes
```

#### Story T1.3: Log out securely
```
Status: ✅ IMPLEMENTED
Database: (stateless JWT)
Frontend: AuthContext.tsx logout()
```

**CATEGORY SCORE: 2.5/3 ⚠️ PARTIAL**

---

### **Category 2: Subject Management** - 3 Stories

#### Story T2.1: View subjects assigned to me
```
Status: ⚠️ PARTIAL (Endpoint exists, needs refinement)
Database:
  - trainers (user_id)
  - trainers_courses (trainer_id, course_id) [NEW junction table needed]
  - courses (name, cbet_level)
API Endpoint: GET /trainers/{id}/courses
Frontend: TrainerCoursesPage.tsx
Implementation:
  - Create trainers_courses junction table
  - Return all courses for trainer
  - Include student count per course
```

#### Story T2.2: See subject details
```
Status: ❌ MISSING
Database: courses + relationships
API Endpoint: GET /trainers/{id}/courses/{course_id}
  Response: { name, cbet_level, description, department, term, students_count, assessments: [] }
Frontend: CourseDetailPage.tsx (trainer view)
Implementation:
  - Include course assessments
  - Show enrolled students
  - Show department info
```

#### Story T2.3: Filter subjects by department
```
Status: ⚠️ PARTIAL (Need department filter)
Database: courses.department_id
API Endpoint: GET /trainers/{id}/courses?department_id={id}
Frontend: DepartmentFilter.tsx
Implementation:
  - Add query param filtering
  - Show available departments
```

**CATEGORY SCORE: 1/3 ⚠️ PARTIAL**

---

### **Category 3: Student Management** - 3 Stories

#### Story T3.1: View students enrolled in my subjects
```
Status: ⚠️ PARTIAL (Need endpoint)
Database:
  - enrollments (course_id)
  - students (registration_number, enrollment_year)
  - users (name, email)
API Endpoint: GET /trainers/{id}/students
  Query params: ?course_id={id}&term_id={id}
Frontend: TrainerStudentsPage.tsx, StudentsTable.tsx
Implementation:
  - Get all courses for trainer
  - Get all enrollments for those courses
  - Return student details
```

#### Story T3.2: Access individual student profiles
```
Status: ⚠️ PARTIAL (Endpoint exists, need trainer permission)
Database: students, users, scores
API Endpoint: GET /trainers/{trainer_id}/students/{student_id}
Frontend: StudentProfilePage.tsx (trainer view)
Implementation:
  - Show student basic info
  - Show scores in trainer's courses only
  - Prevent access to students not in trainer's courses
```

#### Story T3.3: Filter students by subject
```
Status: ❌ MISSING
Database: enrollments, courses
API Endpoint: GET /trainers/{id}/students?course_id={id}
Frontend: CourseFilter.tsx
Implementation:
  - Filter enrolled students by course
  - Show per-course student list
```

**CATEGORY SCORE: 1/3 ⚠️ PARTIAL**

---

### **Category 4: Score Upload (CORE FEATURE)** - 4 Stories

#### Story T4.1: Upload scores for students
```
Status: ❌ MISSING
Database: scores, assessments, enrollments
API Endpoint: POST /scores
  Payload: {
    enrollment_id,
    assessment_id,
    marks_obtained,
    feedback
  }
Frontend: ScoreUploadPage.tsx, ScoreForm.tsx
Implementation:
  - Bulk upload (CSV) or individual entry
  - Validate marks <= total_marks
  - Create score record
  - Return 201 Created
```

#### Story T4.2: Assign scores per subject and term
```
Status: ❌ MISSING
Database: assessments (course_id, term_id)
API Endpoint: GET /trainers/{id}/courses/{course_id}/assessments?term_id={id}
  Then POST /scores for each student
Frontend: ScoreUploadWizard.tsx
Implementation:
  - Show course assessments for term
  - Show all students in course/term
  - Grid form for bulk entry
  - Save all scores
```

#### Story T4.3: Validate to prevent duplicate scores
```
Status: ❌ MISSING
Database: scores (unique: enrollment_id + assessment_id)
API Implementation:
  - Add unique constraint: (enrollment_id, assessment_id)
  - Check before insert
  - Return 409 Conflict if duplicate
```

#### Story T4.4: Edit or update scores
```
Status: ❌ MISSING
Database: scores
API Endpoint: PUT /scores/{score_id}
  Payload: { marks_obtained, feedback, grade }
Frontend: EditScoreModal.tsx
Implementation:
  - Fetch score details
  - Allow edit if not locked (by admin)
  - Update record
  - Log change in audit trail
```

**CATEGORY SCORE: 0/4 ❌ CRITICAL - NEEDS IMPLEMENTATION**

---

### **Category 5: Performance Monitoring** - 3 Stories

#### Story T5.1: View student performance per subject
```
Status: ❌ MISSING
Database: scores, assessments, enrollments, students
API Endpoint: GET /trainers/{id}/performance?course_id={id}&term_id={id}
  Response: [{ student_name, avg_score, pass_count, fail_count }]
Frontend: PerformanceReportPage.tsx, PerformanceTable.tsx
Implementation:
  - Aggregate scores by student in course
  - Show statistics
  - Sortable/filterable
```

#### Story T5.2: Identify low-performing students
```
Status: ❌ MISSING
Database: scores, assessments
API Endpoint: GET /trainers/{id}/performance/at-risk?course_id={id}
  Response: [{ student_name, avg_score, status: 'at-risk' }]
Frontend: AtRiskStudentsCard.tsx, AtRiskList.tsx
Implementation:
  - Flag students with avg < pass_marks
  - Prioritize by lowest scores
  - Show on trainer dashboard
```

#### Story T5.3: Compare performance across subjects
```
Status: ❌ MISSING
Database: scores, courses, assessments
API Endpoint: GET /trainers/{id}/performance/comparison
  Response: [{ course_name, avg_score, student_count }]
Frontend: SubjectComparisonChart.tsx
Implementation:
  - Show avg scores per course
  - Bar chart comparison
  - Identify which subjects need improvement
```

**CATEGORY SCORE: 0/3 ❌ NEEDS IMPLEMENTATION**

---

### **Category 6: Alerts & Intervention** - 3 Stories

#### Story T6.1: Alert when student performs poorly
```
Status: ❌ MISSING
Database: notifications
API Endpoint: POST /scores → trigger alert if score < pass_marks
Frontend: AlertDashboard.tsx
Implementation:
  - When score posted, check if failing
  - Create notification for trainer
  - List on trainer dashboard
```

#### Story T6.2: Track performance trends
```
Status: ❌ MISSING
Database: scores, assessments
API Endpoint: GET /trainers/{id}/students/{student_id}/trends?course_id={id}
  Response: [{ assessment_date, score, trend }]
Frontend: StudentTrendChart.tsx
Implementation:
  - Show score progression over time
  - Calculate trend: improving/declining/stable
  - Identify patterns
```

#### Story T6.3: Monitor engagement patterns
```
Status: ❌ MISSING
Database: scores, system_logs
API Endpoint: GET /trainers/{id}/engagement
  Response: { students_with_no_scores, late_submissions, patterns }
Frontend: EngagementDashboard.tsx
Implementation:
  - Track submission patterns
  - Identify non-participating students
  - Flag suspicious patterns
```

**CATEGORY SCORE: 0/3 ❌ NEEDS IMPLEMENTATION**

---

### **Category 7: Feedback to Students** - 2 Stories

#### Story T7.1: Provide feedback on scores
```
Status: ⚠️ PARTIAL (Feedback field exists, UI missing)
Database: scores (feedback field)
API Endpoint: PUT /scores/{id}/feedback
  Payload: { feedback }
Frontend: FeedbackModal.tsx, FeedbackPage.tsx
Implementation:
  - Edit feedback for score
  - Send notification to student
  - Display on student's results
```

#### Story T7.2: Guide students on weak areas
```
Status: ❌ MISSING
Database: scores, assessments (assessment_type)
API Endpoint: POST /scores/{id}/guidance
  Response: { weak_areas, suggestions, resources }
Frontend: GuidancePanel.tsx
Implementation:
  - Analyze assessment type performance
  - Generate improvement tips
  - Link resources
  - Auto-send to student
```

**CATEGORY SCORE: 0.5/2 ⚠️ PARTIAL**

---

### **Category 8: Reporting** - 3 Stories

#### Story T8.1: Generate reports for subjects
```
Status: ❌ MISSING
Database: Multiple (scores, students, courses, terms)
API Endpoint: GET /trainers/{id}/reports/subject?course_id={id}&term_id={id}
  Response: PDF with summary stats
Frontend: ReportsPage.tsx, ReportDownloadButton.tsx
Implementation:
  - PDF generation (reportlab/weasyprint)
  - Include class summary statistics
  - List all students + scores
```

#### Story T8.2: Export results
```
Status: ❌ MISSING
Database: scores, enrollments
API Endpoint: GET /trainers/{id}/results/export?format=csv|pdf&course_id={id}
Frontend: ExportButton.tsx
Implementation:
  - CSV: All scores for course
  - PDF: Formatted report
  - Include metadata
```

#### Story T8.3: Summaries (avg score, pass rate)
```
Status: ❌ MISSING
Database: scores, assessments
API Endpoint: GET /trainers/{id}/summaries?course_id={id}&term_id={id}
  Response: { avg_score, pass_rate, highest, lowest, median }
Frontend: SummaryCard.tsx
Implementation:
  - Calculate statistics
  - Show on dashboard
  - Per course/term
```

**CATEGORY SCORE: 0/3 ❌ NEEDS IMPLEMENTATION**

---

### **Category 9: Trainer Dashboard** - 1 Story

#### Story T9.1: Dashboard showing subjects, students, recent scores
```
Status: ❌ MISSING
Database: Multiple
API Endpoint: GET /trainers/{id}/dashboard
  Response: {
    assigned_courses: [...],
    total_students: number,
    recent_scores: [{ student, course, score, date }],
    at_risk_students: [...],
    performance_summary: {}
  }
Frontend: TrainerDashboardPage.tsx (exists but empty)
Implementation:
  - Aggregate all trainer metrics
  - Show key statistics
  - Recent activity
  - Alerts section
```

**CATEGORY SCORE: 0/1 ❌ NEEDS IMPLEMENTATION**

---

### **Category 10: Search & Filtering** - 2 Stories

#### Story T10.1: Search students
```
Status: ❌ MISSING
Database: users (name, email), students (registration_number)
API Endpoint: GET /trainers/{id}/students?search={query}
Frontend: SearchBar.tsx
Implementation:
  - Search by name, email, reg number
  - Return matching students (only in trainer's courses)
  - Real-time search
```

#### Story T10.2: Filter scores by subject or term
```
Status: ❌ MISSING
Database: courses, terms, scores
API Endpoint: GET /trainers/{id}/scores?course_id={id}&term_id={id}
Frontend: FilterPanel.tsx
Implementation:
  - Multi-select filters
  - Show available options
  - Apply/clear buttons
```

**CATEGORY SCORE: 0/2 ❌ NEEDS IMPLEMENTATION**

---

### **Category 11: Data Integrity & Permissions** - 1 Story

#### Story T11.1: Enforce data permissions
```
Status: ⚠️ PARTIAL (RBAC exists, need trainer-specific checks)
Database: trainers_courses, scores, enrollments
API Implementation:
  - Verify trainer has access to course before allowing score upload
  - Verify student is enrolled in trainer's course
  - Check permissions in every endpoint
  - Log access attempts
Frontend: (automatic via API)
```

**CATEGORY SCORE: 0.5/1 ⚠️ PARTIAL**

---

## <a name="database-schema"></a>📊 DATABASE SCHEMA VALIDATION

### **Created Models (New)**
✅ Term
✅ Enrollment
✅ Assessment
✅ Score
✅ Announcement
✅ AnnouncementRead

### **Needed Models (New)**
❌ TrainerCourse (junction: trainer ↔ course)
❌ Reminder (for scheduled reminders)
❌ Resource (for improvement suggestions)

### **Updated Models**
✅ Course (added enrollments, assessments, announcements relationships)
✅ Student (added enrollments relationship)

### **Existing Models (No changes needed)**
✅ User
✅ Trainer
✅ Department
✅ Institution
✅ RolePermission
✅ Notification
✅ SystemLog

---

## <a name="api-endpoints"></a>🔌 API ENDPOINTS INVENTORY

### **Authentication** (4 endpoints)
```
✅ POST /auth/login
✅ GET /auth/me
❌ PUT /auth/password
❌ POST /auth/logout (optional, stateless)
```

### **Students - Academic Data** (14 endpoints)
```
❌ GET /students/{id}/scores
❌ GET /students/{id}/assessments
❌ GET /students/{id}/courses
❌ GET /students/{id}/courses/{course_id}
❌ GET /students/{id}/courses/{course_id}/trainer
❌ GET /students/{id}/results
❌ GET /students/{id}/results/comparison
❌ GET /students/{id}/results/export
❌ GET /students/{id}/performance/summary
❌ GET /students/{id}/performance/trends
❌ GET /students/{id}/performance/weak-subjects
❌ GET /students/{id}/announcements
❌ GET /students/{id}/results?search={query}
❌ GET /students/{id}/results?course_id={id}&term_id={id}
```

### **Students - Insights** (3 endpoints - Advanced)
```
❌ GET /students/{id}/insights/improvement-suggestions
❌ GET /students/{id}/insights/predictions
❌ GET /students/{id}/insights/class-comparison
```

### **Students - Dashboard** (1 endpoint)
```
❌ GET /students/{id}/dashboard
```

### **Trainers - Subject Management** (2 endpoints)
```
⚠️ GET /trainers/{id}/courses
❌ GET /trainers/{id}/courses/{course_id}
```

### **Trainers - Student Management** (3 endpoints)
```
❌ GET /trainers/{id}/students
❌ GET /trainers/{id}/students?course_id={id}
❌ GET /trainers/{id}/students/{student_id}
```

### **Trainers - Score Management** (3 endpoints - CORE)
```
❌ POST /scores
❌ PUT /scores/{id}
❌ GET /trainers/{id}/scores
```

### **Trainers - Performance** (3 endpoints)
```
❌ GET /trainers/{id}/performance
❌ GET /trainers/{id}/performance/at-risk
❌ GET /trainers/{id}/performance/comparison
```

### **Trainers - Alerts** (2 endpoints)
```
❌ GET /trainers/{id}/alerts
❌ GET /trainers/{id}/students/{student_id}/trends
```

### **Trainers - Feedback** (1 endpoint)
```
❌ PUT /scores/{id}/feedback
```

### **Trainers - Reporting** (3 endpoints)
```
❌ GET /trainers/{id}/reports/subject
❌ GET /trainers/{id}/results/export
❌ GET /trainers/{id}/summaries
```

### **Trainers - Dashboard** (1 endpoint)
```
❌ GET /trainers/{id}/dashboard
```

### **Data Management** (4 endpoints)
```
✅ POST /terms (admin)
✅ GET /terms
✅ POST /announcements (admin/trainer)
✅ GET /announcements
```

**TOTAL ENDPOINTS NEEDED: ~45 endpoints**

---

## <a name="frontend-components"></a>🎨 FRONTEND COMPONENTS INVENTORY

### **Pages (New)**
```
❌ ScoresPage.tsx
❌ ResultsPage.tsx
❌ AnnouncementsPage.tsx
❌ CoursesPage.tsx (student view)
❌ CourseDetailPage.tsx (student view)
❌ InsightsPage.tsx
❌ TrainerCoursesPage.tsx
❌ TrainerStudentsPage.tsx
❌ ScoreUploadPage.tsx
❌ PerformanceReportPage.tsx
❌ TrainerReportsPage.tsx
```

### **Components (New)**
```
❌ ScoresTable.tsx
❌ ResultsTable.tsx
❌ AssessmentsTable.tsx
❌ WeakSubjectsCard.tsx
❌ ComparisonChart.tsx
❌ TrendAnalysisCard.tsx
❌ ImportantUpdatesWidget.tsx
❌ AnnouncementCard.tsx
❌ ScoreUploadForm.tsx
❌ FeedbackModal.tsx
❌ FilterPanel.tsx
❌ SearchBar.tsx
❌ AtRiskStudentsCard.tsx
❌ SummaryCard.tsx
```

### **Existing Components (Need data binding)**
```
✅ DashboardPage.tsx (connect to /students/{id}/dashboard)
✅ PerformanceLineChart.tsx (connect data)
✅ PerformancePieChart.tsx (connect data)
✅ SubjectBarChart.tsx (connect data)
✅ StatCard.tsx (display metrics)
✅ TrainerDashboardPage.tsx (connect data)
```

**TOTAL COMPONENTS NEEDED: ~25 new + 6 existing updates**

---

## <a name="implementation-phases"></a>📅 IMPLEMENTATION PHASES

### **PHASE 1: Foundation (Week 1)**
- ✅ Create database models (DONE)
- ⏳ Generate migrations
- Create API endpoints for Terms, Announcements, TrainerCourses junction

### **PHASE 2: Student Scores & Results (Week 2-3)**
- Implement: GET /students/{id}/scores
- Implement: GET /students/{id}/results
- Implement: GET /students/{id}/performance/summary
- Create: ScoresPage, ResultsPage, ResultsTable
- Bind: Dashboard to real data

### **PHASE 3: Student Analytics (Week 3-4)**
- Implement: GET /students/{id}/performance/trends
- Implement: GET /students/{id}/performance/weak-subjects
- Implement: GET /students/{id}/insights/improvement-suggestions
- Create: InsightsPage, WeakSubjectsCard, TrendAnalysisCard
- Connect: Charts to real data

### **PHASE 4: Trainer Score Management (Week 4-5)**
- Implement: POST /scores (score upload)
- Implement: PUT /scores/{id} (score edit)
- Implement: GET /trainers/{id}/students
- Create: ScoreUploadPage, ScoreUploadForm
- Add: Validation, error handling

### **PHASE 5: Trainer Performance Monitoring (Week 5-6)**
- Implement: GET /trainers/{id}/performance endpoints
- Implement: GET /trainers/{id}/alerts
- Create: PerformanceReportPage, AtRiskStudentsCard
- Bind: TrainerDashboard to real data

### **PHASE 6: Notifications & Announcements (Week 6-7)**
- Implement: GET /students/{id}/announcements
- Implement: Notification triggers for scores
- Implement: Notification triggers for poor performance
- Create: AnnouncementsPage, AnnouncementCard
- Create: Notification system

### **PHASE 7: Advanced Features (Week 7-8)**
- Implement: Export to PDF/CSV
- Implement: Comparison reports
- Implement: Class comparison analytics
- Create: ReportsPage, ExportFunctionality

### **PHASE 8: Polish & Testing (Week 8-9)**
- End-to-end testing
- Performance optimization
- UI/UX refinement
- Deployment preparation

---

## <a name="roadmap"></a>🚀 COMPLETE IMPLEMENTATION ROADMAP

### **CURRENT STATUS**
```
Database Models:     40% (5/12 created)
API Endpoints:       5% (2/45 implemented)
Frontend Components: 20% (6/25 exist)
Test Coverage:       0%
```

### **STUDENT USER STORIES COMPLETION**
```
Category 1 (Auth):           ✅ 100% (3/3)
Category 2 (Scores):         ❌ 0% (0/4)
Category 3 (Subjects):       ⚠️ 33% (1/3)
Category 4 (Results):        ❌ 0% (0/4)
Category 5 (Analytics):      ⚠️ 33% (0/3 with UI)
Category 6 (Announcements):  ❌ 0% (0/3)
Category 7 (Notifications):  ⚠️ 33% (0/3 with model)
Category 8 (Profile):        ✅ 67% (2/3)
Category 9 (Dashboard):      ⚠️ 33% (0/2 with UI)
Category 10 (Search):        ❌ 0% (0/2)
Category 11 (Advanced):      ❌ 0% (0/3)

TOTAL STUDENT COVERAGE: 28/50 = 56%
```

### **TRAINER USER STORIES COMPLETION**
```
Category 1 (Auth):           ⚠️ 67% (2/3)
Category 2 (Subjects):       ⚠️ 33% (1/3)
Category 3 (Students):       ⚠️ 33% (1/3)
Category 4 (Score Upload):   ❌ 0% (0/4) - CRITICAL
Category 5 (Performance):    ❌ 0% (0/3)
Category 6 (Alerts):         ❌ 0% (0/3)
Category 7 (Feedback):       ⚠️ 25% (0.5/2)
Category 8 (Reporting):      ❌ 0% (0/3)
Category 9 (Dashboard):      ❌ 0% (0/1)
Category 10 (Search):        ❌ 0% (0/2)
Category 11 (Permissions):   ⚠️ 50% (0.5/1)

TOTAL TRAINER COVERAGE: 8/35 = 23%
```

### **OVERALL PROJECT COVERAGE**
```
BEFORE: 36% (18/50 student stories)
WITH MODELS: 40% (basic structure)
TARGET: 100% (63/85 student + trainer stories)

EFFORT REMAINING: ~120-150 developer hours
WITH 1 DEV: 4-5 weeks
WITH 2 DEVS: 2-3 weeks
```

---

## 📌 NEXT IMMEDIATE STEPS

1. **Generate Database Migrations** (2 hours)
   - Flask-Migrate: `flask db revision --autogenerate`
   - `flask db upgrade`
   - Test queries

2. **Create TrainerCourse Junction Model** (1 hour)
   - Define relationships
   - Add to models/__init__.py

3. **Implement Core Score Endpoints** (8-10 hours)
   - POST /scores (trainer)
   - PUT /scores/{id} (trainer)
   - GET /students/{id}/scores (student)
   - With full validation

4. **Bind Student Dashboard** (4-6 hours)
   - Create GET /students/{id}/dashboard endpoint
   - Update DashboardPage.tsx
   - Connect all charts

5. **Create Student Results UI** (6-8 hours)
   - ScoresPage.tsx
   - ResultsPage.tsx
   - Search & Filter components

