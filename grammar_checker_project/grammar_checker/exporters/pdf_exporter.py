from django.http import HttpResponse
from django.template.loader import get_template
from xhtml2pdf import pisa


def export_to_pdf(request_id, original_text, corrected_text):
    # Template HTML dùng để render PDF
    template_path = 'export/pdf_template.html'

    context = {
        'request_id': request_id,
        'original_text': original_text,
        'corrected_text': corrected_text,
    }

    # Load template và render
    template = get_template(template_path)
    html = template.render(context)

    # Tạo response PDF
    response = HttpResponse(content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename=corrected_text_{request_id}.pdf'

    # Tạo PDF từ HTML
    pisa_status = pisa.CreatePDF(
        html, dest=response
    )

    if pisa_status.err:
        return HttpResponse('We had some errors <pre>' + html + '</pre>')

    return response