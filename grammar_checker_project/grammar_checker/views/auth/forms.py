# grammar_checker/forms.py
from django import forms
from django.contrib.auth.models import User
from django.contrib.auth.forms import UserCreationForm

class RegisterForm(UserCreationForm):
    email = forms.EmailField(required=True)  # thêm dòng này là có ô Email

    class Meta:
        model = User
        fields = ["username", "email", "password1", "password2"]  # thêm email vào đây