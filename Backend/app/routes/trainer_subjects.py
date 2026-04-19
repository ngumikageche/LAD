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
    # Handle the special "me" alias to allow callers to request the current trainer's subjects.
    try:
        if trainer_id == 'me':
            user, error, status = get_current_user()
            if error:
                return jsonify({'success': False, 'message': error.get('error')}), status

            trainer = db.session.query(Trainer).filter_by(user_id=user.id).first()
            if not trainer:
                return jsonify({'success': False, 'message': 'Trainer record not found'}), 404

            tsubs = db.session.query(TrainerSubject).filter_by(trainer_id=trainer.id).all()
            subjects_info = [s.subject_id for s in tsubs]
            log_view(user, 'trainer_subjects.me', entity_id=str(trainer.id), metadata={'count': len(subjects_info)})
            return jsonify({'success': True, 'trainer_id': str(trainer.id), 'data': subjects_info, 'message': ''}), 200

        subjects = TrainerSubject.query.filter_by(trainer_id=trainer_id).all()
        return jsonify({'success': True, 'data': [s.subject_id for s in subjects], 'message': ''})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500
