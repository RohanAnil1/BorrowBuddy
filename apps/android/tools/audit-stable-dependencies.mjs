import { readFile, writeFile } from 'node:fs/promises';

const metadata = {
  agp: 'https://dl.google.com/dl/android/maven2/com/android/tools/build/gradle/maven-metadata.xml',
  compose: 'https://dl.google.com/dl/android/maven2/androidx/compose/compose-bom/maven-metadata.xml',
  kotlin: 'https://repo.maven.apache.org/maven2/org/jetbrains/kotlin/kotlin-gradle-plugin/maven-metadata.xml',
  activity: 'https://dl.google.com/dl/android/maven2/androidx/activity/activity/maven-metadata.xml',
  lifecycle: 'https://dl.google.com/dl/android/maven2/androidx/lifecycle/lifecycle-runtime-compose/maven-metadata.xml',
  navigation: 'https://dl.google.com/dl/android/maven2/androidx/navigation/navigation-compose/maven-metadata.xml',
  supabase: 'https://repo.maven.apache.org/maven2/io/github/jan-tennert/supabase/bom/maven-metadata.xml',
  ktor: 'https://repo.maven.apache.org/maven2/io/ktor/ktor-client-okhttp/maven-metadata.xml',
  coil: 'https://repo.maven.apache.org/maven2/io/coil-kt/coil3/coil-compose/maven-metadata.xml',
  filament: 'https://repo.maven.apache.org/maven2/com/google/android/filament/filament-android/maven-metadata.xml',
};
const catalog = await readFile(new URL('../gradle/libs.versions.toml', import.meta.url), 'utf8');
const results = await Promise.all(Object.entries(metadata).map(async ([library, source]) => {
  const pinned = catalog.match(new RegExp(`^${library}\\s*=\\s*"([^"]+)"`, 'm'))?.[1];
  try {
    if (!pinned) throw new Error('Version pin missing');
    const response = await fetch(source, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Metadata HTTP ${response.status}`);
    const xml = await response.text();
    const stable = [...xml.matchAll(/<version>(\d+\.\d+\.\d+)<\/version>/g)].map(match => match[1]);
    stable.sort((a, b) => {
      const aa = a.split('.').map(Number), bb = b.split('.').map(Number);
      for (let i = 0; i < 3; i++) if (aa[i] !== bb[i]) return aa[i] - bb[i];
      return 0;
    });
    if (!stable.length) throw new Error('No stable versions found');
    return { library, pinned, latestStable: stable.at(-1), matches: pinned === stable.at(-1), source };
  } catch (error) { return { library, pinned, source, error: error.message, matches: false }; }
}));
const report = { checkedAt: new Date().toISOString(), allMatch: results.every(row => row.matches), libraries: results };
await writeFile(new URL('../verification/stable-dependencies.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.allMatch) process.exitCode = 1;
