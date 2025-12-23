from django.views.generic import CreateView
from .forms import RegisterForm
from django.urls import reverse_lazy
from django.contrib import messages

class RegisterView(CreateView):
    form_class = RegisterForm
    template_name = 'auth/register.html'
    success_url = reverse_lazy('login')

    def form_valid(self, form):
        user = form.save()
        messages.success(self.request, 'Đăng ký thành công! Hãy đăng nhập nhé ')
        return super().form_valid(form)