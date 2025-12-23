from weasyprint import HTML
from django.template.loader import render_to_string
from django.http import HttpResponse

def export_to_pdf(request_id: int, original_text: str, corrected_text: str):
    html_string = render_to_string(
        'export/pdf_template.html',
        {
            'original': original_text,
            'corrected': corrected_text,
            'request_id': request_id,
        }
    )

    pdf = HTML(string=html_string).write_pdf()

    response = HttpResponse(pdf, content_type='application/pdf')
    response['Content-Disposition'] = (
        f'attachment; filename="Grammar_Check_{request_id}.pdf"'
    )
    return response