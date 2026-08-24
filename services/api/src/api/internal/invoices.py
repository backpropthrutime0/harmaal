"""Tenant invoice / receipt PDF generation (reportlab).

Three variants keyed off the charge state:
  - ``early``  : an upcoming-rent reminder (pending, not yet overdue)
  - ``late``   : an overdue notice (past due, unpaid)
  - ``paid``   : a paid receipt / invoice marked PAID

The caller picks the variant explicitly (or passes ``auto`` to derive it from
the charge status). Pure in-memory: returns PDF bytes, writes nothing to disk.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from io import BytesIO
from typing import Literal
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from api.models.orm import Payment, Property, Tenant

InvoiceKind = Literal["early", "late", "paid", "auto"]

# Brand palette (matches the frontend harmaal-* Tailwind colors).
BLUE = colors.HexColor("#2A5C82")
GOLD = colors.HexColor("#C5A059")
SLATE = colors.HexColor("#334155")
LIGHT = colors.HexColor("#F1F5F9")


def resolve_kind(payment: Payment, kind: InvoiceKind, today: str) -> Literal["early", "late", "paid"]:
    if kind != "auto":
        return kind  # type: ignore[return-value]
    if payment.status == "paid":
        return "paid"
    if payment.due_date and payment.due_date < today:
        return "late"
    return "early"


_HEADINGS: dict[str, tuple[str, str, colors.Color]] = {
    "early": ("RENT INVOICE", "Upcoming payment reminder", BLUE),
    "late": ("OVERDUE NOTICE", "This payment is past due", colors.HexColor("#B91C1C")),
    "paid": ("PAID RECEIPT", "Payment received — thank you", colors.HexColor("#15803D")),
}

_MESSAGES: dict[str, str] = {
    "early": (
        "This is a friendly reminder that your rent for the period below is due on "
        "the date shown. Please arrange payment on or before the due date to keep "
        "your account in good standing."
    ),
    "late": (
        "Our records show the rent for the period below is past its due date and "
        "remains unpaid. Please settle the outstanding balance as soon as possible. "
        "If you have already paid, kindly disregard this notice."
    ),
    "paid": (
        "We confirm receipt of your rent payment for the period below. This document "
        "serves as your official receipt. Thank you for being a valued resident."
    ),
}


def build_invoice_pdf(
    *,
    payment: Payment,
    tenant: Tenant,
    prop: Property | None,
    kind: InvoiceKind = "auto",
) -> bytes:
    today = datetime.now(UTC).date().isoformat()
    resolved = resolve_kind(payment, kind, today)
    heading, tagline, accent = _HEADINGS[resolved]

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=LETTER,
        topMargin=0.9 * inch,
        bottomMargin=0.9 * inch,
        leftMargin=0.9 * inch,
        rightMargin=0.9 * inch,
        title=f"Harmaal {heading.title()} — {tenant.name}",
    )
    styles = getSampleStyleSheet()
    normal = ParagraphStyle("body", parent=styles["Normal"], fontSize=10, leading=15, textColor=SLATE)
    small = ParagraphStyle("small", parent=normal, fontSize=8, textColor=colors.grey)
    brand = ParagraphStyle("brand", parent=styles["Title"], fontSize=22, textColor=BLUE, spaceAfter=0)
    doc_title = ParagraphStyle("doctitle", parent=styles["Title"], fontSize=16, textColor=accent, alignment=2)
    doc_tag = ParagraphStyle("doctag", parent=small, alignment=2)

    story: list = []

    # --- masthead: brand left, document type right ---
    masthead = Table(
        [
            [
                Paragraph("HARMAAL", brand),
                Paragraph(heading, doc_title),
            ],
            [
                Paragraph("Property Management", small),
                Paragraph(tagline, doc_tag),
            ],
        ],
        colWidths=[3.3 * inch, 3.3 * inch],
    )
    masthead.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 1), (-1, 1), 2, GOLD),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 8),
            ]
        )
    )
    story += [masthead, Spacer(1, 0.3 * inch)]

    # --- bill-to + meta ---
    # Escape every tenant/staff-controlled field: reportlab parses Paragraph text
    # as mini-XML markup, so an unescaped '<' or '&' would break rendering (500)
    # or let a tenant inject markup into their own invoice.
    name = escape(tenant.name)
    email = escape(tenant.email)
    unit = escape(f"Unit {tenant.unit_label}") if tenant.unit_label else ""
    addr = escape(prop.address) if prop else ""
    bill_to = Paragraph(f"<b>Billed to</b><br/>{name}<br/>{email}<br/>{unit}<br/>{addr}", normal)
    invoice_no = f"HRM-{payment.id:05d}-{payment.period.replace('-', '')}"
    meta = Paragraph(
        f"<b>Invoice #</b> {invoice_no}<br/>"
        f"<b>Issued</b> {today}<br/>"
        f"<b>Period</b> {payment.period}<br/>"
        f"<b>Due date</b> {payment.due_date or '—'}",
        normal,
    )
    info = Table([[bill_to, meta]], colWidths=[3.6 * inch, 3.0 * inch])
    info.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story += [info, Spacer(1, 0.3 * inch)]

    # --- message ---
    story += [Paragraph(_MESSAGES[resolved], normal), Spacer(1, 0.25 * inch)]

    # --- charge table ---
    status_label = {"early": "DUE", "late": "OVERDUE", "paid": "PAID"}[resolved]
    amount = f"${payment.amount:,.2f}"
    rows = [
        ["Description", "Amount"],
        [f"Monthly rent — {payment.period}", amount],
        [f"Status: {status_label}", amount],
    ]
    charge = Table(rows, colWidths=[4.6 * inch, 2.0 * inch])
    charge.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BLUE),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("TEXTCOLOR", (0, 1), (-1, -2), SLATE),
                ("ROWBACKGROUNDS", (0, 1), (-1, 1), [LIGHT]),
                ("LINEABOVE", (0, 2), (-1, 2), 1, colors.lightgrey),
                ("FONTNAME", (0, 2), (-1, 2), "Helvetica-Bold"),
                ("TEXTCOLOR", (0, 2), (-1, 2), accent),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    story += [charge, Spacer(1, 0.15 * inch)]

    if resolved == "paid" and payment.paid_date:
        method = f" via {payment.method}" if payment.method else ""
        story += [Paragraph(f"Paid on {payment.paid_date}{method}.", small)]

    story += [
        Spacer(1, 0.6 * inch),
        Paragraph(
            "Harmaal Property Management · This document was generated electronically "
            "and is valid without signature.",
            small,
        ),
    ]

    doc.build(story)
    return buf.getvalue()


def invoice_filename(payment: Payment, resolved: str) -> str:
    prefix = {"early": "invoice", "late": "overdue-notice", "paid": "receipt"}.get(resolved, "invoice")
    # Strip anything that could break the quoted Content-Disposition header.
    period = re.sub(r"[^0-9A-Za-z-]", "", payment.period)
    return f"{prefix}-{period}-{payment.id}.pdf"
