# FaithCore Web

This version removes Glimmer/LibUI completely.

## Run on Windows

1. Open Command Prompt in this folder.
2. Install dependencies:

   bundle install

3. Start the Ruby web server:

   ruby server.rb

4. Open:

   http://localhost:4567

The browser handles all GUI rendering and expression switching.
Ruby handles the Vireonix API request and conversation memory.

## Hosting

The same app can be hosted on a Ruby-capable server. Put the contents of
this project on the server, run `ruby server.rb`, and place a reverse proxy
such as nginx/Apache/Cloudflare in front of it for HTTPS.

Do not put private API credentials in `app.js`; the browser talks to the
Ruby `/api/chat` endpoint instead.
