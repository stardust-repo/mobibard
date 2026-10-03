/* Ordered channel/audio/group tree. No DOM or editor state is mutated here. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MobiBardItemTree = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const key = (item) => `${item.kind}:${item.id}`;
  const parent = (item) => item.parentId == null ? null : String(item.parentId);
  const copy = (items) => items.map((item) => ({ kind: item.kind, id: String(item.id), parentId: parent(item) }));
  const siblings = (items, parentId, omit = null) => items.filter((item) => parent(item) === parentId && key(item) !== omit);
  function flatten(items) {
    const result = [];
    for (const item of siblings(items, null)) {
      result.push(item);
      if (item.kind === "group") result.push(...siblings(items, String(item.id)));
    }
    return copy(result);
  }
  // Import the previous channel-array / beforeChannelId representation once.
  // Including collapsed children is essential: collapsing never changes order.
  function legacy(channels, groups, audios) {
    const groupMap = new Map(groups.map((g) => [String(g.id), g]));
    const channelMap = new Map(channels.map((c) => [String(c.id), c]));
    const roots = [], children = new Map(groups.map((g) => [String(g.id), []]));
    const seen = new Set();
    const entry = (kind, item, parentId = null) => ({ kind, id: String(item.id), parentId });
    for (const c of channels) {
      const gid = c.groupId == null ? null : String(c.groupId);
      if (groupMap.has(gid)) {
        if (!seen.has(gid)) { roots.push(entry("group", groupMap.get(gid))); seen.add(gid); }
        children.get(gid).push(entry("channel", c, gid));
      } else roots.push(entry("channel", c));
    }
    for (const g of groups) if (!seen.has(String(g.id))) roots.push(entry("group", g));
    const rootChannelKey = (id) => {
      const c = channelMap.get(String(id));
      return c ? (groupMap.has(String(c.groupId)) ? `group:${c.groupId}` : `channel:${c.id}`) : null;
    };
    for (const g of groups) {
      if (children.get(String(g.id)).length || g.beforeChannelId == null) continue;
      const anchor = rootChannelKey(g.beforeChannelId);
      const node = roots.find((r) => key(r) === `group:${g.id}`);
      if (!node || !anchor || anchor === key(node)) continue;
      roots.splice(roots.indexOf(node), 1);
      const at = roots.findIndex((r) => key(r) === anchor);
      roots.splice(at < 0 ? roots.length : at, 0, node);
    }
    for (const a of audios) {
      const gid = groupMap.has(String(a.groupId)) ? String(a.groupId) : null;
      const list = gid == null ? roots : children.get(gid);
      const anchor = a.beforeChannelId == null ? null : (gid == null ? rootChannelKey(a.beforeChannelId) : `channel:${a.beforeChannelId}`);
      const at = anchor ? list.findIndex((r) => key(r) === anchor) : -1;
      list.splice(at < 0 ? list.length : at, 0, entry("audio", a, gid));
    }
    const result = [];
    for (const r of roots) { result.push(r); if (r.kind === "group") result.push(...children.get(r.id)); }
    return copy(result);
  }
  // Keep the explicit mixed order, reconcile additions/deletions from normal
  // editor commands, and always use actual membership for non-drag operations.
  function reconcile(saved, fallback) {
    if (!Array.isArray(saved) || !saved.length) return copy(fallback);
    const valid = new Map(fallback.map((r) => [key(r), r]));
    const previous = new Map();
    for (const r of saved) {
      if (!r || !["channel", "audio", "group"].includes(r.kind)) continue;
      const actual = valid.get(key(r));
      if (!actual || parent(r) !== parent(actual)) continue;
      if (!previous.has(key(r))) previous.set(key(r), actual);
    }
    const result = [];
    const parents = [null, ...fallback.filter((r) => r.kind === "group").map((r) => r.id)];
    for (const gid of parents) {
      const defaults = siblings(fallback, gid);
      const list = [...previous.values()].filter((r) => parent(r) === gid);
      for (let i = 0; i < defaults.length; i += 1) {
        const r = defaults[i];
        if (list.some((v) => key(v) === key(r))) continue;
        let at = -1;
        for (let j = i - 1; j >= 0; j -= 1) {
          const before = list.findIndex((v) => key(v) === key(defaults[j]));
          if (before >= 0) { at = before + 1; break; }
        }
        if (at < 0) {
          for (let j = i + 1; j < defaults.length; j += 1) {
            at = list.findIndex((v) => key(v) === key(defaults[j]));
            if (at >= 0) break;
          }
        }
        list.splice(at < 0 ? list.length : at, 0, r);
      }
      result.push(...list);
    }
    return flatten(result);
  }
  // index always refers to the destination siblings AFTER removing the source.
  function move(layout, sourceKey, parentId, index) {
    const source = layout.find((r) => key(r) === sourceKey);
    const gid = parentId == null ? null : String(parentId);
    if (!source || (source.kind === "group" && gid != null)) return copy(layout);
    if (gid != null && !layout.some((r) => r.kind === "group" && r.id === gid)) return copy(layout);
    const movingKeys = new Set([sourceKey]);
    if (source.kind === "group") for (const r of layout) if (parent(r) === source.id) movingKeys.add(key(r));
    const rest = copy(layout.filter((r) => !movingKeys.has(key(r))));
    const list = siblings(rest, gid);
    const at = Math.max(0, Math.min(list.length, Math.trunc(Number(index) || 0)));
    const moved = { ...source, parentId: gid };
    list.splice(at, 0, moved);
    const combined = rest.filter((r) => parent(r) !== gid).concat(list);
    if (source.kind === "group") combined.push(...layout.filter((r) => parent(r) === source.id));
    return flatten(combined);
  }
  function signature(layout) { return JSON.stringify(layout.map((r) => [key(r), parent(r)])); }
  function visible(layout, collapsed, previewKey = null) {
    return layout.filter((r) => parent(r) == null || !collapsed.has(parent(r)) || key(r) === previewKey);
  }
  // One hit-test for both leaf types and root group blocks. It uses the current
  // preview membership, never the original data/drag-start position. The dragged
  // row's own rectangle is a hold zone, not a hole that falls through to "end".
  function resolve(layout, sourceKey, measured, y, direction = 0) {
    const source = layout.find((r) => key(r) === sourceKey);
    if (!source || !Number.isFinite(y) || !measured.length) return null;
    const byKey = new Map(layout.map((r) => [key(r), r]));
    const rows = measured.filter((r) => byKey.has(r.key) && r.bottom > r.top)
      .map((r) => ({ ...r, item: byKey.get(r.key) }));
    if (!rows.length) return null;
    const slot = (gid, at) => ({ parentId: gid, index: at });
    const rootList = siblings(layout, null, sourceKey);
    const rootAt = (gkey, after = false) => {
      const i = rootList.findIndex((r) => key(r) === gkey);
      return slot(null, i < 0 ? rootList.length : i + (after ? 1 : 0));
    };
    if (y < rows[0].top + 2) return slot(null, 0);
    if (y > rows[rows.length - 1].bottom + 2) return slot(null, rootList.length);
    const movingRows = rows.filter((r) => r.key === sourceKey || (source.kind === "group" && parent(r.item) === source.id));
    const own = movingRows.find((r) => y >= r.top && y <= r.bottom);
    if (own) {
      if (source.kind !== "group" && parent(source) != null && direction > 0) {
        const members = siblings(layout, parent(source));
        if (key(members[members.length - 1]) === sourceKey && y > own.bottom - 3) return rootAt(`group:${parent(source)}`, true);
      }
      return null;
    }
    if (source.kind === "group") {
      const blocks = rootList.map((r) => {
        const blockRows = rows.filter((v) => v.key === key(r) || (r.kind === "group" && parent(v.item) === r.id));
        if (!blockRows.length) return null;
        return { item: r, top: blockRows[0].top, bottom: blockRows[blockRows.length - 1].bottom };
      }).filter(Boolean);
      if (!blocks.length) return null;
      const hit = blocks.reduce((best, r) => {
        const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
        return !best || d < best.d ? { ...r, d } : best;
      }, null);
      return rootAt(key(hit.item), y >= (hit.top + hit.bottom) / 2);
    }
    const candidates = rows.filter((r) => r.key !== sourceKey);
    if (!candidates.length) return slot(null, 0);
    const hit = candidates.reduce((best, r) => {
      const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      return !best || d < best.d ? { ...r, d } : best;
    }, null);
    const target = hit.item;
    const gid = target.kind === "group" ? target.id : parent(target);
    if (gid != null) {
      const header = rows.find((r) => r.key === `group:${gid}`);
      const block = rows.filter((r) => r.key === `group:${gid}` || parent(r.item) === gid);
      const bottom = block[block.length - 1].bottom;
      // Only the actual upper boundary means outside-before. The lower edge of
      // a folder label NEVER means after the entire group.
      if (header && y < header.top + Math.min(9, (header.bottom - header.top) * 0.25)) return rootAt(`group:${gid}`);
      if (y > bottom + 2) return rootAt(`group:${gid}`, true);
      const members = siblings(layout, gid, sourceKey);
      if (parent(source) !== gid) {
        const fromAbove = layout.findIndex((r) => key(r) === sourceKey) < layout.findIndex((r) => key(r) === `group:${gid}`);
        return slot(gid, fromAbove ? 0 : members.length);
      }
      // A collapsed header has no child slots to traverse. Keep the entry
      // slot while hovering it; otherwise a bottom entry becomes first on the
      // very next pointermove despite the pointer never crossing a child.
      if (target.kind === "group") return header?.collapsed ? null : slot(gid, 0);
      const at = members.findIndex((r) => key(r) === hit.key);
      return slot(gid, Math.max(0, at) + (y >= (hit.top + hit.bottom) / 2 ? 1 : 0));
    }
    return rootAt(hit.key, y >= (hit.top + hit.bottom) / 2);
  }
  return { key, parent, copy, flatten, siblings, legacy, reconcile, move, signature, visible, resolve };
});
