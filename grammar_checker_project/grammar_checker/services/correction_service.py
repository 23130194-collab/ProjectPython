# grammar_checker/services/correction_service.py
from grammar_checker.models import CorrectionRequest, CorrectionResult
from grammar_checker.checkers import HuggingFaceChecker


class CorrectionService:
    @staticmethod
    def process_text(user, text: str):
        if not text.strip():
            return {"error": "Vui lòng nhập văn bản"}

        # 1. Gọi HuggingFace Checker
        # Lưu ý: Vì check real-time nên ta có thể cân nhắc CÓ LƯU vào DB hay không.
        # Nếu lưu mỗi lần gõ thì DB sẽ rất rác.
        # Tạm thời ta vẫn lưu để đúng với logic cũ của bạn, nhưng set status là AUTO_CHECK

        checker = HuggingFaceChecker()
        hf_result = checker.correct(text)

        # Chỉ lưu vào DB nếu có lỗi để tiết kiệm, hoặc lưu log (tùy nhu cầu)
        # Ở đây tôi làm mẫu: Vẫn tạo request nhưng tối giản
        request = CorrectionRequest.objects.create(
            user=user,
            original_text=text,
            corrected_text=hf_result["corrected"],
            status="COMPLETED"
        )

        CorrectionResult.objects.create(
            request=request,
            checker_name="HuggingFace-T5",
            corrected_text=hf_result["corrected"],
            error_details=hf_result.get("errors", [])
        )

        return {
            "request_id": request.id,
            "original": text,
            "corrected": hf_result["corrected"],
            "errors": hf_result.get("errors", [])  # Quan trọng: Frontend cần cái này
        }