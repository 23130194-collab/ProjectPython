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

        print("Bắt đầu kiểm tra song song")

        # 2. Chạy model T5 (Local/Server)
        try:
            t5_result = t5_checker.correct(clean_text)
        except Exception as e:
            print(f"T5 Error: {e}")
            t5_result = {"corrected": clean_text, "errors": [], "source": "T5 (Failed)"}

        # 3. Chạy model Gemini
        try:
            gemini_result = gemini_checker.correct(clean_text)
        except Exception as e:
            print(f"Gemini Error: {e}")
            gemini_result = {"corrected": clean_text, "errors": [], "source": "Gemini (Failed)"}

        # 4. Logic chọn kết quả tốt nhất
        final_result = CorrectionService.select_best_result(gemini_result, t5_result)

        # 5. Lưu vào Database
        request = CorrectionRequest.objects.create(
            user=user,
            original_text=text,
            corrected_text=final_result["corrected"],
            status="COMPLETED"
        )

        # Lưu chi tiết
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
        Cố gắng bắt lỗi nhiều nhất có thể
        So sánh số lượng lỗi tìm được. Model nào tìm ra nhiều lỗi hơn sẽ được chọn.
        """

        # Xử lý trường hợp một trong hai model bị lỗi hệ thống (Exception/API Error)
        # Nếu Gemini lỗi, dùng T5
        if "Error" in gemini_res.get("source", "") or "Exception" in gemini_res.get("source", ""):
            print("Gemini gặp lỗi, chuyển sang dùng T5.")
            return t5_res

        # Nếu T5 lỗi, dùng Gemini
        if "Error" in t5_res.get("source", ""):
            return gemini_res

        # Đếm số lượng lỗi
        gemini_count = len(gemini_res.get("errors", []))
        t5_count = len(t5_res.get("errors", []))

        print(f"So sánh: Gemini ({gemini_count} lỗi) vs T5 ({t5_count} lỗi)")

        # So sánh số lượng lỗi giữa hai model
        if t5_count > gemini_count:
            print("=> Chọn T5 vì tìm thấy nhiều lỗi hơn.")
            return t5_res

        if gemini_count > t5_count:
            print("=> Chọn Gemini vì tìm thấy nhiều lỗi hơn.")
            return gemini_res

        # Trường hợp hòa (số lỗi bằng nhau) hoặc cả 2 đều = 0
        # Ưu tiên Gemini vì lời giải thích lỗi (message) của nó dễ hiểu hơn cho con người.
        print("=> Số lỗi bằng nhau. Hoàn thành")
        return gemini_res