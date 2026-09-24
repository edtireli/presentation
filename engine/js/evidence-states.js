// Shared by the renderer, cue migration and tests: one source of truth for click order.
export const paperIds = state => [].concat(state.nodes ?? state.node ?? []).filter(Boolean);

// DOM-free selection logic shared by the GPU renderer and scientific flow QA.
// `withinCohorts` is a population boundary, applied to every visible selection
// including related/context lists. It never changes source classifications.
// A caller may pass an existing Map/Set of graph IDs to avoid rebuilding it.
export function resolveEvidenceSelection(state = {}, data = {}, options = {}) {
  const cohorts = data.interactiveCohorts || data.cohorts || {};
  const known = options.knownIds || new Set((data.nodes || []).map(n => n.id));
  const hidden = new Set(options.hidden || state.hiddenNodes || []);
  const missingCohorts = new Set(), missingPaperIds = new Set(), excludedByScope = new Set();
  const rawCache = new Map(), groupMembers = new Map();
  function rawMembers(key, ancestors = new Set()) {
    if (rawCache.has(key)) return rawCache.get(key);
    const spec = cohorts[key];
    if (!spec || ancestors.has(key)) { missingCohorts.add(key); return new Set(); }
    const members = new Set();
    for (const id of spec.members || []) {
      if (known.has(id)) members.add(id); else missingPaperIds.add(id);
    }
    if (spec.parentGroup) {
      const parent = rawMembers(spec.parentGroup, new Set([...ancestors, key]));
      for (const id of members) if (!parent.has(id)) { members.delete(id); excludedByScope.add(id); }
    }
    rawCache.set(key, members);
    return members;
  }
  const union = sets => new Set(sets.flatMap(set => [...set]));
  const boundary = state.withinCohorts?.length ? union(state.withinCohorts.map(key => rawMembers(key))) : null;
  function scopedMembers(key) {
    if (groupMembers.has(key)) return groupMembers.get(key);
    const members = new Set(rawMembers(key));
    for (const id of members) {
      if (hidden.has(id)) members.delete(id);
      else if (boundary && !boundary.has(id)) { members.delete(id); excludedByScope.add(id); }
    }
    groupMembers.set(key, members);
    return members;
  }
  const select = keys => union((keys || []).map(key => scopedMembers(key)));
  const primary = select(state.cohorts), related = select(state.relatedCohorts), context = select(state.contextCohorts);
  for (const id of primary) related.delete(id);
  for (const key of [...(state.countCohorts || []), ...(state.populationBreakdown?.cohorts || [])]) scopedMembers(key);
  if (state.studiesOnly) { primary.clear(); related.clear(); context.clear(); for (const members of groupMembers.values()) members.clear(); }
  return {primary, related, context, groupMembers, boundary, missingCohorts, missingPaperIds, excludedByScope,
    counts: {primary: primary.size, related: related.size, context: context.size}};
}

// Discovery stays visible beside a precise selection, but never joins its
// denominator. Candidate-method nesting is checked against candidate parents.
export function resolveEligibilityCandidates(state = {}, data = {}, options = {}) {
  if (state.studiesOnly) return new Set();
  const cohorts = data.interactiveCohorts || data.cohorts || {};
  const keys = (state.cohorts || []).map(key => key + 'Candidates')
    .filter(key => cohorts[key]?.isCandidateCohort && cohorts[key]?.excludedFromEligibleCounts);
  if (!keys.length) return new Set();
  const candidates = resolveEvidenceSelection({cohorts:keys}, data, options).primary;
  const selected = resolveEvidenceSelection(state, data, options).primary;
  for (const id of selected) candidates.delete(id);
  return candidates;
}

export const focusThemesFor = (state = {}) => {
  const authored = [].concat(state.focusThemes || []).filter(Boolean);
  if (authored.length) return [...new Set(authored)];
  const focus = state.focus || 'all';
  return focus === 'all' ? [] : [...new Set(String(focus).split('+').filter(Boolean))];
};
export function resolveEvidenceStates(b) {
  const raw = Array.isArray(b.states) && b.states.length ? b.states : [{focus:'all'}];
  const authored = raw.reduce((out, state) => {
    out.push(state.inheritPrevious && out.length ? {...out.at(-1), ...state} : {...state});
    return out;
  }, []);
  const detail = s => Boolean(s.node || s.nodes?.length || s.figure || s.video || s.figures?.length || s.tag || s.text || s.citation || s.citations?.length);
  const key = s => s.sequenceKey || paperIds(s).join('|');
  const focusKey = s => focusThemesFor(s).join('+') || s.focus || 'all';
  const year = s => [].concat(s.citations ?? s.citation ?? []).filter(Boolean)
    .map(x => typeof x === 'string' ? x : x.text || x.label || '').join(' ').match(/\b(?:19|20)\d{2}\b/)?.[0] || null;
  const circuit = (focus, themes) => ({focus, ...(themes.length ? {focusThemes:themes} : {}), title:false, subtitle:false, circuitOnly:true});
  const out = [];
  let lastFocus = null, lastFocusKey = null, activeKey = '';
  if (!b.paperSequence) out.push(...authored);
  else authored.forEach((s, i) => {
    const focus = s.focus || lastFocus || 'all', themes = focusThemesFor({...s,focus}), fkey = themes.join('+') || focus;
    if (!detail(s)) {
      if (!(out.at(-1)?.circuitOnly && focusKey(out.at(-1)) === fkey)) out.push({...s,...circuit(focus,themes)});
      lastFocus=focus;lastFocusKey=fkey;activeKey='';return;
    }
    if (!out.length || lastFocusKey !== fkey) out.push(circuit(focus,themes));
    const ids = paperIds(s), pkey = key(s), context = {focus,...(themes.length ? {focusThemes:themes} : {})};
    if (ids.length && activeKey !== pkey) out.push({...context,
      ...(s.nodes?.length ? {nodes:ids} : {node:ids[0]}),title:false,subtitle:false,nodeOnly:true,nodeLabelYear:true,
      ...(ids.length === 1 ? {publicationYear:year(s)} : {})});
    out.push({...s,...context,title:false,nodeLabelYear:true,...(ids.length===1 ? {publicationYear:year(s)} : {})});
    lastFocus=focus;lastFocusKey=fkey;activeKey=pkey;
    const next=authored[i+1], nextDetail=Boolean(next && detail(next));
    const nextFocusKey=next ? focusKey({...next,focus:next.focus || focus}) : '';
    const continuing=nextDetail && key(next) && key(next)===pkey && nextFocusKey===fkey;
    if (!continuing && ((nextDetail && nextFocusKey===fkey) || (!next && b.returnAfterLast!==false))) {
      out.push(circuit(focus,themes));activeKey='';
    }
  });
  const states=b.paperSequence ? out.filter((s,i)=>!(s.circuitOnly && out[i-1]?.circuitOnly && focusKey(out[i-1])===focusKey(s))) : out;
  // Older decks indexed copy after expansion; new decks attach it to the actual paper.
  return states.map((s,i)=>b.audienceStory?.[i] ? {...s,audienceStory:b.audienceStory[i]} : s);
}
