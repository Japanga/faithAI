# Faith Qwen2 0.5B Win7 local integration

This package uses the Windows-7-compatible llama-server.exe with:

- Qwen2-0.5B-Instruct Q4_K_M
- 127.0.0.1:8080
- 4096-token context
- Faith web server on 127.0.0.1:4567

The BAT now starts the Qwen server explicitly, waits for /health, and then starts Faith. If 8080 is already running, it reuses the existing server instead of launching a second copy.

Place `llama-server.exe` beside `server.rb`, and place the Qwen GGUF in `models\`.

The Gemma/mmproj vision files are not used by the Qwen chat server. Keep them for the separate vision integration work.
