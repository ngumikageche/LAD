from __future__ import annotations

import json
import smtplib
from email.message import EmailMessage
from urllib import request as urlrequest

from flask import current_app


def send_email(recipient: str | None, subject: str, body: str) -> dict:
    if not recipient:
        return {"status": "missing_email"}
    host = current_app.config.get("SMTP_HOST")
    if not host:
        return {"status": "not_configured"}
    port = int(current_app.config.get("SMTP_PORT", 587))
    sender = current_app.config.get("SMTP_FROM") or current_app.config.get("SMTP_USERNAME")
    if not sender:
        return {"status": "not_configured"}

    message = EmailMessage()
    message["From"] = sender
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(body)
    try:
        with smtplib.SMTP(host, port, timeout=15) as client:
            if current_app.config.get("SMTP_STARTTLS", True):
                client.starttls()
            username = current_app.config.get("SMTP_USERNAME")
            password = current_app.config.get("SMTP_PASSWORD")
            if username and password:
                client.login(username, password)
            client.send_message(message)
        return {"status": "sent", "recipient": recipient}
    except Exception:
        current_app.logger.exception("Email delivery failed for %s", recipient)
        return {"status": "failed", "recipient": recipient}


def send_sms(recipient: str | None, message: str) -> dict:
    if not recipient:
        return {"status": "missing_phone"}
    webhook_url = current_app.config.get("SMS_WEBHOOK_URL")
    if not webhook_url:
        return {"status": "not_configured"}
    payload = json.dumps(
        {
            "to": recipient,
            "message": message,
            "sender_id": current_app.config.get("SMS_SENDER_ID"),
        }
    ).encode("utf-8")
    req = urlrequest.Request(
        webhook_url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            **(
                {"Authorization": f"Bearer {current_app.config['SMS_API_KEY']}"}
                if current_app.config.get("SMS_API_KEY")
                else {}
            ),
        },
        method="POST",
    )
    try:
        with urlrequest.urlopen(req, timeout=15) as response:
            status_code = int(response.status)
        return {
            "status": "sent" if 200 <= status_code < 300 else "failed",
            "recipient": recipient,
            "provider_status": status_code,
        }
    except Exception:
        current_app.logger.exception("SMS delivery failed for %s", recipient)
        return {"status": "failed", "recipient": recipient}
