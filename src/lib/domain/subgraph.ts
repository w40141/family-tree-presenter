import type { FamilyTreeDataV1, Relationship, UUID } from "./types";

export type SubgraphParams = {
	rootId: UUID;
	upDepth: number; // 0..n
	downDepth: number; // 0..n
};

export type Subgraph = {
	rootId: UUID;
	nodes: UUID[]; // 表示対象
	edges: Relationship[]; // 表示対象内の親子辺のみ（今は）
	levelById: Record<UUID, number>; // root=0, ancestors=-1.., descendants=+1.., siblings=0
	siblings: UUID[];
};

function buildParentChildIndex(data: FamilyTreeDataV1) {
	const parentsOf: Record<UUID, UUID[]> = {};
	const childrenOf: Record<UUID, UUID[]> = {};

	for (const rel of Object.values(data.relationships)) {
		if (rel.type !== "parent-child") continue;
		const { parent, child } = rel;
		(parentsOf[child] ||= []).push(parent);
		(childrenOf[parent] ||= []).push(child);
	}

	return { parentsOf, childrenOf };
}

export function buildSubgraph(
	data: FamilyTreeDataV1,
	params: SubgraphParams,
): Subgraph {
	const { rootId, upDepth, downDepth } = params;
	const { parentsOf, childrenOf } = buildParentChildIndex(data);

	const nodesSet = new Set<UUID>();
	const levelById: Record<UUID, number> = {};
	nodesSet.add(rootId);
	levelById[rootId] = 0;

	// ---- ancestors ----
	// store smallest depth encountered
	const seenAnc = new Map<UUID, number>();
	const qA: Array<{ id: UUID; d: number }> = [{ id: rootId, d: 0 }];

	while (qA.length) {
		const { id, d } = qA.shift()!;
		if (d >= upDepth) continue;

		for (const p of parentsOf[id] ?? []) {
			const nd = d + 1;
			const prev = seenAnc.get(p);
			if (prev !== undefined && prev <= nd) continue;
			seenAnc.set(p, nd);

			nodesSet.add(p);
			levelById[p] = -nd; // ancestor levels negative
			qA.push({ id: p, d: nd });
		}
	}

	// ---- descendants ----
	const seenDes = new Map<UUID, number>();
	const qD: Array<{ id: UUID; d: number }> = [{ id: rootId, d: 0 }];

	while (qD.length) {
		const { id, d } = qD.shift()!;
		if (d >= downDepth) continue;

		for (const c of childrenOf[id] ?? []) {
			const nd = d + 1;
			const prev = seenDes.get(c);
			if (prev !== undefined && prev <= nd) continue;
			seenDes.set(c, nd);

			nodesSet.add(c);
			// descendant levels positive
			// 祖先として既にlevelが付いてる場合がある（特殊ケース）ので、rootからの近い方を採用
			if (levelById[c] === undefined || Math.abs(levelById[c]) > nd)
				levelById[c] = nd;
			qD.push({ id: c, d: nd });
		}
	}

	// ---- siblings (share any parent) ----
	const parents = parentsOf[rootId] ?? [];
	const sibSet = new Set<UUID>();
	for (const p of parents) {
		for (const c of childrenOf[p] ?? []) {
			if (c !== rootId) sibSet.add(c);
		}
	}
	const siblings = Array.from(sibSet);
	for (const sid of siblings) {
		nodesSet.add(sid);
		levelById[sid] = 0; // siblings on same level as root
	}

	// ---- spouses of root (always include) ----
	for (const rel of Object.values(data.relationships)) {
		if (rel.type !== "couple") continue;
		if (rel.a === rootId) {
			nodesSet.add(rel.b);
			levelById[rel.b] = 0;
		} else if (rel.b === rootId) {
			nodesSet.add(rel.a);
			levelById[rel.a] = 0;
		}
	}

	const nodes = Array.from(nodesSet);

	// ---- edges: within nodes (parent-child + couple) ----
	const edges: Relationship[] = [];
	for (const rel of Object.values(data.relationships)) {
		if (rel.type === "parent-child") {
			if (nodesSet.has(rel.parent) && nodesSet.has(rel.child)) edges.push(rel);
		} else if (rel.type === "couple") {
			if (nodesSet.has(rel.a) && nodesSet.has(rel.b)) edges.push(rel);
		}
	}

	return { rootId, nodes, edges, levelById, siblings };
}
