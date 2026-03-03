import type { FamilyTreeDataV1, Person, Relationship } from "./types";

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isString(v: unknown): v is string {
	return typeof v === "string";
}

function isNumber(v: unknown): v is number {
	return typeof v === "number" && !Number.isNaN(v);
}

function hasExactlyOnePrimaryName(p: Person): boolean {
	const count = p.names.filter((n) => n.primary).length;
	return count === 1;
}

export type ValidateResult =
	| { ok: true; data: FamilyTreeDataV1 }
	| { ok: false; error: string };

export function validateAndNormalizeImportedJson(raw: unknown): ValidateResult {
	if (!isObject(raw))
		return { ok: false, error: "JSONの最上位がオブジェクトではありません。" };

	if (raw.schemaVersion !== "1.0") {
		return { ok: false, error: "schemaVersion が 1.0 ではありません。" };
	}

	if (!isObject(raw.meta)) return { ok: false, error: "meta が不正です。" };
	if (!isString(raw.meta.title) || raw.meta.title.length === 0)
		return { ok: false, error: "meta.title が不正です。" };
	if (!isString(raw.meta.createdAt) || !isString(raw.meta.updatedAt))
		return { ok: false, error: "meta.createdAt/updatedAt が不正です。" };

	// people
	if (!isObject(raw.people)) return { ok: false, error: "people が不正です。" };

	// relationships: エクスポートは配列でも来る可能性があるので両対応
	const relsRaw = (raw as any).relationships;
	let relationships: Record<string, Relationship> = {};

	if (Array.isArray(relsRaw)) {
		for (const rel of relsRaw) {
			if (!isObject(rel) || !isString(rel.id) || !isString(rel.type)) {
				return { ok: false, error: "relationships(配列)の要素が不正です。" };
			}
			relationships[rel.id] = rel as Relationship;
		}
	} else if (isObject(relsRaw)) {
		relationships = relsRaw as Record<string, Relationship>;
	} else {
		return {
			ok: false,
			error: "relationships が配列でもオブジェクトでもありません。",
		};
	}

	// peopleの中身軽くチェック + keyとid一致
	const people: Record<string, Person> = raw.people as any;
	for (const [pid, p] of Object.entries(people)) {
		if (!isObject(p))
			return {
				ok: false,
				error: `people.${pid} がオブジェクトではありません。`,
			};
		if (!isString((p as any).id) || (p as any).id !== pid)
			return {
				ok: false,
				error: `peopleのキーとperson.idが一致しません: ${pid}`,
			};
		if (!Array.isArray((p as any).names) || (p as any).names.length < 1)
			return { ok: false, error: `names が空です: ${pid}` };

		// display必須 & primaryちょうど1つ
		for (const n of (p as any).names) {
			if (
				!isObject(n) ||
				!isString((n as any).display) ||
				(n as any).display.trim() === ""
			) {
				return { ok: false, error: `name.display が不正です: ${pid}` };
			}
		}
		if (!hasExactlyOnePrimaryName(p as any))
			return {
				ok: false,
				error: `primary がちょうど1つではありません: ${pid}`,
			};
	}

	// relationships参照整合性（人物が存在するか）
	for (const [rid, rel] of Object.entries(relationships)) {
		if (!rel || (rel as any).id !== rid)
			return {
				ok: false,
				error: `relationshipのキーとidが一致しません: ${rid}`,
			};
		if (rel.type === "couple") {
			if (!people[rel.a] || !people[rel.b])
				return { ok: false, error: `couple参照先が存在しません: ${rid}` };
			if (rel.a === rel.b)
				return { ok: false, error: `coupleのaとbが同一です: ${rid}` };
			if (!isNumber(rel.confidence) || rel.confidence < 0 || rel.confidence > 1)
				return { ok: false, error: `confidence不正: ${rid}` };
		} else if (rel.type === "parent-child") {
			if (!people[rel.parent] || !people[rel.child])
				return { ok: false, error: `parent-child参照先が存在しません: ${rid}` };
			if (rel.parent === rel.child)
				return { ok: false, error: `親子が同一人物です: ${rid}` };
			if (!isNumber(rel.confidence) || rel.confidence < 0 || rel.confidence > 1)
				return { ok: false, error: `confidence不正: ${rid}` };
		} else {
			return {
				ok: false,
				error: `未知のrelationship.typeです: ${(rel as any).type}`,
			};
		}
	}

	const data = raw as FamilyTreeDataV1;
	return { ok: true, data: { ...data, relationships } };
}
