# grammar_checker/checkers/openrouter_checker.py
import requests
import json
from .base_checker import BaseGrammarChecker


class OpenRouterChecker(BaseGrammarChecker):
    def __init__(self):
        # API Configuration
        self.api_url = "https://openrouter.ai/api/v1/chat/completions"
        self.api_key = "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"

        self.model = "google/gemini-2.0-flash-001"

    def correct(self, text: str) -> dict:
        if not text.strip():
            return {"corrected": text, "errors": [], "source": "Gemini AI"}

        # Prompt được tinh chỉnh cho Gemini để đảm bảo JSON đúng định dạng
        prompt = f"""You are an expert English grammar editor.
                Task: Correct the following text for grammar, spelling, punctuation, and vocabulary errors.
                
                CRITICAL RULES:
                1. Return ONLY strict JSON.
                2. PRESERVE the original meaning, tone, and style absolutely.
                3. If a sentence is grammatically correct but awkward, DO NOT rewrite it (unless it's unintelligible).
                4. Focus only on objective errors (wrong tense, wrong preposition, spelling), NOT subjective style improvements.
                
                Input Text: "{text}"
            
                Output Requirement:
                Return ONLY a valid JSON object. Do not output markdown code blocks (```json).
                The JSON must follow this structure exactly:
                {{
                  "corrected": "The fully corrected text here",
                  "errors": [
                    {{
                      "original": "wrong text",
                      "suggestion": "correct text",
                      "message": "Explain why this is an error in 1 short sentence",
                      "type": "grammar" 
                    }}
                  ]
                }}
            
                Valid types are: "grammar", "spelling", "punctuation", "vocabulary", "style".
                If there are no errors, return an empty "errors" array and the original text in "corrected".
                """

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
                        "content": "You are a helpful AI assistant that outputs only valid JSON."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                "temperature": 0.1,  # Giảm nhiệt độ để kết quả ổn định nhất
                "top_p": 0.9,
            }

            print(f"Calling OpenRouter API with model: {self.model}")
            response = requests.post(self.api_url, headers=headers, json=payload, timeout=30)

            if response.status_code != 200:
                print(f"API Error: {response.text}")
                return {"corrected": text, "errors": [], "source": "Gemini (Error)"}

            data = response.json()
            content = data['choices'][0]['message']['content'].strip()

            # Clean markdown nếu Gemini lỡ thêm vào
            if content.startswith("```json"): content = content[7:]
            if content.startswith("```"): content = content[3:]
            if content.endswith("```"): content = content[:-3]
            content = content.strip()

            result = json.loads(content)

            # Chuẩn hóa dữ liệu trả về
            if "corrected" not in result: result["corrected"] = text
            if "errors" not in result: result["errors"] = []

            result["source"] = "Google Gemini 2.0 Flash"
            return result

        except Exception as e:
            print(f"OpenRouter Exception: {e}")
            return {"corrected": text, "errors": [], "source": "Gemini (Exception)"}

    #Code rewrite
    # def rewrite(self, text: str, style: str) -> dict:
    #     """
    #     Hàm viết lại văn bản theo phong cách cụ thể (Formal, Creative, Concise)
    #     """
    #     if not text.strip():
    #         return {"rewritten": ""}
    #
    #     style_prompts = {
    #         "Formal": "Make the text more professional, academic, and polite.",
    #         "Creative": "Make the text more engaging, descriptive, and vivid.",
    #         "Concise": "Make the text shorter, clearer, and remove unnecessary words."
    #     }
    #
    #     selected_instruction = style_prompts.get(style, style_prompts["Formal"])
    #
    #     prompt = f"""You are an expert writing assistant.
    #     Task: Rewrite the following text.
    #     Style Goal: {selected_instruction}
    #
    #     CRITICAL RULES:
    #     1. Keep the original meaning 100% intact. Do not add new facts.
    #     2. Output ONLY a valid JSON object. No markdown.
    #
    #     Input Text: "{text}"
    #
    #     JSON Structure:
    #     {{
    #         "rewritten": "The rewritten version here"
    #     }}
    #     """
    #
    #     try:
    #         payload = {
    #             "model": self.model,
    #             "messages": [
    #                 {"role": "system", "content": "You are a helpful AI writing assistant."},
    #                 {"role": "user", "content": prompt}
    #             ],
    #             "temperature": 0.7,  # Tăng nhẹ để văn phong tự nhiên hơn
    #         }
    #
    #         response = requests.post(self.api_url, headers={
    #             "Content-Type": "application/json",
    #             "Authorization": f"Bearer {self.api_key}",
    #             "HTTP-Referer": "http://localhost:8000",
    #             "X-Title": "Grammar Checker Pro"
    #         }, json=payload, timeout=30)
    #
    #         data = response.json()
    #         content = data['choices'][0]['message']['content'].strip()
    #
    #         # Clean markdown
    #         if content.startswith("```json"): content = content[7:]
    #         if content.startswith("```"): content = content[3:]
    #         if content.endswith("```"): content = content[:-3]
    #
    #         result = json.loads(content.strip())
    #         return {"rewritten": result.get("rewritten", text), "style": style}
    #
    #     except Exception as e:
    #         print(f"Rewrite Error: {e}")
    #         return {"rewritten": text, "error": str(e)}

    def rewrite_text(self, text: str, style: str = "Formal") -> dict:
        if not text.strip():
            return {}

        # Định nghĩa hướng dẫn cho từng style
        style_instructions = {
            "Formal": "Make the text professional, academic, and polite. Use sophisticated vocabulary.",
            "Creative": "Make the text engaging, vivid, and storytelling-oriented. Use metaphors if appropriate.",
            "Concise": "Make the text short, clear, and to the point. Remove unnecessary words."
        }

        instruction = style_instructions.get(style, style_instructions["Formal"])

        prompt = f"""You are a professional writing assistant.
        Task: Rewrite the input text according to the following style goal.

        Style Goal: {instruction}

        Input Text: "{text}"

        Output Requirement:
        Return ONLY a valid JSON object. No markdown.
        {{
            "rewritten_text": "The rewritten version of the text"
        }}
        """

        try:
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
                "HTTP-Referer": "http://localhost:8000",
                "X-Title": "Grammar Checker Pro"
            }

            payload = {
                "model": self.model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.7,
            }

            response = requests.post(self.api_url, headers=headers, json=payload, timeout=45)
            data = response.json()
            content = data['choices'][0]['message']['content'].strip()

            # Clean markdown
            if content.startswith("```json"): content = content[7:]
            if content.startswith("```"): content = content[3:]
            if content.endswith("```"): content = content[:-3]

            return json.loads(content.strip())

        except Exception as e:
            print(f"Rewrite Error: {e}")
            return {}
