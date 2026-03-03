import { useEffect, useMemo, useState } from "react";
import type {
	FamilyTreeDataV1,
	Person,
	Relationship,
	UUID,
} from "./lib/domain/types";
import { getPrimaryDisplayName } from "./lib/domain/types";
import { validateAndNormalizeImportedJson } from "./lib/domain/validate";
import { clearAll, loadCurrent, saveCurrent } from "./lib/storage/db";

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

// ---- App ----
export default function App() {
	const [data, setData] = useState<FamilyTreeDataV1 | null>(null);
	const [error, setError] = useState<string | null>(null);

	const [newPersonName, setNewPersonName] = useState("");
	const [editNameById, setEditNameById] = useState<Record<string, string>>({});

	const [coupleA, setCoupleA] = useState<UUID>("");
	const [coupleB, setCoupleB] = useState<UUID>("");

	// 起動時に復元
	useEffect(() => {
		(async () => {
			const saved = await loadCurrent();
			if (saved) setData(saved);
			else setData(emptyTree());
		})().catch((e) => setError(String(e)));
	}, []);

	// デバウンス保存（1秒）
	useEffect(() => {
		if (!data) return;
		const id = window.setTimeout(() => {
			saveCurrent(data).catch((e) => setError(String(e)));
		}, 1000);
		return () => window.clearTimeout(id);
	}, [data]);

	const peopleList = useMemo(() => {
		if (!data) return [];
		return Object.values(data.people).sort((p1, p2) =>
			getPrimaryDisplayName(p1).localeCompare(getPrimaryDisplayName(p2), "ja"),
		);
	}, [data]);

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

	if (!data) return <div style={{ padding: 16 }}>Loading...</div>;

	// ---- handlers ----
	async function onNew() {
		setError(null);
		const t = emptyTree();
		setData(t);
		await saveCurrent(t);
	}

	async function onClearAll() {
		setError(null);
		await clearAll();
		setData(emptyTree());
	}

	async function onImportFile(file: File) {
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

	function onExport() {
		setError(null);

		// エクスポート用に relationships を配列にしてソート
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

	function onAddPerson() {
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
		setNewPersonName("");
	}

	function onChangeDisplay(personId: UUID) {
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

	function onDeletePerson(personId: UUID) {
		setError(null);
		const p = data.people[personId];
		if (!p) return;

		const relCount = relationshipCountByPerson[personId] ?? 0;
		const msg =
			relCount > 0
				? `この人物を削除します（関係 ${relCount} 件も同時に削除）。よろしいですか？`
				: "この人物を削除します。よろしいですか？";
		if (!confirm(msg)) return;

		setData(deletePersonCascade(data, personId));
	}

	function onAddCouple() {
		setError(null);
		if (!coupleA || !coupleB) {
			setError("カップルにする2人を選んでください。");
			return;
		}
		if (coupleA === coupleB) {
			setError("同じ人物同士はカップルにできません。");
			return;
		}
		if (!data.people[coupleA] || !data.people[coupleB]) {
			setError("選択した人物が存在しません。");
			return;
		}
		const rel = makeCouple(coupleA, coupleB);
		setData({
			...data,
			meta: { ...data.meta, updatedAt: nowIso() },
			relationships: { ...data.relationships, [rel.id]: rel },
		});
	}

	// ---- UI ----
	return (
		<div
			style={{
				padding: 16,
				maxWidth: 900,
				margin: "0 auto",
				fontFamily: "system-ui, sans-serif",
			}}
		>
			<h1>Family Tree (local only)</h1>

			<div
				style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}
			>
				<button onClick={onNew}>New (0スタート)</button>

				<label style={{ display: "inline-block" }}>
					<input
						type="file"
						accept="application/json"
						style={{ display: "none" }}
						onChange={(e) => {
							const f = e.target.files?.[0];
							if (f) onImportFile(f).catch((err) => setError(String(err)));
							e.currentTarget.value = "";
						}}
					/>
					<span
						style={{
							padding: "6px 10px",
							border: "1px solid #ccc",
							borderRadius: 6,
							cursor: "pointer",
						}}
					>
						Import (Upload JSON)
					</span>
				</label>

				<button onClick={onExport}>Export (Download JSON)</button>
				<button onClick={onClearAll} title="IndexedDBの保存も消します">
					Clear local storage
				</button>
			</div>

			{error && (
				<div
					style={{
						background: "#ffe3e3",
						padding: 10,
						borderRadius: 6,
						marginBottom: 12,
					}}
				>
					<b>Error:</b> {error}
				</div>
			)}

			<section
				style={{
					border: "1px solid #ddd",
					borderRadius: 8,
					padding: 12,
					marginBottom: 12,
				}}
			>
				<h2 style={{ marginTop: 0 }}>人物を追加</h2>
				<div style={{ display: "flex", gap: 8 }}>
					<input
						value={newPersonName}
						onChange={(e) => setNewPersonName(e.target.value)}
						placeholder="display（必須）例：山田 太郎"
						style={{ flex: 1, padding: 8 }}
					/>
					<button onClick={onAddPerson}>追加</button>
				</div>
			</section>

			<section
				style={{
					border: "1px solid #ddd",
					borderRadius: 8,
					padding: 12,
					marginBottom: 12,
				}}
			>
				<h2 style={{ marginTop: 0 }}>カップル関係を追加（簡易）</h2>
				<div
					style={{
						display: "flex",
						gap: 8,
						flexWrap: "wrap",
						alignItems: "center",
					}}
				>
					<select
						value={coupleA}
						onChange={(e) => setCoupleA(e.target.value)}
						style={{ padding: 6 }}
					>
						<option value="">人物Aを選択</option>
						{peopleList.map((p) => (
							<option key={p.id} value={p.id}>
								{getPrimaryDisplayName(p)}
							</option>
						))}
					</select>

					<select
						value={coupleB}
						onChange={(e) => setCoupleB(e.target.value)}
						style={{ padding: 6 }}
					>
						<option value="">人物Bを選択</option>
						{peopleList.map((p) => (
							<option key={p.id} value={p.id}>
								{getPrimaryDisplayName(p)}
							</option>
						))}
					</select>

					<button onClick={onAddCouple}>追加</button>
					<span style={{ opacity: 0.7 }}>
						※再婚OK（同一人物が複数coupleを持てます）
					</span>
				</div>
			</section>

			<section
				style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}
			>
				<h2 style={{ marginTop: 0 }}>人物一覧（{peopleList.length}）</h2>

				{peopleList.length === 0 ? (
					<div style={{ opacity: 0.7 }}>
						まだ人物がいません。上で追加してください。
					</div>
				) : (
					<div style={{ display: "grid", gap: 10 }}>
						{peopleList.map((p) => {
							const current = getPrimaryDisplayName(p);
							const relCount = relationshipCountByPerson[p.id] ?? 0;
							return (
								<div
									key={p.id}
									style={{
										border: "1px solid #eee",
										borderRadius: 8,
										padding: 10,
									}}
								>
									<div
										style={{
											display: "flex",
											justifyContent: "space-between",
											gap: 8,
											alignItems: "center",
										}}
									>
										<b>{current}</b>
										<div
											style={{ display: "flex", gap: 8, alignItems: "center" }}
										>
											<span style={{ opacity: 0.7 }}>関係: {relCount}</span>
											<button onClick={() => onDeletePerson(p.id)}>削除</button>
										</div>
									</div>

									<div style={{ display: "flex", gap: 8, marginTop: 8 }}>
										<input
											value={editNameById[p.id] ?? current}
											onChange={(e) =>
												setEditNameById({
													...editNameById,
													[p.id]: e.target.value,
												})
											}
											style={{ flex: 1, padding: 8 }}
										/>
										<button onClick={() => onChangeDisplay(p.id)}>
											名前更新
										</button>
									</div>

									<div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
										id: {p.id}
									</div>
								</div>
							);
						})}
					</div>
				)}
			</section>

			<section style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
				relationships: {Object.keys(data.relationships).length}
			</section>
		</div>
	);
}
