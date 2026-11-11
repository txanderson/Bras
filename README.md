# Brasmak Refrigeração — The Art of Cooling

Site cinematográfico em uma página, com eletrodomésticos 3D procedurais (Three.js) controlados pela rolagem (GSAP ScrollTrigger).

## Arquivos

```
index.html    página completa (HTML semântico, SEO, Open Graph, JSON-LD LocalBusiness + FAQPage)
app.js        toda a lógica (UI, motor 3D, cenas, efeitos) — sem build, sem dependências locais
robots.txt
sitemap.xml
src/          código-fonte modular (styles.css, body.html, ui.js, gl-core.js, worlds.js, main.js) + build.py
```

`app.js` e `index.html` são gerados por `python3 src/build.py` a partir de `src/`. Para editar textos, altere `src/body.html`; para cenas 3D, `src/worlds.js`; depois rode o build.

## Publicar

1. **Não substitua o site atual de imediato.** Faça backup completo do servidor/hospedagem atual (arquivos + `uploads/`).
2. Suba `index.html`, `app.js`, `robots.txt` e `sitemap.xml` primeiro em uma pasta de teste (ex.: `/nova/`) ou subdomínio de homologação.
3. Teste no celular e no computador (lista abaixo). Só então troque o `index.html` da raiz.
4. Para voltar atrás, restaure o `index.html` antigo do backup.

O site carrega três bibliotecas por CDN (Three.js r147 via jsDelivr, GSAP 3.12.2 + ScrollTrigger via cdnjs) e fontes do Google Fonts. Se preferir hospedar tudo localmente, baixe esses três arquivos e troque as URLs no `index.html`.

## Checklist de teste antes de publicar

- Rolar devagar e rápido, voltar, recarregar no meio da página, abrir `/#contato` direto.
- Portas da geladeira, tampa do freezer, porta e tambor da lavadora, água do bebedouro, micro-ondas, tanquinho, ar automotivo.
- Gelo na tela entre o freezer e a lavadora nos dois sentidos.
- Todos os botões de WhatsApp abrem conversa com (77) 98867-1946.
- Celular Android e iPhone; computador sem placa de vídeo dedicada.

## Recursos externos e licenças

| Recurso | Uso | Licença |
|---|---|---|
| Three.js r147 | motor 3D | MIT |
| GSAP 3.12.2 + ScrollTrigger | linha do tempo da rolagem | GSAP Standard License (uso gratuito, inclusive comercial) |
| Michroma, Instrument Sans, IBM Plex Mono (Google Fonts) | tipografia | SIL Open Font License |
| Modelos 3D | geladeira, freezer, lavadora, bebedouro, micro-ondas, tanquinho, painel automotivo | **Criados em código para este projeto** (sem arquivos de terceiros) |
| Texturas, ambiente de reflexo, sons | aço escovado, tambor perfurado, granito, estúdio, vento/água/gelo | **Gerados em tempo real** (canvas e WebAudio), sem arquivos de terceiros |

## Dados comerciais usados (todos do site atual)

WhatsApp (77) 98867-1946 · Telefone (77) 3427-3008 · R. Gérson Sáles, 191, São Vicente, Vitória da Conquista/BA, 45000-145 · Seg. a sex. 8h–12h e 14h–18h, sáb. 8h–12h · contato@brasmakrefrigeracao.com.br · 15 anos de experiência · todas as marcas · peças originais · garantia · orçamento sem compromisso · atendimento em domicílio.

## Pendências que dependem da Brasmak

- **Logotipo**: o site usa um logotipo tipográfico provisório. Substitua pelo arquivo oficial (`/uploads/logo-ice.webp`) no cabeçalho e rodapé.
- **Redes sociais**: não há perfis no site atual; adicione os links no rodapé quando existirem.
- **Depoimentos**: o site atual mostra três depoimentos sem fonte verificável; ficaram de fora. Se forem reais, podem voltar (ideal: avaliações do Google Meu Negócio).
- **Fotos reais da equipe/oficina**: não havia fotos no site; a seção "Sobre" está pronta para recebê-las.
