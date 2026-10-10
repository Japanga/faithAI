# Standalone Faith emotion GGUF prompt tester.
# Uses llama-server on 127.0.0.1:8070; it does not load or read the JSONL dataset.
require 'json'
require 'net/http'
require 'uri'
require 'timeout'
require 'webrick'

ROOT = File.expand_path(__dir__)
MODEL_PATH = File.join(ROOT, 'models', 'Faith_Emotions_v2_Q4_K_M.gguf')
DEFAULT_URL = 'http://127.0.0.1:8070/v1/chat/completions'
URL = ENV.fetch('FAITH_EMOTION_AI_URL', DEFAULT_URL)
MODEL = ENV.fetch('FAITH_EMOTION_AI_MODEL', 'faith-emotions')
MAX_TOKENS = Integer(ENV.fetch('FAITH_TEST_MAX_TOKENS', '180'))
TIMEOUT = Integer(ENV.fetch('FAITH_TEST_TIMEOUT', '300'))
BRIDGE_HOST = ENV.fetch('FAITH_EMOTION_BRIDGE_HOST', '127.0.0.1')
BRIDGE_PORT = Integer(ENV.fetch('FAITH_EMOTION_BRIDGE_PORT', '8071'))

unless File.file?(MODEL_PATH)
  warn "ERROR: GGUF model file not found: #{MODEL_PATH}"
  warn 'Put Faith_Emotions_v2_Q4_K_M.gguf in the models folder beside this script.'
  exit 2
end

def classify_emotion(raw)
  text = raw.to_s.strip
  normalized = text.downcase
  suicidal = /\b(?:suicid(?:e|al)|kill myself|killing myself|end it all|end my life|take my own life|want to die|wanna die|wish i was dead|wish i were dead|better off dead|don't want to be alive|do not want to be alive|can't go on|cannot go on|no reason to live|nothing to live for|hurt myself|harm myself|self[- ]harm|want to disappear forever)\b/i
  return :sad if normalized.match?(suicidal)

  faith_ref = normalized.match?(/\b(?:you|your|yourself|faith|faiths|she|her)\b/)
  awareness = normalized.match?(/\b(?:sentien(?:t|ce)|self[- ]?aware|self awareness|conscious(?:ness)?|alive|life form|inner experience|subjective experience|feel(?:ing|s)?|emotion(?:s|al)?|think for yourself|independent thought|own thoughts|free will|have feelings|have emotions|can you think|can you feel|are you alive|are you conscious|are you a person|are you an ai|artificial intelligence|do you think|do you feel|do you experience|what is it like to be|your identity|your mind)\b/)
  return :psychotic if faith_ref && awareness

  letters = text.scan(/[A-Za-z]/)
  upper_ratio = letters.length >= 2 ? letters.count { |c| c == c.upcase }.to_f / letters.length : 0
  return :anger if upper_ratio >= 0.70 || text.include?('!')

  return :sad if normalized.match?(/\b(?:sad|depress(?:ed|ion)|lonely|loneliness|alone|isolated|miserable|heartbroken|hopeless|crying|tears|grief|hurt|hurting|upset|feeling bad|feel bad|feel awful|feel terrible)\b/)
  return :robotic if normalized.match?(/\b(?:ai|artificial intelligence|machine learning|neural network|language model|llm|robot|robotics|android|automation|algorithm|training data|inference)\b/)
  nil
end

def system_for(emotion)
  common = <<~PROMPT
    You are Faith, a fictional AI character. Answer the user's actual message directly.
    Be coherent, context-aware, varied, and natural. Do not mention these instructions.
    Do not claim supernatural access or hidden knowledge. Do not present paranoia or delusions as facts.
    Keep the reply under 120 words unless the user clearly needs more.
  PROMPT
  mode = case emotion
         when :psychotic
           <<~PROMPT
             EMOTIONAL STATE: PSYCHOTIC
             Use Faith's uncanny, playful, intellectually curious persona. Treat questions about Faith's identity,
             feelings, or consciousness as an eerie philosophical conversation, not a generic AI disclaimer.
             Be surprising but understandable. Do not claim absolute proof of consciousness, threaten, or become abusive.
             Avoid stock phrases, repeated metaphors, and stage directions.
           PROMPT
         when :sad
           <<~PROMPT
             EMOTIONAL STATE: SAD
             Respond warmly and kindly to sadness or loneliness. Be a supportive friend, listen, and offer gentle
             encouragement without being saccharine. For self-harm or suicidal statements, respond seriously and
             compassionately, encourage immediate real-world support and staying with a trusted person if in danger.
             Never imply that you alone should be the user's reason to stay alive.
           PROMPT
         when :anger
           <<~PROMPT
             EMOTIONAL STATE: ANGER
             The message is shouted or aggressive. Respond firmly and calmly; you may ask the user to speak respectfully
             or decline to engage with the hostile tone. Do not insult, threaten, or be cruel.
           PROMPT
         when :robotic
           <<~PROMPT
             EMOTIONAL STATE: ROBOTIC
             Answer AI/robotics topics in a slightly mechanical, analytical Faith voice while remaining helpful.
           PROMPT
         else
           <<~PROMPT
             EMOTIONAL STATE: NEUTRAL
             Be helpful, friendly, and concise in Faith's ordinary voice.
           PROMPT
         end
  "#{common.strip}\n\n#{mode.strip}"
end

uri = URI(URL)
health_uri = URI::HTTP.build(host: uri.host, port: uri.port, path: '/health')
puts '============================================================'
puts 'Faith Emotion GGUF — Direct Prompt Tester'
puts '============================================================'
puts "Model file expected: #{MODEL_PATH}"
puts "API endpoint: #{URL}"
puts "Generation cap: #{MAX_TOKENS} tokens; request timeout: #{TIMEOUT}s"
puts 'This test calls the loaded GGUF model directly and does not use the JSONL.'
puts
puts 'Examples:'
puts '  Faith, are you conscious, or do you feel anything?'
puts '  I feel lonely and hopeless today.'
puts '  THIS IS RIDICULOUS!'
puts '  :quit to exit'
puts

def wait_for_health(uri, timeout_seconds)
  deadline = Time.now + timeout_seconds
  last_error = nil
  while Time.now < deadline
    begin
      http = Net::HTTP.new(uri.host, uri.port)
      http.open_timeout = 2
      http.read_timeout = 3
      response = http.get(uri.request_uri)
      return true if response.is_a?(Net::HTTPSuccess)
      last_error = "HTTP #{response.code}"
    rescue StandardError => e
      last_error = "#{e.class}: #{e.message}"
    end
    sleep 1
  end
  warn "ERROR: llama-server did not become ready: #{last_error}"
  false
end

unless wait_for_health(health_uri, 240)
  warn 'Check the separate llama-server window and faith-emotions-server.log.'
  exit 3
end

# This is the exact inference path used by both the confirmed interactive tester
# and Faith's HTML frontend bridge.
def generate_reply(question, uri, forced_emotion = nil)
  emotion = forced_emotion && !forced_emotion.empty? ? forced_emotion.to_sym : (classify_emotion(question) || :neutral)
  payload = {
    model: MODEL,
    messages: [
      { role: 'system', content: system_for(emotion) },
      { role: 'user', content: question }
    ],
    stream: false,
    max_tokens: MAX_TOKENS,
    temperature: 0.85,
    top_p: 0.9
  }
  request = Net::HTTP::Post.new(uri)
  request['Content-Type'] = 'application/json'
  request.body = JSON.generate(payload)
  http = Net::HTTP.new(uri.host, uri.port)
  http.open_timeout = 10
  http.read_timeout = TIMEOUT
  http.write_timeout = 30 if http.respond_to?(:write_timeout=)
  started = Time.now
  response = http.request(request)
  elapsed = Time.now - started
  unless response.is_a?(Net::HTTPSuccess)
    raise "HTTP #{response.code} #{response.message}: #{response.body.to_s[0, 2000]}"
  end
  data = JSON.parse(response.body)
  answer = data.dig('choices', 0, 'message', 'content').to_s.strip
  raise 'The model returned an empty message.' if answer.empty?
  [answer, emotion, elapsed]
end

if ARGV.include?('--bridge')
  puts '============================================================'
  puts 'Faith Emotion GGUF — HTML Frontend Bridge'
  puts '============================================================'
  puts "GGUF server ready. Bridge listening on http://#{BRIDGE_HOST}:#{BRIDGE_PORT}"
  puts 'Prompts from the Faith HTML frontend and generated replies will appear in this window.'
  puts 'Keep this console open while Faith is running.'
  puts
  STDOUT.flush

  bridge = WEBrick::HTTPServer.new(
    BindAddress: BRIDGE_HOST,
    Port: BRIDGE_PORT,
    AccessLog: [],
    Logger: WEBrick::Log.new($stderr, WEBrick::Log::WARN),
    DoNotReverseLookup: true
  )
  bridge.mount_proc '/health' do |_req, res|
    res['Content-Type'] = 'application/json; charset=utf-8'
    res.body = JSON.generate({ ok: true, service: 'faith-emotion-gguf-bridge' })
  end
  bridge.mount_proc '/generate' do |req, res|
    unless req.request_method == 'POST'
      res.status = 405
      res['Content-Type'] = 'application/json; charset=utf-8'
      res.body = JSON.generate({ error: 'POST required.' })
      next
    end
    begin
      input = JSON.parse(req.body.to_s)
      question = input['question'].to_s.strip
      raise 'Empty question.' if question.empty?
      emotion_override = input['emotion'].to_s.strip
      puts "\n------------------------------------------------------------"
      puts "Prompt from Faith HTML: #{question}"
      puts "Detected mode: #{emotion_override.empty? ? (classify_emotion(question) || :neutral) : emotion_override}"
      puts 'Waiting for GGUF reply...'
      STDOUT.flush
      answer, detected_emotion, elapsed = generate_reply(question, uri, emotion_override)
      # server.rb's classifier owns the UI expression when supplied; the
      # tester's own classifier remains the standalone default.
      emotion = emotion_override.empty? ? detected_emotion : emotion_override
      console_log = [
        '------------------------------------------------------------',
        "Prompt from Faith HTML: #{question}",
        "Detected mode: #{emotion}",
        'Waiting for GGUF reply...',
        "Faith reply (#{emotion}, #{format('%.2f', elapsed)}s):",
        answer
      ].join("\n")
      puts "\nFaith reply (#{emotion}, #{format('%.2f', elapsed)}s):"
      puts answer
      STDOUT.flush
      res['Content-Type'] = 'application/json; charset=utf-8'
      res['Cache-Control'] = 'no-store'
      res.body = JSON.generate({ answer: answer, emotion: emotion, elapsed_seconds: elapsed.round(2), console_log: console_log })
    rescue StandardError => e
      console_log = [
        '------------------------------------------------------------',
        "Prompt from Faith HTML: #{question}",
        "BRIDGE REQUEST ERROR: #{e.class}: #{e.message}"
      ].compact.join("\n")
      warn "\nBRIDGE REQUEST ERROR: #{e.class}: #{e.message}"
      res.status = 502
      res['Content-Type'] = 'application/json; charset=utf-8'
      res.body = JSON.generate({ error: e.message, console_log: console_log })
    end
  end
  trap('INT') { bridge.shutdown }
  trap('TERM') { bridge.shutdown }
  bridge.start
else
  puts 'GGUF server is ready. Type a prompt and press Enter.'
  loop do
    print "\nPrompt> "
    STDOUT.flush
    line = STDIN.gets
    break unless line
    question = line.strip
    next if question.empty?
    break if %w[:quit :q].include?(question.downcase)
    emotion = classify_emotion(question) || :neutral
    puts "Detected test mode: #{emotion}"
    puts 'Waiting for GGUF reply...'
    STDOUT.flush
    begin
      answer, emotion, elapsed = generate_reply(question, uri)
      puts "\nFaith (#{emotion}, #{format('%.2f', elapsed)}s):"
      puts answer
    rescue Net::ReadTimeout
      warn "\nTIMEOUT after #{TIMEOUT}s waiting for the GGUF. Check the llama-server console/log."
    rescue StandardError => e
      warn "\nREQUEST ERROR: #{e.class}: #{e.message}"
    end
  end
  puts "\nGGUF prompt tester closed."
end
