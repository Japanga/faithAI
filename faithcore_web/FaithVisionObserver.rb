# frozen_string_literal: true

# FaithVisionObserver
# -------------------
# Fully local image understanding for Faith.
#
# This version deliberately does NOT use Ollama or a paid/cloud vision API.
# It launches llama-server.exe directly and talks to its OpenAI-compatible
# multimodal /v1/chat/completions endpoint.
#
# Vision is OPTIONAL. Faith never downloads the model automatically.
# The model and multimodal projector must already exist locally before an image
# description is requested. If they are missing, Faith returns a direct
# download link instead of starting a downloader or blocking normal startup.

require "json"
require "base64"
require "net/http"
require "uri"
require "open3"
require "fileutils"
require "shellwords"
require "thread"

class FaithVisionObserver
  DEFAULT_HOST = ENV.fetch("FAITH_LOCAL_VISION_URL", "http://127.0.0.1:8765").sub(%r{/\z}, "")
  DEFAULT_HF_MODEL = ENV.fetch("FAITH_VISION_HF_MODEL", "ggml-org/gemma-3-4b-it-GGUF")
  DEFAULT_API_MODEL = ENV.fetch("FAITH_VISION_API_MODEL", "gemma-3-4b-it")
  DEFAULT_CONTEXT = Integer(ENV.fetch("FAITH_VISION_CONTEXT", "8192"))
  DEFAULT_START_TIMEOUT = Integer(ENV.fetch("FAITH_VISION_START_TIMEOUT", "300"))
  DEFAULT_REQUEST_TIMEOUT = Integer(ENV.fetch("FAITH_VISION_REQUEST_TIMEOUT", "900"))
  DEFAULT_PORT = Integer(ENV.fetch("FAITH_VISION_PORT", "8765"))

  MODEL_FILENAME = "gemma-3-4b-it-Q4_K_M.gguf"
  MMPROJ_FILENAME = "mmproj-model-f16.gguf"
  MODEL_DOWNLOAD_URL = "https://huggingface.co/ggml-org/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q4_K_M.gguf"
  MMPROJ_DOWNLOAD_URL = "https://huggingface.co/ggml-org/gemma-3-4b-it-GGUF/resolve/main/mmproj-model-f16.gguf"

  class ObserverError < StandardError; end

  class MissingModelError < ObserverError
    attr_reader :download_url, :download_filename

    def initialize(message, download_url:, download_filename:)
      @download_url = download_url
      @download_filename = download_filename
      super(message)
    end
  end

  def self.cleanup_stale_processes!
    return unless Gem.win_platform?

    # Lifecycle cleanup is deliberately limited to OTHER Faith processes.
    # This may run once when a new Faith instance opens and once when the
    # current instance closes. The current PID is always excluded, so startup
    # cleanup cannot kill the Faith process that is still initializing.
    #
    # At startup this clears stale Faith sessions before WEBrick binds the
    # localhost port. At shutdown it clears anything orphaned by that session.
    # Only llama-server processes explicitly using Faith's vision port (8765)
    # are touched; unrelated llama-server instances are left alone.
    begin
      current_pid = Process.pid
      ps = <<~POWERSHELL
        $current=#{current_pid}
        Get-CimInstance Win32_Process | Where-Object {
          $_.ProcessId -ne $current -and (
            (($_.Name -ieq 'llama-server.exe') -and ($_.CommandLine -match '(?i)(--port\s+8765|-p\s+8765)')) -or
            (($_.Name -ieq 'ruby.exe' -or $_.Name -ieq 'rubyw.exe' -or $_.Name -ieq 'node.exe' -or $_.Name -ieq 'nodejs.exe') -and
             $_.CommandLine -match '(?i)faith|serversunset|faith_uploads')
          )
        } | Select-Object -ExpandProperty ProcessId
      POWERSHELL
      pids = IO.popen(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", ps], err: File::NULL, &:read)
      pids.to_s.lines.map { |line| Integer(line.strip) rescue nil }.compact.uniq.each do |pid|
        next if pid == current_pid
        system("taskkill", "/F", "/PID", pid.to_s, out: File::NULL, err: File::NULL)
      end
    rescue StandardError
      # Shutdown cleanup is defensive; never prevent the process from exiting.
    end
  end

  def initialize(host: DEFAULT_HOST, model: ENV["FAITH_VISION_API_MODEL"])
    @host = host.sub(%r{/\z}, "")
    @requested_model = model.to_s.strip
    @requested_model = DEFAULT_API_MODEL if @requested_model.empty?
    @process = nil
    @process_mutex = Mutex.new
    @selected_model = nil
    @activity = "idle"
    @shutdown_mutex = Mutex.new
    @shutdown_complete = false
    at_exit { shutdown! rescue nil }
  end

  def shutdown!
    should_cleanup = @shutdown_mutex.synchronize do
      next false if @shutdown_complete
      @shutdown_complete = true
      true
    end
    return unless should_cleanup

    # First stop the exact llama-server process this Faith instance spawned.
    # Then, and ONLY now that Faith is shutting down, clean up other stale
    # Faith/port-8765 processes left behind by previous sessions.
    @process_mutex.synchronize { stop_server! }
    self.class.cleanup_stale_processes!
  end

  def describe(data_url:, image_path: nil, question:, filename: "uploaded image")
    @activity = "starting"
    ensure_server!
    @activity = "analyzing"

    image_reference = if image_path.to_s.strip.empty?
                        data_url.to_s
                      else
                        local_file_url(image_path)
                      end

    # IMPORTANT: do not make three full vision generations for every upload.
    # On a local CPU model that can make the browser appear permanently stuck on
    # "sending". One grounded pass is the normal path; an optional second pass
    # can be enabled with FAITH_VISION_VERIFY=true.
    observation = chat(
      prompt: inventory_prompt(question, filename),
      image_reference: image_reference,
      max_tokens: Integer(ENV.fetch("FAITH_VISION_MAX_TOKENS", "700"))
    )
    reject_non_visual!(observation)

    if ENV.fetch("FAITH_VISION_VERIFY", "false").downcase == "true"
      verified = chat(
        prompt: verification_prompt(question, filename, observation),
        image_reference: image_reference,
        max_tokens: Integer(ENV.fetch("FAITH_VISION_VERIFY_MAX_TOKENS", "700"))
      )
      reject_non_visual!(verified)
      observation = verified
    end

    @activity = "ready"
    clean(observation)
  rescue ObserverError
    @activity = "error"
    raise
  rescue StandardError => e
    @activity = "error"
    raise ObserverError, "Local llama.cpp vision observer failed: #{e.class}: #{e.message}"
  end

  def status
    model = local_model_path
    mmproj = local_mmproj_path
    running = healthy?
    state = if !model
              "unavailable"
            elsif !mmproj
              "unavailable"
            elsif @activity == "error"
              "error"
            elsif @activity == "analyzing"
              "analyzing"
            elsif running
              "ready"
            else
              "offline"
            end

    {
      host: @host,
      requested_model: @requested_model,
      hf_model: DEFAULT_HF_MODEL,
      llama_server_running: running,
      server_path: (llama_server_path rescue nil),
      model: model,
      mmproj: mmproj,
      model_installed: !!model && !!mmproj,
      state: state,
      activity: @activity,
      progress: nil,
      stage: nil,
      current_file: nil,
      download_done_bytes: nil,
      download_total_bytes: nil,
      download_files: [],
      download_url: MODEL_DOWNLOAD_URL,
      mmproj_download_url: MMPROJ_DOWNLOAD_URL
    }
  rescue StandardError => e
    {
      host: @host,
      requested_model: @requested_model,
      hf_model: DEFAULT_HF_MODEL,
      llama_server_running: false,
      model_installed: false,
      state: "unavailable",
      error: e.message,
      download_url: MODEL_DOWNLOAD_URL,
      mmproj_download_url: MMPROJ_DOWNLOAD_URL
    }
  end

  private

  def llama_server_path
    explicit = ENV["FAITH_LLAMA_SERVER_PATH"].to_s.strip
    return explicit unless explicit.empty?

    candidates = [
      File.join(File.expand_path(__dir__), "vision", "llama-server.exe"),
      File.join(File.expand_path(__dir__), "llama-server.exe"),
      File.join(File.expand_path(__dir__), "vision", "llama-server"),
      File.join(File.expand_path(__dir__), "llama-server")
    ]
    found = candidates.find { |path| File.file?(path) }
    return found if found

    if Gem.win_platform?
      begin
        where = `where llama-server.exe 2>NUL`.lines.first.to_s.strip
        return where unless where.empty?
      rescue StandardError
        nil
      end
    end

    raise ObserverError,
          "llama-server.exe was not found. Put the official llama.cpp Windows x64 package in Faith/vision/ (with its DLL files), or set FAITH_LLAMA_SERVER_PATH."
  end

  def local_model_path
    explicit = ENV["FAITH_VISION_MODEL_PATH"].to_s.strip
    candidates = []
    candidates << explicit unless explicit.empty?
    root = File.expand_path(__dir__)
    candidates.concat([
      File.join(root, "vision", "models", MODEL_FILENAME),
      File.join(root, "vision", MODEL_FILENAME),
      File.join(root, "models", MODEL_FILENAME),
      File.join(root, MODEL_FILENAME)
    ])
    candidates.find { |path| File.file?(path) }
  end

  def local_mmproj_path
    explicit = ENV["FAITH_VISION_MMPROJ_PATH"].to_s.strip
    candidates = []
    candidates << explicit unless explicit.empty?
    root = File.expand_path(__dir__)
    candidates.concat([
      File.join(root, "vision", "models", MMPROJ_FILENAME),
      File.join(root, "vision", MMPROJ_FILENAME),
      File.join(root, "models", MMPROJ_FILENAME),
      File.join(root, MMPROJ_FILENAME)
    ])
    candidates.find { |path| File.file?(path) }
  end

  def require_local_vision_files!
    model = local_model_path
    unless model
      raise MissingModelError.new(
        "Faith cannot find the optional local vision model (#{MODEL_FILENAME}). " \
        "Image descriptions are disabled until you download it. Download it here: #{MODEL_DOWNLOAD_URL} " \
        "Then place the file in Faith/vision/models/#{MODEL_FILENAME}.",
        download_url: MODEL_DOWNLOAD_URL,
        download_filename: MODEL_FILENAME
      )
    end

    mmproj = local_mmproj_path
    unless mmproj
      raise MissingModelError.new(
        "Faith found #{MODEL_FILENAME}, but it cannot find the required multimodal projector (#{MMPROJ_FILENAME}). " \
        "Download it here: #{MMPROJ_DOWNLOAD_URL} Then place it in Faith/vision/models/#{MMPROJ_FILENAME}.",
        download_url: MMPROJ_DOWNLOAD_URL,
        download_filename: MMPROJ_FILENAME
      )
    end

    [model, mmproj]
  end

  def ensure_server!
    model, mmproj = require_local_vision_files!
    @selected_model = DEFAULT_API_MODEL

    return true if healthy?

    @process_mutex.synchronize do
      return true if healthy?

      exe = llama_server_path
      root = File.expand_path(__dir__)
      vision_dir = File.join(root, "vision")
      FileUtils.mkdir_p(vision_dir)
      log_path = File.join(vision_dir, "llama-server.log")
      log = File.open(log_path, "ab")
      log.sync = true
      log.write("\n=== Faith optional llama-server start #{Time.now} ===\n")

      args = [
        exe,
        "--host", "127.0.0.1",
        "--port", DEFAULT_PORT.to_s,
        "--ctx-size", DEFAULT_CONTEXT.to_s,
        "--media-path", root,
        "--model", model,
        "--mmproj", mmproj,
        "--alias", DEFAULT_API_MODEL,
        "--no-webui"
      ]

      @process = Process.spawn(*args, out: log, err: log, chdir: vision_dir)
      log.close

      deadline = Time.now + DEFAULT_START_TIMEOUT
      until healthy? || server_alive?
        if Time.now >= deadline
          log_tail = read_log_tail(log_path)
          stop_server!
          detail = log_tail.empty? ? "Check vision/llama-server.log." : "llama-server.log tail: #{log_tail}"
          raise ObserverError,
                "The optional local vision server could not start within #{DEFAULT_START_TIMEOUT}s. #{detail}"
        end
        sleep 0.5
      end
    end

    @activity = "loading"
    true
  rescue Errno::ENOENT => e
    raise ObserverError, "Could not start llama-server: #{e.message}"
  end

  def server_alive?
    uri = URI.parse("#{@host}/models")
    request = Net::HTTP::Get.new(uri)
    http = Net::HTTP.new(uri.host, uri.port)
    http.open_timeout = 1
    http.read_timeout = 2
    response = http.request(request)
    response.is_a?(Net::HTTPResponse)
  rescue StandardError
    false
  end

  def read_log_tail(path)
    return "" unless File.file?(path)
    File.read(path, mode: "rb")[-4000, 4000].to_s.gsub(/\s+/, " ").strip
  rescue StandardError
    ""
  end

  def healthy?
    uri = URI.parse("#{@host}/health")
    request = Net::HTTP::Get.new(uri)
    http = Net::HTTP.new(uri.host, uri.port)
    http.open_timeout = 1
    http.read_timeout = 2
    response = http.request(request)
    response.is_a?(Net::HTTPSuccess)
  rescue StandardError
    false
  end

  def stop_server!
    pid = @process
    @process = nil
    return unless pid

    begin
      Process.kill("TERM", pid)
    rescue StandardError
      nil
    end

    sleep 0.15
    if Gem.win_platform?
      begin
        system("taskkill", "/F", "/PID", pid.to_s, out: File::NULL, err: File::NULL)
      rescue StandardError
        nil
      end
    end
  end

  def http_json(path, payload, timeout: DEFAULT_REQUEST_TIMEOUT)
    uri = URI.parse("#{@host}#{path}")
    request = Net::HTTP::Post.new(uri)
    request["Content-Type"] = "application/json"
    request["Authorization"] = "Bearer no-key-required"
    request.body = JSON.generate(payload)

    http = Net::HTTP.new(uri.host, uri.port)
    http.open_timeout = 10
    http.read_timeout = timeout
    response = http.request(request)

    unless response.is_a?(Net::HTTPSuccess)
      detail = response.body.to_s.gsub(/\s+/, " ")[0, 2000]
      raise ObserverError, "llama-server HTTP #{response.code}: #{detail}"
    end

    JSON.parse(response.body)
  rescue JSON::ParserError => e
    raise ObserverError, "llama-server returned invalid JSON: #{e.message}"
  rescue Net::ReadTimeout => e
    raise ObserverError, "llama-server timed out while analyzing the image: #{e.message}"
  end

  def chat(prompt:, image_reference:, max_tokens: 700)
    content = [
      { "type" => "text", "text" => prompt },
      { "type" => "image_url", "image_url" => { "url" => image_reference } }
    ]

    data = http_json(
      "/v1/chat/completions",
      {
        "model" => (@selected_model.to_s.empty? ? DEFAULT_DOWNLOAD_MODEL : @selected_model),
        "messages" => [{ "role" => "user", "content" => content }],
        "temperature" => 0.1,
        "top_p" => 0.8,
        "max_tokens" => max_tokens,
        "stream" => false
      }
    )

    @selected_model = data.dig("model").to_s unless data.dig("model").to_s.empty?
    text = data.dig("choices", 0, "message", "content").to_s.strip
    raise ObserverError, "llama-server returned an empty visual observation." if text.empty?
    text
  end

  def local_file_url(path)
    absolute = File.expand_path(path)
    raise ObserverError, "The stored uploaded image does not exist: #{absolute}" unless File.file?(absolute)

    # llama-server accepts file:// paths when --media-path is enabled. Use a
    # normalized URI so Windows paths with spaces are safe.
    if Gem.win_platform?
      normalized = absolute.tr("\\", "/")
      "file:///#{URI::DEFAULT_PARSER.escape(normalized.sub(%r{\A/+}, ""))}"
    else
      "file://#{URI::DEFAULT_PARSER.escape(absolute)}"
    end
  end

  def inventory_prompt(question, filename)
    <<~PROMPT
      You are Faith's local visual evidence collector.

      Inspect the ACTUAL PIXELS of the supplied image. The filename "#{filename}" is
      not evidence and must not influence what you think is present.

      Build a factual inventory of only what you can actually see. Identify the main
      subjects and objects, people only when visible, colors, background, lighting,
      readable text, UI/screenshots, artwork or rendering style, and spatial relationships.

      USER REQUEST:
      #{question.to_s.strip.empty? ? "No specific question; describe what is visibly present." : question.to_s.strip[0, 4000]}

      STRICT RULES:
      - Never invent a stock photograph or generic scene.
      - Never invent people, clothing, rooms, tables, flowers, windows, or objects.
      - Do not infer a detail merely because it is common for this kind of picture.
      - If something is unclear, say uncertain.
      - If this is a game asset, character render, drawing, screenshot, icon, diagram,
        or UI, identify that only if it is actually visible.
      - Read text only when it is genuinely legible.
      - Return evidence only; do not address the user.
    PROMPT
  end

  def verification_prompt(question, filename, inventory)
    <<~PROMPT
      Re-inspect the ACTUAL PIXELS of "#{filename}" independently.

      Candidate report from the first pass:
      ---
      #{inventory[0, 12000]}
      ---

      Act as a strict visual fact checker. Compare every important claim above with
      the image itself. Remove unsupported claims and correct wrong objects, people,
      colors, text, setting, poses, and spatial relationships. Add details only when
      they are genuinely visible.

      USER REQUEST:
      #{question.to_s.strip.empty? ? "No specific question." : question.to_s.strip[0, 4000]}

      Do not produce a plausible generic description. The image itself is the only
      authority. Return a corrected visual evidence report.
    PROMPT
  end

  def final_prompt(question, filename, inventory, verified)
    <<~PROMPT
      Produce Faith's final grounded visual observation of "#{filename}".

      Look at the ACTUAL PIXELS again. The reports below are only internal evidence
      and may contain mistakes; never copy a claim that the pixels do not support.

      FIRST PASS:
      ---
      #{inventory[0, 9000]}
      ---

      VERIFIED PASS:
      ---
      #{verified[0, 11000]}
      ---

      USER REQUEST:
      #{question.to_s.strip.empty? ? "Describe what is actually visible in the uploaded image." : question.to_s.strip[0, 4000]}

      Give a natural, concrete description starting with the most important visible
      elements. Mention exact objects, people, colors, readable text, setting,
      composition and spatial relationships only when supported by the image.

      If something cannot be established visually, say it is unclear instead of
      guessing. Never invent a generic family, living room, table, vase, clothing,
      scenery, or other stock-image content.

      Do not mention models, APIs, llama.cpp, prompts, or server internals.
    PROMPT
  end

  def reject_non_visual!(text)
    lower = text.to_s.downcase
    canned = [
      "unable to view",
      "can't view",
      "cannot view",
      "don't have access to visual",
      "do not have access to visual",
      "provide a description of the image",
      "if you can provide a description",
      "i cannot see the image",
      "i can't see the image"
    ]
    if canned.any? { |phrase| lower.include?(phrase) }
      raise ObserverError,
            "The local vision model returned a non-visual response instead of analyzing the supplied pixels."
    end
  end

  def clean(text)
    text.to_s
      .gsub(/\A```(?:text|markdown)?\s*/i, "")
      .gsub(/\s*```\z/, "")
      .gsub(/\n{4,}/, "\n\n")
      .strip
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    path = ARGV[0].to_s
    question = ARGV[1].to_s
    raise FaithVisionObserver::ObserverError, "Usage: ruby FaithVisionObserver_v22.rb image.png \"What is in this image?\"" if path.empty?

    bytes = File.binread(path)
    mime = case File.extname(path).downcase
           when ".jpg", ".jpeg" then "image/jpeg"
           when ".webp" then "image/webp"
           else "image/png"
           end
    data_url = "data:#{mime};base64,#{Base64.strict_encode64(bytes)}"
    puts FaithVisionObserver.new.describe(data_url: data_url, image_path: path, question: question, filename: File.basename(path))
  rescue FaithVisionObserver::ObserverError => e
    warn e.message
    exit 1
  end
end
