import io
import re
from docx import Document
from pypdf import PdfReader


class FileReaderService:
    @staticmethod
    def read_file(uploaded_file):
        """
        Đọc file upload (InMemoryUploadedFile) và trả về string text.
        Hỗ trợ: .txt, .docx, .pdf
        """
        filename = uploaded_file.name.lower()

        try:
            # 1. Xử lý file .txt
            if filename.endswith('.txt'):
                return uploaded_file.read().decode('utf-8')

            # 2. Xử lý file .docx
            elif filename.endswith('.docx'):
                doc = Document(uploaded_file)
                full_text = []
                for para in doc.paragraphs:
                    full_text.append(para.text)
                return '\n'.join(full_text)

            # 3. Xử lý file .pdf
            elif filename.endswith('.pdf'):
                reader = PdfReader(uploaded_file)
                full_text = []
                for page in reader.pages:
                    text = page.extract_text()
                    if text:
                        text = text.replace('\n', ' ')
                        text = re.sub(r'\s+', ' ', text).strip()

                        full_text.append(text)

                return ' '.join(full_text)

            else:
                raise ValueError("Định dạng file không được hỗ trợ, chỉ hộ trợ các file có dạng .txt, .docx, .pdf")

        except Exception as e:
            raise ValueError(f"Lỗi khi đọc file: {str(e)}")