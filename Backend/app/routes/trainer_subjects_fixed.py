from flask import Blueprint, request, jsonify
from app.models.trainer_subject import TrainerSubject
from app.extensions import db
from sqlalchemy.exc import IntegrityError
from flask_cors import cross_origin
from .permissions import get_current_user, log_view
from ..models.trainer import Trainer
from ..models.subject import Subject
from ..models.student_subject import StudentSubject

bp = Blueprint('trainer_subjects', __name__, url_prefix='/trainer-subjects')

# Bulk assignment endpoint with CORS and preflight support
@bp.route('/assign-multiple', methods=['POST', 'OPTIONS'])
@cross_origin()
def assign_multiple_trainer_subjects():
    if request.method == 'OPTIONS':
        # Preflight request
        return '', 204
    data = request.get_json()
    trainer_id = data.get('trainer_id')
    subject_ids = data.get('subject_ids', [])
    if not trainer_id or not isinstance(subject_ids, list) or not subject_ids:
        return jsonify({'success': False, 'message': 'Missing trainer_id or subject_ids'}), 400
    created, skipped = [], []
    for subject_id in subject_ids:
        exists = TrainerSubject.query.filter_by(trainer_id=trainer_id, subject_id=subject_id).first()
        if exists:
            skipped.append(subject_id)
            continue
        ts = TrainerSubject(trainer_id=trainer_id, subject_id=subject_id)
        db.session.add(ts)
        created.append(subject_id)
    try:
        db.session.commit()
        return jsonify({'success': True, 'created': created, 'skipped': skipped, 'message': 'Bulk assignment complete'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@bp.route('', methods=['POST'])
def assign_trainer_subject():
    data = request.get_json()
    trainer_id = data.get('trainer_id')
    subject_id = data.get('subject_id')
    if not trainer_id or not subject_id:
        return jsonify({'success': False, 'message': 'Missing trainer_id or subject_id'}), 400
    try:
        ts = TrainerSubject(trainer_id=trainer_id, subject_id=subject_id)
        db.session.add(ts)
        db.session.commit()
        return jsonify({'success': True, 'data': {'id': str(ts.id)}, 'message': 'Trainer assigned to subject'})
    except IntegrityError:
        db.session.rollback()
        return jsonify({'success': False, 'message': 'Assignment already exists'}), 409
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@bp.route('/<trainer_id>', methods=['GET'])
def get_trainer_subjects(trainer_id):
    subjects = TrainerSubject.query.filter_by(trainer_id=trainer_id).all()
    return jsonify({'success': True, 'data': [s.subject_id for s in subjects], 'message': ''})


@bp.route('/me', methods=['GET', 'OPTIONS'])
@cross_origin()
def get_my_trainer_subjects():
    try:
        if request.method == 'OPTIONS':
            return '', 204
        user, error, status = get_current_user()
        if error:
            return jsonify({'success': False, 'message': error.get('error')}), status

        trainer = db.session.query(Trainer).filter_by(user_id=user.id).first()
        if not trainer:
            return jsonify({'success': False, 'message': 'Trainer record not found'}), 404

        tsubs = db.session.query(TrainerSubject).filter_by(trainer_id=trainer.id).all()
        subjects_info = []
        total_students_set = set()
        for ts in tsubs:
            subj = db.session.get(Subject, ts.subject_id)
            if not subj:
                continue
            # count students enrolled in this subject
            count = db.session.query(StudentSubject).filter_by(subject_id=subj.id).count()
            # collect unique student ids for total
            srows = db.session.query(StudentSubject.student_id).filter_by(subject_id=subj.id).all()
            for (sid,) in srows:
                total_students_set.add(str(sid))
            subjects_info.append({
                'id': str(subj.id),
                'name': subj.name,
                'module': {'id': str(subj.module.id), 'name': subj.module.name, 'course_id': str(subj.module.course_id) if getattr(subj.module,'course_id',None) else None} if subj.module else None,
                'student_count': count
            })

        log_view(user, 'trainer_subjects.me', entity_id=str(trainer.id), metadata={'count': len(subjects_info)})
        return jsonify({'success': True, 'trainer_id': str(trainer.id), 'name': trainer.user.name if trainer.user else None, 'subjects': subjects_info, 'total_students': len(total_students_set)}), 200
    except Exception as e:
        # Ensure errors return JSON and include CORS headers
        return jsonify({'success': False, 'message': str(e)}), 500
