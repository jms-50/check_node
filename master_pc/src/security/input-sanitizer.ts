import { BadRequestException } from '@nestjs/common';

const MAX_POLICY_ITEMS = 256;
const MAX_HOST_LENGTH = 253;
const MAX_PROCESS_LENGTH = 128;
const MAX_EVENT_TARGET_LENGTH = 255;
const MAX_EVENT_TYPE_LENGTH = 64;
const MAX_SLAVE_ID_LENGTH = 128;
const MAX_METADATA_LENGTH = 255;

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const CONTROL_CHARACTERS_GLOBAL = /[\u0000-\u001f\u007f]/g;
const HOST_PATTERN =
  /^(?=.{1,253}$)(localhost|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?|\d{1,3}(?:\.\d{1,3}){3})$/;
const PROCESS_PATTERN = /^[^<>:"/\\|?*\u0000-\u001f\u007f]{1,128}$/;
const EVENT_TYPE_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;
const SLAVE_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;

const PROTECTED_PROCESSES = new Set([
  'system',
  'system idle process',
  'smss.exe',
  'csrss.exe',
  'wininit.exe',
  'winlogon.exe',
  'services.exe',
  'lsass.exe',
  'explorer.exe',
]);

export function normalizeBlockedHosts(value: unknown): string[] {
  const items = ensureArray(value, 'blocked_urls');
  return uniqueNormalized(items.map(normalizeHost));
}

export function normalizeBlockedProcesses(value: unknown): string[] {
  const items = ensureArray(value, 'blocked_processes');
  return uniqueNormalized(items.map(normalizeProcess));
}

export function normalizeSlaveId(value: unknown, field = 'slave_id'): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} must be a string`);
  }

  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > MAX_SLAVE_ID_LENGTH ||
    !SLAVE_ID_PATTERN.test(normalized)
  ) {
    throw new BadRequestException(`${field} is invalid`);
  }

  return normalized;
}

export function normalizeMetadata(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.replace(CONTROL_CHARACTERS_GLOBAL, '').trim();
  return normalized ? normalized.slice(0, MAX_METADATA_LENGTH) : undefined;
}

export function normalizeEventTarget(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('target must be a string');
  }

  const normalized = collapseWhitespace(value).slice(0, MAX_EVENT_TARGET_LENGTH);
  if (!normalized) {
    throw new BadRequestException('target is required');
  }

  return normalized;
}

export function normalizeEventType(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('type must be a string');
  }

  const normalized = value.trim().toUpperCase();
  if (
    !normalized ||
    normalized.length > MAX_EVENT_TYPE_LENGTH ||
    !EVENT_TYPE_PATTERN.test(normalized)
  ) {
    throw new BadRequestException('type is invalid');
  }

  return normalized;
}

export function normalizeEventTimestamp(value: unknown): number {
  const timestamp = Number(value);
  const now = Math.floor(Date.now() / 1000);
  const maxFutureSkewSeconds = 60 * 60;

  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp <= 0 ||
    timestamp > now + maxFutureSkewSeconds
  ) {
    return now;
  }

  return timestamp;
}

function ensureArray(value: unknown, field: string): unknown[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new BadRequestException(`${field} must be an array`);
  }

  if (value.length > MAX_POLICY_ITEMS) {
    throw new BadRequestException(`${field} exceeds maximum size`);
  }

  return value;
}

function normalizeHost(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('blocked_urls must contain only strings');
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed.length > MAX_HOST_LENGTH || CONTROL_CHARACTERS.test(trimmed)) {
    throw new BadRequestException('blocked_urls contains an invalid host');
  }

  const host = extractHost(trimmed);
  if (!HOST_PATTERN.test(host)) {
    throw new BadRequestException(`blocked_urls contains an invalid host: ${trimmed}`);
  }

  return host;
}

function extractHost(value: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    try {
      return new URL(value).hostname;
    } catch {
      throw new BadRequestException(`blocked_urls contains an invalid URL: ${value}`);
    }
  }

  return value.split(/[/?#:]/, 1)[0];
}

function normalizeProcess(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('blocked_processes must contain only strings');
  }

  const normalized = value.trim();
  const lookupKey = normalized.toLowerCase();
  if (
    !normalized ||
    normalized.length > MAX_PROCESS_LENGTH ||
    !PROCESS_PATTERN.test(normalized) ||
    PROTECTED_PROCESSES.has(lookupKey)
  ) {
    throw new BadRequestException(
      `blocked_processes contains an invalid or protected process: ${normalized}`,
    );
  }

  return normalized;
}

function uniqueNormalized(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }

  return result;
}

function collapseWhitespace(value: string): string {
  return value.replace(CONTROL_CHARACTERS_GLOBAL, ' ').replace(/\s+/g, ' ').trim();
}
