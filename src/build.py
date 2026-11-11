"""Assemble the Brasmak experience into:
   dist/artifact.html  -> page body for the claude.ai artifact (skeleton added at publish)
   dist/site/index.html + robots.txt + sitemap.xml -> production bundle
"""
import json, pathlib, sys

SRC = pathlib.Path(__file__).parent      # site/src
SITE = SRC.parent                        # site/
DIST = SITE / "_artifact"
DIST.mkdir(parents=True, exist_ok=True)

THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js"
GSAP_URL = "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"
ST_URL = "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js"
FONTS = "https://fonts.googleapis.com/css2?family=Michroma&family=Instrument+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"

css = (SRC / "styles.css").read_text()
body = (SRC / "body.html").read_text()
js = "\n".join((SRC / f).read_text() for f in ["ui.js", "gl-core.js", "worlds.js", "main.js"])
script = "(function(){\n'use strict';\n" + js + "\n})();"
(DIST / "app.js").write_text(script)

ld_business = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": "Brasmak Refrigeração",
    "description": "Assistência técnica especializada em refrigeração e eletrodomésticos em Vitória da Conquista: geladeiras, freezers, lavadoras, tanquinhos, micro-ondas, bebedouros e ar-condicionado automotivo.",
    "url": "https://brasmakrefrigeracao.com.br/",
    "image": "https://brasmakrefrigeracao.com.br/uploads/og-image.jpg",
    "logo": "https://brasmakrefrigeracao.com.br/uploads/logo-ice.webp",
    "telephone": "+55-77-3427-3008",
    "email": "contato@brasmakrefrigeracao.com.br",
    "address": {"@type": "PostalAddress", "streetAddress": "R. Gérson Sáles, 191, São Vicente", "addressLocality": "Vitória da Conquista", "addressRegion": "BA", "postalCode": "45000-145", "addressCountry": "BR"},
    "areaServed": "Vitória da Conquista e região",
    "openingHoursSpecification": [
        {"@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], "opens": "08:00", "closes": "12:00"},
        {"@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], "opens": "14:00", "closes": "18:00"},
        {"@type": "OpeningHoursSpecification", "dayOfWeek": "Saturday", "opens": "08:00", "closes": "12:00"},
    ],
}
faq = [
    ("Vocês consertam todos os tipos de geladeiras?", "Sim. Fazemos manutenção em todos os modelos, incluindo Frost Free, Inverter, duplex e side-by-side."),
    ("Atendem em domicílio?", "Sim. Oferecemos atendimento técnico em domicílio em Vitória da Conquista e região."),
    ("O orçamento é cobrado?", "Não. Você pode solicitar um orçamento sem compromisso pelo WhatsApp ou telefone."),
    ("Os serviços têm garantia?", "Sim. Todos os serviços têm garantia, e usamos peças originais nos reparos."),
    ("Qual o horário de atendimento?", "De segunda a sexta, das 8h às 12h e das 14h às 18h. Aos sábados, das 8h às 12h."),
]
ld_faq = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
    {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]}
ld = (f'<script type="application/ld+json">{json.dumps(ld_business, ensure_ascii=False)}</script>\n'
      f'<script type="application/ld+json">{json.dumps(ld_faq, ensure_ascii=False)}</script>')

libs = (f'<script src="{THREE_URL}" crossorigin="anonymous"></script>\n'
        f'<script src="{GSAP_URL}"></script>\n<script src="{ST_URL}"></script>')

meta_desc = "Assistência técnica especializada em refrigeração e eletrodomésticos em Vitória da Conquista. Conserto de geladeiras, freezers, lavadoras, tanquinhos, microondas, bebedouros e ar-condicionado automotivo."
fonts = (f'<link rel="preconnect" href="https://fonts.googleapis.com">\n'
         f'<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
         f'<link rel="stylesheet" href="{FONTS}">')

# ---- artifact page (no doctype/html/head/body: the host adds them) ----
artifact = f"""<title>Brasmak Refrigeração</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="{meta_desc}">
{fonts}
<style>
{css}
</style>
{body}
{ld}
{libs}
<script>
{script}
</script>
"""
(DIST / "artifact.html").write_text(artifact)

# ---- production page ----
prod = f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Brasmak Refrigeração | Assistência técnica em Vitória da Conquista</title>
<meta name="description" content="{meta_desc}">
<meta name="keywords" content="refrigeração, conserto de geladeira, assistência técnica, Vitória da Conquista, Brasmak, manutenção de eletrodomésticos, ar-condicionado automotivo">
<meta name="author" content="Brasmak Refrigeração">
<meta name="robots" content="index, follow">
<meta name="theme-color" content="#03060b">
<link rel="canonical" href="https://brasmakrefrigeracao.com.br/">
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="Brasmak Refrigeração">
<meta property="og:title" content="Brasmak Refrigeração | Assistência técnica em Vitória da Conquista">
<meta property="og:description" content="Conserto de geladeiras, freezers, lavadoras, microondas, bebedouros e ar-condicionado automotivo. Orçamento sem compromisso pelo WhatsApp.">
<meta property="og:url" content="https://brasmakrefrigeracao.com.br/">
<meta property="og:image" content="https://brasmakrefrigeracao.com.br/uploads/og-image.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Brasmak Refrigeração: conserto de eletrodomésticos em Vitória da Conquista.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Brasmak Refrigeração | Assistência técnica em Vitória da Conquista">
<meta name="twitter:description" content="Conserto de geladeiras, freezers, lavadoras, microondas, bebedouros e ar-condicionado automotivo.">
<meta name="twitter:image" content="https://brasmakrefrigeracao.com.br/uploads/og-image.jpg">
<link rel="preload" as="script" href="{THREE_URL}" crossorigin="anonymous">
{fonts}
<style>
:root{{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}
body{{margin:0}} img{{max-width:100%}} [hidden]{{display:none!important}}
{css}
</style>
{ld}
</head>
<body>
{body}
{libs}
<script src="app.js" defer></script>
</body>
</html>
"""
(SITE / "index.html").write_text(prod)
(SITE / "app.js").write_text(script)
(SITE / "robots.txt").write_text("User-agent: *\nAllow: /\n\nSitemap: https://brasmakrefrigeracao.com.br/sitemap.xml\n")
(SITE / "sitemap.xml").write_text("""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://brasmakrefrigeracao.com.br/</loc><lastmod>2026-11-10</lastmod><changefreq>monthly</changefreq><priority>1.0</priority></url>
</urlset>
""")
print("artifact bytes:", len(artifact.encode()), " app.js bytes:", len(script.encode()))
