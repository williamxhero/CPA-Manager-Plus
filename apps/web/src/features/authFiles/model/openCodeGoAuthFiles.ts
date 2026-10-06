import type { AuthFileItem } from '@/types';
import {
  readAuthFileStatusAuthIndex,
  readAuthFileStatusPhysicalName,
  readAuthFileStatusProvider,
  readAuthFileStatusRuntimeId,
} from '@/utils/authFileStatusMutation';

export const OPENCODE_GO_CANONICAL_ID_PATTERN = /^opencode-go-key-[a-f0-9]{64}$/i;

const OPENCODE_GO_PROVIDER = 'opencode-go';

const isMeaningfulValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
};

const mergeAuthFileRows = (canonical: AuthFileItem, fallback: AuthFileItem): AuthFileItem => {
  const merged: AuthFileItem = { ...canonical };
  Object.entries(fallback).forEach(([key, value]) => {
    if (!isMeaningfulValue(merged[key]) && isMeaningfulValue(value)) {
      merged[key] = value;
    }
  });
  return merged;
};

const isFilenameIdFallback = (
  file: AuthFileItem,
  canonicalId: string,
  physicalName: string
): boolean => {
  const runtimeId = readAuthFileStatusRuntimeId(file);
  return (
    runtimeId.toLowerCase() === `${canonicalId}.json`.toLowerCase() && runtimeId === physicalName
  );
};

const collapseOpenCodeGoDuplicateGroup = (entries: AuthFileItem[]): AuthFileItem[] => {
  const canonicalIndex = entries.findIndex((entry) =>
    OPENCODE_GO_CANONICAL_ID_PATTERN.test(readAuthFileStatusRuntimeId(entry))
  );
  if (canonicalIndex < 0) return entries;

  const canonical = entries[canonicalIndex];
  const canonicalId = readAuthFileStatusRuntimeId(canonical);
  const physicalName = readAuthFileStatusPhysicalName(canonical);
  const fallbackIndexes = entries.reduce<number[]>((indexes, entry, index) => {
    if (index !== canonicalIndex && isFilenameIdFallback(entry, canonicalId, physicalName)) {
      indexes.push(index);
    }
    return indexes;
  }, []);
  if (fallbackIndexes.length === 0) return entries;

  const fallbackIndexSet = new Set(fallbackIndexes);
  const merged = fallbackIndexes.reduce(
    (current, index) => mergeAuthFileRows(current, entries[index]),
    canonical
  );

  return entries.flatMap((entry, index) => {
    if (index === canonicalIndex) return [merged];
    return fallbackIndexSet.has(index) ? [] : [entry];
  });
};

/**
 * Collapse the duplicate OpenCode Go representation emitted by some CPA builds.
 *
 * The source and runtime rows remain untouched for mutation lookups; only an
 * exact canonical-plugin-ID/filename-ID pair with one auth index is collapsed.
 */
export const collapseOpenCodeGoAuthFileDuplicates = (files: AuthFileItem[]): AuthFileItem[] => {
  const groups = new Map<string, AuthFileItem[]>();
  const keysByFile = new Map<AuthFileItem, string>();

  files.forEach((file) => {
    const physicalName = readAuthFileStatusPhysicalName(file);
    const provider = readAuthFileStatusProvider(file);
    const authIndex = readAuthFileStatusAuthIndex(file);
    if (!physicalName || provider !== OPENCODE_GO_PROVIDER || authIndex === null) return;

    const key = `${physicalName}\u0000${provider}\u0000${authIndex}`;
    keysByFile.set(file, key);
    const group = groups.get(key);
    if (group) {
      group.push(file);
    } else {
      groups.set(key, [file]);
    }
  });

  if (groups.size === 0) return files;

  const emittedKeys = new Set<string>();
  return files.flatMap((file) => {
    const key = keysByFile.get(file);
    if (!key) return [file];
    if (emittedKeys.has(key)) return [];
    emittedKeys.add(key);
    return collapseOpenCodeGoDuplicateGroup(groups.get(key) ?? [file]);
  });
};
