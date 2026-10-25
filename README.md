# FaithAI
Artificial intelligence written in Ruby, Faith is powered on a llama-server.exe configured for Windows 7 running Qwen that relays messages to the visual avatar frontend and uses several custom Perchance image generators to handle image requests.

# How to start Faith
- Download the source .zip
- Download [qwen2-0_5b-instruct-q4_k_m](https://huggingface.co/Qwen/Qwen2-0.5B-Instruct-GGUF), qwen2.5-coder-0.5b-instruct-q4_k_m, and Faith_Emotions_v2_Q4_K_M
- Put all of them in the models folder
- Run START_FAITH_QWEN.bat
- Faith webserver now started at 127.0.0.1:4567 (or localhost:4567), close the web server by clicking Ctrl+C in the command prompt window.
- Faith sometimes hiccups and doesn't run properly if there is another process of Faith currently running. If it asks you to run CLEAR_FAITH_PORT_4567.bat, just do it.
<img src="https://i.imgur.com/1BBDlB1.png" alt="Descriptive Text">

# Basic chatting
- Faith uses her Qwen chat model for basic encyclopedic, religious, historical and political conversations
- All chats can be exported to .txt by right clicking a chat and clicking "Export chat (.txt)
- All chats usually embed a few images from Wikimedia Commons that go along with the current conversation.
<img src="https://i.imgur.com/GMFuUJI.png" alt="Descriptive Text">


# Text-To-Image
- Use the "paint a " prompt to have Faith generate an image for you.
- Faith can generate up to 32 images at one time, with a high range of resolutions supporting up to 1K, 2K, 4K and 8K image generation and 79 different art styles.
- You have no limits to how many image you can generate with Faith, but a reminder will start popping up after you have generated 100 MB of images that you are reaching high levels of storage, and should consider cleaning up. (Faith has very  advanced image storage management that will not remove any images marked as a favorite, to make mass batch generation/cleaning much easier)
<img src="https://i.imgur.com/zHdwonM.png" alt="Descriptive Text">

# Image-To-Image
- Faith's pipeline for Image-to-Image editing, designed specifically for re-creating images and getting prompt descriptions from images
- Send an image through Faith's upload attachments, and it will automatically be sent through the Image-to-Image pipeline.

<img src="https://i.imgur.com/JIJcWlp.png" alt="Descriptive Text">

<img src="https://i.imgur.com/e2qBaby.png" alt="Descriptive Text">


# Image-To-Video
- Faith has a dedicated separate section exclusively for video creation & editing, called Studio
- Studio allows for dedicated video creation workspaces and project saving, allowing for full-motion videos with progression, frames, and stories.
- Studio differs vastly from regular image generation, as it is designed specifically for generating transparent cutouts of characters, which are then maneuvered into becoming semi-motion graphics.
<img src="https://i.imgur.com/jjdLuyL.png" alt="Descriptive Text">
<img src="https://i.imgur.com/Zhj1hGT.png" alt="Descriptive Text">
<img src="https://i.imgur.com/4hBI7Yw.png" alt="Descriptive Text">
<img src="https://i.imgur.com/Hdiq1sk.png" alt="Descriptive Text">
<img src="https://i.imgur.com/SzlquuM.png" alt="Descriptive Text">
Preview of the fire breathing dragon animation:
<img src="https://i.imgur.com/IkjH767.gif"  width="200" height="200" alt="Descriptive Text">

# Text-To-Speech
- Faith has a built in voice, which uses an Australian accent ran through modulation & bit crushing to create the "robotic" signature sound.
- You can turn a chat into Faith's "Voice mode" by sending a message with [cyan][/cyan] BBCode. In this mode, Faith will not send any replies and will only read aloud the user's text message.
- Voice mode is only enabled per every conversation, but can be exited by typing [cyan]exit[/cyan]
<table>
  <tr>
    <td>▶️</td>
    <td><b>Faith Voice Preview</b></td>
    <td>00:00 / 00:05</td>
    <td><a href="https://audio.jukehost.co.uk/01a17452-487e-7053-b2c8-ea32cfe6c369">Download / Listen</a></td>
  </tr>
</table>
<img src="https://i.imgur.com/n5w5CAR.png" alt="Descriptive Text">


# Coding: Build Mode
- Faith handles code requests in 2 different forms: Build and Troubleshooting
- Build represents code that the user directly asked Faith to "build" for them from the ground up
- Troubleshooting represents already existing code that was sent to Faith for analysis and automatic fixing.
<img src="https://i.imgur.com/RUj2bUU.png" alt="Descriptive Text">

<img src="https://i.imgur.com/DTK3W2M.png" alt="Descriptive Text">
