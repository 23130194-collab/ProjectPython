import difflib
import re
import string
import torch
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
from .base_checker import BaseGrammarChecker


class HuggingFaceChecker(BaseGrammarChecker):
    _model = None
    _tokenizer = None

    def __init__(self):
        # Model này chuyên sửa lỗi ngữ pháp tốt hơn bản t5-base cũ
        self.model_name = "vennify/t5-base-grammar-correction"
        self.device = "cpu"

        if HuggingFaceChecker._model is None:
            print(f"Đang tải model {self.model_name}...")
            try:
                HuggingFaceChecker._tokenizer = AutoTokenizer.from_pretrained(self.model_name)
                HuggingFaceChecker._model = AutoModelForSeq2SeqLM.from_pretrained(
                    self.model_name,
                    torch_dtype=torch.float32,
                ).to(self.device)
                HuggingFaceChecker._model.eval()
                print("AI Grammar (HuggingFace) đã sẵn sàng!")
            except Exception as e:
                print(f"Lỗi tải model HuggingFace: {e}")
                pass

    def correct(self, text: str) -> dict:
        if HuggingFaceChecker._model is None or not text.strip():
            return {"corrected": text, "errors": [], "source": "HuggingFace"}

        sentences = re.split(r'(?<=[.!?])\s+', text)
        valid_sentences = [s.strip() for s in sentences if s.strip()]

        if not valid_sentences:
            return {"corrected": text, "errors": [], "source": "HuggingFace"}

        # BATCH INFERENCE: Sửa tất cả các câu cùng lúc
        input_texts = ["grammar: " + s for s in valid_sentences]
        inputs = HuggingFaceChecker._tokenizer(
            input_texts, return_tensors="pt", padding=True, truncation=True, max_length=512
        ).to(self.device)

        with torch.no_grad():
            outputs = HuggingFaceChecker._model.generate(
                inputs.input_ids,
                max_length=512,
                # TĂNG ĐỘ CHÍNH XÁC:
                num_beams=5,          # Tìm kiếm kỹ hơn (thay vì 1)
                early_stopping=True,
                repetition_penalty=1.2 # Tránh lặp từ
            )

        corrected_texts = [
            HuggingFaceChecker._tokenizer.decode(out, skip_special_tokens=True).strip()
            for out in outputs
        ]

        # So sánh lỗi giữa mảng câu gốc và mảng câu đã sửa
        all_errors = []
        for orig, corr in zip(valid_sentences, corrected_texts):
            all_errors.extend(self.find_diff_errors(orig, corr))

        return {
            "corrected": " ".join(corrected_texts),
            "errors": all_errors,
            "source": "HuggingFace (High Accuracy)"
        }

    def find_diff_errors(self, original, corrected):
        orig_words = original.split()
        corr_words = corrected.split()
        matcher = difflib.SequenceMatcher(None, orig_words, corr_words)
        errors = []

        for tag, i1, i2, j1, j2 in matcher.get_opcodes():
            if tag == 'equal': continue

            # Lấy đoạn văn bản gốc và gợi ý
            bad_segment_list = orig_words[i1:i2]
            suggestion_list = corr_words[j1:j2]

            msg = "Lỗi ngữ pháp"
            type_err = "grammar"

            # 1. Xử lý trường hợp INSERT (Thiếu từ) -> Neo vào từ phía trước
            if tag == 'insert':
                # Nếu không phải đầu câu, lấy từ liền trước để làm mốc highlight
                if i1 > 0:
                    # Original: Lấy từ phía trước (VD: "I")
                    bad_segment_list = [orig_words[i1 - 1]]
                    # Suggestion: Từ phía trước + Từ mới (VD: "I am")
                    suggestion_list = [orig_words[i1 - 1]] + suggestion_list
                    msg = "Thiếu từ (Missing word)"
                    type_err = "insertion"
                else:
                    # Nếu lỗi ở ngay đầu câu, lấy từ phía sau làm mốc (nếu có)
                    if i2 < len(orig_words):
                         bad_segment_list = [orig_words[i2]]
                         suggestion_list = suggestion_list + [orig_words[i2]]
                         msg = "Thiếu từ đầu câu"
                         type_err = "insertion"

            # 2. Xử lý trường hợp DELETE (Thừa từ)
            elif tag == 'delete':
                msg = "Từ thừa (Redundant)"
                type_err = "deletion"
                suggestion_list = []  # Xóa hẳn

            elif tag == 'replace':
                msg = "Lỗi ngữ pháp/Từ vựng"
                type_err = "correction"

            # Tạo chuỗi kết quả
            bad_segment = " ".join(bad_segment_list)
            suggestion = " ".join(suggestion_list)

            # Bỏ qua nếu clean match (như đã làm)
            if self.is_clean_match(bad_segment, suggestion) and tag != 'delete':
                continue

            errors.append({
                "type": type_err,
                "original": bad_segment,
                "suggestions": [suggestion],
                "message": msg
            })

        return errors

    def is_clean_match(self, s1, s2):
        if s1 == s2: return True
        translator = str.maketrans('', '', string.punctuation)
        return s1.translate(translator).lower().strip() == s2.translate(translator).lower().strip()