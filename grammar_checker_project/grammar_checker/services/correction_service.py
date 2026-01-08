# grammar_checker/services/correction_service.py
from django.utils.html import strip_tags
from grammar_checker.models import CorrectionRequest, CorrectionResult
from grammar_checker.checkers import OpenRouterChecker  # THAY ĐỔI TẠI ĐÂY


class CorrectionService:
    @staticmethod
    def process_text(user, text: str):
        if not text.strip():
            return {"error": "Vui lòng nhập văn bản"}

        clean_text_for_ai = text.replace('</p>', '\n').replace('<br>', '\n').replace('</div>', '\n')
        clean_text_for_ai = strip_tags(clean_text_for_ai).strip()

        # SỬ DỤNG GPT-4 Free
        checker = OpenRouterChecker()
        result = checker.correct(clean_text_for_ai)

        request = CorrectionRequest.objects.create(
            user=user,
            original_text=text,
            corrected_text=result["corrected"],
            status="COMPLETED"
        )

        CorrectionResult.objects.create(
            request=request,
            checker_name="OpenRouter-AI",
            corrected_text=result["corrected"],
            error_details=result.get("errors", [])
        )

        return {
            "request_id": request.id,
            "original": text,
            "corrected": result["corrected"],
            "errors": result.get("errors", [])
        }