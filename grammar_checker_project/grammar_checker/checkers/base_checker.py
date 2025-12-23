from abc import ABC, abstractmethod
from typing import Dict, List

class BaseGrammarChecker(ABC):
    @abstractmethod
    def correct(self, text: str) -> Dict:
        """
        Trả về dict chứa:
        - corrected: str (văn bản đã sửa)
        - errors: List[dict] (danh sách lỗi chi tiết, có thể rỗng)
        - source: str (tên checker)
        """
        pass