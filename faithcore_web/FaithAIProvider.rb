# frozen_string_literal: true

require "json"
require "faraday"
require "timeout"
require "open3"
require "uri"
require "tmpdir"

# FaithAIProvider is the only chat-inference gateway used by server.rb.
# The application defaults to LOCAL inference. Vireonix remains available only
# as an explicitly selected compatibility provider.
module FaithAIProvider
  Response = Struct.new(:status, :body, :headers, keyword_init: true) do
    def success?
      status.to_i >= 200 && status.to_i < 300
    end
  end

  module_function

  # This is the single language-model gateway for Faith.
  #
  # Faith's Ruby application (server.rb on :4567) owns the conversation,
  # personality, emotions, image generation, uploads, coding/troubleshooting,
  # sourcing, and UI. The local llama-server on :8080 is deliberately treated
  # as a stateless inference backend: Ruby sends it the current message history
  # and receives one generated assistant message back.
  #
  # Nothing in this provider attempts to synchronize with llama.cpp's browser UI.
  # That UI is only a convenient diagnostic/test client. Faith never depends on
  # a conversation being typed into that page.
  def chat(connection:, model:, messages:, provider: ENV.fetch("FAITH_AI_PROVIDER", "local"))
    case provider.to_s.downcase
    when "local", "llama", "llama-server", ""
      LocalAIProvider.chat(connection: connection, model: model, messages: messages)
    when "vireonix"
      # Compatibility only. Normal Faith operation never falls back to Vireonix.
      VireonixProvider.chat(connection: connection, model: model, messages: messages)
    else
      Response.new(
        status: 500,
        body: JSON.generate("error" => { "message" => "Unknown Faith AI provider: #{provider}" }),
        headers: {}
      )
    end
  rescue Faraday::Error, Timeout::Error, Errno::ECONNREFUSED, SocketError => error
    Response.new(
      status: 503,
      body: JSON.generate("error" => { "message" => "Faith local AI is unavailable: #{error.message}" }),
      headers: {}
    )
  end
end

module LocalAIProvider
  module_function

  DEFAULT_URL = "http://127.0.0.1:8080/v1/chat/completions"
  DEFAULT_TIMEOUT = 600
  DEFAULT_OPEN_TIMEOUT = 30
  DEFAULT_HEALTH_TIMEOUT = 2
  DEFAULT_MAX_TOKENS = 2048

  # Send exactly one stateless inference request. The complete conversation
  # history comes from server.rb; this class does not maintain a second chat.
  def chat(connection:, model:, messages:)
    url = ENV.fetch("FAITH_LOCAL_AI_URL", DEFAULT_URL)
    timeout = Integer(ENV.fetch("FAITH_LOCAL_AI_TIMEOUT", DEFAULT_TIMEOUT.to_s))
    open_timeout = Integer(ENV.fetch("FAITH_LOCAL_AI_OPEN_TIMEOUT", DEFAULT_OPEN_TIMEOUT.to_s))
    max_tokens = Integer(ENV.fetch("FAITH_LOCAL_MAX_TOKENS", DEFAULT_MAX_TOKENS.to_s))
    local_model = ENV.fetch("FAITH_LOCAL_AI_MODEL", model.to_s == "auto" ? "local" : model)

    payload = {
      model: local_model,
      messages: Array(messages),
      stream: false,
      max_tokens: max_tokens
    }

    # Do not send the request while llama-server is still loading the GGUF.
    # The startup BAT normally starts it first, but this also makes the Ruby
    # side safe when Faith is launched directly.
    ensure_ready!(connection, url)

    response = connection.post(url) do |request|
      request.options.timeout = timeout
      request.options.open_timeout = [open_timeout, timeout].min
      request.headers["Content-Type"] = "application/json"
      request.headers["Connection"] = "close"
      request.body = JSON.generate(payload)
    end

    FaithAIProvider::Response.new(
      status: response.status,
      body: response.body.to_s,
      headers: response.headers
    )
  rescue Faraday::ConnectionFailed, Errno::ECONNREFUSED, SocketError
    # If :8080 is not running, start it if the environment provides enough
    # information, then wait for /health before attempting the real request.
    start_local_server_if_configured
    ensure_ready!(connection, url)

    response = connection.post(url) do |request|
      request.options.timeout = timeout
      request.options.open_timeout = [open_timeout, timeout].min
      request.headers["Content-Type"] = "application/json"
      request.headers["Connection"] = "close"
      request.body = JSON.generate(payload)
    end

    FaithAIProvider::Response.new(
      status: response.status,
      body: response.body.to_s,
      headers: response.headers
    )
  end

  def health_url(completions_url)
    uri = URI.parse(completions_url.to_s)
    uri.path = "/health"
    uri.query = nil
    uri.fragment = nil
    uri.to_s
  rescue URI::InvalidURIError
    "http://127.0.0.1:8080/health"
  end

  def ready?(connection, completions_url)
    url = health_url(completions_url)
    response = connection.get(url) do |request|
      request.options.timeout = Integer(ENV.fetch("FAITH_LOCAL_HEALTH_TIMEOUT", DEFAULT_HEALTH_TIMEOUT.to_s))
      request.options.open_timeout = Integer(ENV.fetch("FAITH_LOCAL_HEALTH_OPEN_TIMEOUT", DEFAULT_HEALTH_TIMEOUT.to_s))
    end
    response.status.to_i == 200
  rescue StandardError
    false
  end

  def ensure_ready!(connection, completions_url)
    return if ready?(connection, completions_url)

    start_local_server_if_configured

    wait_seconds = Integer(ENV.fetch("FAITH_LOCAL_START_TIMEOUT", "180"))
    deadline = Time.now + wait_seconds
    loop do
      return if ready?(connection, completions_url)
      break if Time.now >= deadline
      sleep 1
    end

    raise Timeout::Error, "Faith local AI at #{health_url(completions_url)} did not become ready within #{wait_seconds} seconds"
  end

  def discover_llama_server
    candidates = if Gem.win_platform?
      [
        File.join(Dir.pwd, "llama-server.exe"),
        File.join(Dir.pwd, "bin", "llama-server.exe"),
        File.join(File.expand_path(__dir__), "llama-server.exe"),
        File.join(File.expand_path(__dir__), "bin", "llama-server.exe")
      ]
    else
      [
        File.join(Dir.pwd, "llama-server"),
        File.join(Dir.pwd, "bin", "llama-server"),
        File.join(File.expand_path(__dir__), "llama-server"),
        File.join(File.expand_path(__dir__), "bin", "llama-server")
      ]
    end
    candidates.find { |path| File.file?(path) }.to_s
  end

  def discover_model
    configured = Dir.glob(File.join(File.expand_path(__dir__), "models", "*.gguf")) +
                 Dir.glob(File.join(Dir.pwd, "models", "*.gguf"))
    configured.uniq.first.to_s
  end

  def start_local_server_if_configured
    return if ENV.fetch("FAITH_LOCAL_AUTOSTART", "true").downcase == "false"

    command = ENV["FAITH_LLAMA_SERVER"].to_s.strip
    model_path = ENV["FAITH_LOCAL_MODEL_PATH"].to_s.strip
    command = discover_llama_server if command.empty?
    model_path = discover_model if model_path.empty?
    return if command.empty? || model_path.empty?
    return unless File.file?(model_path)

    port = URI.parse(ENV.fetch("FAITH_LOCAL_AI_URL", DEFAULT_URL)).port
    lock_path = File.join(Dir.tmpdir, "faith-local-ai.lock")
    return if File.exist?(lock_path)

    File.write(lock_path, Process.pid.to_s)
    begin
      args = [command, "--model", model_path, "--host", "127.0.0.1", "--port", port.to_s]
      context = ENV["FAITH_LOCAL_CONTEXT"]
      args += ["--ctx-size", context] if context && !context.empty?
      alias_name = ENV["FAITH_LOCAL_AI_MODEL_ALIAS"].to_s.strip
      args += ["--alias", alias_name] unless alias_name.empty?

      # Detach the server from Faith's request thread. The process must continue
      # living after this method returns so :4567 can immediately use :8080.
      if Gem.win_platform?
        Process.spawn(*args, out: File::NULL, err: File::NULL, new_pgroup: true)
      else
        Process.spawn(*args, out: File::NULL, err: File::NULL, pgroup: true)
      end
    rescue StandardError => error
      warn "Faith could not auto-start local llama-server: #{error.class}: #{error.message}"
    ensure
      File.delete(lock_path) if File.exist?(lock_path)
    end
  end
end

module VireonixProvider
  module_function

  def chat(connection:, model:, messages:)
    url = ENV.fetch("FAITH_VIREONIX_AI_URL", "https://vireonix.ai/v1/chat/completions")
    response = connection.post(url) do |request|
      request.headers["Content-Type"] = "application/json"
      request.body = JSON.generate(model: model, messages: messages)
    end
    FaithAIProvider::Response.new(status: response.status, body: response.body.to_s, headers: response.headers)
  end
end
