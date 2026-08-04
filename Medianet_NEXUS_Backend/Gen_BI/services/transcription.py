"""
transcription.py
Speech-to-text via Groq's hosted Whisper (whisper-large-v3-turbo).

Reuses GROQ_API_KEY — no separate account, no local faster-whisper fallback,
no huggingface-hub dependency. Multilingual (fr/en/…); Groq auto-detects the
language and returns it.

Env:
    GROQ_API_KEY          (same key as the chat provider)
    GROQ_WHISPER_MODEL    default "whisper-large-v3-turbo"
"""

import io
import os


class TranscriptionError(RuntimeError):
    pass


def transcribe_audio(audio_bytes: bytes, filename: str) -> dict:
    """
    Transcribe an uploaded audio file. Returns
    {"text": str, "detected_language": str | None}.

    `verbose_json` is requested so the response includes the detected language.
    Groq accepts flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm (max 25 MB).
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise TranscriptionError("GROQ_API_KEY is not set.")

    model = os.getenv("GROQ_WHISPER_MODEL", "whisper-large-v3-turbo")

    from groq import Groq

    client = Groq(api_key=api_key)

    # The SDK needs a file-like object with a name so it can infer the format.
    buffer = io.BytesIO(audio_bytes)
    buffer.name = filename or "audio.wav"

    try:
        resp = client.audio.transcriptions.create(
            file=buffer,
            model=model,
            response_format="verbose_json",
            temperature=0.0,
        )
    except Exception as e:  # noqa: BLE001
        raise TranscriptionError(str(e))

    # verbose_json exposes .text and .language
    text = getattr(resp, "text", "") or ""
    language = getattr(resp, "language", None)

    return {"text": text.strip(), "detected_language": language}