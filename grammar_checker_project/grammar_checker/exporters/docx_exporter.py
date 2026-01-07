# grammar_checker/exporters/docx_exporter.py
from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from django.http import HttpResponse
from datetime import datetime
import io

def _set_run_color(run, rgb_color):
    run.font.color.rgb = RGBColor(*rgb_color)

def export_to_docx(request_id: int, original_text: str, corrected_text: str):
    doc = Document()

    # p2 = doc.add_paragraph(corrected_text)
    # for run in p2.runs:
    #     run.font.name = 'Times New Roman'
    #     run.font.size = Pt(12)
    for line in corrected_text.split('\n'):
        # Nếu dòng có nội dung thì in ra
        if line.strip():
            p = doc.add_paragraph(line)
            for run in p.runs:
                run.font.name = 'Times New Roman'
                run.font.size = Pt(12)
        else:
            # Nếu là dòng trống (người dùng enter 2 lần), thêm đoạn trống
            doc.add_paragraph("")

    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)

    response = HttpResponse(
        buffer.getvalue(),
        content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
    response['Content-Disposition'] = f'attachment; filename="Grammar_Check_{request_id}.docx"'
    return response