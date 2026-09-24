// Only the defence loads its anatomical models and custom p-Brain scenes.
import {registerScenes} from '../../../engine/js/manim.js';
import {registerBlocks, stepped} from '../../../engine/js/blocks.js';
import {FIGURES} from './figures.js';
import {BIOLOGY} from './biology.js';
import {QUANTUM} from '../../../engine/js/addons/quantum.js';
import {renderDefenseOverview} from './defense-overview.js';
import {renderPbrainPuzzle} from './pbrain-puzzle.js';
import {installDefenseWatermark} from './watermark.js';

registerScenes({...FIGURES, ...BIOLOGY, ...QUANTUM});
registerBlocks({
  'defense-overview': {
    label: 'Opening research overview', icon: '◉', fields: [],
    make: () => ({type: 'defense-overview'}),
    render: b => stepped(renderDefenseOverview(b), b),
  },
  'pbrain-puzzle': {
    label: 'p-Brain 3D modules', icon: '◇',
    fields: [{k: 'mode', t: 'text'}, {k: 'states', t: 'json'}],
    make: () => ({type: 'pbrain-puzzle', mode: 'modules', args: {revealSteps: 3}}),
    render: b => stepped(renderPbrainPuzzle(b), b),
  },
});

await installDefenseWatermark();
