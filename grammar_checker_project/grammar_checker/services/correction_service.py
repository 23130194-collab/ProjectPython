from django.utils.html import strip_tags
from grammar_checker.models import CorrectionRequest, CorrectionResult
from grammar_checker.checkers import OpenRouterChecker, HuggingFaceChecker
from grammar_checker.services.quality_service import QualityService


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

        print("\nBắt đầu kiểm tra")

        # 2. Chạy model T5
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

        final_text_content = final_result["corrected"]
        final_errors = final_result.get("errors", [])

        # 5. Sử dụng LanguageTool để đánh giá chất lượng sau khi sửa
        print("\nĐánh giá chất lượng")

        # Gọi LanguageTool chấm điểm văn bản đã sửa
        quality_score, audit_details, remaining_errors = QualityService.evaluate(clean_text)

        if quality_score == -1:
            print("Không thể chấm điểm (Lỗi kết nối LanguageTool).")
        else:
            print(f"Kết quả sửa được chọn từ: {final_result['source']}")
            print(f"Điểm: {quality_score}/100")

            # Logic hiển thị thông báo dựa trên điểm số
            if quality_score == 100:
                print("Văn bản không còn lỗi.")
            elif quality_score >= 80:
                print(f"Khá tốt, nhưng vẫn còn {remaining_errors} vấn đề nhỏ:")
            else:
                print(f"Văn bản vẫn còn {remaining_errors} lỗi cần kiểm tra lại:")

            # In chi tiết lỗi còn sót (nếu có)
            if remaining_errors > 0:
                for i, detail in enumerate(audit_details, 1):
                    print(f"   {i}. {detail}")

        # 6. Lưu vào Database
        request = CorrectionRequest.objects.create(
            user=user,
            original_text=text,
            corrected_text=final_text_content,
            status="COMPLETED"
        )

        CorrectionResult.objects.create(
            request=request,
            checker_name=final_result["source"],
            corrected_text=final_text_content,
            error_details=final_errors
        )

        return {
            "request_id": request.id,
            "original": text,
            "corrected": final_text_content,
            "errors": final_errors,
            "source": final_result["source"],
            "quality_score": quality_score  # Trả về điểm số cho Frontend hiển thị
        }

    @staticmethod
    def select_best_result(gemini_res, t5_res):
        # Nếu Gemini lỗi, dùng T5
        if "Error" in gemini_res.get("source", "") or "Exception" in gemini_res.get("source", ""):
            print("Gemini gặp lỗi -> Sử dụng T5")
            return t5_res
        if "Error" in t5_res.get("source", ""):
            return gemini_res

        gemini_count = len(gemini_res.get("errors", []))
        t5_count = len(t5_res.get("errors", []))

        print(f"So sánh: Gemini ({gemini_count} lỗi) vs T5 ({t5_count} lỗi)")

        if t5_count > gemini_count:
            print("=> Chọn T5")
            return t5_res

        if gemini_count > t5_count:
            print("=> Chọn Gemini")
            return gemini_res

        print("=> Chọn Gemini")
        return gemini_res