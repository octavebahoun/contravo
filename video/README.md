# Vidéo de présentation

Tout ce qu'il faut pour produire la vidéo de présentation de Contravo, hors
montage : le jeu de données, le script, le storyboard et l'outil qui filme
l'application réelle.

Le montage lui-même se fait dans la pipeline Remotion installée à
`/home/precieux/pipevideo` — voir la dernière section de
[plan-tournage.md](plan-tournage.md).

## Le parti pris

Aucune animation abstraite, aucun mockup. Chaque plan est l'application qui
tourne, pilotée par Chrome sur un jeu de données de démonstration cohérent. Pour
un SaaS B2B, la seule chose qui convainc est que la chaîne fonctionne
réellement — et une reconstitution ne le prouve pas.

## Les fichiers

| Fichier | Rôle |
|---|---|
| [script.md](script.md) | La voix off, scène par scène, avec l'intention de chaque plan et un tableau des affirmations à vérifier dans le code |
| [storyboard.json](storyboard.json) | Le storyboard au schéma de la pipeline — à copier dans `pipevideo/` |
| [plan-tournage.md](plan-tournage.md) | L'ordre de tournage, les prérequis, les trois plans à fournir |
| [capture/shots.ts](capture/shots.ts) | La liste des plans automatisés, sous forme de données |
| [capture/record.ts](capture/record.ts) | L'enregistreur : Chrome piloté + ffmpeg |
| `media/` | Les médias fournis, non regénérables — versionnés |
| `out/` | Les clips filmés, régénérables, ignorés par git |

## Démarrage rapide

```bash
npx tsx lib/db/seed-demo.ts    # jeu de données
pnpm dev                       # dans un autre terminal
npx tsx video/capture/record.ts --headful 3
```

`--headful` ouvre une vraie fenêtre : c'est la façon la plus rapide de voir
pourquoi un sélecteur ne trouve rien. Sans numéro de scène, toutes les scènes
automatisables sont filmées d'affilée.

Lire [plan-tournage.md](plan-tournage.md) avant la vraie session : trois prises
modifient l'état de la base et doivent passer dans l'ordre.

## Ce que l'enregistreur fait et qu'un `page.screenshot` ne fait pas

- **Un curseur visible.** Le screencast de Chrome capture la page, pas le
  pointeur. Sans curseur de synthèse, les clics donnent l'impression que
  l'interface réagit à rien.
- **Des mouvements interpolés.** Un `scrollBy` atterrit en une frame, ce qui
  ressemble à une coupe et non à un mouvement. Scrolls et déplacements de souris
  sont lissés dans le temps.
- **Des identifiants résolus au tournage.** Les plans référencent des numéros de
  document (`DEV-2026-0003`), jamais des UUID : le jeu de démo est re-semé
  régulièrement et ses identifiants changent à chaque fois.
- **Une capture à 1,5×.** Fenêtre de 1280×720 rendue en 1920×1080 : l'interface
  apparaît 50 % plus grande qu'en 1080p natif, ce qui fait toute la différence sur
  un écran de téléphone.

## Prérequis

Déjà présents sur cette machine, vérifiés le 17/08/2026 :

- `puppeteer` 25.7.0 avec Chrome 152 (`page.screencast` disponible)
- `ffmpeg` 8.0.1
- pipeline Remotion installée dans `/home/precieux/pipevideo` (Edge-TTS, voix
  françaises, bibliothèque de sons et de musiques)

Aucune variable à ajouter : la capture se connecte sous le compte de démonstration
créé par le seed (voir [plan-tournage.md](plan-tournage.md)).
