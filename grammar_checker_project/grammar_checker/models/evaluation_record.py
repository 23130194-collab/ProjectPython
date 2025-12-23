from django.db import models
from .correction_request import CorrectionRequest

class EvaluationRecord(models.Model):
    request = models.ForeignKey(CorrectionRequest, on_delete=models.CASCADE)
    checker_name = models.CharField(max_length=50)
    precision = models.FloatField(null=True, blank=True)
    recall = models.FloatField(null=True, blank=True)
    f1_score = models.FloatField(null=True, blank=True)
    error_reduction_rate = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)