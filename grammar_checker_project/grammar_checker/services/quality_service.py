# grammar_checker/services/quality_service.py
import requests


class QualityService:
    @staticmethod
    def evaluate(text: str):
        if not text or not text.strip():
            return 0, [], 0

        # API công cộng chính thức
        api_url = "https://api.languagetool.org/v2/check"

        try:
            # Gửi request trực tiếp
            payload = {
                'text': text,
                'language': 'en-US',
                'enabledOnly': 'false'
            }

            # Timeout 10s để tránh treo server nếu mạng lag
            response = requests.post(api_url, data=payload, timeout=10)

            if response.status_code != 200:
                print(f"Lỗi API LanguageTool: {response.status_code} - {response.text}")
                return -1, ["Lỗi kết nối đến server chấm điểm"], 0

            result = response.json()
            matches = result.get('matches', [])

            error_count = len(matches)

            # Công thức tính điểm: với điểm gốc là 100 thì nếu có một lỗi - 5
            score = max(0, 100 - (error_count * 5))

            details = [match['message'] for match in matches]

            return score, details, error_count

        except Exception as e:
            print(f"Lỗi hệ thống QualityService: {e}")
            return -1, [f"Lỗi ngoại lệ: {str(e)}"], 0