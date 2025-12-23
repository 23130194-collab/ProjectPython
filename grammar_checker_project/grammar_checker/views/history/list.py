from django.views.generic import ListView
from django.contrib.auth.mixins import LoginRequiredMixin
from grammar_checker.models import CorrectionRequest

class HistoryListView(LoginRequiredMixin, ListView):
    template_name = "history/list.html"
    context_object_name = "requests"
    paginate_by = 10

    def get_queryset(self):
        return CorrectionRequest.objects.filter(
            user=self.request.user
        ).select_related().order_by('-created_at')