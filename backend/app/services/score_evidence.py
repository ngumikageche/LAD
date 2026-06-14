from __future__ import annotations

import os
import uuid
from collections.abc import Iterable

from flask import current_app
from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename

from ..extensions import db
from ..models.score_evidence import ScoreEvidence

ALLOWED_EVIDENCE_EXTENSIONS = {"pdf", "png", "jpg", "jpeg", "zip"}
EVIDENCE_UPLOAD_FOLDER = os.path.join(
    os.path.dirname(__file__),
    "..",
    "..",
    "uploads",
    "score-evidence",
)


def allowed_score_evidence(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EVIDENCE_EXTENSIONS


def usable_score_evidence_files(files: Iterable[FileStorage]) -> list[FileStorage]:
    return [file for file in files if file and file.filename]


def save_score_evidence_files(
    files: Iterable[FileStorage],
    *,
    uploaded_by,
    trainer_id=None,
    score_id=None,
    batch_id: str | None = None,
    assessment_id=None,
    subject_id=None,
) -> list[ScoreEvidence]:
    saved: list[ScoreEvidence] = []
    os.makedirs(EVIDENCE_UPLOAD_FOLDER, exist_ok=True)

    for file in usable_score_evidence_files(files):
        if not allowed_score_evidence(file.filename or ""):
            raise ValueError(
                "Exam copy file type not allowed. Allowed: "
                + ", ".join(sorted(ALLOWED_EVIDENCE_EXTENSIONS))
            )

        safe_name = secure_filename(file.filename or "exam-copy")
        unique_name = f"{uuid.uuid4().hex}_{safe_name}"
        save_path = os.path.join(EVIDENCE_UPLOAD_FOLDER, unique_name)
        file.save(save_path)

        ext = safe_name.rsplit(".", 1)[-1].lower() if "." in safe_name else None
        evidence = ScoreEvidence(
            score_id=score_id,
            batch_id=batch_id,
            assessment_id=assessment_id,
            subject_id=subject_id,
            trainer_id=trainer_id,
            uploaded_by=uploaded_by,
            file_name=safe_name,
            file_url=f"/scores/evidence/files/{unique_name}",
            file_type=ext,
            file_size=os.path.getsize(save_path),
        )
        db.session.add(evidence)
        saved.append(evidence)

    current_app.logger.info("Saved %s score evidence file(s)", len(saved))
    return saved
