from grammar_checker.exporters.pdf_exporter import export_to_pdf
from grammar_checker.models import CorrectionRequest
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404

@login_required
def export_pdf_view(request, request_id):
    req = get_object_or_404(CorrectionRequest, id=request_id)
    return export_to_pdf(
        request_id,
        req.original_text,
        req.corrected_text
    )