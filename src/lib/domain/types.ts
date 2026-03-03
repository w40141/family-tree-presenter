export type UUID = string;

export type Sex = "male" | "female" | "unknown";
export type DatePrecision = "year" | "month" | "day" | "unknown";

export type DateObj = {
	value: string; // "", "YYYY", "YYYY-MM", "YYYY-MM-DD"
	precision: DatePrecision;
};

export type EventLite = {
	date: DateObj;
	place: string | null;
	note: string | null;
};

export type NamePartType =
	| "given"
	| "family"
	| "middle"
	| "prefix"
	| "suffix"
	| "other";
export type NamePart = { type: NamePartType; value: string };

export type NamePeriod = {
	start: DateObj | null;
	end: DateObj | null;
};

export type PersonNameType =
	| "birth"
	| "married"
	| "alias"
	| "legal"
	| "unknown";

export type PersonName = {
	id: UUID;
	type: PersonNameType;
	display: string; // displayのみ必須
	parts: NamePart[]; // 最初は空配列でOK
	period: NamePeriod;
	primary: boolean;
	note: string | null;
};

export type Vital = {
	birth: EventLite | null;
	death: EventLite | null;
};

export type Person = {
	id: UUID;
	names: PersonName[]; // 1件以上 + primaryは1つ
	sex: Sex;
	vital: Vital;
	honseki: string | null;
	notes: string;
};

export type RelationshipParentChild = {
	id: UUID;
	type: "parent-child";
	parent: UUID;
	child: UUID;
	kind: "biological" | "adoptive" | "step" | "unknown";
	start: EventLite | null;
	end: EventLite | null;
	note: string;
	confidence: number; // 0..1
};

export type RelationshipCouple = {
	id: UUID;
	type: "couple";
	a: UUID;
	b: UUID;
	status: "married" | "divorced" | "partner" | "unknown";
	start: EventLite | null;
	end: EventLite | null;
	note: string;
	confidence: number; // 0..1
};

export type Relationship = RelationshipParentChild | RelationshipCouple;

export type Meta = {
	title: string;
	createdAt: string; // ISO date-time
	updatedAt: string; // ISO date-time
	exportedAt?: string | null;
	app?: { name: string; version: string } | null;
};

export type FamilyTreeDataV1 = {
	schemaVersion: "1.0";
	meta: Meta;
	people: Record<UUID, Person>;
	relationships: Record<UUID, Relationship>; // 内部はMap形式
};

// UI表示用：一覧に出す名前
export function getPrimaryDisplayName(p: Person): string {
	const primary = p.names.find((n) => n.primary);
	return primary?.display ?? p.names[0]?.display ?? "(no name)";
}
