# API Endpoints - Student Learning Analytics System

## Authentication
- `POST /auth/login` - Student login
- `POST /auth/logout` - Student logout
- `GET /auth/me` - Get current user info

## 📚 View Enrolled Subjects (User Story #3)
**Endpoint:** `GET /students/<student_id>/subjects`
**Permission:** `students.read`
**Response:**
```json
{
  "student_id": "uuid",
  "subjects": [
    {
      "id": "uuid",
      "name": "Mathematics",
      "description": "Basic algebra and calculus",
      "module": {
        "id": "uuid",
        "name": "Math Module 1",
        "description": "First semester math"
      },
      "trainers": [
        {
          "id": "uuid",
          "user_id": "uuid",
          "name": "Dr. Smith",
          "email": "smith@school.edu",
          "specialization": "Mathematics"
        }
      ]
    }
  ],
  "total": 5
}
```

## 📊 View Marks / Scores (User Story #2)
**Student's Own Scores:**
- `GET /scores/student/<student_id>/scores` - Get all scores for a student
  - Response includes average score
  
**Scores by Subject:**
- `GET /scores/student/<student_id>/subjects/<subject_id>/scores` - Get scores for a specific subject
  - Groups scores by term
  - Includes subject_name and module details
  
**Scores by Term:**
- `GET /scores/student/<student_id>/term/<term>` - Get all scores for a specific term
  - Example: `/scores/student/abc-123/term/TERM1`

**Query Parameters:**
- `GET /scores?student_id=uuid` - Filter all scores by student
- `GET /scores?module_id=uuid` - Filter all scores by module
- `GET /scores?term=TERM1` - Filter all scores by term

## 📈 Performance Insights (User Story #5)
These endpoints return data needed for:
- Average scores
- Performance trends
- Visual charts

**Data needed from scores endpoints above - aggregate the scores by:**
- Subject (group scores by subject_id)
- Term (already provides by-term grouping)
- Time period (use recorded_at field)

## 🔗 Student-Subject Enrollment
**Enroll student in subject:**
- `POST /students/<student_id>/subjects/<subject_id>`
  - Requires: `students.update` permission
  - Creates StudentSubject record

**Unenroll student from subject:**
- `DELETE /students/<student_id>/subjects/<subject_id>`
  - Requires: `students.update` permission

**Alternative endpoints (same functionality):**
- `POST /student-subjects` - Enroll (body: `student_id`, `subject_id`)
- `GET /student-subjects/<student_id>` - Get subjects for student
- `DELETE /student-subjects/<student_id>/<subject_id>` - Unenroll

## 📝 Create/Update Scores
**Create score:**
- `POST /scores`
- Body:
  ```json
  {
    "student_id": "uuid",
    "trainer_id": "uuid",
    "module_id": "uuid",
    "competency_id": "uuid",
    "score": 85.5,
    "term": "TERM1",
    "status": "active",
    "source": "manual"
  }
  ```

**Update score:**
- `PUT /scores/<assessment_id>`
- Body (partial):
  ```json
  {
    "score": 90,
    "status": "active",
    "term": "TERM1"
  }
  ```

**Delete score:**
- `DELETE /scores/<assessment_id>`

## 🧹 Sync Subjects to Students (Module Management)
**Auto-assign all module subjects to enrolled students:**
- `POST /modules/<module_id>/sync-subjects`
- Requires: `modules.update` permission
- Response: `{"status": "success", "assigned": 5}`
- Creates StudentSubject records for:
  - All subjects in the module
  - All students enrolled in the module
  - Skips if already assigned

## 📋 Subject Management
**List subjects (optionally filtered by module):**
- `GET /subjects?module_id=uuid`

**Get subject details:**
- `GET /subjects/<subject_id>` - Returns subject with module and trainer info

**Create subject:**
- `POST /subjects` - Requires: `subjects.create`

**Update subject:**
- `PUT /subjects/<subject_id>` - Requires: `subjects.update`

**Delete subject:**
- `DELETE /subjects/<subject_id>` - Requires: `subjects.delete`

## Frontend Integration Examples

### Get Student's Enrolled Subjects
```typescript
const { token } = useAuth();
const response = await apiRequest(`/students/${studentId}/subjects`, { token });
const { subjects, total } = response;

// subjects array contains full subject details with trainers
subjects.forEach(subject => {
  console.log(`${subject.name} - Trainer: ${subject.trainers[0]?.name}`);
});
```

### Get Student's Marks
```typescript
// All scores
const allScores = await apiRequest(`/scores/student/${studentId}/scores`, { token });
console.log(`Average: ${allScores.average}`);

// By subject
const subjectScores = await apiRequest(`/scores/student/${studentId}/subjects/${subjectId}/scores`, { token });
// subjectScores.scores_by_term contains grouped scores

// By term
const termScores = await apiRequest(`/scores/student/${studentId}/term/TERM1`, { token });
```

### Add a Score (Trainer)
```typescript
await apiRequest('/scores', {
  method: 'POST',
  token,
  body: {
    student_id: studentId,
    trainer_id: trainerId,
    module_id: moduleId,
    competency_id: competencyId,
    score: 85,
    term: 'TERM1'
  }
});
```

### Sync Subjects After Enrolling Students in Module
```typescript
// After student enrolls in a module, sync their subjects:
await apiRequest(`/modules/${moduleId}/sync-subjects`, {
  method: 'POST',
  token
});
// Now GET /students/<student_id>/subjects will include those subjects
```

## Notes
- All endpoints require valid authentication token (Bearer token in Authorization header)
- UUIDs must be valid format
- Scores must be 0-100
- Term field is optional but recommended for filtering/tracking
- Use `recorded_at` field for timeline/trend analysis
