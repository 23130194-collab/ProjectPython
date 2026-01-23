from django.contrib.auth.mixins import LoginRequiredMixin
from django.views.generic import DeleteView
from django.urls import reverse_lazy
from django.contrib import messages
from django.shortcuts import redirect
from grammar_checker.models import CorrectionRequest


class HistoryDeleteView(LoginRequiredMixin, DeleteView):
    model = CorrectionRequest
    success_url = reverse_lazy('history_list')

    def get_queryset(self):
        return CorrectionRequest.objects.filter(user=self.request.user)

    def get(self, request, *args, **kwargs):
        # Lấy object trước
        obj = self.get_object()
        messages.success(request, f"Đã xóa bản ghi #{obj.id} thành công!")
        obj.delete()
        return redirect(self.success_url)

    def post(self, request, *args, **kwargs):
        return self.get(request, *args, **kwargs)