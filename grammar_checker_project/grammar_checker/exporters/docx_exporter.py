from django.http import HttpResponse
from docx import Document
from docx.shared import Pt

def export_to_docx(request_id, original_text, corrected_text):
    document = Document()

    for paragraph in corrected_text.splitlines():
        if paragraph.strip():
            p = document.add_paragraph(paragraph)

    # Tạo response trả về file
    response = HttpResponse(content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    response['Content-Disposition'] = f'attachment; filename=corrected_text_{request_id}.docx'

    document.save(response)
    return response