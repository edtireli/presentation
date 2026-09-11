// Re-key retained click-local drafts simultaneously, so a moved route cannot
// overwrite another old route. Removed content remains in the backup payload.
export function migrateRouteEdits(edits, fromHash, migrations = []) {
  let next = structuredClone(edits), changed = false;
  for (const migration of migrations) {
    if (!migration.fromHashes?.includes(fromHash)) continue;
    const mapped = {};
    for (const [route, entry] of Object.entries(next)) {
      const target = Object.hasOwn(migration.routes, route) ? migration.routes[route] : route;
      if (target) {
        let value = entry;
        // Explicit maps preserve equation-node edits when a slide removes a state.
        const selectors = migration.selectorsByRoute?.[route];
        if (selectors) {
          value = Object.fromEntries(Object.entries(value).flatMap(([selector, edit]) => {
            const nextSelector = Object.hasOwn(selectors, selector) ? selectors[selector] : selector;
            if (nextSelector !== selector) changed = true;
            return nextSelector ? [[nextSelector, edit]] : [];
          }));
        }
        if (migration.stateSelectors) {
          const previousValue = value;
          value = {};
          for (const [selector, edit] of Object.entries(previousValue)) {
            const match = selector.match(/^(\[data-block="[^"]+"\] > div:nth-of-type\(2\) > div:nth-of-type\()(\d+)(\))(.*)$/);
            if (!match) { value[selector] = edit; continue; }
            const oldState = +match[2] - 1;
            const selectorRoute = route.slice(0,route.lastIndexOf('/')+1) + oldState;
            const nextRoute = Object.hasOwn(migration.routes,selectorRoute) ? migration.routes[selectorRoute] : selectorRoute;
            if (!nextRoute) { changed = true; continue; }
            let suffix = match[4];
            const items = migration.figureItemMaps?.[selectorRoute];
            const item = suffix.match(/^( > div:nth-of-type\(1\) > figure:nth-of-type\(1\) > div:nth-of-type\()(\d+)(\).*)$/);
            if (items && item && Object.hasOwn(items,item[2])) {
              if (items[item[2]] === null) { changed=true; continue; }
              suffix = item[1] + items[item[2]] + item[3];
            }
            const nextSelector = match[1] + (+nextRoute.split('/').at(-1)+1) + match[3] + suffix;
            value[nextSelector] = edit;
            if(nextSelector!==selector)changed=true;
          }
        }
        mapped[target] = migration.merge ? {...(mapped[target] || {}), ...value} : value;
      }
      if (target !== route) changed = true;
    }
    next = mapped;
  }
  return {edits:next,changed};
}
