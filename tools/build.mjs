import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {packagePages} from './package-pages.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function build(name = 'starter', {pages = false, reuse = null} = {}) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw Error('Use a simple project name.');
  const projectRoot = path.join(root, name === 'starter' ? 'examples' : 'projects', name);
  const config = JSON.parse(await fs.readFile(path.join(projectRoot, 'project.json'), 'utf8'));
  if (config.name !== name) throw Error('Project name must match its directory.');
  const output = path.join(root, 'dist', name);
  await fs.mkdir(path.dirname(output), {recursive: true});
  // This is only the generated dist/<validated project name> directory.
  await fs.rm(output, {recursive: true, force: true});
  await fs.cp(path.join(projectRoot, 'app'), output, {recursive: true});
  await fs.cp(path.join(root, 'engine'), path.join(output, 'engine'), {recursive: true,
    filter: src => !['index.html', 'speaker.html'].includes(path.basename(src))});
  for (const file of ['index.html', 'speaker.html'])
    await fs.copyFile(path.join(root, 'engine', file), path.join(output, file));
  await fs.copyFile(path.join(projectRoot, 'project.json'), path.join(output, 'project.json'));
  if (config.extensions?.length) {
    await fs.cp(path.join(projectRoot, 'extensions'), path.join(output, 'projects', name, 'extensions'), {recursive: true});
  }
  await fs.access(path.join(output, config.deck));
  console.log(`Built dist/${name}/`);
  if (pages) {
    if (name !== 'defense') throw Error('The custom hosted presenter service belongs to the defence project. Deploy other dist folders as ordinary static sites.');
    await packagePages(output, path.join(root, 'dist', 'pages'), path.join(projectRoot, 'site'), config, reuse);
  }
  return output;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), reuseAt = args.indexOf('--reuse');
  await build(args[0] || 'starter', {pages: args.includes('--pages'), reuse: reuseAt >= 0 ? args[reuseAt + 1] : null});
}
