from django.db import models
from .correction_request import CorrectionRequest

class CorrectionResult(models.Model):
    request = models.ForeignKey(CorrectionRequest, on_delete=models.CASCADE, related_name='results')
    checker_name = models.CharField(max_length=50)
    corrected_text = models.TextField(blank=True, null=True)  # THÊM DÒNG NÀY
    error_details = models.JSONField(default=dict)

    def __str__(self):
        return f"{self.checker_name} - {self.request}"