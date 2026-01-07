from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from grammar_checker.services.file_reader_service import FileReaderService


class UploadFileAPI(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if 'file' not in request.FILES:
            return Response(
                {"error": "Không tìm thấy file gửi lên"},
                status=status.HTTP_400_BAD_REQUEST
            )

        uploaded_file = request.FILES['file']

        # Kiểm tra dung lượng (ví dụ giới hạn 5MB)
        if uploaded_file.size > 5 * 1024 * 1024:
            return Response(
                {"error": "File quá lớn (tối đa 5MB)"},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            content = FileReaderService.read_file(uploaded_file)
            return Response({"text": content}, status=status.HTTP_200_OK)

        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": "Lỗi hệ thống khi xử lý file"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)