from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from grammar_checker.services.correction_service import CorrectionService


class CheckGrammarAPI(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        text = request.data.get("text", "").strip()

        if not text:
            return Response(
                {"error": "Vui lòng nhập văn bản"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Đổi từ đếm ký tự sang đếm từ
        word_count = len(text.split())
        if word_count > 1500:
            return Response(
                {"error": f"Văn bản quá dài ({word_count} từ). Vui lòng nhập dưới 1500 từ."},
                status=status.HTTP_400_BAD_REQUEST
            )

        result = CorrectionService.process_text(request.user, text)

        return Response({
            "errors": result.get("errors", []),
            "request_id": result.get("request_id")
        }, status=status.HTTP_200_OK)
