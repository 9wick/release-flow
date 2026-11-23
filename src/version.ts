export type Version = {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
};

const releaseVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export const parseVersion = (text: string): Version | undefined => {
  const match = releaseVersion.exec(text);
  if (!match) return undefined;
  const [, major, minor, patch] = match.map(Number);
  return { major: major!, minor: minor!, patch: patch! };
};

export const formatVersion = (version: Version): string =>
  `${version.major}.${version.minor}.${version.patch}`;

export const compareVersions = (a: Version, b: Version): number =>
  a.major - b.major || a.minor - b.minor || a.patch - b.patch;

export const nextPatch = (latest: Version | undefined): Version =>
  latest ? { ...latest, patch: latest.patch + 1 } : { major: 0, minor: 0, patch: 1 };

// Prerelease-suffixed tags such as v1.2.0-stg.x are previews, not releases.
export const latestVersion = (tags: readonly string[], prefix: string): Version | undefined =>
  tags
    .filter((tag) => tag.startsWith(prefix))
    .map((tag) => parseVersion(tag.slice(prefix.length)))
    .filter((version) => version !== undefined)
    .reduce<Version | undefined>(
      (max, version) => (max && compareVersions(max, version) >= 0 ? max : version),
      undefined,
    );

const timestamp = (now: Date): string => now.toISOString().replace(/\D/g, "").slice(0, 14);

// Sorts above the latest release and below the next one, so previews never outrank a release.
export const previewVersion = (latest: Version | undefined, environment: string, now: Date): string =>
  `${formatVersion(nextPatch(latest))}-${environment}.${timestamp(now)}`;
