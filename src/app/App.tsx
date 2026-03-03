import { IOToolbar } from "../features/io/IOToolbar";
import { PeopleSection } from "../features/people/PeopleSection";
import { RelationshipSection } from "../features/relationships/RelationshipSection";
import { useFamilyTree } from "./useFamilyTree";
import { FamilyGraph } from "../features/graph/FamilyGraph";

export default function App() {
	const ft = useFamilyTree();

	if (!ft.data) return <div style={{ padding: 16 }}>Loading...</div>;

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

			<IOToolbar
				error={ft.error}
				onNew={ft.newTree}
				onImport={ft.importFile}
				onExport={ft.exportFile}
				onClearLocal={ft.clearLocal}
			/>

			<section
				style={{
					border: "1px solid #ddd",
					borderRadius: 8,
					padding: 12,
					marginBottom: 12,
				}}
			>
				<h2 style={{ marginTop: 0 }}>整合性チェック</h2>
				<div
					style={{
						display: "flex",
						gap: 12,
						flexWrap: "wrap",
						marginBottom: 8,
					}}
				>
					<span>errors: {ft.errorCount}</span>
					<span>warns: {ft.warnCount}</span>
				</div>

				{ft.issues.length === 0 ? (
					<div style={{ opacity: 0.7 }}>問題なし</div>
				) : (
					<div style={{ display: "grid", gap: 6 }}>
						{ft.issues.slice(0, 20).map((it: any, idx: number) => (
							<div key={idx} style={{ fontSize: 12, opacity: 0.9 }}>
								<b>[{it.severity}]</b> {it.code}: {it.message}
							</div>
						))}
						{ft.issues.length > 20 && (
							<div style={{ fontSize: 12, opacity: 0.7 }}>
								…他 {ft.issues.length - 20} 件
							</div>
						)}
					</div>
				)}
			</section>

			<section
				style={{
					border: "1px solid #ddd",
					borderRadius: 8,
					padding: 12,
					marginBottom: 12,
				}}
			>
				<h2 style={{ marginTop: 0 }}>家系図（部分表示）</h2>

				{Object.keys(ft.data.people).length === 0 ? (
					<div style={{ opacity: 0.7 }}>人物がいません。</div>
				) : (
					<>
						<div
							style={{
								display: "flex",
								gap: 8,
								flexWrap: "wrap",
								alignItems: "center",
								marginBottom: 10,
							}}
						>
							<label style={{ display: "flex", gap: 6, alignItems: "center" }}>
								中心人物
								<select
									value={ft.selectedPersonId}
									onChange={(e) => ft.setSelectedPersonId(e.target.value)}
									style={{ padding: 6 }}
								>
									{ft.peopleList.map((p: any) => (
										<option key={p.id} value={p.id}>
											{p.names?.find((n: any) => n.primary)?.display ??
												p.id.slice(0, 8)}
										</option>
									))}
								</select>
							</label>

							<label style={{ display: "flex", gap: 6, alignItems: "center" }}>
								尊属（上）
								<input
									type="number"
									min={0}
									max={10}
									value={ft.upDepth}
									onChange={(e) =>
										ft.setUpDepth(
											Math.max(0, Math.min(10, Number(e.target.value) || 0)),
										)
									}
									style={{ width: 70, padding: 6 }}
								/>
							</label>

							<label style={{ display: "flex", gap: 6, alignItems: "center" }}>
								卑属（下）
								<input
									type="number"
									min={0}
									max={10}
									value={ft.downDepth}
									onChange={(e) =>
										ft.setDownDepth(
											Math.max(0, Math.min(10, Number(e.target.value) || 0)),
										)
									}
									style={{ width: 70, padding: 6 }}
								/>
							</label>

							{ft.subgraph && (
								<span style={{ opacity: 0.7 }}>
									nodes: {ft.subgraph.nodes.length}, edges:{" "}
									{ft.subgraph.edges.length}
								</span>
							)}
						</div>

						{ft.subgraph ? (
							<FamilyGraph
								data={ft.data}
								subgraph={ft.subgraph}
								selectedId={ft.selectedPersonId}
								onSelect={(id) => ft.setSelectedPersonId(id)}
							/>
						) : (
							<div style={{ opacity: 0.7 }}>中心人物を選択してください。</div>
						)}
					</>
				)}
			</section>

			<PeopleSection ft={ft} />

			<RelationshipSection ft={ft} />

			<section style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
				relationships: {Object.keys(ft.data.relationships).length}
			</section>
		</div>
	);
}
