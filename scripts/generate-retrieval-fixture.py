from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas


OUTPUT_PATH = (
    Path(__file__).resolve().parents[1]
    / "evaluation"
    / "retrieval"
    / "fixtures"
    / "aurora-field-manual.pdf"
)

PAGES = [
    (
        "Station Kestrel activation",
        [
            "Station Kestrel is part of the fictional Aurora Relay network.",
            "Its activation sequence is LANTERN-54.",
            "Do not confuse this sequence with Meridian habitat service tag LANTERN-45.",
        ],
    ),
    (
        "Power configuration",
        [
            "Station Kestrel uses a 48-volt reserve battery during relay maintenance.",
            "The reserve pack must be isolated before the activation sequence is entered.",
            "A retired Harrier test unit used 41 volts; that value does not apply to Kestrel.",
        ],
    ),
    (
        "Cold-weather inspection",
        [
            "In cold-weather service, Station Kestrel is inspected every 14 days.",
            "Technicians record the inspection in the synthetic Aurora maintenance ledger.",
        ],
    ),
]


def build_fixture() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(OUTPUT_PATH), pagesize=letter, invariant=1)
    width, height = letter
    navy = HexColor("#14243A")
    blue = HexColor("#2B6CB0")
    gray = HexColor("#5B6777")

    for page_number, (heading, paragraphs) in enumerate(PAGES, start=1):
        pdf.setFillColor(navy)
        pdf.setFont("Helvetica-Bold", 20)
        pdf.drawString(64, height - 72, "Aurora Relay Field Manual")

        pdf.setStrokeColor(blue)
        pdf.setLineWidth(2)
        pdf.line(64, height - 88, width - 64, height - 88)

        pdf.setFillColor(blue)
        pdf.setFont("Helvetica-Bold", 13)
        pdf.drawString(64, height - 122, heading)

        text = pdf.beginText(64, height - 154)
        text.setFillColor(navy)
        text.setFont("Helvetica", 11)
        text.setLeading(19)
        for paragraph in paragraphs:
            text.textLine(paragraph)
            text.textLine("")
        pdf.drawText(text)

        pdf.setFillColor(gray)
        pdf.setFont("Helvetica", 8)
        pdf.drawString(64, 44, "Synthetic fixture - safe to commit - retrieval evaluation only")
        pdf.drawRightString(width - 64, 44, f"Page {page_number} of {len(PAGES)}")
        pdf.showPage()

    pdf.save()


if __name__ == "__main__":
    build_fixture()
