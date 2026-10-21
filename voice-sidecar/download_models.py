"""Explicit installation only. The running sidecar never downloads models."""
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
VOICES = ("en_US-lessac-medium", "en_US-ryan-medium", "en_US-amy-medium", "en_GB-alan-medium")


def main():
    os.environ.pop("HF_HUB_OFFLINE", None)
    from huggingface_hub import snapshot_download
    snapshot_download("Systran/faster-whisper-small.en",
        local_dir=ROOT / "models" / "whisper-small.en",
        allow_patterns=["config.json", "model.bin", "tokenizer.json", "vocabulary.txt"])
    subprocess.run([sys.executable, "-m", "piper.download_voices", "--data-dir",
                    str(ROOT / "models" / "piper"), *VOICES], check=True)
    print("Local speech models downloaded")


if __name__ == "__main__":
    main()
