import difflib
import re
import string
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
from .base_checker import BaseGrammarChecker


class HuggingFaceChecker(BaseGrammarChecker):
    _model = None
    _tokenizer = None

    def __init__(self):
        self.prefix = "grammar: "

        if HuggingFaceChecker._model is None:
            print("Đang tải model AI sửa ngữ pháp (vennify/t5-base-grammar)...")
            model_name = "vennify/t5-base-grammar-correction"

            try:
                HuggingFaceChecker._tokenizer = AutoTokenizer.from_pretrained(model_name)
                HuggingFaceChecker._model = AutoModelForSeq2SeqLM.from_pretrained(
                    model_name,
                    torch_dtype="auto",
                    low_cpu_mem_usage=True
                )
                HuggingFaceChecker._model.eval()
                print("AI Grammar đã sẵn sàng!")
            except Exception as e:
                print(f"Lỗi tải model: {e}")
                raise

    def correct(self, text: str) -> dict:
        if not text.strip():
            return {"corrected": text, "errors": [], "source": "AI"}

        sentences = re.split(r'(?<=[.!?])\s+', text.strip())

        all_corrected_sentences = []
        all_errors = []

        for sent in sentences:
            if not sent.strip():
                continue

            input_text = self.prefix + sent
            inputs = HuggingFaceChecker._tokenizer(
                input_text,
                return_tensors="pt",
                truncation=True,
                max_length=512
            )

            outputs = HuggingFaceChecker._model.generate(
                **inputs,
                max_new_tokens=256,
                num_beams=7,
                early_stopping=True,
                repetition_penalty=1.0
            )

            corrected_sent = HuggingFaceChecker._tokenizer.decode(
                outputs[0],
                skip_special_tokens=True
            ).strip()

            sub_errors = self.find_diff_errors(sent, corrected_sent)

            all_errors.extend(sub_errors)
            all_corrected_sentences.append(corrected_sent)

        final_corrected_text = " ".join(all_corrected_sentences)

        return {
            "corrected": final_corrected_text,
            "errors": all_errors,
            "source": "AI Grammar Pro"
        }

    def find_diff_errors(self, original, corrected):
        orig_words = original.split()
        corr_words = corrected.split()

        matcher = difflib.SequenceMatcher(None, orig_words, corr_words)
        errors = []

        for tag, i1, i2, j1, j2 in matcher.get_opcodes():
            if tag == 'equal':
                continue

            bad_segment_list = orig_words[i1:i2]
            suggestion_list = corr_words[j1:j2]

            is_common_word_error = (i2 - i1) <= 2 and any(len(w) < 4 for w in bad_segment_list)
            if is_common_word_error:
                if i1 > 0 and j1 > 0:
                    i1 -= 1
                    j1 -= 1
                if i2 < len(orig_words) and j2 < len(corr_words):
                    i2 += 1
                    j2 += 1
                bad_segment_list = orig_words[i1:i2]
                suggestion_list = corr_words[j1:j2]

            bad_segment = " ".join(bad_segment_list)
            suggestion = " ".join(suggestion_list)

            if self.is_clean_match(bad_segment, suggestion):
                continue

            error_message = self.classify_error(bad_segment, suggestion)

            if tag == 'replace':
                errors.append({
                    "type": "correction",
                    "original": bad_segment,
                    "suggestions": [suggestion],
                    "message": error_message
                })
            elif tag == 'delete':
                errors.append({
                    "type": "deletion",
                    "original": bad_segment,
                    "suggestions": [suggestion],
                    "message": "Từ thừa (Redundant)"
                })
            elif tag == 'insert':
                errors.append({
                    "type": "insertion",
                    "original": bad_segment,
                    "suggestions": [suggestion],
                    "message": "Thiếu từ (Missing word)"
                })

        return errors

    def classify_error(self, original, corrected):
        o = original.lower().strip()
        c = corrected.lower().strip()

        # --- BƯỚC 1: BÓC TÁCH CỤM TỪ (Quan trọng để fix lỗi 'bought a ice') ---
        # Nếu input là cụm từ (có dấu cách), hãy cố gắng loại bỏ các từ giống nhau ở 2 đầu
        if ' ' in o or ' ' in c:
            o_words = o.split()
            c_words = c.split()
            # Dùng difflib để tìm phần khác biệt cốt lõi
            matcher = difflib.SequenceMatcher(None, o_words, c_words)
            diff_ops = [op for op in matcher.get_opcodes() if op[0] != 'equal']

            # Nếu chỉ có 1 sự thay đổi (ví dụ: a -> an), hãy đệ quy để check từ đó
            if len(diff_ops) == 1:
                tag, i1, i2, j1, j2 = diff_ops[0]
                if tag == 'replace':
                    new_o = " ".join(o_words[i1:i2])
                    new_c = " ".join(c_words[j1:j2])
                    # Chỉ đệ quy nếu chuỗi ngắn đi (tránh lặp vô hạn)
                    if len(new_o) < len(o) or len(new_c) < len(c):
                        return self.classify_error(new_o, new_c)
        # -----------------------------------------------------------------------

        # 1. Lỗi viết hoa
        if o == c and original != corrected:
            return "Lỗi viết hoa (Capitalization)"

        # 2. Lỗi mạo từ (Fix được lỗi 'bought a ice')
        articles = ['a', 'an', 'the']
        if o in articles or c in articles:
            return "Lỗi mạo từ (Article Error)"

        # 3. Lỗi To-Infinitive / Gerund
        # Check kỹ: 'enjoy to' -> 'enjoyed'
        # Nếu từ gốc có 'to' mà từ sửa mất 'to' và thêm 'ed' -> Sai thì/dạng
        clean_o = o.replace('to', '').strip()
        if 'to ' in o and c.startswith(clean_o) and c.endswith('ed'):
            return "Sai thì động từ (Verb Tense)"

        if 'to ' in o and c.endswith('ing'):
            return "Sai cấu trúc V-ing (Gerund Error)"
        if o.endswith('ing') and 'to ' in c:
            return "Sai cấu trúc To-V (Infinitive Error)"

        # 4. Động từ bất quy tắc & Thì (Verb Tense)
        irregular_verbs = [
            'go', 'went', 'gone', 'see', 'saw', 'seen', 'eat', 'ate', 'eaten',
            'buy', 'bought', 'come', 'came', 'run', 'ran', 'take', 'took', 'taken',
            'get', 'got', 'give', 'gave', 'make', 'made', 'know', 'knew', 'pay', 'paid'
        ]
        if any(v == o or v == c for v in irregular_verbs):
            return "Sai thì động từ (Verb Tense)"

        # Check đuôi ed/ing
        if o + 'ed' == c or c + 'ed' == o: return "Sai thì động từ (Verb Tense)"
        if o + 'ing' == c or c + 'ing' == o: return "Sai dạng từ (Verb Form)"

        # 5. Đại từ / Giới từ / Tobe
        aux_verbs = ['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'have', 'has', 'had']
        if o in aux_verbs and c in aux_verbs: return "Lỗi chia động từ (Subject-Verb Agreement)"

        pronouns = ['i', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'his', 'your',
                    'their']
        if o in pronouns or c in pronouns: return "Lỗi đại từ (Pronoun Error)"

        preps = ['in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'about', 'from']
        if o in preps and c in preps: return "Lỗi giới từ (Wrong Preposition)"

        # 6. Số ít / Số nhiều
        if o + 's' == c or c + 's' == o or o + 'es' == c or c + 'es' == o:
            return "Lỗi số ít/nhiều (Singular/Plural)"

        # 7. Word Form (Dạng từ) - Logic mới
        # Nếu bắt đầu giống nhau nhưng đuôi khác nhau (beauty -> beautiful)
        if len(o) > 3 and len(c) > 3:
            if c.startswith(o[:3]) or o.startswith(c[:3]):
                return "Sai dạng từ (Word Form)"

        # 8. Chính tả (Chỉ khi rất giống nhau)
        ratio = difflib.SequenceMatcher(None, o, c).ratio()
        if ratio > 0.8:  # Tăng ngưỡng lên 0.8 để khắt khe hơn
            return "Lỗi chính tả (Spelling)"

        return "Lỗi ngữ pháp (Grammar Error)"

    def is_clean_match(self, s1, s2):
        # 1. Nếu giống hệt nhau -> Không lỗi
        if s1 == s2: return True

        # 2. Xóa sạch dấu câu để so sánh
        # Ví dụ: "sunny," -> "sunny"
        translator = str.maketrans('', '', string.punctuation)
        s1_clean = s1.translate(translator).lower().strip()
        s2_clean = s2.translate(translator).lower().strip()

        # 3. Nếu sau khi xóa dấu câu mà giống hệt nhau -> Không lỗi
        if s1_clean == s2_clean:
            return True

        return False