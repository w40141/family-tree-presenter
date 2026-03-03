import { getPrimaryDisplayName } from "../../lib/domain/types";

type Props = { ft: any };

export function RelationshipSection({ ft }: Props) {
  const peopleList = ft.peopleList as any[];
  const relationshipList = ft.relationshipList as any[];

  return (
    <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 12 }}>
      <h2 style={{ marginTop: 0 }}>関係</h2>

      {/* couple追加 */}
      <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 10, marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>カップル関係を追加</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={ft.coupleA} onChange={(e) => ft.setCoupleA(e.target.value)} style={{ padding: 6 }}>
            <option value="">人物Aを選択</option>
            {peopleList.map((p: any) => (
              <option key={p.id} value={p.id}>
                {getPrimaryDisplayName(p)}
              </option>
            ))}
          </select>

          <select value={ft.coupleB} onChange={(e) => ft.setCoupleB(e.target.value)} style={{ padding: 6 }}>
            <option value="">人物Bを選択</option>
            {peopleList.map((p: any) => (
              <option key={p.id} value={p.id}>
                {getPrimaryDisplayName(p)}
              </option>
            ))}
          </select>

          <button onClick={ft.addCouple}>追加</button>
          <span style={{ opacity: 0.7 }}>※再婚OK</span>
        </div>
      </div>

      {/* parent-child追加 */}
      <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 10, marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>親子関係を追加</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={ft.pcParent} onChange={(e) => ft.setPcParent(e.target.value)} style={{ padding: 6 }}>
            <option value="">親（parent）を選択</option>
            {peopleList.map((p: any) => (
              <option key={p.id} value={p.id}>
                {getPrimaryDisplayName(p)}
              </option>
            ))}
          </select>

          <select value={ft.pcChild} onChange={(e) => ft.setPcChild(e.target.value)} style={{ padding: 6 }}>
            <option value="">子（child）を選択</option>
            {peopleList.map((p: any) => (
              <option key={p.id} value={p.id}>
                {getPrimaryDisplayName(p)}
              </option>
            ))}
          </select>

          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            kind
            <select value={ft.pcKind} onChange={(e) => ft.setPcKind(e.target.value)} style={{ padding: 6 }}>
              <option value="biological">biological（実親）</option>
              <option value="adoptive">adoptive（養親）</option>
              <option value="step">step（継親）</option>
              <option value="unknown">unknown</option>
            </select>
          </label>

          <button onClick={ft.addParentChild}>追加</button>
          <span style={{ opacity: 0.7 }}>※未確定参照なし</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          value={ft.relationshipSearch}
          onChange={(e) => ft.setRelationshipSearch(e.target.value)}
          placeholder="名前で検索（部分一致）"
          style={{ flex: 1, padding: 8 }}
        />

        <select
          value={ft.relationshipTypeFilter}
          onChange={(e) => ft.setRelationshipTypeFilter(e.target.value)}
          style={{ padding: 6 }}
        >
          <option value="all">all</option>
          <option value="couple">couple</option>
          <option value="parent-child">parent-child</option>
        </select>
      </div>

      {/* relationships一覧 */}
      <h3 style={{ margin: "8px 0" }}>relationships一覧（{relationshipList.length}）</h3>

      {relationshipList.length === 0 ? (
        <div style={{ opacity: 0.7 }}>まだ関係がありません。</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {relationshipList.map((rel: any) => (
            <div key={rel.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <div>
                  <b>{rel.type}</b>
                  <div style={{ opacity: 0.8, marginTop: 4 }}>
                    {rel.type === "couple"
                      ? `${ft.safePersonName(ft.data, rel.a)} × ${ft.safePersonName(ft.data, rel.b)}`
                      : `${ft.safePersonName(ft.data, rel.parent)} → ${ft.safePersonName(ft.data, rel.child)}`}
                  </div>
                </div>
                <button onClick={() => ft.deleteRelationship(rel.id)}>削除</button>
              </div>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
                {rel.type === "couple" ? (
                  <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    status
                    <select
                      value={rel.status}
                      onChange={(e) => ft.updateRelationship(rel.id, { status: e.target.value })}
                      style={{ padding: 6 }}
                    >
                      <option value="unknown">unknown</option>
                      <option value="married">married</option>
                      <option value="divorced">divorced</option>
                      <option value="partner">partner</option>
                    </select>
                  </label>
                ) : (
                  <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    kind
                    <select
                      value={rel.kind}
                      onChange={(e) => ft.updateRelationship(rel.id, { kind: e.target.value })}
                      style={{ padding: 6 }}
                    >
                      <option value="unknown">unknown</option>
                      <option value="biological">biological</option>
                      <option value="adoptive">adoptive</option>
                      <option value="step">step</option>
                    </select>
                  </label>
                )}

                <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  confidence
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.1}
                    value={rel.confidence}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isNaN(v)) return;
                      ft.updateRelationship(rel.id, { confidence: Math.max(0, Math.min(1, v)) });
                    }}
                    style={{ width: 80, padding: 6 }}
                  />
                </label>
              </div>

              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>id: {rel.id}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
