# Engine

A build combines `index.html`, `speaker.html`, `js/`, `css/` and `vendor/` with the selected project's `app/` content. The renderer does not require the defence's data.

A `.spiral` file is JSON with a `slides` array. Each slide has an `id`, `blocks`, optional `layout`, and `notes`. Keep IDs stable: bookmarks, audio, edits and per-click notes use them.

```json
{
  "title": "My talk",
  "style": "seminar",
  "font": "serif",
  "backdrop": "black",
  "accent": "amber",
  "transition": "fade",
  "slides": [{
    "id": "opening",
    "layout": ["title", "body"],
    "blocks": [
      {"type": "title", "text": "My subject", "at": "title"},
      {"type": "body", "text": "A supporting sentence.", "at": "body"}
    ],
    "notes": "What I want to say."
  }]
}
```

Useful blocks: `title`, `heading`, `body`, `bullets`, `image`, `math`, `math-sequence`, `scene`, `chart`, `columns`, `table`, `quote`. See definitions in `js/blocks.js`. Set `step: true` for click reveals; on bullets this reveals individual items.

Asset paths are relative to the built page, e.g. `assets/figure.png`, stored in `app/assets/`. Emphasis uses `**bold**`; LaTeX uses bundled KaTeX.

## Extensions

Basic scenes include `plot`, `unitCircle`, `vectorField` and `spiral`. The defence registers additional scenes explicitly; the starter does not import them.

```js
import {registerScenes} from '../../../engine/js/manim.js';
registerScenes({
  myScene: {
    label: 'My scene',
    draw(context, width, height, time, args) {
      // Draw here.
    }
  }
});
```

Put this in your project's `extensions/index.js` and list `"./projects/<name>/extensions/index.js"` in `project.json.extensions`. The build preserves those paths. `registerBlocks` in `js/blocks.js` registers custom HTML blocks. Registration rejects duplicate names.

Some shared modules and CSS still provide scientific display helpers. They contain no defence media or participant data.

There is no PPTX importer/exporter. Browser drafts require export for portability. Local builds do not yet hot-reload.
