# from rest_framework.views import APIView
# from rest_framework.response import Response
# from rest_framework.permissions import IsAuthenticated   # ← THAY ĐỔI TẠI ĐÂY
# from rest_framework import status
# from grammar_checker.services.correction_service import CorrectionService
#
# class CheckGrammarAPI(APIView):
#     permission_classes = [IsAuthenticated]   # ← DÙNG CÁI NÀY THAY CHO LoginRequiredMixin
#
#     def post(self, request):
#         text = request.data.get("text", "").strip()
#         if not text:
#             return Response({"error": "Vui lòng nhập văn bản"}, status=400)
#
#         result = CorrectionService.process_text(request.user, text)
#         return Response(result, status=status.HTTP_200_OK)
#

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

        result = CorrectionService.process_text(request.user, text)

        #  BẮT BUỘC PHẢI CÓ request_id
        return Response({
            "errors": result.get("errors", []),
            "request_id": result.get("request_id")
        }, status=status.HTTP_200_OK)
