import { openDB } from "idb";
import type { FamilyTreeDataV1 } from "../domain/types";

const DB_NAME = "family-tree-db";
const DB_VERSION = 1;

const STORE = "kv";
const KEY_CURRENT = "current";

async function getDb() {
	return openDB(DB_NAME, DB_VERSION, {
		upgrade(db) {
			if (!db.objectStoreNames.contains(STORE)) {
				db.createObjectStore(STORE);
			}
		},
	});
}

export async function loadCurrent(): Promise<FamilyTreeDataV1 | null> {
	const db = await getDb();
	return (await db.get(STORE, KEY_CURRENT)) ?? null;
}

export async function saveCurrent(data: FamilyTreeDataV1): Promise<void> {
	const db = await getDb();
	await db.put(STORE, data, KEY_CURRENT);
}

export async function clearAll(): Promise<void> {
	const db = await getDb();
	await db.clear(STORE);
}
