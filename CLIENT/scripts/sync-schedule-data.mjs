import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseScheduleDateToEpoch(value) {
  const m = String(value).match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  if (!m) return Number.NEGATIVE_INFINITY;

  const day = Number.parseInt(m[1], 10);
  const month = Number.parseInt(m[2], 10);
  const year = 2000 + Number.parseInt(m[3], 10);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) {
    return Number.NEGATIVE_INFINITY;
  }

  const d = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(d.getTime()) ? Number.NEGATIVE_INFINITY : d.getTime();
}

function isScheduleDateDir(name) {
  return /^\d{2}\.\d{2}\.\d{2}$/.test(name);
}

function parseMaxDates() {
  const raw = process.env.SCHEDULE_MAX_DATES;
  if (!raw) return Number.POSITIVE_INFINITY;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return Number.POSITIVE_INFINITY;
  return n;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeEmptyManifest(targetRoot) {
  await ensureDir(targetRoot);
  await fs.writeFile(
    path.join(targetRoot, 'manifest.json'),
    `${JSON.stringify({ dates: [] }, null, 2)}\n`,
    'utf8',
  );
}

async function syncFolder(sourceRoot, targetRoot, maxDates) {
  await fs.rm(targetRoot, { recursive: true, force: true });

  let sourceEntries;
  try {
    sourceEntries = await fs.readdir(sourceRoot, { withFileTypes: true });
  } catch {
    await writeEmptyManifest(targetRoot);
    console.warn(`[schedule] Source folder not found: ${sourceRoot}. Empty manifest generated.`);
    return;
  }

  const allDateDirs = sourceEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => isScheduleDateDir(name))
    .sort((a, b) => parseScheduleDateToEpoch(b) - parseScheduleDateToEpoch(a));

  const selectedDateDirs = allDateDirs.slice(0, maxDates);
  const manifestDates = [];
  let copiedCsvCount = 0;

  for (const dateDir of selectedDateDirs) {
    const sourceDateDir = path.join(sourceRoot, dateDir);
    const targetDateDir = path.join(targetRoot, dateDir);

    let fileEntries;
    try {
      fileEntries = await fs.readdir(sourceDateDir, { withFileTypes: true });
    } catch {
      continue;
    }

    const csvNames = fileEntries
      .filter((entry) => entry.isFile() && /\.csv$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, 'ru-RU'));

    if (csvNames.length === 0) continue;

    await ensureDir(targetDateDir);
    const manifestFiles = [];

    for (const fileName of csvNames) {
      const srcFile = path.join(sourceDateDir, fileName);
      const dstFile = path.join(targetDateDir, fileName);
      await fs.copyFile(srcFile, dstFile);

      const stats = await fs.stat(srcFile);
      manifestFiles.push({
        name: fileName,
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      });
      copiedCsvCount += 1;
    }

    manifestDates.push({
      date: dateDir,
      files: manifestFiles,
    });
  }

  await ensureDir(targetRoot);
  await fs.writeFile(
    path.join(targetRoot, 'manifest.json'),
    `${JSON.stringify({ dates: manifestDates }, null, 2)}\n`,
    'utf8',
  );

  console.log(
    `[schedule] Copied ${copiedCsvCount} ready CSV file(s) from ${manifestDates.length} date folder(s) into ${targetRoot}`,
  );
}

async function syncScheduleData() {
  const clientRoot = path.resolve(__dirname, '..');
  const maxDates = parseMaxDates();

  const sourceGroups = path.resolve(clientRoot, '../SERVER/schedule_parser/parsed_schedule');
  const targetGroups = path.resolve(clientRoot, 'public/schedule');
  await syncFolder(sourceGroups, targetGroups, maxDates);

  const sourceTeachers = path.resolve(clientRoot, '../SERVER/schedule_parser/parsed_schedule_teacher');
  const targetTeachers = path.resolve(clientRoot, 'public/schedule_teacher');
  await syncFolder(sourceTeachers, targetTeachers, maxDates);
}

void syncScheduleData();
