import { useEffect, useMemo, useState } from "react";
import type {
	FamilyTreeDataV1,
	Person,
	Relationship,
	UUID,
} from "../lib/domain/types";
import { getPrimaryDisplayName } from "../lib/domain/types";
import { validateAndNormalizeImportedJson } from "../lib/domain/validate";
import { clearAll, loadCurrent, saveCurrent } from "../lib/storage/db";
import {
	checkIntegrity,
	wouldCreateParentChildCycle,
} from "../lib/domain/integrity";
import { buildSubgraph } from "../lib/domain/subgraph";

// ---- utils ----
function nowIso() {
	return new Date().toISOString();
}

// ブラウザの crypto.randomUUID を使う（対応ブラウザ前提）
function uuid(): UUID {
	return crypto.randomUUID();
}

function emptyTree(): FamilyTreeDataV1 {
	const t = nowIso();
	return {
		schemaVersion: "1.0",
		meta: {
			title: "Untitled",
			createdAt: t,
			updatedAt: t,
			app: { name: "family-tree", version: "0.1.0" },
		},
		people: {},
		relationships: {},
	};
}

function makePerson(display: string): Person {
	return {
		id: uuid(),
		names: [
			{
				id: uuid(),
				type: "unknown",
				display: display.trim(),
				parts: [],
				period: { start: null, end: null },
				primary: true,
				note: null,
			},
		],
		sex: "unknown",
		vital: { birth: null, death: null },
		honseki: null,
		notes: "",
	};
}

function makeCouple(a: UUID, b: UUID): Relationship {
	return {
		id: uuid(),
		type: "couple",
		a,
		b,
		status: "unknown",
		start: null,
		end: null,
		note: "",
		confidence: 1,
	};
}

function makeParentChild(
	parent: UUID,
	child: UUID,
	kind: "biological" | "adoptive" | "step" | "unknown",
): Relationship {
	return {
		id: uuid(),
		type: "parent-child",
		parent,
		child,
		kind,
		status: "unknown" as any, // TS回避用。実行時には使われない
		start: null,
		end: null,
		note: "",
		confidence: 1,
	} as any;
}

function getPersonIdsFromRelationship(rel: Relationship): UUID[] {
	if (rel.type === "couple") return [rel.a, rel.b];
	return [rel.parent, rel.child];
}

function deletePersonCascade(
	data: FamilyTreeDataV1,
	personId: UUID,
): FamilyTreeDataV1 {
	const people = { ...data.people };
	const relationships = { ...data.relationships };

	if (!people[personId]) return data;

	// 関係を先に消す
	for (const [rid, rel] of Object.entries(relationships)) {
		const pids = getPersonIdsFromRelationship(rel);
		if (pids.includes(personId)) {
			delete relationships[rid];
		}
	}

	// 人物を消す
	delete people[personId];

	return {
		...data,
		meta: { ...data.meta, updatedAt: nowIso() },
		people,
		relationships,
	};
}

function safePersonName(data: FamilyTreeDataV1, pid: UUID): string {
	const p = data.people[pid];
	return p ? getPrimaryDisplayName(p) : `(missing:${pid.slice(0, 8)})`;
}

function existsCouple(data: FamilyTreeDataV1, a: UUID, b: UUID): boolean {
	const x = a < b ? a : b;
	const y = a < b ? b : a;

	for (const rel of Object.values(data.relationships)) {
		if (rel.type !== "couple") continue;
		const ra = rel.a < rel.b ? rel.a : rel.b;
		const rb = rel.a < rel.b ? rel.b : rel.a;
		if (ra === x && rb === y) return true;
	}
	return false;
}

function existsParentChild(
	data: FamilyTreeDataV1,
	parent: UUID,
	child: UUID,
	kind: "biological" | "adoptive" | "step" | "unknown",
): boolean {
	for (const rel of Object.values(data.relationships)) {
		if (rel.type !== "parent-child") continue;
		if (rel.parent === parent && rel.child === child && rel.kind === kind)
			return true;
	}
	return false;
}

export function useFamilyTree() {
	const [data, setData] = useState<FamilyTreeDataV1 | null>(null);
	const [error, setError] = useState<string | null>(null);

	// 入力系UI state（分割後も共通で使う）
	const [newPersonName, setNewPersonName] = useState("");
	const [editNameById, setEditNameById] = useState<Record<string, string>>({});

	const [coupleA, setCoupleA] = useState<UUID>("");
	const [coupleB, setCoupleB] = useState<UUID>("");

	const [pcParent, setPcParent] = useState<UUID>("");
	const [pcChild, setPcChild] = useState<UUID>("");
	const [pcKind, setPcKind] = useState<
		"biological" | "adoptive" | "step" | "unknown"
	>("biological");

	const [relationshipSearch, setRelationshipSearch] = useState("");
	const [relationshipTypeFilter, setRelationshipTypeFilter] = useState<
		"all" | "couple" | "parent-child"
	>("all");

	const [selectedPersonId, setSelectedPersonId] = useState<UUID>("");
	const [upDepth, setUpDepth] = useState(3);
	const [downDepth, setDownDepth] = useState(3);

	// 起動時復元
	useEffect(() => {
		(async () => {
			const saved = await loadCurrent();
			setData(saved ?? emptyTree());
		})().catch((e) => setError(String(e)));
	}, []);

	// デバウンス保存
	useEffect(() => {
		if (!data) return;
		const id = window.setTimeout(() => {
			saveCurrent(data).catch((e) => setError(String(e)));
		}, 1000);
		return () => window.clearTimeout(id);
	}, [data]);

	useEffect(() => {
		if (!data) return;
		if (selectedPersonId && data.people[selectedPersonId]) return;
		const first = Object.keys(data.people)[0];
		if (first) setSelectedPersonId(first);
	}, [data, selectedPersonId]);

	const peopleList = useMemo(() => {
		if (!data) return [];
		return Object.values(data.people).sort((p1, p2) =>
			getPrimaryDisplayName(p1).localeCompare(getPrimaryDisplayName(p2), "ja"),
		);
	}, [data]);

	const relationshipList = useMemo(() => {
		if (!data) return [];

		const keyword = relationshipSearch.trim().toLowerCase();

		return Object.values(data.relationships)
			.filter((rel) => {
				// type filter
				if (
					relationshipTypeFilter !== "all" &&
					rel.type !== relationshipTypeFilter
				) {
					return false;
				}

				// search filter
				if (!keyword) return true;

				if (rel.type === "couple") {
					const nameA = safePersonName(data, rel.a).toLowerCase();
					const nameB = safePersonName(data, rel.b).toLowerCase();
					return nameA.includes(keyword) || nameB.includes(keyword);
				} else {
					const nameP = safePersonName(data, rel.parent).toLowerCase();
					const nameC = safePersonName(data, rel.child).toLowerCase();
					return nameP.includes(keyword) || nameC.includes(keyword);
				}
			})
			.sort((r1, r2) => {
				const t = r1.type.localeCompare(r2.type);
				if (t !== 0) return t;
				const a1 =
					r1.type === "couple"
						? safePersonName(data, r1.a)
						: safePersonName(data, r1.parent);
				const a2 =
					r2.type === "couple"
						? safePersonName(data, r2.a)
						: safePersonName(data, r2.parent);
				return a1.localeCompare(a2, "ja");
			});
	}, [data, relationshipSearch, relationshipTypeFilter]);

	const relationshipCountByPerson = useMemo(() => {
		const map: Record<string, number> = {};
		if (!data) return map;
		for (const rel of Object.values(data.relationships)) {
			for (const pid of getPersonIdsFromRelationship(rel)) {
				map[pid] = (map[pid] ?? 0) + 1;
			}
		}
		return map;
	}, [data]);

	const issues = useMemo(() => {
		if (!data) return [];
		return checkIntegrity(data);
	}, [data]);

	const errorCount = useMemo(
		() => issues.filter((x) => x.severity === "error").length,
		[issues],
	);
	const warnCount = useMemo(
		() => issues.filter((x) => x.severity === "warn").length,
		[issues],
	);

	const subgraph = useMemo(() => {
		if (!data) return null;
		const root =
			selectedPersonId && data.people[selectedPersonId]
				? selectedPersonId
				: Object.keys(data.people)[0];
		if (!root) return null;
		return buildSubgraph(data, { rootId: root, upDepth, downDepth });
	}, [data, selectedPersonId, upDepth, downDepth]);

	// ---- IO ----
	async function newTree() {
		setError(null);
		const t = emptyTree();
		setData(t);
		await saveCurrent(t);
	}

	async function clearLocal() {
		setError(null);
		await clearAll();
		setData(emptyTree());
	}

	async function importFile(file: File) {
		setError(null);
		const text = await file.text();
		let raw: unknown;
		try {
			raw = JSON.parse(text);
		} catch {
			setError("JSONのパースに失敗しました。");
			return;
		}
		const res = validateAndNormalizeImportedJson(raw);
		if (!res.ok) {
			setError(res.error);
			return;
		}
		setData(res.data);
	}

	function exportFile() {
		if (!data) return;

		const errs = checkIntegrity(data).filter((x) => x.severity === "error");
		if (errs.length > 0) {
			const ok = confirm(
				`整合性エラーが ${errs.length} 件ありますが、エクスポートしてもよろしいですか？`,
			);
			if (!ok) return;
		}

		setError(null);
		const exportObj = {
			...data,
			meta: { ...data.meta, updatedAt: nowIso(), exportedAt: nowIso() },
			relationships: Object.values(data.relationships).sort((r1, r2) =>
				r1.type.localeCompare(r2.type),
			),
		};

		const blob = new Blob([JSON.stringify(exportObj, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "family-tree.json";
		a.click();
		URL.revokeObjectURL(url);
	}

	// ---- People ----
	function addPerson() {
		if (!data) return;
		setError(null);
		const display = newPersonName.trim();
		if (!display) {
			setError("名前（display）は必須です。");
			return;
		}

		const p = makePerson(display);
		setData({
			...data,
			meta: { ...data.meta, updatedAt: nowIso() },
			people: { ...data.people, [p.id]: p },
		});

		// 自動選択（関係追加を速くする）
		if (!coupleA) setCoupleA(p.id);
		else if (!coupleB && coupleA !== p.id) setCoupleB(p.id);
		else {
			setCoupleA(p.id);
			setCoupleB("");
		}

		if (!pcParent) setPcParent(p.id);
		else if (!pcChild && pcParent !== p.id) setPcChild(p.id);
		else {
			setPcParent(p.id);
			setPcChild("");
		}

		setNewPersonName("");
	}

	function updatePrimaryDisplay(personId: UUID) {
		if (!data) return;
		setError(null);
		const p = data.people[personId];
		if (!p) return;

		const newDisplay = (editNameById[personId] ?? "").trim();
		if (!newDisplay) {
			setError("名前（display）は空にできません。");
			return;
		}
		const names = p.names.map((n) =>
			n.primary ? { ...n, display: newDisplay } : n,
		);

		setData({
			...data,
			meta: { ...data.meta, updatedAt: nowIso() },
			people: { ...data.people, [personId]: { ...p, names } },
		});
	}

	function deletePerson(personId: UUID) {
		if (!data) return;
		setError(null);
		const relCount = relationshipCountByPerson[personId] ?? 0;
		const msg =
			relCount > 0
				? `この人物を削除します（関係 ${relCount} 件も同時に削除）。よろしいですか？`
				: "この人物を削除します。よろしいですか？";
		if (!confirm(msg)) return;

		setData(deletePersonCascade(data, personId));
	}

	// ---- Relationships ----
	function addCouple() {
		if (!data) return;
		setError(null);
		if (!coupleA || !coupleB)
			return setError("カップルにする2人を選んでください。");
		if (coupleA === coupleB)
			return setError("同じ人物同士はカップルにできません。");
		if (!data.people[coupleA] || !data.people[coupleB])
			return setError("選択した人物が存在しません。");
		if (existsCouple(data, coupleA, coupleB)) {
			return setError(
				"同じカップル関係が既に存在します（statusは既存の関係を編集してください）。",
			);
		}
		const rel = makeCouple(coupleA, coupleB);
		setData({
			...data,
			meta: { ...data.meta, updatedAt: nowIso() },
			relationships: { ...data.relationships, [rel.id]: rel },
		});
		setCoupleB(""); // 次の入力を楽に
	}

	function addParentChild() {
		if (!data) return;
		setError(null);
		if (!pcParent || !pcChild) return setError("親と子を選んでください。");
		if (pcParent === pcChild)
			return setError("同じ人物を親と子にすることはできません。");
		if (!data.people[pcParent] || !data.people[pcChild])
			return setError("選択した人物が存在しません。");
		if (existsParentChild(data, pcParent, pcChild, pcKind)) {
			return setError("同じ親子関係（parent/child/kind）が既に存在します。");
		}
		if (wouldCreateParentChildCycle(data, pcParent, pcChild)) {
			return setError("この親子関係は循環を生じさせるため追加できません。");
		}

		const rel = makeParentChild(pcParent, pcChild, pcKind);
		setData({
			...data,
			meta: { ...data.meta, updatedAt: nowIso() },
			relationships: { ...data.relationships, [rel.id]: rel },
		});
		setPcChild(""); // 次の入力を楽に
	}

	function deleteRelationship(relId: UUID) {
		if (!data) return;
		setError(null);
		const rel = data.relationships[relId];
		if (!rel) return;

		const label =
			rel.type === "couple"
				? `couple: ${safePersonName(data, rel.a)} × ${safePersonName(data, rel.b)}`
				: `parent-child: ${safePersonName(data, rel.parent)} → ${safePersonName(data, rel.child)}`;

		if (!confirm(`この関係を削除します。\n${label}`)) return;

		const relationships = { ...data.relationships };
		delete relationships[relId];
		setData({
			...data,
			meta: { ...data.meta, updatedAt: nowIso() },
			relationships,
		});
	}

	function updateRelationship(relId: UUID, patch: Partial<Relationship>) {
		if (!data) return;
		setError(null);
		const rel = data.relationships[relId];
		if (!rel) return;
		const updated = { ...rel, ...patch } as Relationship;
		setData({
			...data,
			meta: { ...data.meta, updatedAt: nowIso() },
			relationships: { ...data.relationships, [relId]: updated },
		});
	}

	return {
		// state
		data,
		error,
		setError,

		// derived
		peopleList,
		relationshipList,
		relationshipCountByPerson,
		safePersonName,

		// UI states
		newPersonName,
		setNewPersonName,
		editNameById,
		setEditNameById,

		coupleA,
		setCoupleA,
		coupleB,
		setCoupleB,

		pcParent,
		setPcParent,
		pcChild,
		setPcChild,
		pcKind,
		setPcKind,

		// actions
		newTree,
		clearLocal,
		importFile,
		exportFile,

		addPerson,
		updatePrimaryDisplay,
		deletePerson,

		addCouple,
		addParentChild,
		deleteRelationship,
		updateRelationship,

		relationshipSearch,
		setRelationshipSearch,
		relationshipTypeFilter,
		setRelationshipTypeFilter,

		issues,
		errorCount,
		warnCount,

		selectedPersonId,
		setSelectedPersonId,
		upDepth,
		setUpDepth,
		downDepth,
		setDownDepth,
		subgraph,
	};
}
