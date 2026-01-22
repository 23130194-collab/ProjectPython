from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from grammar_checker.checkers import OpenRouterChecker

class RewriteTextAPI(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        text = request.data.get("text", "").strip()
        style = request.data.get("style", "Formal") # [NEW] Lấy style từ request

        if not text:
            return Response({"error": "No text provided"}, status=status.HTTP_400_BAD_REQUEST)

        checker = OpenRouterChecker()
        # Gọi hàm với tham số style
        result = checker.rewrite_text(text, style)

        return Response(result, status=status.HTTP_200_OK)