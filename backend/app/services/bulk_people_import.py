from __future__ import annotations

import csv
import io
import re
from datetime import date, datetime
from typing import Iterable

from openpyxl import Workbook, load_workbook


MAX_IMPORT_ROWS = 5000
SUPPORTED_EXTENSIONS = {"csv", "xlsx"}


def normalize_header(value) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").strip().lower())


def normalize_lookup(value) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip()).casefold()


def clean_cell(value) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def read_people_upload(upload, preferred_sheet: str | None = None) -> list[dict[str, str]]:
    filename = str(upload.filename or "")
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if extension not in SUPPORTED_EXTENSIONS:
        raise ValueError("Upload a CSV or XLSX workbook")

    if extension == "csv":
        try:
            text = upload.read().decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ValueError("CSV files must use UTF-8 encoding") from exc
        reader = csv.DictReader(io.StringIO(text))
        if not reader.fieldnames:
            raise ValueError("The upload has no header row")
        raw_rows: Iterable[dict] = reader
    else:
        try:
            workbook = load_workbook(upload, read_only=True, data_only=True)
        except Exception as exc:
            raise ValueError("The XLSX workbook could not be read") from exc
        worksheet = (
            workbook[preferred_sheet]
            if preferred_sheet and preferred_sheet in workbook.sheetnames
            else workbook[workbook.sheetnames[0]]
        )
        values = worksheet.iter_rows(values_only=True)
        headers = next(values, None)
        if not headers:
            raise ValueError("The workbook has no header row")
        raw_rows = (
            {clean_cell(header): value for header, value in zip(headers, row)}
            for row in values
        )

    rows: list[dict[str, str]] = []
    for raw in raw_rows:
        normalized = {
            normalize_header(header): clean_cell(value)
            for header, value in raw.items()
            if normalize_header(header)
        }
        if not any(normalized.values()):
            continue
        rows.append(normalized)
        if len(rows) > MAX_IMPORT_ROWS:
            raise ValueError(f"Imports are limited to {MAX_IMPORT_ROWS} data rows")
    if not rows:
        raise ValueError("The upload contains no data rows")
    return rows


def first_value(row: dict[str, str], *aliases: str) -> str:
    for alias in aliases:
        value = row.get(normalize_header(alias), "").strip()
        if value:
            return value
    return ""


def build_template(headers: list[str], sheet_name: str, example: list[str] | None = None) -> io.BytesIO:
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = sheet_name
    worksheet.append(headers)
    if example:
        worksheet.append(example)
    worksheet.freeze_panes = "A2"
    worksheet.auto_filter.ref = f"A1:{worksheet.cell(row=1, column=len(headers)).coordinate}"
    for column in worksheet.columns:
        width = min(max(len(str(cell.value or "")) for cell in column) + 2, 42)
        worksheet.column_dimensions[column[0].column_letter].width = width
    output = io.BytesIO()
    workbook.save(output)
    output.seek(0)
    return output
