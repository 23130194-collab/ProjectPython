# grammar_checker/services/correction_service.py
from django.utils.html import strip_tags
from grammar_checker.models import CorrectionRequest, CorrectionResult
# [CHANGE 3] Import cả 2 checker
from grammar_checker.checkers import OpenRouterChecker, HuggingFaceChecker


class CorrectionService:
    @staticmethod
    def process_text(user, text: str):
        if not text.strip():
            return {"error": "Vui lòng nhập văn bản"}

        # Làm sạch text
        clean_text = text.replace('</p>', '\n').replace('<br>', '\n').replace('</div>', '\n')
        clean_text = strip_tags(clean_text).strip()

        # 1. Khởi tạo 2 checker
        gemini_checker = OpenRouterChecker()
        t5_checker = HuggingFaceChecker()

        print("--- Bắt đầu kiểm tra song song ---")

        # 2. Chạy model T5 (Local/Server)
        try:
            t5_result = t5_checker.correct(clean_text)
        except Exception as e:
            print(f"T5 Error: {e}")
            t5_result = {"corrected": clean_text, "errors": [], "source": "T5 (Failed)"}

        # 3. Chạy model Gemini (API)
        try:
            gemini_result = gemini_checker.correct(clean_text)
        except Exception as e:
            print(f"Gemini Error: {e}")
            gemini_result = {"corrected": clean_text, "errors": [], "source": "Gemini (Failed)"}

        # 4. Logic chọn kết quả tốt nhất (Best Result Selection)
        final_result = CorrectionService.select_best_result(gemini_result, t5_result)

        # 5. Lưu vào Database (Lưu kết quả được chọn)
        request = CorrectionRequest.objects.create(
            user=user,
            original_text=text,
            corrected_text=final_result["corrected"],
            status="COMPLETED"
        )

        # Lưu chi tiết (Có thể lưu cả 2 để debug nếu muốn, ở đây lưu cái được chọn)
        CorrectionResult.objects.create(
            request=request,
            checker_name=final_result["source"],
            corrected_text=final_result["corrected"],
            error_details=final_result.get("errors", [])
        )

        return {
            "request_id": request.id,
            "original": text,
            "corrected": final_result["corrected"],
            "errors": final_result.get("errors", []),
            "source": final_result["source"]
        }

    @staticmethod
    def select_best_result(gemini_res, t5_res):
        """
        Quy tắc chọn model:
        1. Ưu tiên Gemini vì model này hiểu ngữ nghĩa và giải thích tốt hơn.
        2. Nếu Gemini trả về lỗi (errors > 0), chọn Gemini.
        3. Nếu Gemini KHÔNG tìm thấy lỗi nào, nhưng T5 tìm thấy lỗi -> Chọn T5 (đề phòng Gemini bỏ sót).
        4. Nếu Gemini bị lỗi hệ thống (Exception), chọn T5.
        """
        gemini_errors = gemini_res.get("errors", [])
        t5_errors = t5_res.get("errors", [])

        print(f"So sánh: Gemini tìm thấy {len(gemini_errors)} lỗi - T5 tìm thấy {len(t5_errors)} lỗi")

        # Trường hợp Gemini bị lỗi kết nối hoặc parse JSON
        if "Error" in gemini_res.get("source", "") or "Exception" in gemini_res.get("source", ""):
            return t5_res

        # Nếu Gemini tìm thấy lỗi, ưu tiên dùng nó (vì giải thích xịn hơn)
        if len(gemini_errors) > 0:
            return gemini_res

        # Nếu Gemini nói "Hoàn hảo" (0 lỗi), nhưng T5 lại bắt được lỗi
        # -> Có thể Gemini bị lazy, hãy thử tin T5
        if len(gemini_errors) == 0 and len(t5_errors) > 0:
            print("Gemini không thấy lỗi, Fallback sang T5")
            return t5_res

        # Mặc định dùng Gemini
        return gemini_res