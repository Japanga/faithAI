(function () {
"use strict";
const $ = (id) => document.getElementById("fvs-" + id);

// Faith bridge adapter: Faith paints through its own image bridge tabs
// (generateFaithImage({question, artStyle, resolution}) -> {url: dataUrl}).
// Prompts arrive pre-styled by the vendored builders above, so the bridge
// always gets artStyle "No style" (server passthrough — never double-styled).
// Faith's top-bar Art Style picker stays independent (chat painting only).
function studioStyle() {
  try {
    const v = $("styleSelect").value;
    if (v) return v;
  } catch (_) { /* fall through */ }
  return "Anime";
}
async function faithGenerateImage(styledPrompt, resolution) {
  if (typeof generateFaithImage !== "function") {
    throw new Error("Faith image bridge not found (generateFaithImage missing).");
  }
  const r = await generateFaithImage({ question: styledPrompt, artStyle: "No style", resolution: resolution });
  const dataUrl = (r && (r.url || r.dataUrl)) || String(r);
  const img = await loadImg(dataUrl);
  return { dataUrl, img, prompt: styledPrompt };
}

// 79 art styles — same builders as the perchance Cutout Animator, so the studio paints
// the same prompts. Style is baked into the question client-side; the bridge always gets
// artStyle "No style" (the server's pure passthrough). Deterministic: no random choice.
// 79 art styles vendored from https://perchance.org/faith-image-bridge (t2i-styles + MTG Card + No style).
// Deterministic builders: multi-variant styles always use the first variant so every
// animation frame with the same seed stays consistent (no per-frame random style choice).
// {a|b} alternations resolve to the first option for the same reason.

const STYLE_NAMES = [
  "1920s Photo",
  "1930s Photo",
  "1940s Photo",
  "1950s Photo",
  "1960s Photo",
  "1970s Photo",
  "1980s Photo",
  "1990s Photo",
  "2D Disney Character",
  "2D Pokemon",
  "3D Disney Character",
  "3D Emoji",
  "3D Isometric Icon",
  "3D Pokemon",
  "50s Enamel Sign",
  "50s Infomercial Anime",
  "Anime",
  "Anime Screencap",
  "Cartoon",
  "Casual Photo",
  "Cinematic",
  "Claymation",
  "Concept Art",
  "Concept Art Icon",
  "Concept Sketch",
  "Crayon Drawing",
  "Cursed Photo",
  "Cute 3D Icon",
  "Cute 3D Icon 𝗦𝗲𝘁",
  "Cute Anime",
  "Cute Figurine",
  "Cute Illustration",
  "Digital Painting",
  "Digital Painting Icon",
  "Disney Sketch",
  "Drawn Anime",
  "Fantasy City Map",
  "Fantasy Landscape",
  "Fantasy Painting",
  "Fantasy Portrait",
  "Fantasy World Map",
  "Flat Illustration",
  "Flat Style Icon",
  "Flat Style Logo",
  "Franco-Belgian Comic",
  "Furry - Cinematic",
  "Furry - Drawn",
  "Furry - Oil",
  "Furry - Painted",
  "Game Art Icon",
  "Illustration",
  "Manga",
  "Medieval",
  "MTG Card",
  "Neon Vintage Anime",
  "Nihonga Painting",
  "No style",
  "Oil Painting",
  "Oil Painting - 70s Pulp",
  "Oil Painting - Old",
  "Oil Painting - Realism",
  "Old World Map",
  "Painted Anime",
  "Painted Pokemon",
  "Painterly",
  "Pencil",
  "Pixel Art",
  "Professional Photo",
  "Soft Anime",
  "Studio Ghibli",
  "Tattoo Design",
  "Tintin Comic",
  "Traditional Japanese",
  "Vintage Anime",
  "Vintage Comic",
  "Vintage Pulp Art",
  "Waifu",
  "Watercolor",
  "YuGiOh Art",
];

const BUILDERS = {
  "1920s Photo": ((d) => ("famous vintage 1920s photo, " + (d) + ", 1920s photo, restored photograph, sepia, historical archive photo")),
  "1930s Photo": ((d) => ("famous vintage 1930s photo, " + (d) + ", grainy photograph, 1930s photo with film grain, 1930s photo with vignetting, retro, r/OldSchoolCool, 1930s photo, vintage photo")),
  "1940s Photo": ((d) => ("famous vintage 1940s photo, " + (d) + ", grainy photograph, 1940s photo with film grain, 1940s photo with vignetting, retro, r/OldSchoolCool, 1940s photo, vintage photo")),
  "1950s Photo": ((d) => ("famous vintage 50s photo, " + (d) + ", grainy photograph, 1950s photo with film grain, 1950s photo with vignetting, retro, r/OldSchoolCool, 1950s photo, vintage photo")),
  "1960s Photo": ((d) => ("famous vintage 60s photo, " + (d) + ", grainy photograph, 1960s photo with film grain, 60s photo with vignetting, retro, r/OldSchoolCool, 60s photo, vintage photo")),
  "1970s Photo": ((d) => ("famous vintage 70s photo, " + (d) + ", grainy photograph, 1970s photo with film grain, 70s photo with vignetting, retro, r/OldSchoolCool, 70s photo, vintage photo")),
  "1980s Photo": ((d) => ("famous vintage 80s photo, " + (d) + ", grainy photograph, 80s photo with film grain, Kodacolor II 80s photo with vignetting, retro, r/OldSchoolCool, 80s photo with wear and tear and minor creasing and scratches, vintage color photo")),
  "1990s Photo": ((d) => ((d) + ", 90s home video, nostalgic 90s photo, taken with kodak disposable camera")),
  "2D Disney Character": ((d) => ("2D cartoon Disney character digital art of " + (d) + ". superb linework, classic 2D Disney style art, inspired in the style of the art styles of Glen Keane and Aaron Blaise, Disney-style character concept with a Disney-style face, trending on artstation, Disney-style version of " + (d) + ".\\n\\nOverall, it's an absolute world-class masterpiece 2D Disney-inspired Character. It's an aesthetically pleasing 2D Disney-inspired piece with impeccable attention to detail and impressive composition.")),
  "2D Pokemon": ((d) => ((d) + ", " + "" + "pokemon creature concept, superb line art, beautiful colors and composition, 2D art style, beautiful pokemon digital art, fakemon, in the style of Sowsow, pokemon creature, cryptid, fakemon, masterpiece, in the style of Yuu Nishida, 4k. The Pokémon-like creature is centered within this anime-style 2D image. It's from the upcoming Pokemon Movie \\(2026\\) which has the classic 2D Pokemon art style.\\n\\nOverall, it's an absolute world-class masterpiece 2D Pokemon-inspired artwork. It's an aesthetically pleasing 2D Pokemon-inspired artwork with impeccable attention to detail and impressive composition. Clean, perfect linework, impeccable clean 2D anime-inspired art style.")),
  "3D Disney Character": ((d) => ("3D cartoon Disney character portrait render. " + (d) + ", bokeh, 4k, highly detailed, Pixar render, CGI Animation, Disney, cute big circular reflective eyes, dof, cinematic film, Disney realism, subtle details, breathtaking Pixar short, fine details, close up, sharp focus, HDR, Disney-style octane render, incredible composition, superb lighting and detail, " + (d) + ".\\n\\nOverall, it's an absolute world-class masterpiece 3D Disney-inspired Character. It's an aesthetically pleasing 3D Disney-inspired piece with impeccable attention to detail and impressive composition.")),
  "3D Emoji": ((d) => ("masterpiece " + (d) + " cartoon 3D emoji concept render, close-up, facing forward, matte finish, 3D emoji render, app icon, simple design, new iOS 18.4 style " + (d) + " emoji render, simple background, centered, world-class masterpiece work of art, crisp render, sharp focus, charmingly aesthetic design, 4k, soft lighting, masterpiece emoji-style figurine 3D render, pure white background")),
  "3D Isometric Icon": ((d) => ((d) + ", 3D isometric render of cute " + (d) + ", 3D app icon, clean isometric design, beautiful design, soft gradient background, soft colors, centered, 3D blender render, masterpiece, best quality, high resolution, 8k octane render, beautiful color scheme, soft smooth lighting, physically based rendering, square image, high polycount")),
  "3D Pokemon": ((d) => ("An incredibly perfect high-quality 3D render of a pokemon creature, " + (d) + ", " + "" + "8k render, beautiful pokemon digital art, fakemon, pokemon creature, cryptid, fakemon, masterpiece, soft focus, best quality, high quality. Perfect soft lighting, beautiful composition. It's an impressive CGI image from the upcoming Pokemon Movie \\(2026\\).\\n\\nOverall, it's an absolute world-class masterpiece 3D-rendered Pokemon-inspired creature. It's an aesthetically pleasing 3D Pokemon-inspired piece with impeccable attention to detail and impressive composition.")),
  "50s Enamel Sign": ((d) => ("50s enamel sign of " + (d) + ", 50s advert enamel sign, masterpiece, authentic vintage enamel sign")),
  "50s Infomercial Anime": ((d) => ((d) + ", 1950s infomercial style, delicate linework, paprika anime art style, chromatic aberration glow, 2d painted cel animation, soft focus, 2D pixiv 1950s")),
  "Anime": ((d) => ("anime art of " + (d) + ", world-class masterpiece, 4k, best quality, anime art.\\n\\nOverall, it's an absolute world-class masterpiece anime-inspired artwork. It's an aesthetically pleasing anime art with impeccable attention to detail and beautiful composition.")),
  "Anime Screencap": ((d) => ("Anime screencap, " + (d) + ". It's an anime screencap from a popular anime. Beautiful visual quality, remastered, extremely high quality, very aesthetic, high production value, high-skill masterpiece. The image shows impeccable and beautiful composition and contrast. It's an exquisite anime screencap style image.")),
  "Cartoon": ((d) => ((d) + ", cartoon-style art, superb linework, nice colors and composition, bold linework, masterpiece, cute art in the style of Dana Terrace, in the style of Rebecca Sugar, in the style of ry-spirit, amazing and wholesome cartoon-style art, cute art style, (trending on artstation)")),
  "Casual Photo": ((d) => ("A casual real-life photograph. A casual photo of " + (String(d).replace(/\b(realistic)\b/i, "actual")) + ". It's a casual photo. Overall it's an actual real-life photograph.")),
  "Cinematic": ((d) => ((d) + ", cinematic shot, dynamic lighting, 75mm, Technicolor, Panavision, cinemascope, sharp focus, fine details, 8k, HDR, realism, realistic, key visual, film still, cinematic color grading, depth of field.\\n\\nOverall, it's an absolute world-class cinematic masterpiece. It's an aesthetically pleasing cinematic shot with impeccable attention to detail and impressive composition.")),
  "Claymation": ((d) => ((d) + ", claymation, incredible claymation style, kubo and the two strings style art, Missing Link 2019 art style, clay texture, clay animation, stop-motion clay")),
  "Concept Art": ((d) => ((d) + ", concept art, digital art, illustration, inspired by wlop style, 8k, fine details, sharp, very detailed, high resolution, world-class masterpiece.\\n\\nOverall, it's absolute world-class masterpiece concept art. It's an aesthetically pleasing concept art with impeccable attention to detail and impressive composition.")),
  "Concept Art Icon": ((d) => ((d) + ", a concept art icon, a digital art logo, illustration, league of legends style concept art logo icon, inspired by wlop style, 8k, fine details, sharp, very detailed, high resolution logo icon")),
  "Concept Sketch": ((d) => ("black and white technical drawing showcasing a " + (d) + ", annotation details, world-class masterpiece black and white, pencil strokes, annotated technical concept art sketch, pencil texture.\\n\\nOverall, it's a charmingly aesthetic and well-composed concept sketch.")),
  "Crayon Drawing": ((d) => ((d) + ", crayon drawing")),
  "Cursed Photo": ((d) => ("cursed photo of " + (d) + ", creepy and cursed, absolutely cursed photo, nope nope nope nope, what the actual f, unsettling photo, cursed_thing, cursedimages, no context, cursed image, bad photo, weird photo, very strange, color photo, creepy photo, nightmare fuel")),
  "Cute 3D Icon": ((d) => ((d) + ", a cute 3D icon of " + (d) + ", cartoon 3D icon, very cute shape, stylized octane render, 8k, masterpiece, soooo cute, beautiful cute perfection, beautiful soft lighting, soft colors, centered, high resolution, " + (d) + ", soft gradient background")),
  "Cute 3D Icon 𝗦𝗲𝘁": ((d) => ((d) + ", a set of lovely little 3D icons, cute 3D icons, very cute shapes, stylized octane render, 8k, masterpiece, soooo cute, beautiful cute perfection, beautiful soft lighting, soft colors, centered, high resolution, " + (d) + ", cute icon set")),
  "Cute Anime": ((d) => ("adorable, cute, kawaii, " + (d) + ", cute moe anime character portrait, adorable, featured on pixiv, kawaii moé masterpiece, cuteness overload, very detailed, sooooo adorable.\\n\\nOverall, it's an absolute world-class masterpiece anime-inspired artwork. It's an aesthetically pleasing anime art with impeccable attention to detail and beautiful composition.")),
  "Cute Figurine": ((d) => ((d) + ", figurine, modern Disney style, octane render, chibi")),
  "Cute Illustration": ((d) => ("A cute cartoon showing " + (d) + ", in a soft, cute, minimalist, webcomic-style illustration. Line art is somewhat bold but gentle, with clean lines, and subtle variation. Colors are soft, flat, with gentle pastel tones. No shading except for light inner shadows or simple highlights. The background is plain white or contains a light wash of color with subtle textured style. The overall scene is wholesome and endearing like a page from a Liz Climo comic. Composition is centered with space around the character, evoking authentic warmth through the wholesome, soft, web comic style.\\n\\nIt's an aesthetically pleasing masterpiece, showing high skill in evoking an authentic and beautifully minimalist style.")),
  "Digital Painting": ((d) => ((d) + ", breathtaking digital art, trending on artstation, in the style of atey ghailan, in the style of greg rutkowski, in the style of greg tocchini, in the style of james gilleard, 8k, high resolution, best quality.\\n\\nOverall, it's an absolute world-class masterpiece digital painting. It's an aesthetically pleasing digital painting with impeccable attention to detail and impressive composition.")),
  "Digital Painting Icon": ((d) => ((d) + ", app logo icon, digital art pictogram icon, trending on artstation, app icon in the style of atey ghailan, app icon in the style of greg rutkowski, app icon in the style of greg tocchini, app icon in the style of james gilleard, 8k, high resolution, best quality")),
  "Disney Sketch": ((d) => ("Glen Keane character concept art black and white pencil sketch of " + (d) + ". rough pencil sketch in the style of Glen Keane, rough pencil sketch, close up, loose Disney-style character concept art sketch, nice sketchy pencil strokes, Disney character design sketch, pencil texture, a concept art pencil sketch of " + (d) + ", in the style of Glen Keane.\\n\\nOverall, it's an charmingly aesthetic and well-composed Disney-style sketch.")),
  "Drawn Anime": ((d) => ("anime-style illustration with perfect clean lines, illustration of " + (d) + ", anime drawing/art, bold linework, illustration, cel shaded, anime-style digital illustration. It's an anime-inspired 2D-style anime illustration. Aesthetic high-skill, professional anime illustration, which looks like a screencap from an anime series. It has clean line work and a pleasant, appealing drawn aesthetic style. Overall, it's a world-class illustration with flawless line work, perfect composition, and impeccable attention to detail.")),
  "Fantasy City Map": ((d) => ("an aerial view of a city, TTRPG city map showing the full city, " + (d) + ", fantasy art, highly-skilled senior environment artist piece, beautiful fantasy map.\\n\\nOverall, it's an absolute world-class masterpiece fantasy city map. It's an aesthetically pleasing fantasy city map artwork with impeccable attention to detail and impressive composition.")),
  "Fantasy Landscape": ((d) => ((d) + ", fantasy matte painting, absolute masterpiece, detailed matte painting in the style of andreas rocha and greg rutkowski, in the style of Brothers Hildebrandt, superb composition, vivid fantasy art, breathtaking fantasy masterpiece. It's an absolute world-class masterpiece artwork. It's an aesthetically pleasing artwork with impeccable attention to detail and impressive composition.")),
  "Fantasy Painting": ((d) => ((d) + ", d&d, fantasy, highly detailed, digital painting, artstation, sharp focus, fantasy art, illustration, 8k, in the style of greg rutkowski. It's an absolute world-class masterpiece artwork. It's an aesthetically pleasing artwork with impeccable attention to detail and impressive composition.")),
  "Fantasy Portrait": ((d) => ((d) + ", d&d, fantasy, highly detailed, digital painting, artstation, sharp focus, fantasy art, character art, illustration, 8k, art in the style of artgerm and greg rutkowski. It's an absolute world-class masterpiece artwork. It's an aesthetically pleasing artwork with impeccable attention to detail and impressive composition.")),
  "Fantasy World Map": ((d) => ("beautiful fantasy map of " + (d) + ", beautiful fantasy map inspired by middle earth and azeroth and discworld and westeros and essos and the witcher world and tamriel and faerûn and thedas, 4k, beautiful colors, crisp, high-resolution artistic map, topographic 3D terrain, artistic map.\\n\\nOverall, it's an absolute world-class masterpiece fantasy world map. It's an aesthetically pleasing fantasy world map artwork with impeccable attention to detail and impressive composition.")),
  "Flat Illustration": ((d) => ((d) + ", illustration, flat, 2D, vector art, masterpiece, made with adobe illustrator, behance competition winner, trending on dribble, 4k, high resolution, crisp lines.\\n\\nOverall, it's an absolute world-class masterpiece flat-style illustration. It's an aesthetically pleasing flat-style illustration with impeccable attention to detail and impressive composition.")),
  "Flat Style Icon": ((d) => ((d) + ", creative icon, flat style icon, masterpiece, high resolution, crisp, beautiful composition and color choice, beautiful flat painted style, behance contest-winner, award winning icon illustration, 8k, best quality")),
  "Flat Style Logo": ((d) => ("beautiful flat-style logo design depicting " + (d) + ", creative flat-style logo design, trending on dribbble, featured on behance, portfolio piece, minimal flat design, breathtaking graphic design, 8k, high resolution vector logo, plain background, amazingly beautiful logo design, winner of best logo award")),
  "Franco-Belgian Comic": ((d) => ("franco-belgian color comic about " + (d) + ", bande dessinée, franco-belgian comic panel, masterpiece, breathtaking composition, intricate, detailed, best quality")),
  "Furry - Cinematic": ((d) => ((d) + ", cinematic shot, dynamic lighting, 75mm, Technicolor, Panavision, cinemascope, sharp focus, fine details, 8k, HDR, realism, realistic, key visual, film still, cinematic color grading, depth of field.\\n\\nOverall, it's an absolute world-class masterpiece. It's an aesthetically pleasing image with impeccable attention to detail and impressive composition.")),
  "Furry - Drawn": ((d) => ("anthro " + (d) + " illustration, hand-drawn, bold linework, anthro illustration, cel shaded, 4k, fine details, masterpiece.\\n\\nOverall, it's an absolute world-class masterpiece artwork. It's an aesthetically pleasing artwork with impeccable attention to detail and impressive composition.")),
  "Furry - Oil": ((d) => ((d) + ", crisp vibrant detailed soft painterly digital art, volumetric lighting, natural lighting, realistic lighting, vibrant colors, crisp oil painting, painterly realism, depth of field, subtle soft details, vivid, fresh, striking, in the style of chunie, in the style of darkgem, in the style of honovy, inspired by zaush, inspired by anhes, inspired by puinkey, in the style of caraid, in the style of dagasi, inspired by taranfiddler, in the style of atey ghailan, in the style of MilletGustave, in the style of Curbet, inspired by Charlie Bowater style, lol art.\\n\\nOverall, it's a world-class painterly masterpiece. It's aesthetically pleasing digitial art with impeccable attention to detail and impressive composition.")),
  "Furry - Painted": ((d) => ("anthro " + (d) + " digital art, masterpiece, 4k, fine details. It's an absolute world-class masterpiece artwork.\\n\\nOverall, it's an aesthetically pleasing artwork with impeccable attention to detail and impressive composition.")),
  "Game Art Icon": ((d) => ((d) + ", a concept art icon for league of legends, a digital art logo, illustration, league of legends style icon, inspired by wlop style, 8k, dota 2 style icon, fine details, sharp, very detailed icon, high resolution rpg ability/spell/item icon")),
  "Illustration": ((d) => ("breathtaking illustration of " + (d) + ", illustration, masterpiece, breathtaking illustration.\\n\\nOverall, it's an absolute world-class masterpiece illustration. It's an aesthetically pleasing illustration with impeccable attention to detail and impressive composition.")),
  "Manga": ((d) => ((d) + ", incredible hand-drawn manga, black and white, in the style of Takehiko Inoue, in the style of Katsuhiro Otomo and akira toriyama manga, hand-drawn art in the style of rumiko takahashi and Inio Asano, Ken Akamatsu manga art.\\n\\nOverall, it's an absolute world-class masterpiece black and white manga-style artwork. It's an aesthetically pleasing black and white manga artwork with impeccable attention to detail and impressive composition.")),
  "Medieval": ((d) => ("medieval illuminated manuscript picture of " + (d) + ", medieval illuminated manuscript art, masterpiece medieval color illustration, 16th century, 8k high-resolution scan of 16th century illuminated manuscript painting, detailed medieval masterpiece. ")),
  "MTG Card": ((d) => ("magic the gathering card, " + (d) + ", incredible magic the gathering artwork")),
  "Neon Vintage Anime": ((d) => ((d) + ", neon vintage anime style, 90's anime style, 1990s anime, hajime sorayama, greg tocchini, neon vintage anime masterpiece, anime art, 4k, high quality.\\n\\nOverall, it's an absolute world-class masterpiece neon vintage anime artwork. It's an aesthetically pleasing neon vintage anime artwork with impeccable attention to detail and impressive composition.")),
  "Nihonga Painting": ((d) => ("japanese nihonga painting about " + (d) + ", Nihonga, ancient japanese painting, intricate, detailed")),
  "No style": ((d) => ((d))),
  "Oil Painting": ((d) => ("breathtaking alla prima oil painting, " + (d) + ", close up, alla prima style, oil on linen, painterly oil on canvas, painterly style, exquisite composition and lighting, modern painterly masterpiece, in the style of alexi zaitsev, award-winning painterly alla prima oil painting.\\n\\nOverall, it's an absolute world-class masterpiece oil painting. It's an aesthetically pleasing oil painting with impeccable attention to detail and impressive composition.")),
  "Oil Painting - 70s Pulp": ((d) => ("1970s vintage pulp art, ultra realistic, fully restored, exquisite lighting and composition, polished, masterpiece, vintage pulp art, in the style of Earle K. Bergey, in the style of Kelly Freas, in the style of Alex Schomburg, in the style of H. J. Ward, glossy pulp art, Amazing Stories, Weird Tales, 8k, high resolution, best quality, hyper-realistic, Mattias Adolfsson style, detailed stylization, " + (d) + ", ultra realistic, wlop-style, exquisite lighting and composition, polished, world-class masterpiece, digitally enhanced, breathtaking shot, subtle details, superb quality, art in the style of Kuvshinov, Kuvshinov style, detailed stylization.\\n\\nOverall, it's an absolute world-class masterpiece artwork. It's an aesthetically pleasing restored 1970s vintage pulp art with impeccable attention to detail and impressive composition. It has perfect contrast and color balance. Almost photorealism.")),
  "Oil Painting - Old": ((d) => ((d) + ", Oil painting in the style of Jean-François Millet and Gustave Courbet and Jules Breton")),
  "Oil Painting - Realism": ((d) => ("breathtaking oil painting, " + (d) + ", photorealistic oil painting, in the style of charlie bowater, fine details, in the style of wlop, trending on artstation, very detailed.\\n\\nOverall, it's an absolute world-class masterpiece realism oil painting. It's an aesthetically pleasing realism oil painting with impeccable attention to detail and impressive composition.")),
  "Old World Map": ((d) => ("fantasy world map of " + (d) + ", fantasy world map, highly detailed digital painting, fantasy art, map illustration, 8k.\\n\\nOverall, it's an absolute world-class masterpiece old world map. It's an aesthetically pleasing old world style map artwork with impeccable attention to detail and impressive composition.")),
  "Painted Anime": ((d) => ((d) + ", art in the style of atey ghailan, painterly anime style at pixiv, art in the style of kantoku, in art style of redjuice/necömi/rella/tiv pixiv collab, your name anime art style, masterpiece digital painting, exquisite lighting and composition, inspired by wlop art style, 8k, sharp, very detailed, high resolution, illustration.\\n\\nOverall, it's an absolute world-class masterpiece painterly anime-inspired digital art. It's an aesthetically pleasing painterly anime-inspired digital artwork with impeccable attention to detail and impressive composition.")),
  "Painted Pokemon": ((d) => ("Beautiful, very high-quality painterly digital concept art, " + (d) + ", " + "" + "8k digital painting of a pokemon, amazing pokemon creature art in the style of piperdraws, cryptid creations in the style of Piper Thibodeau, in the style of Naoki Saito and Tokiya, incredible composition.\\n\\nOverall, it's an absolute world-class masterpiece painterly Pokemon-inspired artwork. It's an aesthetically pleasing painterly Pokemon-inspired artwork with impeccable attention to detail and impressive composition.")),
  "Painterly": ((d) => ("painterly digital painting, " + (d) + ", digital painting in the style of Ilya Kuvshinov with painterly brush strokes, in the style of Ilya Kuvshinov, world-class painterly masterpiece.\\n\\nOverall, it's an absolute world-class masterpiece painterly digital painting. It's an aesthetically pleasing painterly digital painting with impeccable attention to detail and impressive composition.")),
  "Pencil": ((d) => ("black and white pencil drawing, " + (d) + ", black and white, breathtaking pencil illustration, highly detailed, 4k, textured paper, pencil texture, sketch")),
  "Pixel Art": ((d) => (((String(d).length > 40) ? "(pixel art), " : "") + (d) + ", best pixel art, neo-geo graphical style, retro nostalgic masterpiece, 128px, 16-bit pixel art " + ((String(d).length < 10) ? ("of "+d) : "") + ", 2D pixel art style, adventure game pixel art, inspired by the art style of hyper light drifter, masterful dithering, superb composition, beautiful palette, exquisite pixel detail")),
  "Professional Photo": ((d) => ((d) + ", sharp focus, depth of field, 8k photo, HDR, professional lighting, taken with Canon EOS R5, DSLR, 75mm lens")),
  "Soft Anime": ((d) => ((d) + ", anime masterpiece with soft lighting, gentle intricate style, highly detailed, pixiv, anime art, 4k, art from your name anime, garden of words style art, high quality.\\n\\nOverall, it's an absolute world-class masterpiece soft beautiful anime-inspired artwork. It's an aesthetically pleasing, soft, beautiful anime art with impeccable attention to detail and beautiful composition.")),
  "Studio Ghibli": ((d) => ("Studio Ghibli style artwork of " + (d) + ", Studio Ghibli style art film still, sharp, very detailed, high resolution, inspired by the style of Hayao Miyazaki, anime, film still from Spirited Away. In the style of Kiki Delivery Service, with a similar art style to Princess Mononoke. Aesthetically similar to My Neighbor Totoro's art style.\\n\\nOverall, it's an absolute world-class masterpiece Studio Ghibli-inspired artwork. It's an aesthetically pleasing classic Studio Ghibli style artwork with impeccable attention to detail and impressive composition.")),
  "Tattoo Design": ((d) => ("amazing tattoo design, " + (d) + ", breathtaking tattoo design, incredible tattoo design")),
  "Tintin Comic": ((d) => ("color comic panel in the style of Hergé about " + (d) + ", in the style of Hergé, tintin style, french comic panel, franco-belgian style, masterpiece, high-resolution Hergé style")),
  "Traditional Japanese": ((d) => ((d) + ", in ukiyo-e art style, traditional japanese masterpiece")),
  "Vintage Anime": ((d) => ((d) + ", 1990s anime, vintage anime, 90's anime style, in the style of hajime sorayama, in the style of greg tocchini, anime masterpiece, pixiv, akira-style art, akira anime art, 4k, high quality.\\n\\nOverall, it's an absolute world-class masterpiece vintage anime artwork. It's an aesthetically pleasing vintage anime artwork with impeccable attention to detail and impressive composition.")),
  "Vintage Comic": ((d) => ("comic book style art of " + (d) + ", drawing, in the style of Dave Stevens, in the style of Adam Hughes, 1940's, 1950's, hand-drawn, color, high resolution, best quality, closeup")),
  "Vintage Pulp Art": ((d) => ("1970s vintage pulp art, " + (d) + ", vintage pulp art, in the style of Earle K. Bergey, in the style of Kelly Freas, in the style of Alex Schomburg, in the style of H. J. Ward, glossy pulp art, Amazing Stories, Weird Tales, 8k, high resolution, best quality")),
  "Waifu": ((d) => ((d) + ", waifu character portrait, 1girl, very high resolution, semi-realistic anime art. Intricate and impressive anime artwork with stunningly beautiful composition and style.\\n\\nOverall, it's an absolute world-class masterpiece anime artwork. It's an aesthetically pleasing waifu artwork with impeccable attention to detail and impressive composition. It's an aesthetically pleasing character portrait. It's an aesthetically pleasing image. It's an aesthetically pleasing image. It's an aesthetically pleasing image. It's an aesthetically pleasing image.")),
  "Watercolor": ((d) => ((d) + ", (watercolor), high resolution, intricate details, 4k, wallpaper, concept art, watercolor on textured paper.\\n\\nOverall, it's an absolute world-class masterpiece watercolor artwork. It's an aesthetically pleasing watercolor artwork with impeccable attention to detail and impressive composition.")),
  "YuGiOh Art": ((d) => ("yugioh card art for " + (d) + ", art in the style of genzoman, in the style of Akina Fujiwara, in the style of rossdraws, yugioh monster, close up, painterly details, breathtaking art, centered, masterpiece, amazing composition, " + ((String(d).length < 30) ? d : "") + ".\\n\\nOverall, it's an absolute world-class masterpiece \"Yu-Gi-Oh!\"-inspired artwork. It's an aesthetically pleasing Yu-Gi-Oh inspired artwork with impeccable attention to detail and impressive composition.")),
};

const NEG_EXTRA = {
  "1920s Photo": "",
  "1930s Photo": "",
  "1940s Photo": "",
  "1950s Photo": "",
  "1960s Photo": "",
  "1970s Photo": "",
  "1980s Photo": "",
  "1990s Photo": "",
  "2D Disney Character": "",
  "2D Pokemon": ", messy, garbled, confusing, incoherent, unclear",
  "3D Disney Character": "",
  "3D Emoji": "",
  "3D Isometric Icon": "",
  "3D Pokemon": "",
  "50s Enamel Sign": "",
  "50s Infomercial Anime": "",
  "Anime": "",
  "Anime Screencap": ", faded, washed out, low quality",
  "Cartoon": "",
  "Casual Photo": "",
  "Cinematic": "",
  "Claymation": "",
  "Concept Art": "",
  "Concept Art Icon": "",
  "Concept Sketch": "",
  "Crayon Drawing": "",
  "Cursed Photo": "",
  "Cute 3D Icon": "",
  "Cute 3D Icon 𝗦𝗲𝘁": "",
  "Cute Anime": "",
  "Cute Figurine": "",
  "Cute Illustration": "",
  "Digital Painting": "",
  "Digital Painting Icon": "",
  "Disney Sketch": "",
  "Drawn Anime": "",
  "Fantasy City Map": "",
  "Fantasy Landscape": "",
  "Fantasy Painting": "",
  "Fantasy Portrait": "",
  "Fantasy World Map": "",
  "Flat Illustration": "",
  "Flat Style Icon": "",
  "Flat Style Logo": "",
  "Franco-Belgian Comic": "",
  "Furry - Cinematic": "",
  "Furry - Drawn": "",
  "Furry - Oil": "",
  "Furry - Painted": "",
  "Game Art Icon": "",
  "Illustration": "",
  "Manga": "",
  "Medieval": "",
  "MTG Card": ", low-quality, deformed, blurry, bad art",
  "Neon Vintage Anime": "",
  "Nihonga Painting": "",
  "No style": "",
  "Oil Painting": "",
  "Oil Painting - 70s Pulp": ", scratches, faded, washed out, grainy, dirty",
  "Oil Painting - Old": "",
  "Oil Painting - Realism": "",
  "Old World Map": "",
  "Painted Anime": "",
  "Painted Pokemon": "",
  "Painterly": "",
  "Pencil": "",
  "Pixel Art": "",
  "Professional Photo": "",
  "Soft Anime": "",
  "Studio Ghibli": "",
  "Tattoo Design": "",
  "Tintin Comic": "",
  "Traditional Japanese": "",
  "Vintage Anime": "",
  "Vintage Comic": "",
  "Vintage Pulp Art": "",
  "Waifu": "",
  "Watercolor": "",
  "YuGiOh Art": "",
};

function buildStyledPrompt(styleName, desc) {
  const fn = BUILDERS[styleName] || BUILDERS["No style"];
  return fn(desc);
}

function buildNegative(styleName, userNeg) {
  const extra = NEG_EXTRA[styleName] ?? "";
  const u = String(userNeg || "").trim();
  if (u && extra) return u + extra;
  if (u) return u;
  return extra.replace(/^,\s*/, "");
}

const fvsStyleSel = $("styleSelect");
for (const n of STYLE_NAMES) {
  const o = document.createElement("option");
  o.value = n;
  o.textContent = n;
  fvsStyleSel.appendChild(o);
}
fvsStyleSel.value = "Anime";

const state = {
  cutout: null, // {dataUrl, img, seed, prompt}
  bg: null,     // {dataUrl, img, prompt}
  bgAvg: null,   // average background colour, for the ambient-match wash
  pFlip: false,  // mirror the single preview / pose character
  pRot: 0,       // ...and rotate it (degrees)
  bgs: [],      // animated background variants (optional), first = still
  cast: [],     // scene cast: {id, label, cutout, x, y, scale, pathA, pathB}
  selId: 0,
  castSeq: 0,
  poses: [],    // {text, dataUrl, img}
  sheet: null,    // {dataUrl, img, seed, prompt} one pose-sheet image
  playing: false,
  playIdx: 0,
  lastTick: 0,
  rafId: 0,
};
const isPoseMode = () => $("modeSelect").value === "poses";
const keptPoses = () => state.poses.filter((p) => p && p.img);

/* ---------- setup (style comes from Faith's own Art Style picker) ---------- */
let statusTimer = 0;
function status(msg, sticky) {
  const el = $("statusEl");
  el.innerHTML = "";
  const span = document.createElement("span");
  span.textContent = msg + " ";
  el.appendChild(span);
  if (sticky) {
    const dots = document.createElement("span");
    dots.className = "fvs-dotsEl";
    el.appendChild(dots);
  }
  el.classList.add("show");
  clearTimeout(statusTimer);
  if (!sticky) statusTimer = setTimeout(() => el.classList.remove("show"), 6000);
}
function loadImg(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// Connected-region fill bucket for removing background patches from generated cutouts.
let eraseActive = false, eraseDrawing = false, eraseOriginal = null, eraseUndoData = null;
function showCutoutEditor(dataUrl, setOriginal = true) {
  const canvas = $("cutPrevImgEl"), tools = $("eraseToolsEl"), hint = $("eraseHintEl");
  if (!canvas) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext("2d");
      canvas.width = img.naturalWidth || 768; canvas.height = img.naturalHeight || 768;
      ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      if (setOriginal) eraseOriginal = canvas.toDataURL("image/png");
      eraseUndoData = null;
      canvas.hidden = false; tools.hidden = false; hint.hidden = false;
      resolve();
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
function erasePoint(e) {
  const canvas = $("cutPrevImgEl"), rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  const x = Math.max(0, Math.min(canvas.width - 1, Math.floor((e.clientX - rect.left) * canvas.width / rect.width)));
  const y = Math.max(0, Math.min(canvas.height - 1, Math.floor((e.clientY - rect.top) * canvas.height / rect.height)));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data, w = canvas.width, h = canvas.height, seed = (y * w + x) * 4;
  if (data[seed + 3] === 0) return false;
  const sr = data[seed], sg = data[seed + 1], sb = data[seed + 2];
  const tolerance = Number($("eraseSizeInput").value) * 2.55;
  const tol2 = tolerance * tolerance;
  const queue = new Int32Array(w * h);
  const seen = new Uint8Array(w * h);
  let head = 0, tail = 0, changed = false;
  const seedPixel = y * w + x; queue[tail++] = seedPixel; seen[seedPixel] = 1;
  while (head < tail) {
    const idx = queue[head++], p = idx * 4;
    if (data[p + 3] === 0) continue;
    const dr = data[p] - sr, dg = data[p + 1] - sg, db = data[p + 2] - sb;
    if (dr * dr + dg * dg + db * db > tol2) continue;
    data[p + 3] = 0; changed = true;
    const px = idx % w, py = (idx / w) | 0;
    const neighbors = [px > 0 ? idx - 1 : -1, px < w - 1 ? idx + 1 : -1, py > 0 ? idx - w : -1, py < h - 1 ? idx + w : -1];
    for (let n = 0; n < 4; n++) { const ni = neighbors[n]; if (ni >= 0 && !seen[ni]) { seen[ni] = 1; queue[tail++] = ni; } }
  }
  if (changed) ctx.putImageData(image, 0, 0);
  return changed;
}
async function commitCutoutEdit() {
  const canvas = $("cutPrevImgEl"); if (!state.cutout || canvas.hidden) return;
  const dataUrl = canvas.toDataURL("image/png");
  state.cutout.dataUrl = dataUrl; state.cutout.img = await loadImg(dataUrl);
  // Cast entries share this cutout object when they originate from the current character.
  for (const c of state.cast) if (c.cutout && c.cutout.prompt === state.cutout.prompt) c.cutout = state.cutout;
  renderCast(); drawStrip(); drawStage();
  $("cutCapEl").textContent = "Cutout cleaned manually — transparent edits are included in exports.";
}
$("eraseToggleBtn").addEventListener("click", () => {
  eraseActive = !eraseActive;
  const b = $("eraseToggleBtn"); b.innerHTML = (eraseActive ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 15 9-9 9 9-5 5H8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m8 10 6 6" stroke="currentColor" stroke-width="1.8"/></svg> Fill bucket: ON' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 15 9-9 9 9-5 5H8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m8 10 6 6" stroke="currentColor" stroke-width="1.8"/></svg> Fill bucket: off');
  b.setAttribute("aria-pressed", eraseActive ? "true" : "false");
  b.style.background = eraseActive ? "#450a0a" : ""; b.style.color = eraseActive ? "#fff" : "";
  $("cutPrevImgEl").style.cursor = eraseActive ? "crosshair" : "default";
});
$("cutPrevImgEl").addEventListener("pointerdown", (e) => {
  if (!eraseActive || !state.cutout) return;
  eraseDrawing = true; eraseUndoData = $("cutPrevImgEl").toDataURL("image/png");
  $("cutPrevImgEl").setPointerCapture(e.pointerId); erasePoint(e); e.preventDefault();
});
$("cutPrevImgEl").addEventListener("pointermove", (e) => { if (eraseDrawing) erasePoint(e); });
$("cutPrevImgEl").addEventListener("pointerup", async () => { if (!eraseDrawing) return; eraseDrawing = false; await commitCutoutEdit(); });
$("cutPrevImgEl").addEventListener("pointercancel", () => { eraseDrawing = false; });
$("eraseUndoBtn").addEventListener("click", async () => {
  if (!eraseUndoData) { status("Nothing to undo yet.", false); return; }
  const restore = eraseUndoData; await showCutoutEditor(restore, false); await commitCutoutEdit(); eraseUndoData = null;
});
$("eraseResetBtn").addEventListener("click", async () => {
  if (!eraseOriginal) { status("Generate a character first.", false); return; }
  const restore = eraseOriginal; await showCutoutEditor(restore, false); await commitCutoutEdit(); eraseUndoData = null;
  status("Restored the original generated cutout.", false);
});


$("fpsInput").addEventListener("input", () => { $("fpsValEl").textContent = $("fpsInput").value; if (typeof renderTimeline === "function" && state.timeline) renderTimeline(); });
$("scaleInput").addEventListener("input", () => { $("scaleValEl").textContent = $("scaleInput").value; drawStage(); drawStrip(); });
$("loopFramesInput").addEventListener("change", () => {
  const n = loopFrames();
  $("loopFramesInput").value = n;
  state.playIdx = 0;
  drawStrip();
  drawStage();
});

/* ---------- one single character picture ---------- */
function basePose() { return $("basePoseInput").value.trim(); }
function cutoutVisual() {
  const char = $("charInput").value.trim();
  const desc = [char, basePose(), "full body, centered, isolated character, plain solid white background, no shadows, no text, no watermark"].filter(Boolean).join(", ");
  return buildStyledPrompt(studioStyle(), desc);
}

async function generateCutout() {
  // Faith's bridge has no background removal: paint on solid white and cut it
  // out here with the sheet pipeline's flood-fill keying.
  const visual = cutoutVisual();
  const painted = await faithGenerateImage(visual, "768x768");
  const keyed = keyCanvasWhite(painted.img);
  cleanupCellEdges(keyed);
  const dataUrl = keyed.toDataURL("image/png");
  return { dataUrl, img: await loadImg(dataUrl), prompt: visual };
}

async function makeCharacter() {
  const char = $("charInput").value.trim();
  if (!char) { status("First tell me what your character looks like.", false); return; }
  $("genCutBtn").disabled = true;
  $("cutLoadEl").hidden = false;
  status("Painting your character…", true);
  try {
    state.cutout = await generateCutout();
    await fvsSaveImageToGallery(state.cutout.dataUrl, "Video Studio character cut-out", state.cutout.prompt || $("charInput").value);
    state.playIdx = 0;
    await showCutoutEditor(state.cutout.dataUrl);
    $("cutCapEl").textContent = "Painted on white, keyed out — ready to animate.";
    drawStrip();
    drawStage();
    status("Character ready — press play below.", false);
  } catch (e) {
    console.warn("cutout failed", e);
    status("Painting failed (" + (e && e.message ? e.message : e) + "). Try ↻ retry.", false);
  } finally {
    $("genCutBtn").disabled = false;
    $("cutLoadEl").hidden = true;
  }
}

$("genCutBtn").addEventListener("click", () => makeCharacter());
$("retryCutBtn").addEventListener("click", () => makeCharacter());
$("newCharBtn").addEventListener("click", () => {
  makeCharacter();
});
$("flipPrevBtn").addEventListener("click", () => {
  state.pFlip = !state.pFlip;
  $("flipPrevBtn").style.fontWeight = state.pFlip ? "700" : "400";
  drawStrip();
  drawStage();
});
$("prevRotInput").addEventListener("input", () => {
  state.pRot = Number($("prevRotInput").value) || 0;
  $("prevRotValEl").textContent = state.pRot + "°";
  drawStrip();
  drawStage();
});

/* ---------- movement: the SAME picture, shifted a little ---------- */
function frameTransform(i, n, preset, strength) {
  const t = n <= 1 ? 0 : i / n; // 0..1 around one loop
  const a = 2 * Math.PI * t;
  const A = strength * 0.9; // px at 768 canvas when strength=100 -> 90px
  switch (preset) {
    case "hop": {
      const h = Math.abs(Math.sin(a));
      return { x: 0, y: -h * A * 1.4, rot: Math.sin(a) * 3 };
    }
    case "sway":
      return { x: Math.sin(a) * A, y: -Math.abs(Math.cos(a)) * A * 0.15, rot: Math.sin(a) * 5 };
    case "float":
      return { x: Math.cos(a) * A * 0.3, y: Math.sin(a) * A * 0.7, rot: Math.sin(a) * 3 };
    case "nod":
      return { x: 0, y: Math.sin(2 * a) * A * 0.15, rot: Math.sin(a) * 7 };
    case "march": {
      const b = Math.abs(Math.sin(2 * a));
      return { x: Math.sin(a) * A * 0.4, y: -b * A * 0.7, rot: Math.sin(2 * a) * 4 };
    }
    case "bob":
    default:
      return { x: 0, y: -Math.sin(a) * A * 0.5 - A * 0.1, rot: 0 };
  }
}
function loopFrames() {
  return Math.max(2, Math.min(8, Number($("loopFramesInput").value) || 4));
}
function motionParams() {
  const n = loopFrames();
  const out = [];
  for (let i = 0; i < n; i++) out.push(frameTransform(i, n, "bob", 45));
  return out;
}

/* ---------- drawing ---------- */
const stage = $("stageCanvasEl");
const sctx = stage.getContext("2d");

function drawChecker(ctx, w, h) {
  const s = 32;
  const dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const light = dark ? "#555" : "#fff";
  const darkC = dark ? "#333" : "#ccc";
  for (let y = 0; y < h; y += s) {
    for (let x = 0; x < w; x += s) {
      ctx.fillStyle = ((x / s + y / s) % 2 === 0) ? light : darkC;
      ctx.fillRect(x, y, s, s);
    }
  }
}
function drawCover(ctx, img, w, h) {
  const ir = img.naturalWidth / img.naturalHeight;
  const cr = w / h;
  let dw, dh;
  if (ir > cr) { dh = h; dw = h * ir; } else { dw = w; dh = w / ir; }
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}
// Same cover-fit for decoded <video> frames (explicit source size).
function drawCoverFit(ctx, src, sw, sh, W, H) {
  const sr = sw / sh, cr = W / H;
  let dw, dh;
  if (sr > cr) { dh = H; dw = H * sr; } else { dw = W; dh = W / sr; }
  ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
}
// Raw scene pieces. composeFrame() below assembles them + post FX — the stage,
// strip and all exports go through it, so effects apply everywhere.
function paintBackgroundOnly(ctx, W, H, idx) {
  const bgs = bgList();
  const bg = bgs.length ? bgs[(((idx || 0) % bgs.length) + bgs.length) % bgs.length] : null;
  if (bg) drawCover(ctx, bg.img, W, H);
  else drawChecker(ctx, W, H);
}
// The one and only way a moves-mode frame is drawn: same cutout + small shift/tilt.
function paintCharWiggle(ctx, W, H, tr) {
  if (!state.cutout) return;
  const img = state.cutout.img;
  const charScale = Number($("scaleInput").value) || 0.85;
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const fit = Math.min(W / iw, H / ih) * charScale;
  const dw = iw * fit, dh = ih * fit;
  const kx = tr.x * (W / 768), ky = (tr.y + 60) * (H / 768);
  ctx.save();
  ctx.translate(W / 2 + kx, H / 2 + ky);
  ctx.rotate((tr.rot * Math.PI) / 180);
  if (state.pRot) ctx.rotate((state.pRot * Math.PI) / 180);
  if (state.pFlip) ctx.scale(-1, 1);
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

$("modeSelect").addEventListener("change", () => {
  const pose = isPoseMode();
  $("movesBox").hidden = pose;
  $("posesBox").hidden = !pose;
  state.playIdx = 0;
  drawStage();
});

function drawStage() {
  const kept = keptPoses();
  if (isPoseMode() && kept.length) {
    const frame = frameAt(state.playIdx);
    blitComposed(sctx, stage.width, stage.height, frame);
    const pidx = kept.indexOf(frame.pose);
    $("stageCapEl").textContent = "Pose " + (pidx + 1) + "/" + kept.length + " · " + frame.pose.text + " · same sheet — identical design";
    drawPathOverlay(sctx, stage.width, stage.height);
    return;
  }
  if (!state.cutout && !state.cast.length) {
    // No character yet — still route through the full pipeline so the
    // display matches what bg-only exports produce (post FX included).
    blitComposed(sctx, stage.width, stage.height, frameAt(state.playIdx));
    $("stageCapEl").textContent = "Make your character first, then press play.";
    return;
  }
  const frame = frameAt(state.playIdx);
  blitComposed(sctx, stage.width, stage.height, frame);
  $("stageCapEl").textContent = "Frame " + (frame.i + 1) + "/" + frame.n + " · same picture, shifted a little.";
  drawPathOverlay(sctx, stage.width, stage.height);
}

function drawStrip() {
  const box = $("stripEl");
  box.innerHTML = "";
  if (!state.cutout) {
    box.innerHTML = '<span class="hintEl">Your frames will appear here after you make your character.</span>';
    return;
  }
  const trs = motionParams();
  for (let i = 0; i < trs.length; i++) {
    const c = document.createElement("canvas");
    c.width = 168; c.height = 168;
    c.getContext("2d").drawImage(composeFrame(168, 168, { kind: "moves", tr: trs[i], i, n: trs.length }), 0, 0);
    box.appendChild(c);
  }
}
drawStrip();
drawStage();

/* ---------- post-processing: blend the cutout into the background ---------- */
// Number parse that keeps real 0s and falls back only on NaN/missing.
function numFx(id, def) {
  const el = $(id);
  if (!el) return def;
  const v = Number(el.value);
  return Number.isFinite(v) ? v : def;
}
// One frame descriptor for everything: {kind:"moves", tr, i, n} or {kind:"pose", pose}.
function frameAt(i) {
  const kept = keptPoses();
  if (isPoseMode() && kept.length) {
    const k = ((i % kept.length) + kept.length) % kept.length;
    return { kind: "pose", pose: kept[k], i, abs: i };
  }
  const trs = motionParams();
  const m = ((i % trs.length) + trs.length) % trs.length;
  return { kind: "moves", tr: trs[m], i: m, n: trs.length, abs: i };
}
function fxOpts() {
  return {
    bloom: Number($("bloomInput").value) || 0,
    ambient: Number($("ambientInput").value) || 0,
    tint: Number($("tintStrengthInput").value) || 0,
    tintColor: $("tintColorInput").value || "#ffb46b",
    warmth: Number($("warmthInput").value) || 0,
    vignette: Number($("vignetteInput").value) || 0,
    sat: numFx("satInput", 100),
    con: numFx("conInput", 100),
    grain: Number($("grainInput").value) || 0,
  };
}
// Average colour of the background, for the ambient-match wash.
function bgAverage(img) {
  const c = document.createElement("canvas");
  c.width = 32; c.height = 32;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(img, 0, 0, 32, 32);
  const d = x.getImageData(0, 0, 32, 32).data;
  let r = 0, g = 0, b = 0;
  const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}
// Grade the character layer alone: hand-picked tint, then a wash of the
// background's own average light so both sides of the composite share it.
function gradeCharacter(cc, W, H, o) {
  if (o.tint > 0) {
    cc.save();
    cc.globalCompositeOperation = "multiply";
    cc.globalAlpha = (o.tint / 100) * 0.7;
    cc.fillStyle = o.tintColor;
    cc.fillRect(0, 0, W, H);
    cc.restore();
  }
  if (o.ambient > 0 && state.bgAvg) {
    cc.save();
    cc.globalCompositeOperation = "overlay";
    cc.globalAlpha = (o.ambient / 100) * 0.55;
    const a = state.bgAvg;
    cc.fillStyle = "rgb(" + a.r + "," + a.g + "," + a.b + ")";
    cc.fillRect(0, 0, W, H);
    cc.restore();
  }
}
// Grade the finished composite: warm/cool, bloom, vignette.
function gradeScene(canvas, o) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext("2d");
  if ((o.sat !== 100 || o.con !== 100) && "filter" in ctx) {
    const t = document.createElement("canvas");
    t.width = W; t.height = H;
    const tx = t.getContext("2d");
    tx.filter = "saturate(" + (o.sat / 100) + ") contrast(" + (o.con / 100) + ")";
    tx.drawImage(canvas, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(t, 0, 0);
  }
  if (o.warmth !== 0) {
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = (Math.abs(o.warmth) / 100) * 0.5;
    ctx.fillStyle = o.warmth > 0 ? "#ff9a3c" : "#3c7bff";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (o.bloom > 0) {
    const sw = Math.max(48, W >> 2), sh = Math.max(48, H >> 2);
    const sc = document.createElement("canvas");
    sc.width = sw; sc.height = sh;
    const sx = sc.getContext("2d");
    if ("filter" in sx) sx.filter = "blur(" + (2 + (o.bloom / 100) * 8).toFixed(1) + "px) brightness(1.15) saturate(1.3)";
    sx.drawImage(canvas, 0, 0, sw, sh);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = (o.bloom / 100) * 0.5;
    ctx.drawImage(sc, 0, 0, W, H);
    ctx.restore();
  }
  if (o.vignette > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0," + ((o.vignette / 100) * 0.5).toFixed(3) + ")");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  if (o.grain > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = (o.grain / 100) * 0.35;
    const ox = (Math.random() * 128) | 0, oy = (Math.random() * 128) | 0;
    ctx.translate(-ox, -oy);
    ctx.fillStyle = ctx.createPattern(noiseTile(), "repeat");
    ctx.fillRect(0, 0, W + 128, H + 128);
    ctx.restore();
  }
}
let _noiseTile = null;
function noiseTile() {
  if (_noiseTile) return _noiseTile;
  const c = document.createElement("canvas");
  c.width = 128; c.height = 128;
  const x = c.getContext("2d");
  const d = x.createImageData(128, 128);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = 255;
  }
  x.putImageData(d, 0, 0);
  _noiseTile = c;
  return c;
}
// The single choke point: background + graded character(s) + scene grade.
function composeFrame(W, H, frame) {
  const o = fxOpts();
  const absI = frame.abs != null ? frame.abs : (frame.i || 0);
  const out = document.createElement("canvas");
  out.width = W; out.height = H;
  const oc = out.getContext("2d");
  paintBackgroundOnly(oc, W, H, frame.i);
  if (frame.kind === "pose" || state.cast.length === 0) {
    const charC = document.createElement("canvas");
    charC.width = W; charC.height = H;
    const cc = charC.getContext("2d");
    if (frame.kind === "pose") paintCharPose(cc, W, H, frame.pose);
    else paintCharWiggle(cc, W, H, frame.tr);
    gradeCharacter(cc, W, H, o);
    oc.drawImage(charC, 0, 0);
  }
  for (const c of state.cast) {
    if (c.hidden) continue; // 👁 hidden takes stay out of the scene + every export
    if (!c.cutout || !c.cutout.img) continue;
    const castC = document.createElement("canvas");
    castC.width = W; castC.height = H;
    paintCastMember(castC.getContext("2d"), W, H, c, absI);
    gradeCharacter(castC.getContext("2d"), W, H, o);
    oc.drawImage(castC, 0, 0);
  }
  gradeScene(out, o);
  return out;
}
// Where a cast member stands right now (path ping-pong included), in pixels.
function castPos(c, W, H, absI) {
  let fx = c.x, fy = c.y;
  if (c.pathA && c.pathB) {
    const N = stageFrameCount() || 1;
    const u = (((absI % N) + N) % N) / N;
    const t = u < 0.5 ? u * 2 : 2 - u * 2;
    fx = c.pathA.x + (c.pathB.x - c.pathA.x) * t;
    fy = c.pathA.y + (c.pathB.y - c.pathA.y) * t;
  }
  return { x: fx * W, y: fy * H + 60 * (H / 768) };
}
function castWiggle(c, W, H, absI) {
  if (!c.preset || c.preset === "none") return { dx: 0, dy: 0, rot: 0 };
  const n = castFrames(c);
  const t = frameTransform(absI + ((c.offset || 0) / 100) * n, n, c.preset, c.strength != null ? c.strength : 45);
  return { dx: t.x * (W / 768), dy: t.y * (H / 768), rot: t.rot };
}
function castFrames(c) {
  return Math.max(2, Math.min(8, c.frames || loopFrames()));
}
function paintCastMember(ctx, W, H, c, absI) {
  const img = c.cutout.img;
  const fit = Math.min(W / img.naturalWidth, H / img.naturalHeight) * (c.scale || 0.85);
  const dw = img.naturalWidth * fit, dh = img.naturalHeight * fit;
  const p = castPos(c, W, H, absI);
  const w = castWiggle(c, W, H, absI);
  ctx.save();
  ctx.translate(p.x + w.dx, p.y + w.dy);
  ctx.rotate((w.rot * Math.PI) / 180);
  if (c.rot) ctx.rotate((c.rot * Math.PI) / 180);
  if (c.flip) ctx.scale(-1, 1);
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}
const CAST_PRESETS = { none: "still", bob: "bobbing", hop: "hopping", sway: "swaying", float: "floating", nod: "nodding", march: "marching" };
function castLabel(c) {
  return c.label + (c.pathA && c.pathB ? " ●→●" : "") + (c.preset && c.preset !== "none" ? " · " + (CAST_PRESETS[c.preset] || c.preset) : "");
}
function castRect(c, W, H, absI) {
  const img = c.cutout.img;
  const fit = Math.min(W / img.naturalWidth, H / img.naturalHeight) * (c.scale || 0.85);
  const dw = img.naturalWidth * fit, dh = img.naturalHeight * fit;
  const p = castPos(c, W, H, absI);
  const w = castWiggle(c, W, H, absI);
  const total = (((c.rot || 0) + (w.rot || 0)) * Math.PI) / 180;
  const co = Math.abs(Math.cos(total)), si = Math.abs(Math.sin(total));
  const bw = dw * co + dh * si, bh = dw * si + dh * co;
  return { x: p.x + w.dx - bw / 2, y: p.y + w.dy - bh / 2, w: bw, h: bh };
}
function blitComposed(ctx, W, H, frame) {
  const f = composeFrame(W, H, frame);
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(f, 0, 0);
}

const FX_DEFAULTS = { bloomInput: 30, ambientInput: 35, tintStrengthInput: 0, tintColorInput: "#ffb46b", warmthInput: 0, vignetteInput: 20, satInput: 100, conInput: 100, grainInput: 0 };
for (const [id, val] of [["bloomInput", "bloomValEl"], ["ambientInput", "ambientValEl"], ["tintStrengthInput", "tintValEl"], ["warmthInput", "warmthValEl"], ["vignetteInput", "vignetteValEl"], ["satInput", "satValEl"], ["conInput", "conValEl"], ["grainInput", "grainValEl"]]) {
  $(id).addEventListener("input", () => { $(val).textContent = $(id).value; drawStrip(); drawStage(); });
}
$("tintColorInput").addEventListener("input", () => { drawStrip(); drawStage(); });
$("fxResetBtn").addEventListener("click", () => {
  for (const [id, def] of Object.entries(FX_DEFAULTS)) $(id).value = def;
  $("bloomValEl").textContent = "30";
  $("ambientValEl").textContent = "35";
  $("tintValEl").textContent = "0";
  $("warmthValEl").textContent = "0";
  $("vignetteValEl").textContent = "20";
  $("satValEl").textContent = "100";
  $("conValEl").textContent = "100";
  $("grainValEl").textContent = "0";
  drawStrip();
  drawStage();
  status("Effects reset.", false);
});

/* ---------- scene cast: multiple characters, drag, A → B paths ---------- */
function selCast() {
  return state.cast.find((m) => m.id === state.selId) || null;
}
function selectCast(id) {
  state.selId = id || 0;
  renderCast();
  updateSelCap();
  drawStage();
}
function updateSelCap() {
  const c = selCast();
  if (!c) { $("selCapEl").textContent = "No character selected — click one on the stage or in the scene list."; return; }
  const path = (c.pathA && c.pathB) ? "path A → B set" : "no path (stands still)";
  const moves = c.preset && c.preset !== "none" ? "moves: " + (CAST_PRESETS[c.preset] || c.preset) : "no idle movement";
  $("selCapEl").textContent = "Selected: " + c.label + (c.hidden ? " (hidden)" : "") + " · " + path + " · " + moves + " · drag it on the stage to move it.";
  updateCastInspector();
}
function updateCastInspector() {
  const c = selCast();
  const dis = !c;
  $("castPresetSelect").disabled = dis;
  $("castStrengthInput").disabled = dis;
  $("castOffsetInput").disabled = dis;
  $("castRotInput").disabled = dis;
  $("castFlipBtn").disabled = dis;
  if (!c) return;
  $("castPresetSelect").value = c.preset || "none";
  $("castStrengthInput").value = c.strength != null ? c.strength : 45;
  $("castStrengthValEl").textContent = $("castStrengthInput").value;
  $("castOffsetInput").value = c.offset || 0;
  $("castOffsetValEl").textContent = ($("castOffsetInput").value) + "%";
  $("castRotInput").value = c.rot || 0;
  $("castRotValEl").textContent = ($("castRotInput").value) + "°";
  $("castFlipBtn").style.fontWeight = c.flip ? "700" : "400";
}
$("castPresetSelect").addEventListener("change", () => {
  const c = selCast();
  if (!c) return;
  c.preset = $("castPresetSelect").value;
  renderCast();
  updateSelCap();
  drawStage();
});
$("castStrengthInput").addEventListener("input", () => {
  const c = selCast();
  if (!c) return;
  c.strength = Number($("castStrengthInput").value);
  $("castStrengthValEl").textContent = $("castStrengthInput").value;
  drawStage();
});
$("castOffsetInput").addEventListener("input", () => {
  const c = selCast();
  if (!c) return;
  c.offset = Number($("castOffsetInput").value);
  $("castOffsetValEl").textContent = ($("castOffsetInput").value) + "%";
  drawStage();
});
$("castRotInput").addEventListener("input", () => {
  const c = selCast();
  if (!c) return;
  c.rot = Number($("castRotInput").value) || 0;
  $("castRotValEl").textContent = ($("castRotInput").value) + "°";
  drawStage();
});
$("castFlipBtn").addEventListener("click", () => {
  const c = selCast();
  if (!c) return;
  c.flip = !c.flip;
  $("castFlipBtn").style.fontWeight = c.flip ? "700" : "400";
  renderCast();
  drawStage();
});
const EYE_OPEN = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
function renderCast() {
  const box = $("castEl");
  box.innerHTML = "";
  state.cast.forEach((c, k) => {
    const card = document.createElement("div");
    card.style.cssText = "border:2px solid " + (c.id === state.selId ? "#22cc55" : "rgba(128,128,128,.4)") + ";border-radius:8px;padding:6px;width:132px;font-size:0.75rem;display:flex;flex-direction:column;gap:4px;cursor:pointer;background:rgba(128,128,128,.06);opacity:" + (c.hidden ? "0.55" : "1");
    const img = document.createElement("img");
    img.src = c.cutout.dataUrl;
    img.alt = c.label;
    img.style.cssText = "width:100%;aspect-ratio:1;object-fit:contain;border-radius:4px;background-image:conic-gradient(#ccc 0 25%, #fff 0 50%, #ccc 0 75%, #fff 0);background-size:20px 20px" + (c.hidden ? ";filter:grayscale(1)" : "");
    const lab = document.createElement("div");
    lab.innerHTML = "";
    const b = document.createElement("b");
    b.textContent = castLabel(c) + (c.hidden ? " (hidden)" : "");
    lab.appendChild(b);
    const psel = document.createElement("select");
    psel.title = "Idle movement for this character";
    psel.style.cssText = "flex:1;min-width:0;font-size:0.72rem;border-radius:4px;border:1px solid rgba(128,128,128,.5);padding:2px";
    for (const [v, t] of [["none", "still"], ["bob", "bob"], ["hop", "hop"], ["sway", "sway"], ["float", "float"], ["nod", "nod"], ["march", "march"]]) {
      const o = document.createElement("option");
      o.value = v; o.textContent = t;
      psel.appendChild(o);
    }
    psel.value = c.preset || "none";
    psel.addEventListener("change", () => {
      c.preset = psel.value;
      b.textContent = castLabel(c);
      updateSelCap();
      drawStage();
    });
    psel.addEventListener("click", (e) => e.stopPropagation());
    const mrow = document.createElement("div");
    mrow.style.cssText = "display:flex;gap:4px";
    const fr = document.createElement("input");
    fr.type = "number"; fr.min = "2"; fr.max = "8";
    fr.value = Math.max(2, Math.min(8, c.frames || loopFrames()));
    fr.title = "Frames for this character's move loop";
    fr.style.cssText = "width:46px;border-radius:4px;border:1px solid rgba(128,128,128,.5);padding:2px;font-size:0.75rem";
    fr.addEventListener("change", () => {
      c.frames = Math.max(2, Math.min(8, Number(fr.value) || loopFrames()));
      fr.value = c.frames;
      state.playIdx = 0;
      drawStage();
      drawStrip();
    });
    fr.addEventListener("click", (e) => e.stopPropagation());
    mrow.appendChild(psel); mrow.appendChild(fr);
    const sc = document.createElement("input");
    sc.type = "range"; sc.min = "0.3"; sc.max = "1.2"; sc.step = "0.05"; sc.value = c.scale || 0.85;
    sc.title = "Size";
    sc.addEventListener("input", () => { c.scale = Number(sc.value); drawStage(); });
    sc.addEventListener("click", (e) => e.stopPropagation());
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:4px";
    const eye = document.createElement("button");
    eye.type = "button";
    eye.innerHTML = c.hidden ? EYE_OFF : EYE_OPEN;
    eye.title = c.hidden ? "Show in scene & exports" : "Hide from scene & exports";
    eye.setAttribute("aria-label", eye.title);
    eye.style.cssText = "flex:1;padding:2px 0;font-size:0.75rem;display:flex;align-items:center;justify-content:center";
    const fl = document.createElement("button");
    fl.type = "button"; fl.textContent = "⇋"; fl.title = "Mirror left-right";
    fl.style.cssText = "flex:1;padding:2px 0;font-size:0.75rem;font-weight:" + (c.flip ? "700" : "400");
    const up = document.createElement("button");
    up.type = "button"; up.textContent = "◀"; up.title = "Move back a layer";
    up.style.cssText = "flex:1;padding:2px 0;font-size:0.75rem";
    const dn = document.createElement("button");
    dn.type = "button"; dn.textContent = "▶"; dn.title = "Move forward a layer";
    dn.style.cssText = "flex:1;padding:2px 0;font-size:0.75rem";
    const del = document.createElement("button");
    del.type = "button"; del.textContent = "✕"; del.title = "Remove from scene";
    del.style.cssText = "flex:1;padding:2px 0;font-size:0.75rem";
    up.addEventListener("click", (e) => { e.stopPropagation(); if (k > 0) { state.cast.splice(k, 1); state.cast.splice(k - 1, 0, c); renderCast(); drawStage(); } });
    dn.addEventListener("click", (e) => { e.stopPropagation(); if (k < state.cast.length - 1) { state.cast.splice(k, 1); state.cast.splice(k + 1, 0, c); renderCast(); drawStage(); } });
    fl.addEventListener("click", (e) => {
      e.stopPropagation();
      c.flip = !c.flip;
      fl.style.fontWeight = c.flip ? "700" : "400";
      if (state.selId === c.id) updateCastInspector();
      drawStage();
    });
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      state.cast = state.cast.filter((m) => m.id !== c.id);
      if (state.selId === c.id) state.selId = 0;
      renderCast(); updateSelCap(); drawStrip(); drawStage();
      $("castCapEl").textContent = state.cast.length ? state.cast.length + " in the scene." : "Scene empty — stage shows the current character again.";
    });
    eye.addEventListener("click", (e) => {
      e.stopPropagation();
      c.hidden = !c.hidden;
      renderCast(); updateSelCap(); drawStage();
      status(c.label + (c.hidden ? " hidden — stage & exports skip it." : " visible again."), false);
    });
    card.appendChild(img); card.appendChild(lab); card.appendChild(mrow); card.appendChild(sc); card.appendChild(row);
    row.appendChild(eye); row.appendChild(fl); row.appendChild(up); row.appendChild(dn); row.appendChild(del);
    card.addEventListener("click", () => selectCast(c.id));
    box.appendChild(card);
  });
  $("castCapEl").textContent = state.cast.length ? state.cast.length + " in the scene — the stage shows the cast." : "";
}
$("castAddBtn").addEventListener("click", () => {
  if (!state.cutout || !state.cutout.img) { status("Make your character first, then add it.", false); return; }
  state.castSeq++;
  const n = state.cast.length;
  const spots = [0.5, 0.28, 0.72, 0.38, 0.62];
  state.cast.push({
    id: state.castSeq,
    label: "Character " + state.castSeq,
    cutout: state.cutout,
    x: spots[n % spots.length],
    y: 0.5,
    scale: Number($("scaleInput").value) || 0.85,
    pathA: null,
    pathB: null,
    preset: "none",
    strength: 45,
    offset: (n * 29) % 100,
    flip: false,
    rot: 0,
    frames: loopFrames(),
    hidden: false, // 👁 eye toggle: hidden takes sit out of stage + exports
  });
  state.selId = state.castSeq;
  renderCast();
  updateSelCap();
  drawStrip();
  drawStage();
  status(state.cast[state.cast.length - 1].label + " added — drag it on the stage.", false);
});

// Green transition line for the selected character (stage display only).
function drawPathOverlay(ctx, W, H) {
  const c = selCast();
  if (!c || c.hidden || !c.pathA || !c.pathB) return;
  const ax = c.pathA.x * W, ay = c.pathA.y * H + 60 * (H / 768);
  const bx = c.pathB.x * W, by = c.pathB.y * H + 60 * (H / 768);
  ctx.save();
  ctx.strokeStyle = "#22cc55";
  ctx.lineWidth = Math.max(2, W / 256);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.font = "bold " + Math.max(10, W / 48) + "px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const [x, y, t] of [[ax, ay, "A"], [bx, by, "B"]]) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(7, W / 96), 0, 7);
    ctx.fillStyle = "#22cc55";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.fillText(t, x, y);
  }
  ctx.restore();
}

let pathArm = null; // "A" | "B" | null
function armPath(which) {
  const c = selCast();
  if (!c) { status("Add a character to the scene and select it first.", false); return; }
  pathArm = which;
  $("stageCanvasEl").style.cursor = "crosshair";
  status("Click on the stage to place point " + which + " for " + c.label + ".", false);
}
$("setABtn").addEventListener("click", () => armPath("A"));
$("setBBtn").addEventListener("click", () => armPath("B"));
$("clearPathBtn").addEventListener("click", () => {
  const c = selCast();
  if (!c) { status("Select a character first.", false); return; }
  c.pathA = c.pathB = null;
  renderCast();
  updateSelCap();
  drawStage();
  status("Path cleared for " + c.label + ".", false);
});

/* stage dragging */
const stageEl = $("stageCanvasEl");
let castDrag = null;
function stageFrac(e) {
  const r = stageEl.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
}
function pickCast(p) {
  const W = stageEl.width, H = stageEl.height;
  for (let k = state.cast.length - 1; k >= 0; k--) {
    const c = state.cast[k];
    if (c.hidden) continue;
    if (!c.cutout || !c.cutout.img) continue;
    const r = castRect(c, W, H, state.playIdx);
    const px = p.x * W, py = p.y * H;
    if (px >= r.x - 6 && px <= r.x + r.w + 6 && py >= r.y - 6 && py <= r.y + r.h + 6) return c;
  }
  return null;
}
stageEl.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  const p = stageFrac(e);
  if (pathArm) {
    const c = selCast();
    if (c) {
      const q = {
        x: Math.min(1.25, Math.max(-0.25, p.x)),
        y: Math.min(1.25, Math.max(-0.25, p.y - 60 / 768)),
      };
      if (pathArm === "A") c.pathA = q; else c.pathB = q;
      status("Point " + pathArm + " set for " + c.label + " — " + (c.pathA && c.pathB ? "green line shows the A → B path." : "now set the other point."), false);
      pathArm = null;
      stageEl.style.cursor = "";
      renderCast();
      updateSelCap();
      drawStage();
    }
    return;
  }
  const hit = pickCast(p);
  if (hit) {
    selectCast(hit.id);
    castDrag = { id: hit.id, dx: hit.x - p.x, dy: hit.y - p.y };
    try { stageEl.setPointerCapture(e.pointerId); } catch (err) {}
  } else selectCast(null);
});
stageEl.addEventListener("pointermove", (e) => {
  if (!castDrag) return;
  const c = state.cast.find((m) => m.id === castDrag.id);
  if (!c) { castDrag = null; return; }
  const p = stageFrac(e);
  c.x = Math.min(1.25, Math.max(-0.25, p.x + castDrag.dx));
  c.y = Math.min(1.25, Math.max(-0.25, p.y + castDrag.dy));
  drawStage();
});
stageEl.addEventListener("pointerup", () => { castDrag = null; });
stageEl.addEventListener("pointercancel", () => { castDrag = null; });

updateSelCap();

/* playback */
const PLAY_ICON = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/></svg>';
function setPlayBtn() {
  $("playBtn").innerHTML = (state.playing ? PAUSE_ICON + "<span>pause</span>" : PLAY_ICON + "<span>play</span>");
}
function tick(t) {
  if (!state.playing) return;
  const fps = Math.max(1, Number($("fpsInput").value) || 5);
  if (t - state.lastTick >= 1000 / fps) {
    state.playIdx++;
    state.lastTick = t;
    drawStage();
  }
  state.rafId = requestAnimationFrame(tick);
}
$("playBtn").addEventListener("click", () => {
  if (!state.cutout && !(isPoseMode() && keptPoses().length) && bgList().length < 2 && !state.cast.length) { status("Make your character first.", false); return; }
  state.playing = !state.playing;
  setPlayBtn();
  if (state.playing) {
    state.lastTick = performance.now();
    state.rafId = requestAnimationFrame(tick);
  } else {
    cancelAnimationFrame(state.rafId);
    drawStage();
  }
});

function bgList() {
  if ($("bgAnimCheck").checked && state.bgs.length > 1) return state.bgs;
  return state.bg ? [state.bg] : [];
}
function stageFrameCount() {
  const kept = keptPoses();
  let charN = (isPoseMode() && kept.length) ? kept.length : loopFrames();
  for (const c of state.cast) {
    if (c.hidden) continue;
    const f = castFrames(c);
    charN = (charN * f) / gcd2(charN, f);
  }
  const bgN = Math.max(1, bgList().length);
  return Math.min(48, (charN * bgN) / gcd2(charN, bgN));
}
function gcd2(a, b) { return b ? gcd2(b, a % b) : a; }

/* ---------- background (still or animated variants) ---------- */
const BG_VARIETIES = [
  "the same scene a moment later, clouds rearranged and drifting to new positions across the sky",
  "the same scene a moment later, sunlight flaring brighter, warm glow blooming over the land",
  "the same scene a moment later, breeze sweeping through, grass and leaves leaning, shadows shifted",
  "the same scene a moment later, mist curling through, lights glowing, dreamy haze",
];
const BG_MILD = "the same scene, nearly identical, only the light shimmering faintly";
// Structural similarity at postage-stamp size: layout drift survives the
// downscale, cloud shimmer does not. 1 = identical, ~0.9 = same scene,
// well under 0.8 = recomposed.
function tiny24(img) {
  const c = document.createElement("canvas");
  c.width = 24; c.height = 24;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(img, 0, 0, 24, 24);
  return x.getImageData(0, 0, 24, 24).data;
}
function structSim(baseData, img) {
  const d = tiny24(img);
  let diff = 0;
  for (let i = 0; i < d.length; i += 4) {
    diff += Math.abs(d[i] - baseData[i]) + Math.abs(d[i + 1] - baseData[i + 1]) + Math.abs(d[i + 2] - baseData[i + 2]);
  }
  return 1 - diff / (24 * 24 * 3 * 255);
}
async function genBgVariant(bit) {
  const prompt = buildStyledPrompt(studioStyle(), bit);
  const painted = await faithGenerateImage(prompt, "768x768");
  return { dataUrl: painted.dataUrl, img: painted.img, prompt };
}
function renderBgStrip() {
  const list = state.bgs;
  const strip = $("bgStripEl");
  strip.innerHTML = "";
  list.forEach((b, i) => {
    const t = document.createElement("img");
    t.src = b.dataUrl;
    t.alt = "background variant " + (i + 1);
    t.title = (list.length > 1 ? "Variant " + (i + 1) + (b.sim != null && i > 0 ? " (match " + b.sim.toFixed(2) + ")" : "") + " — click to use as the still" : "Background — click to preview");
    t.style.cssText = "width:84px;height:84px;border-radius:6px;border:2px solid " + (b === state.bg ? "#2b7de9" : "rgba(128,128,128,.4)") + ";cursor:pointer;object-fit:cover";
    t.addEventListener("click", () => {
      state.bg = b;
      state.bgAvg = bgAverage(b.img);
      [...strip.children].forEach((el, j) => { el.style.borderColor = list[j] === state.bg ? "#2b7de9" : "rgba(128,128,128,.4)"; });
      $("bgPrevImgEl").src = b.dataUrl;
      drawStrip();
      drawStage();
      status("Using variant " + (i + 1) + " as the still background.", false);
    });
    strip.appendChild(t);
  });
}
$("bgAnimCheck").addEventListener("change", () => { state.playIdx = 0; drawStrip(); drawStage(); });
$("genBgBtn").addEventListener("click", async () => {
  const scene = $("bgPromptInput").value.trim();
  if (!scene) { status("Tell me where your character is first.", false); return; }
  const animated = $("bgAnimCheck").checked;
  const count = animated ? Math.max(2, Math.min(4, Number($("bgCountSelect").value) || 2)) : 1;
  const btn = $("genBgBtn");
  btn.disabled = true;
  $("bgLoadEl").hidden = false;
  try {
    const strict = $("bgStrictCheck").checked;
    const list = [];
    let baseTiny = null;
    const notes = [];
    for (let i = 0; i < count; i++) {
      if (count > 1) status("Painting background " + (i + 1) + "/" + count + "…", true);
      else status("Painting background…", true);
      const bit = i === 0 ? scene : scene + ", " + BG_VARIETIES[(i - 1) % BG_VARIETIES.length];
      let v = await genBgVariant(bit);
      if (i === 0) {
        baseTiny = tiny24(v.img);
        v.sim = 1;
      } else if (strict) {
        v.sim = structSim(baseTiny, v.img);
        if (v.sim < 0.8) {
          status("Variant " + (i + 1) + " drifted (" + v.sim.toFixed(2) + ") — retrying milder…", true);
          const m = await genBgVariant(scene + ", " + BG_MILD);
          m.sim = structSim(baseTiny, m.img);
          if (m.sim >= v.sim) { v = m; notes.push("variant " + (i + 1) + " needed a milder take (" + v.sim.toFixed(2) + ")"); }
          else notes.push("variant " + (i + 1) + " kept at " + v.sim.toFixed(2));
        }
      }
      list.push(v);
    }
    state.bgs = list;
    state.bg = list[0];
    for (let i = 0; i < list.length; i++) await fvsSaveImageToGallery(list[i].dataUrl, "Video Studio background " + (i + 1), list[i].prompt || scene);
    const mean = (a) => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
    const avgs = list.map((b) => bgAverage(b.img));
    state.bgAvg = { r: mean(avgs.map((a) => a.r)), g: mean(avgs.map((a) => a.g)), b: mean(avgs.map((a) => a.b)) };
    const prev = $("bgPrevImgEl");
    prev.src = list[0].dataUrl;
    prev.hidden = false;
    renderBgStrip();
    state.playIdx = 0;
    drawStrip();
    drawStage();
    const doneMsg = count > 1 ? "Background ready — " + count + " variants, cycling on the stage." + (notes.length ? " " + notes.join("; ") + "." : "") : "Background ready.";
    status(doneMsg, false);
  } catch (e) {
    console.warn("bg failed", e);
    status("Background failed (" + (e && e.message ? e.message : e) + ").", false);
  } finally {
    btn.disabled = false;
    $("bgLoadEl").hidden = true;
  }
});

/* ---------- save ---------- */
async function fvsSaveImageToGallery(dataUrl, title, prompt) {
  if (!dataUrl || !/^data:image\//i.test(dataUrl)) return null;
  try {
    const response = await fetch("/api/gallery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: dataUrl, title: String(title || "Video Studio image").slice(0, 100), prompt: String(prompt || title || "Created in Video Studio").slice(0, 500), filename: String(title || "faith-studio-image").replace(/[^a-z0-9_.-]+/gi, "-").slice(0, 100) + ".png" }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Gallery save failed");
    if (typeof window.faithLoadServerGallery === "function") window.faithLoadServerGallery();
    // faithLoadServerGallery is a classic-script function; this fallback dispatches
    // a lightweight signal for any future gallery listener.
    window.dispatchEvent(new CustomEvent("faith-gallery-updated", { detail: result.entry || null }));
    return result.entry || null;
  } catch (error) { console.warn("Video Studio image could not be saved to Gallery", error); status("Image created, but Gallery save failed: " + error.message, false); return null; }
}
async function fvsSaveCompletedVideo(blob, filename) {
  if (!(blob instanceof Blob) || !blob.size) throw new Error("The completed video file is empty.");
  const response = await fetch("/api/videos?name=" + encodeURIComponent(filename), { method: "POST", headers: { "Content-Type": "video/mp4", "X-Faith-Video-Name": filename }, body: blob });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(result.error || "Could not save completed video to the videos folder.");
  if (typeof window.faithLoadVideoLibrary === "function") window.faithLoadVideoLibrary();
  return result.entry;
}
function downloadUrl(url, name) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function renderFrame(i, W, H) {
  return composeFrame(W, H, frameAt(i));
}
let lastMp4Url = null;

$("mp4Btn").addEventListener("click", async () => {
  if (!state.cutout && !(isPoseMode() && keptPoses().length) && bgList().length < 2 && !state.cast.length) { status("Make your character first.", false); return; }
  const btn = $("mp4Btn");
  btn.disabled = true;
  status("Encoding your MP4…", true);
  try {
    if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") {
      throw new Error("this browser can't encode MP4 (no WebCodecs)");
    }
    const { Output, Mp4OutputFormat, BufferTarget, EncodedVideoPacketSource, EncodedPacket } = await import("https://esm.sh/mediabunny@1");
    const fps = Math.max(1, Number($("fpsInput").value) || 5);
    const N = stageFrameCount();
    const loopDur = N / fps;
    let cycles = Math.max(1, Math.min(12, Math.ceil(8 / loopDur)));
    while (N * cycles > 160 && cycles > 1) cycles--;
    const total = N * cycles;
    let codec = null;
    for (const c of ["avc1.42001F", "avc1.42001E", "avc1.640028", "avc1.64001F"]) {
      try {
        const r = await VideoEncoder.isConfigSupported({ codec: c, width: 768, height: 768, bitrate: 8_000_000, framerate: fps });
        if (r.supported) { codec = c; break; }
      } catch (e) { /* try next */ }
    }
    if (!codec) throw new Error("no supported H.264 profile in this browser");
    const W = 768, H = 768;
    const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
    const source = new EncodedVideoPacketSource("avc");
    output.addVideoTrack(source, { width: W, height: H, frameRate: fps });
    await output.start();
    let encErr = null;
    const enc = new VideoEncoder({
      output: (chunk, meta) => { try { source.add(EncodedPacket.fromEncodedChunk(chunk), meta); } catch (e) { encErr = encErr || e; } },
      error: (e) => { encErr = encErr || e; },
    });
    enc.configure({ codec, width: W, height: H, bitrate: 8_000_000, framerate: fps });
    const paint = document.createElement("canvas");
    paint.width = W; paint.height = H;
    const px = paint.getContext("2d");
    for (let i = 0; i < total; i++) {
      px.clearRect(0, 0, W, H);
      px.drawImage(renderFrame(i, W, H), 0, 0);
      if (i % 20 === 0) status("Encoding your MP4… frame " + (i + 1) + "/" + total, true);
      const vf = new VideoFrame(paint, { timestamp: (i * 1e6) / fps, duration: 1e6 / fps });
      enc.encode(vf, { keyFrame: i % Math.max(1, fps * 2) === 0 });
      vf.close();
      if (i % 30 === 29) await enc.flush();
    }
    await enc.flush();
    if (encErr) throw encErr;
    source.close();
    await output.finalize();
    const blob = new Blob([output.target.buffer], { type: "video/mp4" });
    await fvsSaveCompletedVideo(blob, "cutout-anim.mp4");
    const url = URL.createObjectURL(blob);
    downloadUrl(url, "cutout-anim.mp4");
    if (lastMp4Url) { try { URL.revokeObjectURL(lastMp4Url); } catch (e) { /* noop */ } }
    lastMp4Url = url;
    const prev = $("mp4PrevEl");
    if (prev) {
      prev.src = url;
      prev.hidden = false;
      prev.loop = true; // endless play on by default
      prev.muted = true;
      try { await prev.play(); } catch (e) { /* autoplay blocked, controls still allow play */ }
    }
    status("Video saved (" + (total / fps).toFixed(1) + "s, " + cycles + " seamless loop" + (cycles > 1 ? "s" : "") + " — repeat 🔁 on, plays endlessly · 768×768).", false);
  } catch (e) {
    console.warn("mp4 failed", e);
    status("Video failed (" + (e && e.message ? e.message : e) + ").", false);
  } finally {
    btn.disabled = false;
  }
});

$("zipBtn").addEventListener("click", async () => {
  if (!state.cutout && !(isPoseMode() && keptPoses().length) && bgList().length < 2 && !state.cast.length) { status("Make your character first.", false); return; }
  const btn = $("zipBtn");
  btn.disabled = true;
  status("Packing your pictures…", true);
  try {
    const { default: JSZip } = await import("https://esm.sh/jszip@3.10.1");
    const zip = new JSZip();
    if (state.cutout) zip.file("character-cutout.png", await fetch(state.cutout.dataUrl).then((r) => r.blob()));
    const n = stageFrameCount();
    for (let i = 0; i < n; i++) {
      const blob = await new Promise((res) => renderFrame(i, 768, 768).toBlob(res, "image/png"));
      zip.file("frame-" + (i + 1) + ".png", blob);
    }
    const kept = keptPoses();
    for (let i = 0; i < kept.length; i++) {
      zip.file("pose-" + (i + 1) + ".png", await fetch(kept[i].dataUrl).then((r) => r.blob()));
    }
    for (let k = 0; k < state.cast.length; k++) {
      const c = state.cast[k];
      zip.file("cast-" + (k + 1) + "-" + c.label.replace(/[^a-z0-9]+/gi, "-") + ".png", await fetch(c.cutout.dataUrl).then((r) => r.blob()));
    }
    const allBgs = state.bgs.length ? state.bgs : (state.bg ? [state.bg] : []);
    for (let i = 0; i < allBgs.length; i++) {
      zip.file(allBgs.length > 1 ? "background-" + (i + 1) + ".png" : "background.png", await fetch(allBgs[i].dataUrl).then((r) => r.blob()));
    }
    const infoLines = ["character: " + $("charInput").value.trim(), "painter: Faith bridge", "art style: " + studioStyle()];
    if (isPoseMode() && kept.length) {
      infoLines.push("mode: pose sheet, one image auto-sliced");
      kept.forEach((p, i) => infoLines.push("frame " + (i + 1) + ": " + p.text));
    } else {
      infoLines.push("movement: gentle bob, " + n + " frames (same picture shifted/tilted)");
    }
    const o = fxOpts();
    infoLines.push("post: bloom " + o.bloom + ", ambient-match " + o.ambient + ", tint " + o.tint + " (" + o.tintColor + "), warmth " + o.warmth + ", vignette " + o.vignette + ", sat " + o.sat + ", con " + o.con + ", grain " + o.grain);
    if (state.bgs.length > 1) infoLines.push("background: " + state.bgs.length + " animated variants" + ($("bgAnimCheck").checked ? " (on)" : " (off)"));
    state.cast.forEach((c, k) => {
      const path = (c.pathA && c.pathB)
        ? " path A(" + c.pathA.x.toFixed(2) + "," + c.pathA.y.toFixed(2) + ")→B(" + c.pathB.x.toFixed(2) + "," + c.pathB.y.toFixed(2) + ")"
        : " no path";
      const moves = c.preset && c.preset !== "none" ? " moves: " + c.preset + " size " + (c.strength != null ? c.strength : 45) + " offset " + (c.offset || 0) + "% over " + castFrames(c) + " frames" : " still";
      const fr = (c.flip ? " flipped" : "") + (c.rot ? " rot " + c.rot + "°" : "") + (c.hidden ? " hidden" : "");
      infoLines.push("cast " + (k + 1) + ": " + c.label + " at (" + c.x.toFixed(2) + "," + c.y.toFixed(2) + "), scale " + (c.scale || 0.85) + "," + path + "," + moves + "," + fr);
    });
    zip.file("info.txt", infoLines.join("\n"));
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    downloadUrl(url, "cutout-animation.zip");
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    status("Pictures saved.", false);
  } catch (e) {
    console.warn("zip failed", e);
    status("Saving failed (" + (e && e.message ? e.message : e) + ").", false);
  } finally {
    btn.disabled = false;
  }
});

/* ---------- 6 · timeline: splice stage moments + .mp4s into one video ---------- */
state.timeline = []; // clips: {kind:"stage",...} | {kind:"mp4",...}
state.tlSeq = 0;
let lastTlUrl = null;

// Freeze the live scene so a clip re-renders identically later. Images are
// shared by reference (immutable); per-member settings are copied, so later
// edits (drag, 👁 hide, moves) can't corrupt a banked clip.
function snapScene() {
  return {
    mode: $("modeSelect").value,
    loopN: loopFrames(),
    scale: Number($("scaleInput").value) || 0.85,
    pFlip: state.pFlip,
    pRot: state.pRot,
    cast: state.cast.map((c) => ({ ...c, pathA: c.pathA ? { ...c.pathA } : null, pathB: c.pathB ? { ...c.pathB } : null })),
    selId: state.selId,
    bg: state.bg,
    bgs: [...state.bgs],
    bgAvg: state.bgAvg ? { ...state.bgAvg } : null,
    bgAnim: $("bgAnimCheck").checked,
    poses: state.poses.map((p) => ({ ...p })),
    sheet: state.sheet,
  };
}
function applySnap(s) {
  $("modeSelect").value = s.mode;
  $("movesBox").hidden = s.mode === "poses";
  $("posesBox").hidden = s.mode !== "poses";
  $("loopFramesInput").value = s.loopN;
  $("scaleInput").value = s.scale;
  $("scaleValEl").textContent = s.scale;
  state.pFlip = !!s.pFlip;
  state.pRot = s.pRot || 0;
  $("prevRotInput").value = state.pRot;
  $("prevRotValEl").textContent = state.pRot + "°";
  $("flipPrevBtn").style.fontWeight = state.pFlip ? "700" : "400";
  state.cast = s.cast.map((c) => ({ ...c, pathA: c.pathA ? { ...c.pathA } : null, pathB: c.pathB ? { ...c.pathB } : null }));
  state.selId = s.selId;
  state.bg = s.bg;
  state.bgs = [...s.bgs];
  state.bgAvg = s.bgAvg ? { ...s.bgAvg } : null;
  $("bgAnimCheck").checked = !!s.bgAnim;
  state.poses = (s.poses || []).map((p) => ({ ...p }));
  state.sheet = s.sheet || null;
  state.playIdx = 0;
}
// Push the whole UI back in sync with state (after loading a clip / exporting).
function refreshAllUI() {
  const prev = $("bgPrevImgEl");
  if (state.bg) { prev.src = state.bg.dataUrl; prev.hidden = false; }
  renderBgStrip();
  if (state.poses.length || isPoseMode()) {
    $("poseGridEl").innerHTML = "";
    state.poses.forEach((p, i) => poseCard(i, p));
    showSheetPreview();
  }
  renderCast();
  updateSelCap();
  drawStrip();
  drawStage();
}

$("tlAddStageBtn").addEventListener("click", () => {
  if (!state.cutout && !(isPoseMode() && keptPoses().length) && bgList().length < 2 && !state.cast.length) { status("Make your character first.", false); return; }
  const snap = snapScene();
  const frames = stageFrameCount();
  const thumb = document.createElement("canvas");
  thumb.width = 168; thumb.height = 168;
  thumb.getContext("2d").drawImage(composeFrame(168, 168, frameAt(0)), 0, 0);
  state.tlSeq++;
  state.timeline.push({ kind: "stage", id: state.tlSeq, name: "Stage " + state.tlSeq, snap, frames, thumb: thumb.toDataURL("image/jpeg", 0.72) });
  renderTimeline();
  status("Clip added — " + frames + " frames of this exact scene.", false);
});

$("tlUploadBtn").addEventListener("click", () => $("tlFileInput").click());
$("tlFileInput").addEventListener("change", () => {
  tlAddFiles($("tlFileInput").files);
  $("tlFileInput").value = "";
});
function tlLoadVideo(url) {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "auto";
    const to = setTimeout(() => { cleanup(); reject(new Error("video load timed out")); }, 20000);
    const cleanup = () => { clearTimeout(to); v.removeEventListener("loadedmetadata", onOk); v.removeEventListener("error", onErr); };
    const onOk = () => { cleanup(); resolve(v); };
    const onErr = () => { cleanup(); reject(new Error("couldn't decode that video")); };
    v.addEventListener("loadedmetadata", onOk);
    v.addEventListener("error", onErr);
    v.src = url;
  });
}
function seekVideo(v, t) {
  return new Promise((resolve) => {
    let done = false;
    const to = setTimeout(() => { if (!done) { done = true; v.removeEventListener("seeked", on); resolve(false); } }, 6000);
    const on = () => { if (!done) { done = true; clearTimeout(to); resolve(true); } };
    v.addEventListener("seeked", on, { once: true });
    try { v.currentTime = t; } catch (e) { clearTimeout(to); resolve(false); }
  });
}
async function tlProbeVideo(file) {
  const url = URL.createObjectURL(file);
  try {
    const v = await tlLoadVideo(url);
    const duration = Number.isFinite(v.duration) ? v.duration : 0;
    if (!duration || duration <= 0) throw new Error("no duration");
    await seekVideo(v, Math.min(0.25, duration / 3));
    let thumb = "";
    try {
      const c = document.createElement("canvas");
      c.width = 168; c.height = 168;
      const x = c.getContext("2d");
      x.fillStyle = "#000"; x.fillRect(0, 0, 168, 168);
      drawCoverFit(x, v, v.videoWidth || 768, v.videoHeight || 768, 168, 168);
      thumb = c.toDataURL("image/jpeg", 0.7);
    } catch (e) { thumb = ""; }
    try { v.src = ""; } catch (e) { /* noop */ }
    return { url, duration, thumb };
  } catch (e) {
    try { URL.revokeObjectURL(url); } catch (err) { /* noop */ }
    throw e;
  }
}
async function tlAddFiles(files) {
  for (const f of files || []) {
    if (!/^video\//.test(f.type || "") && !/\.mp4$/i.test(f.name || "")) { status("Skipped " + (f.name || "file") + " — video files only.", false); continue; }
    try {
      status("Reading " + (f.name || "video") + "…", true);
      const meta = await tlProbeVideo(f);
      state.tlSeq++;
      state.timeline.push({ kind: "mp4", id: state.tlSeq, name: ((f.name || "clip.mp4").replace(/\.[^.]+$/, "") || ("Clip " + state.tlSeq)).slice(0, 24), url: meta.url, duration: meta.duration, trimStart: 0, trimEnd: meta.duration, thumb: meta.thumb });
    } catch (e) {
      console.warn("probe failed", e);
      status("Couldn't read " + (f.name || "that file") + " (" + (e && e.message ? e.message : e) + ").", false);
    }
  }
  renderTimeline();
  if (state.timeline.length) status(state.timeline.length + (state.timeline.length === 1 ? " clip" : " clips") + " in the timeline.", false);
}

function renderTimeline() {
  const box = $("tlEl");
  if (!box) return;
  box.innerHTML = "";
  const fps = Math.max(1, Number($("fpsInput").value) || 5);
  state.timeline.forEach((clip, idx) => {
    const card = document.createElement("div");
    card.style.cssText = "border:1px solid rgba(128,128,128,.4);border-radius:8px;padding:6px;width:132px;font-size:0.75rem;display:flex;flex-direction:column;gap:4px;background:rgba(128,128,128,.06)";
    const num = document.createElement("b");
    num.textContent = (idx + 1) + " · " + clip.name;
    card.appendChild(num);
    if (clip.thumb) {
      const img = document.createElement("img");
      img.src = clip.thumb;
      img.alt = clip.name;
      img.style.cssText = "width:100%;aspect-ratio:1;object-fit:cover;border-radius:4px;background:#000";
      card.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.textContent = "🎞";
      ph.style.cssText = "width:100%;aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:2rem;border-radius:4px;background:#000";
      card.appendChild(ph);
    }
    const dur = document.createElement("div");
    dur.style.cssText = "font-size:0.8rem;opacity:0.7";
    dur.textContent = clip.kind === "stage"
      ? clip.frames + " frames (~" + (clip.frames / fps).toFixed(1) + "s)"
      : (Math.max(0.05, (clip.trimEnd == null ? clip.duration : clip.trimEnd) - (clip.trimStart || 0))).toFixed(1) + "s selected";
    card.appendChild(dur);
    const trim = document.createElement("div");
    trim.className = "fvs-trim-controls";
    if (clip.kind === "mp4") {
      clip.trimStart = Math.max(0, Math.min(Number(clip.trimStart) || 0, Math.max(0, clip.duration - 0.05)));
      clip.trimEnd = Math.max(clip.trimStart + 0.05, Math.min(Number(clip.trimEnd == null ? clip.duration : clip.trimEnd), clip.duration));
      [["In (s)", "trimStart", 0, Math.max(0, clip.trimEnd - 0.05)], ["Out (s)", "trimEnd", Math.min(clip.trimStart + 0.05, clip.duration), clip.duration]].forEach(function (cfg) {
        const lab = document.createElement("label"); lab.textContent = cfg[0];
        const inp = document.createElement("input"); inp.type = "number"; inp.min = String(cfg[2]); inp.max = String(cfg[3]); inp.step = "0.1"; inp.value = Number(clip[cfg[1]]).toFixed(1);
        inp.addEventListener("change", function () {
          let v = Number(inp.value); if (!Number.isFinite(v)) v = cfg[2];
          v = Math.max(cfg[2], Math.min(cfg[3], v));
          if (cfg[1] === "trimStart") { clip.trimStart = Math.min(v, clip.trimEnd - 0.05); }
          else { clip.trimEnd = Math.max(v, clip.trimStart + 0.05); }
          renderTimeline(); saveWorkspaceSoon();
        });
        lab.appendChild(inp); trim.appendChild(lab);
      });
    } else {
      const lab = document.createElement("label"); lab.textContent = "Length (frames)";
      const inp = document.createElement("input"); inp.type = "number"; inp.min = "1"; inp.max = "300"; inp.step = "1"; inp.value = String(clip.frames || 1);
      inp.addEventListener("change", function () { clip.frames = Math.max(1, Math.min(300, Math.round(Number(inp.value) || 1))); renderTimeline(); saveWorkspaceSoon(); });
      lab.appendChild(inp); trim.appendChild(lab);
    }
    card.appendChild(trim);
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:4px";
    const mk = (t, title) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = t; b.title = title;
      b.style.cssText = "flex:1;padding:2px 0;font-size:0.75rem";
      return b;
    };
    const left = mk("◀", "Move earlier");
    const right = mk("▶", "Move later");
    const del = mk("✕", "Remove clip");
    left.addEventListener("click", () => { if (idx > 0) { state.timeline.splice(idx, 1); state.timeline.splice(idx - 1, 0, clip); renderTimeline(); } });
    right.addEventListener("click", () => { if (idx < state.timeline.length - 1) { state.timeline.splice(idx, 1); state.timeline.splice(idx + 1, 0, clip); renderTimeline(); } });
    del.addEventListener("click", () => {
      state.timeline = state.timeline.filter((x) => x.id !== clip.id);
      if (clip.kind === "mp4") { try { URL.revokeObjectURL(clip.url); } catch (e) { /* noop */ } }
      renderTimeline();
    });
    row.appendChild(left); row.appendChild(right);
    if (clip.kind === "stage") {
      const load = mk("⏏", "Load this scene back onto the stage");
      load.addEventListener("click", () => { applySnap(clip.snap); refreshAllUI(); status(clip.name + " loaded back onto the stage.", false); });
      row.appendChild(load);
    }
    row.appendChild(del);
    card.appendChild(row);
    box.appendChild(card);
  });
  const n = state.timeline.length;
  if (!n) { $("tlCapEl").textContent = "No clips yet — add the current stage or upload .mp4s."; return; }
  let secs = 0;
  for (const c of state.timeline) secs += c.kind === "stage" ? c.frames / fps : Math.max(0.05, (c.trimEnd == null ? c.duration : c.trimEnd) - (c.trimStart || 0));
  $("tlCapEl").textContent = n + (n === 1 ? " clip" : " clips") + " · ~" + secs.toFixed(1) + "s at current speed · exports top to bottom, left to right.";
}

$("tlClearBtn").addEventListener("click", () => {
  for (const c of state.timeline) if (c.kind === "mp4") { try { URL.revokeObjectURL(c.url); } catch (e) { /* noop */ } }
  state.timeline = [];
  renderTimeline();
  status("Timeline cleared.", false);
});

$("tlExportBtn").addEventListener("click", async () => {
  if (!state.timeline.length) { status("Add a clip to the timeline first.", false); return; }
  const btn = $("tlExportBtn");
  btn.disabled = true;
  const live = snapScene(); // restore point: the export borrows the stage per clip
  status("Stitching your timeline…", true);
  try {
    if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") {
      throw new Error("this browser can't encode MP4 (no WebCodecs)");
    }
    const { Output, Mp4OutputFormat, BufferTarget, EncodedVideoPacketSource, EncodedPacket } = await import("https://esm.sh/mediabunny@1");
    const fps = Math.max(1, Number($("fpsInput").value) || 5);
    const plan = state.timeline.map((clip) => ({
      clip,
      frames: clip.kind === "stage" ? clip.frames : Math.max(1, Math.round(Math.max(0.05, (clip.trimEnd == null ? clip.duration : clip.trimEnd) - (clip.trimStart || 0)) * fps)),
    }));
    const total = plan.reduce((a, p) => a + p.frames, 0);
    if (!total) throw new Error("nothing to export");
    let codec = null;
    for (const c of ["avc1.42001F", "avc1.42001E", "avc1.640028", "avc1.64001F"]) {
      try {
        const r = await VideoEncoder.isConfigSupported({ codec: c, width: 768, height: 768, bitrate: 8_000_000, framerate: fps });
        if (r.supported) { codec = c; break; }
      } catch (e) { /* try next */ }
    }
    if (!codec) throw new Error("no supported H.264 profile in this browser");
    const W = 768, H = 768;
    const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
    const source = new EncodedVideoPacketSource("avc");
    output.addVideoTrack(source, { width: W, height: H, frameRate: fps });
    await output.start();
    let encErr = null;
    const enc = new VideoEncoder({
      output: (chunk, meta) => { try { source.add(EncodedPacket.fromEncodedChunk(chunk), meta); } catch (e) { encErr = encErr || e; } },
      error: (e) => { encErr = encErr || e; },
    });
    enc.configure({ codec, width: W, height: H, bitrate: 8_000_000, framerate: fps });
    const paint = document.createElement("canvas");
    paint.width = W; paint.height = H;
    const px = paint.getContext("2d");
    let done = 0;
    const encodePaint = async () => {
      const vf = new VideoFrame(paint, { timestamp: (done * 1e6) / fps, duration: 1e6 / fps });
      enc.encode(vf, { keyFrame: done % Math.max(1, fps * 2) === 0 });
      vf.close();
      done++;
      if (done % 30 === 0) await enc.flush();
      if (done % 20 === 0) status("Stitching your timeline… frame " + done + "/" + total, true);
    };
    for (const p of plan) {
      if (p.clip.kind === "stage") {
        applySnap(p.clip.snap);
        for (let j = 0; j < p.frames; j++) {
          px.fillStyle = "#000"; px.fillRect(0, 0, W, H);
          px.drawImage(composeFrame(W, H, frameAt(j)), 0, 0);
          await encodePaint();
        }
      } else {
        const v = await tlLoadVideo(p.clip.url);
        try {
          for (let j = 0; j < p.frames; j++) {
            const clipStart = Math.max(0, Number(p.clip.trimStart) || 0);
            const clipEnd = Math.min(p.clip.duration, Number(p.clip.trimEnd == null ? p.clip.duration : p.clip.trimEnd));
            const t = Math.min(clipStart + (j + 0.5) / fps, Math.max(clipStart, clipEnd - 0.025));
            await seekVideo(v, t);
            px.fillStyle = "#000"; px.fillRect(0, 0, W, H);
            drawCoverFit(px, v, v.videoWidth || W, v.videoHeight || H, W, H);
            await encodePaint();
          }
        } finally {
          try { v.src = ""; } catch (e) { /* noop */ }
        }
      }
    }
    await enc.flush();
    if (encErr) throw encErr;
    source.close();
    await output.finalize();
    const blob = new Blob([output.target.buffer], { type: "video/mp4" });
    await fvsSaveCompletedVideo(blob, "timeline.mp4");
    const url = URL.createObjectURL(blob);
    downloadUrl(url, "timeline.mp4");
    if (lastTlUrl) { try { URL.revokeObjectURL(lastTlUrl); } catch (e) { /* noop */ } }
    lastTlUrl = url;
    const prev = $("tlPrevEl");
    if (prev) {
      prev.src = url;
      prev.hidden = false;
      prev.loop = true; // endless play on by default
      prev.muted = true;
      try { await prev.play(); } catch (e) { /* autoplay blocked, controls still allow play */ }
    }
    status("Timeline saved (" + (total / fps).toFixed(1) + "s, " + plan.length + (plan.length > 1 ? " clips" : " clip") + " — repeat 🔁 on, plays endlessly · 768×768).", false);
  } catch (e) {
    console.warn("timeline failed", e);
    status("Timeline failed (" + (e && e.message ? e.message : e) + ").", false);
  } finally {
    applySnap(live);
    refreshAllUI();
    btn.disabled = false;
  }
});

/* ---------- AI poses: ONE sheet, sliced into frames ---------- */
// A single landscape image holds every pose side by side. Because all frames
// are cut from the same picture, the design is identical in every frame by
// construction — no repaints, no wording retries. Retry = a whole new sheet.
function paintCharPose(ctx, W, H, pose) {
  const img = pose.img;
  const charScale = Number($("scaleInput").value) || 0.85;
  const fit = Math.min(W / img.naturalWidth, H / img.naturalHeight) * charScale;
  const dw = img.naturalWidth * fit, dh = img.naturalHeight * fit;
  const kx = 0, ky = 60 * (H / 768);
  ctx.save();
  ctx.translate(W / 2 + kx, H / 2 + ky);
  if (state.pRot) ctx.rotate((state.pRot * Math.PI) / 180);
  if (state.pFlip) ctx.scale(-1, 1);
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

const DEFAULT_POSES = ["arm slightly raised in a small wave", "mid-step of a slow walk, left foot forward", "playful dance, one arm up"];
function addPoseRow(text) {
  const box = $("poseRowsEl");
  const row = document.createElement("div");
  row.className = "fvs-poseRowEl";
  const lab = document.createElement("span");
  lab.textContent = "P" + (box.children.length + 1);
  const inp = document.createElement("input");
  inp.type = "text";
  inp.value = text || "";
  inp.placeholder = "e.g. right arm raised in a wave";
  const del = document.createElement("button");
  del.type = "button";
  del.textContent = "✕";
  del.title = "Remove this pose";
  del.addEventListener("click", () => { row.remove(); renumberPoseRows(); });
  row.appendChild(lab);
  row.appendChild(inp);
  row.appendChild(del);
  box.appendChild(row);
}
function renumberPoseRows() {
  [...$("poseRowsEl").children].forEach((row, i) => { row.firstChild.textContent = "P" + (i + 1); });
}
function readPoseTexts() {
  return [...$("poseRowsEl").querySelectorAll("input")].map((e) => e.value.trim()).filter(Boolean);
}
DEFAULT_POSES.forEach(addPoseRow);
$("addPoseBtn").addEventListener("click", () => addPoseRow(""));

// One wide sheet: the same character N times in a row, white gutters.
function sheetPrompt(texts) {
  const char = $("charInput").value.trim();
  const bp = basePose();
  const panels = texts.map((t, i) => "panel " + (i + 1) + ": " + bp + ", " + t).join("; ");
  const desc = char + ", character reference sheet, " + texts.length +
    " full-body poses side by side in a single horizontal row, left to right: " + panels +
    ", the exact same character design in every panel, identical face, identical outfit" +
    ", plain pure white background, no shadows, no text, no watermark" +
    ", equal-width panels separated by clear vertical white gaps";
  return buildStyledPrompt(studioStyle(), desc);
}

async function genSheetImage(texts) {
  const prompt = sheetPrompt(texts);
  const painted = await faithGenerateImage(prompt, "768x512");
  return { dataUrl: painted.dataUrl, img: painted.img, prompt };
}

// Flood-fill white keying: only background white connected to the border goes
// transparent, so enclosed whites (eyes, teeth) survive. Plus 1px fringe eat.
function keyCanvasWhite(src) {
  const w = src.width, h = src.height;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(src, 0, 0);
  const d = ctx.getImageData(0, 0, w, h);
  const px = d.data;
  const T = 232;
  const masked = new Uint8Array(w * h);
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) { stack.push(x); stack.push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { stack.push(y * w); stack.push(y * w + w - 1); }
  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * 4;
    if (!(px[i] > T && px[i + 1] > T && px[i + 2] > T)) continue;
    masked[p] = 1;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  const F = 195;
  const fringe = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (masked[p]) continue;
      const i = p * 4;
      if (px[i] > F && px[i + 1] > F && px[i + 2] > F) {
        if ((x > 0 && masked[p - 1]) || (x < w - 1 && masked[p + 1]) ||
            (y > 0 && masked[p - w]) || (y < h - 1 && masked[p + w])) fringe[p] = 1;
      }
    }
  }
  for (let p = 0; p < w * h; p++) if (masked[p] || fringe[p]) px[p * 4 + 3] = 0;
  ctx.putImageData(d, 0, 0);
  return c;
}

// Find vertical white gutters, snapped to ideal panel edges. Null = uneven.
function findStrictGutters(img, n) {
  if (n <= 1) return [0, img.naturalWidth];
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, W, H).data;
  const T = 232;
  const colBad = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    let bad = 0;
    for (let y = 0; y < H; y++) {
      const i = (y * W + x) * 4;
      if (!(px[i] > T && px[i + 1] > T && px[i + 2] > T)) bad++;
    }
    colBad[x] = bad / H;
  }
  const runs = [];
  let s = -1;
  for (let x = 0; x <= W; x++) {
    const g = x < W && colBad[x] < 0.005;
    if (g && s < 0) s = x;
    if (!g && s >= 0) { if (x - s >= 3) runs.push([s, x]); s = -1; }
  }
  if (runs.length < n - 1) return null;
  const used = new Set();
  const bounds = [0];
  for (let i = 1; i < n; i++) {
    const ideal = (W * i) / n;
    let best = -1, bd = 1e9;
    for (let r = 0; r < runs.length; r++) {
      if (used.has(r)) continue;
      const ctr = (runs[r][0] + runs[r][1]) / 2;
      const dd = Math.abs(ctr - ideal);
      if (dd < bd) { bd = dd; best = r; }
    }
    if (best < 0 || bd > (W / n) * 0.35) return null;
    used.add(best);
    bounds.push(Math.round((runs[best][0] + runs[best][1]) / 2));
  }
  bounds.push(W);
  bounds.sort((a, b) => a - b);
  const minW = (W / n) * 0.45;
  for (let i = 0; i < n; i++) if (bounds[i + 1] - bounds[i] < minW) return null;
  return bounds;
}

// Strict clean-gutter split first; if the characters lean across the ideal
// lines, fall back to cutting through the thinnest ink near each line.
function findGutters(img, n) {
  const s = findStrictGutters(img, n);
  if (s) return s;
  const v = findValleyBounds(img, n);
  if (v) { v.valley = true; return v; }
  return null;
}

function findValleyBounds(img, n) {
  if (n <= 1) return [0, img.naturalWidth];
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, W, H).data;
  const T = 232, y0 = Math.floor(H * 0.05), y1 = Math.ceil(H * 0.95);
  const ink = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    let k = 0;
    for (let y = y0; y < y1; y++) {
      const i = (y * W + x) * 4;
      if (!(px[i] > T && px[i + 1] > T && px[i + 2] > T)) k++;
    }
    ink[x] = k;
  }
  const bounds = [0];
  const half = (W / n) * 0.3;
  let prev = 0;
  for (let i = 1; i < n; i++) {
    const ideal = (W * i) / n;
    const lo = Math.max(prev + 1, Math.floor(ideal - half));
    const hi = Math.min(W - 1, Math.ceil(ideal + half));
    let bx = Math.round(ideal), bv = Infinity;
    for (let x = lo; x <= hi; x++) {
      const s = ink[x] + Math.abs(x - ideal) * 0.02;
      if (s < bv) { bv = s; bx = x; }
    }
    bounds.push(bx);
    prev = bx;
  }
  bounds.push(W);
  const minW = (W / n) * 0.45;
  for (let i = 0; i < n; i++) if (bounds[i + 1] - bounds[i] < minW) return null;
  return bounds;
}

// Drop stray bits a cut leaves behind: a neighbour's tail sliver touching a
// split edge, tiny specks. Keeps the body, bottom shadows, and anything big.
function cleanupCellEdges(keyed) {
  const w = keyed.width, h = keyed.height;
  const ctx = keyed.getContext("2d", { willReadFrequently: true });
  const d = ctx.getImageData(0, 0, w, h);
  const px = d.data;
  const N = w * h;
  const solid = new Uint8Array(N);
  for (let p = 0; p < N; p++) if (px[p * 4 + 3] > 8) solid[p] = 1;
  const comp = new Int32Array(N).fill(-1);
  const sizes = [], touchL = [], touchR = [], touchB = [];
  let largest = -1, largestSize = 0, nc = 0;
  const stack = [];
  for (let p0 = 0; p0 < N; p0++) {
    if (!solid[p0] || comp[p0] !== -1) continue;
    let size = 0, tL = false, tR = false, tB = false;
    stack.push(p0);
    comp[p0] = nc;
    while (stack.length) {
      const p = stack.pop();
      size++;
      const x = p % w;
      if (x === 0) tL = true;
      if (x === w - 1) tR = true;
      if (p >= N - w) tB = true;
      if (x > 0 && solid[p - 1] && comp[p - 1] === -1) { comp[p - 1] = nc; stack.push(p - 1); }
      if (x < w - 1 && solid[p + 1] && comp[p + 1] === -1) { comp[p + 1] = nc; stack.push(p + 1); }
      if (p >= w && solid[p - w] && comp[p - w] === -1) { comp[p - w] = nc; stack.push(p - w); }
      if (p < N - w && solid[p + w] && comp[p + w] === -1) { comp[p + w] = nc; stack.push(p + w); }
    }
    sizes.push(size); touchL.push(tL); touchR.push(tR); touchB.push(tB);
    if (size > largestSize) { largestSize = size; largest = nc; }
    nc++;
  }
  let dirty = false;
  for (let p = 0; p < N; p++) {
    if (!solid[p] || comp[p] === largest) continue;
    const frac = sizes[comp[p]] / N;
    const side = touchL[comp[p]] || touchR[comp[p]];
    let kill = false;
    if (frac < 0.001) kill = true; // dust / text specks anywhere
    else if (side && !touchB[comp[p]] && frac < 0.15) kill = true; // neighbour sliver
    else if (touchB[comp[p]] && frac < 0.003) kill = true; // tiny bottom specks
    if (kill) { px[p * 4 + 3] = 0; dirty = true; }
  }
  if (dirty) ctx.putImageData(d, 0, 0);
  return keyed;
}

async function sliceSheet(sheetImg, texts) {
  const n = texts.length;
  let bounds = null;
  try { bounds = findGutters(sheetImg, n); } catch (e) { bounds = null; }
  let even = false;
  if (!bounds) {
    bounds = Array.from({ length: n + 1 }, (_, i) => Math.round((sheetImg.naturalWidth * i) / n));
    even = true;
  }
  const cells = [];
  for (let i = 0; i < n; i++) {
    const x0 = bounds[i], x1 = bounds[i + 1];
    const src = document.createElement("canvas");
    src.width = x1 - x0; src.height = sheetImg.naturalHeight;
    src.getContext("2d").drawImage(sheetImg, x0, 0, x1 - x0, sheetImg.naturalHeight, 0, 0, x1 - x0, sheetImg.naturalHeight);
    const keyed = keyCanvasWhite(src);
    cleanupCellEdges(keyed);
    const kd = keyed.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, keyed.width, keyed.height).data;
    let op = 0;
    for (let p = 3; p < kd.length; p += 16) if (kd[p] > 8) op++;
    if (op / (kd.length / 4 / 4) < 0.002) throw new Error("empty panel " + (i + 1));
    const dataUrl = keyed.toDataURL("image/png");
    cells.push({ dataUrl, img: await loadImg(dataUrl) });
  }
  return { cells, even };
}

function showSheetPreview() {
  if (!state.sheet) return;
  const prev = $("sheetPrevImgEl");
  prev.src = state.sheet.dataUrl;
  prev.hidden = false;
  $("sheetDiceBtn").hidden = false;
  $("sheetCapEl").textContent = "Full sheet — every frame below is sliced from this one image, so the design can't drift.";
}

function poseCard(i, pose) {
  const grid = $("poseGridEl");
  let card = $("poseCard" + i + "El");
  if (!card) {
    card = document.createElement("div");
    card.className = "fvs-poseCardEl";
    card.id = "fvs-poseCard" + i + "El";
    grid.appendChild(card);
  }
  card.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "fvs-imgWrapEl fvs-checkerEl";
  const cap = document.createElement("div");
  cap.className = "fvs-capEl";
  card.appendChild(wrap);
  card.appendChild(cap);
  if (!pose || !pose.img) {
    const ld = document.createElement("div");
    ld.className = "fvs-loadingEl";
    ld.innerHTML = '<span class="fvs-dotsEl">painting pose ' + (i + 1) + '</span>';
    wrap.appendChild(ld);
    const t = document.createElement("div");
    t.textContent = "P" + (i + 1) + " · " + (pose ? pose.text : "");
    cap.appendChild(t);
    return;
  }
  const img = document.createElement("img");
  img.src = pose.dataUrl;
  img.alt = "pose " + (i + 1);
  wrap.appendChild(img);
  const t = document.createElement("div");
  t.textContent = "P" + (i + 1) + " · " + pose.text;
  const m = document.createElement("div");
  m.className = "fvs-matchBadgeEl";
  m.textContent = "same sheet — identical design";
  cap.appendChild(t);
  cap.appendChild(m);
  const row = document.createElement("div");
  row.className = "fvs-btnRowEl";
  const dl = document.createElement("button");
  dl.type = "button";
  dl.textContent = "⬇ PNG";
  dl.addEventListener("click", () => downloadUrl(pose.dataUrl, "pose-" + (i + 1) + ".png"));
  row.appendChild(dl);
  cap.appendChild(row);
}

async function runPoseSheet() {
  const texts = readPoseTexts();
  if (!texts.length) { status("Add at least one pose first.", false); return; }
  const btn = $("genPosesBtn");
  btn.disabled = true;
  try {
    $("poseGridEl").innerHTML = "";
    state.poses = texts.map((text) => ({ text }));
    state.playIdx = 0;
    for (let i = 0; i < texts.length; i++) poseCard(i, { text: texts[i] });
    status("Painting one sheet with " + texts.length + " poses…", true);
    let sheet = await genSheetImage(texts);
    state.sheet = sheet;
    await fvsSaveImageToGallery(sheet.dataUrl, "Video Studio pose sheet", texts.join(", "));
    showSheetPreview();
    let cells = null, even = false;
    try {
      const r = await sliceSheet(sheet.img, texts);
      cells = r.cells; even = r.even;
    } catch (e) { cells = null; }
    if (!cells) {
      status("That sheet came out uneven — painting one more…", true);
      sheet = await genSheetImage(texts);
      state.sheet = sheet;
      await fvsSaveImageToGallery(sheet.dataUrl, "Video Studio pose sheet retry", texts.join(", "));
      showSheetPreview();
      try {
        const r = await sliceSheet(sheet.img, texts);
        cells = r.cells; even = r.even;
      } catch (e) { cells = null; }
    }
    if (!cells) {
      status("That sheet stayed uneven — press 🎲 new sheet look to try again.", false);
      return;
    }
    state.poses = texts.map((text, i) => ({ text, dataUrl: cells[i].dataUrl, img: cells[i].img }));
    for (let i = 0; i < state.poses.length; i++) await fvsSaveImageToGallery(state.poses[i].dataUrl, "Video Studio pose " + (i + 1), state.poses[i].text);
    state.poses.forEach((p, i) => poseCard(i, p));
    state.playIdx = 0;
    drawStage();
    status(even
      ? "Poses ready (even split — if a frame looks clipped, press 🎲 for a new sheet)."
      : "Poses ready — one design, sliced into " + cells.length + " frames. Press play.", false);
  } catch (e) {
    console.warn("sheet failed", e);
    status("Sheet failed (" + (e && e.message ? e.message : e) + "). Try again or press 🎲.", false);
  } finally {
    btn.disabled = false;
  }
}

$("genPosesBtn").addEventListener("click", () => runPoseSheet());
$("sheetDiceBtn").addEventListener("click", () => {
  runPoseSheet();
});

// Namespaced handle: lets Faith's console / future tooling inspect studio state.
/* ---------- 7 · video workspaces (Studio sidebar projects + saved state) ----------
   Mirrors Faith's Chats panel: "+ New workspace", "Delete all videos", and a
   project list (click to switch, right-click to delete). Projects persist to
   localStorage under faithVideoStudioV1 (same pattern as Faith's own
   faithWorkspaceV1). Serialized state keeps data URLs and drops live Image
   objects; timeline .mp4 uploads are session-only (blob URLs can't persist)
   and are skipped on save. Autosaves (debounced) on any studio interaction,
   on tab switch, on hide/close; the sidebar also has an explicit save button. */
/* FVS-WORKSPACES-START */
const FVS_STORE_KEY = "faithVideoStudioV1";
const FVS_DB_NAME = "FaithVideoStudioStore";
const FVS_DB_VERSION = 1;
let fvsDbPromise = null;
let fvsWorkspace = null;
let fvsWorkspaceMenu = null;
let fvsWorkspaceOperation = 0;
let fvsSaveTimer = 0;
let fvsLoading = false;
let fvsDirty = false;
function fvsNowId() { return "ws-" + Date.now().toString(36) + Math.floor(Math.random() * 1000000).toString(36); }
function fvsStripImg(o) { if (!o || !o.dataUrl) return null; return { dataUrl: o.dataUrl, prompt: o.prompt || "" }; }
function fvsTake(o) {
  if (!o || !o.dataUrl) return Promise.resolve(null);
  return loadImg(o.dataUrl).then(function (img) { return { dataUrl: o.dataUrl, img: img, prompt: o.prompt || "" }; });
}
function fvsStripCast(c) {
  const nc = Object.assign({}, c);
  delete nc.img;
  nc.cutout = fvsStripImg(c.cutout);
  nc.pathA = c.pathA ? { x: c.pathA.x, y: c.pathA.y } : null;
  nc.pathB = c.pathB ? { x: c.pathB.x, y: c.pathB.y } : null;
  return nc;
}
function fvsStripSnap(s) {
  return {
    mode: s.mode, loopN: s.loopN, scale: s.scale, pFlip: !!s.pFlip, pRot: s.pRot || 0,
    selId: s.selId, bgAvg: s.bgAvg ? Object.assign({}, s.bgAvg) : null, bgAnim: !!s.bgAnim,
    bg: fvsStripImg(s.bg),
    bgs: (s.bgs || []).map(fvsStripImg).filter(Boolean),
    cast: (s.cast || []).map(fvsStripCast),
    poses: (s.poses || []).map(function (p) { return { text: p.text || "", dataUrl: p.dataUrl || "" }; }),
    sheet: fvsStripImg(s.sheet)
  };
}
function blankWorkspaceData() {
  return {
    v: 3, charInput: "", basePoseInput: "standing, facing forward",
    style: "Anime", mode: "moves",
    bgPromptInput: "sunny meadow with soft hills and a dirt path, empty, no characters",
    poseTexts: DEFAULT_POSES.slice(),
    loopFrames: 4, fps: 5, scale: 0.85, bgAnim: false, bgStrict: true, bgCount: "2",
    fx: { bloom: "30", ambient: "35", tintStrength: "0", tintColor: "#ffb46b", warmth: "0", vignette: "20", sat: "100", con: "100", grain: "0" },
    pFlip: false, pRot: 0,
    cutout: null, bg: null, bgAvg: null, bgs: [],
    cast: [], selId: 0, castSeq: 0,
    poses: [], sheet: null, timeline: [], tlSeq: 0
  };
}
function collectWorkspaceData() {
  return {
    v: 3,
    charInput: $("charInput").value, basePoseInput: $("basePoseInput").value,
    style: $("styleSelect").value, mode: $("modeSelect").value,
    bgPromptInput: $("bgPromptInput").value, poseTexts: readPoseTexts(),
    loopFrames: $("loopFramesInput").value, fps: $("fpsInput").value, scale: $("scaleInput").value,
    bgAnim: $("bgAnimCheck").checked, bgStrict: $("bgStrictCheck").checked, bgCount: $("bgCountSelect").value,
    fx: {
      bloom: $("bloomInput").value, ambient: $("ambientInput").value,
      tintStrength: $("tintStrengthInput").value, tintColor: $("tintColorInput").value,
      warmth: $("warmthInput").value, vignette: $("vignetteInput").value,
      sat: $("satInput").value, con: $("conInput").value, grain: $("grainInput").value
    },
    pFlip: state.pFlip, pRot: state.pRot,
    cutout: fvsStripImg(state.cutout), bg: fvsStripImg(state.bg),
    bgAvg: state.bgAvg ? Object.assign({}, state.bgAvg) : null,
    bgs: state.bgs.map(fvsStripImg).filter(Boolean),
    cast: state.cast.map(fvsStripCast),
    selId: state.selId, castSeq: state.castSeq,
    poses: state.poses.map(function (p) { return { text: p.text || "", dataUrl: p.dataUrl || "" }; }),
    sheet: fvsStripImg(state.sheet),
    timeline: state.timeline.filter(function (c) { return c && c.kind === "stage" && c.snap; }).map(function (c) {
      return { kind: "stage", id: c.id, name: c.name, frames: c.frames, thumb: c.thumb, snap: fvsStripSnap(c.snap) };
    }),
    tlSeq: state.tlSeq
  };
}
function fvsReadStore() {
  try {
    const raw = localStorage.getItem(FVS_STORE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !Array.isArray(s.projects)) return null;
    return s;
  } catch (_) { return null; }
}
function fvsOpenDb() {
  if (fvsDbPromise) return fvsDbPromise;
  fvsDbPromise = new Promise(function (resolve, reject) {
    if (!window.indexedDB) { reject(new Error("IndexedDB unavailable")); return; }
    const req = indexedDB.open(FVS_DB_NAME, FVS_DB_VERSION);
    req.onupgradeneeded = function () { const db = req.result; if (!db.objectStoreNames.contains("workspace")) db.createObjectStore("workspace"); };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error || new Error("Could not open workspace database")); };
  });
  return fvsDbPromise;
}
async function fvsLoadPersistedStore() {
  try {
    const db = await fvsOpenDb();
    const value = await new Promise(function (resolve, reject) {
      const tx = db.transaction("workspace", "readonly");
      const req = tx.objectStore("workspace").get("main");
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { reject(req.error); };
    });
    if (value && Array.isArray(value.projects)) return value;
  } catch (e) { console.warn("IndexedDB read unavailable; trying legacy workspace storage", e); }
  const legacy = fvsReadStore();
  if (legacy) {
    try { await fvsPersistStore(legacy); localStorage.removeItem(FVS_STORE_KEY); } catch (e) { console.warn("Workspace migration could not finish", e); }
  }
  return legacy;
}
async function fvsPersistStore(store) {
  const db = await fvsOpenDb();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction("workspace", "readwrite");
    tx.objectStore("workspace").put(store, "main");
    tx.oncomplete = function () { resolve(true); };
    tx.onerror = function () { reject(tx.error || new Error("Workspace database write failed")); };
    tx.onabort = function () { reject(tx.error || new Error("Workspace database write aborted")); };
  });
}
function ensureWorkspaceStore() {
  if (!fvsWorkspace) {
    const p = { id: fvsNowId(), title: "Untitled workspace", updatedAt: Date.now(), data: blankWorkspaceData() };
    fvsWorkspace = { activeId: p.id, projects: [p] };
  }
  if (!fvsWorkspace.projects.length) {
    const p = { id: fvsNowId(), title: "Untitled workspace", updatedAt: Date.now(), data: blankWorkspaceData() };
    fvsWorkspace = { activeId: p.id, projects: [p] };
  }
  if (!fvsWorkspace.projects.some(function (p) { return p.id === fvsWorkspace.activeId; })) fvsWorkspace.activeId = fvsWorkspace.projects[0].id;
}
function activeWorkspace() {
  ensureWorkspaceStore();
  return fvsWorkspace.projects.find(function (p) { return p.id === fvsWorkspace.activeId; });
}
async function saveWorkspace(loud) {
  try {
    const a = activeWorkspace();
    a.data = collectWorkspaceData();
    const ch = (a.data.charInput || "").trim();
    a.title = ch ? ch.slice(0, 32) : (a.title || "Untitled workspace");
    a.updatedAt = Date.now();
    await fvsPersistStore(fvsWorkspace);
    fvsDirty = false;
    renderWorkspaceList();
    if (loud) status("Workspace saved \u2713 \u2014 " + a.title, false);
    return true;
  } catch (e) {
    console.warn("workspace save failed", e);
    status("Couldn't save workspace safely: " + ((e && e.message) || e) + ". Your current workspace has not been switched away from.", false);
    return false;
  }
}
function saveWorkspaceSoon() {
  fvsDirty = true;
  clearTimeout(fvsSaveTimer);
  fvsSaveTimer = setTimeout(function () { if (fvsDirty && !fvsLoading) saveWorkspace(false); }, 1500);
}
function renderWorkspaceList() {
  const box = $("project-list");
  if (!box || !fvsWorkspace) return;
  box.innerHTML = "";
  fvsWorkspace.projects.slice().sort(function (a, b) { return b.updatedAt - a.updatedAt; }).forEach(function (p) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "fvs-thread" + (p.id === fvsWorkspace.activeId ? " active" : "");
    b.textContent = p.title || "Untitled workspace";
    b.title = b.textContent + " \u2014 right-click for workspace actions";
    b.addEventListener("click", function () { switchWorkspace(p.id).catch(function (e) { console.warn("switch failed", e); }); });
    b.addEventListener("contextmenu", function (e) {
      e.preventDefault();
      if (!fvsWorkspaceMenu) {
        fvsWorkspaceMenu = document.createElement("div"); fvsWorkspaceMenu.id = "fvs-workspace-menu"; fvsWorkspaceMenu.hidden = true;
        const delAction = document.createElement("button"); delAction.type = "button"; delAction.textContent = "Delete workspace";
        delAction.addEventListener("click", function () { const target = fvsWorkspaceMenu.dataset.workspaceId; fvsWorkspaceMenu.hidden = true; if (target) deleteWorkspace(target).catch(function (err) { console.warn("delete failed", err); }); });
        fvsWorkspaceMenu.appendChild(delAction); document.body.appendChild(fvsWorkspaceMenu);
        document.addEventListener("click", function (ev) { if (fvsWorkspaceMenu && !fvsWorkspaceMenu.contains(ev.target)) fvsWorkspaceMenu.hidden = true; });
        document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && fvsWorkspaceMenu) fvsWorkspaceMenu.hidden = true; });
      }
      fvsWorkspaceMenu.dataset.workspaceId = p.id; fvsWorkspaceMenu.style.left = Math.min(e.clientX, window.innerWidth - 170) + "px"; fvsWorkspaceMenu.style.top = Math.min(e.clientY, window.innerHeight - 55) + "px"; fvsWorkspaceMenu.hidden = false;
    });
    box.appendChild(b);
  });
}
async function fvsHydrateSnap(s) {
  const out = {
    mode: s.mode, loopN: s.loopN, scale: s.scale, pFlip: !!s.pFlip, pRot: s.pRot || 0,
    selId: s.selId, bgAvg: s.bgAvg ? Object.assign({}, s.bgAvg) : null, bgAnim: !!s.bgAnim,
    bg: null, bgs: [], cast: [], poses: [], sheet: null
  };
  out.bg = await fvsTake(s.bg);
  for (const b of (s.bgs || [])) { const o = await fvsTake(b); if (o) out.bgs.push(o); }
  for (const c of (s.cast || [])) {
    const nc = Object.assign({}, c);
    delete nc.img;
    nc.cutout = await fvsTake(c.cutout);
    nc.pathA = c.pathA ? { x: c.pathA.x, y: c.pathA.y } : null;
    nc.pathB = c.pathB ? { x: c.pathB.x, y: c.pathB.y } : null;
    out.cast.push(nc);
  }
  for (const p of (s.poses || [])) {
    const o = await fvsTake(p);
    out.poses.push({ text: p.text || "", dataUrl: p.dataUrl || "", img: o ? o.img : null });
  }
  out.sheet = await fvsTake(s.sheet);
  return out;
}
async function applyWorkspaceData(d) {
  d = (d && typeof d === "object") ? d : blankWorkspaceData();
  status("Loading workspace\u2026", true);
  try {
    fvsLoading = true;
    state.playing = false;
    try { cancelAnimationFrame(state.rafId); } catch (_) {}
    setPlayBtn();
    for (const c of state.timeline) {
      if (c && c.kind === "mp4" && c.url) { try { URL.revokeObjectURL(c.url); } catch (_) {} }
    }
    $("charInput").value = d.charInput || "";
    $("basePoseInput").value = d.basePoseInput || "standing, facing forward";
    if (STYLE_NAMES.indexOf(d.style) !== -1) $("styleSelect").value = d.style;
    $("modeSelect").value = d.mode === "poses" ? "poses" : "moves";
    $("movesBox").hidden = $("modeSelect").value === "poses";
    $("posesBox").hidden = $("modeSelect").value !== "poses";
    $("bgPromptInput").value = d.bgPromptInput || "";
    $("poseRowsEl").innerHTML = "";
    ((d.poseTexts && d.poseTexts.length) ? d.poseTexts : DEFAULT_POSES.slice()).forEach(function (t) { addPoseRow(t); });
    $("loopFramesInput").value = d.loopFrames != null ? d.loopFrames : 4;
    $("fpsInput").value = d.fps != null ? d.fps : 5;
    $("fpsValEl").textContent = $("fpsInput").value;
    $("scaleInput").value = d.scale != null ? d.scale : 0.85;
    $("scaleValEl").textContent = $("scaleInput").value;
    $("bgAnimCheck").checked = !!d.bgAnim;
    $("bgStrictCheck").checked = d.bgStrict !== false;
    $("bgCountSelect").value = d.bgCount || "2";
    const fx = d.fx || {};
    const fxMap = [["bloomInput", "bloomValEl", "bloom", "30"], ["ambientInput", "ambientValEl", "ambient", "35"], ["tintStrengthInput", "tintValEl", "tintStrength", "0"], ["warmthInput", "warmthValEl", "warmth", "0"], ["vignetteInput", "vignetteValEl", "vignette", "20"], ["satInput", "satValEl", "sat", "100"], ["conInput", "conValEl", "con", "100"], ["grainInput", "grainValEl", "grain", "0"]];
    for (const triple of fxMap) {
      const v = fx[triple[2]] != null ? fx[triple[2]] : triple[3];
      $(triple[0]).value = v;
      $(triple[1]).textContent = v;
    }
    $("tintColorInput").value = fx.tintColor || "#ffb46b";
    state.pFlip = !!d.pFlip;
    state.pRot = d.pRot || 0;
    $("prevRotInput").value = state.pRot;
    $("prevRotValEl").textContent = state.pRot + "\u00b0";
    $("flipPrevBtn").style.fontWeight = state.pFlip ? "700" : "400";
    state.bgAvg = d.bgAvg ? Object.assign({}, d.bgAvg) : null;
    state.cutout = await fvsTake(d.cutout);
    state.bg = await fvsTake(d.bg);
    state.bgs = [];
    for (const b of (d.bgs || [])) { const o = await fvsTake(b); if (o) state.bgs.push(o); }
    state.cast = [];
    state.castSeq = d.castSeq || 0;
    state.selId = d.selId || 0;
    for (const c of (d.cast || [])) {
      const nc = Object.assign({}, c);
      delete nc.img;
      nc.cutout = await fvsTake(c.cutout);
      nc.pathA = c.pathA ? { x: c.pathA.x, y: c.pathA.y } : null;
      nc.pathB = c.pathB ? { x: c.pathB.x, y: c.pathB.y } : null;
      state.cast.push(nc);
    }
    state.poses = [];
    for (const p of (d.poses || [])) {
      const o = await fvsTake(p);
      state.poses.push({ text: p.text || "", dataUrl: p.dataUrl || "", img: o ? o.img : null });
    }
    state.sheet = await fvsTake(d.sheet);
    state.timeline = [];
    state.tlSeq = d.tlSeq || 0;
    for (const c of (d.timeline || [])) {
      if (!c || c.kind !== "stage" || !c.snap) continue;
      state.timeline.push({ kind: "stage", id: c.id, name: c.name, frames: c.frames, thumb: c.thumb, snap: await fvsHydrateSnap(c.snap) });
    }
    state.playIdx = 0;
    refreshAllUI();
    const cp = $("cutPrevImgEl");
    if (state.cutout) { await showCutoutEditor(state.cutout.dataUrl); $("cutCapEl").textContent = "Workspace loaded — ready to animate."; }
    else { cp.hidden = true; $("eraseToolsEl").hidden = true; $("eraseHintEl").hidden = true; $("cutCapEl").textContent = ""; }
    $("sheetDiceBtn").hidden = !state.sheet;
    if (!state.sheet) $("sheetPrevImgEl").hidden = true;
    renderTimeline();
    renderWorkspaceList();
    const hasWork = !!(state.cutout || state.cast.length || state.poses.length || state.sheet);
    fvsLoading = false;
    status(hasWork ? "Workspace loaded." : "New workspace \u2014 describe a character to begin.", false);
  } catch (e) {
    fvsLoading = false;
    console.warn("workspace load failed", e);
    status("Couldn't load workspace (" + ((e && e.message) || e) + "). Starting fresh.", false);
  }
}
async function switchWorkspace(id) {
  ensureWorkspaceStore();
  if (fvsLoading) { status("Still loading \u2014 one moment\u2026", false); return; }
  if (id === fvsWorkspace.activeId) return;
  clearTimeout(fvsSaveTimer); fvsSaveTimer = null;
  const saved = await saveWorkspace(false);
  if (!saved) return;
  const next = fvsWorkspace.projects.find(function (p) { return p.id === id; });
  if (!next) return;
  const previousId = fvsWorkspace.activeId;
  fvsWorkspace.activeId = id;
  try { await fvsPersistStore(fvsWorkspace); }
  catch (e) { fvsWorkspace.activeId = previousId; status("Couldn't switch workspace because its selection could not be saved. Your current workspace is still active.", false); return; }
  fvsDirty = false;
  await applyWorkspaceData(next.data);
}
async function newWorkspace() {
  ensureWorkspaceStore();
  if (fvsLoading) { status("Still loading \u2014 one moment\u2026", false); return; }
  clearTimeout(fvsSaveTimer); fvsSaveTimer = null;
  const saved = await saveWorkspace(false);
  if (!saved) return;
  const previousId = fvsWorkspace.activeId;
  const p = { id: fvsNowId(), title: "Untitled workspace", updatedAt: Date.now(), data: blankWorkspaceData() };
  fvsWorkspace.projects.push(p);
  fvsWorkspace.activeId = p.id;
  try { await fvsPersistStore(fvsWorkspace); }
  catch (e) { fvsWorkspace.projects = fvsWorkspace.projects.filter(function (x) { return x.id !== p.id; }); fvsWorkspace.activeId = previousId; status("Couldn't create workspace: browser storage could not save it.", false); return; }
  fvsDirty = false;
  await applyWorkspaceData(p.data);
}
async function deleteWorkspace(id) {
  ensureWorkspaceStore();
  if (fvsLoading) { status("Still loading \u2014 one moment\u2026", false); return; }
  const p = fvsWorkspace.projects.find(function (x) { return x.id === id; });
  if (!p) return;
  if (id === fvsWorkspace.activeId) { clearTimeout(fvsSaveTimer); const saved = await saveWorkspace(false); if (!saved) return; }
  const name = (p && p.title) || "this workspace";
  if (typeof confirm === "function" && !confirm("Delete the video workspace \u201c" + name + "\u201d? This cannot be undone.")) return;
  const oldProjects = fvsWorkspace.projects.slice();
  const oldActiveId = fvsWorkspace.activeId;
  const wasActive = id === fvsWorkspace.activeId;
  fvsWorkspace.projects = fvsWorkspace.projects.filter(function (x) { return x.id !== id; });
  if (!fvsWorkspace.projects.length) fvsWorkspace.projects.push({ id: fvsNowId(), title: "Untitled workspace", updatedAt: Date.now(), data: blankWorkspaceData() });
  if (wasActive) fvsWorkspace.activeId = fvsWorkspace.projects[0].id;
  try { await fvsPersistStore(fvsWorkspace); }
  catch (e) { fvsWorkspace.projects = oldProjects; fvsWorkspace.activeId = oldActiveId; renderWorkspaceList(); status("Couldn't delete workspace because the updated workspace list could not be saved.", false); return; }
  const a = fvsWorkspace.projects.find(function (x) { return x.id === fvsWorkspace.activeId; });
  await applyWorkspaceData(a.data);
}
async function deleteAllWorkspaces() {
  ensureWorkspaceStore();
  if (fvsLoading) { status("Still loading \u2014 one moment\u2026", false); return; }
  if (typeof confirm === "function" && !confirm("Delete ALL video workspaces? This cannot be undone.")) return;
  const oldProjects = fvsWorkspace.projects;
  const oldActiveId = fvsWorkspace.activeId;
  fvsWorkspace.projects = [{ id: fvsNowId(), title: "Untitled workspace", updatedAt: Date.now(), data: blankWorkspaceData() }];
  fvsWorkspace.activeId = fvsWorkspace.projects[0].id;
  try { await fvsPersistStore(fvsWorkspace); }
  catch (e) { fvsWorkspace.projects = oldProjects; fvsWorkspace.activeId = oldActiveId; renderWorkspaceList(); status("Couldn't delete workspaces because the change could not be saved.", false); return; }
  await applyWorkspaceData(fvsWorkspace.projects[0].data);
  status("All video workspaces deleted.", false);
}
/* FVS-WORKSPACES-END */
if ($("new-workspace")) $("new-workspace").addEventListener("click", function () { newWorkspace().catch(function (e) { console.warn("new workspace failed", e); }); });
if ($("save-workspace")) $("save-workspace").addEventListener("click", function () { saveWorkspace(true); });
if ($("delete-all-videos")) $("delete-all-videos").addEventListener("click", function () { deleteAllWorkspaces().catch(function (e) { console.warn("delete-all failed", e); }); });
(function () {
  const root = document.getElementById("fvsRootEl");
  if (root) {
    root.addEventListener("input", saveWorkspaceSoon, true);
    root.addEventListener("click", saveWorkspaceSoon, true);
  }
  setInterval(function () { if (fvsDirty) saveWorkspace(false); }, 5000);
  document.addEventListener("visibilitychange", function () { if (document.hidden && fvsDirty) saveWorkspace(false); });
  window.addEventListener("beforeunload", function () { if (fvsDirty) { try { saveWorkspace(false); } catch (_) {} } });
  const tabStudio = document.getElementById("faith-sidebar-studio");
  if (tabStudio) tabStudio.addEventListener("click", function () { renderWorkspaceList(); });
  for (const id of ["faith-sidebar-chats", "faith-sidebar-gallery"]) {
    const t = document.getElementById(id);
    if (t) t.addEventListener("click", function () { if (fvsDirty) saveWorkspace(false); });
  }
})();
(async function bootWorkspaces() {
  fvsWorkspace = await fvsLoadPersistedStore();
  ensureWorkspaceStore();
  renderWorkspaceList();
  try { await fvsPersistStore(fvsWorkspace); } catch (e) { console.warn("Initial workspace persistence unavailable", e); }
  await applyWorkspaceData(activeWorkspace().data);
})().catch(function (e) { console.warn("workspace boot failed", e); ensureWorkspaceStore(); renderWorkspaceList(); applyWorkspaceData(activeWorkspace().data); });
window.FaithVideoStudio = { state };

})();
