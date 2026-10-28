export type HdiutilImage = {imagePath: string; mountPoints: string[]};

// Property reads on primitives and arrays are harmless, so only null and
// undefined need guarding.
const fields = (value: unknown): Record<string, unknown> =>
  (value ?? {}) as Record<string, unknown>;

const listOf = (value: unknown): unknown[] =>
  // Stryker disable next-line ArrayDeclaration: a placeholder string element has no image-path or mount-point, so it is skipped like an empty list
  Array.isArray(value) ? value : [];

const mountPointsOf = (entities: unknown): string[] =>
  listOf(entities).flatMap(entity => {
    const mountPoint = fields(entity)['mount-point'];
    return typeof mountPoint === 'string' ? [mountPoint] : [];
  });

// Reads `hdiutil info -plist | plutil -convert json` output; anything that
// does not look like it yields no images.
export const parseHdiutilInfo = (stdout: string): HdiutilImage[] => {
  try {
    return listOf(fields(JSON.parse(stdout))['images']).flatMap(image => {
      const imagePath = fields(image)['image-path'];
      return typeof imagePath === 'string'
        ? [
            {
              imagePath,
              mountPoints: mountPointsOf(fields(image)['system-entities']),
            },
          ]
        : [];
    });
  } catch {
    return [];
  }
};
