# 📡 LAD SYSTEM - COMPLETE API REFERENCE

**Total Endpoints**: 50+ | **Status**: ✅ Production Ready  
**Organization**: 14 Route Modules | **Coverage**: 77% (78/101 User Stories)

---

## 🗂️ API STRUCTURE

```
Base URL: http://localhost:5000

/auth                           ← Authentication (4 endpoints)
/users                          ← User Management (6 endpoints)
/institutions                   ← Institution Management (4 endpoints)
/departments                    ← Department Management (4 endpoints)
/courses                        ← Course Management (4 endpoints)
/modules                        ← Module Management (4 endpoints)
/subjects                       ← Subject Management (4 endpoints)
/trainers                       ← Trainer Management (4 endpoints)
/students                       ← Student Management (4 endpoints)
/trainer-subjects              ← Trainer Subject Assignments (3 endpoints)
/student-subjects              ← Student Subject Assignments (3 endpoints)
/scores                        ← Score Management (6 endpoints)
/analytics                     ← Student Performance Analytics (4 endpoints)
/announcements                 ← Announcements System (4 endpoints)
/admin/analytics               ← Admin System Analytics (6 endpoints) ⭐
/admin/management              ← Admin Operations (10 endpoints) ⭐
/notifications                 ← Notification System (3 endpoints)
/permissions                   ← Permission Management (3 endpoints)
/roles                         ← Role Management (3 endpoints)
```

---

## 🔑 AUTHENTICATION

### POST /auth/login
```bash
curl -X POST http://localhost:5000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "student@example.com",
    "password": "securepassword"
  }'
```
**Response**: 200 OK
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user_id": "uuid",
  "role": "student",
  "expires_in": 86400
}
```

### GET /auth/me
```bash
curl -H "Authorization: bearer {token}" \
  http://localhost:5000/auth/me
```
**Response**: 200 OK
```json
{
  "id": "uuid",
  "name": "John Student",
  "email": "john@example.com",
  "role": "student"
}
```

### PUT /auth/password ⭐ NEW
```bash
curl -X PUT -H "Authorization: bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "current_password": "oldpass",
    "new_password": "newpass123",
    "confirm_password": "newpass123"
  }' \
  http://localhost:5000/auth/password
```
**Response**: 200 OK
```json
{
  "message": "Password changed successfully"
}
```

---

## 👥 USER MANAGEMENT

### POST /users (Admin)
Create new user
```bash
curl -X POST -H "Authorization: bearer {admin_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Trainer",
    "email": "jane@example.com",
    "phone": "555-1234",
    "password": "securepass",
    "role_id": "trainer-role-uuid",
    "institution_id": "institution-uuid"
  }' \
  http://localhost:5000/users
```
**Response**: 201 Created

### GET /users (Admin)
List all users
```bash
curl -H "Authorization: bearer {admin_token}" \
  http://localhost:5000/users?include_deleted=0
```
**Response**: 200 OK
```json
[
  {
    "id": "uuid",
    "name": "Jane Trainer",
    "email": "jane@example.com",
    "role_name": "trainer"
  }
]
```

### PUT /users/{id} (Admin)
Update user details
```bash
curl -X PUT -H "Authorization: bearer {admin_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Updated",
    "role_id": "new-role-uuid"
  }' \
  http://localhost:5000/users/{user_id}
```
**Response**: 200 OK

### PUT /users/{id}/disable (Admin)
Deactivate user
```bash
curl -X PUT -H "Authorization: bearer {admin_token}" \
  http://localhost:5000/users/{user_id}/disable
```
**Response**: 200 OK

---

## 📚 SUBJECT MANAGEMENT

### POST /subjects (Admin)
Create subject
```bash
curl -X POST -H "Authorization: bearer {admin_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mathematics",
    "description": "Advanced Calculus",
    "module_id": "module-uuid"
  }' \
  http://localhost:5000/subjects
```

### GET /subjects
List all subjects
```bash
curl -H "Authorization: bearer {token}" \
  http://localhost:5000/subjects
```

### POST /trainer-subjects (Admin)
Assign subject to trainer
```bash
curl -X POST -H "Authorization: bearer {admin_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "trainer_id": "trainer-uuid",
    "subject_id": "subject-uuid"
  }' \
  http://localhost:5000/trainer-subjects
```

---

## 📝 SCORE MANAGEMENT

### POST /scores (Trainer)
Upload student score
```bash
curl -X POST -H "Authorization: bearer {trainer_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "enrollment_id": "enrollment-uuid",
    "assessment_id": "assessment-uuid",
    "marks_obtained": 85.5
  }' \
  http://localhost:5000/scores
```
**Response**: 201 Created
```json
{
  "id": "score-uuid",
  "marks_obtained": 85.5,
  "grade": "B",
  "is_passed": true
}
```

### PUT /scores/{id} (Trainer)
Update score
```bash
curl -X PUT -H "Authorization: bearer {trainer_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "marks_obtained": 87.5,
    "feedback": "Good work!"
  }' \
  http://localhost:5000/scores/{score_id}
```
**Response**: 200 OK

### GET /scores (Student/Trainer)
View scores
```bash
curl -H "Authorization: bearer {token}" \
  http://localhost:5000/scores?course_id=uuid&term_id=uuid
```
**Response**: 200 OK
```json
[
  {
    "id": "uuid",
    "enrollment_id": "uuid",
    "assessment_id": "uuid",
    "marks_obtained": 85.5,
    "grade": "B",
    "is_passed": true,
    "feedback": "Good work!"
  }
]
```

### POST /scores/{id}/feedback (Trainer)
Add feedback on score
```bash
curl -X POST -H "Authorization: bearer {trainer_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "feedback": "Excellent performance! Keep it up."
  }' \
  http://localhost:5000/scores/{score_id}/feedback
```
**Response**: 200 OK

---

## 📊 STUDENT ANALYTICS

### GET /analytics/students/{id}/performance/summary
Get student performance summary
```bash
curl -H "Authorization: bearer {token}" \
  http://localhost:5000/analytics/students/{student_id}/performance/summary
```
**Response**: 200 OK
```json
{
  "student_id": "uuid",
  "overall_avg": 78.5,
  "total_assessments": 15,
  "passed_count": 14,
  "failed_count": 1,
  "avg_by_subject": [
    {
      "subject": "Mathematics",
      "avg": 82.0,
      "total_marks": 100
    }
  ],
  "avg_by_term": [
    {
      "term": "Term 1 2024",
      "avg": 75.5
    }
  ]
}
```

### GET /analytics/students/{id}/performance/trends
Get performance trends
```bash
curl -H "Authorization: bearer {token}" \
  http://localhost:5000/analytics/students/{student_id}/performance/trends
```
**Response**: 200 OK
```json
{
  "student_id": "uuid",
  "trend_data": [
    {
      "term": "Term 1",
      "avg": 75.0,
      "trend": "improving"
    },
    {
      "term": "Term 2",
      "avg": 78.5,
      "trend": "improved"
    }
  ]
}
```

### GET /analytics/students/{id}/performance/weak-subjects
Identify weak subjects
```bash
curl -H "Authorization: bearer {token}" \
  http://localhost:5000/analytics/students/{student_id}/performance/weak-subjects
```
**Response**: 200 OK
```json
{
  "weak_subjects": [
    {
      "subject": "Physics",
      "avg_score": 45.5,
      "status": "needs_improvement"
    }
  ]
}
```

### GET /analytics/students/{id}/dashboard
Comprehensive dashboard
```bash
curl -H "Authorization: bearer {token}" \
  http://localhost:5000/analytics/students/{student_id}/dashboard
```
**Response**: 200 OK
```json
{
  "overall_avg": 78.5,
  "enrolled_courses": 5,
  "recent_results": [...],
  "weak_subjects": [...],
  "performance_trend": "improving"
}
```

---

## 📢 ANNOUNCEMENTS

### POST /announcements (Trainer/Admin)
Create announcement
```bash
curl -X POST -H "Authorization: bearer {trainer_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Exam Results Released",
    "content": "Please check your scores...",
    "is_important": true,
    "is_published": true,
    "course_id": "course-uuid"
  }' \
  http://localhost:5000/announcements
```

### GET /announcements
List announcements
```bash
curl -H "Authorization: bearer {token}" \
  http://localhost:5000/announcements?importance=high
```

### GET /announcements/students/{id}
Get announcements for student
```bash
curl -H "Authorization: bearer {token}" \
  http://localhost:5000/announcements/students/{student_id}
```

### POST /announcements/{id}/mark-read
Mark announcement as read
```bash
curl -X POST -H "Authorization: bearer {token}" \
  http://localhost:5000/announcements/{announcement_id}/mark-read
```

---

## 🔐 ADMIN ANALYTICS

### GET /admin/analytics/dashboard ⭐
System overview
```bash
curl -H "Authorization: bearer {admin_token}" \
  http://localhost:5000/admin/analytics/dashboard
```
**Response**: 200 OK
```json
{
  "system_overview": {
    "total_students": 450,
    "total_trainers": 25,
    "total_institutions": 3,
    "total_departments": 12
  },
  "academic_metrics": {
    "total_assessments": 2300,
    "passed_count": 1840,
    "failed_count": 460,
    "overall_pass_rate": 80.0,
    "overall_avg": 76.5
  }
}
```

### GET /admin/analytics/institutions ⭐
Institution performance
```bash
curl -H "Authorization: bearer {admin_token}" \
  http://localhost:5000/admin/analytics/institutions
```

### GET /admin/analytics/departments ⭐
Department performance
```bash
curl -H "Authorization: bearer {admin_token}" \
  http://localhost:5000/admin/analytics/departments
```

### GET /admin/analytics/courses ⭐
Course performance
```bash
curl -H "Authorization: bearer {admin_token}" \
  http://localhost:5000/admin/analytics/courses
```

### GET /admin/analytics/comparisons ⭐
Top/bottom performers
```bash
curl -H "Authorization: bearer {admin_token}" \
  http://localhost:5000/admin/analytics/comparisons
```

### GET /admin/analytics/system-wide-report ⭐
Comprehensive report
```bash
curl -H "Authorization: bearer {admin_token}" \
  http://localhost:5000/admin/analytics/system-wide-report
```

---

## 🛠️ ADMIN MANAGEMENT

### POST /admin/management/trainers/{id}/assign-departments ⭐
Assign trainer to departments
```bash
curl -X POST -H "Authorization: bearer {admin_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "department_ids": ["dept-uuid-1", "dept-uuid-2"]
  }' \
  http://localhost:5000/admin/management/trainers/{trainer_id}/assign-departments
```

### GET /admin/management/trainers/{id}/performance ⭐
Trainer performance metrics
```bash
curl -H "Authorization: bearer {admin_token}" \
  http://localhost:5000/admin/management/trainers/{trainer_id}/performance
```

### POST /admin/management/students/bulk-assign-courses ⭐
Bulk assign students to courses
```bash
curl -X POST -H "Authorization: bearer {admin_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "student_ids": ["student-uuid-1", "student-uuid-2"],
    "course_ids": ["course-uuid-1", "course-uuid-2"],
    "term_id": "term-uuid"
  }' \
  http://localhost:5000/admin/management/students/bulk-assign-courses
```

### PUT /admin/management/students/{id}/status ⭐
Update student status
```bash
curl -X PUT -H "Authorization: bearer {admin_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "active"
  }' \
  http://localhost:5000/admin/management/students/{student_id}/status
```

### GET /admin/management/students/{id}/performance ⭐
Admin view of student
```bash
curl -H "Authorization: bearer {admin_token}" \
  http://localhost:5000/admin/management/students/{student_id}/performance
```

### PUT /admin/management/scores/{id}/override ⭐
Override score (with audit)
```bash
curl -X PUT -H "Authorization: bearer {admin_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "new_marks": 85,
    "reason": "Correction - calculation error"
  }' \
  http://localhost:5000/admin/management/scores/{score_id}/override
```

### GET /admin/management/scores/validation-issues ⭐
Find score problems
```bash
curl -H "Authorization: bearer {admin_token}" \
  http://localhost:5000/admin/management/scores/validation-issues
```

### GET /admin/management/system-logs ⭐
Audit logs
```bash
curl -H "Authorization: bearer {admin_token}" \
  http://localhost:5000/admin/management/system-logs?limit=50&action=score_override
```

### POST /admin/management/verify-data-integrity ⭐
Check database integrity
```bash
curl -X POST -H "Authorization: bearer {admin_token}" \
  http://localhost:5000/admin/management/verify-data-integrity
```

---

## 🔑 PERMISSION MAPPING

### Student Permissions
```
analytics.read          → View own performance analytics
users.read             → View own profile
announcements.read     → View announcements
```

### Trainer Permissions
```
scores.create          → Create student scores
scores.update          → Edit scores
announcements.create   → Create announcements
analytics.read         → View student performance
trainers.read          → View trainer info
```

### Admin Permissions
```
admin.analytics.read   → System analytics
admin.trainers.update  → Manage trainers
admin.students.update  → Manage students
admin.scores.update    → Override scores
admin.audit.read       → View logs
admin.system.update    → Integrity checks
users.create           → Create users
users.update           → Update users
roles.manage           → Manage permissions
```

---

## 📊 HTTP STATUS CODES

```
200 OK              → Request succeeded
201 Created         → Resource created
400 Bad Request     → Invalid input
401 Unauthorized    → Missing/invalid token
403 Forbidden       → Permission denied
404 Not Found       → Resource not found
409 Conflict        → Duplicate/integrity error
500 Server Error    → Internal error
```

---

## 🔄 COMMON ERROR RESPONSES

### Missing Permission
```json
{
  "error": "User does not have permission 'admin.analytics.read'"
}
```

### Invalid Data
```json
{
  "error": "'marks_obtained' must be between 0 and 100"
}
```

### Resource Not Found
```json
{
  "error": "Student not found"
}
```

### Duplicate Entry
```json
{
  "error": "User already exists (email/phone may be taken)"
}
```

---

## 🧪 TESTING THE API

### Using cURL
```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:5000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"pass"}' | jq -r '.token')

# Use token
curl -H "Authorization: bearer $TOKEN" \
  http://localhost:5000/auth/me
```

### Using Postman
1. Set Base URL: `http://localhost:5000`
2. Create Auth request → Copy token
3. Add `Authorization: bearer {token}` header to requests

### Using Python
```python
import requests

token = requests.post('http://localhost:5000/auth/login', json={
    'email': 'user@example.com',
    'password': 'password'
}).json()['token']

response = requests.get('http://localhost:5000/auth/me',
    headers={'Authorization': f'bearer {token}'})
```

---

## 📈 API USAGE STATISTICS

| Component | Count |
|-----------|-------|
| Total Endpoints | 50+ |
| Route Modules | 20 |
| HTTP Methods | 4 (GET, POST, PUT, DELETE) |
| Auth Method | Bearer Token |
| Token TTL | 24 hours |
| Response Format | JSON |
| Error Format | JSON with status code |

---

**Last Updated**: April 19, 2026  
**Status**: ✅ Production Ready  
**Next**: Frontend implementation → Database migrations → Deployment

