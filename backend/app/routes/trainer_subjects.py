import uuid

from flask import Blueprint, request, jsonify
from app.models.trainer_subject import TrainerSubject
from app.extensions import db
from sqlalchemy.exc import IntegrityError
from .permissions import get_current_user, log_view, require_permission
from ..models.trainer import Trainer
from ..models.subject import Subject

bp = Blueprint('trainer_subjects', __name__, url_prefix='/trainer-subjects')

def _parse_uuid(value, field):
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid '{field}'") from exc


@bp.post('/assign-multiple')
def assign_multiple_trainer_subjects():
    _, error, status = require_permission("trainers.update")
    if error:
        return error, status
    data = request.get_json(silent=True) or {}
    trainer_id = data.get('trainer_id')
    subject_ids = data.get('subject_ids', [])
    if not trainer_id or not isinstance(subject_ids, list) or not subject_ids:
        return jsonify({'success': False, 'message': 'Missing trainer_id or subject_ids'}), 400

    try:
        trainer_uuid = _parse_uuid(trainer_id, "trainer_id")
        subject_uuids = list(dict.fromkeys(_parse_uuid(item, "subject_ids") for item in subject_ids))
    except ValueError as exc:
        return jsonify({'success': False, 'message': str(exc)}), 400

    if not db.session.get(Trainer, trainer_uuid):
        return jsonify({'success': False, 'message': 'Trainer not found'}), 404
    existing_subjects = {
        row[0] for row in db.session.query(Subject.id).filter(Subject.id.in_(subject_uuids)).all()
    }
    missing = [str(item) for item in subject_uuids if item not in existing_subjects]
    if missing:
        return jsonify({'success': False, 'message': 'One or more subjects do not exist', 'missing': missing}), 400

    assigned = {
        row[0]
        for row in db.session.query(TrainerSubject.subject_id).filter(
            TrainerSubject.trainer_id == trainer_uuid,
            TrainerSubject.subject_id.in_(subject_uuids),
        ).all()
    }
    created = [item for item in subject_uuids if item not in assigned]
    db.session.add_all(
        TrainerSubject(trainer_id=trainer_uuid, subject_id=subject_uuid)
        for subject_uuid in created
    )
    try:
        db.session.commit()
        return jsonify({
            'success': True,
            'created': [str(item) for item in created],
            'skipped': [str(item) for item in subject_uuids if item in assigned],
            'message': 'Bulk assignment complete',
        })
    except IntegrityError:
        db.session.rollback()
        return jsonify({'success': False, 'message': 'Assignment conflicts with existing data'}), 409

@bp.route('', methods=['POST'])
def assign_trainer_subject():
    _, error, status = require_permission("trainers.update")
    if error:
        return error, status
    data = request.get_json(silent=True) or {}
    trainer_id = data.get('trainer_id')
    subject_id = data.get('subject_id')
    if not trainer_id or not subject_id:
        return jsonify({'success': False, 'message': 'Missing trainer_id or subject_id'}), 400
    try:
        trainer_uuid = _parse_uuid(trainer_id, "trainer_id")
        subject_uuid = _parse_uuid(subject_id, "subject_id")
    except ValueError as exc:
        return jsonify({'success': False, 'message': str(exc)}), 400
    if not db.session.get(Trainer, trainer_uuid):
        return jsonify({'success': False, 'message': 'Trainer not found'}), 404
    if not db.session.get(Subject, subject_uuid):
        return jsonify({'success': False, 'message': 'Subject not found'}), 404
    try:
        ts = TrainerSubject(trainer_id=trainer_uuid, subject_id=subject_uuid)
        db.session.add(ts)
        db.session.commit()
        return jsonify({'success': True, 'data': {'id': str(ts.id)}, 'message': 'Trainer assigned to subject'})
    except IntegrityError:
        db.session.rollback()
        return jsonify({'success': False, 'message': 'Assignment already exists'}), 409
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
            subjects_info = [str(s.subject_id) for s in tsubs]
            log_view(user, 'trainer_subjects.me', entity_id=str(trainer.id), metadata={'count': len(subjects_info)})
            return jsonify({'success': True, 'trainer_id': str(trainer.id), 'data': subjects_info, 'message': ''}), 200

        _, error, status = require_permission("trainers.read")
        if error:
            return error, status
        try:
            trainer_uuid = _parse_uuid(trainer_id, "trainer_id")
        except ValueError as exc:
            return jsonify({'success': False, 'message': str(exc)}), 400
        subjects = TrainerSubject.query.filter_by(trainer_id=trainer_uuid).all()
        return jsonify({'success': True, 'data': [str(s.subject_id) for s in subjects], 'message': ''})
    except IntegrityError:
        db.session.rollback()
        return jsonify({'success': False, 'message': 'Unable to load trainer assignments'}), 409
