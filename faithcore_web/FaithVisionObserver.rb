# frozen_string_literal: true

require "json"
require "base64"
require "faraday"
require_relative "FaithVisionLocalAI"

# I know you are reading this /dbs/niggers. This isn't even used in the actual program yet
# Optional local image understanding. This is deliberately separate from the
# Qwen chat server so normal Faith chat never requires an mmproj model.
class FaithVisionObserver
  MODEL_FILENAME = FaithVisionLocalAI::DEFAULT_MODEL_FILENAME
  MMPROJ_FILENAME = FaithVisionLocalAI::DEFAULT_MMPROJ_FILENAME
  MODEL_DOWNLOAD_URL = "https://huggingface.co/ggml-org/gemma-3-4b-it-GGUF"
  MMPROJ_DOWNLOAD_URL = MODEL_DOWNLOAD_URL
  class ObserverError < StandardError; end
  class MissingModelError < ObserverError
    attr_reader :download_url, :download_filename
    def initialize(message, download_url: MODEL_DOWNLOAD_URL, download_filename: MODEL_FILENAME)
      super(message); @download_url = download_url; @download_filename = download_filename
    end
  end
  def self.cleanup_stale_processes!
    FaithVisionLocalAI.send(:cleanup_stale_pid)
    nil
  end
  def initialize; @connection = Faraday.new; end
  def status; FaithVisionLocalAI.status; end
  def describe(data_url:, image_path: nil, question:, filename: "image")
    validate_image!(data_url)
    ensure_local_brain!
    prompt = question.to_s.strip
    prompt = "Inspect this uploaded image carefully and describe exactly what is visibly present." if prompt.empty?
    payload = {
      model: FaithVisionLocalAI.model_name,
      messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: data_url } }] }],
      temperature: 0.2,
      max_tokens: Integer(ENV.fetch("FAITH_VISION_MAX_TOKENS", "700"))
    }
    response = @connection.post(FaithVisionLocalAI.local_url) do |request|
      request.options.timeout = Integer(ENV.fetch("FAITH_VISION_TIMEOUT", "180"))
      request.options.open_timeout = 10
      request.headers["Content-Type"] = "application/json"
      request.body = JSON.generate(payload)
    end
    raise ObserverError, "Local vision server returned HTTP #{response.status}: #{response.body.to_s[0, 1200]}" unless response.success?
    answer = JSON.parse(response.body.to_s).dig("choices", 0, "message", "content").to_s.strip
    raise ObserverError, "The local vision model returned no description." if answer.empty?
    answer
  rescue JSON::ParserError => error
    raise ObserverError, "The local vision server returned invalid JSON: #{error.message}"
  rescue Faraday::Error => error
    raise ObserverError, "Could not reach the local vision server: #{error.message}"
  end
  private
  def ensure_local_brain!; FaithVisionLocalAI.ensure_running!; rescue RuntimeError => error; raise MissingModelError.new(error.message); end
  def validate_image!(data_url)
    raise ObserverError, "The uploaded image data is invalid." unless data_url.to_s.match?(/\Adata:image\/[a-zA-Z0-9.+-]+;base64,/)
  end
end
