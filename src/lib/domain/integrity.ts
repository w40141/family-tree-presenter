import type { FamilyTreeDataV1, Relationship, UUID } from "./types";

export type IssueSeverity = "error" | "warn";

export type Issue = {
	severity: IssueSeverity;
	code: string;
	message: string;
	relatedIds?: string[]; // personId / relationshipIdなど
};

function getPersonIdsFromRelationship(rel: Relationship): UUID[] {
	return rel.type === "couple" ? [rel.a, rel.b] : [rel.parent, rel.child];
}

function buildParentChildAdj(data: FamilyTreeDataV1): Map<UUID, UUID[]> {
	const adj = new Map<UUID, UUID[]>();
	for (const rel of Object.values(data.relationships)) {
		if (rel.type !== "parent-child") continue;
		const arr = adj.get(rel.parent) ?? [];
		arr.push(rel.child);
		adj.set(rel.parent, arr);
	}
	return adj;
}

function reachable(adj: Map<UUID, UUID[]>, start: UUID, target: UUID): boolean {
	if (start === target) return true;
	const stack: UUID[] = [start];
	const seen = new Set<UUID>([start]);

	while (stack.length) {
		const cur = stack.pop()!;
		const nexts = adj.get(cur) ?? [];
		for (const nx of nexts) {
			if (nx === target) return true;
			if (!seen.has(nx)) {
				seen.add(nx);
				stack.push(nx);
			}
		}
	}
	return false;
}

function findCycles(adj: Map<UUID, UUID[]>): UUID[][] {
	const cycles: UUID[][] = [];
	const visited = new Set<UUID>();
	const onStack = new Set<UUID>();
	const parent = new Map<UUID, UUID | null>();

	function dfs(u: UUID) {
		visited.add(u);
		onStack.add(u);

		for (const v of adj.get(u) ?? []) {
			if (!visited.has(v)) {
				parent.set(v, u);
				dfs(v);
			} else if (onStack.has(v)) {
				// cycle found: v ... u -> v
				const cycle: UUID[] = [v];
				let cur: UUID | null = u;
				while (cur && cur !== v) {
					cycle.push(cur);
					cur = parent.get(cur) ?? null;
				}
				cycle.push(v);
				cycle.reverse();
				cycles.push(cycle);
			}
		}
		onStack.delete(u);
	}

	for (const u of adj.keys()) {
		if (!visited.has(u)) {
			parent.set(u, null);
			dfs(u);
		}
	}
	return cycles;
}

/** 追加しようとしている parent->child が循環を作るか */
export function wouldCreateParentChildCycle(
	data: FamilyTreeDataV1,
	parentId: UUID,
	childId: UUID,
): boolean {
	const adj = buildParentChildAdj(data);
	// 新しい辺 parent->child を足した結果、child から parent に到達できるなら循環
	// (child -> ... -> parent が既にある状態で parent->child を足すとループ)
	return reachable(adj, childId, parentId);
}

export function checkIntegrity(data: FamilyTreeDataV1): Issue[] {
	const issues: Issue[] = [];

	// 1) 参照整合性（people存在チェック）
	const people = data.people;
	for (const [rid, rel] of Object.entries(data.relationships)) {
		if ((rel as any).id !== rid) {
			issues.push({
				severity: "error",
				code: "REL_ID_MISMATCH",
				message: `relationshipのキーとidが不一致: ${rid}`,
				relatedIds: [rid],
			});
		}
		for (const pid of getPersonIdsFromRelationship(rel)) {
			if (!people[pid]) {
				issues.push({
					severity: "error",
					code: "REL_REF_MISSING_PERSON",
					message: `relationshipが存在しない人物を参照: rel=${rid} pid=${pid}`,
					relatedIds: [rid, pid],
				});
			}
		}
		if (rel.type === "couple" && rel.a === rel.b) {
			issues.push({
				severity: "error",
				code: "COUPLE_SAME_PERSON",
				message: `coupleのaとbが同一: rel=${rid}`,
				relatedIds: [rid],
			});
		}
		if (rel.type === "parent-child" && rel.parent === rel.child) {
			issues.push({
				severity: "error",
				code: "PARENT_CHILD_SAME_PERSON",
				message: `親子が同一人物: rel=${rid}`,
				relatedIds: [rid],
			});
		}
	}

	// 2) peopleキーとperson.id一致、primary名の存在（最小）
	for (const [pid, p] of Object.entries(people)) {
		if (p.id !== pid) {
			issues.push({
				severity: "error",
				code: "PERSON_ID_MISMATCH",
				message: `peopleのキーとperson.idが不一致: ${pid}`,
				relatedIds: [pid],
			});
		}
		const primaryCount = p.names.filter((n) => n.primary).length;
		if (primaryCount !== 1) {
			issues.push({
				severity: "error",
				code: "PERSON_PRIMARY_NAME",
				message: `primary nameがちょうど1つではない: ${pid}`,
				relatedIds: [pid],
			});
		}
		const display = (p.names.find((n) => n.primary)?.display ?? "").trim();
		if (!display) {
			issues.push({
				severity: "error",
				code: "PERSON_EMPTY_DISPLAY",
				message: `primary displayが空: ${pid}`,
				relatedIds: [pid],
			});
		}
	}

	// 3) 親子の循環検出（致命）
	const adj = buildParentChildAdj(data);
	const cycles = findCycles(adj);
	for (const cyc of cycles) {
		issues.push({
			severity: "error",
			code: "PARENT_CHILD_CYCLE",
			message: `親子関係に循環があります: ${cyc.map((x) => x.slice(0, 8)).join(" -> ")}`,
			relatedIds: cyc,
		});
	}

	// 4) 生物学的親が3人以上（警告） ※養親は別枠
	const bioParentCount: Record<UUID, number> = {};
	for (const rel of Object.values(data.relationships)) {
		if (rel.type !== "parent-child") continue;
		if (rel.kind !== "biological") continue;
		bioParentCount[rel.child] = (bioParentCount[rel.child] ?? 0) + 1;
	}
	for (const [childId, n] of Object.entries(bioParentCount)) {
		if (n > 2) {
			issues.push({
				severity: "warn",
				code: "TOO_MANY_BIO_PARENTS",
				message: `実親(biological)が3人以上になっています: child=${childId.slice(0, 8)} count=${n}`,
				relatedIds: [childId],
			});
		}
	}

	return issues;
}
