from flask import Blueprint, request, jsonify
from app.models.trainer_subject import TrainerSubject
from app.extensions import db
from sqlalchemy.exc import IntegrityError
from flask_cors import cross_origin

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
