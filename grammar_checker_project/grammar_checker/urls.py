# from django.urls import path
# from grammar_checker.views import EditorView

# urlpatterns = [
#     path('', EditorView.as_view(), name='editor'),
# ]

from django.urls import path
from grammar_checker.views.editor.editor_view import EditorView
from grammar_checker.views.auth.login import LoginView
from grammar_checker.views.auth.register import RegisterView
from grammar_checker.views.auth.logout import CustomLogoutView
from grammar_checker.views.api.check_grammar import CheckGrammarAPI

#export
from grammar_checker.exporters.pdf_exporter import export_to_pdf
from grammar_checker.exporters.docx_exporter import export_to_docx
from grammar_checker.models import CorrectionRequest
from grammar_checker.views.export.pdf_view import export_pdf_view
from grammar_checker.views.export.docx_view import export_docx_view

from grammar_checker.views.history.list import HistoryListView
from grammar_checker.views.history.detail import HistoryDetailView
from grammar_checker.views.history.delete import HistoryDeleteView

urlpatterns = [
    path('', EditorView.as_view(), name='editor'),
    path('login/', LoginView.as_view(), name='login'),
    path('register/', RegisterView.as_view(), name='register'),
    path('logout/', CustomLogoutView.as_view(), name='logout'),
    path('api/check/', CheckGrammarAPI.as_view(), name='check_grammar_api'),

#export
    path('export/pdf/<int:request_id>/', lambda req, request_id: export_to_pdf(
        request_id,
        CorrectionRequest.objects.get(id=request_id).original_text,
        CorrectionRequest.objects.get(id=request_id).corrected_text
    ), name='export_pdf'),

    path('export/docx/<int:request_id>/', lambda req, request_id: export_to_docx(
        request_id,
        CorrectionRequest.objects.get(id=request_id).original_text,
        CorrectionRequest.objects.get(id=request_id).corrected_text
    ), name='export_docx'),

path('api/check/', CheckGrammarAPI.as_view(), name='check_grammar_api'),
    path('export/pdf/<int:request_id>/', export_pdf_view, name='export_pdf'),
    path('export/docx/<int:request_id>/', export_docx_view, name='export_docx'),

path('history/', HistoryListView.as_view(), name='history_list'),
    path('history/<int:pk>/', HistoryDetailView.as_view(), name='history_detail'),
    path('history/<int:pk>/delete/', HistoryDeleteView.as_view(), name='history_delete')
]