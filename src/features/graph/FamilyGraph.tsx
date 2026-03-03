import type { FamilyTreeDataV1, UUID } from "../../lib/domain/types";
import { getPrimaryDisplayName } from "../../lib/domain/types";
import type { Subgraph } from "../../lib/domain/subgraph";

type Props = {
	data: FamilyTreeDataV1;
	subgraph: Subgraph;
	selectedId: UUID;
	onSelect: (id: UUID) => void;
};

export function FamilyGraph({ data, subgraph, selectedId, onSelect }: Props) {
	// 簡易レイアウト：
	// y = level * rowHeight
	// 同じlevelは x方向に並べる（安定ソート：名前→id）
	const rowHeight = 120;
	const colWidth = 180;
	const nodeW = 140;
	const nodeH = 44;

	// level -> nodes
	const levelMap = new Map<number, UUID[]>();
	for (const id of subgraph.nodes) {
		const lv = subgraph.levelById[id] ?? 0;
		const arr = levelMap.get(lv) ?? [];
		arr.push(id);
		levelMap.set(lv, arr);
	}

	const levels = Array.from(levelMap.keys()).sort((a, b) => a - b);

	for (const lv of levels) {
		const arr = levelMap.get(lv)!;

		if (lv === 0) {
			// root中央、兄弟は名前順で周囲
			arr.sort((a, b) => {
				if (a === subgraph.rootId) return -1;
				if (b === subgraph.rootId) return 1;
				const na = data.people[a] ? getPrimaryDisplayName(data.people[a]) : a;
				const nb = data.people[b] ? getPrimaryDisplayName(data.people[b]) : b;
				return na.localeCompare(nb, "ja");
			});
		} else if (lv > 0) {
			// 子孫：親ID順にグループ
			arr.sort((a, b) => {
				const pa =
					subgraph.edges.find((e) => e.type === "parent-child" && e.child === a)
						?.parent ?? "";
				const pb =
					subgraph.edges.find((e) => e.type === "parent-child" && e.child === b)
						?.parent ?? "";
				if (pa !== pb) return pa.localeCompare(pb);
				const na = data.people[a] ? getPrimaryDisplayName(data.people[a]) : a;
				const nb = data.people[b] ? getPrimaryDisplayName(data.people[b]) : b;
				return na.localeCompare(nb, "ja");
			});
		} else {
			// 祖先：子ID順にグループ
			arr.sort((a, b) => {
				const ca =
					subgraph.edges.find(
						(e) => e.type === "parent-child" && e.parent === a,
					)?.child ?? "";
				const cb =
					subgraph.edges.find(
						(e) => e.type === "parent-child" && e.parent === b,
					)?.child ?? "";
				if (ca !== cb) return ca.localeCompare(cb);
				const na = data.people[a] ? getPrimaryDisplayName(data.people[a]) : a;
				const nb = data.people[b] ? getPrimaryDisplayName(data.people[b]) : b;
				return na.localeCompare(nb, "ja");
			});
		}

		const couples = subgraph.edges.filter(
			(e: any) => e.type === "couple",
		) as any[];
		for (const c of couples) {
			const la = subgraph.levelById[c.a] ?? 0;
			const lb = subgraph.levelById[c.b] ?? 0;
			if (la !== lv || lb !== lv) continue; // 同じlevelの夫婦だけ寄せる

			const i = arr.indexOf(c.a);
			const j = arr.indexOf(c.b);
			if (i === -1 || j === -1) continue;

			if (Math.abs(i - j) > 1) {
				const moveId = c.b; // bをaの隣に寄せる（固定）
				const from = arr.indexOf(moveId);
				if (from === -1) continue;
				const [id] = arr.splice(from, 1);
				const ai = arr.indexOf(c.a);
				arr.splice(ai + 1, 0, id);
			}
		}
		levelMap.set(lv, arr);
	}

	// 座標
	const pos: Record<string, { x: number; y: number }> = {};
	const maxCols = Math.max(
		...levels.map((lv) => (levelMap.get(lv) ?? []).length),
		1,
	);
	const width = Math.max(800, maxCols * colWidth + 80);
	const height = Math.max(400, levels.length * rowHeight + 80);

	for (let r = 0; r < levels.length; r++) {
		const lv = levels[r];
		const arr = levelMap.get(lv)!;
		const y = 40 + r * rowHeight;

		// 中央寄せ
		const totalW = arr.length * colWidth;
		const startX = Math.max(40, (width - totalW) / 2);

		for (let c = 0; c < arr.length; c++) {
			const id = arr[c];
			const x = startX + c * colWidth;
			pos[id] = { x, y };
		}
	}

	function centerOf(id: UUID) {
		const p = pos[id];
		return { cx: p.x + nodeW / 2, cy: p.y + nodeH / 2 };
	}

	// edge lines
	const parentChildLines = subgraph.edges
		.filter((e) => e.type === "parent-child")
		.map((e: any) => {
			const p1 = pos[e.parent];
			const p2 = pos[e.child];
			if (!p1 || !p2) return null;
			const { cx: x1, cy: y1 } = centerOf(e.parent);
			const { cx: x2, cy: y2 } = centerOf(e.child);
			return { id: e.id, x1, y1, x2, y2 };
		})
		.filter(Boolean) as Array<{
		id: string;
		x1: number;
		y1: number;
		x2: number;
		y2: number;
	}>;

	const coupleLines = subgraph.edges
		.filter((e) => e.type === "couple")
		.map((e: any) => {
			const p1 = pos[e.a];
			const p2 = pos[e.b];
			if (!p1 || !p2) return null;
			const { cx: x1, cy: y1 } = centerOf(e.a);
			const { cx: x2, cy: y2 } = centerOf(e.b);
			// yは平均にして水平っぽく（同段なら同じになる）
			const y = (y1 + y2) / 2;
			return { id: e.id, x1, y1: y, x2, y2: y };
		})
		.filter(Boolean) as Array<{
		id: string;
		x1: number;
		y1: number;
		x2: number;
		y2: number;
	}>;

	return (
		<div
			style={{ overflow: "auto", border: "1px solid #ddd", borderRadius: 8 }}
		>
			<svg width={width} height={height} style={{ display: "block" }}>
				{/* parent-child edges */}
				{parentChildLines.map((l) => (
					<line
						key={l.id}
						x1={l.x1}
						y1={l.y1}
						x2={l.x2}
						y2={l.y2}
						strokeWidth={2}
					/>
				))}

				{/* couple edges (横線) */}
				{coupleLines.map((l) => (
					<line
						key={l.id}
						x1={l.x1}
						y1={l.y1}
						x2={l.x2}
						y2={l.y2}
						strokeWidth={2}
					/>
				))}

				{/* nodes */}
				{subgraph.nodes.map((id) => {
					const p = pos[id];
					if (!p) return null;
					const isSelected = id === selectedId;
					const label = data.people[id]
						? getPrimaryDisplayName(data.people[id])
						: `(missing:${id.slice(0, 8)})`;
					return (
						<g
							key={id}
							onClick={() => onSelect(id)}
							style={{ cursor: "pointer" }}
						>
							<rect
								x={p.x}
								y={p.y}
								width={nodeW}
								height={nodeH}
								rx={10}
								ry={10}
								strokeWidth={isSelected ? 3 : 1}
								fill="white"
							/>
							<text x={p.x + 10} y={p.y + 26} fontSize={14}>
								{label.length > 12 ? label.slice(0, 12) + "…" : label}
							</text>
							<text x={p.x + 10} y={p.y + 40} fontSize={10} opacity={0.6}>
								{id.slice(0, 8)}
							</text>
						</g>
					);
				})}
			</svg>
		</div>
	);
}
