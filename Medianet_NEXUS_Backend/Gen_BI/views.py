from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework import status

from .services.chatbot import answer_question
from .services.validator import validate_sql
from .services.transcription import transcribe_audio, TranscriptionError


# ── Chatbot — natural language question against the warehouse ─────────────────

@api_view(["POST"])
def ask(request):
    """
    POST /api/genbi/ask/
    Body: {
        "question": "How many active subscriptions are there?",
        "history":  [ {"role": "user"|"assistant", "content": "..."}, ... ]  # optional
    }
    Stateless — the frontend sends recent history; the server keeps no session.
    Returns SQL, the executed data, a natural-language answer, and any error.
    """
    try:
        question = request.data.get("question", "")
        history = request.data.get("history")  # may be None
        result = answer_question(question, history)
        return Response(result)
    except ValueError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ── Debug — validate SQL without executing ───────────────────────────────────

@api_view(["POST"])
def debug_validate(request):
    """POST /api/genbi/debug/validate/  Body: {"sql": "..."}"""
    sql = request.data.get("sql", "")
    valid, msg = validate_sql(sql)
    return Response({"valid": valid, "error": msg})


# ── Speech-to-text — Groq Whisper ────────────────────────────────────────────

@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser])
def transcribe(request):
    """
    POST /api/genbi/transcribe/  (multipart/form-data)
    Field: file=<audio>  (mp3, wav, m4a, ogg, webm, …; max 25 MB)
    Returns {"text": ..., "detected_language": ...}.
    """
    upload = request.FILES.get("file")
    if upload is None:
        return Response(
            {"error": "No file provided (field name must be 'file')."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    audio_bytes = upload.read()
    if not audio_bytes:
        return Response({"error": "Empty file"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        result = transcribe_audio(audio_bytes, upload.name)
        return Response(result)
    except TranscriptionError as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)