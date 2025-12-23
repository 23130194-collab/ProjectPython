from grammar_checker.exporters.docx_exporter import export_to_docx
from grammar_checker.models import CorrectionRequest
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404

@login_required
def export_docx_view(request, request_id):
    req = get_object_or_404(CorrectionRequest, id=request_id)
    return export_to_docx(
        request_id,
        req.original_text,
        req.corrected_text
    )
