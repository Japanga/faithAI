# frozen_string_literal: true

require "json"
require "net/http"
require "open3"
require "uri"
require "tmpdir"

# Separate local server for optional image understanding. It keeps the existing
# Gemma 3 + mmproj path isolated from Faith's Qwen text/chat server.
module FaithVisionLocalAI
  module_function

  DEFAULT_HOST = "127.0.0.1"
  DEFAULT_PORT = 8081
  DEFAULT_MODEL_FILENAME = "gemma-3-4b-it-Q4_K_M.gguf"
  DEFAULT_MMPROJ_FILENAME = "mmproj-model-f16.gguf"
  DEFAULT_CONTEXT = "8192"
  DEFAULT_START_TIMEOUT = "180"

  def root; File.expand_path(__dir__); end
  def models_dir
    configured = ENV["FAITH_MODELS_DIR"].to_s.strip
    configured.empty? ? File.join(root, "models") : File.expand_path(configured)
  end
  def local_url
    ENV.fetch("FAITH_VISION_AI_URL", "http://#{DEFAULT_HOST}:#{DEFAULT_PORT}/v1/chat/completions").to_s.strip
  end
  def base_url
    uri = URI.parse(local_url)
    "#{uri.scheme}://#{uri.host}:#{uri.port}"
  rescue URI::InvalidURIError
    "http://#{DEFAULT_HOST}:#{DEFAULT_PORT}"
  end
  def port; URI.parse(local_url).port; rescue StandardError; DEFAULT_PORT; end

  def find_file(filename, env_name)
    configured = ENV[env_name].to_s.strip
    return File.expand_path(configured) if !configured.empty? && File.file?(File.expand_path(configured))
    return configured if !configured.empty? && File.file?(configured)
    [File.join(models_dir, filename), File.join(root, filename), File.join(Dir.pwd, "models", filename), File.join(Dir.pwd, filename)].find { |p| File.file?(p) }.to_s
  end
  def model_path; find_file(DEFAULT_MODEL_FILENAME, "FAITH_VISION_MODEL_PATH"); end
  def mmproj_path; find_file(DEFAULT_MMPROJ_FILENAME, "FAITH_VISION_MMPROJ_PATH"); end
  def llama_server_path
    configured = ENV["FAITH_LLAMA_SERVER"].to_s.strip
    return File.expand_path(configured) if !configured.empty? && File.file?(File.expand_path(configured))
    return configured if !configured.empty? && File.file?(configured)
    exe = Gem.win_platform? ? "llama-server.exe" : "llama-server"
    [File.join(root, exe), File.join(root, "bin", exe), File.join(Dir.pwd, exe), File.join(Dir.pwd, "bin", exe)].find { |p| File.file?(p) }.to_s
  end
  def model_name
    configured = ENV["FAITH_VISION_AI_MODEL"].to_s.strip
    return configured unless configured.empty? || configured == "local"
    uri = URI.parse("#{base_url}/v1/models")
    http = Net::HTTP.new(uri.host, uri.port); http.open_timeout = 1; http.read_timeout = 2
    JSON.parse(http.get(uri.request_uri).body.to_s).dig("data", 0, "id").to_s.strip
  rescue StandardError
    "local"
  end
  def ready?
    uri = URI.parse("#{base_url}/v1/models")
    http = Net::HTTP.new(uri.host, uri.port); http.open_timeout = 1; http.read_timeout = 2
    http.get(uri.request_uri).is_a?(Net::HTTPSuccess)
  rescue StandardError
    false
  end
  def pid_file; File.join(Dir.tmpdir, "faith_llama_vision.pid"); end
  def log_file; File.join(Dir.tmpdir, "faith_llama_vision.log"); end
  def process_alive?(pid); return false unless pid.to_i > 0; Process.kill(0, pid.to_i); true; rescue StandardError; false; end
  def existing_pid; Integer(File.read(pid_file).strip); rescue StandardError; nil; end
  def cleanup_stale_pid
    pid = existing_pid
    return unless pid.nil? || !process_alive?(pid) || !ready?
    File.delete(pid_file) if File.file?(pid_file)
  rescue StandardError; nil
  end
  def validate_files!
    model = model_path; mmproj = mmproj_path; llama = llama_server_path; missing = []
    missing << "#{DEFAULT_MODEL_FILENAME}" unless File.file?(model)
    missing << "#{DEFAULT_MMPROJ_FILENAME}" unless File.file?(mmproj)
    missing << "llama-server.exe" unless File.file?(llama)
    raise "Faith local vision is not configured: #{missing.join(', ')}" unless missing.empty?
    [llama, model, mmproj]
  end
  def build_server_args(llama, model, mmproj)
    [llama, "--model", model, "--mmproj", mmproj, "--host", DEFAULT_HOST, "--port", port.to_s, "--ctx-size", ENV.fetch("FAITH_VISION_CONTEXT", DEFAULT_CONTEXT).to_s]
  end
  def start_process(args)
    File.open(log_file, "ab") { |f| f.puts("\n=== Faith local VISION llama-server #{Time.now} ===\nCommand: #{args.join(' ')}") }
    log = File.open(log_file, "ab"); log.sync = true
    opts = Gem.win_platform? ? { new_pgroup: true } : { pgroup: true }
    begin; pid = Process.spawn(*args, out: log, err: log, **opts); ensure; log.close; end
    Process.detach(pid); File.write(pid_file, pid.to_s); pid
  end
  def log_tail(limit = 8000)
    return "(no vision log was created)" unless File.file?(log_file)
    File.read(log_file, mode: "rb").to_s.force_encoding("UTF-8").scrub.byteslice(-limit, limit).to_s
  rescue StandardError => e
    "(could not read vision log: #{e.class}: #{e.message})"
  end
  def wait_for_ready!(pid, timeout)
    deadline = Time.now + timeout
    until ready?
      raise "Vision llama-server exited during startup (PID #{pid}).\n#{log_tail}" unless process_alive?(pid)
      raise "Vision llama-server did not become ready within #{timeout} seconds.\n#{log_tail}" if Time.now >= deadline
      sleep 0.5
    end
  end
  def start!
    return true if ready?
    cleanup_stale_pid
    return true if ready?
    llama, model, mmproj = validate_files!
    pid = start_process(build_server_args(llama, model, mmproj))
    wait_for_ready!(pid, Integer(ENV.fetch("FAITH_VISION_START_TIMEOUT", DEFAULT_START_TIMEOUT)))
    true
  end
  def ensure_running!; return true if ready?; start!; end
  def status
    { ready: ready?, llama_server: llama_server_path, model: model_path, mmproj: mmproj_path, model_filename: File.basename(model_path.to_s), mmproj_filename: File.basename(mmproj_path.to_s), url: local_url, port: port, pid: existing_pid, pid_alive: process_alive?(existing_pid), log_file: log_file, log_tail: log_tail }
  end
end
