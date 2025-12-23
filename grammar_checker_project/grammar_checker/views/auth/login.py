# grammar_checker/views/auth/login.py
from django.views.generic import TemplateView
from django.contrib.auth.views import LoginView as BaseLoginView
from django.urls import reverse_lazy

class LoginView(BaseLoginView):
    template_name = 'auth/login.html'
    redirect_authenticated_user = True          # Nếu đã đăng nhập rồi thì không vào trang login nữa
    success_url = reverse_lazy('editor')        # Đăng nhập thành công → về trang chủ

    def get_success_url(self):
        # Có thể thêm thông báo thành công ở đây nếu muốn
        return self.success_url