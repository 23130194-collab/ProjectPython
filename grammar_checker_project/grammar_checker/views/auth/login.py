# grammar_checker/views/auth/login.py
from django.views.generic import TemplateView
from django.contrib.auth.views import LoginView as BaseLoginView
from django.urls import reverse_lazy

class LoginView(BaseLoginView):
    template_name = 'auth/login.html'
    redirect_authenticated_user = True
    success_url = reverse_lazy('editor')

    def get_success_url(self):
        return self.success_url