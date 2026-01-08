# grammar_checker/checkers/openrouter_checker.py
import requests
import json
from .base_checker import BaseGrammarChecker


class OpenRouterChecker(BaseGrammarChecker):
    def __init__(self):
        # API Configuration
        self.api_url = "https://openrouter.ai/api/v1/chat/completions"
        self.api_key = "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"

        self.model = "openai/gpt-3.5-turbo"

    def correct(self, text: str) -> dict:
        if not text.strip():
            return {"corrected": text, "errors": [], "source": "OpenRouter"}

        # Prompt được tối ưu để trả về JSON
        prompt = f"""You are an expert English grammar checker. Analyze the following text for ALL grammar, spelling, and punctuation errors.

        Return your response as a valid JSON object with this EXACT structure:
        
        {{
          "corrected": "the fully corrected version of the text",
          "errors": [
            {{
              "original": "the incorrect word or phrase",
              "suggestion": "the correct version",
              "message": "brief explanation of what's wrong",
              "type": "grammar/spelling/punctuation/article/verb_tense/word_form"
            }}
          ]
        }}
        
        Rules:
        1. Find ALL errors, even small ones
        2. Provide clear explanations
        3. Return ONLY the JSON object
        4. No markdown formatting, no extra text
        5. IMPORTANT: Preserve the original paragraph structure and line breaks exactly. Do not merge paragraphs.
        
        Text to check: "{text}"
        
        JSON Response:"""

        try:
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
                "HTTP-Referer": "http://localhost:8000",
                "X-Title": "Grammar Checker Pro"
            }

            payload = {
                "model": self.model,
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a professional English grammar checker. Always respond with valid JSON only, no markdown or extra text."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                "temperature": 0.2,  # Thấp để kết quả ổn định
                "max_tokens": 2000,
                "top_p": 1,
                "frequency_penalty": 0,
                "presence_penalty": 0
            }

            print(f"Calling OpenRouter API with model: {self.model}")

            response = requests.post(
                self.api_url,
                headers=headers,
                json=payload,
                timeout=60  # Tăng timeout vì AI có thể chậm
            )

            # Kiểm tra lỗi HTTP
            if response.status_code != 200:
                error_msg = f"OpenRouter API Error {response.status_code}"
                try:
                    error_data = response.json()
                    error_msg += f": {error_data.get('error', {}).get('message', 'Unknown error')}"
                except:
                    error_msg += f": {response.text}"

                print(f"{error_msg}")
                return {
                    "corrected": text,
                    "errors": [],
                    "source": f"OpenRouter (Error {response.status_code})"
                }

            data = response.json()

            # Kiểm tra cấu trúc response
            if 'choices' not in data or not data['choices']:
                print("Invalid response structure from OpenRouter")
                return {
                    "corrected": text,
                    "errors": [],
                    "source": "OpenRouter (Invalid Response)"
                }

            # Lấy nội dung từ response
            content = data['choices'][0]['message']['content'].strip()

            print(f"Raw response: {content[:200]}...")  # Debug

            # Loại bỏ markdown code blocks nếu có
            if content.startswith("```json"):
                content = content[7:]
            elif content.startswith("```"):
                content = content[3:]

            if content.endswith("```"):
                content = content[:-3]

            content = content.strip()

            # Parse JSON
            try:
                result = json.loads(content)

                print("=" * 50)
                print("API Response:")
                print(f"Corrected: {result.get('corrected', '')[:100]}...")
                print(f"Number of errors: {len(result.get('errors', []))}")
                for i, err in enumerate(result.get('errors', [])[:3]):  # In 3 lỗi đầu
                    print(f"Error {i}:")
                    print(f"  - original: {err.get('original')}")
                    print(f"  - suggestion: {err.get('suggestion')}")
                    print(f"  - message: {err.get('message')}")
                print("=" * 50)
            except json.JSONDecodeError as e:
                print(f"JSON Parse Error: {e}")
                print(f"Content: {content}")

                # Thử tìm JSON trong text
                import re
                json_match = re.search(r'\{.*\}', content, re.DOTALL)
                if json_match:
                    try:
                        result = json.loads(json_match.group())
                    except:
                        return {
                            "corrected": text,
                            "errors": [],
                            "source": "OpenRouter (JSON Parse Failed)"
                        }
                else:
                    return {
                        "corrected": text,
                        "errors": [],
                        "source": "OpenRouter (No JSON Found)"
                    }

            # Đảm bảo có đầy đủ fields
            if "corrected" not in result:
                result["corrected"] = text
            if "errors" not in result:
                result["errors"] = []

            valid_errors = []
            for error in result.get("errors", []):
                original = error.get("original", "").strip()
                suggestion = error.get("suggestion", "").strip()

                # Chỉ thêm vào nếu có sự khác biệt (không phân biệt hoa thường)
                if original and suggestion and original.lower() != suggestion.lower():
                    valid_errors.append(error)

            result["errors"] = valid_errors  # Gán lại danh sách đã lọc

            # Thêm thông tin về model đã dùng
            result["source"] = f"OpenRouter ({self.model})"

            print(f"Found {len(result['errors'])} errors")
            return result

        except requests.exceptions.Timeout:
            print("Request timeout")
            return {
                "corrected": text,
                "errors": [],
                "source": "OpenRouter (Timeout)"
            }

        except Exception as e:
            print(f"Exception: {type(e).__name__}: {e}")
            return {
                "corrected": text,
                "errors": [],
                "source": "OpenRouter (Exception)"
            }
