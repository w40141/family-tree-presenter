import type { UUID } from "../../lib/domain/types";
import { getPrimaryDisplayName } from "../../lib/domain/types";

type Props = { ft: any }; // TS不慣れ用：まず動かす。後で型を付ける

export function PeopleSection({ ft }: Props) {
  const peopleList = ft.peopleList as any[];

  return (
    <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 12 }}>
      <h2 style={{ marginTop: 0 }}>人物</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          value={ft.newPersonName}
          onChange={(e) => ft.setNewPersonName(e.target.value)}
          placeholder="display（必須）例：山田 太郎"
          style={{ flex: 1, padding: 8 }}
        />
        <button onClick={ft.addPerson}>追加</button>
      </div>

      <h3 style={{ margin: "8px 0" }}>人物一覧（{peopleList.length}）</h3>

      {peopleList.length === 0 ? (
        <div style={{ opacity: 0.7 }}>まだ人物がいません。</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {peopleList.map((p: any) => {
            const current = getPrimaryDisplayName(p);
            const relCount = (ft.relationshipCountByPerson[p.id] ?? 0) as number;

            return (
              <div key={p.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <b>{current}</b>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ opacity: 0.7 }}>関係: {relCount}</span>
                    <button onClick={() => ft.deletePerson(p.id as UUID)}>削除</button>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input
                    value={ft.editNameById[p.id] ?? current}
                    onChange={(e) => ft.setEditNameById({ ...ft.editNameById, [p.id]: e.target.value })}
                    style={{ flex: 1, padding: 8 }}
                  />
                  <button onClick={() => ft.updatePrimaryDisplay(p.id as UUID)}>名前更新</button>
                </div>

                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>id: {p.id}</div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
