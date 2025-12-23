from django.db import models
from django.contrib.auth.models import User

class CorrectionRequest(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    original_text = models.TextField()
    corrected_text = models.TextField(blank=True)
    status = models.CharField(max_length=20, default="PENDING")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Check by {self.user} - {self.created_at.strftime('%d/%m %H:%M')}"