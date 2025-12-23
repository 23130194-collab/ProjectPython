from django.views.generic import TemplateView
from django.contrib.auth.mixins import LoginRequiredMixin

class EditorView(LoginRequiredMixin, TemplateView):
    template_name = "editor.html"
    login_url = '/login/'