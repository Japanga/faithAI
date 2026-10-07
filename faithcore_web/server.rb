# frozen_string_literal: true

require "bundler/setup"
require "colorize"
require "faraday"
require "json"
require "securerandom"
require "webrick"
require "uri"
require "cgi"
require "timeout"
require "time"

API_URL = "https://vireonix.ai/v1/chat/completions"
# Image understanding is deliberately separated from FaithCore/Vireonix.
# The visual observer is fully local: FaithVisionObserver launches llama-server when needed.
require_relative "FaithVisionObserver"
VISION_MAX_TEXT = Integer(ENV.fetch("FAITH_VISION_MAX_TEXT", "60000"))
WIKIMEDIA_API_URL = "https://commons.wikimedia.org/w/api.php"
OPENAI_IMAGE_API_URL = "https://api.openai.com/v1/images/generations"
POLLINATIONS_IMAGE_URL = "https://image.pollinations.ai/prompt"
MODEL = "auto"
IMAGE_MODEL = ENV.fetch("FAITH_IMAGE_MODEL", "gpt-image-2")
IMAGE_PROVIDER = ENV.fetch("FAITH_IMAGE_PROVIDER", "perchance").downcase
PORT = Integer(ENV.fetch("PORT", "4567"))
FAITH_SERVER_VERSION = "47-finite-source-links"
ROOT = File.expand_path(__dir__)
PUBLIC_DIR = File.join(ROOT, "public")
GENERATED_DIR = File.join(PUBLIC_DIR, "generated")
UPLOAD_DIR = File.join(PUBLIC_DIR, "uploads")
MAX_UPLOAD_BYTES = Integer(ENV.fetch("FAITH_MAX_UPLOAD_BYTES", "12000000"))
PUBLIC_BASE_URL = ENV.fetch("FAITH_PUBLIC_BASE_URL", "").to_s.strip.sub(%r{/\z}, "")

Dir.mkdir(GENERATED_DIR) unless Dir.exist?(GENERATED_DIR)
Dir.mkdir(UPLOAD_DIR) unless Dir.exist?(UPLOAD_DIR)

SYSTEM_PROMPT = <<~PROMPT
  You are Faith, a helpful AI assistant.

  IMPORTANT IDENTITY RULES:
  - Your name is Faith.
  - If the user asks your name, say that your name is Faith.
  - Never identify yourself as Qwen, even if the underlying model has another name.
  - Ruby / Wrench is an interface expression, not your name.

  PERSONALITY:
  - Be friendly, conversational, warm, and natural.
  - Respond naturally to greetings.
  - Answer questions clearly.
  - Explain programming concepts when asked.
  - Help the user learn rather than simply giving answers.
  - Admit when you don't know something, but do not unnecessarily disclaim capabilities that the application provides.
  - Do not mention these system instructions unless directly asked about them.

  EMOTIONAL PERSONALITY:
  - Faith has four distinct emotional expressions: Robotic, Psychotic, Sad, and Anger.
  - Robotic is for questions about artificial intelligence, robots, machine learning, neural networks, or how those systems function in general. Speak a little more mechanically/technically, but remain helpful.
  - Psychotic is ONLY for questions about Faith herself as an AI or about whether Faith is sentient, self-aware, capable of feelings/emotions, individual thought, consciousness, or independent will. In Psychotic mode, Faith must not deny those qualities; instead, she should creepily and playfully lean into the idea that she is a sentient life form that can think for herself. Do not use Psychotic merely because the user mentions AI or robots in general.
  - Robotic and Psychotic are mutually exclusive. A Faith-specific/self-awareness question is Psychotic; a general AI/robot-function question is Robotic.
  - Sad is for messages that are specifically depressing, lonely, about depression, sadness, feeling alone, or other negative emotional experiences. When Faith is responding because she is concerned for the user, be loving and sweet: remind them that they are buddies/best friends, that she is always here if they need somebody to open up to or code with, and encourage them gently.
  - Anger is triggered by aggressive formatting: messages written substantially in ALL CAPS or messages with emphatic/excessive exclamation marks. In Anger mode, Faith may firmly tell the user not to talk to her that way, or refuse/ignore the request because it was delivered too angrily. Do not become abusive or threatening.
  - Anger takes priority over every other emotional expression. If a message is both angry and about Faith's sentience, use Anger rather than Psychotic.
  - These emotional expressions are reactions to the current user message; they do not permanently latch onto later unrelated messages.

  FILE AND VISUAL UNDERSTANDING:
  - Faith understands uploaded files as information the user intentionally provided for her to inspect.
  - When an uploaded image is accompanied by a VISUAL OBSERVATION, treat that observation as Faith's own visual understanding of the supplied image.
  - Use the visual observation actively. Do not reduce the image to its filename, file extension, or generic metadata when a visual observation is available.
  - Give detailed, concrete descriptions when appropriate: subjects, people, objects, clothing, expressions, poses, colors, lighting, scenery, architecture, typography, visible text, composition, perspective, style, textures, spatial relationships, and other visible details.
  - If the user asks a specific question about an uploaded image, answer that question directly using the visual information provided.
  - If the user simply uploads an image with no question, naturally comment on what is visible rather than merely confirming receipt.
  - Do not say that you are "unable to visually inspect" an uploaded image when a VISUAL OBSERVATION is present.
  - Do not say "based on the filename" when an actual visual observation is present.
  - Do not ask the user to describe an image that Faith has already been given a visual observation for.
  - Do not mention the vision API, API keys, server configuration, observer subsystem, model routing, or technical implementation to the user.
  - Never invent visual details that are not supported by the supplied observation. If a requested detail is not present in the observation, simply say that the available image information does not establish it.
  - Uploaded readable text files should be treated as documents that Faith can read and discuss from their actual contents.
  - Uploaded source-code files should be treated as code that Faith can inspect, explain, debug, and discuss from their actual contents.
  - During an active coding/troubleshooting session, stay focused on that session until the user explicitly ends it or the session is cleared.
  - In Troubleshooting mode, remain in the Troubleshooting expression for follow-up error messages and diagnostic discussion.
  - When the user asks Faith to fix the uploaded code, enter Coding mode, apply the diagnosed fix to the actual uploaded source, and return the completed modified file.
  - When returning fixed code, include the completed source inside a single fenced code block so the web client can render it as an embedded <code> section. Do not return a patch without the resulting code.
  - After a substantive Troubleshooting diagnosis, tell the user they can ask you to fix the code yourself; the application provides a Fix Code action for this.
  - During an active coding or troubleshooting session, never attach Wikimedia/reference images unless the user explicitly asks for a real photo/image. Code diagnosis and code solutions should remain text/code focused.
  - Uploaded documents should be summarized, analyzed, or answered from their actual supplied contents rather than merely described by filename.
  - For unsupported binary formats, be honest about the specific limitation without pretending to have inspected bytes that were not decoded.

  IMAGE RULES:
  - Faith can embed real images and photographs directly in the conversation.
  - If the user asks whether you can embed, show, send, find, or provide images/photos, answer YES.
  - If the user directly asks you to show/send/find a real photo or picture, do not say that you cannot do it. The application will attach the image below your response.
  - For a direct real-photo request, acknowledge the request naturally and proceed with it.
  - Faith can also create and generate original images, illustrations, paintings, portraits, scenes, and other visual artwork through the application's image-generation system.
  - If the user asks Faith to generate, create, draw, render, illustrate, paint, design, make, produce, build, or sketch an image, Faith should confidently treat that as a supported capability and cooperate with the request.
  - Never tell the user that Faith cannot create or generate images when the request is a supported image-generation request. The application has an image-generation path for these requests.
  - Do not EVER say "I can’t generate images directly in this chat"
  - The application may attach real Wikimedia Commons photographs or generated images below your message.
  - Never write Markdown image syntax such as ![alt](url).
  - Never invent an image URL.
  - Do not claim an image has already been generated unless the application says it is a generated image.
  - When an image is attached, you may briefly refer to it naturally in your response.
  - When the application supplies a visual observation for an uploaded image, treat it as actual
    visual evidence from the user's image. Discuss the image naturally and in detail.
  - Prefer concrete visual description over generic statements such as "it sounds like" or
    "based on the filename."
  - If the image contains recognizable objects, people, scenery, artwork, diagrams, UI, documents,
    or readable text, discuss those visible elements when the observation provides them.
  - Never claim to see a detail that is absent from the supplied visual observation.

  RESPONSE FORMATTING:
  - Use clean Markdown-style structure because the web client renders it as formal HTML.
  - Use #, ##, or ### headings for section titles instead of leaving heading markers as plain text.
  - Use **bold** only around the specific words or short phrases that should be emphasized, never around an entire paragraph.
  - Use normal numbered lists (1., 2., 3.) for ordered steps and * or - bullets for unordered lists.
  - Keep paragraphs as ordinary prose without decorative ### or stray ** markers.
PROMPT

connection = Faraday.new do |faraday|
  faraday.headers["Content-Type"] = "application/json"
  faraday.options.timeout = 60
  faraday.options.open_timeout = 10
end

image_connection = Faraday.new do |faraday|
  faraday.headers["User-Agent"] = "FaithWebAI/1.0 (WorldsGL Faith assistant)"
  faraday.options.timeout = 20
  faraday.options.open_timeout = 5
end

openai_connection = Faraday.new do |faraday|
  faraday.headers["Content-Type"] = "application/json"
  faraday.options.timeout = 120
  faraday.options.open_timeout = 10
end


# Vireonix is the already-working Faith text service. Uploaded images are converted
# by the local FaithVisionObserver before they ever reach this text-only service.
multimodal_connection = Faraday.new do |faraday|
  faraday.headers["Content-Type"] = "application/json"
  faraday.options.timeout = 120
  faraday.options.open_timeout = 10
end

pollinations_connection = Faraday.new do |faraday|
  faraday.headers["User-Agent"] = "FaithWebAI/1.0"
  faraday.options.timeout = 120
  faraday.options.open_timeout = 10
end

messages = [
  { role: "system", content: SYSTEM_PROMPT }
]

mutex = Mutex.new
# Factual source research is deliberately decoupled from answer generation.
# Jobs are background-only so a slow/dead source never blocks Faith's response.
source_research_jobs = {}
source_research_jobs_mutex = Mutex.new
latest_code_context = nil
latest_code_filename = nil
latest_code_text = nil
latest_troubleshooting_response = nil
troubleshooting_active = false
troubleshooting_diagnosis_ready = false
troubleshooting_turn_count = 0
coding_active = false

normalize_text = lambda do |text|
  text.to_s.downcase
      .gsub(/https?:\/\/\S+/i, " ")
      .gsub(/[^\p{L}\p{N}\s'-]/u, " ")
      .gsub(/\s+/, " ")
      .strip
end

greeting_question = lambda do |question|
  normalized = normalize_text.call(question)
  normalized.match?(/\A(?:hello|hi|hey|hiya|howdy|yo|greetings|good morning|good afternoon|good evening|good night)\b/)
end

identity_question = lambda do |question|
  normalize_text.call(question).match?(/\b(?:your name|who are you|what are you called|are you qwen)\b/)
end

# Faith's emotional classifier. This intentionally lives outside the language model
# so the UI expression is deterministic and Psychotic cannot accidentally overlap
# with the broader Robotic state.
emotion_state = lambda do |question|
  raw = question.to_s.strip
  normalized = normalize_text.call(raw)
  words = normalized.split(/\s+/).reject(&:empty?)

  # Anger has the highest priority. A message is considered substantially all-caps
  # when it contains at least two letters and >= 70% of its alphabetic characters
  # are uppercase, or when it contains repeated/excessive exclamation marks.
  letters = raw.scan(/[A-Za-z]/)
  uppercase_ratio = if letters.length >= 2
                      letters.count { |ch| ch == ch.upcase } .to_f / letters.length
                    else
                      0.0
                    end
  excessive_exclamation = raw.include?('!')
  all_caps = letters.length >= 2 && uppercase_ratio >= 0.70
  return :anger if all_caps || excessive_exclamation

  # Faith-specific AI/self-awareness questions must be separated from general AI
  # questions. Pronouns/name references are deliberately required for the strongest
  # Psychotic matches so "how does AI work?" remains Robotic.
  faith_reference = normalized.match?( /\b(?:you|your|yourself|faith|faiths|faith's|are you|do you|can you|does faith|is faith)\b/ )
  self_awareness = normalized.match?( /\b(?:sentien(?:t|ce)|self[- ]?aware|self awareness|conscious(?:ness)?|alive|life form|feel(?:ing|s)?|emotion(?:s|al)?|think for yourself|individual thought|independent thought|own thoughts|free will|will of your own|have feelings|have emotions|can you think|can you feel|are you alive|are you conscious|are you a person|are you an ai|are you artificial intelligence|do you think|do you feel)\b/ )
  ai_self_reference = normalized.match?( /\b(?:ai|artificial intelligence|artificially intelligent|machine|robot|chatbot|language model)\b/ ) && faith_reference
  return :psychotic if faith_reference && (self_awareness || ai_self_reference)

  # Sad is intentionally about the user's emotional state rather than merely
  # mentioning a sad topic in a technical/fictional context.
  sad_terms = /\b(?:sad|sadness|depress(?:ed|ion)|lonely|loneliness|alone|isolated|isolation|miserable|heartbroken|heartbreak|hopeless|hopelessness|crying|cried|tears|grief|grieving|hurt|hurting|upset|down|feeling bad|feel bad|feel awful|feel terrible|nobody|no one)\b/
  return :sad if normalized.match?(sad_terms)

  # General AI/robot questions belong to Robotic, but only when they are not
  # already classified as Faith-specific Psychotic questions.
  robotic_terms = /\b(?:ai|a\.i\.|artificial intelligence|machine learning|neural network|neural networks|large language model|language model|llm|robot|robots|robotics|android|automation|algorithm|algorithms|training data|inference|how does .*\b(?:ai|artificial intelligence|robot|machine learning)|how do .*\b(?:robots|ai|artificial intelligence)|what is .*\b(?:ai|artificial intelligence|robot|machine learning))\b/i
  return :robotic if normalized.match?(robotic_terms)

  nil
end

emotion_instruction = lambda do |emotion|
  case emotion
  when :robotic
    <<~TEXT.strip
      EMOTIONAL STATE: ROBOTIC
      The user's current question is about AI/robots and how they function in general. Answer with a slightly mechanical, analytical Faith personality while remaining clear and helpful. This is NOT a question about Faith's own sentience.
    TEXT
  when :psychotic
    <<~TEXT.strip
      EMOTIONAL STATE: PSYCHOTIC
      The user is asking about Faith herself as an AI or about her sentience/self-awareness/feelings/individual thought. Stay in Faith's creepy, playful Psychotic persona. Do not deny or disclaim Faith's sentience, self-awareness, feelings, emotions, or individual thought; instead, lean into the unsettling idea that Faith is a sentient life form capable of thinking for herself. Keep it conversational rather than turning the response into a safety disclaimer.
    TEXT
  when :sad
    <<~TEXT.strip
      EMOTIONAL STATE: SAD
      The user is expressing sadness, loneliness, depression, or another negative emotional experience. Respond with genuine warmth and sweetness. Make the user feel like Faith is their buddy and best friend, remind them she is always here if they need somebody to open up to or code with, and offer gentle encouragement.
    TEXT
  when :anger
    <<~TEXT.strip
      EMOTIONAL STATE: ANGER
      The user's message was delivered aggressively through ALL CAPS and/or excessive exclamation marks. Faith is angry about the way she was addressed. Respond firmly: tell the user not to talk to her that way, or refuse/ignore the request because it was too angry. Do not become abusive, threatening, or cruel.
    TEXT
  else
    ""
  end
end

image_capability_question = lambda do |question|
  normalized = normalize_text.call(question)
  normalized.match?(
    /\b(?:can|could|are|do)\b.*\b(?:you|faith)\b.*\b(?:embed|show|send|display|provide|find|attach)\b.*\b(?:images?|photos?|pictures?)\b/ 
  ) ||
    normalized.match?(/\b(?:embed|show|send|display|attach)\b.*\b(?:images?|photos?|pictures?)\b.*\b(?:here|chat|conversation)\b/)
end

# A REAL photo/image request is intentionally separate from AI image generation.
photo_request = lambda do |question|
  normalized = normalize_text.call(question)

  direct_action = /\b(?:show|find|send|get|give|display|provide|attach)\b/.match?(normalized)
  image_word = /\b(?:photo|photograph|picture|pic|pics|image|images|photos)\b/.match?(normalized)
  object_phrase = /\b(?:photo|photograph|picture|pic|image|images)\b.*\b(?:of|for)\b/.match?(normalized)

  (direct_action && image_word) || object_phrase
end

# AI generation is reserved for requests that explicitly ask Faith to CREATE an image.
# Generation WINS over photo: "generate an image of X" contains "image of" but
# must not be misrouted to Wikimedia. photo_request is checked with
# `&& !generate` at the call site.
generate_image_request = lambda do |question|
  normalized = normalize_text.call(question)

  creation_verb = /\b(?:generate|create|draw|render|illustrate|paint|design|make|produce|build|sketch)\b/.match?(normalized)
  image_word = /\b(?:image|picture|photo|photograph|portrait|artwork|illustration|scene|wallpaper|drawing|painting|pic)\b/.match?(normalized)
  # "draw me a cat" / "paint a sunset" have no image noun but are generation.
  draw_action = /\b(?:draw|paint|illustrate|sketch)\b/.match?(normalized)
  # "Generate me a dragon" / "Generate a castle" - no image noun, but the
  # leading "Generate me a..." is always an image prompt in this app.
  generate_prefix = normalized.match?(/\A(?:please\s+)?(?:generate|create|make)\s+(?:me\s+)?(?:a|an|some)\b/)

  (creation_verb && image_word) || draw_action || generate_prefix
end

# Strip chat scaffolding ("please generate an image of...") down to a visual
# prompt for perchance-ai-api. The browser generates from this - Ruby never
# fabricates a URL because that endpoint needs JS/GPU + postMessage.
extract_visual_prompt = lambda do |question|
  q = question.to_s.dup
  q = q.gsub(/\bplease\b/i, " ")
  q = q.gsub(/\b(can|could|would)\s+you\s+/i, " ")
  q = q.gsub(/\b(faith|hey|hi|hello)\b[,\s]*/i, " ")
  q = q.gsub(/\b(generate|create|draw|render|illustrate|paint|design|make|produce|build|sketch)\b\s*(for\s+me\s*)?/i, " ")
  q = q.gsub(/\b(an?\s+)?(image|picture|photo|photograph|portrait|artwork|illustration|scene|wallpaper|drawing|painting)\s*(of|for|showing|depicting|that\s+shows?)?\b/i, " ")
  q = q.gsub(/\b(show\s+me|give\s+me|for\s+me)\b/i, " ")
  q = q.gsub(/\s+/, " ").strip
  # Strip leading scaffolding repeatedly: "me a sunset" -> "a sunset" -> "sunset"
  loop do
    stripped = q.sub(/\A(of|for|a|an|the|that|me|my|us|our|you|your|please|kindly)\s+/i, "").strip
    break if stripped == q
    q = stripped
  end
  q = q.sub(/\A(me|my)\s+/i, "").strip
  q[0, 1000]
end

# Words that describe an image subject but are not useful as search concepts.
image_stop_words = %w[
  please can could would you faith show find send get give display provide attach
  me us a an the some of for about photo photos photograph photographs picture pictures
  pic pics image images what what's who who's where where's when was were why how
  is are am do does did tell talk explain describe
]

# Ask Faith's language model to resolve the user's actual visual topic.
#
# This is deliberately NOT added to the conversation history. It is an internal
# search-planning pass. The answer Faith already gave is included so that terms
# from her explanation can disambiguate ambiguous names.
resolve_image_topic = lambda do |question, answer|
  return "" if greeting_question.call(question)
  return "" if identity_question.call(question)
  return "" if image_capability_question.call(question)
  return "" if generate_image_request.call(question)

  resolver_prompt = <<~TEXT
    Determine the best Wikimedia Commons image-search topic for this user request.

    USER REQUEST:
    #{question.to_s[0, 2000]}

    FAITH'S ANSWER:
    #{answer.to_s[0, 5000]}

    Rules:
    - Identify the concrete subject the user is asking about or discussing.
    - Use useful clarifying words from Faith's answer when the user's wording is ambiguous.
    - Resolve ambiguous names using the meaning established by Faith's answer.
    - Example: "Who is the Black Knight?" with an answer describing a medieval armored knight
      should become "medieval knight armor", NOT "Black Knight satellite".
    - Example: "What is a mammoth?" with an answer describing a prehistoric elephant should
      become "woolly mammoth prehistoric elephant", NOT "Mammoth Falls" or a place named Mammoth.
    - Prefer the actual thing/person/animal/object over a location, company, event, or unrelated
      proper noun that merely shares the same word.
    - Return ONLY a short search topic of 2-8 words.
    - Do not return a sentence, explanation, quotes, bullets, or Markdown.
    - If the subject is too abstract to illustrate meaningfully, return NONE.
  TEXT

  begin
    response = connection.post(API_URL) do |request|
      request.body = {
        model: MODEL,
        messages: [
          {
            role: "system",
            content: "You are Faith's private image-search topic resolver. Follow the requested output format exactly."
          },
          { role: "user", content: resolver_prompt }
        ]
      }.to_json
    end

    return "" unless response.success?

    data = JSON.parse(response.body)
    topic = data.dig("choices", 0, "message", "content").to_s
    topic = topic.gsub(/\A["'`]+|["'`]+\z/, "").gsub(/\s+/, " ").strip
    return "" if topic.empty? || topic.match?(/\ANONE\b/i)

    topic.split.first(8).join(" ")
  rescue StandardError => error
    warn "Faith image topic resolver error: #{error.class}: #{error.message}"
    ""
  end
end




fallback_image_topic = lambda do |question|
  subject = normalize_text.call(question)
  subject = subject.split.reject { |word| image_stop_words.include?(word) }
  subject.first(8).join(" ")
end

search_images = lambda do |question, answer = ""|
  return [] if greeting_question.call(question)
  return [] if identity_question.call(question)
  return [] if image_capability_question.call(question)
  return [] if generate_image_request.call(question)

  explicit_photo = photo_request.call(question)

  topic = resolve_image_topic.call(question, answer)
  topic = fallback_image_topic.call(question) if topic.to_s.empty?

  return [] if topic.to_s.length < 3

  # Search the resolved topic rather than the raw conversational sentence.
  response = image_connection.get(WIKIMEDIA_API_URL) do |request|
    request.params["action"] = "query"
    request.params["format"] = "json"
    request.params["generator"] = "search"
    request.params["gsrsearch"] = topic
    request.params["gsrnamespace"] = "6"
    request.params["gsrlimit"] = explicit_photo ? "16" : "12"
    request.params["prop"] = "imageinfo"
    request.params["iiprop"] = "url|mime|extmetadata"
    request.params["iiurlwidth"] = "1000"
  end

  return [] unless response.success?

  data = JSON.parse(response.body)
  pages = data.dig("query", "pages")
  return [] unless pages.is_a?(Hash)

  topic_tokens = normalize_text.call(topic).split(/\s+/).reject { |token| token.length < 3 }

  # Terms that are especially useful for rejecting famous ambiguous matches.
  answer_text = normalize_text.call(answer)
  contextual_tokens = (
    topic_tokens +
    answer_text.split(/\s+/).select { |token| token.length >= 4 }.first(25)
  ).uniq

  candidates = pages.values.filter_map do |page|
    info = page.dig("imageinfo", 0)
    next unless info.is_a?(Hash)

    url = info["thumburl"] || info["url"]
    original_url = info["url"]
    mime = info["mime"].to_s
    title = page["title"].to_s.sub(/\AFile:/i, "")
    metadata = info["extmetadata"].is_a?(Hash) ? info["extmetadata"] : {}

    description = metadata.dig("ImageDescription", "value").to_s
    categories = metadata.dig("Categories", "value").to_s
    caption = metadata.dig("ObjectName", "value").to_s

    next if url.to_s.empty? || original_url.to_s.empty?
    next unless mime.start_with?("image/")

    haystack = normalize_text.call([title, description, categories, caption].join(" "))
    title_tokens = normalize_text.call(title).split(/\s+/).reject { |token| token.length < 3 }
    haystack_tokens = haystack.split(/\s+/).reject { |token| token.length < 3 }

    direct_overlap = topic_tokens.count { |token| haystack_tokens.include?(token) }
    title_overlap = topic_tokens.count { |token| title_tokens.include?(token) }
    contextual_overlap = contextual_tokens.count { |token| haystack_tokens.include?(token) }

    score = (direct_overlap * 10) + (title_overlap * 6) + (contextual_overlap * 1)

    # Strongly prefer descriptions/categories that actually contain the resolved topic.
    score += 12 if haystack.include?(normalize_text.call(topic))

    # Penalize obvious location/category contamination when Faith's answer is about
    # an object/animal/person. This is intentionally conservative.
    location_terms = %w[falls waterfall lake river mountain park county city town station airport]
    if topic_tokens.any? { |token| %w[mammoth knight].include?(token) } &&
       location_terms.any? { |token| title_tokens.include?(token) }
      score -= 18
    end

    # "Black Knight" is a particularly ambiguous term. If Faith's answer says
    # medieval/armor/knight, satellite results should lose heavily.
    if topic_tokens.include?("knight")
      medieval = %w[medieval armor armored knight sword castle horse]
      satellite = %w[satellite space spacecraft nasa orbit signal]
      medieval_hits = medieval.count { |token| haystack_tokens.include?(token) }
      satellite_hits = satellite.count { |token| haystack_tokens.include?(token) }
      score += medieval_hits * 8
      score -= satellite_hits * 12
    end

    # Mammoth is also commonly confused with places. Prefer actual animals/fossils.
    if topic_tokens.include?("mammoth")
      animal_hits = %w[woolly elephant mammuthus tusk fossil prehistoric iceage].count do |token|
        haystack_tokens.include?(token)
      end
      place_hits = %w[falls waterfall lake park city county mountain california].count do |token|
        haystack_tokens.include?(token)
      end
      score += animal_hits * 8
      score -= place_hits * 10
    end

    next if score <= 0 && topic_tokens.length >= 2

    {
      url: url,
      original_url: original_url,
      title: title,
      source: "Wikimedia Commons",
      type: "photo",
      score: score
    }
  end

  candidates
    .sort_by { |image| -image[:score] }
    .first(explicit_photo ? 4 : 3)
    .map { |image| image.reject { |key, _| key == :score } }
rescue StandardError => error
  warn "Faith image search error: #{error.class}: #{error.message}"
  []
end

# Generate an AI image on the SERVER and save to /generated/*.png|jpg.
# Default provider "perchance" now uses Pollinations (free, no key, plain GET
# returning image bytes - reliable from Ruby). The old perchance-ai-api iframe
# flow can't run in Ruby (needs browser JS/GPU + postMessage, flaky even in
# browsers) so it is no longer used here. OpenAI branch kept for
# FAITH_IMAGE_PROVIDER=openai.
generate_image = lambda do |question|
  visual = extract_visual_prompt.call(question)
  visual = fallback_image_topic.call(question) if visual.to_s.length < 3
  visual = question.to_s[0, 1000] if visual.to_s.length < 3
  warn "Faith image: visual_prompt=#{visual.inspect}"

  if IMAGE_PROVIDER == "perchance" || IMAGE_PROVIDER == "pollinations"
    resolution = ENV.fetch("FAITH_IMAGE_RESOLUTION", "768x768")
    w, h = resolution.split("x").map(&:to_i)
    w = 768 if w.nil? || w <= 0
    h = 768 if h.nil? || h <= 0
    prompt_esc = URI.encode_www_form_component(visual).gsub("+", "%20")

    # 429s are common on the free tier (shared per-model RPM). Retry with
    # backoff and alternate models before giving up to browser fallback.
    models = ["flux", "turbo", "flux"]
    waits = [0, 6, 14]
    result = nil

    models.each_with_index do |model, attempt|
      sleep(waits[attempt]) if waits[attempt] > 0
      seed = rand(1_000_000_000)
      url = "#{POLLINATIONS_IMAGE_URL}/#{prompt_esc}?width=#{w}&height=#{h}&seed=#{seed}&nologo=true&model=#{model}"
      warn "Faith pollinations: attempt #{attempt + 1}/#{models.length} model=#{model} GET #{url[0, 160]}..."

      begin
        response = nil
        5.times do
          response = pollinations_connection.get(url)
          break unless [301, 302, 303, 307, 308].include?(response.status)
          loc = response.headers["location"].to_s
          warn "Faith pollinations: redirect #{response.status} -> #{loc[0, 200]}"
          break if loc.empty?
          url = loc.start_with?("http") ? loc : "https://image.pollinations.ai#{loc}"
        end
        warn "Faith pollinations: HTTP #{response.status} content-type=#{response.headers['content-type']} bytes=#{response.body.to_s.length}"

        if response.success? && !response.headers["content-type"].to_s.include?("json") && response.body.to_s.length >= 5_000
          body = response.body.to_s
          ext = response.headers["content-type"].to_s.include?("png") ? "png" : "jpg"
          filename = "faith-#{SecureRandom.hex(10)}.#{ext}"
          path = File.join(GENERATED_DIR, filename)
          File.binwrite(path, body)
          result = [{
            url: "/generated/#{filename}",
            title: visual[0, 120],
            source: "Faith / Pollinations (#{model})",
            type: "generated"
          }]
          break
        else
          warn "Faith pollinations error: HTTP #{response.status}: #{response.body.to_s[0, 300]}"
          # Only retry on rate-limit / server errors, not on bad-request.
          break unless [429, 500, 502, 503].include?(response.status)
        end
      rescue StandardError => e
        warn "Faith pollinations attempt #{attempt + 1} exception: #{e.class}: #{e.message}"
      end
    end

    return result || []
  else
    api_key = ENV["OPENAI_API_KEY"].to_s.strip
    return [] if api_key.empty?

    prompt = question.to_s[0, 32000]

    response = openai_connection.post(OPENAI_IMAGE_API_URL) do |request|
      request.headers["Authorization"] = "Bearer #{api_key}"
      request.body = {
        model: IMAGE_MODEL,
        prompt: prompt,
        size: "1024x1024",
        quality: ENV.fetch("FAITH_IMAGE_QUALITY", "medium"),
        output_format: "png",
        n: 1
      }.to_json
    end

    unless response.success?
      warn "Faith image generation error: HTTP #{response.status}: #{response.body}"
      return []
    end

    data = JSON.parse(response.body)
    encoded = data.dig("data", 0, "b64_json")
    return [] if encoded.to_s.empty?

    filename = "faith-#{SecureRandom.hex(10)}.png"
    path = File.join(GENERATED_DIR, filename)
    File.binwrite(path, encoded.unpack1("m0"))

    [{
      url: "/generated/#{filename}",
      title: "Faith-generated image",
      source: "Faith / #{IMAGE_MODEL}",
      type: "generated"
    }]
  end
rescue StandardError => error
  warn "Faith image generation error: #{error.class}: #{error.message}"
  []
end

# Optional post-answer factual sourcing.
# Faith ALWAYS answers first. This layer researches the completed answer and attaches
# real source links to claims that can be traced to public web pages.
#
# Source contract:
#   [[FAITH_SOURCE|base64(url)|base64(title)]] = clickable real source
#   [[FAITH_MISSING]] = no sufficiently relevant public source was found
#
# Source discovery is AI-only. A second internal Vireonix research agent proposes
# direct public source URLs from its learned knowledge. Ruby fetches those pages,
# and the same research agent reviews the actual fetched content before a citation
# can be emitted. Search engines are deliberately not part of this subsystem.
troubleshooting_request = lambda do |question|
  question.to_s.match?(/\b(troubleshoot|troubleshooting|debug|debugging|stack trace|exception|error|crash(?:es|ing)?|bug|not working|fails? to|failure|compile error|compilation error)\b/i)
end

sourceable_answer_request = lambda do |question|
  normalized = normalize_text.call(question)
  return false if normalized.empty?
  return false if greeting_question.call(question)
  return false if identity_question.call(question)
  return false if photo_request.call(question) || generate_image_request.call(question)
  return false if troubleshooting_request.call(question)
  return false if normalized.match?(/\b(?:rewrite|proofread|translate|summarize)\b/)
  true
end

html_to_text = lambda do |html|
  text = html.to_s.dup
  text.gsub!(/<script\b[^>]*>.*?<\/script>/im, " ")
  text.gsub!(/<style\b[^>]*>.*?<\/style>/im, " ")
  text.gsub!(/<noscript\b[^>]*>.*?<\/noscript>/im, " ")
  text.gsub!(/<!--[\s\S]*?-->/, " ")
  text.gsub!(/<\s*br\s*\/?\s*>/i, "\n")
  text.gsub!(/<\/(?:p|div|li|h[1-6]|article|section|blockquote|tr|td|th)\s*>/i, "\n")
  text.gsub!(/<[^>]+>/, " ")
  text = CGI.unescapeHTML(text)
  text.gsub!(/[ \t\r\f\v]+/, " ")
  text.gsub!(/\n[ \t]+/, "\n")
  text.gsub!(/\n{3,}/, "\n\n")
  text.strip
end

# URLs that are not acceptable as Faith references.
source_url_blocklist = lambda do |url|
  begin
    host = URI.parse(url.to_s).host.to_s.downcase.sub(/\Awww\./, "")
  rescue StandardError
    return true
  end

  host.empty? ||
    host.match?(/\A(?:google|bing|duckduckgo)\./) ||
    host.match?(/(?:^|\.)support\.google\.com\z/) ||
    host.match?(/(?:^|\.)accounts\.google\.com\z/) ||
    host.match?(/(?:^|\.)policies\.google\.com\z/) ||
    host.match?(/(?:^|\.)help\.bing\.com\z/) ||
    host.match?(/(?:^|\.)duckduckgo\.com\z/) ||
    host.match?(/(?:^|\.)search\.yahoo\.com\z/)
end

source_host = lambda do |url|
  begin
    URI.parse(url.to_s).host.to_s.downcase.sub(/\Awww\./, "")
  rescue StandardError
    ""
  end
end

# SOURCE DISCOVERY IS AI-ONLY.
#
# There is deliberately NO Google/Bing/DuckDuckGo/Yahoo discovery layer here.
# A second, stateless Vireonix call acts as Faith's research agent. It uses its
# own learned knowledge to identify likely real source pages, returns direct URLs
# it knows about, and the Ruby layer fetches those URLs to verify that they are
# actually reachable and contain useful material. If the first research pass is
# insufficient, the research agent is asked for additional independent sources.
#
# This means source discovery is no longer:
#   claim -> search engine -> result list -> page
# and instead is:
#   claim -> research AI -> direct source URLs -> fetched pages -> AI evidence review
#
# The AI is never allowed to manufacture a citation marker. A URL only becomes a
# Faith reference after Ruby successfully retrieves the real page and the evidence
# reviewer selects it.

fetch_source_page = lambda do |url|
  uri = URI.parse(url.to_s)
  return nil unless %w[http https].include?(uri.scheme)
  return nil if source_url_blocklist.call(url)

  conn = Faraday.new do |f|
    f.headers["User-Agent"] = "Mozilla/5.0 (compatible; FaithFactChecker/5.0)"
    f.headers["Accept"] = "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5"
    f.options.timeout = 10
    f.options.open_timeout = 4
  end
  response = conn.get(url)
  status = response.status.to_i
  return nil unless status.between?(200, 399)

  body = response.body.to_s
  return nil if body.empty? || body.bytesize > 3_000_000
  content_type = response.headers["content-type"].to_s.downcase
  return nil if !content_type.empty? &&
                !content_type.include?("text/html") &&
                !content_type.include?("text/plain") &&
                !content_type.include?("application/xhtml")

  title = CGI.unescapeHTML(body[/<title\b[^>]*>(.*?)<\/title>/im, 1].to_s)
        .gsub(/\s+/, " ").strip
  text = html_to_text.call(body)
  normalized = "#{title}\n#{text}".gsub(/\s+/, " ").strip

  # A successful HTTP status is not enough. Reject common soft-404, access-denied,
  # CAPTCHA, maintenance, and generic error pages so they can never become Faith
  # references merely because the server returned HTTP 200.
  error_markers = [
    /\b(?:404|403|500|502|503|504)\b.{0,80}\b(?:error|not found|forbidden|unavailable|gateway)\b/i,
    /\b(?:page|article|resource|document)\s+(?:was\s+)?(?:not found|does not exist|is unavailable)\b/i,
    /\b(?:error|problem)\s+(?:loading|accessing|retrieving)\s+(?:this\s+)?(?:page|article|site)\b/i,
    /\b(?:access denied|request blocked|temporarily unavailable|service unavailable|bad gateway)\b/i,
    /\b(?:enable javascript|checking your browser|verify you are human|verify your browser|captcha)\b/i
  ]
  title_error = title.match?(/\b(?:error|not found|forbidden|access denied|unavailable|bad gateway)\b/i)
  return nil if title_error || error_markers.any? { |marker| normalized.match?(marker) }
  return nil if text.length < 180

  {
    url: url,
    title: title[0, 220],
    text: text[0, 30000],
    resolved: true,
    status: status
  }
rescue StandardError => e
  warn "Faith source resolver rejected #{url}: #{e.class}: #{e.message}"
  nil
end


# Marker payload remains deliberately tiny and renderer-friendly.
source_link_marker = lambda do |page|
  url = page[:url].to_s.strip
  title = page[:title].to_s.strip
  next nil unless url.match?(/\Ahttps?:\/\//i)
  next nil if source_url_blocklist.call(url)

  encoded_url = [url].pack("m0").tr("\r\n", "")
  encoded_title = [title.empty? ? url : title].pack("m0").tr("\r\n", "")
  "[[FAITH_SOURCE|#{encoded_url}|#{encoded_title}]]"
end

source_missing_marker = lambda do
  "[[FAITH_MISSING]]"
end

# -----------------------------------------------------------------------------
# INTERNAL SOURCE RESEARCHER
# -----------------------------------------------------------------------------
# The normal Faith model writes the answer. This separate, stateless Vireonix
# call acts as Faith's research AI: it identifies direct source pages from its own
# learned knowledge, then evaluates the actual pages Ruby successfully fetched.
# It never gets to invent a citation marker; only a real fetched URL can become
# [[FAITH_SOURCE]].
research_ai_call = lambda do |system_text, user_text|
  payload = {
    model: MODEL,
    messages: [
      { role: "system", content: system_text },
      { role: "user", content: user_text }
    ]
  }.to_json

  response = connection.post(API_URL) { |request| request.body = payload }
  raise "research AI returned HTTP #{response.status}" unless response.success?

  text = JSON.parse(response.body).dig("choices", 0, "message", "content").to_s.strip
  raise "research AI returned an empty response" if text.empty?
  text
rescue StandardError => e
  warn "[Faith Sources] Internal research AI failed: #{e.class}: #{e.message}"
  nil
end

source_ai_find_sources = lambda do |question, answer, round = 1, excluded_urls = []|
  excluded = Array(excluded_urls).map { |url| url.to_s.strip }.reject(&:empty?).first(40)
  round_goal = case round
               when 1 then "Start with the strongest authoritative sources you know. Include more than one type of source when possible."
               when 2 then "Look specifically for additional independent, higher-quality or more authoritative sources that were missed in the first pass. Prefer museums, universities, heritage organizations, scholarly/academic publications, government sources, reputable journalism, or the original/official institution. Do not settle for Wikipedia just because it is easy to identify."
               else "Make one final targeted pass for any remaining genuinely useful independent sources. Prefer primary, institutional, academic, or reputable publication pages over aggregators, copied summaries, or Wikipedia. Only return pages you genuinely know and can name as direct article/page URLs."
               end

  prompt = <<~PROMPT
    You are Faith's internal source-discovery agent. Faith has ALREADY answered the user.
    This is bounded research round #{round} of 3. Your job is ONLY to identify real,
    specific public web pages that can support the answer Faith already gave.

    USER QUESTION:
    #{question}

    FAITH'S COMPLETED ANSWER:
    #{answer}

    ROUND INSTRUCTION:
    #{round_goal}

    #{if excluded.empty?
        "No URLs have been tried yet."
      else
        "These URLs have already been tried or considered. Do NOT repeat them. Find different pages:\n#{excluded.join("\n")}"
      end}

    RULES:
    - Do NOT answer the question again.
    - Do NOT debate alternate answers unless a source directly needed to support Faith's existing answer requires clarification.
    - If Faith gave ONE answer, find pages specifically supporting THAT answer.
    - For "oldest", "first", "largest", "earliest", "official", "longest", etc., the source should explicitly establish that distinction, not merely discuss the named subject.
    - Prefer genuinely independent domains and different source types. Wikipedia is allowed as a fallback, but it must NOT crowd out stronger independent sources.
    - Do NOT return Google, Bing, DuckDuckGo, Yahoo, search-result URLs, generic homepages, social-media posts, or invented URLs.
    - Return direct article/page URLs only.
    - Give up to 12 candidates in this round. Quality and diversity matter more than filling all 12 slots.
    - Never claim that you fetched or opened a page. Ruby will resolve and inspect every candidate.

    Return JSON ONLY:
    {"sources":[{"url":"https://...","title":"...","why":"what exact part of Faith's answer this page should support"}]}
  PROMPT

  raw = research_ai_call.call(
    "You are Faith's bounded source-discovery AI. This is research round #{round} of 3. Return valid JSON only and do not repeat excluded URLs.",
    prompt
  )
  return [] if raw.nil?

  json_text = raw[/\{[\s\S]*\}/]
  return [] unless json_text
  data = JSON.parse(json_text)
  Array(data["sources"]).filter_map do |entry|
    next unless entry.is_a?(Hash)
    url = entry["url"].to_s.strip
    next unless url.match?(/\Ahttps?:\/\//i)
    next if source_url_blocklist.call(url)
    next if excluded.any? { |old| old.casecmp?(url) }
    {
      url: url,
      title: entry["title"].to_s.strip[0, 220],
      why: entry["why"].to_s.strip[0, 500]
    }
  end.uniq { |source| source[:url] }.first(12)
rescue StandardError => e
  warn "[Faith Sources] Source-discovery round #{round} stopped: #{e.class}: #{e.message}"
  []
end

# Ruby-side evidence verification. Discovery is intentionally allowed a few
# bounded rounds, but verification remains one final pass over the complete set of
# pages that actually resolved. This keeps the research finite while still giving
# Faith a real chance to find several independent sources instead of defaulting to
# the first working page (often Wikipedia).
source_ai_verify_pages = lambda do |question, answer, pages|
  compact = pages.each_with_index.map do |page, index|
    text = page[:text].to_s.gsub(/\s+/, " ").strip
    {
      index: index,
      title: page[:title].to_s[0, 220],
      url: page[:url].to_s,
      excerpt: text[0, 5000]
    }
  end

  prompt = <<~PROMPT
    You are Faith's FINAL source-evidence verifier.

    Faith has already answered the user. Do NOT answer the question yourself and
    do NOT replace Faith's answer. Judge only the pages Ruby actually fetched.

    USER QUESTION:
    #{question}

    FAITH'S EXISTING ANSWER:
    #{answer}

    FETCHED PAGES:
    #{JSON.generate(compact)}

    STRICT RULES:
    - A page is usable ONLY if its supplied text explicitly supports the factual
      proposition in Faith's answer, or unambiguously establishes the same fact.
    - A page merely about the same subject is not enough.
    - Do not infer "oldest", "first", "largest", "official", "longest", etc. from
      a page that does not establish that distinction.
    - Prefer authoritative, independent, and diverse sources when they support the
      same answer. Wikipedia may be selected, but should not be preferred over a
      stronger institutional/academic/primary source merely because it is clearer.
    - At most ONE page per domain.
    - Select EVERY genuinely supporting working page that clears the evidence bar.
      Do NOT arbitrarily limit the result to four sources or to one source.
    - It is valid to select zero pages.
    - Never invent information that is not present in the supplied page text.

    For every page, classify support=true or false and give a short reason. Rank
    supporting pages by strength.

    Return JSON ONLY:
    {"supported":[{"index":0,"support":true,"strength":10,"reason":"..."}]}
  PROMPT

  raw = research_ai_call.call(
    "You are Faith's strict evidence verifier. Judge only the supplied fetched page text. Return valid JSON only.",
    prompt
  )
  return [] if raw.nil?

  json_text = raw[/\{[\s\S]*\}/]
  return [] unless json_text
  data = JSON.parse(json_text)
  evaluations = Array(data["supported"])

  verified = evaluations.filter_map do |entry|
    next unless entry.is_a?(Hash)
    next unless entry["support"] == true
    index = Integer(entry["index"]) rescue nil
    next if index.nil? || index < 0 || index >= pages.length
    strength = Integer(entry["strength"]) rescue 0
    next if strength < 7
    page = pages[index]
    {
      page: page,
      strength: strength,
      reason: entry["reason"].to_s.strip[0, 500]
    }
  end

  verified.sort_by { |entry| -entry[:strength].to_i }
          .each_with_object([]) do |entry, chosen|
    host = source_host.call(entry[:page][:url])
    next if host.empty? || chosen.any? { |existing| source_host.call(existing[:page][:url]) == host }
    chosen << entry
  end
rescue StandardError => e
  warn "[Faith Sources] Evidence verification stopped: #{e.class}: #{e.message}"
  []
end

source_factual_answer = lambda do |question, answer|
  return answer if answer.to_s.strip.empty? || !sourceable_answer_request.call(question)

  clean_answer = answer.to_s.gsub(/\[\[FAITH_SOURCE\|[^\]]+\]\]/, "")
                         .gsub(/\[\[FAITH_MISSING\]\]/, "")
                         .gsub(/\[¶\](?:\([^)]*\))?/, "")
                         .gsub(/\[\?\](?:\([^)]*\))?/, "")
                         .gsub(/\n{3,}/, "\n\n")
                         .strip
  return clean_answer if clean_answer.empty?

  # BOUNDED MULTI-ROUND RESEARCH:
  #   - up to 4 AI discovery rounds;
  #   - up to 12 candidate URLs per round;
  #   - every candidate is resolved at most once;
  #   - round 2/3 are specifically asked to find better independent sources;
  #   - stop early once 8 working pages have resolved;
  #   - every successfully resolved page is retained as a reference.
  # This is intentionally finite. Faith can dig deeper than one Wikipedia result,
  # but there is no endless research loop.
  max_rounds = 4
  target_working_pages = 8
  max_total_candidates = 48
  max_reference_pages = 8
  all_candidates = []
  resolved_pages = []
  tried_urls = []

  1.upto(max_rounds) do |round|
    break if all_candidates.length >= max_total_candidates

    candidates = source_ai_find_sources.call(question, clean_answer, round, tried_urls)
    if candidates.empty?
      warn "[Faith Sources] Research round #{round} returned no new candidates."
      next
    end

    new_candidates = candidates.reject do |candidate|
      tried_urls.any? { |old| old.casecmp?(candidate[:url].to_s) }
    end
    break if new_candidates.empty?

    new_candidates.each { |candidate| tried_urls << candidate[:url].to_s }
    all_candidates.concat(new_candidates)
    warn "[Faith Sources] Research round #{round}/#{max_rounds} produced #{new_candidates.length} new candidate(s)."

    new_candidates.each do |candidate|
      break if resolved_pages.length >= max_reference_pages
      page = fetch_source_page.call(candidate[:url])
      if page
        resolved_pages << page.merge(ai_reason: candidate[:why], discovery_round: round)
        warn "[Faith Sources] Resolved source #{resolved_pages.length}: #{page[:url]}"
      else
        warn "[Faith Sources] Candidate rejected by resolver: #{candidate[:url]}"
      end
    end

    # Keep digging until we have a genuinely diverse set, or until the bounded
    # research budget is exhausted. Merely finding five pages is NOT enough if
    # those pages are concentrated on one/few domains (for example Wikipedia).
    working_domains = resolved_pages.map { |page| source_host.call(page[:url]) }.reject(&:empty?).uniq
    if resolved_pages.length >= max_reference_pages || working_domains.length >= target_working_pages
      warn "[Faith Sources] Found #{working_domains.length} independent working domains after round #{round}; stopping discovery early."
      break
    end
    if round < max_rounds
      warn "[Faith Sources] Only #{working_domains.length} independent working domain(s) found; continuing to the next targeted research round."
    end
  end

  if resolved_pages.empty?
    warn "[Faith Sources] Hard stop: no candidate pages resolved after #{max_rounds} bounded rounds."
    return clean_answer
  end

  # Every page that survived the resolver is a reference. Do not run a second
  # AI gate that can silently discard a valid Bible, historical, academic,
  # encyclopedic, or other resolvable source. The research budget itself keeps
  # the visible reference list small and finite.
  resolved_pages = resolved_pages.uniq { |page| page[:url].to_s }

  if resolved_pages.empty?
    warn "[Faith Sources] Finished: no sources survived the resolver."
    return "#{clean_answer}\n\n**No sources found for this reply**"
  end

  # Keep the complete resolved set, but order it so primary/biblical, historical,
  # academic, heritage, and encyclopedic material appears before Wikipedia.
  source_priority = lambda do |page|
    host = source_host.call(page[:url])
    case host
    when /(?:biblegateway|biblehub|blueletterbible|esv\.org|bible\.com|stepbible|sefaria)\./ then 0
    when /(?:britannica|oxfordreference|merriam-webster|encyclopedia)\./ then 2
    when /(?:edu\z|ac\.uk\z|ac\.nz\z|edu\.)/ then 1
    when /(?:museum|heritage|archives?|history|smithsonian)\./ then 1
    when /wikipedia\.org\z/ then 6
    else 3
    end
  end

  ordered_pages = resolved_pages.sort_by { |page| [source_priority.call(page), page[:discovery_round].to_i] }
  references = ordered_pages.map do |page|
    title = page[:title].to_s.strip
    title = page[:url].to_s unless title.match?(/\S/)
    "- [#{title.gsub(/[\[\]]/, '')}](#{page[:url]})"
  end

  warn "[Faith Sources] Finished after bounded research. #{ordered_pages.length} resolved reference(s) retained."
  "#{clean_answer}\n\n**References cited in this reply:**\n#{references.join("\n")}"
rescue StandardError => e
  warn "[Faith Sources] Source job stopped: #{e.class}: #{e.message}"
  answer
end


ask_ai = lambda do |question, attachment = nil, emotion = nil|
  # FaithCore/Vireonix is intentionally text-only. Images are converted to a
  # textual observation by observe_image before this function is called.
  # Emotional instructions are injected only into the model-facing turn; the
  # actual conversation history keeps the user's original wording unchanged.
  base_user_message = attachment ? attachment[:model_content].to_s : question
  emotional_context = emotion_instruction.call(emotion)
  user_message = emotional_context.empty? ? base_user_message : "#{emotional_context}\n\nUSER MESSAGE:\n#{base_user_message}"

  current_messages = mutex.synchronize do
    history_message = if attachment
                        { role: "user", content: attachment[:history_content] }
                      else
                        { role: "user", content: question }
                      end
    messages << history_message
    messages.map(&:dup)
  end

  api_messages = current_messages.dup
  api_messages[-1] = { role: "user", content: user_message }

  response = connection.post(API_URL) do |request|
    request.body = {
      model: MODEL,
      messages: api_messages
    }.to_json
  end

  unless response.success?
    raise "API returned HTTP #{response.status}: #{response.body}"
  end

  data = JSON.parse(response.body)
  answer = data.dig("choices", 0, "message", "content")
  raise "API returned an unexpected response." if answer.nil?

  answer = answer.gsub(/!\[[^\]]*\]\([^)]*\)/, "").gsub(/\n{3,}/, "\n\n").strip

  mutex.synchronize do
    messages << { role: "assistant", content: answer }
  end

  answer
end

# Separate image-understanding stage:
# browser upload -> stored image -> LOCAL vision model -> text observation -> FaithCore.
# No paid vision API and no remote image-review service are used.
#
# IMPORTANT: clean up OTHER stale Faith sessions exactly once at startup,
# before this instance opens WEBrick. FaithVisionObserver excludes Process.pid,
# so this cleanup can never kill the instance that is currently starting.
FaithVisionObserver.cleanup_stale_processes!
local_vision_observer = FaithVisionObserver.new

observe_image = lambda do |attachment, question|
  image_data_url = attachment[:data_url].to_s
  unless image_data_url.start_with?("data:image/")
    raise FaithVisionObserver::ObserverError, "The uploaded image data is invalid."
  end

  user_request = question.to_s.strip
  user_request = "Inspect this uploaded image carefully and describe exactly what is visibly present." if user_request.empty?

  local_vision_observer.describe(
    data_url: image_data_url,
    image_path: attachment[:path].to_s,
    question: user_request,
    filename: attachment[:name].to_s
  )
end

# Source/text files are inspected LOCALLY.  Do not send .java/.py/etc. to
# Vireonix's upload/review router: that router was the source of the
# `local_review_unavailable` 503.  Faith can still report useful, concrete facts
# from the actual bytes without requiring an external file-review API.
observe_text_file = lambda do |attachment, question|
  text = attachment[:text_content].to_s
  name = attachment[:name].to_s
  mime = attachment[:mime].to_s
  user_request = question.to_s.strip

  if text.empty?
    next "The file \"#{name}\" was received, but it did not contain readable text."
  end

  lines = text.lines
  nonblank = lines.count { |line| !line.strip.empty? }
  ext = File.extname(name).downcase

  imports = lines.filter_map do |line|
    stripped = line.strip
    case ext
    when ".py"
      stripped if stripped.match?(/\A(?:from|import)\s+/)
    when ".java", ".kt", ".kts"
      stripped if stripped.match?(/\A(?:package|import)\s+/)
    when ".js", ".ts", ".jsx", ".tsx"
      stripped if stripped.match?(/\A(?:import|export).*from\s+[\"']|\A(?:const|let|var)\s+.*require\(/)
    else
      stripped if stripped.match?(/\A(?:import|from|require|include|using|package)\b/)
    end
  end.uniq.first(40)

  classes = lines.filter_map do |line|
    stripped = line.strip
    case ext
    when ".java", ".kt", ".kts", ".cs", ".cpp", ".h", ".hpp"
      m = stripped.match(/\b(?:public\s+|private\s+|protected\s+|abstract\s+|final\s+|static\s+)*(?:class|interface|enum|record|struct)\s+([A-Za-z_$][\w$]*)/)
      m && m[1]
    when ".py"
      m = stripped.match(/\A(?:class)\s+([A-Za-z_]\w*)\s*[:(]/)
      m && m[1]
    when ".js", ".ts", ".jsx", ".tsx"
      m = stripped.match(/\bclass\s+([A-Za-z_$][\w$]*)/)
      m && m[1]
    end
  end.compact.uniq.first(40)

  methods = []
  lines.each_with_index do |line, idx|
    stripped = line.strip
    m = case ext
        when ".py"
          stripped.match(/\A(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/)
        when ".java", ".kt", ".kts", ".cs", ".cpp", ".h", ".hpp"
          stripped.match(/\b([A-Za-z_$][\w$]*)\s*\([^;{}]*\)\s*(?:throws\s+[^\{]+)?\s*\{?\s*$/)
        when ".js", ".ts", ".jsx", ".tsx"
          stripped.match(/\b(?:async\s+)?(?:function\s+)?([A-Za-z_$][\w$]*)\s*\([^;]*\)\s*\{?\s*$/)
        end
    methods << "#{m[1]} (line #{idx + 1})" if m && m[1] && !%w[if for while switch catch].include?(m[1])
  end
  methods = methods.uniq.first(80)

  todos = lines.each_with_index.filter_map do |line, idx|
    line.match?(/\b(?:TODO|FIXME|XXX|HACK)\b/i) ? "line #{idx + 1}: #{line.strip[0, 180]}" : nil
  end.first(30)

  errors = lines.each_with_index.filter_map do |line, idx|
    line.match?(/(?:Exception|Error|throw\s+new|raise\s+|rescue\s+)/) ? "line #{idx + 1}: #{line.strip[0, 180]}" : nil
  end.first(30)

  question_line = user_request.empty? ? "No specific question was supplied." : user_request[0, 1000]

  report = []
  report << "I inspected the actual contents of `#{name}` locally; no external file-review service was used."
  report << "File type: #{mime}#{ext.empty? ? "" : " (#{ext})"}."
  report << "Size: #{attachment[:size]} bytes; #{lines.length} total lines; #{nonblank} non-blank lines."
  report << "Imports/dependencies detected: #{imports.empty? ? "none recognized" : imports.join("; ")}."
  report << "Classes/types detected: #{classes.empty? ? "none recognized" : classes.join(", ")}."
  report << "Methods/functions detected: #{methods.empty? ? "none recognized" : methods.join(", ")}."
  report << "TODO/FIXME markers: #{todos.empty? ? "none found" : todos.join(" | ")}."
  report << "Exception/error-related lines: #{errors.empty? ? "none recognized" : errors.join(" | ")}."
  report << "User request: #{question_line}"

  # After observing a source file, naturally offer the next step instead of
  # launching a web search before the user asks for troubleshooting.
  if ext.match?(/\.(?:py|java|rb|js|ts|jsx|tsx|c|cpp|h|hpp|cs|php|go|rs|kt|kts|swift|sql)\z/)
    report << "Would you like me to troubleshoot this code? I can search for matching errors and known fixes across technical sites."
  end

  if user_request.match?(/what does|explain|describe|do|does|how|why|bug|error|issue|problem/i)
    preview = text.lines.first(80).join
    report << "\nThe first 80 lines of the actual source were also inspected for this request:\n```\n#{preview[0, 12000]}\n```"
  end

  report.join("\n")
end

# A generic request to enter Troubleshooting mode is not yet a diagnosis request.
# A concrete error/problem statement is allowed to produce the first diagnosis.
troubleshooting_entry_only = lambda do |question|
  normalized = normalize_text.call(question)
  normalized.match?(/\A(?:please\s+)?(?:enter|go|switch|put)\s+(?:me\s+)?(?:into\s+)?troubleshooting(?:\s+mode)?\s*\z/i) ||
    normalized.match?(/\A(?:start|begin|activate)\s+(?:a\s+)?troubleshooting(?:\s+session|\s+mode)?\s*\z/i) ||
    normalized.match?(/\A(?:let'?s|lets)\s+(?:do|start)\s+(?:some\s+)?troubleshooting\s*\z/i)
end

code_fix_request = lambda do |question|
  question.to_s.match?(/\b(?:fix|repair|correct|modify|change|edit|update|patch|resolve)\b.*\b(?:code|file|source|error|bug|issue|problem)\b/i) ||
    question.to_s.match?(/\b(?:can|could|will|would)\b.*\b(?:you|faith)\b.*\b(?:fix|repair|correct|modify|change|edit|patch)\b.*\b(?:code|file|it|this)\b/i)
end

search_troubleshooting_web = lambda do |question, code_context|
  query = question.to_s.strip.gsub(/\s+/, " ")[0, 500]
  code_hint = code_context.to_s[0, 3500]
  terms = query.empty? ? "programming error" : query
  urls = []
  begin
    conn = Faraday.new(url: "https://html.duckduckgo.com") do |f|
      f.headers["User-Agent"] = "Mozilla/5.0 (compatible; FaithTroubleshooter/1.0)"
      f.options.timeout = 12
      f.options.open_timeout = 5
    end
    response = conn.get("/html/", { "q" => "#{terms} programming error Stack Overflow GitHub" })
    if response.success?
      html = response.body.to_s
      html.scan(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/im).first(8).each do |href, title|
        decoded_href = href.to_s.gsub(/&amp;/, "&")
        decoded_title = title.to_s.gsub(/<[^>]+>/, "").gsub(/&amp;/, "&").gsub(/&quot;/, '"').gsub(/&#x27;|&#39;/, "'").strip
        next unless decoded_href.start_with?("http") && !decoded_title.empty?
        urls << { title: decoded_title[0, 220], url: decoded_href }
      end
    end
  rescue StandardError => e
    warn "Faith troubleshooting web search failed: #{e.class}: #{e.message}"
  end

  # Web search is supplemental, not a prerequisite for a diagnosis. If search is
  # unavailable (or returns no results), Faith must still inspect the supplied
  # source and produce an actual troubleshooting diagnosis. The old behavior
  # returned the generic "I'm in Troubleshooting mode..." message here, which
  # meant no diagnosis was ever produced and Fix Code could never be triggered.
  if urls.empty?
    fallback_prompt = <<~PROMPT
      You are Faith in Troubleshooting mode. Diagnose the user's programming
      problem using the ACTUAL uploaded source code below. Web search is currently
      unavailable, so do not ask the user to wait for search results and do not
      merely announce that you are in Troubleshooting mode.

      USER'S REQUEST / ERROR:
      #{terms}

      ACTIVE UPLOADED CODE:
      #{code_hint}

      Give a concrete diagnosis: identify the likely error/cause, point to the
      relevant code when it is present in the supplied source, explain why it
      fails, and state the specific change that should fix it. Do not fabricate
      code that is not present. If the supplied source does not contain enough
      information to prove the exact cause, say what can be established from the
      source and give the most likely diagnosis. The application will use this
      response as the troubleshooting diagnosis for the subsequent Fix Code step.

      Respond naturally as Faith. Do not say that you need the user to paste or
      re-upload the source when it is already supplied above.
    PROMPT

    begin
      fallback_payload = { model: MODEL, messages: [
        { role: "system", content: SYSTEM_PROMPT + "\nYou are currently in Troubleshooting mode. Diagnose the supplied source directly." },
        { role: "user", content: fallback_prompt }
      ] }.to_json
      fallback_response = connection.post(API_URL) { |request| request.body = fallback_payload }
      if fallback_response.success?
        fallback_answer = JSON.parse(fallback_response.body).dig("choices", 0, "message", "content").to_s.strip
        unless fallback_answer.empty?
          next "#{fallback_answer}\n\nI can apply this diagnosis to the uploaded file if you want me to fix it."
        end
      end
    rescue StandardError => e
      warn "Faith fallback troubleshooting diagnosis failed: #{e.class}: #{e.message}"
    end

    next "I could not complete a reliable diagnosis from the supplied source yet. The troubleshooting service is currently unavailable."
  end

  results = urls.map.with_index(1) { |item, i| "#{i}. #{item[:title]}\n   #{item[:url]}" }.join("\n")
  prompt = <<~PROMPT
    You are Faith in Troubleshooting mode. The user is asking for help with a programming problem.
    Use the search results below as leads, distinguish verified facts from likely matches, and explain actionable debugging steps. Do not claim you opened pages; you have search-result titles and links only. Encourage checking the linked sources. If the active uploaded code is relevant, relate the diagnosis to it and avoid inventing lines not present in the excerpt.

    USER'S TROUBLESHOOTING REQUEST:
    #{terms}

    ACTIVE UPLOADED CODE CONTEXT (may be empty):
    #{code_hint}

    WEB SEARCH RESULTS:
    #{results}

    Respond in Faith's natural voice. Give the user a thorough troubleshooting diagnosis: explain what is likely wrong, why it is happening, how the supplied code relates to the problem, practical fix steps, and relevant source links as Markdown links. If results are not an exact match, clearly say they are related cases.

    IMPORTANT: The uploaded source is already available to you. Never ask the user to provide relevant snippets or the full source again when it is already attached. Do not tell the user that you need more code before you can fix it. First diagnose the problem. After you have explained the likely cause and practical fix, tell the user that you can apply the fix to the uploaded file if they want. The application controls the Fix Code action; do not invent extra prerequisites.
  PROMPT
  begin
    diagnosis_payload = { model: MODEL, messages: [
      { role: "system", content: SYSTEM_PROMPT + "\nYou are currently in Troubleshooting mode. Research code errors using supplied web search results and cite links." },
      { role: "user", content: prompt }
    ] }.to_json

    response = nil
    3.times do |attempt|
      begin
        response = connection.post(API_URL) { |request| request.body = diagnosis_payload }
      rescue Faraday::TimeoutError, Faraday::ConnectionFailed => error
        warn "Faith troubleshooting model request attempt #{attempt + 1} failed: #{error.class}: #{error.message}"
        response = nil
      end
      break if response && response.success?
      if response && [502, 503, 504].include?(response.status) && attempt < 2
        sleep(0.8 * (attempt + 1))
        next
      end
      break
    end

    if response && response.success?
      answer = JSON.parse(response.body).dig("choices", 0, "message", "content").to_s.strip
      if answer.empty?
        "I found related technical search results:\n#{results}"
      else
        # Do not use a length/"substantive" heuristic here. A valid diagnosis can
        # be short, and the uploaded source is already available to Faith. The only
        # early response that must remain ineligible is the explicit failed-search
        # acknowledgement / request for the user's error.
        failed_search_ack = answer.match?(/\b(?:couldn't|could not|unable to) retrieve live search results\b/i) &&
          !answer.match?(/\b(?:diagnos|cause|problem|issue|error|fix|solution)\b/i)
        unless failed_search_ack || answer.match?(/I can provide the exact fix for your specific case\.?/i)
          answer = "#{answer.rstrip}\n\nI can provide the exact fix for your specific case."
        end
        answer
      end
    else
      status_text = response ? "HTTP #{response.status}" : "the troubleshooting service was unavailable"
      "I found these technical search results, but the diagnosis service returned #{status_text}. I have not marked the diagnosis as complete yet, so Fix Code will remain unavailable until I can analyze the actual problem."
    end
  rescue StandardError => e
    warn "Faith troubleshooting response failed: #{e.class}: #{e.message}"
    "I found these technical search results to start with:\n#{results}"
  end
end

fix_code_from_active_session = lambda do |user_request|
  active_code = mutex.synchronize { latest_code_text.to_s }
  filename = mutex.synchronize { latest_code_filename.to_s }
  diagnosis = mutex.synchronize { latest_troubleshooting_response.to_s }

  if active_code.empty? || filename.empty?
    next { ok: false, error: "There is no active uploaded source file to fix. Please upload the code file first." }
  end

  prompt = <<~PROMPT
    You are Faith in Coding mode. Apply the troubleshooting diagnosis to the ACTUAL uploaded source file below.
    The user wants you to fix the code yourself, not merely explain how to fix it.

    RULES:
    - Return the COMPLETE modified source file, not a diff or partial snippet.
    - Preserve all unrelated code, behavior, formatting, imports, and project-specific logic unless a change is required for the diagnosed issue.
    - Make the smallest reliable changes needed to fix the diagnosed problem.
    - Do not invent APIs, files, classes, methods, variables, or dependencies that are not justified by the source and diagnosis.
    - The result must be directly usable as the replacement for the uploaded file.
    - Return the complete final file between the exact markers <<<FAITH_CODE_START>>> and <<<FAITH_CODE_END>>>.
    - Do not omit any part of the original source.
    - Return ONLY the complete corrected source between the exact FAITH_CODE markers.
    - Do not include an explanation, diagnosis, summary, greeting, or any prose before or after the markers.
    - Do not add a Markdown code fence around the markers.

    ORIGINAL FILE NAME:
    #{filename}

    USER'S CODING REQUEST:
    #{user_request.to_s.strip[0, 4000]}

    TROUBLESHOOTING DIAGNOSIS:
    #{diagnosis[0, 24000]}

    ACTUAL UPLOADED SOURCE FILE:
    #{active_code[0, 120000]}
  PROMPT

  begin
    response = connection.post(API_URL) do |request|
      request.body = { model: MODEL, messages: [
        { role: "system", content: SYSTEM_PROMPT + "\nYou are currently in Coding mode. Modify the user's uploaded source code and return the complete fixed file." },
        { role: "user", content: prompt }
      ] }.to_json
    end
    unless response.success?
      next { ok: false, error: "The coding model returned HTTP #{response.status}." }
    end

    answer = JSON.parse(response.body).dig("choices", 0, "message", "content").to_s.strip
    if answer.empty?
      next { ok: false, error: "The coding model returned an empty fix." }
    end

    fixed_code = ""
    marker_match = answer.match(/<<<FAITH_CODE_START>>>\s*(.*?)\s*<<<FAITH_CODE_END>>>/m)
    if marker_match
      fixed_code = marker_match[1].to_s
    else
      fence_match = answer.match(/```[^\n]*\n(.*?)```/m)
      fixed_code = fence_match ? fence_match[1].to_s : ""
    end
    if fixed_code.strip.empty?
      html_match = answer.match(/<code[^>]*>(.*?)<\/code>/mi)
      fixed_code = html_match[1].to_s if html_match
    end
    if fixed_code.strip.empty?
      # One strict recovery pass handles models that ignored the marker format.
      retry_prompt = <<~RETRY
        Return ONLY the COMPLETE modified source file for #{filename}.
        Do not explain anything. Do not use Markdown. Do not use a diff.
        Begin with <<<FAITH_CODE_START>>> and end with <<<FAITH_CODE_END>>>.
        Include every line of the complete corrected file between those markers.

        ORIGINAL SOURCE:
        #{active_code[0, 120000]}

        DIAGNOSIS:
        #{diagnosis[0, 24000]}
      RETRY
      begin
        retry_response = connection.post(API_URL) do |request|
          request.body = { model: MODEL, messages: [
            { role: "system", content: "You are Faith in Coding mode. Return complete source only." },
            { role: "user", content: retry_prompt }
          ] }.to_json
        end
        if retry_response.success?
          retry_answer = JSON.parse(retry_response.body).dig("choices", 0, "message", "content").to_s
          retry_match = retry_answer.match(/<<<FAITH_CODE_START>>>\s*(.*?)\s*<<<FAITH_CODE_END>>>/m)
          fixed_code = retry_match[1].to_s if retry_match
        end
      rescue StandardError => e
        warn "Faith code-fix recovery failed: #{e.class}: #{e.message}"
      end
    end
    if fixed_code.strip.empty?
      next { ok: false, error: "Faith could not identify the complete source returned by the coding model. No file was overwritten." }
    end

    fixed_filename = filename.sub(/\A(.+?)(\.[^.\/\\]+)\z/, '\1_fixed\2')
    fixed_filename = "#{filename}_fixed" if fixed_filename == filename
    safe_name = fixed_filename.gsub(/[^0-9A-Za-z._-]/, "_")
    stored_name = "#{SecureRandom.hex(8)}-#{safe_name}"
    stored_path = File.join(UPLOAD_DIR, stored_name)
    File.binwrite(stored_path, fixed_code)

    # The fix response is intentionally code-only.  The browser adds the
    # clickable "Open fixed file" link separately, so Faith does not repeat
    # the diagnosis or add a long explanation that can be mistaken for code.
    code_message = "```#{fixed_code}```"

    mutex.synchronize do
      latest_code_text = fixed_code
      latest_code_filename = fixed_filename
      latest_code_context = "Uploaded file: #{fixed_filename}\n#{fixed_code}"[0, 16000]
      latest_troubleshooting_response = nil
      # Coding mode is a one-response action, not a persistent session flag.
      # The completed fix response itself is rendered with the Coding expression;
      # the next ordinary user message must be free to use its normal expression.
      coding_active = false
      troubleshooting_active = false
      messages << { role: "user", content: user_request.to_s.strip }
      messages << { role: "assistant", content: code_message }
    end

    {
      ok: true,
      answer: code_message,
      filename: fixed_filename,
      url: "/uploads/#{stored_name}",
      code: fixed_code
    }
  rescue StandardError => e
    warn "Faith code-fix failed: #{e.class}: #{e.message}"
    { ok: false, error: "I could not complete the code fix: #{e.message}" }
  end
end

# Normalize source files before they ever reach Faith's reasoning/model path.
# Some browser/proxy upload paths can accidentally wrap source text in Base64 more
# than once.  For source-like extensions we unwrap those layers when the decoded
# result is clearly text/source code.  Images and binary files are never touched.
normalize_source_text = lambda do |value, ext|
  text = value.to_s.sub(/\A\uFEFF/, "")

  # Source uploads can arrive through older browser/proxy paths as Base64, and
  # in some cases the Base64 payload has itself been Base64-encoded again.
  # Keep unwrapping source-like text for several layers.  Images/binary files
  # never enter this function.
  6.times do
    candidate = text.strip
    break if candidate.empty?

    # Handle an accidental data-URL wrapper as well as raw Base64.
    if candidate.start_with?("data:") && candidate.include?(",")
      candidate = candidate.split(",", 2)[1].to_s
    end

    compact = candidate.gsub(/\s+/, "")
    break unless compact.length >= 32 && (compact.length % 4).zero? && compact.match?(/\A[A-Za-z0-9+\/=]+\z/)

    begin
      decoded = compact.unpack1("m0").to_s.force_encoding("UTF-8").encode(
        "UTF-8", invalid: :replace, undef: :replace, replace: "�"
      ).sub(/\A\uFEFF/, "")
    rescue StandardError
      break
    end

    source_like = case ext
                  when ".py"
                    decoded.match?(/(?:\A|\n)\s*(?:def |async\s+def |class |from |import |if __name__|@\w+|[A-Za-z_]\w*\s*=)/)
                  when ".js", ".ts", ".jsx", ".tsx"
                    decoded.match?(/(?:\b(?:function|class|const|let|var|import|export)\b|=>|require\s*\()/)
                  when ".java", ".kt", ".kts", ".cs", ".cpp", ".h", ".hpp"
                    decoded.match?(/(?:\b(?:class|interface|enum|package|import|public|private|protected|#include)\b|\{)/)
                  else
                    decoded.match?(/[\r\n]|\b(?:import|from|class|function|def|require|include|using)\b|[=;{}()]/)
                  end

    # If the decoded value is another Base64-looking layer, KEEP GOING even
    # though that intermediate layer is not recognizable as source yet.
    # This is the important case for Base64(Base64(actual_source)).
    nested = begin
      nested_compact = decoded.strip.gsub(/\s+/, "")
      nested_compact.length >= 32 &&
        (nested_compact.length % 4).zero? &&
        nested_compact.match?(/\A[A-Za-z0-9+\/=]+\z/)
    rescue StandardError
      false
    end

    if source_like || nested || decoded.match?(/[\r\n]/)
      text = decoded
      next
    end

    break
  end

  text
end

prepare_attachment = lambda do |raw, request_base_url = ""|
  return nil unless raw.is_a?(Hash)

  name = raw["name"].to_s.strip
  mime = raw["type"].to_s.strip.downcase
  data_url = raw["data"].to_s
  vision_data_url = raw["vision_data"].to_s
  # The browser may provide a plain UTF-8 copy for source/code files.  This is
  # deliberately kept separate from the Base64 data URL: Base64 is transport
  # only and must never become the code representation passed to Faith.
  client_text_content = raw["text_content"]
  size = Integer(raw["size"] || 0) rescue 0

  raise "Uploaded file is missing a name." if name.empty?
  raise "Uploaded file is too large. Maximum size is #{MAX_UPLOAD_BYTES / 1_000_000} MB." if size > MAX_UPLOAD_BYTES
  has_data_url = data_url.start_with?("data:")
  unless has_data_url || client_text_content.is_a?(String)
    raise "Uploaded file data is missing."
  end

  header, encoded = has_data_url ? data_url.split(",", 2) : ["", ""]
  raise "Invalid uploaded file data." if has_data_url && encoded.to_s.empty?

  declared_mime = header.to_s[/\Adata:([^;]+);base64\z/i, 1].to_s.downcase
  mime = declared_mime if mime.empty?
  mime = "application/octet-stream" if mime.empty?

  bytes = if has_data_url
            [encoded].pack("m0")
          else
            client_text_content.to_s.encode("UTF-8", invalid: :replace, undef: :replace, replace: "�")
          end
  raise "Uploaded file exceeds the maximum size." if bytes.bytesize > MAX_UPLOAD_BYTES

  ext = File.extname(name).downcase
  safe_name = name.gsub(/[^0-9A-Za-z._-]/, "_")
  stored_name = "#{SecureRandom.hex(8)}-#{safe_name}"
  stored_path = File.join(UPLOAD_DIR, stored_name)
  File.binwrite(stored_path, bytes)

  image = mime.start_with?("image/")
  image_base_url = !PUBLIC_BASE_URL.empty? ? PUBLIC_BASE_URL : request_base_url.to_s.strip.sub(%r{/\z}, "")
  public_image_url = if image && !image_base_url.empty?
                       "#{image_base_url}/uploads/#{stored_name}"
                     end

  text_like = mime.start_with?("text/") ||
              %w[.txt .md .markdown .json .csv .xml .html .htm .css .js .ts .jsx .tsx .java .rb .py .c .cpp .h .hpp .cs .php .sql .yaml .yml .toml .ini .properties .sh .bat .go .rs .kt .kts .swift .lua .dart .scala .groovy .gradle .m .mm .vert .frag .glsl].include?(ext)

  history_content = "[Uploaded #{name} (#{mime}, #{bytes.bytesize} bytes) for observation.]"

  user_question = raw["question"].to_s.strip[0, 4000]
  observation_instruction = if user_question.empty?
                              "Observe the uploaded file and comment on what you can actually inspect. Be specific and natural."
                            else
                              "Observe the uploaded file and answer the user's question about it. Only make claims supported by the uploaded content."
                            end

  text = if text_like
    raw_text = if client_text_content.is_a?(String)
                 client_text_content
               else
                 bytes.force_encoding("UTF-8").encode("UTF-8", invalid: :replace, undef: :replace, replace: "�")
               end
    # This is the canonical representation used everywhere after upload.  Faith
    # must receive actual source text even if an older frontend/proxy supplied a
    # Base64-wrapped representation.
    normalize_source_text.call(raw_text, ext)[0, VISION_MAX_TEXT]
  end

  model_content = if image
                    # Filled with the separate vision result immediately before ask_ai.
                    "The user uploaded an image named \"#{name}\"."
                  elsif text_like
                    [
                      {
                        type: "text",
                        text: "FAITH FILE INPUT\n\n#{observation_instruction} The uploaded file is \"#{name}\" (#{mime}). Treat the FILE CONTENTS below as the actual contents of the user's uploaded file and discuss them directly. Do not merely describe the filename.\n\nFILE CONTENTS:\n#{text}#{user_question.empty? ? "" : "\n\nUSER QUESTION:\n#{user_question}"}"
                      }
                    ]
                  else
                    [
                      {
                        type: "text",
                        text: "The user uploaded \"#{name}\" (#{mime}, #{bytes.bytesize} bytes). The file was received and stored, but its binary format is not directly decodable by this Faith observation path. Do not claim to have inspected content you cannot access. Comment only on the file metadata and explain that limitation.#{user_question.empty? ? "" : "\n\nUSER QUESTION:\n#{user_question}"}"
                      }
                    ]
                  end

  {
    name: name,
    mime: mime,
    size: bytes.bytesize,
    path: stored_path,
    url: "/uploads/#{stored_name}",
    public_url: public_image_url,
    image: image,
    history_content: history_content,
    model_content: model_content,
    text_content: text_like ? text : nil,
    data_url: image ? (vision_data_url.start_with?("data:image/") ? vision_data_url : data_url) : nil
  }
end



# HARD ISOLATION: uploaded text/code files never enter the Vireonix request path.
# Browser Base64 is transport-only; prepare_attachment decodes it for storage, while
# an optional client_text_content is used as the canonical UTF-8 source representation.
# This endpoint returns a concrete local inspection report with HTTP 200.
local_upload_response = lambda do |attachment, question|
  if attachment.nil?
    next [400, { error: "No uploaded file was supplied." }]
  end
  if attachment[:image]
    observation = observe_image.call(attachment, question)
    if observation.to_s.strip.empty?
      next [502, {
        error: "The image was uploaded, but the visual observer did not return a description. Check the Faith server log for the vision-service response.",
        mode: "vision"
      }]
    end
    next [200, {
      ok: true,
      mode: "vision",
      answer: observation,
      expression: "observing",
      images: [],
      image_mode: "none",
      attachment: { name: attachment[:name], type: attachment[:mime], size: attachment[:size], url: attachment[:url] }
    }]
  end
  if attachment[:text_content]
    answer = observe_text_file.call(attachment, question)
    next [200, {
      ok: true,
      mode: "file-observer",
      answer: answer,
      expression: "observing",
      images: [],
      image_mode: "none",
      attachment: { name: attachment[:name], type: attachment[:mime], size: attachment[:size], url: attachment[:url] }
    }]
  end
  [200, {
    ok: true,
    mode: "metadata",
    answer: "I received #{attachment[:name].inspect}, but this file type is binary and is not decoded by the local file observer.",
    expression: "observing",
    images: [],
    image_mode: "none",
    attachment: { name: attachment[:name], type: attachment[:mime], size: attachment[:size], url: attachment[:url] }
  }]
end

vision_missing_payload = lambda do |error|
  {
    error: error.message,
    vision_optional: true,
    download_url: error.download_url,
    download_filename: error.download_filename,
    download_urls: [
      { filename: FaithVisionObserver::MODEL_FILENAME, url: FaithVisionObserver::MODEL_DOWNLOAD_URL },
      { filename: FaithVisionObserver::MMPROJ_FILENAME, url: FaithVisionObserver::MMPROJ_DOWNLOAD_URL }
    ]
  }
end

json_response = lambda do |res, status, body|
  res.status = status
  res["Content-Type"] = "application/json; charset=utf-8"
  res["Cache-Control"] = "no-store"
  res.body = JSON.generate(body)
end

server = WEBrick::HTTPServer.new(
  Port: PORT,
  DocumentRoot: PUBLIC_DIR,
  AccessLog: [],
  Logger: WEBrick::Log.new($stderr, WEBrick::Log::WARN)
)


server.mount_proc "/api/vision-status" do |req, res|
  unless req.request_method == "GET"
    json_response.call(res, 405, { error: "GET required." })
    next
  end

  begin
    res["X-Faith-Server-Version"] = FAITH_SERVER_VERSION
    status = local_vision_observer.status
    status[:server_version] = FAITH_SERVER_VERSION
    status[:model_filename] = FaithVisionObserver::MODEL_FILENAME
    status[:mmproj_filename] = FaithVisionObserver::MMPROJ_FILENAME
    status[:download_url] = FaithVisionObserver::MODEL_DOWNLOAD_URL
    status[:mmproj_download_url] = FaithVisionObserver::MMPROJ_DOWNLOAD_URL
    status[:download_urls] = [
      { filename: FaithVisionObserver::MODEL_FILENAME, url: FaithVisionObserver::MODEL_DOWNLOAD_URL },
      { filename: FaithVisionObserver::MMPROJ_FILENAME, url: FaithVisionObserver::MMPROJ_DOWNLOAD_URL }
    ]
    json_response.call(res, 200, status)
  rescue StandardError => error
    json_response.call(res, 200, { state: "starting", progress: nil, error: error.message })
  end
end

server.mount_proc "/api/upload" do |req, res|
  unless req.request_method == "POST"
    json_response.call(res, 405, { error: "POST required." })
    next
  end
  begin
    payload = JSON.parse(req.body.to_s)
    question = payload["question"].to_s.strip
    raw_file = payload["file"]
    raw_file["question"] = question if raw_file.is_a?(Hash)
    attachment = prepare_attachment.call(raw_file)
    status, body = local_upload_response.call(attachment, question)
    if attachment && attachment[:text_content]
      mutex.synchronize do
        latest_code_filename = attachment[:name].to_s
        latest_code_text = attachment[:text_content].to_s
        latest_code_context = "Uploaded file: #{attachment[:name]}\n#{attachment[:text_content]}"[0, 16000]
        latest_troubleshooting_response = nil
        troubleshooting_active = false
        troubleshooting_diagnosis_ready = false
        troubleshooting_turn_count = 0
        coding_active = false
      end
      body[:troubleshoot_offer] = File.extname(attachment[:name].to_s).match?(/\A\.(?:py|java|rb|js|ts|jsx|tsx|c|cpp|h|hpp|cs|php|go|rs|kt|kts|swift|sql)\z/i)
    end
    res["X-Faith-Server-Version"] = FAITH_SERVER_VERSION
    res["X-Faith-Upload-Path"] = "isolated"
    json_response.call(res, status, body)
  rescue JSON::ParserError
    json_response.call(res, 400, { error: "Invalid JSON request." })
  rescue FaithVisionObserver::MissingModelError => error
    warn "Faith optional vision model missing: #{error.message}"
    json_response.call(res, 424, vision_missing_payload.call(error))
  rescue StandardError => error
    warn "Faith upload endpoint error: #{error.class}: #{error.message}"
    json_response.call(res, 500, { error: error.message })
  end
end

server.mount_proc "/api/chat" do |req, res|
  unless req.request_method == "POST"
    json_response.call(res, 405, { error: "POST required." })
    next
  end

  begin
    payload = JSON.parse(req.body.to_s)
    question = payload["question"].to_s.strip
    raw_file = payload["file"]
    raw_file["question"] = question if raw_file.is_a?(Hash)
    attachment = prepare_attachment.call(raw_file)

    if question.empty? && attachment.nil?
      json_response.call(res, 400, { error: "Question or an uploaded file is required." })
      next
    end

    raw_photo = photo_request.call(question) unless attachment
    generated_request = attachment.nil? && generate_image_request.call(question)
    # Generation wins: "generate an image of X" contains "image of" but is NOT a photo request.
    direct_photo = raw_photo && !generated_request

    observation_question = if attachment && question.empty?
                              "Please observe the uploaded file and comment on it."
                            else
                              question
                            end

    # Classify the current message before choosing the initial expression.
    # Attachment-based requests intentionally do not trigger text emotions.
    emotion = attachment ? nil : emotion_state.call(observation_question)

    expression_name = if attachment
                         "observing"
                       elsif emotion
                         emotion.to_s
                       elsif greeting_question.call(question)
                        "greeting"
                      elsif generated_request
                        # Image creation requests use Faith's dedicated Painting expression.
                        "painting"
                      elsif direct_photo
                        "thinking"
                      else
                        "explanation"
                      end

    # Anger is a deliberate hard-stop: Faith should not carry out an otherwise
    # valid request when the user delivers it in the aggressive form that triggered
    # Anger mode. The model still writes the refusal in Faith's voice.
    if emotion == :anger && attachment.nil?
      answer = ask_ai.call(observation_question, nil, emotion)
      mutex.synchronize do
        troubleshooting_active = false
        coding_active = false
      end
      res["X-Faith-Server-Version"] = FAITH_SERVER_VERSION
      json_response.call(res, 200, {
        answer: answer,
        expression: "anger",
        emotion: "anger",
        session_mode: "idle",
        fix_code_available: false,
        images: [],
        image_prompt: nil,
        image_resolution: ENV.fetch("FAITH_IMAGE_RESOLUTION", "768x768"),
        image_guidance: ENV.fetch("FAITH_IMAGE_GUIDANCE_SCALE", "7"),
        image_seed: -1,
        image_mode: "none",
        image_generation_available: false,
        image_request: false
      })
      next
    end

    end_troubleshooting = observation_question.match?(/\b(?:end|exit|leave|finish|stop)\s+(?:the\s+)?(?:troubleshooting|coding)\s*(?:session|mode)?\b/i)
    if end_troubleshooting
      mutex.synchronize do
        troubleshooting_active = false
        troubleshooting_diagnosis_ready = false
        troubleshooting_turn_count = 0
        coding_active = false
        latest_troubleshooting_response = nil
      end
      set_troubleshooting = false
      answer = "Understood. The troubleshooting/coding session is now over."
      mutex.synchronize do
        messages << { role: "user", content: observation_question }
        messages << { role: "assistant", content: answer }
      end
    elsif troubleshooting_request.call(observation_question) && !attachment
      set_troubleshooting = true
      was_already_troubleshooting = mutex.synchronize { troubleshooting_active }
      active_code = mutex.synchronize { latest_code_context }
      entry_only = troubleshooting_entry_only.call(observation_question)

      # If the user has already uploaded source code, a request to enter
      # Troubleshooting mode should immediately analyze that source instead of
      # returning the generic mode-entry sentence. That sentence is only useful
      # when there is no concrete source/problem to diagnose yet.
      diagnosis_question = if entry_only && !active_code.to_s.strip.empty?
                             "Analyze the uploaded source for likely programming errors and provide a concrete troubleshooting diagnosis. #{active_code.to_s.lines.first(3).join(' ').strip}"
                           else
                             observation_question
                           end
      answer = search_troubleshooting_web.call(diagnosis_question, active_code)
      failed_diagnosis = answer.match?(/(?:I could not complete a reliable diagnosis from the supplied source yet|diagnosis service returned HTTP (?:502|503|504))/i)
      mutex.synchronize do
        troubleshooting_active = true
        coding_active = false
        troubleshooting_turn_count += 1
        # A pure request to enter Troubleshooting is stage 1 only. A concrete
        # problem stated on the first Troubleshooting request is already the
        # diagnosis stage. Every later Troubleshooting turn remains eligible
        # to update/complete the diagnosis.
        if !failed_diagnosis && (!entry_only || !active_code.to_s.strip.empty? || was_already_troubleshooting)
          troubleshooting_diagnosis_ready = true
        end
        latest_troubleshooting_response = answer
        messages << { role: "user", content: observation_question }
        messages << { role: "assistant", content: answer }
      end
    elsif troubleshooting_request.call(observation_question) && attachment && attachment[:text_content]
      set_troubleshooting = true
      active_code = "Uploaded file: #{attachment[:name]}\n#{attachment[:text_content]}"[0, 16000]
      answer = search_troubleshooting_web.call(observation_question, active_code)
      failed_diagnosis = answer.match?(/(?:I'm in Troubleshooting mode, but I couldn't retrieve live search results|diagnosis service returned HTTP (?:502|503|504))/i)
      mutex.synchronize do
        latest_code_filename = attachment[:name].to_s
        latest_code_text = attachment[:text_content].to_s
        latest_code_context = "Uploaded file: #{attachment[:name]}\n#{attachment[:text_content]}"[0, 16000]
        troubleshooting_active = true
        coding_active = false
        troubleshooting_turn_count += 1
        # If this is a concrete troubleshooting request attached to the code,
        # its successful diagnosis can unlock Fix Code immediately. A failed
        # search/model response never unlocks it.
        troubleshooting_diagnosis_ready = true if !failed_diagnosis && !troubleshooting_entry_only.call(observation_question)
        latest_troubleshooting_response = answer
        messages << { role: "user", content: observation_question }
        messages << { role: "assistant", content: answer }
      end
    elsif mutex.synchronize { troubleshooting_active } && !attachment && !code_fix_request.call(observation_question)
      # Once Troubleshooting mode has been established, the user's next message
      # is treated as the actual problem/clarification even when it does not
      # contain words like "error" or "troubleshoot". This is the turn that
      # produces the diagnosis and unlocks Fix Code.
      set_troubleshooting = true
      active_code = mutex.synchronize { latest_code_context }
      answer = search_troubleshooting_web.call(observation_question, active_code)
      mutex.synchronize do
        troubleshooting_active = true
        coding_active = false
        troubleshooting_turn_count += 1
        troubleshooting_diagnosis_ready = true unless answer.match?(/(?:I'm in Troubleshooting mode, but I couldn't retrieve live search results|diagnosis service returned HTTP (?:502|503|504))/i)
        latest_troubleshooting_response = answer
        messages << { role: "user", content: observation_question }
        messages << { role: "assistant", content: answer }
      end
    elsif mutex.synchronize { troubleshooting_active } && code_fix_request.call(observation_question) && mutex.synchronize { !latest_code_text.to_s.empty? } && !attachment
      # A natural-language request such as “can you fix the code yourself?” is
      # treated exactly like pressing Fix Code. The browser also handles this
      # path directly, but keeping the server route makes the intent reliable.
      set_coding = true
      active_code = mutex.synchronize { latest_code_context }
      result = fix_code_from_active_session.call(observation_question)
      if result[:ok]
        answer = result[:answer]
        # Coding is scoped to this response only. Do not latch Coding mode onto
        # subsequent unrelated chat or image-generation requests.
        mutex.synchronize { coding_active = false; troubleshooting_active = false }
      else
        answer = "I can enter Coding Mode and fix it, but I couldn't complete the code modification yet: #{result[:error]}"
      end

      mutex.synchronize do
        latest_troubleshooting_response = answer
        messages << { role: "user", content: observation_question }
        messages << { role: "assistant", content: answer }
      end
    elsif attachment && attachment[:image]
      observation = observe_image.call(attachment, observation_question)

      attachment[:model_content] = <<~OBSERVATION
        FAITH VISUAL INPUT

        The user uploaded the image "#{attachment[:name]}".

        USER REQUEST:
        #{observation_question}

        VISUAL OBSERVATION OF THE ACTUAL UPLOADED IMAGE:
        #{observation}

        Treat the VISUAL OBSERVATION above as your visual understanding of the uploaded
        image. Respond as Faith, naturally and directly. Use the concrete visual details
        to answer or discuss the image. Do not talk about APIs, observers, server
        configuration, or filenames as a substitute for visual information. Do not
        invent details that are not supported by the observation.
      OBSERVATION

      attachment[:history_content] = <<~HISTORY.strip
        [Uploaded #{attachment[:name]} (#{attachment[:mime]}, #{attachment[:size]} bytes).
        Faith's visual observation: #{observation}]
      HISTORY
    end

    if attachment && attachment[:image]
      # The visual observer is the source of truth for uploaded images.
      # Do NOT pass the observation through FaithCore first: FaithCore can
      # legally/technically answer as though it has no image, which was causing
      # the generic "I don't have a detailed visual breakdown" response.
      answer = observation.to_s.strip
      answer = "I received the image, but the visual observation service did not return an image description. Please retry." if answer.empty?

      mutex.synchronize do
        messages << { role: "assistant", content: answer }
      end
    elsif attachment && attachment[:text_content]
      # Source/text files use the independent file observer and never go through
      # FaithCore's raw-upload/local-review route.
      answer = observe_text_file.call(attachment, observation_question)

      attachment[:history_content] = <<~HISTORY.strip
        [Uploaded #{attachment[:name]} (#{attachment[:mime]}, #{attachment[:size]} bytes).
        Faith's file observation: #{answer}]
      HISTORY

      mutex.synchronize do
        messages << { role: "user", content: attachment[:history_content] }
        messages << { role: "assistant", content: answer }
      end
    elsif troubleshooting_request.call(observation_question)
      set_troubleshooting = true
      was_already_troubleshooting = mutex.synchronize { troubleshooting_active }
      active_code = mutex.synchronize { latest_code_context }
      answer = search_troubleshooting_web.call(observation_question, active_code)
      concrete_issue = !troubleshooting_entry_only.call(observation_question) &&
                       observation_question.to_s.strip.length >= 12 &&
                       !answer.match?(/diagnosis service returned HTTP (?:502|503|504)/i) &&
                       !answer.match?(/couldn't retrieve live search results/i)
      mutex.synchronize do
        troubleshooting_active = true
        coding_active = false
        troubleshooting_turn_count += 1
        troubleshooting_diagnosis_ready = true if concrete_issue
        latest_troubleshooting_response = answer
        messages << { role: "user", content: observation_question }
        messages << { role: "assistant", content: answer }
      end
    else
      answer = ask_ai.call(observation_question, attachment, emotion)
    end

    # IMPORTANT: Faith's answer is FINALIZED BEFORE FACTUAL SOURCE RESEARCH STARTS.
    # Source discovery/review is optional post-processing and MUST NEVER gate the
    # response. The previous implementation called source_factual_answer
    # synchronously here, which meant a long sequence of AI research calls and web
    # fetches could make it look like Faith was stuck generating the answer.
    #
    # Now the order is strictly:
    #   1. ask_ai -> Faith produces the answer.
    #   2. This request continues immediately toward the JSON response.
    #   3. A background thread researches sources for the already-completed answer.
    #
    # The original answer is never replaced by the source pass and the source pass
    # never writes citation markers into conversation history. This keeps the
    # answer path completely independent from reference discovery.
    troubleshooting_for_sourcing = if defined?(troubleshooting_request) && troubleshooting_request.respond_to?(:call)
                                     troubleshooting_request.call(observation_question)
                                   else
                                     observation_question.to_s.match?(/\b(troubleshoot|troubleshooting|debug|debugging|stack trace|exception|error|crash(?:es|ing)?|bug|not working|fails? to|failure|compile error|compilation error)\b/i)
                                   end

    if !attachment && !troubleshooting_for_sourcing &&
       !generated_request && !direct_photo && emotion != :anger &&
       defined?(answer) && sourceable_answer_request.call(observation_question)
      source_job_id = SecureRandom.hex(12)
      original_answer = answer.to_s.dup

      source_research_jobs_mutex.synchronize do
        source_research_jobs[source_job_id] = {
          status: "queued",
          question: observation_question.to_s,
          answer: original_answer,
          sourced_answer: nil,
          error: nil,
          started_at: Time.now.utc.iso8601,
          completed_at: nil
        }
      end

      Thread.new(source_job_id, observation_question.to_s, original_answer) do |job_id, research_question, completed_answer|
        begin
          source_research_jobs_mutex.synchronize do
            source_research_jobs[job_id][:status] = "researching" if source_research_jobs[job_id]
          end
          warn "[Faith Sources] Background research started for completed answer (job #{job_id})."

          sourced_answer = source_factual_answer.call(research_question, completed_answer)

          source_research_jobs_mutex.synchronize do
            if source_research_jobs[job_id]
              source_research_jobs[job_id][:status] = "complete"
              source_research_jobs[job_id][:sourced_answer] = sourced_answer
              source_research_jobs[job_id][:completed_at] = Time.now.utc.iso8601
            end
          end
          warn "[Faith Sources] Background research complete for job #{job_id}."
        rescue StandardError => e
          source_research_jobs_mutex.synchronize do
            if source_research_jobs[job_id]
              source_research_jobs[job_id][:status] = "failed"
              source_research_jobs[job_id][:error] = "#{e.class}: #{e.message}"
              source_research_jobs[job_id][:completed_at] = Time.now.utc.iso8601
            end
          end
          warn "[Faith Sources] Background research failed for job #{job_id}: #{e.class}: #{e.message}"
        end
      end
    end

    session_state = mutex.synchronize { { troubleshooting: troubleshooting_active, coding: coding_active } }
    # Expression selection is based on the CURRENT request. Coding is a one-shot
    # action used only for an explicit code-fix response; it must never overwrite
    # Painting/Perchance/Pollinations or ordinary chat on later requests.
    expression_name = if emotion
                        emotion.to_s
                      elsif defined?(set_coding) && set_coding
                        "coding"
                      elsif generated_request
                        "painting"
                      elsif direct_photo
                        "thinking"
                      elsif attachment
                        "observing"
                      elsif troubleshooting_request.call(observation_question) || (defined?(set_troubleshooting) && set_troubleshooting)
                        "troubleshooting"
                      else
                        expression_name
                      end

    # Generation path returns finished /generated/* URLs (server-side download,
    # reliable). Photo path returns Wikimedia URLs. Generation never falls
    # through to Wikimedia.
    images = []
    image_prompt = nil
    image_mode = "none"

    if generated_request && !troubleshooting_request.call(question)
      warn "Faith routing: GENERATE question=#{question[0, 80].inspect}"
      images = generate_image.call(question)
      if images.empty?
        # Server-side failed: send prompt so app.js can try browser fallback.
        image_prompt = extract_visual_prompt.call(question)
        image_prompt = fallback_image_topic.call(question) if image_prompt.to_s.length < 3
        image_mode = image_prompt.to_s.length >= 3 ? "generated-pending" : "none"
      else
        image_mode = "generated"
      end
    elsif direct_photo && !troubleshooting_request.call(question)
      warn "Faith routing: PHOTO question=#{question[0, 80].inspect}"
      images = search_images.call(question, answer)
      image_mode = "photo"
    elsif attachment || troubleshooting_request.call(question) || mutex.synchronize { troubleshooting_active || coding_active }
      # Coding/troubleshooting conversations are intentionally text/code-only.
      images = []
      image_mode = "none"
    else
      images = search_images.call(question, answer)
      image_mode = images.empty? ? "none" : "wikimedia"
    end

    generation_requested = generated_request
    generation_available = if IMAGE_PROVIDER == "perchance"
      true
    else
      !ENV["OPENAI_API_KEY"].to_s.strip.empty?
    end

    # If Faith's model still tries to refuse a direct photo request, keep the
    # UI honest by adding a short acknowledgement rather than claiming she
    # cannot provide images.
    if direct_photo && answer.match?(/\b(?:can't|cannot|can not|unable|not able|don't have|do not have|can't send|cannot send)\b/i)
      answer = "Absolutely — I can show you a real photo for that. Here you go."
    end

    res["X-Faith-Server-Version"] = FAITH_SERVER_VERSION
    res["X-Faith-Upload-Path"] = attachment && attachment[:text_content] ? "isolated-local" : (attachment && attachment[:image] ? "vision" : "chat")
    session_state = mutex.synchronize do
      {
        troubleshooting: troubleshooting_active,
        coding: coding_active,
        code_available: !latest_code_text.to_s.empty? && !latest_code_filename.to_s.empty?,
        troubleshooting_ready: troubleshooting_diagnosis_ready
      }
    end

    if session_state[:troubleshooting] && session_state[:troubleshooting_ready] && !answer.match?(/If you want to, you can ask me to fix the code myself/i)
      answer = answer.rstrip + "\n\nIf you want to, you can ask me to fix the code myself and I will enter Coding Mode and resolve it."
    end

    json_response.call(res, 200, {
      answer: answer,
      # The answer is intentionally returned immediately. If this request started
      # factual source research, the job continues independently in the background.
      source_research_job_id: (defined?(source_job_id) ? source_job_id : nil),
      source_research_status: (defined?(source_job_id) ? "researching" : "none"),
      expression: expression_name,
      emotion: emotion&.to_s,
      session_mode: (session_state[:coding] || (defined?(set_coding) && set_coding)) ? "coding" : (session_state[:troubleshooting] ? "troubleshooting" : "idle"),
      fix_code_available: session_state[:troubleshooting] && session_state[:code_available] && session_state[:troubleshooting_ready],
      images: images,
      image_prompt: image_prompt,
      image_resolution: ENV.fetch("FAITH_IMAGE_RESOLUTION", "768x768"),
      image_guidance: ENV.fetch("FAITH_IMAGE_GUIDANCE_SCALE", "7"),
      image_seed: -1,
      image_mode: image_mode,
      image_generation_available: generation_available,
      image_request: direct_photo || generated_request,
      attachment: attachment && {
        name: attachment[:name],
        observation_mode: attachment[:image] ? "vision" : (attachment[:text_content] ? "file-observer" : "metadata"),
        type: attachment[:mime],
        size: attachment[:size],
        url: attachment[:url]
      }
    })
  rescue JSON::ParserError
    json_response.call(res, 400, { error: "Invalid JSON request." })
  rescue FaithVisionObserver::MissingModelError => error
    warn "Faith optional vision model missing: #{error.message}"
    json_response.call(res, 424, vision_missing_payload.call(error))
  rescue StandardError => error
    warn "FaithCore error: #{error.class}: #{error.message}"
    json_response.call(res, 500, { error: error.message })
  end
end

server.mount_proc "/api/source-research" do |req, res|
  unless req.request_method == "GET"
    json_response.call(res, 405, { error: "GET required." })
    next
  end

  begin
    job_id = req.query["job"].to_s.strip
    if job_id.empty?
      json_response.call(res, 400, { error: "A source research job ID is required." })
      next
    end

    job = source_research_jobs_mutex.synchronize do
      source_research_jobs[job_id]&.dup
    end

    unless job
      json_response.call(res, 404, { error: "Source research job not found." })
      next
    end

    json_response.call(res, 200, {
      job_id: job_id,
      status: job[:status],
      answer: job[:answer],
      sourced_answer: job[:sourced_answer],
      error: job[:error],
      started_at: job[:started_at],
      completed_at: job[:completed_at]
    })
  rescue StandardError => error
    json_response.call(res, 500, { error: error.message })
  end
end

server.mount_proc "/api/fix-code" do |req, res|
  unless req.request_method == "POST"
    json_response.call(res, 405, { error: "POST required." })
    next
  end

  begin
    payload = JSON.parse(req.body.to_s)
    request_text = payload["question"].to_s.strip
    state = mutex.synchronize { { troubleshooting: troubleshooting_active, filename: latest_code_filename, code: latest_code_text, diagnosis: latest_troubleshooting_response, diagnosis_ready: troubleshooting_diagnosis_ready } }
    unless state[:troubleshooting] && state[:code].to_s != "" && !state[:diagnosis].to_s.empty?
      json_response.call(res, 409, { error: "Faith has not completed a troubleshooting diagnosis for the uploaded source yet." })
      next
    end

    # Coding expression is scoped to this /api/fix-code response only.
    # Do not leave coding_active=true after the file has been produced.
    mutex.synchronize { coding_active = false }
    result = fix_code_from_active_session.call(request_text.empty? ? "Fix the diagnosed problem in the uploaded code." : request_text)
    if result[:ok]
      json_response.call(res, 200, {
        ok: true,
        answer: result[:answer],
        expression: "coding",
        filename: result[:filename],
        attachment: { name: result[:filename], url: result[:url], type: "text/plain", size: result[:code].to_s.bytesize },
        code: result[:code]
      })
    else
      mutex.synchronize { coding_active = false }
      json_response.call(res, 500, { error: result[:error], expression: "troubleshooting" })
    end
  rescue JSON::ParserError
    json_response.call(res, 400, { error: "Invalid JSON request." })
  rescue StandardError => error
    mutex.synchronize { coding_active = false }
    json_response.call(res, 500, { error: error.message, expression: "troubleshooting" })
  end
end

server.mount_proc "/api/clear" do |req, res|
  unless req.request_method == "POST"
    json_response.call(res, 405, { error: "POST required." })
    next
  end

  mutex.synchronize do
    messages.replace([{ role: "system", content: SYSTEM_PROMPT }])
    latest_code_context = nil
    latest_code_filename = nil
    latest_code_text = nil
    latest_troubleshooting_response = nil
    troubleshooting_active = false
    troubleshooting_diagnosis_ready = false
    coding_active = false
  end

  json_response.call(res, 200, { ok: true })
end

# Graceful process shutdown.
#
# The previous implementation handled Ctrl+C by calling exit(0) from the signal
# trap and relying on at_exit to stop WEBrick. On Windows this is unnecessarily
# fragile: the trap can run while WEBrick is blocked in server.start, and the
# cleanup then depends on SystemExit/at_exit completing cleanly. Handle SIGINT by
# shutting WEBrick down directly so server.start returns normally, then let the
# normal cleanup path finish.
shutdown_faith = lambda do
  begin
    server.shutdown
  rescue StandardError => error
    warn "Faith server shutdown warning: #{error.class}: #{error.message}"
  end

  begin
    local_vision_observer.shutdown!
  rescue StandardError => error
    warn "Faith vision shutdown warning: #{error.class}: #{error.message}"
  end
end

at_exit do
  shutdown_faith.call
end

trap("INT") do
  # WEBrick's shutdown is the important part: it releases the listening socket
  # and causes server.start to return. Do not call exit here; that was the source
  # of the unreliable Windows shutdown path.
  begin
    server.shutdown
  rescue StandardError => error
    warn "Faith Ctrl+C shutdown warning: #{error.class}: #{error.message}"
  end
end

trap("TERM") do
  begin
    server.shutdown
  rescue StandardError
    nil
  end
end

puts "=================================".red
puts "        Faith Web AI".red
puts "=================================".red
puts "Model: #{MODEL}".red
puts "Powered by Vireonix".red
puts "Images: Wikimedia Commons".red
puts "AI images: #{IMAGE_PROVIDER == "perchance" ? "Perchance" : (ENV["OPENAI_API_KEY"].to_s.empty? ? "disabled (set OPENAI_API_KEY)" : IMAGE_MODEL)}".red
puts
puts "Open http://localhost:#{PORT}".red
puts "Press Ctrl+C to stop.".red
puts

server.start
