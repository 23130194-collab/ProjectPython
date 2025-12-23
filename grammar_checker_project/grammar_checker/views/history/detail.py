from django.views.generic import DetailView
from django.contrib.auth.mixins import LoginRequiredMixin
from django.shortcuts import get_object_or_404
from grammar_checker.models import CorrectionRequest

class HistoryDetailView(LoginRequiredMixin, DetailView):
    template_name = "history/detail.html"
    context_object_name = "request"

    def get_queryset(self):
        return CorrectionRequest.objects.filter(user=self.request.user)

    def get_object(self):
        return get_object_or_404(CorrectionRequest, pk=self.kwargs['pk'], user=self.request.user)